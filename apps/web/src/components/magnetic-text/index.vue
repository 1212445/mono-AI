<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef } from "vue";
import { cn } from "@/lib/utils";

withDefaults(
  defineProps<{
    /** 文字内容。圆形扫过时显示反色版本（黑底白字） */
    text: string;
    /** 圆形窗口直径（px）。中文建议 200+，英文 150 即可。 */
    circleSize?: number;
    className?: string;
  }>(),
  { circleSize: 200, className: "" },
);

const containerRef = useTemplateRef<HTMLDivElement>("containerRef");
const circleRef = useTemplateRef<HTMLDivElement>("circleRef");
const innerTextRef = useTemplateRef<HTMLDivElement>("innerTextRef");

const isHovered = ref(false);
const containerSize = ref({ width: 0, height: 0 });

// 用普通对象而非 ref：这些值只用于 RAF 循环里的 transform 计算，不需要触发 Vue 重渲染
const mousePos = { x: 0, y: 0 };
const currentPos = { x: 0, y: 0 };
let rafId: number | null = null;

const lerp = (start: number, end: number, factor: number) =>
  start + (end - start) * factor;

const updateSize = () => {
  if (!containerRef.value) return;
  containerSize.value = {
    width: containerRef.value.offsetWidth,
    height: containerRef.value.offsetHeight,
  };
};

const handleMouseMove = (e: MouseEvent) => {
  if (!containerRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  mousePos.x = e.clientX - rect.left;
  mousePos.y = e.clientY - rect.top;
};

const handleMouseEnter = (e: MouseEvent) => {
  if (!containerRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  // 跳变到光标位置，避免从角落 lerp 过去
  mousePos.x = x;
  mousePos.y = y;
  currentPos.x = x;
  currentPos.y = y;
  isHovered.value = true;
};

const handleMouseLeave = () => {
  isHovered.value = false;
};

onMounted(() => {
  updateSize();
  window.addEventListener("resize", updateSize);

  const tick = () => {
    currentPos.x = lerp(currentPos.x, mousePos.x, 0.15);
    currentPos.y = lerp(currentPos.y, mousePos.y, 0.15);

    if (circleRef.value) {
      circleRef.value.style.transform = `translate(${currentPos.x}px, ${currentPos.y}px) translate(-50%, -50%)`;
    }
    if (innerTextRef.value) {
      // 反向移动：让 hoverText 看起来"固定"，圆形扫过
      innerTextRef.value.style.transform = `translate(${-currentPos.x}px, ${-currentPos.y}px)`;
    }

    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
});

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  window.removeEventListener("resize", updateSize);
});
</script>

<template>
  <div
    ref="containerRef"
    @mousemove="handleMouseMove"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    :class="
      cn(
        'relative inline-flex items-center justify-center select-none',
        className,
      )
    "
  >
    <!-- 基础文字层 -->
    <span class="block">{{ text }}</span>

    <!-- 圆形遮罩 + 内部反向移动的 hover 文字 -->
    <div
      ref="circleRef"
      class="pointer-events-none absolute left-0 top-0 overflow-hidden rounded-full bg-foreground"
      :style="{
        width: isHovered ? `${circleSize}px` : '0',
        height: isHovered ? `${circleSize}px` : '0',
        transition:
          'width 0.5s cubic-bezier(0.33, 1, 0.68, 1), height 0.5s cubic-bezier(0.33, 1, 0.68, 1)',
        willChange: 'transform, width, height',
      }"
    >
      <div
        ref="innerTextRef"
        class="absolute flex items-center justify-center"
        :style="{
          width: `${containerSize.width}px`,
          height: `${containerSize.height}px`,
          top: '50%',
          left: '50%',
          willChange: 'transform',
        }"
      >
        <span class="whitespace-nowrap text-background">{{ text }}</span>
      </div>
    </div>
  </div>
</template>
