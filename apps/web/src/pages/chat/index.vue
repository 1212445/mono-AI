<script setup lang="ts">
import AppSidebar from "@/components/aside/AppSidebar.vue";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-vue-next";
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ChatInput from "@/components/input/index.vue";
import { useChatStore } from "@/store";
import { toast } from "vue-sonner";
import MessageList from "@/components/chat/MessageList.vue";

const router = useRouter();
const route = useRoute();
const chatStore = useChatStore();

const inputMessage = ref("");
const useKnowledgeBase = ref(false);
const selectedFiles = ref<File[]>([]);

const messageListRef = ref<InstanceType<typeof MessageList> | null>(null);

const chatTitle = computed(() => {
  const msgs = messageListRef.value?.messages;
  if (!msgs) return "新对话";
  return msgs.find((m) => m.role === "user")?.content || "新对话";
});

const goHome = () => {
  router.push("/");
};

const handleSend = async () => {
  const question = inputMessage.value;
  const files = selectedFiles.value;
  if (!question.trim()) return;
  inputMessage.value = "";
  selectedFiles.value = [];
  
  await messageListRef.value?.send(
    question,
    useKnowledgeBase.value,
    files,
    route.params.id as string,
  );
};

const initChat = async (sessionId: string, isFirstMount: boolean) => {
  // 第一步：永远先拉历史
  await messageListRef.value?.loadHistory(sessionId);

  // 第二步：只有首次挂载 + 从 home 跳过来的新对话（store 还存着 currentQuestion），才发首问
  if (
    isFirstMount &&
    chatStore.currentSessionId === sessionId &&
    chatStore.currentQuestion
  ) {
    const {
      currentQuestion: q,
      useKnowledgeBase: kb,
      selectedFiles: fs,
    } = chatStore;
    chatStore.resetChat();
    useKnowledgeBase.value = kb;
    selectedFiles.value = fs;

    try {
      await messageListRef.value?.send(q, kb, fs, sessionId);
      chatStore.allSession.unshift({
        sessionId,
        title: q.slice(0, 20),
        lastActiveTime: new Date(),
      });
    } catch (error) {
      console.error("发送消息失败", error);
      toast.error("发送消息失败");
    }
  }
};

onMounted(() => {
  initChat(route.params.id as string, true);
});

// 路由参数变化（/chat/A → /chat/B）时重新加载历史。
// 同路由不同参数会复用组件实例，onMounted 不再触发，需要靠 watch 兜底。
watch(
  () => route.params.id,
  async (newId, oldId) => {
    if (!newId || newId === oldId) return;
    // 切 session 时清空输入，避免上一个会话的草稿串味
    inputMessage.value = "";
    useKnowledgeBase.value = false;
    selectedFiles.value = [];
    await initChat(newId as string, false);
  },
);
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <div class="flex h-screen flex-col">
        <div
          class="flex items-center gap-3 border-b border-border/40 px-4 py-3"
        >
          <button
            @click="goHome"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ArrowLeft class="h-5 w-5" />
          </button>
          <Separator
            orientation="vertical"
            class="mr-2 data-[orientation=vertical]:h-4"
          />
          <div class="flex flex-col">
            <span class="text-sm font-medium text-foreground">{{
              chatTitle
            }}</span>
          </div>
        </div>

        <MessageList ref="messageListRef" />

        <div class="p-4 md:p-6">
          <ChatInput
            v-model="inputMessage"
            v-model:useKnowledgeBase="useKnowledgeBase"
            v-model:files="selectedFiles"
            @send="handleSend"
          />
          <p class="mt-3 text-center text-xs text-muted-foreground/60">
            AI 生成的内容可能不准确或不当。
          </p>
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
