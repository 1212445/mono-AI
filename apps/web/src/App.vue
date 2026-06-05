<script setup lang="ts">
import Sonner from "@/components/ui/sonner/Sonner.vue";
</script>

<template>
  <router-view :key="$route.fullPath" />
  <Sonner />
</template>
