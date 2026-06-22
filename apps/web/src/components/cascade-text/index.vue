<script setup lang="ts">
import { computed, ref } from "vue";

interface Props {
  /** 要展示的文字。中文/日文/韩文会自动按 grapheme 切分（避免 emoji、组合字符被拆开） */
  text: string;
  /** 字体大小。默认 inherit，由父元素（如 h1）控制 */
  fontSize?: string;
  /** 每个字符动画延迟间隔（ms）。值越大波动越明显 */
  staggerDelay?: number;
  /** 单个字符动画时长（ms） */
  duration?: number;
  /** 默认文字色。默认 inherit */
  color?: string;
  /** 鼠标悬停时整段文字的目标色 */
  hoverColor?: string;
  /** 字符滑出方向：up = 向上（默认），down = 向下 */
  direction?: "up" | "down";
}

const props = withDefaults(defineProps<Props>(), {
  fontSize: "inherit",
  staggerDelay: 25,
  duration: 250,
  color: "inherit",
  hoverColor: "#1e3a8a",
  direction: "up",
});

const hovered = ref(false);

// 用 Intl.Segmenter 按字位切分；不支持的环境降级为按 code point 切（拆 surrogate 对）
const chars = computed<string[]>(() => {
  const IntlAny = Intl as unknown as { Segmenter?: typeof Intl.Segmenter };
  if (typeof Intl !== "undefined" && typeof IntlAny.Segmenter !== "undefined") {
    const segmenter = new IntlAny.Segmenter("zh", { granularity: "grapheme" });
    return Array.from(segmenter.segment(props.text), (s) => s.segment);
  }
  return [...props.text];
});

const sign = computed(() => (props.direction === "up" ? 1 : -1));
</script>

<template>
  <span
    class="inline-block relative cursor-pointer select-none"
    :style="{
      fontSize,
      color: hovered ? hoverColor : color,
      transition: 'color 0.35s ease',
      padding: '0.15em 0.4em',
      lineHeight: 1,
    }"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    :aria-label="text"
  >
    <span
      class="inline-flex overflow-hidden relative"
      style="height: 1em"
      aria-hidden="true"
    >
      <span
        v-for="(char, i) in chars"
        :key="i"
        class="inline-block relative"
        :style="{
          textShadow: `0 ${sign}em currentColor`,
          transition: `transform ${duration}ms ease-in-out`,
          transitionDelay: `${i * staggerDelay}ms`,
          transform: hovered ? `translateY(${-sign}em)` : 'translateY(0)',
        }"
      >
        {{ char === " " ? " " : char }}
      </span>
    </span>
  </span>
</template>
