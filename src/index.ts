import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { Transport as McpTransport } from "@modelcontextprotocol/sdk/shared/transport.js";

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

// Default commit message prompt template
const DEFAULT_COMMIT_PROMPT = `Based on the following changes {scope}please suggest a commit message:

{diff}`;

// Default conventional commit prompt template
const DEFAULT_CONVENTIONAL_COMMIT_PROMPT = `Based on the following git diff, please write a commit message following the Conventional Commits format (type(scope): description).

Types include: feat, fix, docs, style, refactor, test, chore, etc.
{scope_instruction}

Focus on being concise but descriptive, using imperative mood.
Include a brief description of the changes after the header if helpful.

Here's the git diff:

{diff}`;

// Get commit prompt template from environment variable or use default
function getCommitPrompt(): string {
  return process.env.MCP_COMMIT_PROMPT || DEFAULT_COMMIT_PROMPT;
}

// Get conventional commit prompt template from environment variable or use default
function getConventionalCommitPrompt(): string {
  return process.env.MCP_CONVENTIONAL_COMMIT_PROMPT || DEFAULT_CONVENTIONAL_COMMIT_PROMPT;
}

// Helper functions
async function checkGitRepo(projectPath: string): Promise<boolean> {
  try {
    await execPromise("git rev-parse --is-inside-work-tree", {
      cwd: projectPath,
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function getGitDiff(projectPath: string): Promise<string> {
  try {
    // Get staged changes first
    const { stdout: stagedDiff } = await execPromise("git diff --staged", {
      cwd: projectPath,
    });

    // Get unstaged changes
    const { stdout: unstagedDiff } = await execPromise("git diff", {
      cwd: projectPath,
    });

    // Get untracked files
    const { stdout: untrackedFiles } = await execPromise(
      "git ls-files --others --exclude-standard",
      {
        cwd: projectPath,
      }
    );

    let result = "";

    if (stagedDiff.trim()) {
      result += "=== STAGED CHANGES ===\n" + stagedDiff + "\n\n";
    }

    if (unstagedDiff.trim()) {
      result += "=== UNSTAGED CHANGES ===\n" + unstagedDiff + "\n\n";
    }

    if (untrackedFiles.trim()) {
      result +=
        "=== UNTRACKED FILES ===\n" +
        untrackedFiles.split("\n").join("\n") +
        "\n";
    }

    return result || "No changes detected";
  } catch (error) {
    console.error("Error getting git diff:", error);
    return "Error retrieving git diff";
  }
}

// Create a function to create and configure the server
export function createServer(): McpServer {
  // Create the MCP Server
  const server = new McpServer({
    name: "mcp-commit-helper",
    version: "1.0.0",
  });

  // Tool to initialize project path
  server.tool(
    "initialize-project",
    { path: z.string() },
    async ({ path: projectPath }) => {
      try {
        // Resolve and validate the path
        const resolvedPath = path.resolve(projectPath);

        // Check if path exists
        try {
          await fs.access(resolvedPath);
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: The path "${resolvedPath}" does not exist or is not accessible.`,
              },
            ],
            isError: true,
          };
        }

        // Check if it's a git repository
        const isGitRepo = await checkGitRepo(resolvedPath);
        if (!isGitRepo) {
          return {
            content: [
              {
                type: "text",
                text: `Error: The path "${resolvedPath}" is not a git repository.`,
              },
            ],
            isError: true,
          };
        }

        // Update server state
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
        console.error("Error initializing project:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error initializing project: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool to get git diff
  server.tool("get-git-diff", {}, async () => {
    if (!state.projectPath || !state.isValidGitRepo) {
      return {
        content: [
          {
            type: "text",
            text: "Error: Project not initialized. Please use initialize-project tool first.",
          },
        ],
        isError: true,
      };
    }

    try {
      const diff = await getGitDiff(state.projectPath);
      return {
        content: [{ type: "text", text: diff }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting git diff: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Tool to generate commit message
  server.tool(
    "generate-commit-message",
    { scope: z.string().optional() },
    async ({ scope }) => {
      if (!state.projectPath || !state.isValidGitRepo) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Project not initialized. Please use initialize-project tool first.",
            },
          ],
          isError: true,
        };
      }

      try {
        const diff = await getGitDiff(state.projectPath);

        if (diff === "No changes detected") {
          return {
            content: [
              {
                type: "text",
                text: "No changes detected to create a commit message for.",
              },
            ],
          };
        }

        // Get the commit prompt template
        const promptTemplate = getCommitPrompt();
        
        // Format the prompt with the diff and scope
        const scopeInfo = scope ? `with scope "${scope}" ` : "";
        const prompt = promptTemplate
          .replace('{diff}', diff)
          .replace('{scope}', scopeInfo);

        return {
          content: [
            {
              type: "text",
              text: prompt,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating commit message: ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool to create a commit with the provided message
  server.tool(
    "create-commit", 
    { 
      message: z.string(),
      addAll: z.boolean().optional().default(false)
    }, 
    async ({ message, addAll }) => {
      if (!state.projectPath || !state.isValidGitRepo) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Project not initialized. Please use initialize-project tool first.",
            },
          ],
          isError: true,
        };
      }

      try {
        // If addAll is true, stage all changes first
        if (addAll) {
          await execPromise("git add -A", {
            cwd: state.projectPath,
          });
        }

        // Create the commit
        const { stdout } = await execPromise(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
          cwd: state.projectPath,
        });

        return {
          content: [
            {
              type: "text",
              text: `Successfully created commit:\n${stdout}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating commit: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Add a prompt to help format commit messages
  server.prompt(
    "conventional-commit",
    {
      diff: z.string(),
      scope: z.string().optional(),
    },
    ({ diff, scope }) => {
      // Get the conventional commit prompt template
      const promptTemplate = getConventionalCommitPrompt();
      
      // Format the scope instruction
      const scopeInstruction = scope
        ? `Use the scope: ${scope}`
        : "Suggest an appropriate scope based on the changes.";
      
      // Format the prompt with the diff and scope instruction
      const formattedPrompt = promptTemplate
        .replace('{diff}', diff)
        .replace('{scope_instruction}', scopeInstruction);
        
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: formattedPrompt,
            },
          },
        ],
      };
    }
  );

  return server;
}

// Function to run the server with a given transport
export async function runServer(transport: McpTransport): Promise<void> {
  const server = createServer();
  await server.connect(transport);
}

// Direct execution entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const transport = new StdioServerTransport();
  runServer(transport).catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}