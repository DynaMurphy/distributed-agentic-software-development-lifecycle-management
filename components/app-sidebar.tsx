"use client";

import {
  BookOpenIcon,
  BrainCircuitIcon,
  BugIcon,
  FileTextIcon,
  GitBranchIcon,
  PanelLeftIcon,
  PenSquareIcon,
  SparklesIcon,
  TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import {
  getChatHistoryPaginationKey,
  SidebarHistory,
} from "@/components/sidebar-history";
import { SidebarSPLM } from "@/components/sidebar-splm";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import { useArtifact } from "@/hooks/use-artifact";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { open, setOpenMobile, toggleSidebar } = useSidebar();
  const { setArtifact } = useArtifact();
  const { mutate } = useSWRConfig();
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  const handleDeleteAll = () => {
    const deletePromise = fetch("/api/history", {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting all chats...",
      success: () => {
        mutate(unstable_serialize(getChatHistoryPaginationKey));
        setShowDeleteAllDialog(false);
        router.replace("/");
        router.refresh();
        return "All chats deleted successfully";
      },
      error: "Failed to delete all chats",
    });
  };

  return (
    <>
      <Sidebar
        className="border-r-0 [&_[data-sidebar=menu-button]]:bg-transparent [&_[data-sidebar=menu-button]]:hover:bg-transparent [&_[data-sidebar=menu-button]]:active:bg-transparent [&_[data-sidebar=menu-button][data-active]]:bg-transparent"
        collapsible="icon"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem className="flex flex-row items-center justify-between">
              <div className="group/logo relative">
                {!open && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        className="size-8"
                        onClick={() => toggleSidebar()}
                      >
                        <PanelLeftIcon />
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right">Open sidebar</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="group-data-[collapsible=icon]:hidden">
                <SidebarTrigger />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/");
                      router.refresh();
                    }}
                    tooltip="New Chat"
                  >
                    <PenSquareIcon />
                    <span>New chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {user && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setShowDeleteAllDialog(true)}
                      tooltip="Delete All Chats"
                    >
                      <TrashIcon />
                      <span>Delete all chats</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {user && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => {
                          setOpenMobile(false);
                          setArtifact((current) => ({
                            ...current,
                            documentId: "skills-browser",
                            kind: "skill" as const,
                            title: "Skills Browser",
                            content: "",
                            isVisible: true,
                            status: "idle",
                            boundingBox: { top: 0, left: 0, width: 0, height: 0 },
                          }));
                        }}
                        tooltip="Skills Browser"
                      >
                        <BrainCircuitIcon />
                        <span>Skills</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => {
                          setOpenMobile(false);
                          setArtifact((current) => ({
                            ...current,
                            documentId: "templates-browser",
                            kind: "template" as const,
                            title: "Template Editor",
                            content: "",
                            isVisible: true,
                            status: "idle",
                            boundingBox: { top: 0, left: 0, width: 0, height: 0 },
                          }));
                        }}
                        tooltip="Template Editor"
                      >
                        <FileTextIcon />
                        <span>Templates</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => {
                          setOpenMobile(false);
                          setArtifact((current) => ({
                            ...current,
                            documentId: "documents-browser",
                            kind: "document" as const,
                            title: "Documents",
                            content: "",
                            isVisible: true,
                            status: "idle",
                            boundingBox: { top: 0, left: 0, width: 0, height: 0 },
                          }));
                        }}
                        tooltip="Documents"
                      >
                        <BookOpenIcon />
                        <span>Documents</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => {
                          setOpenMobile(false);
                          setArtifact((current) => ({
                            ...current,
                            documentId: "features-browser",
                            kind: "feature" as const,
                            title: "Features",
                            content: "",
                            isVisible: true,
                            status: "idle",
                            boundingBox: { top: 0, left: 0, width: 0, height: 0 },
                          }));
                        }}
                        tooltip="Features"
                      >
                        <SparklesIcon />
                        <span>Features</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => {
                          setOpenMobile(false);
                          setArtifact((current) => ({
                            ...current,
                            documentId: "bugs-browser",
                            kind: "bug" as const,
                            title: "Bugs",
                            content: "",
                            isVisible: true,
                            status: "idle",
                            boundingBox: { top: 0, left: 0, width: 0, height: 0 },
                          }));
                        }}
                        tooltip="Bugs"
                      >
                        <BugIcon />
                        <span>Bugs</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => {
                          setOpenMobile(false);
                          setArtifact((current) => ({
                            ...current,
                            documentId: "repositories-browser",
                            kind: "repository" as const,
                            title: "Repositories",
                            content: "",
                            isVisible: true,
                            status: "idle",
                            boundingBox: { top: 0, left: 0, width: 0, height: 0 },
                          }));
                        }}
                        tooltip="Repositories"
                      >
                        <GitBranchIcon />
                        <span>Repositories</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarSPLM />
          <SidebarHistory user={user} />
        </SidebarContent>
        <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <AlertDialog
        onOpenChange={setShowDeleteAllDialog}
        open={showDeleteAllDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all
              your chats and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
