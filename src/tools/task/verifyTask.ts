import { z } from "zod";
import { UUID_V4_REGEX } from "../../utils/regex.js";
import {
  getTaskById,
  updateTaskStatus,
  updateTaskSummary,
} from "../../models/taskModel.js";
import { TaskStatus } from "../../types/index.js";
import { getVerifyTaskPrompt } from "../../prompts/index.js";

// Task verification tool
export const verifyTaskSchema = z.object({
  taskId: z
    .string()
    .regex(UUID_V4_REGEX, {
      message: "Invalid task ID format, please provide valid UUID v4 format",
    })
    .describe("Unique identifier of the task to be verified, must be a valid task ID existing in the system"),
  summary: z
    .string()
    .min(30, {
      message: "Minimum 30 characters",
    })
    .describe(
      "When score is higher than or equal to 80 points, represents task completion summary with concise description of implementation results and important decisions. When score is lower than 80 points, represents description of missing or parts that need correction, minimum 30 characters"
    ),
  score: z
    .number()
    .min(0, { message: "Score cannot be less than 0" })
    .max(100, { message: "Score cannot be greater than 100" })
    .describe("Score for the task, task is automatically completed when score equals or exceeds 80 points"),
});

export async function verifyTask({
  taskId,
  summary,
  score,
}: z.infer<typeof verifyTaskSchema>) {
  const task = await getTaskById(taskId);

  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統錯誤\n\n找不到ID為 \`${taskId}\` 的任務。請使用「list_tasks」工具確認有效的任務ID後再試。`,
        },
      ],
      isError: true,
    };
  }

  if (task.status !== TaskStatus.IN_PROGRESS) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 狀態錯誤\n\n任務 "${task.name}" (ID: \`${task.id}\`) 當前狀態為 "${task.status}"，不處於進行中狀態，無法進行檢驗。\n\n只有狀態為「進行中」的任務才能進行檢驗。請先使用「execute_task」工具開始任務執行。`,
        },
      ],
      isError: true,
    };
  }

  if (score >= 80) {
    // 更新任務狀態為已完成，並添加摘要
    await updateTaskSummary(taskId, summary);
    await updateTaskStatus(taskId, TaskStatus.COMPLETED);
  }

  // 使用prompt生成器獲取最終prompt
  const prompt = getVerifyTaskPrompt({ task, score, summary });

  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
  };
}
