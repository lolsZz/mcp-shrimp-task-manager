import { z } from "zod";
import { UUID_V4_REGEX } from "../../utils/regex.js";
import {
  getTaskById,
  updateTaskContent as modelUpdateTaskContent,
} from "../../models/taskModel.js";
import { RelatedFileType } from "../../types/index.js";
import { getUpdateTaskContentPrompt } from "../../prompts/index.js";

// Update task content tool
export const updateTaskContentSchema = z.object({
  taskId: z
    .string()
    .regex(UUID_V4_REGEX, {
      message: "Invalid task ID format, please provide valid UUID v4 format",
    })
    .describe("Unique identifier of the task to be updated, must be an existing and uncompleted task ID in the system"),
  name: z.string().optional().describe("New name for the task (optional)"),
  description: z.string().optional().describe("New description content for the task (optional)"),
  notes: z.string().optional().describe("New supplementary notes for the task (optional)"),
  dependencies: z
    .array(z.string())
    .optional()
    .describe("New dependency relationships for the task (optional)"),
  relatedFiles: z
    .array(
      z.object({
        path: z
          .string()
          .min(1, { message: "File path cannot be empty, please provide valid file path" })
          .describe("File path, can be relative to project root directory or absolute path"),
        type: z
          .nativeEnum(RelatedFileType)
          .describe(
            "Relationship type between file and task (TO_MODIFY, REFERENCE, CREATE, DEPENDENCY, OTHER)"
          ),
        description: z.string().optional().describe("Supplementary description for the file (optional)"),
        lineStart: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Starting line of related code block (optional)"),
        lineEnd: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Ending line of related code block (optional)"),
      })
    )
    .optional()
    .describe(
      "List of files related to the task, used to record code files, reference materials, files to be created, etc. related to the task (optional)"
    ),
  implementationGuide: z
    .string()
    .optional()
    .describe("New implementation guide for the task (optional)"),
  verificationCriteria: z
    .string()
    .optional()
    .describe("New verification criteria for the task (optional)"),
});

export async function updateTaskContent({
  taskId,
  name,
  description,
  notes,
  relatedFiles,
  dependencies,
  implementationGuide,
  verificationCriteria,
}: z.infer<typeof updateTaskContentSchema>) {
  if (relatedFiles) {
    for (const file of relatedFiles) {
      if (
        (file.lineStart && !file.lineEnd) ||
        (!file.lineStart && file.lineEnd) ||
        (file.lineStart && file.lineEnd && file.lineStart > file.lineEnd)
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: getUpdateTaskContentPrompt({
                taskId,
                validationError:
                  "行號設置無效：必須同時設置起始行和結束行，且起始行必須小於結束行",
              }),
            },
          ],
        };
      }
    }
  }

  if (
    !(
      name ||
      description ||
      notes ||
      dependencies ||
      implementationGuide ||
      verificationCriteria ||
      relatedFiles
    )
  ) {
    return {
      content: [
        {
          type: "text" as const,
          text: getUpdateTaskContentPrompt({
            taskId,
            emptyUpdate: true,
          }),
        },
      ],
    };
  }

  // 獲取任務以檢查它是否存在
  const task = await getTaskById(taskId);

  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: getUpdateTaskContentPrompt({
            taskId,
          }),
        },
      ],
      isError: true,
    };
  }

  // 記錄要更新的任務和內容
  let updateSummary = `準備更新任務：${task.name} (ID: ${task.id})`;
  if (name) updateSummary += `，新名稱：${name}`;
  if (description) updateSummary += `，更新描述`;
  if (notes) updateSummary += `，更新注記`;
  if (relatedFiles)
    updateSummary += `，更新相關文件 (${relatedFiles.length} 個)`;
  if (dependencies)
    updateSummary += `，更新依賴關係 (${dependencies.length} 個)`;
  if (implementationGuide) updateSummary += `，更新實現指南`;
  if (verificationCriteria) updateSummary += `，更新驗證標準`;

  // 執行更新操作
  const result = await modelUpdateTaskContent(taskId, {
    name,
    description,
    notes,
    relatedFiles,
    dependencies,
    implementationGuide,
    verificationCriteria,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: getUpdateTaskContentPrompt({
          taskId,
          task,
          success: result.success,
          message: result.message,
          updatedTask: result.task,
        }),
      },
    ],
    isError: !result.success,
  };
}
