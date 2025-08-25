/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * Main entry point for the Erdos Kernel Bridge
 */

import { KernelBridgeServer } from './server/KernelBridgeServer.js';
import { SessionManager } from './session/SessionManager.js';
import { MessageConverter } from './protocol/MessageConverter.js';
import { ProtocolValidator } from './protocol/ProtocolValidator.js';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import * as crypto from 'crypto';

class Logger {
  private logStream: fs.WriteStream | null = null;
  private logToFile: boolean = false;
  private logFilePath: string | undefined;

  constructor(logFilePath?: string) {
    this.logFilePath = logFilePath;
    
    if (logFilePath) {
      try {
        // Ensure directory exists
        const logDir = path.dirname(logFilePath);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        // Create write stream with append mode
        this.logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        this.logToFile = true;
        
        // Handle stream errors
        this.logStream.on('error', (error) => {
          // Write to stderr since we can't use console and can't write to log file
          process.stderr.write(`Log file error: ${error.message}\n`);
          this.logToFile = false;
        });

        // Write initial startup message
        this.log(`Kernel Bridge logging started at ${new Date().toISOString()}`);
      } catch (error) {
        // Write to stderr since we can't use console and can't write to log file  
        process.stderr.write(`Failed to setup log file at ${logFilePath}: ${error}\n`);
        this.logToFile = false;
      }
    }
  }

  getLogFilePath(): string | undefined {
    return this.logFilePath;
  }

  log(message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' = 'INFO'): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${level}: ${message}`;
    
    // Only log to file if configured, otherwise write to stderr as fallback
    if (this.logToFile && this.logStream) {
      this.logStream.write(formattedMessage + '\n');
    } else {
      // Fallback to stderr when no log file is configured
      process.stderr.write(formattedMessage + '\n');
    }
  }

  error(message: string, error?: any): void {
    const errorMsg = error ? `${message}: ${error.toString()}` : message;
    this.log(errorMsg, 'ERROR');
    if (error?.stack) {
      this.log(`Stack trace: ${error.stack}`, 'ERROR');
    }
  }

  warn(message: string): void {
    this.log(message, 'WARN');
  }

  debug(message: string): void {
    this.log(message, 'DEBUG');
  }

  close(): void {
    if (this.logStream) {
      this.log('Kernel Bridge logging stopped');
      this.logStream.end();
      this.logStream = null;
      this.logToFile = false;
    }
  }
}

// Global logger instance
let logger: Logger;

// Re-export main classes for external use
export { KernelBridgeServer, SessionManager, MessageConverter, ProtocolValidator };

// Export types
export * from './types/index.js';

// Default export for easy import
export default KernelBridgeServer;

// Parse command line arguments for kernelBridge compatibility
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const parsed: { [key: string]: string } = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--connection-file' && i + 1 < args.length) {
      parsed['connection-file'] = args[i + 1];
      i++; // Skip next argument as it's the value
    } else if (args[i] === '--log-file' && i + 1 < args.length) {
      parsed['log-file'] = args[i + 1];
      i++; // Skip next argument as it's the value
    }
  }
  
  return parsed;
}

// Generate a secure bearer token for API authentication
function generateSecureBearerToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Create kernelBridge-compatible connection file
async function createConnectionFile(port: number, connectionFilePath: string, logger: Logger, bearerToken?: string) {
  // Determine transport method and connection details
  // Based on KernelBridgeAdapterApi.ts:26-53, support multiple transports
  const connectionData: any = {
    bearer_token: bearerToken || generateSecureBearerToken(),
    server_path: __filename,
    server_pid: process.pid,
    log_path: logger ? logger.getLogFilePath() || '' : '', // Include log file path if available
  };

  // For now, only support TCP transport (like the original implementation)
  // TODO: Add Unix domain socket and named pipe support based on command line options
  connectionData.transport = 'tcp';
  connectionData.port = port;
  connectionData.base_path = `http://127.0.0.1:${port}`;
  
  // Future enhancement: detect platform and add socket_path/named_pipe support
  // if (process.platform !== 'win32' && supportUnixSockets) {
  //   connectionData.socket_path = `/tmp/kernel-bridge-${process.pid}.sock`;
  //   connectionData.transport = 'unix';
  // } else if (process.platform === 'win32' && supportNamedPipes) {
  //   connectionData.named_pipe = `\\\\.\\pipe\\kernel-bridge-${process.pid}`;
  //   connectionData.transport = 'pipe';
  // }
  
  try {
    // Ensure directory exists
    const connectionDir = path.dirname(connectionFilePath);
    if (!fs.existsSync(connectionDir)) {
      fs.mkdirSync(connectionDir, { recursive: true });
    }

    await fs.promises.writeFile(connectionFilePath, JSON.stringify(connectionData, null, 2));
    logger.log(`Connection file written to: ${connectionFilePath}`);
  } catch (error) {
    logger.error(`Failed to write connection file: ${error}`);
    throw error;
  }
}

// Find an available port for the server
async function findAvailablePort(startPort: number = 49152, maxPort: number = 65535): Promise<number> {
  const maxAttempts = 100;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = Math.floor(Math.random() * (maxPort - startPort + 1)) + startPort;
    
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  
  throw new Error(`Could not find available port after ${maxAttempts} attempts in range ${startPort}-${maxPort}`);
}

// Check if a port is available
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, () => {
      server.close(() => {
        resolve(true);
      });
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

// Main function for standalone usage
async function main() {
  const args = parseCommandLineArgs();
  
  // Initialize logger with file logging if specified
  const logFilePath = args['log-file'] ? path.resolve(args['log-file']) : undefined;
  logger = new Logger(logFilePath);

  if (logFilePath) {
    logger.log(`File logging enabled: ${logFilePath}`);
  } else {
    logger.log('Console logging only (no log file specified)');
  }

  // Find an available port dynamically instead of hard-coding
  const port = await findAvailablePort();
  logger.log(`Using dynamically allocated port: ${port}`);

  // Generate secure bearer token for API authentication
  const bearerToken = generateSecureBearerToken();
  logger.log(`Generated secure bearer token for API authentication`);

  const server = new KernelBridgeServer({ port, logger, bearerToken });

  // Graceful shutdown handling
  process.on('SIGINT', async () => {
    logger.log('Received SIGINT, shutting down gracefully...');
    await server.stop();
    logger.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.log('Received SIGTERM, shutting down gracefully...');
    await server.stop();
    logger.close();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    logger.close();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason);
    logger.close();
    process.exit(1);
  });

  try {
    await server.start();
    logger.log(`Kernel Bridge started successfully on port ${port}`);
    logger.log(`Status endpoint: http://localhost:${port}/status`);
    logger.log(`WebSocket endpoint: ws://localhost:${port}/sessions/<session_id>/channels`);
    
    // Create connection file if specified (kernelBridge compatibility)
    if (args['connection-file']) {
      const connectionFilePath = path.resolve(args['connection-file']);
      await createConnectionFile(port, connectionFilePath, logger, bearerToken);
    }
    
  } catch (error) {
    logger.error('Failed to start Kernel Bridge server', error);
    logger.close();
    process.exit(1);
  }
}

// Run main function if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    // If logger isn't available yet, write directly to stderr
    if (logger) {
      logger.error('Unhandled error in main function', error);
    } else {
      process.stderr.write(`[${new Date().toISOString()}] FATAL: ${error.toString()}\n`);
      if (error.stack) {
        process.stderr.write(`Stack trace: ${error.stack}\n`);
      }
    }
    process.exit(1);
  });
}



