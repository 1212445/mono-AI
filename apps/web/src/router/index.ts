import home from "@/pages/home/index.vue";
import chat from "@/pages/chat/index.vue";
import { createRouter, createWebHashHistory } from "vue-router";
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

let allSessionLoaded = false;

router.beforeEach(async (_to, _from, next) => {
  if (!allSessionLoaded) {
    allSessionLoaded = true;
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
      allSessionLoaded = false;
      console.error("加载历史会话失败", err);
    }
  }
  next();
});

export default router;
