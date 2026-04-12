"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

const MAX_TITLE_LENGTH = 255;

interface InlineEditableTitleProps {
  /** Current title value */
  title: string;
  /** Document ID to update */
  documentId: string;
  /** Document kind — determines which API endpoint to use */
  kind?: string;
  /** Whether the title is editable (e.g. false for read-only users or streaming) */
  isEditable?: boolean;
  /** Callback fired after a successful title save */
  onTitleChange?: (newTitle: string) => void;
  /** Additional CSS class for the wrapper */
  className?: string;
}

export function InlineEditableTitle({
  title,
  documentId,
  kind,
  isEditable = true,
  onTitleChange,
  className,
}: InlineEditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the edit value in sync when the title prop changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(title);
    }
  }, [title, isEditing]);

  // Focus and select the input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = useCallback(() => {
    if (!isEditable) return;
    setEditValue(title);
    setIsEditing(true);
  }, [isEditable, title]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditValue(title);
  }, [title]);

  const saveTitle = useCallback(async () => {
    const trimmed = editValue.trim();

    if (!trimmed) {
      toast.error("Title cannot be empty.");
      return;
    }

    if (trimmed.length > MAX_TITLE_LENGTH) {
      toast.error(`Title must not exceed ${MAX_TITLE_LENGTH} characters.`);
      return;
    }

    // No change — just close
    if (trimmed === title) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      let apiPath: string;
      switch (kind) {
        case "spec":
          apiPath = "/api/spec-document";
          break;
        case "feature":
          apiPath = "/api/features";
          break;
        case "bug":
          apiPath = "/api/bugs";
          break;
        default:
          apiPath = "/api/document";
      }
      const response = await fetch(
        `${apiPath}?id=${documentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message ?? `Failed to update title (${response.status})`
        );
      }

      setIsEditing(false);
      onTitleChange?.(trimmed);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update title."
      );
    } finally {
      setIsSaving(false);
    }
  }, [editValue, title, documentId, onTitleChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveTitle();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEditing();
      }
    },
    [saveTitle, cancelEditing]
  );

  if (isEditing) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <input
          ref={inputRef}
          aria-label="Document title"
          className="font-medium bg-transparent border-b border-foreground/30 focus:border-foreground outline-none px-0 py-0 text-base leading-tight w-full min-w-[120px] max-w-[400px]"
          disabled={isSaving}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          type="text"
          value={editValue}
        />
        <button
          aria-label="Save title"
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          disabled={isSaving}
          onClick={saveTitle}
          type="button"
        >
          <CheckIcon size={14} />
        </button>
        <button
          aria-label="Cancel editing"
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          disabled={isSaving}
          onClick={cancelEditing}
          type="button"
        >
          <XIcon size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5",
        isEditable && "cursor-pointer",
        className
      )}
      onClick={startEditing}
      onKeyDown={(e) => {
        if (isEditable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          startEditing();
        }
      }}
      role={isEditable ? "button" : undefined}
      tabIndex={isEditable ? 0 : undefined}
      title={isEditable ? "Click to edit title" : undefined}
    >
      <span className="font-medium">{title}</span>
      {isEditable && (
        <PencilIcon
          className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          size={12}
        />
      )}
    </div>
  );
}
