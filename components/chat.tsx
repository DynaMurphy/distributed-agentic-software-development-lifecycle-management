"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ChatHeader } from "@/components/chat-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Vote } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { Artifact } from "./artifact";
import { useDataStream } from "./data-stream-provider";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { RightChatPanel } from "./right-chat-panel";
import { getChatHistoryPaginationKey } from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

export type SwitchChatFn = (chatId: string | null, query?: string) => Promise<void>;

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
}) {
  const [activeChatId, setActiveChatId] = useState(id);
  const [activeMessages, setActiveMessages] = useState(initialMessages);
  const [activeVisibility, setActiveVisibility] = useState(initialVisibilityType);
  const [activeReadonly, setActiveReadonly] = useState(isReadonly);
  const [activeAutoResume, setActiveAutoResume] = useState(autoResume);
  const [activeQuery, setActiveQuery] = useState<string | undefined>(undefined);
  const [isSwitching, setIsSwitching] = useState(false);

  const switchChat: SwitchChatFn = useCallback(async (chatId: string | null, query?: string) => {
    setIsSwitching(true);

    if (chatId) {
      try {
        const res = await fetch(`/api/messages?chatId=${encodeURIComponent(chatId)}`);
        if (!res.ok) throw new Error("Failed to load chat");
        const data = await res.json();
        setActiveMessages(data.messages);
        setActiveVisibility(data.visibility);
        setActiveReadonly(data.isReadonly);
        setActiveAutoResume(false);
        setActiveQuery(undefined);
        setActiveChatId(chatId);
        window.history.pushState({}, "", `/chat/${chatId}`);
      } catch {
        toast({ type: "error", description: "Failed to load chat" });
        setIsSwitching(false);
        return;
      }
    } else {
      const newId = generateUUID();
      setActiveMessages([]);
      setActiveVisibility("private");
      setActiveReadonly(false);
      setActiveAutoResume(false);
      setActiveQuery(query || undefined);
      setActiveChatId(newId);
      window.history.pushState({}, "", "/");
    }

    requestAnimationFrame(() => setIsSwitching(false));
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/chat\/(.+)$/);
      if (match) {
        switchChat(match[1]);
      } else {
        switchChat(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [switchChat]);

  return (
    <div className="h-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeChatId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="h-full"
        >
          <ChatInner
            id={activeChatId}
            initialMessages={activeMessages}
            initialChatModel={initialChatModel}
            initialVisibilityType={activeVisibility}
            isReadonly={activeReadonly}
            autoResume={activeAutoResume}
            initialQuery={activeQuery}
            switchChat={switchChat}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ChatInner({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
  initialQuery,
  switchChat,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
  initialQuery?: string;
  switchChat: SwitchChatFn;
}) {
  const router = useRouter();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();

  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>("");
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const currentModelIdRef = useRef(currentModelId);

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  const isCopilotModel = currentModelId.startsWith("copilot/");

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    generateId: generateUUID,
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const lastMessage = currentMessages.at(-1);
      const shouldContinue =
        lastMessage?.parts?.some(
          (part) =>
            "state" in part &&
            part.state === "approval-responded" &&
            "approval" in part &&
            (part.approval as { approved?: boolean })?.approved === true
        ) ?? false;
      return shouldContinue;
    },
    transport: new DefaultChatTransport({
      api: isCopilotModel ? "/api/copilot-chat" : "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const lastMessage = request.messages.at(-1);
        const isToolApprovalContinuation =
          lastMessage?.role !== "user" ||
          request.messages.some((msg) =>
            msg.parts?.some((part) => {
              const state = (part as { state?: string }).state;
              return (
                state === "approval-responded" || state === "output-denied"
              );
            })
          );

        return {
          body: {
            id: request.id,
            ...(isToolApprovalContinuation
              ? { messages: request.messages }
              : { message: lastMessage }),
            selectedChatModel: currentModelIdRef.current,
            selectedVisibilityType: visibilityType,
            ...request.body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        if (
          error.message?.includes("AI Gateway requires a valid credit card")
        ) {
          setShowCreditCardAlert(true);
        } else {
          toast({
            type: "error",
            description: error.message,
          });
        }
      }
    },
  });

  // When the chat id changes (client-side switch), populate the new chat's
  // message store and reset transient state so the component reflects the
  // newly-selected conversation without remounting.
  const prevIdRef = useRef(id);
  useEffect(() => {
    if (prevIdRef.current !== id) {
      setMessages(initialMessages);
      setInput("");
      setAttachments([]);
      setHasAppendedQuery(false);
      prevIdRef.current = id;
    }
  }, [id, initialMessages, setMessages]);

  const searchParams = useSearchParams();
  const query = initialQuery || searchParams.get("query");

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const isMobile = useIsMobile();

  const [rightPanelWidth, setRightPanelWidth] = useState(360);

  useEffect(() => {
    const saved = sessionStorage.getItem("right-panel-width");
    if (saved) {
      const parsed = Number.parseInt(saved, 10);
      if (!Number.isNaN(parsed) && parsed > 0) setRightPanelWidth(parsed);
    }
  }, []);

  const handleRightPanelWidthChange = useCallback((width: number) => {
    setRightPanelWidth(width);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("right-panel-width", String(width));
    }
  }, []);

  useAutoResume({
    autoResume: autoResume && !isCopilotModel,
    initialMessages,
    resumeStream,
    setMessages,
  });

  return (
    <>
      <div className="flex h-dvh min-w-0 flex-row overflow-hidden">
        {!isMobile ? (
          <>
            <Artifact
              chatId={id}
              isReadonly={isReadonly}
              messages={messages}
              sendMessage={sendMessage}
              setMessages={setMessages}
              status={status}
              stop={stop}
            />

            <RightChatPanel
              addToolApprovalResponse={addToolApprovalResponse}
              artifactStatus="idle"
              attachments={attachments}
              chatId={id}
              fullWidth={!isArtifactVisible}
              input={input}
              isCurrentVersion={true}
              isReadonly={isReadonly}
              messages={messages}
              onPanelWidthChange={handleRightPanelWidthChange}
              onSwitchChat={switchChat}
              panelWidth={rightPanelWidth}
              regenerate={regenerate}
              selectedModelId={currentModelId}
              selectedVisibilityType={visibilityType}
              sendMessage={sendMessage}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={status}
              stop={stop}
              votes={votes}
            />
          </>
        ) : (
          <>
            <div className="overscroll-behavior-contain flex min-w-0 flex-1 touch-pan-y flex-col bg-background">
              <ChatHeader
                chatId={id}
                isReadonly={isReadonly}
                selectedVisibilityType={initialVisibilityType}
              />

              <Messages
                addToolApprovalResponse={addToolApprovalResponse}
                chatId={id}
                isArtifactVisible={isArtifactVisible}
                isReadonly={isReadonly}
                messages={messages}
                regenerate={regenerate}
                selectedModelId={initialChatModel}
                setMessages={setMessages}
                status={status}
                votes={votes}
              />

              <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pt-2 pb-3 md:px-4 md:pb-4">
                {!isReadonly && (
                  <MultimodalInput
                    attachments={attachments}
                    chatId={id}
                    input={input}
                    messages={messages}
                    onModelChange={setCurrentModelId}
                    selectedModelId={currentModelId}
                    selectedVisibilityType={visibilityType}
                    sendMessage={sendMessage}
                    setAttachments={setAttachments}
                    setInput={setInput}
                    setMessages={setMessages}
                    status={status}
                    stop={stop}
                  />
                )}
              </div>
            </div>

            <Artifact
              chatId={id}
              isReadonly={isReadonly}
              messages={messages}
              sendMessage={sendMessage}
              setMessages={setMessages}
              status={status}
              stop={stop}
            />
          </>
        )}
      </div>

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              This application requires{" "}
              {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
              activate Vercel AI Gateway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank"
                );
                window.location.href = "/";
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
