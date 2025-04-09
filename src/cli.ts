#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runServer } from "./index.js";

async function main() {
  console.log("Starting MCP Commit Helper...");
  
  try {
    const transport = new StdioServerTransport();
    await runServer(transport);
    console.log("MCP server connected successfully");
  } catch (error) {
    console.error("Fatal error starting server:", error);
    process.exit(1);
  }
}

// Run the main function when this script is executed directly
main();