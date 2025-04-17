import { ToolCommandBuilder } from "../common/ToolCommandBuilder.js";
import { stateService } from "../common/StateService.js";
import { getGitDiff, getCommitPrompt } from "../utils.js";
import { z } from "zod";

export const data = new ToolCommandBuilder()
  .setName("generate-commit-prompt")
  .setDescription(
    "Generates a commit message prompt based on current Git diff."
  )
  .setParameters({ scope: z.string().optional() });

export async function execute({ scope }: { scope?: string }) {
  const projectPath = stateService.projectPath;
  const isValidGitRepo = stateService.isValidGitRepo;

  if (!projectPath || !isValidGitRepo) {
    return {
      content: [
        {
          type: "text",
          text: "Error: Project not initialized or not a valid Git repository. Please use initialize-project tool first.",
        },
      ],
      isError: true,
    };
  }

  try {
    const diff = await getGitDiff(projectPath);
    if (diff === "No changes detected") {
      return {
        content: [
          {
            type: "text",
            text: "No changes detected to generate a commit message prompt for.",
          },
        ],
      };
    }
    if (diff.startsWith("Error retrieving git diff:")) {
      return { content: [{ type: "text", text: diff }], isError: true };
    }

    const promptTemplate = getCommitPrompt();
    const scopeInstruction = scope
      ? `Use the provided scope "${scope}".`
      : `Determine an appropriate scope based on the changes if applicable, otherwise omit the scope.`;

    const prompt = promptTemplate
      .replace("{diff}", diff)
      .replace("{scope_instruction}", scopeInstruction);
    return { content: [{ type: "text", text: prompt }] };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Unexpected error preparing commit message prompt: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
