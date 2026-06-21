import home from "@/pages/home/index.vue";
import chat from "@/pages/chat/index.vue";
import { createRouter, createWebHashHistory } from "vue-router";
import { toast } from "vue-sonner";
import { useChatStore } from "@/store";
import server from "@/utils/axios.config";

const routes = [
  {
    path: "/",
    name: "home",
    component: home,
  },
  {
    path: "/chat/:id",
    name: "chat",
    component: chat,
  },
  {
    path: "/kb",
    name: "kb",
    component: () => import("@/pages/kb/index.vue")
  }
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

router.beforeEach(async (to, _from, next) => {
  // 每次进入 /chat 路由都从后端拉一次会话列表，保证侧边栏跟最新状态一致
  // 之前用模块级 allSessionLoaded 标志只拉一次，新建对话 / 刷新 lastActiveTime 都不会反映到侧边栏
  if (to.path.startsWith("/chat")) {
    try {
      const chatStore = useChatStore();
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
  }
  next();
});

export default router;
