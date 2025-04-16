import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { Transport as McpTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  checkGitRepo,
  getCommitPrompt,
  getGitDiff,
  validateConventionalCommitHeader, // Import the new validator
} from "./utils.js";
import pkg from "./../package.json" with { type: "json" };

// Promisify exec for cleaner async/await usage
const execPromise = promisify(exec);

// Server state
interface ServerState {
  projectPath: string | null;
  isValidGitRepo: boolean;
}

const state: ServerState = {
  projectPath: null,
  isValidGitRepo: false,
};

// Create a function to create and configure the MCP server instance
export function createServer(): McpServer {
  // Initialize the MCP Server
  const server = new McpServer({
    name: "mcp-commit-helper",
    version: pkg.version,
  });

  // --- Tool: Initialize Project Path ---
  server.tool(
    "initialize-project",
    // Input schema: requires a non-empty string path
    { path: z.string().min(1, "Path cannot be empty") },
    // Handler function
    async ({ path: projectPath }) => {
      try {
        // Resolve the provided path to an absolute path
        const resolvedPath = path.resolve(projectPath);

        // Check if path exists and is a directory
        try {
          const stats = await fs.stat(resolvedPath);
          if (!stats.isDirectory()) {
            throw new Error(`The path "${resolvedPath}" is not a directory.`);
          }
        } catch (error: any) {
          // Handle specific file system errors gracefully
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

        // Check if the directory is a git repository
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

        // Update server state if checks pass
        state.projectPath = resolvedPath;
        state.isValidGitRepo = true;

        return {
          content: [
            {
              type: "text",
              text: `Successfully initialized git project at: ${resolvedPath}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Unexpected error initializing project: ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- Tool: Get Git Diff ---
  server.tool(
    "get-git-diff",
    // No input parameters needed
    {},
    // Handler function
    async () => {
      // Check if project is initialized
      if (!state.projectPath || !state.isValidGitRepo) {
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
        // Call the helper function to get the diff
        const diff = await getGitDiff(state.projectPath);
        // Check if the diff function returned an error message
        if (diff.startsWith("Error retrieving git diff:")) {
          return {
            content: [{ type: "text", text: diff }], // Pass the specific error message
            isError: true,
          };
        }
        // Return the diff content
        return {
          content: [{ type: "text", text: diff }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Unexpected error getting git diff: ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- Tool: Generate Commit Message Prompt (Generic) ---
  // This tool now just generates the prompt FOR the LLM.
  // The LLM will then call create-commit with the generated message.
  server.tool(
    "generate-commit-prompt", // Renamed for clarity
    // Input schema: optional scope string
    { scope: z.string().optional() },
    // Handler function
    async ({ scope }) => {
      // Check if project is initialized
      if (!state.projectPath || !state.isValidGitRepo) {
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
        // Get the current git diff
        const diff = await getGitDiff(state.projectPath);

        // Handle case where there are no changes
        if (diff === "No changes detected") {
          return {
            content: [
              {
                type: "text",
                text: "No changes detected to generate a commit message prompt for.",
              },
            ],
            // isError: false // Not technically an error
          };
        }
        // Handle case where getting diff failed
        if (diff.startsWith("Error retrieving git diff:")) {
          return {
            content: [{ type: "text", text: diff }], // Pass the specific error message
            isError: true,
          };
        }

        // Get the appropriate commit prompt template (generic one)
        const promptTemplate = getCommitPrompt();

        // Determine the scope instruction based on the provided scope
        const scopeInstruction = scope
          ? `Use the provided scope "${scope}".`
          : `Determine an appropriate scope based on the changes if applicable, otherwise omit the scope.`;

        // Format the prompt with the diff and scope information
        const prompt = promptTemplate
          .replace("{diff}", diff)
          .replace("{scope_instruction}", scopeInstruction); // Use the correct placeholder

        // Return the formatted prompt to be sent to the LLM
        return {
          content: [
            {
              type: "text",
              text: prompt, // This is the prompt for the LLM
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Unexpected error preparing commit message prompt: ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- Tool: Create Git Commit ---
  server.tool(
    "create-commit",
    // Input schema: requires non-empty message, optional addAll, optional validate
    {
      message: z.string().min(1, "Commit message cannot be empty"),
      addAll: z.boolean().optional().default(false), // Default addAll to false
      validate: z.boolean().optional().default(true), // Default validate to true
    },
    // Handler function
    async ({ message, addAll, validate }) => {
      // Check if project is initialized
      if (!state.projectPath || !state.isValidGitRepo) {
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

      // --- Optional Validation Step ---
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
      // --- End Validation Step ---

      try {
        // Stage all changes if addAll flag is true
        if (addAll) {
          // Use 'git add -A' to stage new, modified, and deleted files
          await execPromise("git add -A", {
            cwd: state.projectPath,
          });
        }

        // --- Multi-line commit message handling ---
        // Trim whitespace, then split message into lines
        const messageLines = message.trim().split("\n");
        // First line is the subject
        const subject = messageLines[0];
        // Join the remaining lines (if any) for the body, preserving internal newlines
        const body = messageLines.slice(1).join("\n");

        // Helper function to escape double quotes for shell command safety
        const escapeQuotes = (str: string) => str.replace(/"/g, '\\"');

        // Construct the git commit command using multiple -m flags for subject and body
        let commitCommand = `git commit -m "${escapeQuotes(subject)}"`;
        // Add the body using a second -m flag only if the body is not empty
        if (body) {
          commitCommand += ` -m "${escapeQuotes(body)}"`;
        }
        // --- End of multi-line handling ---

        // Execute the git commit command
        const { stdout, stderr } = await execPromise(commitCommand, {
          cwd: state.projectPath,
        });

        // Return success message including stdout and any stderr
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
        // Provide more specific user-friendly feedback for common Git errors
        let errorMessage = `Error creating commit: ${(error as Error).message}`;
        if (error.stderr) {
          const stderrString = error.stderr.toString(); // Ensure it's a string
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
            errorMessage += `\nDetails: ${stderrString.trim()}`; // Include stderr details for other errors
          }
        }

        return {
          content: [
            {
              type: "text",
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Return the configured server instance
  return server;
}

// --- Server Execution ---

// Function to run the server with a given transport mechanism
export async function runServer(transport: McpTransport): Promise<void> {
  const server = createServer();
  await server.connect(transport);
}
