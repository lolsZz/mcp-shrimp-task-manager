import { RelatedFile, RelatedFileType } from "../types/index.js";

/**
 * Generate content summary for task-related files
 *
 * This function generates formatted summaries based on the provided RelatedFile object list, without actually reading file contents.
 * This is a lightweight implementation that only generates formatted summaries based on file metadata (such as paths, types, descriptions, etc.),
 * suitable for scenarios that need to provide file context information without accessing actual file contents.
 *
 * @param relatedFiles Related file list - Array of RelatedFile objects containing file paths, types, descriptions and other information
 * @param maxTotalLength Maximum total length of summary content - Controls the total character count of generated summaries to avoid oversized return content
 * @returns Object containing two fields:
 *   - content: Detailed file information, including basic information and hint messages for each file
 *   - summary: Concise file list overview, suitable for quick browsing
 */
export async function loadTaskRelatedFiles(
  relatedFiles: RelatedFile[],
  maxTotalLength: number = 15000 // Control the total length of generated content
): Promise<{ content: string; summary: string }> {
  if (!relatedFiles || relatedFiles.length === 0) {
    return {
      content: "",
      summary: "No related files",
    };
  }

  let totalContent = "";
  let filesSummary = `## Related File Content Summary (Total: ${relatedFiles.length} files)\n\n`;
  let totalLength = 0;

  // Sort by file type priority (process files to be modified first)
  const priorityOrder: Record<RelatedFileType, number> = {
    [RelatedFileType.TO_MODIFY]: 1,
    [RelatedFileType.REFERENCE]: 2,
    [RelatedFileType.DEPENDENCY]: 3,
    [RelatedFileType.CREATE]: 4,
    [RelatedFileType.OTHER]: 5,
  };

  const sortedFiles = [...relatedFiles].sort(
    (a, b) => priorityOrder[a.type] - priorityOrder[b.type]
  );

  // Process each file
  for (const file of sortedFiles) {
    if (totalLength >= maxTotalLength) {
      filesSummary += `\n### Context length limit reached, some files not loaded\n`;
      break;
    }

    // Generate file basic information
    const fileInfo = generateFileInfo(file);

    // Add to total content
    const fileHeader = `\n### ${file.type}: ${file.path}${
      file.description ? ` - ${file.description}` : ""
    }${
      file.lineStart && file.lineEnd
        ? ` (lines ${file.lineStart}-${file.lineEnd})`
        : ""
    }\n\n`;

    totalContent += fileHeader + "```\n" + fileInfo + "\n```\n\n";
    filesSummary += `- **${file.path}**${
      file.description ? ` - ${file.description}` : ""
    } (${fileInfo.length} characters)\n`;

    totalLength += fileInfo.length + fileHeader.length + 8; // 8 for "```\n" and "\n```"
  }

  return {
    content: totalContent,
    summary: filesSummary,
  };
}

/**
 * Generate file basic information summary
 *
 * Generate formatted information summary based on file metadata, including file path, type and related hints.
 * Does not read actual file contents, only generates information based on the provided RelatedFile object.
 *
 * @param file Related file object - Contains basic information such as file path, type, description
 * @returns Formatted file information summary text
 */
function generateFileInfo(file: RelatedFile): string {
  let fileInfo = `File: ${file.path}\n`;
  fileInfo += `Type: ${file.type}\n`;

  if (file.description) {
    fileInfo += `Description: ${file.description}\n`;
  }

  if (file.lineStart && file.lineEnd) {
    fileInfo += `Line range: ${file.lineStart}-${file.lineEnd}\n`;
  }

  fileInfo += `To view actual content, please check the file directly: ${file.path}\n`;

  return fileInfo;
}
