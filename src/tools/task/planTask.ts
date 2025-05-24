import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";
import { getAllTasks } from "../../models/taskModel.js";
import { TaskStatus, Task } from "../../types/index.js";
import { getPlanTaskPrompt } from "../../prompts/index.js";

// Task planning tool
export const planTaskSchema = z.object({
  description: z
    .string()
    .min(10, {
      message: "Task description must be at least 10 characters, please provide more detailed description to ensure task objectives are clear",
    })
    .describe("Complete detailed task problem description, should include task objectives, background and expected outcomes"),
  requirements: z
    .string()
    .optional()
    .describe("Task-specific technical requirements, business constraints or quality standards (optional)"),
  existingTasksReference: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to reference existing tasks as planning foundation, for task adjustment and continuity planning"),
});

export async function planTask({
  description,
  requirements,
  existingTasksReference = false,
}: z.infer<typeof planTaskSchema>) {
  // 獲取基礎目錄路徑
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const PROJECT_ROOT = path.resolve(__dirname, "../../..");
  const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, "data");
  const MEMORY_DIR = path.join(DATA_DIR, "memory");

  // 準備所需參數
  let completedTasks: Task[] = [];
  let pendingTasks: Task[] = [];

  // 當 existingTasksReference 為 true 時，從數據庫中載入所有任務作為參考
  if (existingTasksReference) {
    try {
      const allTasks = await getAllTasks();

      // 將任務分為已完成和未完成兩類
      completedTasks = allTasks.filter(
        (task) => task.status === TaskStatus.COMPLETED
      );
      pendingTasks = allTasks.filter(
        (task) => task.status !== TaskStatus.COMPLETED
      );
    } catch (error) {}
  }

  // 使用prompt生成器獲取最終prompt
  const prompt = getPlanTaskPrompt({
    description,
    requirements,
    existingTasksReference,
    completedTasks,
    pendingTasks,
    memoryDir: MEMORY_DIR,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
  };
}
