import {
  Activity,
  FolderOpen,
  Gauge,
  Home,
  Inbox,
  LayoutDashboard,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
} from "lucide-react";

export const nav = {
  user: {
    avatar: "/avatars/safebucket.jpg",
  },
  main: [
    {
      title: "navigation.personal",
      url: "#",
      icon: Home,
      items: [
        {
          title: "navigation.home",
          url: "/dashboard",
        },
        {
          title: "navigation.public_catalog",
          url: "/",
        },
        {
          title: "navigation.activity",
          url: "/activity",
        },
      ],
    },
  ],
  admin: [
    {
      title: "navigation.administration",
      url: "#",
      icon: Shield,
      items: [
        {
          title: "navigation.dashboard",
          url: "/admin/dashboard",
          icon: LayoutDashboard,
        },
        {
          title: "navigation.admin_activity",
          url: "/admin/activity",
          icon: Activity,
        },
        {
          title: "navigation.users",
          url: "/admin/users",
          icon: Users,
        },
        {
          title: "navigation.approvals",
          url: "/admin/approvals",
          icon: Inbox,
        },
        {
          title: "navigation.buckets",
          url: "/admin/buckets",
          icon: FolderOpen,
        },
        {
          title: "navigation.admin_settings",
          url: "/admin/settings",
          icon: Settings,
        },
      ],
    },
  ],
  moderation: [
    {
      title: "navigation.moderation",
      url: "#",
      icon: ShieldCheck,
      items: [
        {
          title: "navigation.reviews",
          url: "/reviews",
        },
      ],
    },
  ],
  help: [
    {
      title: "navigation.account",
      url: "/settings/profile",
      icon: User,
    },
    {
      title: "navigation.preferences",
      url: "/settings/preferences",
      icon: SlidersHorizontal,
    },
    {
      title: "navigation.usage",
      url: "/settings/usage",
      icon: Gauge,
    },
  ],
};
