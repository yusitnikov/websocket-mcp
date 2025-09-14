import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export const isMethodNotFoundError = (error: unknown) => {
    return error instanceof McpError && error.code === ErrorCode.MethodNotFound;
};
