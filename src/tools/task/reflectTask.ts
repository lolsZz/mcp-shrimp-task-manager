import { z } from "zod";
import { getReflectTaskPrompt } from "../../prompts/index.js";

// Task reflection tool
export const reflectTaskSchema = z.object({
  summary: z
    .string()
    .min(10, {
      message: "Task summary must be at least 10 characters, please provide more detailed description to ensure task objectives are clear",
    })
    .describe("Structured task summary, consistent with analysis phase to ensure continuity"),
  analysis: z
    .string()
    .min(100, {
      message: "Technical analysis content is not detailed enough, please provide complete technical analysis and implementation plan",
    })
    .describe(
      "Complete detailed technical analysis results, including all technical details, dependency components and implementation plans, if code needs to be provided use pseudocode format and only provide high-level logic flow and key steps avoiding complete code"
    ),
});

export async function reflectTask({
  summary,
  analysis,
}: z.infer<typeof reflectTaskSchema>) {
  // Use prompt generator to get final prompt
  const prompt = getReflectTaskPrompt({
    summary,
    analysis,
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
