<script setup lang="ts">
import AppSidebar from "@/components/aside/AppSidebar.vue";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import {
  Upload,
  FileText,
  Trash2,
  Search,
  PanelLeft,
  MoreHorizontal,
  FileUp,
} from "lucide-vue-next";
import { formatFileSize, formatTime } from "@rag/utils";
import { ref, onMounted } from "vue";
import server from "@/utils/axios.config";
import { toast } from "vue-sonner";

interface KnowledgeFile {
  id: number;
  fileName: string;
  size: string;
  createdTime: string;
  filePath: string;
  uniqueId: string;
}
const fileList = ref<KnowledgeFile[]>([]);
const searchQuery = ref("");
const isUploading = ref(false);
const uploadProgress = ref(0);

const fetchFiles = async () => {
  try {
    const res = await server.get("/file-management");
    fileList.value = res.data.data;
  } catch (error) {
    console.error("获取文件列表失败:", error);
    toast.error("获取文件列表失败");
  }
};

const handleFileUpload = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    uploadFiles(Array.from(input.files));
  }
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    uploadFiles(Array.from(event.dataTransfer.files));
  }
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
};

const uploadFiles = async (files: File[]) => {
  isUploading.value = true;
  uploadProgress.value = 0;

  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await server.post("/file-management/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            uploadProgress.value = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
          }
        },
      });
      toast.success(`${file.name} 上传成功`);
    } catch (error) {
      console.error(`上传文件 ${file.name} 失败:`, error);
      toast.error(`${file.name} 上传失败`);
    }
  }

  isUploading.value = false;
  uploadProgress.value = 0;
  await fetchFiles();
};

const deleteFile = async (id: number) => {
  try {
    await server.delete(`/file-management/${id}`);
    toast.success("文件删除成功");
    await fetchFiles();
  } catch (error) {
    console.error("删除文件失败:", error);
    toast.error("删除文件失败");
  }
};

const filteredFiles = () => {
  if (!searchQuery.value) return fileList.value;
  return fileList.value.filter((f) =>
    f.fileName.toLowerCase().includes(searchQuery.value.toLowerCase()),
  );
};

onMounted(() => {
  fetchFiles();
});
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
          <Separator
            orientation="vertical"
            class="mr-2 data-[orientation=vertical]:h-4"
          />
          <span class="text-sm font-medium">知识库管理</span>
        </div>
      </header>

      <div class="flex flex-1 flex-col gap-4 p-4 pt-0">
        <!-- 上传区域 -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-base font-medium flex items-center gap-2">
              <FileUp class="h-4 w-4" />
              上传文档
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              class="border-2 border-dashed border-border rounded-xl p-8 text-center transition-colors hover:border-primary/50"
              :class="{ 'border-primary/50 bg-primary/5': isUploading }"
              @drop="handleDrop"
              @dragover="handleDragOver"
            >
              <Upload class="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
              <p class="text-sm text-muted-foreground mb-2">
                拖拽文件到此处，或点击下方按钮选择文件
              </p>
              <p class="text-xs text-muted-foreground/60 mb-4">
                支持 PDF、Markdown、TXT、JSON、CSV 格式
              </p>
              <div class="flex items-center justify-center gap-3">
                <Button as-child>
                  <label class="cursor-pointer">
                    选择文件
                    <input
                      type="file"
                      class="hidden"
                      multiple
                      accept=".pdf,.md,.txt,.json,.csv"
                      @change="handleFileUpload"
                    />
                  </label>
                </Button>
              </div>
              <div v-if="isUploading" class="mt-4">
                <div class="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full bg-primary transition-all duration-300"
                    :style="{ width: `${uploadProgress}%` }"
                  />
                </div>
                <p class="text-xs text-muted-foreground mt-2">
                  正在处理... {{ uploadProgress }}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 文件列表 -->
        <Card>
          <CardHeader class="pb-4">
            <div class="flex items-center justify-between">
              <CardTitle class="text-base font-medium flex items-center gap-2">
                <FileText class="h-4 w-4" />
                文档列表
                <Badge variant="secondary" class="ml-2">
                  {{ fileList.length }} 个文件
                </Badge>
              </CardTitle>
              <div class="relative w-64">
                <Search
                  class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                />
                <Input
                  v-model="searchQuery"
                  placeholder="搜索文档..."
                  class="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent class="p-0">
            <Table v-if="filteredFiles().length > 0">
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[40%]">文件名</TableHead>
                  <TableHead class="w-[20%]">大小</TableHead>
                  <TableHead class="w-[20%]">上传时间</TableHead>
                  <TableHead class="w-[20%] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="file in filteredFiles()" :key="file.id">
                  <TableCell class="font-medium">
                    <div class="flex items-center gap-2">
                      <FileText class="h-4 w-4 text-muted-foreground" />
                      <span class="truncate max-w-[200px]">
                        {{ file.fileName }}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell class="text-muted-foreground">
                    {{ formatFileSize(file.size) }}
                  </TableCell>
                  <TableCell class="text-muted-foreground">
                    {{ formatTime(file.createdTime) }}
                  </TableCell>
                  <TableCell class="text-right">
                    <div class="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8 text-muted-foreground hover:text-destructive"
                        @click="deleteFile(file.id)"
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div
              v-else
              class="flex flex-col items-center justify-center py-12 text-center"
            >
              <FileText class="h-10 w-10 text-muted-foreground mb-4" />
              <p class="text-sm text-muted-foreground">
                {{ searchQuery ? "未找到匹配的文档" : "暂无文档，请上传文件" }}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  </SidebarProvider>
  <Toaster />
</template>
