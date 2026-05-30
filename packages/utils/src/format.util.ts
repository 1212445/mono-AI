/**
 * "2048576" → "2.0 MB"
 * @param size 字节数
 * @returns 可读格式
 */
export function formatFileSize (size: string):string {
  const bytes = parseInt(size, 10);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * "2026-05-30T10:00:00" → "2026/05/30 10:00"
 * @param time 时间
 * @returns 将时间字符串转换为中文格式
 */
export function formatTime (time: string):string {
  const date = new Date(time);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};