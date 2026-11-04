import type { FC, ReactNode } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppTopNav } from "@/components/app-sidebar/components/AppTopNav";

interface IAppSidebarInset {
  children: ReactNode;
}

export const AppSidebarInset: FC<IAppSidebarInset> = ({
  children,
}: IAppSidebarInset) => {
  return (
    <SidebarInset className="min-w-0">
      <AppTopNav />
      {children}
    </SidebarInset>
  );
};
