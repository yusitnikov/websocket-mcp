import { McpError } from "@modelcontextprotocol/sdk/types.js";

export const isMethodNotFoundError = (error: unknown) => {
    return error instanceof McpError && error.code === -32601;
};
