import { appendFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

/**
 * Simple file-based logger for the MCP server.
 */
export class Logger {
  constructor(private filePath: string) {
    // Ensure directory exists
    mkdirSync(dirname(filePath), { recursive: true })
  }

  log(message: string): void {
    const timestamp = new Date().toISOString()
    appendFileSync(this.filePath, `[${timestamp}] ${message}\n`)
  }

  error(message: string, error?: Error | unknown): void {
    const timestamp = new Date().toISOString()
    let fullMessage = `[${timestamp}] ERROR: ${message}\n`

    if (error instanceof Error) {
      fullMessage += `  ${error.message}\n`
      if (error.stack) {
        fullMessage += `  ${error.stack}\n`
      }
    } else if (error !== undefined) {
      fullMessage += `  ${String(error)}\n`
    }

    appendFileSync(this.filePath, fullMessage)
  }
}
