import { z } from "zod";
import { getAnalyzeTaskPrompt } from "../../prompts/index.js";

// Task analysis tool
export const analyzeTaskSchema = z.object({
  summary: z
    .string()
    .min(10, {
      message: "Task summary must be at least 10 characters, please provide more detailed description to ensure task objectives are clear",
    })
    .describe(
      "Structured task summary, including task objectives, scope and key technical challenges, minimum 10 characters"
    ),
  initialConcept: z
    .string()
    .min(50, {
      message:
        "Initial solution concept must be at least 50 characters, please provide more detailed content to ensure technical solution is clear",
    })
    .describe(
      "Minimum 50 characters initial solution concept, including technical solution, architecture design and implementation strategy, if code needs to be provided use pseudocode format and only provide high-level logic flow and key steps avoiding complete code"
    ),
  previousAnalysis: z
    .string()
    .optional()
    .describe("Previous iteration analysis results, used for continuous improvement of solutions (only required when re-analyzing)"),
});

export async function analyzeTask({
  summary,
  initialConcept,
  previousAnalysis,
}: z.infer<typeof analyzeTaskSchema>) {
  // 使用prompt生成器獲取最終prompt
  const prompt = getAnalyzeTaskPrompt({
    summary,
    initialConcept,
    previousAnalysis,
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
