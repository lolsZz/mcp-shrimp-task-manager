import { z } from "zod";
import {
  getAllTasks,
  batchCreateOrUpdateTasks,
  clearAllTasks as modelClearAllTasks,
} from "../../models/taskModel.js";
import { RelatedFileType, Task } from "../../types/index.js";
import { getSplitTasksPrompt } from "../../prompts/index.js";

// Task splitting tool (raw)
export const splitTasksRawSchema = z.object({
  updateMode: z
    .enum(["append", "overwrite", "selective", "clearAllTasks"])
    .describe(
      "Task update mode selection: 'append'(keep all existing tasks and add new tasks), 'overwrite'(clear all uncompleted tasks and completely replace, keep completed tasks), 'selective'(smart update: match and update existing tasks by task name, keep tasks not in list, recommended for task fine-tuning), 'clearAllTasks'(clear all tasks and create backup).\nDefault is 'clearAllTasks' mode, only use other modes when user requests changes or modification of plan content"
    ),
  tasksRaw: z
    .string()
    .describe(
      "Structured task list, each task should maintain atomicity and have clear completion criteria, avoid overly simple tasks, simple modifications can be integrated with other tasks, avoid too many tasks, example: [{name: 'Concise and clear task name, should clearly express task purpose', description: 'Detailed task description, including implementation points, technical details and acceptance criteria', implementationGuide: 'Specific implementation methods and steps for this particular task, please refer to previous analysis results and provide concise pseudocode', notes: 'Supplementary notes, special handling requirements or implementation suggestions (optional)', dependencies: ['Complete name of prerequisite tasks this task depends on'], relatedFiles: [{path: 'file path', type: 'file type (TO_MODIFY: to be modified, REFERENCE: reference material, CREATE: to be created, DEPENDENCY: dependency file, OTHER: other)', description: 'file description', lineStart: 1, lineEnd: 100}], verificationCriteria: 'Verification criteria and inspection methods for this specific task'}, {name: 'Task 2', description: 'Task 2 description', implementationGuide: 'Task 2 implementation method', notes: 'Supplementary notes, special handling requirements or implementation suggestions (optional)', dependencies: ['Task 1'], relatedFiles: [{path: 'file path', type: 'file type (TO_MODIFY: to be modified, REFERENCE: reference material, CREATE: to be created, DEPENDENCY: dependency file, OTHER: other)', description: 'file description', lineStart: 1, lineEnd: 100}], verificationCriteria: 'Verification criteria and inspection methods for this specific task'}]"
    ),
  globalAnalysisResult: z
    .string()
    .optional()
    .describe("Task final objective, from previous analysis applicable to all tasks common parts"),
});

