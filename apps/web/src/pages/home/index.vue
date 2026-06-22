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
import CascadeText from "@/components/cascade-text/index.vue";
import Typewriter from "@/components/typewriter/index.vue";
import InkReveal from "@/components/ink-reveal/index.vue";
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
        class="relative isolate flex min-h-screen flex-col items-center justify-center p-6 md:p-12 lg:p-16 select-none"
      >
        <!-- 背景层：Unsplash 风景图 + InkReveal 蒙版。鼠标 hover 擦开蒙版露出背景 -->
        <div class="absolute inset-0 -z-10 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&q=80"
            alt=""
            class="absolute inset-0 h-full w-full object-cover"
            aria-hidden="true"
          />
          <InkReveal :mask-color="[255, 255, 255]" />
        </div>
        <div class="w-full max-w-5xl space-y-10">
          <div class="text-center space-y-5">
            <h1
              class="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground select-none"
            >
              <CascadeText text="欢迎使用" />
              <span class="block mt-2">
                <CascadeText text="Mono 你的专属个人知识管家" />
              </span>
            </h1>
            <p
              class="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto opacity-80 leading-relaxed select-none"
            >
              <Typewriter
                :words="[
                  '人工智能的精准与高端设计的灵魂相遇。今天我们可以为您策划什么想法？',
                ]"
              />
            </p>
          </div>

          <div
            class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 select-none"
          >
            <div
              v-for="(card, index) in promptCards"
              :key="index"
              @click="handleCardClick(card.description)"
              class="group relative h-40 cursor-pointer rounded-xl border border-border/50 bg-card [perspective:1000px] transition-all duration-300 hover:border-border hover:shadow-lg hover:shadow-primary/5 select-none"
            >
              <!-- 渐变背景：不随翻转，hover 时浮现 -->
              <div
                class="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              <!-- 3D 翻转 wrapper：group-hover 触发 rotateY(180) -->
              <div
                class="relative h-full w-full transition-transform duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]"
              >
                <!-- 正面：图标 + 分类 -->
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center gap-3 [backface-visibility:hidden]"
                >
                  <component
                    :is="card.icon"
                    class="h-7 w-7 text-muted-foreground"
                  />
                  <span class="text-lg font-medium text-foreground">{{
                    card.category
                  }}</span>
                </div>
                <!-- 背面：描述（预先 rotateY(180) 藏起来） -->
                <div
                  class="absolute inset-0 flex items-center justify-center p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                >
                  <p
                    class="text-sm md:text-base text-muted-foreground leading-relaxed text-center"
                  >
                    {{ card.description }}
                  </p>
                </div>
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
