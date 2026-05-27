import home from "@/pages/home/index.vue";
import chat from "@/pages/chat/index.vue";
import { createRouter, createWebHashHistory } from "vue-router";

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
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

export default router;
