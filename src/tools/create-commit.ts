import { ToolCommandBuilder } from "../common/ToolCommandBuilder.js";
import { stateService } from "../common/StateService.js";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { validateConventionalCommitHeader } from "../utils.js";

const execPromise = promisify(exec);

export const data = new ToolCommandBuilder()
  .setName("create-commit")
  .setDescription("Creates a Git commit with the specified message.")
  .setParameters({
    message: z.string().min(1, "Commit message cannot be empty"),
    addAll: z.boolean().optional().default(false),
    validate: z.boolean().optional().default(true),
  });

export async function execute({
  message,
  addAll,
  validate,
}: {
  message: string;
  addAll?: boolean;
  validate?: boolean;
}) {
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

  if (validate) {
    const validationResult = validateConventionalCommitHeader(message);
    if (!validationResult.isValid) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Commit message validation failed. ${validationResult.error} Provided message:\n---\n${message}\n---\nTo commit anyway, use 'validate: false'.`,
          },
        ],
        isError: true,
      };
    }
  }

  try {
    if (addAll) await execPromise("git add -A", { cwd: projectPath });

    const messageLines = message.trim().split("\n");
    const subject = messageLines[0];
    const body = messageLines.slice(1).join("\n");
    const escapeQuotes = (str: string) => str.replace(/"/g, '\\"');
    let commitCommand = `git commit -m "${escapeQuotes(subject)}"`;
    if (body) commitCommand += ` -m "${escapeQuotes(body)}"`;

    const { stdout, stderr } = await execPromise(commitCommand, {
      cwd: projectPath,
    });

    return {
      content: [
        {
          type: "text",
          text: `Successfully created commit:\n${stdout.trim()}\n${
            stderr ? `\nGit Messages:\n${stderr.trim()}` : ""
          }`,
        },
      ],
    };
  } catch (error: any) {
    let errorMessage = `Error creating commit: ${error.message}`;
    if (error.stderr) {
      const stderrString = error.stderr.toString();
      if (stderrString.includes("nothing to commit")) {
        errorMessage =
          "Error: No changes were staged for commit. Use 'addAll: true' or stage files manually before committing.";
      } else if (stderrString.includes("Please tell me who you are")) {
        errorMessage =
          "Error: Git user identity (name and email) is not configured. Please configure it using 'git config --global user.name \"Your Name\"' and 'git config --global user.email \"your.email@example.com\"'.";
      } else if (
        stderrString.includes("changes not staged for commit") &&
        !addAll
      ) {
        errorMessage =
          "Error: There are unstaged changes. Use 'addAll: true' to include them or stage them manually before committing.";
      } else {
        errorMessage += `\nDetails: ${stderrString.trim()}`;
      }
    }
    return { content: [{ type: "text", text: errorMessage }], isError: true };
  }
}
