#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runServer } from "./server.js";

async function main() {
  const transport = new StdioServerTransport();
  await runServer(transport);
  console.error("MCP server connected successfully");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