const tasksSchema = z
  .array(
    z.object({
      name: z
        .string()
        .max(100, {
          message: "Task name is too long, please limit to within 100 characters",
        })
        .describe("Concise and clear task name, should clearly express task purpose"),
      description: z
        .string()
        .min(10, {
          message: "Task description is too short, please provide more detailed content to ensure understanding",
        })
        .describe("Detailed task description, including implementation points, technical details and acceptance criteria"),
      implementationGuide: z
        .string()
        .describe(
          "Specific implementation methods and steps for this particular task, please refer to previous analysis results and provide concise pseudocode"
        ),
      dependencies: z
        .array(z.string())
        .optional()
        .describe(
          "List of prerequisite task IDs or task names that this task depends on, supports two reference methods, name reference is more intuitive, is a string array"
        ),
      notes: z
        .string()
        .optional()
        .describe("Supplementary notes, special handling requirements or implementation suggestions (optional)"),
      relatedFiles: z
        .array(
          z.object({
            path: z
              .string()
              .min(1, {
                message: "File path cannot be empty",
              })
              .describe("File path, can be relative to project root directory or absolute path"),
            type: z
              .nativeEnum(RelatedFileType)
              .describe(
                "File type (TO_MODIFY: to be modified, REFERENCE: reference material, CREATE: to be created, DEPENDENCY: dependency file, OTHER: other)"
              ),
            description: z
              .string()
              .min(1, {
                message: "File description cannot be empty",
              })
              .describe("File description, used to explain the purpose and content of the file"),
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
      verificationCriteria: z
        .string()
        .optional()
        .describe("Verification criteria and inspection methods for this specific task"),
    })
  )
  .min(1, {
    message: "Please provide at least one task",
  })
  .describe(
    "Structured task list, each task should maintain atomicity and have clear completion criteria, avoid overly simple tasks, simple modifications can be integrated with other tasks, avoid too many tasks"
  );

export async function splitTasksRaw({
  updateMode,
  tasksRaw,
  globalAnalysisResult,
}: z.infer<typeof splitTasksRawSchema>) {
  let tasks: Task[] = [];
  try {
    tasks = JSON.parse(tasksRaw);
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            "tasksRaw 參數格式錯誤，請確保格式正確，請嘗試修正錯誤，如果文本太長無法順利修復請分批呼叫，這樣可以避免訊息過長導致不好修正問題，錯誤訊息：" +
            (error instanceof Error ? error.message : String(error)),
        },
      ],
    };
  }

  // 使用 tasksSchema 驗證 tasks
  const tasksResult = tasksSchema.safeParse(tasks);
  if (!tasksResult.success) {
    // 返回錯誤訊息
    return {
      content: [
        {
          type: "text" as const,
          text:
            "tasks 參數格式錯誤，請確保格式正確，錯誤訊息：" +
            tasksResult.error.message,
        },
      ],
    };
  }

  try {
    // 檢查 tasks 裡面的 name 是否有重複
    const nameSet = new Set();
    for (const task of tasks) {
      if (nameSet.has(task.name)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "tasks 參數中存在重複的任務名稱，請確保每個任務名稱是唯一的",
            },
          ],
        };
      }
      nameSet.add(task.name);
    }

    // 根據不同的更新模式處理任務
    let message = "";
    let actionSuccess = true;
    let backupFile = null;
    let createdTasks: Task[] = [];
    let allTasks: Task[] = [];

    // 將任務資料轉換為符合batchCreateOrUpdateTasks的格式
    const convertedTasks = tasks.map((task) => ({
      name: task.name,
      description: task.description,
      notes: task.notes,
      dependencies: task.dependencies as unknown as string[],
      implementationGuide: task.implementationGuide,
      verificationCriteria: task.verificationCriteria,
      relatedFiles: task.relatedFiles?.map((file) => ({
        path: file.path,
        type: file.type as RelatedFileType,
        description: file.description,
        lineStart: file.lineStart,
        lineEnd: file.lineEnd,
      })),
    }));

    // 處理 clearAllTasks 模式
    if (updateMode === "clearAllTasks") {
      const clearResult = await modelClearAllTasks();

      if (clearResult.success) {
        message = clearResult.message;
        backupFile = clearResult.backupFile;

        try {
          // 清空任務後再創建新任務
          createdTasks = await batchCreateOrUpdateTasks(
            convertedTasks,
            "append",
            globalAnalysisResult
          );
          message += `\n成功創建了 ${createdTasks.length} 個新任務。`;
        } catch (error) {
          actionSuccess = false;
          message += `\n創建新任務時發生錯誤: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      } else {
        actionSuccess = false;
        message = clearResult.message;
      }
    } else {
      // 對於其他模式，直接使用 batchCreateOrUpdateTasks
      try {
        createdTasks = await batchCreateOrUpdateTasks(
          convertedTasks,
          updateMode,
          globalAnalysisResult
        );

        // 根據不同的更新模式生成消息
        switch (updateMode) {
          case "append":
            message = `成功追加了 ${createdTasks.length} 個新任務。`;
            break;
          case "overwrite":
            message = `成功清除未完成任務並創建了 ${createdTasks.length} 個新任務。`;
            break;
          case "selective":
            message = `成功選擇性更新/創建了 ${createdTasks.length} 個任務。`;
            break;
        }
      } catch (error) {
        actionSuccess = false;
        message = `任務創建失敗：${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }

    // 獲取所有任務用於顯示依賴關係
    try {
      allTasks = await getAllTasks();
    } catch (error) {
      allTasks = [...createdTasks]; // 如果獲取失敗，至少使用剛創建的任務
    }

    // 使用prompt生成器獲取最終prompt
    const prompt = getSplitTasksPrompt({
      updateMode,
      createdTasks,
      allTasks,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: prompt,
        },
      ],
      ephemeral: {
        taskCreationResult: {
          success: actionSuccess,
          message,
          backupFilePath: backupFile,
        },
      },
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            "執行任務拆分時發生錯誤: " +
            (error instanceof Error ? error.message : String(error)),
        },
      ],
    };
  }
}
