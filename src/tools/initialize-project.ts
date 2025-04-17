import path from "path";
import fs from "fs/promises";
import { z } from "zod";
import { ToolCommandBuilder } from "../common/ToolCommandBuilder.js";
import { checkGitRepo } from "../utils.js";
import { stateService } from "../common/StateService.js";

export const data = new ToolCommandBuilder()
  .setName("initialize-project")
  .setDescription("Initializes a git project at the given path")
  .setParameters({ path: z.string().min(1, "Path cannot be empty") });

export async function execute({ path: projectPath }: { path: string }) {
  try {
    const resolvedPath = path.resolve(projectPath);
    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error(`The path "${resolvedPath}" is not a directory.`);
      }
    } catch (error: any) {
      const errorMessage =
        error.code === "ENOENT"
          ? `The path "${resolvedPath}" does not exist.`
          : error.code === "ENOTDIR"
          ? `The path "${resolvedPath}" is not a directory.`
          : `Error accessing path "${resolvedPath}": ${error.message}`;
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }

    const isGitRepo = await checkGitRepo(resolvedPath);
    if (!isGitRepo) {
      return {
        content: [
          {
            type: "text",
            text: `Error: The path "${resolvedPath}" is not a git repository. Initialize with 'git init' if needed.`,
          },
        ],
        isError: true,
      };
    }

    stateService.initializeProject(resolvedPath, isGitRepo);
    return {
      content: [
        {
          type: "text",
          text: `Successfully initialized git project at: ${resolvedPath}`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Unexpected error initializing project: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
}
