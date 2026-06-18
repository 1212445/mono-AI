import { defineStore, createPinia } from "pinia";
import { ref } from "vue";
import server from "@/utils/axios.config";

export const pinia = createPinia();

interface session {
  sessionId: string;
  title: string;
  lastActiveTime: Date;
}

interface sessionItem {
  id: number;
  sessionId: string;
  title: string;
  lastActiveTime: string;
}

export const useChatStore = defineStore("chat", () => {
  const currentSessionId = ref<string>("");
  const currentQuestion = ref<string>("");
  const currentAnswer = ref<string>("");
  const isNewChat = ref<boolean>(true);
  const useKnowledgeBase = ref<boolean>(false);
  const selectedFiles = ref<File[]>([]);
  const allSession = ref<session[]>([]); //会话记录
  // 是否已发起过会话列表请求（保证全局只请求一次）
  const allSessionRequested = ref<boolean>(false);
  // 会话列表是否已加载完成（用于控制骨架屏显隐）
  const allSessionLoaded = ref<boolean>(true);

  const isHistoryMode = ref<boolean>(false); //是否是历史对话

  /**
   * 后台加载历史会话列表。失败时把 allSessionRequested 重置，允许重试。
   */
  async function loadAllSession(): Promise<void> {
    allSessionLoaded.value = false;
    try {
      const res = await server.get("/chat/findAll");
      allSession.value = res.data.data.map((item: sessionItem) => ({
        sessionId: item.sessionId,
        title: item.title,
        lastActiveTime: item.lastActiveTime,
      }));
      allSessionLoaded.value = true;
    } catch (err) {
      allSessionLoaded.value = true; // 失败也结束骨架屏，避免永久 loading
      allSessionRequested.value = false;
      throw err;
    }
  }

  function setCurrentChat(
    sessionId: string,
    question: string,
    answer: string,
    knowledgeBase: boolean = false,
    files: File[] = [],
  ) {
    currentSessionId.value = sessionId;
    currentQuestion.value = question;
    currentAnswer.value = answer;
    isNewChat.value = false;
    useKnowledgeBase.value = knowledgeBase;
    selectedFiles.value = files;
  }

  function resetChat() {
    currentSessionId.value = "";
    currentQuestion.value = "";
    currentAnswer.value = "";
    isNewChat.value = true;
    useKnowledgeBase.value = false;
    selectedFiles.value = [];
  }

  return {
    currentSessionId,
    currentQuestion,
    currentAnswer,
    isNewChat,
    useKnowledgeBase,
    selectedFiles,
    allSession,
    allSessionRequested,
    allSessionLoaded,
    loadAllSession,
    setCurrentChat,
    resetChat,
  };
});
