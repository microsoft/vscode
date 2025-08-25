/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * Kernel Process Manager for the Erdos Kernel Bridge
 * Manages Python IPyKernel and Ark R kernel processes with full lifecycle support
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { KernelSession, ConnectionInfo } from '../types';

export interface KernelProcessInfo {
  pid: number;
  process: ChildProcess;
  connectionFile: string;
  logFile: string;
  sessionId: string;
  kernelType: 'python' | 'ark';
  startTime: Date;
  lastActivity: Date;
}

export interface KernelStartupOptions {
  timeout?: number; // Startup timeout in milliseconds (default: 30000)
  retries?: number; // Number of startup retries (default: 2)
  killSignalTimeout?: number; // Time to wait before SIGKILL (default: 5000)
}

export class KernelProcessManager extends EventEmitter {
  private runningKernels: Map<number, KernelProcessInfo> = new Map();
  private tempDir: string;
  private defaultOptions: Required<KernelStartupOptions> = {
    timeout: 30000,
    retries: 2,
    killSignalTimeout: 5000
  };

  constructor(tempDir?: string) {
    super();
    this.tempDir = tempDir || path.join(process.cwd(), 'temp', 'kernels');
    this.ensureTempDir();
  }

  async startKernel(session: KernelSession, options?: KernelStartupOptions): Promise<KernelProcessInfo> {
    const opts = { ...this.defaultOptions, ...options };
    const kernelType = this.detectKernelType(session.kernelSpec);
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        if (attempt > 0) {
          this.emit('kernel_retry', { sessionId: session.sessionId, attempt, maxRetries: opts.retries });
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }

        const processInfo = await this.doStartKernel(session, kernelType, opts);
        this.emit('kernel_started', { 
          sessionId: session.sessionId, 
          pid: processInfo.pid, 
          kernelType,
          attempt: attempt + 1 
        });
        
        return processInfo;
      } catch (error) {
        lastError = error as Error;
        this.emit('kernel_start_error', { 
          sessionId: session.sessionId, 
          error: lastError, 
          attempt: attempt + 1,
          maxRetries: opts.retries + 1
        });
        
        if (attempt === opts.retries) {
          break;
        }
      }
    }

    throw new Error(`Failed to start kernel after ${opts.retries + 1} attempts. Last error: ${lastError?.message}`);
  }

  private async doStartKernel(
    session: KernelSession, 
    kernelType: 'python' | 'ark',
    options: Required<KernelStartupOptions>
  ): Promise<KernelProcessInfo> {
    const connectionFile = await this.createConnectionFile(session.sessionId, session.connectionInfo, kernelType);
    const logFile = path.join(this.tempDir, `kernel-${session.sessionId}.log`);
    
    const argv = this.prepareKernelCommand(session.kernelSpec, connectionFile, kernelType);
    
    this.emit('kernel_starting', { 
      sessionId: session.sessionId, 
      command: argv[0], 
      args: argv.slice(1),
      kernelType,
      workingDirectory: session.workingDirectory
    });

    // Create log stream first
    const logStream = await fs.open(logFile, 'a');
    
    const kernelProcess = spawn(argv[0], argv.slice(1), {
      cwd: session.workingDirectory,
      env: this.prepareEnvironment(session.environmentVariables, kernelType),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      windowsHide: true // Hide console on Windows
    });

    if (!kernelProcess.pid) {
      await logStream.close();
      throw new Error('Failed to start kernel process: no PID assigned');
    }

    // Set up logging immediately
    this.setupProcessLogging(kernelProcess, logStream, session.sessionId);

    // Set up process event handlers
    this.setupProcessEventHandlers(kernelProcess, session.sessionId, kernelType);

    const processInfo: KernelProcessInfo = {
      pid: kernelProcess.pid,
      process: kernelProcess,
      connectionFile,
      logFile,
      sessionId: session.sessionId,
      kernelType,
      startTime: new Date(),
      lastActivity: new Date()
    };

    // Wait for process to be ready or timeout
    await this.waitForKernelReady(processInfo, options.timeout);

    this.runningKernels.set(kernelProcess.pid, processInfo);
    
    return processInfo;
  }

  private detectKernelType(kernelSpec: any): 'python' | 'ark' {
    const language = kernelSpec.language?.toLowerCase() || '';
    const displayName = kernelSpec.display_name?.toLowerCase() || '';
    const argv = kernelSpec.argv || [];
    
    // Check for Ark R kernel indicators
    if (language === 'r' || displayName.includes('ark') || displayName.includes('r ')) {
      return 'ark';
    }
    
    // Check for Python kernel indicators
    if (language === 'python' || displayName.includes('python') || 
        argv.some((arg: string) => arg.includes('ipykernel') || arg.includes('python'))) {
      return 'python';
    }
    
    // Default to python for unknown kernels (safer assumption)
    return 'python';
  }

  private prepareEnvironment(baseEnv: Record<string, string>, kernelType: 'python' | 'ark'): Record<string, string> {
    const env = { ...baseEnv };
    
    // Ensure PATH is set
    if (!env.PATH && process.env.PATH) {
      env.PATH = process.env.PATH;
    }

    // Kernel-specific environment setup
    if (kernelType === 'python') {
      // Ensure Python buffering is disabled for better real-time output
      env.PYTHONUNBUFFERED = '1';
      env.PYTHONIOENCODING = 'utf-8';
      
      // Disable Python bytecode generation if not explicitly set
      if (!env.PYTHONDONTWRITEBYTECODE) {
        env.PYTHONDONTWRITEBYTECODE = '1';
      }
    } else if (kernelType === 'ark') {
      // Ensure R uses UTF-8 encoding
      env.LC_ALL = env.LC_ALL || 'en_US.UTF-8';
      env.LANG = env.LANG || 'en_US.UTF-8';
      
      // Disable R history file by default
      if (!env.R_HISTFILE) {
        env.R_HISTFILE = '/dev/null';
      }
      
      // Set R to non-interactive mode
      env.R_INTERACTIVE = 'FALSE';
    }

    return env;
  }

  private setupProcessLogging(process: ChildProcess, logStream: fs.FileHandle, sessionId: string): void {
    const writeToLog = async (data: Buffer | string, source: 'stdout' | 'stderr') => {
      try {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${source.toUpperCase()}] ${data.toString()}`;
        await logStream.write(logEntry);
        
        this.emit('kernel_output', {
          sessionId,
          source,
          data: data.toString(),
          timestamp
        });
      } catch (error) {
        this.emit('log_error', { sessionId, error });
      }
    };

    if (process.stdout) {
      process.stdout.on('data', (data) => writeToLog(data, 'stdout'));
    }
    
    if (process.stderr) {
      process.stderr.on('data', (data) => writeToLog(data, 'stderr'));
    }
  }

  private setupProcessEventHandlers(process: ChildProcess, sessionId: string, kernelType: 'python' | 'ark'): void {
    process.on('exit', (code, signal) => {
      const info = this.runningKernels.get(process.pid!);
      if (info) {
        info.lastActivity = new Date();
      }
      
      this.emit('kernel_exit', { 
        sessionId, 
        pid: process.pid, 
        code, 
        signal, 
        kernelType,
        uptime: info ? Date.now() - info.startTime.getTime() : 0
      });
      
      if (process.pid) {
        this.runningKernels.delete(process.pid);
      }
    });

    process.on('error', (error) => {
      this.emit('kernel_error', { 
        sessionId, 
        pid: process.pid, 
        error, 
        kernelType 
      });
    });

    process.on('spawn', () => {
      this.emit('kernel_spawned', { 
        sessionId, 
        pid: process.pid, 
        kernelType 
      });
    });

    process.on('disconnect', () => {
      this.emit('kernel_disconnected', { 
        sessionId, 
        pid: process.pid, 
        kernelType 
      });
    });
  }

  private async waitForKernelReady(processInfo: KernelProcessInfo, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeoutId = setTimeout(() => {
        reject(new Error(`Kernel startup timeout after ${timeout}ms`));
      }, timeout);

      // Check if connection file exists and process is still running
      const checkReady = async () => {
        try {
          if (!processInfo.process.killed && processInfo.process.pid) {
            // Check if connection file exists and is readable
            await fs.access(processInfo.connectionFile, fs.constants.R_OK);
            
            // For Ark kernels, also check if the process is accepting connections
            if (processInfo.kernelType === 'ark') {
              // Give Ark kernel extra time to initialize its ZMQ sockets
              const elapsed = Date.now() - startTime;
              if (elapsed < 2000) { // Wait at least 2 seconds for Ark
                setTimeout(checkReady, 500);
                return;
              }
            }
            
            clearTimeout(timeoutId);
            resolve();
          } else {
            reject(new Error('Kernel process died during startup'));
          }
        } catch (error) {
          // File doesn't exist yet, keep checking
          if (Date.now() - startTime < timeout) {
            setTimeout(checkReady, 100);
          } else {
            clearTimeout(timeoutId);
            reject(new Error(`Kernel failed to create connection file: ${error}`));
          }
        }
      };

      // Start checking after a brief delay
      setTimeout(checkReady, 100);
    });
  }

  async killKernel(pid: number, options?: { force?: boolean; timeout?: number }): Promise<void> {
    const opts = { 
      force: false, 
      timeout: this.defaultOptions.killSignalTimeout, 
      ...options 
    };
    
    const kernelInfo = this.runningKernels.get(pid);
    if (!kernelInfo) {
      this.emit('kill_warning', { pid, message: 'Kernel not found in running kernels map' });
      return;
    }

    this.emit('kernel_killing', { 
      sessionId: kernelInfo.sessionId, 
      pid, 
      kernelType: kernelInfo.kernelType,
      force: opts.force
    });

    try {
      if (opts.force) {
        // Force kill immediately
        kernelInfo.process.kill('SIGKILL');
      } else {
        // Graceful shutdown
        kernelInfo.process.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (!kernelInfo.process.killed) {
              this.emit('kernel_force_killing', { 
                sessionId: kernelInfo.sessionId, 
                pid, 
                reason: 'graceful shutdown timeout' 
              });
              kernelInfo.process.kill('SIGKILL');
            }
            resolve();
          }, opts.timeout);

          kernelInfo.process.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
    } catch (error) {
      this.emit('kill_error', { 
        sessionId: kernelInfo.sessionId, 
        pid, 
        error 
      });
    }

    // Clean up files
    await this.cleanupKernelFiles(kernelInfo);
    this.runningKernels.delete(pid);
  }

  private async cleanupKernelFiles(kernelInfo: KernelProcessInfo): Promise<void> {
    const filesToClean = [kernelInfo.connectionFile, kernelInfo.logFile];
    
    for (const file of filesToClean) {
      try {
        await fs.unlink(file);
        this.emit('file_cleaned', { sessionId: kernelInfo.sessionId, file });
      } catch (error) {
        this.emit('cleanup_warning', { 
          sessionId: kernelInfo.sessionId, 
          file, 
          error 
        });
      }
    }
  }

  isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  getKernelInfo(pid: number): KernelProcessInfo | undefined {
    return this.runningKernels.get(pid);
  }

  getKernelInfoBySession(sessionId: string): KernelProcessInfo | undefined {
    for (const kernel of this.runningKernels.values()) {
      if (kernel.sessionId === sessionId) {
        return kernel;
      }
    }
    return undefined;
  }

  getAllRunningKernels(): KernelProcessInfo[] {
    return Array.from(this.runningKernels.values());
  }

  getKernelsByType(kernelType: 'python' | 'ark'): KernelProcessInfo[] {
    return Array.from(this.runningKernels.values())
      .filter(kernel => kernel.kernelType === kernelType);
  }

  updateKernelActivity(pid: number): void {
    const kernelInfo = this.runningKernels.get(pid);
    if (kernelInfo) {
      kernelInfo.lastActivity = new Date();
    }
  }

  private async createConnectionFile(
    sessionId: string, 
    connectionInfo: ConnectionInfo, 
    kernelType: 'python' | 'ark'
  ): Promise<string> {
    const connectionFilePath = path.join(this.tempDir, `kernel-${sessionId}.json`);
    
    // Base connection data following Jupyter protocol
    const connectionData: any = {
      shell_port: connectionInfo.shell_port,
      iopub_port: connectionInfo.iopub_port,
      stdin_port: connectionInfo.stdin_port,
      control_port: connectionInfo.control_port,
      hb_port: connectionInfo.hb_port,
      ip: connectionInfo.ip,
      key: connectionInfo.key,
      transport: connectionInfo.transport,
      signature_scheme: connectionInfo.signature_scheme,
      kernel_name: kernelType === 'ark' ? 'ark' : 'python3'
    };

    // Kernel-specific adjustments
    if (kernelType === 'ark') {
      // Ark kernel may need additional fields or different format
      connectionData.kernel_name = 'ark';
    } else {
      // Python IPyKernel standard format
      connectionData.kernel_name = 'python3';
    }

    await fs.writeFile(connectionFilePath, JSON.stringify(connectionData, null, 2), 'utf-8');
    
    this.emit('connection_file_created', { 
      sessionId, 
      file: connectionFilePath, 
      kernelType 
    });
    
    return connectionFilePath;
  }

  private prepareKernelCommand(
    kernelSpec: any, 
    connectionFile: string, 
    kernelType: 'python' | 'ark'
  ): string[] {
    const argv = [...kernelSpec.argv];
    
    // Replace placeholders in arguments
    const processedArgv = argv.map((arg: string) => {
      return arg
        .replace('{connection_file}', connectionFile)
        .replace('{log_file}', path.join(this.tempDir, 'kernel.log'))
        .replace('{resource_dir}', this.tempDir);
    });

    // Kernel-specific command adjustments
    if (kernelType === 'ark') {
      // Ensure Ark kernel has proper connection file argument
      if (!processedArgv.includes('--connection-file') && !processedArgv.includes('-f')) {
        processedArgv.push('--connection-file', connectionFile);
      }
    } else if (kernelType === 'python') {
      // Ensure Python kernel has proper connection file argument
      if (!processedArgv.includes('-f') && !processedArgv.includes('--connection-file')) {
        processedArgv.push('-f', connectionFile);
      }
    }

    return processedArgv;
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      this.emit('temp_dir_created', { tempDir: this.tempDir });
    } catch (error) {
      this.emit('temp_dir_error', { tempDir: this.tempDir, error });
      throw new Error(`Could not create temp directory ${this.tempDir}: ${error}`);
    }
  }

  async cleanup(): Promise<void> {
    this.emit('cleanup_started', { kernelCount: this.runningKernels.size });
    
    const killPromises = Array.from(this.runningKernels.keys()).map(pid => 
      this.killKernel(pid, { force: false, timeout: 3000 })
    );
    
    await Promise.allSettled(killPromises);

    // Force kill any remaining processes
    const remainingKernels = Array.from(this.runningKernels.keys());
    if (remainingKernels.length > 0) {
      this.emit('cleanup_force_kill', { remainingPids: remainingKernels });
      const forceKillPromises = remainingKernels.map(pid => 
        this.killKernel(pid, { force: true })
      );
      await Promise.allSettled(forceKillPromises);
    }

    // Clean up temp directory
    try {
      const entries = await fs.readdir(this.tempDir);
      for (const entry of entries) {
        const fullPath = path.join(this.tempDir, entry);
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            await fs.rmdir(fullPath, { recursive: true });
          } else {
            await fs.unlink(fullPath);
          }
        } catch (error) {
          this.emit('cleanup_file_error', { file: fullPath, error });
        }
      }
      
      await fs.rmdir(this.tempDir);
      this.emit('cleanup_completed', { tempDir: this.tempDir });
    } catch (error) {
      this.emit('cleanup_temp_dir_error', { tempDir: this.tempDir, error });
    }
  }

  // Utility methods for monitoring and debugging
  getProcessStats(): { [key: string]: any } {
    const stats = {
      totalKernels: this.runningKernels.size,
      pythonKernels: 0,
      arkKernels: 0,
      oldestKernel: null as Date | null,
      newestKernel: null as Date | null,
      averageUptime: 0
    };

    let totalUptime = 0;
    const now = Date.now();

    for (const kernel of this.runningKernels.values()) {
      if (kernel.kernelType === 'python') {
        stats.pythonKernels++;
      } else {
        stats.arkKernels++;
      }

      const uptime = now - kernel.startTime.getTime();
      totalUptime += uptime;

      if (!stats.oldestKernel || kernel.startTime < stats.oldestKernel) {
        stats.oldestKernel = kernel.startTime;
      }
      
      if (!stats.newestKernel || kernel.startTime > stats.newestKernel) {
        stats.newestKernel = kernel.startTime;
      }
    }

    if (stats.totalKernels > 0) {
      stats.averageUptime = totalUptime / stats.totalKernels;
    }

    return stats;
  }

  getTempDir(): string {
    return this.tempDir;
  }
}




