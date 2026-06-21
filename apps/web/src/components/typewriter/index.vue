<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    /** 循环展示的词组数组 */
    words: string[];
    /** 打字速度 (ms/字符) */
    speed?: number;
    /** 词组之间的停顿时间 (ms) */
    delayBetweenWords?: number;
    /** 是否显示光标 */
    cursor?: boolean;
    /** 光标字符 */
    cursorChar?: string;
    className?: string;
  }>(),
  {
    speed: 100,
    delayBetweenWords: 2000,
    cursor: true,
    cursorChar: "|",
    className: "",
  },
);

const displayText = ref("");
const isDeleting = ref(false);
const wordIndex = ref(0);
const charIndex = ref(0);
const showCursor = ref(true);

let typeTimer: ReturnType<typeof setTimeout> | null = null;
let pauseTimer: ReturnType<typeof setTimeout> | null = null;
let cursorTimer: ReturnType<typeof setInterval> | null = null;

const clearTypeTimers = () => {
  if (typeTimer !== null) {
    clearTimeout(typeTimer);
    typeTimer = null;
  }
  if (pauseTimer !== null) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
};

const tick = () => {
  if (!props.words.length) return;
  const currentWord = props.words[wordIndex.value] ?? "";

  if (!isDeleting.value) {
    if (charIndex.value < currentWord.length) {
      displayText.value = currentWord.substring(0, charIndex.value + 1);
      charIndex.value += 1;
      typeTimer = setTimeout(tick, props.speed);
    } else {
      pauseTimer = setTimeout(() => {
        isDeleting.value = true;
        tick();
      }, props.delayBetweenWords);
    }
  } else if (charIndex.value > 0) {
    displayText.value = currentWord.substring(0, charIndex.value - 1);
    charIndex.value -= 1;
    typeTimer = setTimeout(tick, props.speed / 2);
  } else {
    isDeleting.value = false;
    wordIndex.value = (wordIndex.value + 1) % props.words.length;
    typeTimer = setTimeout(tick, props.speed);
  }
};

onMounted(() => {
  if (props.cursor) {
    cursorTimer = setInterval(() => {
      showCursor.value = !showCursor.value;
    }, 500);
  }
  tick();
});

onUnmounted(() => {
  clearTypeTimers();
  if (cursorTimer !== null) {
    clearInterval(cursorTimer);
    cursorTimer = null;
  }
});
</script>

<template>
  <span :class="cn('inline-block align-baseline', className)">
    <span>{{ displayText }}</span>
    <span
      v-if="cursor"
      class="ml-1 inline-block transition-opacity duration-75"
      :style="{ opacity: showCursor ? 1 : 0 }"
    >
      {{ cursorChar }}
    </span>
  </span>
</template>
