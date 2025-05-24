import { z } from "zod";
import { searchTasksWithCommand } from "../../models/taskModel.js";
import { getQueryTaskPrompt } from "../../prompts/index.js";

// Query task tool
export const queryTaskSchema = z.object({
  query: z
    .string()
    .min(1, {
      message: "Query content cannot be empty, please provide task ID or search keywords",
    })
    .describe("Search query text, can be task ID or multiple keywords (space separated)"),
  isId: z
    .boolean()
    .optional()
    .default(false)
    .describe("Specify whether it is ID query mode, default is false (keyword mode)"),
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe("Page number, default is page 1"),
  pageSize: z
    .number()
    .int()
    .positive()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe("Number of tasks displayed per page, default is 5, maximum 20"),
});

export async function queryTask({
  query,
  isId = false,
  page = 1,
  pageSize = 3,
}: z.infer<typeof queryTaskSchema>) {
  try {
    // 使用系統指令搜尋函數
    const results = await searchTasksWithCommand(query, isId, page, pageSize);

    // 使用prompt生成器獲取最終prompt
    const prompt = getQueryTaskPrompt({
      query,
      isId,
      tasks: results.tasks,
      totalTasks: results.pagination.totalResults,
      page: results.pagination.currentPage,
      pageSize,
      totalPages: results.pagination.totalPages,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: prompt,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## 系統錯誤\n\n查詢任務時發生錯誤: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
}
