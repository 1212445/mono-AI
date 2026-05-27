import { defineStore, createPinia } from "pinia";
import { ref } from "vue";

export const pinia = createPinia();

export const useChatStore = defineStore("chat", () => {
  const currentSessionId = ref<string>("");
  const currentQuestion = ref<string>("");
  const currentAnswer = ref<string>("");
  const isNewChat = ref<boolean>(true);
  const useKnowledgeBase = ref<boolean>(false);
  const selectedFiles = ref<File[]>([]);

  const isHistoryMode = ref<boolean>(false); //是否是历史对话

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
    setCurrentChat,
    resetChat,
  };
});
