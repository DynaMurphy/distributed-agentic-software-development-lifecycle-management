"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "critical" | "high" | "medium" | "low";
  effort_estimate?: string | null;
  parent_type: "feature" | "bug";
  parent_id: string;
}

interface TaskListProps {
  parentType: "feature" | "bug";
  parentId: string;
}

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

const taskStatusColors: Record<string, string> = {
  todo: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  in_progress:
    "bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  done: "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300",
  blocked:
    "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
};

const taskStatusDots: Record<string, string> = {
  todo: "bg-gray-400",
  in_progress: "bg-blue-500",
  done: "bg-green-500",
  blocked: "bg-amber-500",
};

const taskStatusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

const priorityColors: Record<string, string> = {
  critical:
    "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  high: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  medium:
    "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  low: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskList({ parentType, parentId }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/tasks?parentType=${parentType}&parentId=${parentId}`
      );
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail — tasks are supplementary
    } finally {
      setIsLoading(false);
    }
  }, [parentType, parentId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleStatusChange = useCallback(
    async (taskId: string, newStatus: string) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: newStatus as Task["status"] } : t
        )
      );

      try {
        const res = await fetch(`/api/tasks?id=${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error("Failed to update task");
      } catch {
        // Revert on failure
        fetchTasks();
        toast.error("Failed to update task status");
      }
    },
    [fetchTasks]
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
        <div className="h-10 bg-muted rounded animate-pulse" />
        <div className="h-10 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (tasks.length === 0) return null;

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <div className="space-y-2">
      {/* Header */}
      <button
        type="button"
        className="flex items-center gap-1.5 w-full text-left"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? (
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        )}
        <label className="text-sm font-medium text-muted-foreground cursor-pointer">
          Tasks
        </label>
        <span className="text-xs text-muted-foreground">
          ({doneCount}/{total} done)
        </span>
        {/* Inline progress bar */}
        <div className="flex-1 mx-2">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </button>

      {/* Task rows */}
      {!isCollapsed && (
        <div className="space-y-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 p-2.5 rounded-md border bg-muted/20 group"
            >
              {/* Status dot */}
              <span
                className={`inline-block size-2 rounded-full shrink-0 ${taskStatusDots[task.status] ?? "bg-gray-400"}`}
              />

              {/* Title + description */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{task.title}</p>
                {task.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {task.description}
                  </p>
                )}
              </div>

              {/* Effort estimate */}
              {task.effort_estimate && (
                <span className="text-[10px] text-muted-foreground font-mono px-1.5 py-0.5 bg-muted rounded shrink-0">
                  {task.effort_estimate}
                </span>
              )}

              {/* Priority badge */}
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${priorityColors[task.priority] ?? "bg-gray-100 text-gray-600"}`}
              >
                {task.priority}
              </span>

              {/* Status select */}
              <Select
                value={task.status}
                onValueChange={(value) => handleStatusChange(task.id, value)}
              >
                <SelectTrigger className="w-[110px] h-7 text-xs shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    ["todo", "in_progress", "done", "blocked"] as const
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`inline-block size-2 rounded-full ${taskStatusDots[s]}`}
                        />
                        {taskStatusLabels[s]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact completion summary for feature/bug headers
// ---------------------------------------------------------------------------

export function TaskCompletionSummary({
  parentType,
  parentId,
}: {
  parentType: "feature" | "bug";
  parentId: string;
}) {
  const [counts, setCounts] = useState<{
    total: number;
    done: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/tasks?parentType=${parentType}&parentId=${parentId}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          const tasks = Array.isArray(data) ? data : [];
          setCounts({
            total: tasks.length,
            done: tasks.filter(
              (t: any) => t.status === "done"
            ).length,
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parentType, parentId]);

  if (!counts || counts.total === 0) return null;

  const pct = Math.round((counts.done / counts.total) * 100);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>
        {counts.done}/{counts.total} tasks
      </span>
    </div>
  );
}
