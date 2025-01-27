/****************************
 * cloud functions list sidebar
 ***************************/

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AddIcon, DeleteIcon, EditIcon, Search2Icon } from "@chakra-ui/icons";
import { HStack, Input, InputGroup, InputLeftElement, useColorMode } from "@chakra-ui/react";
import { clsx } from "clsx";
import { t } from "i18next";

import { TriggerIcon } from "@/components/CommonIcon";
import ConfirmButton from "@/components/ConfirmButton";
import EmptyBox from "@/components/EmptyBox";
import FileTypeIcon, { FileType } from "@/components/FileTypeIcon";
import IconText from "@/components/IconText";
import IconWrap from "@/components/IconWrap";
import MoreButton from "@/components/MoreButton";
import Panel from "@/components/Panel";
import SectionList from "@/components/SectionList";
import { Pages } from "@/constants";

import { useDeleteFunctionMutation, useFunctionListQuery } from "../../service";
import useFunctionStore from "../../store";
import TriggerModal from "../TriggerModal";

import CreateModal from "./CreateModal";

import { TFunction } from "@/apis/typing";
import useFunctionCache from "@/hooks/useFunctionCache";
import useGlobalStore from "@/pages/globalStore";

type TagItem = {
  tagName: string;
  selected: boolean;
};

export default function FunctionList() {
  const { setCurrentFunction, currentFunction, setAllFunctionList, allFunctionList } =
    useFunctionStore((store) => store);

  const functionCache = useFunctionCache();

  const [keywords, setKeywords] = useState("");

  const { colorMode } = useColorMode();
  const darkMode = colorMode === "dark";

  const { currentApp } = useGlobalStore();

  const { id: functionName } = useParams();
  const navigate = useNavigate();
  const [tagsList, setTagsList] = useState<TagItem[]>([]);

  const [currentTag, setCurrentTag] = useState<TagItem | null>(null);

  useFunctionListQuery({
    onSuccess: (data) => {
      setAllFunctionList(data.data);
      const tags = data.data.reduce((pre: any, item: any) => {
        return pre.concat(item.tags);
      }, []);
      let newTags: TagItem[] = Array.from(new Set(tags)).map((tagName: any) => {
        const oldTag = tagsList.filter((tag) => tag.tagName === tagName);
        return oldTag.length > 0
          ? oldTag[0]
          : {
              tagName: tagName,
              selected: false,
            };
      });
      setTagsList(newTags);

      if (!currentFunction?.id && data.data.length > 0) {
        const currentFunction =
          data.data.find((item: TFunction) => item.name === functionName) || data.data[0];
        setCurrentFunction(currentFunction);
        navigate(`/app/${currentApp?.appid}/${Pages.function}/${currentFunction?.name}`, {
          replace: true,
        });
      }
    },
  });

  useEffect(() => {
    return () => {
      // clear current function
      setCurrentFunction({});
    };
  }, [setCurrentFunction]);

  const deleteFunctionMutation = useDeleteFunctionMutation();

  const renderSelectedTags = () => {
    return tagsList.length > 0 ? (
      <div className="w-full mt-2 mb-2 pb-1 flex flex-wrap justify-start border-b items-center min-w-[200px]">
        <p className={clsx("mr-2 mb-1", darkMode ? "text-white-500" : "text-grayModern-500")}>
          {t("FunctionPanel.Tags")}
        </p>
        {tagsList.map((item) => (
          <span
            className={clsx(
              "cursor-pointer px-2 mb-1 rounded mr-1",
              darkMode ? "bg-gray-700" : "bg-gray-100",
              {
                "!bg-primary-400 text-white": item.tagName === currentTag?.tagName,
              },
            )}
            key={item.tagName}
            onClick={() => setCurrentTag(currentTag?.tagName === item.tagName ? null : item)}
          >
            {item.tagName}
          </span>
        ))}
      </div>
    ) : null;
  };

  return (
    <Panel className="flex-grow overflow-hidden min-w-[250px]">
      <Panel.Header
        title={t`FunctionPanel.FunctionList`}
        actions={[
          <TriggerModal key="trigger_modal">
            <IconWrap size={20} tooltip={t("TriggerPanel.Trigger").toString()}>
              <TriggerIcon fontSize={13} />
            </IconWrap>
          </TriggerModal>,
          <CreateModal key="create_modal">
            <IconWrap size={20} tooltip={t("FunctionPanel.AddFunction").toString()}>
              <AddIcon fontSize={12} />
            </IconWrap>
          </CreateModal>,
        ]}
      />

      <InputGroup className="mb-2">
        <InputLeftElement
          height={"8"}
          pointerEvents="none"
          children={<Search2Icon color="gray.300" fontSize={12} />}
        />
        <Input
          size="sm"
          rounded={"full"}
          placeholder={String(t("FunctionPanel.SearchPlaceholder"))}
          onChange={(e) => {
            setKeywords(e.target.value);
          }}
        />
      </InputGroup>

      {renderSelectedTags()}

      <div className="flex-grow" style={{ overflowY: "auto" }}>
        {allFunctionList?.length ? (
          <SectionList>
            {allFunctionList
              .filter((item: TFunction) => {
                let flag = item?.name.includes(keywords);
                if (tagsList.length > 0 && currentTag) {
                  flag = flag && item.tags.includes(currentTag?.tagName);
                }
                return flag;
              })
              .map((func: any) => {
                return (
                  <SectionList.Item
                    isActive={func?.name === currentFunction?.name}
                    key={func?.name || ""}
                    className="group"
                    onClick={() => {
                      setCurrentFunction(func);
                      navigate(`/app/${currentApp?.appid}/${Pages.function}/${func?.name}`);
                    }}
                  >
                    <div className="leading-loose font-semibold">
                      <FileTypeIcon type={FileType.ts} />
                      <span className="ml-2 text-base">{func?.name}</span>
                    </div>
                    <HStack spacing={1}>
                      {functionCache.getCache(func?.id, func?.source?.code) !==
                        func?.source?.code && (
                        <span className="flex-none inline-block w-1 h-1 rounded-full bg-warn-700"></span>
                      )}
                      <MoreButton
                        isHidden={func.name !== currentFunction?.name}
                        label={t("Operation")}
                      >
                        <>
                          <CreateModal functionItem={func}>
                            <IconText icon={<EditIcon />} text={t("Edit")} />
                          </CreateModal>
                          <ConfirmButton
                            onSuccessAction={async () => {
                              await deleteFunctionMutation.mutateAsync(func);
                            }}
                            headerText={String(t("Delete"))}
                            bodyText={String(t("FunctionPanel.DeleteConfirm"))}
                          >
                            <IconText icon={<DeleteIcon />} text={t("Delete")} />
                          </ConfirmButton>
                        </>
                      </MoreButton>
                    </HStack>
                  </SectionList.Item>
                );
              })}
          </SectionList>
        ) : (
          <EmptyBox hideIcon>
            <p>{t("FunctionPanel.EmptyFunctionTip")}</p>
          </EmptyBox>
        )}
      </div>
    </Panel>
  );
}
