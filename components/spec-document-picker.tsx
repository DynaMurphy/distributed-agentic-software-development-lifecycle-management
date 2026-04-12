"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { memo, useCallback, useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { DocumentIcon } from "./icons";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface SpecDocumentSummary {
  id: string;
  version_id: string;
  title: string;
  valid_from: string;
}

function PureSpecDocumentPicker({
  chatId,
  sendMessage,
  status,
}: {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  status: UseChatHelpers<ChatMessage>["status"];
}) {
  const [documents, setDocuments] = useState<SpecDocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/spec-document");
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error("Failed to fetch spec documents:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch documents when dropdown opens
  useEffect(() => {
    if (open) {
      fetchDocuments();
    }
  }, [open, fetchDocuments]);

  const handleSelect = useCallback(
    (doc: SpecDocumentSummary) => {
      setOpen(false);
      window.history.pushState({}, "", `/chat/${chatId}`);
      sendMessage({
        role: "user",
        parts: [
          {
            type: "text",
            text: `Open spec document "${doc.title}" (ID: ${doc.id})`,
          },
        ],
      });
    },
    [chatId, sendMessage]
  );

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
          data-testid="spec-picker-button"
          disabled={status !== "ready"}
          variant="ghost"
        >
          <DocumentIcon size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Spec Documents</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="px-2 py-3 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : documents.length === 0 ? (
          <div className="px-2 py-3 text-center text-sm text-muted-foreground">
            No spec documents found
          </div>
        ) : (
          documents.map((doc) => (
            <DropdownMenuItem
              className="flex cursor-pointer flex-col items-start gap-0.5"
              key={doc.version_id}
              onClick={() => handleSelect(doc)}
            >
              <span className="font-medium">{doc.title}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(doc.valid_from).toLocaleDateString()}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const SpecDocumentPicker = memo(PureSpecDocumentPicker);
