import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Transport as McpTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import pkg from "../package.json" with { type: "json" };
import { registerTools } from "./common/registerTools.js";

// Create a function to create and configure the MCP server instance
export async function createServer(): Promise<McpServer> {
  // Initialize the MCP Server
  const server = new McpServer({
    name: "mcp-commit-helper",
    version: pkg.version,
  });
  // register the tools with the server
  await registerTools(server);
  // Return the configured server instance
  return server;
}

// --- Server Execution ---

// Function to run the server with a given transport mechanism
export async function runServer(transport: McpTransport): Promise<void> {
  const server = await createServer();
  await server.connect(transport);
}
