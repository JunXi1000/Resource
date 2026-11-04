import { Link, useLocation, useNavigate } from "@tanstack/react-router";

import { useTranslation } from "react-i18next";
import { ChevronsUpDown, FolderSync, LogIn, LogOut, Plus, UserPlus } from "lucide-react";
import type { FC, ReactNode } from "react";

import { nav } from "@/components/app-sidebar/helpers/nav";
import { useLogout, useSession } from "@/hooks/useAuth";
import { useBucketsData } from "@/components/bucket-view/hooks/useBucketsData";
import { BUCKET_DESCRIPTION_MAX_LENGTH } from "@/components/bucket-view/helpers/constants";
import { FormDialog } from "@/components/dialogs/components/FormDialog";
import { useDialog } from "@/components/dialogs/hooks/useDialog";
import { useCurrentUser } from "@/queries/user";
import { getUserDisplayName } from "@/types/user.ts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

/**
 * Sidebar nav links; gated destinations are protected by the route guards,
 * which redirect anonymous visitors to the sign-in page.
 */
function AuthNavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <SidebarMenuSubButton asChild isActive={active}>
      <Link to={to}>{children}</Link>
    </SidebarMenuSubButton>
  );
}

export const AppSidebar: FC = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const logout = useLogout();
  const { data: user } = useCurrentUser();
  const createBucketDialog = useDialog();
  const { buckets, createBucketMutation } = useBucketsData();

  return (
    <Sidebar variant="inset" stock="pad" seed="safebucket-pad">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              to="/dashboard"
              className="font-hand text-ink mt-1 block cursor-pointer px-2 text-2xl leading-none font-bold tracking-tight"
            >
              SafeBucket
            </Link>
            <Separator className="mt-2" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarGroup>
            {nav.main.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={t(item.title)}>
                  <div>
                    <item.icon />
                    {t(item.title)}
                  </div>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {item.items.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <AuthNavLink
                        to={subItem.url}
                        active={location.pathname == subItem.url}
                      >
                        {t(subItem.title)}
                      </AuthNavLink>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
            ))}
          </SidebarGroup>
          {user?.role === "admin" && (
            <SidebarMenu>
              <SidebarGroup>
                {nav.admin.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={t(item.title)}>
                      <div>
                        <item.icon />
                        {t(item.title)}
                      </div>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <AuthNavLink
                            to={subItem.url}
                            active={location.pathname.startsWith(subItem.url)}
                          >
                            {t(subItem.title)}
                          </AuthNavLink>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                ))}
              </SidebarGroup>
            </SidebarMenu>
          )}
          <SidebarMenu>
            <SidebarGroup>
              {nav.moderation.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={t(item.title)}>
                    <div>
                      <item.icon />
                      {t(item.title)}
                    </div>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    {item.items.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <AuthNavLink
                          to={subItem.url}
                          active={location.pathname.startsWith(subItem.url)}
                        >
                          {t(subItem.title)}
                        </AuthNavLink>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              ))}
            </SidebarGroup>
          </SidebarMenu>
          <SidebarGroup>
            <SidebarMenuItem key="shared_buckets">
              <SidebarMenuButton
                asChild
                tooltip={t("navigation.shared_buckets")}
              >
                <div>
                  <FolderSync />
                  {t("navigation.shared_buckets")}
                </div>
              </SidebarMenuButton>
              {session && user?.role !== "guest" && (
                <SidebarMenuAction>
                  <Plus onClick={createBucketDialog.trigger} />
                  <FormDialog
                    {...createBucketDialog.props}
                    title={t("bucket.new_bucket_dialog.title")}
                    description={t("bucket.new_bucket_dialog.description")}
                    fields={[
                      {
                        id: "name",
                        label: t("bucket.new_bucket_dialog.name_label"),
                        type: "text",
                        required: true,
                      },
                      {
                        id: "description",
                        label: t("bucket.new_bucket_dialog.description_label"),
                        type: "textarea",
                        placeholder: t(
                          "bucket.new_bucket_dialog.description_placeholder",
                        ),
                        maxLength: BUCKET_DESCRIPTION_MAX_LENGTH,
                      },
                    ]}
                    onSubmit={(data) => {
                      createBucketMutation.mutate(
                        {
                          name: data.name,
                          description: data.description?.trim(),
                        },
                        {
                          onSuccess: (bucket) => {
                            navigate({
                              to: "/buckets/$bucketId",
                              params: { bucketId: bucket.id },
                            });
                          },
                        },
                      );
                    }}
                    confirmLabel={t("common.create")}
                  />
                </SidebarMenuAction>
              )}
              <SidebarMenuSub>
                {buckets.map((bucket) => (
                  <SidebarMenuSubItem key={bucket.id}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={location.pathname.startsWith(
                        `/buckets/${bucket.id}`,
                      )}
                    >
                      <Link
                        to="/buckets/$bucketId"
                        params={{ bucketId: bucket.id }}
                      >
                        {bucket.name}
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
          </SidebarGroup>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={nav.user.avatar} alt="Image" />
                    <AvatarFallback className="rounded-lg">
                      {user?.email.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {getUserDisplayName(user, "")}
                    </span>
                    <span className="truncate text-xs">{user?.email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage src={nav.user.avatar} alt="Image" />
                      <AvatarFallback className="rounded-lg">
                        {user?.email.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {getUserDisplayName(user, "")}
                      </span>
                      <span className="truncate text-xs">{user?.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {nav.help.map((item) => (
                  <DropdownMenuItem key={item.title} asChild>
                    <Link to={item.url}>
                      <item.icon className="mr-2" />
                      {t(item.title)}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2" />
                  {t("common.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2 px-2">
                <Button size="sm" className="flex-1" asChild>
                  <Link to="/auth/login" search={{ redirect: "/dashboard" }}>
                    <LogIn className="mr-2 h-4 w-4" />
                    {t("auth.sign_in")}
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="flex-1" asChild>
                  <Link to="/auth/register">
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t("auth.sign_up")}
                  </Link>
                </Button>
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
