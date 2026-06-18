<script setup lang="ts">
import AppSidebar from "@/components/aside/AppSidebar.vue";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Sparkles, Building2, FileText, PanelLeft } from "lucide-vue-next";
import { ref } from "vue";
import { useRouter } from "vue-router";
import ChatInput from "@/components/input/index.vue";
import { useChatStore } from "@/store";

const promptCards = [
  {
    category: "创意",
    description: "为极简手表品牌生成品牌美学方案",
    icon: Sparkles,
  },
  {
    category: "编程",
    description: "Vue的响应式原理的实现代码",
    icon: Building2,
  },
  {
    category: "创作",
    description: "写一篇400字左右的散文",
    icon: FileText,
  },
];

const router = useRouter();
const chatStore = useChatStore();

const inputMessage = ref("");
const useKnowledgeBase = ref(false);
const selectedFiles = ref<File[]>([]);

/**
 * 新对话跳转
 */
const handleSend = async () => {
  if (!inputMessage.value.trim()) return;

  const sessionId = crypto.randomUUID();
  chatStore.setCurrentChat(
    sessionId,
    inputMessage.value,
    "",
    useKnowledgeBase.value,
    selectedFiles.value,
  );
  router.push(`/chat/${sessionId}`);
};

/**
 * 点击卡片跳转
 * @param description 卡片描述词
 */
const handleCardClick = (description: string) => {
  const sessionId = crypto.randomUUID();
  chatStore.setCurrentChat(sessionId, description, "", false, []);
  router.push(`/chat/${sessionId}`);
};
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header
        class="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 select-none"
      >
        <div class="flex items-center gap-2 px-4">
          <SidebarTrigger class="-ml-1">
            <PanelLeft />
          </SidebarTrigger>
          <Separator orientation="vertical" class="mr-2 h-4" />
        </div>
      </header>
      <div
        class="flex min-h-screen flex-col items-center justify-center p-6 md:p-12 lg:p-16 select-none"
      >
        <div class="w-full max-w-5xl space-y-10">
          <div class="text-center space-y-5">
            <h1
              class="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground select-none"
            >
              欢迎使用
              <span class="block mt-2">Mono 你的专属个人知识管家</span>
            </h1>
            <p
              class="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto opacity-80 leading-relaxed select-none"
            >
              人工智能的精准与高端设计的灵魂相遇。
              今天我们可以为您策划什么想法？
            </p>
          </div>

          <div
            class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 select-none"
          >
            <div
              v-for="(card, index) in promptCards"
              :key="index"
              @click="handleCardClick(card.description)"
              class="group relative overflow-hidden rounded-xl border border-border/50 bg-card p-5 md:p-6 cursor-pointer transition-all duration-300 hover:border-border hover:shadow-lg hover:shadow-primary/5 select-none"
            >
              <div
                class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              <div class="relative space-y-3">
                <div class="flex items-center gap-2.5">
                  <component
                    :is="card.icon"
                    class="h-5 w-5 text-muted-foreground"
                  />
                  <span class="text-base font-medium text-foreground">{{
                    card.category
                  }}</span>
                </div>
                <p
                  class="text-sm md:text-base text-muted-foreground leading-relaxed"
                >
                  {{ card.description }}
                </p>
              </div>
            </div>
          </div>

          <div class="relative mx-auto max-w-3xl pt-4">
            <ChatInput
              v-model="inputMessage"
              v-model:useKnowledgeBase="useKnowledgeBase"
              v-model:files="selectedFiles"
              @send="handleSend"
            />
          </div>

          <p class="text-center text-xs text-muted-foreground/60">
            AI 生成的内容可能不准确或不当。
          </p>
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
