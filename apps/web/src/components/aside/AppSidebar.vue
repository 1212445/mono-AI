<script setup lang="ts">
import type { SidebarProps } from "@/components/ui/sidebar";

import {
  GalleryVerticalEnd,
  History,
  MessageSquarePlus,
  FileMinus,
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
import { useChatStore } from "@/store";
import { computed } from "vue";

const chatStore = useChatStore();

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: "icon",
});

const teams = [
  {
    name: "Mono AI",
    logo: GalleryVerticalEnd,
    plan: "简单指令,无限可能",
  },
];

const user = {
  name: "开发者",
  email: "djy123123aa@outlook.com",
  avatar: "/avatars/shadcn.jpg",
};

const navMain = computed(() => [
  {
    title: "新对话",
    url: "/",
    icon: MessageSquarePlus,
    isActive: true,
  },
  {
    title: "知识库",
    url: "/kb",
    icon: FileMinus,
  },
  {
    title: "历史记录",
    icon: History,
    children: chatStore.allSession.map((s) => ({
      title: s.title,
      url: `/chat/${s.sessionId}`,
    })),
  },
]);
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <TeamSwitcher :teams="teams" />
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="navMain" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="user" />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
