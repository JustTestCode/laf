import { Injectable, Logger } from '@nestjs/common'
import { RuntimeDomain, DomainPhase, DomainState } from '@prisma/client'
import { RegionService } from '../region/region.service'
import { ApisixService } from './apisix.service'
import * as assert from 'node:assert'
import { Cron, CronExpression } from '@nestjs/schedule'
import { ServerConfig, TASK_LOCK_INIT_TIME } from '../constants'
import { SystemDatabase } from '../database/system-database'

@Injectable()
export class RuntimeDomainTaskService {
  readonly lockTimeout = 30 // in second
  private readonly logger = new Logger(RuntimeDomainTaskService.name)

  constructor(
    private readonly apisixService: ApisixService,
    private readonly regionService: RegionService,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async tick() {
    if (ServerConfig.DISABLED_GATEWAY_TASK) {
      return
    }

    // Phase `Creating` -> `Created`
    this.handleCreatingPhase()

    // Phase `Deleting` -> `Deleted`
    this.handleDeletingPhase()

    // Phase `Created` -> `Deleting`
    this.handleInactiveState()

    // Phase `Deleted` -> `Creating`
    this.handleActiveState()

    // Phase `Deleting` -> `Deleted`
    this.handleDeletedState()

    // Clear timeout locks
    this.clearTimeoutLocks()
  }

  /**
   * Phase `Creating`:
   * - create route
   * - move phase `Creating` to `Created`
   */
  async handleCreatingPhase() {
    const db = SystemDatabase.db

    const res = await db
      .collection<RuntimeDomain>('RuntimeDomain')
      .findOneAndUpdate(
        {
          phase: DomainPhase.Creating,
          lockedAt: {
            $lt: new Date(Date.now() - 1000 * this.lockTimeout),
          },
        },
        {
          $set: {
            lockedAt: new Date(),
          },
        },
      )

    if (!res.value) return

    // get region by appid
    const doc = res.value
    this.logger.log('handleCreatingPhase matched function domain ' + doc.appid)

    const region = await this.regionService.findByAppId(doc.appid)
    assert(region, 'region not found')

    // create route first
    const route = await this.apisixService.createAppRoute(
      region,
      doc.appid,
      doc.domain,
    )

    this.logger.debug('app route created:', route)

    // update phase to `Created`
    const updated = await db
      .collection<RuntimeDomain>('RuntimeDomain')
      .updateOne(
        {
          _id: doc._id,
          phase: DomainPhase.Creating,
        },
        {
          $set: {
            phase: DomainPhase.Created,
            lockedAt: TASK_LOCK_INIT_TIME,
          },
        },
      )

    if (updated.modifiedCount > 0)
      this.logger.debug('app domain phase updated to Created ' + doc.domain)
  }

  /**
   * Phase `Deleting`:
   * - delete route
   * - move phase `Deleting` to `Deleted`
   */
  async handleDeletingPhase() {
    const db = SystemDatabase.db

    const res = await db
      .collection<RuntimeDomain>('RuntimeDomain')
      .findOneAndUpdate(
        {
          phase: DomainPhase.Deleting,
          lockedAt: {
            $lt: new Date(Date.now() - 1000 * this.lockTimeout),
          },
        },
        {
          $set: {
            lockedAt: new Date(),
          },
        },
      )
    if (!res.value) return

    // get region by appid
    const doc = res.value
    const region = await this.regionService.findByAppId(doc.appid)
    assert(region, 'region not found')

    // delete route first
    const route = await this.apisixService.deleteAppRoute(region, doc.appid)
    this.logger.debug('app route deleted:', route)

    // update phase to `Deleted`
    const updated = await db
      .collection<RuntimeDomain>('RuntimeDomain')
      .updateOne(
        {
          _id: doc._id,
          phase: DomainPhase.Deleting,
        },
        {
          $set: {
            phase: DomainPhase.Deleted,
            lockedAt: TASK_LOCK_INIT_TIME,
          },
        },
      )

    if (updated.modifiedCount > 0)
      this.logger.debug('app domain phase updated to Deleted', doc)
  }

  /**
   * State `Active`:
   * - move phase `Deleted` to `Creating`
   */
  async handleActiveState() {
    const db = SystemDatabase.db

    await db.collection<RuntimeDomain>('RuntimeDomain').updateMany(
      {
        state: DomainState.Active,
        phase: DomainPhase.Deleted,
      },
      {
        $set: {
          phase: DomainPhase.Creating,
          lockedAt: TASK_LOCK_INIT_TIME,
        },
      },
    )
  }

  /**
   * State `Inactive`:
   * - move `Created` to `Deleting`
   */
  async handleInactiveState() {
    const db = SystemDatabase.db

    await db.collection<RuntimeDomain>('RuntimeDomain').updateMany(
      {
        state: DomainState.Inactive,
        phase: DomainPhase.Created,
      },
      {
        $set: {
          phase: DomainPhase.Deleting,
          lockedAt: TASK_LOCK_INIT_TIME,
        },
      },
    )
  }

  /**
   * State `Deleted`:
   * - move `Created` to `Deleting`
   * - delete `Deleted` documents
   */
  async handleDeletedState() {
    const db = SystemDatabase.db

    await db.collection<RuntimeDomain>('RuntimeDomain').updateMany(
      {
        state: DomainState.Deleted,
        phase: DomainPhase.Created,
      },
      {
        $set: {
          phase: DomainPhase.Deleting,
          lockedAt: TASK_LOCK_INIT_TIME,
        },
      },
    )

    await db.collection<RuntimeDomain>('RuntimeDomain').deleteMany({
      state: DomainState.Deleted,
      phase: DomainPhase.Deleted,
    })
  }

  /**
   * Clear timeout locks
   */
  async clearTimeoutLocks() {
    const db = SystemDatabase.db

    await db.collection<RuntimeDomain>('RuntimeDomain').updateMany(
      {
        lockedAt: {
          $lt: new Date(Date.now() - 1000 * this.lockTimeout),
        },
      },
      {
        $set: {
          lockedAt: TASK_LOCK_INIT_TIME,
        },
      },
    )
  }
}
