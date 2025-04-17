import { ToolCommandBuilder } from "../common/ToolCommandBuilder.js";
import { stateService } from "../common/StateService.js";
import { getGitDiff } from "../utils.js";

export const data = new ToolCommandBuilder()
  .setName("get-git-diff")
  .setDescription(
    "Retrieves the current Git diff for the initialized project."
  );

export async function execute() {
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
    if (diff.startsWith("Error retrieving git diff:")) {
      return { content: [{ type: "text", text: diff }], isError: true };
    }
    return { content: [{ type: "text", text: diff }] };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Unexpected error getting git diff: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
