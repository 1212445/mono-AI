<script setup lang="ts">
import type { SidebarProps } from "@/components/ui/sidebar";

import {
  GalleryVerticalEnd,
  History,
  MessageSquarePlus,
  Settings,
} from "lucide-vue-next";
import NavMain from "@/components/aside/NavMain.vue";
import NavUser from "@/components/aside/NavUser.vue";
import TeamSwitcher from "@/components/aside/TeamSwitcher.vue";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: "icon",
});

// This is sample data.
const data = {
  user: {
    name: "开发者",
    email: "djy123123aa@outlook.com",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "Mono AI",
      logo: GalleryVerticalEnd,
      plan: "简单指令，无限可能",
    },
  ],
  navMain: [
    {
      title: "新对话",
      url: "/",
      icon: MessageSquarePlus,
      isActive: true,
    },
    {
      title: "设置",
      url: "/settings",
      icon: Settings,
    },
    {
      title: "历史记录",
      url: "/history",
      icon: History,
    },
  ],
};
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <TeamSwitcher :teams="data.teams" />
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="data.navMain" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="data.user" />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
