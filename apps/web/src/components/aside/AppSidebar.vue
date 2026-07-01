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
import { computed, onMounted } from "vue";
import server from "@/utils/axios.config";
import { toast } from "vue-sonner";

const chatStore = useChatStore();

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: "icon",
});

/**
 * 拉取历史会话列表。
 * - 仅当 store 为空时才拉一次，避免与 router.beforeEach 的 /chat/* 刷新重复请求
 * - home / kb 路由下 router 守卫不会触发，这里兜底，让侧边栏在落地时就有数据
 */
const fetchSessions = async () => {
  if (chatStore.allSession.length > 0) return;
  try {
    const res = await server.get("/chat/findAll");
    chatStore.allSession = res.data.data.map(
      (item: {
        id: number;
        sessionId: string;
        title: string;
        lastActiveTime: string;
      }) => ({
        sessionId: item.sessionId,
        title: item.title,
        lastActiveTime: item.lastActiveTime,
      }),
    );
  } catch (err) {
    console.error("加载历史会话失败", err);
    toast.error("加载历史会话失败");
  }
};

onMounted(fetchSessions);

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
