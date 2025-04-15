import { exec } from "child_process";
import { promisify } from "util";

// Promisify exec for cleaner async/await usage
const execPromise = promisify(exec);

// Default conventional commit prompt template, now with more detail based on v1.0.0 spec
const DEFAULT_COMMIT_PROMPT = `Please analyze the following git diff and generate a commit message strictly following the Conventional Commits specification (v1.0.0).

The commit message structure MUST be:
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]

Key elements:
1.  **Header:**
    * **<type>:** Must be one of the allowed types. Common types include:
        * \`feat\`: Introduces a new feature (correlates with SEMVER MINOR).
        * \`fix\`: Patches a bug (correlates with SEMVER PATCH).
        * Other allowed types: \`build\`, \`chore\`, \`ci\`, \`docs\`, \`style\`, \`refactor\`, \`perf\`, \`test\`.
    * **[optional scope]:** A noun within parentheses describing the section of the codebase affected (e.g., \`(parser)\`, \`(api)\`, \`(ui)\`). {scope_instruction}
    * **<description>:** Concise summary of the change in imperative, present tense (e.g., "add", "fix", "change" not "added", "fixed", "changed"). Do NOT capitalize the first letter. Do NOT end with a period.

2.  **[optional body]:**
    * Starts after the header and a single blank line.
    * Provides context, motivation, and reasoning for the change. Explain *what* and *why* vs. *how*.
    * Can contain multiple paragraphs separated by blank lines.

3.  **[optional footer(s)]:**
    * Starts after the body and a single blank line.
    * Formatted as key-value pairs like Git trailers (e.g., \`Reviewed-by: Name\`, \`Refs: #123\`).
    * **BREAKING CHANGE:** If the commit introduces a breaking API change (correlates with SEMVER MAJOR), it MUST have a footer starting with \`BREAKING CHANGE: \` followed by a description of the breaking change.
    * Alternatively or additionally, a \`!\` can be appended to the type/scope in the header (e.g., \`feat!:\` or \`fix(auth)!:\`) to indicate a BREAKING CHANGE. Include the footer description regardless.

Example of a full message:
\`\`\`
feat(auth)!: implement multi-factor authentication

Introduce TOTP-based multi-factor authentication upon login.
Users can enable this in their profile settings.

BREAKING CHANGE: User authentication endpoint now requires an MFA token if MFA is enabled for the account.
Refs: #456
Reviewed-by: Jane Doe
\`\`\`

Now, analyze the following git diff and generate the complete commit message:

{diff}
`;

// Get commit prompt template from environment variable or use default
export function getCommitPrompt(): string {
  return process.env.MCP_COMMIT_PROMPT || DEFAULT_COMMIT_PROMPT;
}

// Helper function to check if a path is a valid Git repository
export async function checkGitRepo(projectPath: string): Promise<boolean> {
  try {
    // This command succeeds if inside a Git work tree, errors otherwise
    await execPromise("git rev-parse --is-inside-work-tree", {
      cwd: projectPath,
    });
    return true;
  } catch (error) {
    // Error indicates it's not a Git repo or git command failed
    return false;
  }
}

// Helper function to get combined staged, unstaged, and untracked file changes
export async function getGitDiff(projectPath: string): Promise<string> {
  try {
    // Get staged changes (diff against HEAD)
    const { stdout: stagedDiff } = await execPromise("git diff --staged", {
      cwd: projectPath,
    });

    // Get unstaged changes (diff against index)
    const { stdout: unstagedDiff } = await execPromise("git diff", {
      cwd: projectPath,
    });

    // Get list of untracked files
    const { stdout: untrackedFilesOutput } = await execPromise(
      "git ls-files --others --exclude-standard",
      {
        cwd: projectPath,
      }
    );
    // Filter out empty lines from untracked files list
    const untrackedFiles = untrackedFilesOutput
      .split("\n")
      .filter((line) => line.trim() !== "");

    let result = "";
    let hasChanges = false;

    if (stagedDiff.trim()) {
      result += "=== STAGED CHANGES ===\n" + stagedDiff.trim() + "\n\n";
      hasChanges = true;
    }

    if (unstagedDiff.trim()) {
      result += "=== UNSTAGED CHANGES ===\n" + unstagedDiff.trim() + "\n\n";
      hasChanges = true;
    }

    if (untrackedFiles.length > 0) {
      result += "=== UNTRACKED FILES ===\n" + untrackedFiles.join("\n") + "\n";
      // Note: Untracked files don't automatically mean changes for commit message generation,
      // but including them gives context to the LLM. They need `git add` to be included.
      // We consider any diff or untracked files as "changes detected" for prompting purposes.
      hasChanges = true;
    }

    return hasChanges ? result.trim() : "No changes detected";
  } catch (error) {
    console.error("Error getting git diff:", error);
    // Return a specific error message that can be checked by callers
    if (error instanceof Error) {
      return `Error retrieving git diff: ${error.message}`;
    }
    return "Error retrieving git diff: Unknown error";
  }
}
