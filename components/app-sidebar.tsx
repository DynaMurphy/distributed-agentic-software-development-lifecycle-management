"use client";

import {
  BookOpenIcon,
  BrainCircuitIcon,
  BugIcon,
  ComponentIcon,
  FlagIcon,
  LayoutTemplateIcon,
  LightbulbIcon,
  ListTodoIcon,
  MapIcon,
  PackageIcon,
  PanelLeftIcon,
} from "lucide-react";
import type { User } from "next-auth";
import useSWR from "swr";
import { useArtifactStack } from "@/hooks/use-artifact";
import { useSelectedRepository } from "@/hooks/use-selected-repository";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { fetcher } from "@/lib/utils";

type NavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  documentId: string;
  kind: string;
  title: string;
  tooltip: string;
};

const globalNavItems: NavItem[] = [
  {
    label: "Products",
    icon: PackageIcon,
    documentId: "repositories-browser",
    kind: "repository",
    title: "Products",
    tooltip: "Product selector & management",
  },
  {
    label: "Skills",
    icon: BrainCircuitIcon,
    documentId: "skills-browser",
    kind: "skill",
    title: "Skills Browser",
    tooltip: "AI skill browser",
  },
  {
    label: "Templates",
    icon: LayoutTemplateIcon,
    documentId: "templates-browser",
    kind: "template",
    title: "Template Editor",
    tooltip: "Template editor",
  },
];

const productScopedNavItems: NavItem[] = [
  {
    label: "Capabilities",
    icon: ComponentIcon,
    documentId: "capabilities-browser",
    kind: "capability",
    title: "Capabilities",
    tooltip: "Functional capability areas",
  },
  {
    label: "Milestones",
    icon: FlagIcon,
    documentId: "milestones-view",
    kind: "milestone",
    title: "Release Milestones",
    tooltip: "Release checkpoints",
  },
  {
    label: "Roadmap",
    icon: MapIcon,
    documentId: "roadmap-view",
    kind: "roadmap",
    title: "Product Roadmap",
    tooltip: "Visual milestone arrangement",
  },
  {
    label: "Features",
    icon: LightbulbIcon,
    documentId: "features-browser",
    kind: "feature",
    title: "Features",
    tooltip: "Feature definitions",
  },
  {
    label: "Bugs",
    icon: BugIcon,
    documentId: "bugs-browser",
    kind: "bug",
    title: "Bugs",
    tooltip: "Bug reports",
  },
  {
    label: "Backlog",
    icon: ListTodoIcon,
    documentId: "backlog-view",
    kind: "backlog",
    title: "Product Backlog",
    tooltip: "Prioritized queue",
  },
  {
    label: "Documents",
    icon: BookOpenIcon,
    documentId: "documents-browser",
    kind: "document",
    title: "Documents",
    tooltip: "Specs & documentation",
  },
];

export function AppSidebar({ user }: { user: User | undefined }) {
  const { open, setOpenMobile, toggleSidebar } = useSidebar();
  const { reset, stack } = useArtifactStack();
  const { selectedRepositoryId } = useSelectedRepository();

  // Fetch product list to display selected product name
  const { data: products } = useSWR<
    { id: string; name: string; description: string | null }[]
  >("/api/products", fetcher, { revalidateOnFocus: false });

  const selectedProduct = products?.find(
    (r) => r.id === selectedRepositoryId,
  );

  // Highlight the sidebar item whose nav root matches the stack root
  const stackRoot = stack.length > 0 ? stack[0] : null;

  const isNavActive = (item: NavItem) =>
    stackRoot?.documentId === item.documentId ||
    stackRoot?.kind === item.kind;

  const handleNavClick = (item: NavItem) => {
    setOpenMobile(false);
    reset({
      documentId: item.documentId,
      kind: item.kind as any,
      title: item.title,
    });
  };

  return (
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
        {/* Global navigation (product-independent) */}
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Global
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {globalNavItems.map((item) => (
                <SidebarMenuItem key={item.documentId}>
                  <SidebarMenuButton
                    isActive={isNavActive(item)}
                    onClick={() => handleNavClick(item)}
                    tooltip={item.tooltip}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Product-scoped navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden pb-2">
            {selectedProduct
              ? selectedProduct.name
              : "No product selected"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {user &&
                productScopedNavItems.map((item) => (
                  <SidebarMenuItem key={item.documentId}>
                    <SidebarMenuButton
                      isActive={isNavActive(item)}
                      onClick={() => handleNavClick(item)}
                      tooltip={item.tooltip}
                      disabled={!selectedRepositoryId}
                      className={
                        !selectedRepositoryId
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
