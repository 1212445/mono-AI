<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from "vue";

interface Stamp {
  x: number;
  y: number;
  born: number;
  seed: number;
  rmax: number;
}

const props = withDefaults(
  defineProps<{
    /** 蒙版色：鼠标未擦到的区域显示的颜色。light 模式默认近米白，dark 模式建议传深色 */
    maskColor?: [number, number, number];
    /** 单个墨戳的半径 px */
    brushSize?: number;
    /** 每个戳存在时间（ms）后淡出 */
    lifetime?: number;
    /** 戳的初始半径 */
    rStart?: number;
    /** 戳半径的随机变化幅度（0-1） */
    rVary?: number;
    /** 沿鼠标轨迹每多少像素打一个戳 */
    stampStep?: number;
    /** 同时存在的最大戳数（超出时丢弃最老的） */
    maxStamps?: number;
    /** 戳边缘的圆周分段数（越大越圆滑） */
    segments?: number;
    /** 戳边缘 wobble 权重 [主, 次, 末] */
    wobble?: [number, number, number];
    /** 径向渐变内圈半径因子（0-1） */
    gradientInnerRadius?: number;
    /** 渐变不透明度 [中心, 中, 边缘] */
    gradientStops?: [number, number, number];
  }>(),
  {
    maskColor: () => [252, 250, 248] as [number, number, number],
    brushSize: 128,
    lifetime: 600,
    rStart: 10,
    rVary: 0.45,
    stampStep: 10,
    maxStamps: 200,
    segments: 36,
    wobble: () => [0.14, 0.08, 0.05] as [number, number, number],
    gradientInnerRadius: 0.2,
    gradientStops: () => [0.95, 0.88, 0] as [number, number, number],
  },
);

const canvasRef = useTemplateRef<HTMLCanvasElement>("canvasRef");

// 用普通 let 存 RAF 循环里的可变数据，避开 ref 的响应式代理开销
let stamps: Stamp[] = [];
let running = false;
let lastPos: { x: number; y: number } | null = null;
let dims = { w: 0, h: 0 };
let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;

const paintFull = (ctx: CanvasRenderingContext2D) => {
  ctx.globalCompositeOperation = "source-over";
  const [r, g, b] = props.maskColor;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, dims.w, dims.h);
};

const carveInk = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  seed: number,
  alpha: number,
) => {
  const g = ctx.createRadialGradient(
    x,
    y,
    r * props.gradientInnerRadius,
    x,
    y,
    r,
  );
  g.addColorStop(0, `rgba(0,0,0,${props.gradientStops[0] * alpha})`);
  g.addColorStop(0.5, `rgba(0,0,0,${props.gradientStops[1] * alpha})`);
  g.addColorStop(1, `rgba(0,0,0,${props.gradientStops[2] * alpha})`);
  ctx.fillStyle = g;

  ctx.beginPath();
  for (let i = 0; i <= props.segments; i++) {
    const a = (i / props.segments) * Math.PI * 2;
    const wob =
      0.78 +
      props.wobble[0] * Math.sin(a * 3 + seed) +
      props.wobble[1] * Math.sin(a * 5 + seed * 2.1) +
      props.wobble[2] * Math.sin(a * 7 + seed * 0.7);
    const px = x + Math.cos(a) * r * wob;
    const py = y + Math.sin(a) * r * wob;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
};

const addStamp = (x: number, y: number) => {
  if (stamps.length >= props.maxStamps) stamps.shift();
  stamps.push({
    x,
    y,
    born: performance.now(),
    seed: Math.random() * Math.PI * 2,
    rmax: props.brushSize * (1 - props.rVary + Math.random() * props.rVary),
  });
};

const stampAlong = (x: number, y: number) => {
  const last = lastPos;
  if (!last) {
    addStamp(x, y);
  } else {
    const dx = x - last.x;
    const dy = y - last.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / props.stampStep));
    for (let i = 1; i <= steps; i++) {
      addStamp(last.x + (dx * i) / steps, last.y + (dy * i) / steps);
    }
  }
  lastPos = { x, y };
};

const loop = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const now = performance.now();

  // 每帧先重涂蒙版（stamp 是临时擦口，每帧重画保证过期戳自然恢复蒙版）
  paintFull(ctx);
  ctx.globalCompositeOperation = "destination-out";

  for (let i = stamps.length - 1; i >= 0; i--) {
    const t = (now - stamps[i].born) / props.lifetime;
    if (t >= 1) {
      stamps.splice(i, 1);
      continue;
    }
    const ease = 1 - Math.pow(1 - t, 3);
    const r = props.rStart + (stamps[i].rmax - props.rStart) * ease;
    const alpha = 1 - t * t;
    carveInk(ctx, stamps[i].x, stamps[i].y, r, stamps[i].seed, alpha);
  }

  if (stamps.length) {
    rafId = requestAnimationFrame(loop);
  } else {
    running = false;
  }
};

const startLoop = () => {
  if (!running) {
    running = true;
    rafId = requestAnimationFrame(loop);
  }
};

const resize = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = parent.getBoundingClientRect();
  dims = { w: rect.width, h: rect.height };
  canvas.width = Math.round(dims.w * dpr);
  canvas.height = Math.round(dims.h * dpr);
  canvas.style.width = `${dims.w}px`;
  canvas.style.height = `${dims.h}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintFull(ctx);
};

onMounted(() => {
  resize();
  window.addEventListener("resize", resize);

  // 监听父元素尺寸变化：侧边栏折叠/展开不会触发 window resize，
  // 但会让 canvas 的父容器改变宽度，需要重新测量画布大小避免右侧露出图片。
  const parent = canvasRef.value?.parentElement;
  if (parent && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(parent);
  }
});

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  window.removeEventListener("resize", resize);
  resizeObserver?.disconnect();
  resizeObserver = null;
});

const getRelativePos = (e: MouseEvent) => {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const handleMouseEnter = (e: MouseEvent) => {
  const pos = getRelativePos(e);
  lastPos = pos;
  stampAlong(pos.x, pos.y);
  startLoop();
};

const handleMouseMove = (e: MouseEvent) => {
  const pos = getRelativePos(e);
  stampAlong(pos.x, pos.y);
  startLoop();
};

const handleMouseLeave = () => {
  lastPos = null;
};
</script>

<template>
  <canvas
    ref="canvasRef"
    class="absolute inset-0 z-[1] cursor-none"
    @mouseenter="handleMouseEnter"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  />
</template>
