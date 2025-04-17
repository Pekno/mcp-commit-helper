import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolCommandBuilder } from "./ToolCommandBuilder.js";

const __dirname = path.resolve();

export async function registerTools(server: McpServer): Promise<void> {
  const toolsDir = path.resolve(__dirname, "dist", "tools");
  const files = await fs.readdir(toolsDir);

  for (const file of files) {
    if (file.endsWith(".ts") || file.endsWith(".js")) {
      const modulePath = path.join(toolsDir, file);
      const moduleUrl = pathToFileURL(modulePath).href;
      const toolModule = await import(moduleUrl);

      if ("data" in toolModule && "execute" in toolModule) {
        const data = toolModule.data as ToolCommandBuilder;
        server.tool(
          data.getName(),
          data.getDescription(),
          data.getParameters(),
          toolModule.execute
        );
      } else {
        console.warn(
          `[WARNING] The tool at ${modulePath} is missing required "data" and/or "execute" properties.`
        );
      }
    }
  }
}
