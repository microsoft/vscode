import * as vscode from 'vscode';
import { ITrace } from '../types';
import { Recorder } from './recorder';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import archiver from 'archiver';
import { glob } from 'glob';
import { createRecord } from '../utils/recordValidator';
import { Action } from '../actionTypes';

/**
 * File Trace Recording System for VSCode Extension
 *
 * This module provides a robust trace recording system that efficiently handles
 * file I/O operations for storing and managing trace logs. It includes:
 *
 * 1. A worker-based queue system that manages file operations sequentially
 *    with priority handling to prevent bottlenecks
 * 2. A file recorder implementation that buffers writes, handles log rotation,
 *    and manages exports with backpressure handling
 *
 * The system is designed to be performant even with high-volume logging while
 * preventing memory issues through careful resource management.
 */

/**
 * Defines a task for the worker queue with associated priority and callbacks
 */
interface WorkerTask {
  task: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  priority: number; // Higher number = higher priority
}

/**
 * FileOperationWorker handles all file I/O operations in a sequential manner
 * with prioritization and queue management to prevent memory issues.
 *
 * Features:
 * - Prioritized task queue (higher numbers = higher priority)
 * - Queue size limiting to prevent memory issues
 * - Performance monitoring and logging
 * - Automatic low-priority task cancellation when queue is full
 */
class FileOperationWorker {
  private taskQueue: WorkerTask[] = [];
  private processing: boolean = false;
  private maxQueueSize: number;
  private queueSizeWarningThreshold: number;

  // Monitoring properties
  private taskProcessed: number = 0;
  private lastMonitorTime: number = Date.now();
  private monitorIntervalMs: number;

  /**
   * Creates a new FileOperationWorker
   */
  constructor() {
    // Load configuration settings
    const config = vscode.workspace.getConfiguration('datacurve-tracer.recorder');
    this.maxQueueSize = config.get('maxQueueSize', 90);
    this.queueSizeWarningThreshold = config.get('queueSizeWarningThreshold', 50);
    this.monitorIntervalMs = config.get('monitorIntervalMs', 10000);

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('datacurve-tracer.recorder')) {
        const newConfig = vscode.workspace.getConfiguration('datacurve-tracer.recorder');
        this.maxQueueSize = newConfig.get('maxQueueSize', 90);
        this.queueSizeWarningThreshold = newConfig.get('queueSizeWarningThreshold', 50);
        this.monitorIntervalMs = newConfig.get('monitorIntervalMs', 10000);
      }
    });
  }

  /**
   * Enqueues a task to be executed sequentially with priority support
   *
   * @param task The async function to execute
   * @param priority Priority level (higher = more important, default = 0)
   * @returns Promise that resolves with the task result or rejects if the task fails or is removed
   * @throws Error when queue is full for low priority tasks
   */
  enqueue<T>(task: () => Promise<T>, priority: number = 0): Promise<T> {
    // Throttle if queue is too large
    if (this.taskQueue.length >= this.maxQueueSize) {
      // For low priority tasks, reject if queue is full
      if (priority === 0) {
        return Promise.reject(
          new Error('Task queue is full. Try again later.'),
        );
      }

      // For higher priority tasks, remove oldest low priority task
      const oldestLowPriorityIndex = this.taskQueue.findIndex(
        (t) => t.priority === 0,
      );
      if (oldestLowPriorityIndex >= 0) {
        const removed = this.taskQueue.splice(oldestLowPriorityIndex, 1)[0];
        removed.reject(new Error('Task was removed due to queue overflow'));
      }
    }

    // Log warning if queue is growing
    if (this.taskQueue.length >= this.queueSizeWarningThreshold) {
      console.warn(
        `FileOperationWorker queue size is large: ${this.taskQueue.length} tasks`,
      );
      this.monitorPerformance();
    }

    return new Promise<T>((resolve, reject) => {
      // Insert task in priority order (higher priority first)
      const newTask: WorkerTask = {
        task,
        resolve,
        reject,
        priority,
      };

      // Find insertion point to maintain priority order
      const insertIndex = this.taskQueue.findIndex(
        (t) => t.priority < priority,
      );
      if (insertIndex >= 0) {
        this.taskQueue.splice(insertIndex, 0, newTask);
      } else {
        this.taskQueue.push(newTask);
      }

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Processes tasks in the queue sequentially while respecting priority order
   * Uses setImmediate to prevent call stack overflow for large queues
   *
   * @private
   */
  private async processQueue(): Promise<void> {
    if (this.taskQueue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const { task, resolve, reject } = this.taskQueue.shift()!;

    try {
      const result = await task();
      resolve(result);
      this.taskProcessed++;

      // Periodically monitor performance
      if (this.taskProcessed % 100 === 0) {
        this.monitorPerformance();
      }
    } catch (error) {
      reject(error);
    }

    // Use setImmediate to prevent call stack overflow for large queues
    // and allow other event loop tasks to execute
    setImmediate(() => this.processQueue());
  }

  /**
   * Monitors worker performance and logs metrics at regular intervals
   * Tracks tasks processed per second and current queue size
   *
   * @private
   */
  private monitorPerformance(): void {
    const now = Date.now();
    const elapsed = now - this.lastMonitorTime;

    if (elapsed >= this.monitorIntervalMs) {
      const tasksPerSecond = (this.taskProcessed * 1000) / elapsed;
      console.log(
        `FileOperationWorker performance: ${tasksPerSecond.toFixed(2)} tasks/sec, Queue size: ${this.taskQueue.length}`,
      );

      // Reset monitoring counters
      this.taskProcessed = 0;
      this.lastMonitorTime = now;
    }
  }

  /**
   * Returns the current number of tasks waiting in the queue
   *
   * @returns Number of pending tasks
   */
  getQueueSize(): number {
    return this.taskQueue.length;
  }
}

/**
 * WorkerFileRecorder implements the Recorder interface using a file-based storage system
 * with optimizations for high-volume logging.
 *
 * Features:
 * - Buffered writing to reduce I/O operations
 * - Automatic log rotation and compression
 * - Export capabilities for log archives
 * - Backpressure handling for write streams
 * - Prioritized operations via FileOperationWorker
 */
class WorkerFileRecorder extends Recorder {
  // File paths and state
  private logFilePath: string;
  private writeStream: fs.WriteStream | null = null;

  // Buffering configuration
  private buffer: string[] = [];
  private bufferSize: number;
  private bufferSizeBytes: number = 0;
  private maxBufferSizeBytes: number;

  // Log rotation settings
  private maxLogSize: number;

  // Worker and task management
  private worker: FileOperationWorker;

  // Flush control
  private lastFlushTime: number = Date.now();
  private flushIntervalMs: number;
  private isFlushPending: boolean = false;
  private flushCount: number = 0;

  // Backpressure management
  private drainPromise: Promise<void> | null = null;
  private drainResolve: (() => void) | null = null;

  /**
   * Creates a new WorkerFileRecorder
   *
   * @param context VSCode extension context used to access storage paths
   * @throws Error if storage URI is undefined
   */
  constructor(context: vscode.ExtensionContext) {
    super(context);
    if (!context.storageUri) {
      throw new Error('StorageUri is undefined in the extension context.');
    }
    this.logFilePath = path.join(context.storageUri.fsPath, 'traces.log');

    // Load configuration settings
    const config = vscode.workspace.getConfiguration('datacurve-tracer.recorder');
    this.bufferSize = config.get('bufferSize', 100);
    this.maxBufferSizeBytes = config.get('maxBufferSizeBytes', 1024 * 1024);
    this.maxLogSize = config.get('maxLogSize', 100 * 1024 * 1024);
    this.flushIntervalMs = config.get('flushIntervalMs', 1000);

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('datacurve-tracer.recorder')) {
        const newConfig = vscode.workspace.getConfiguration('datacurve-tracer.recorder');
        this.bufferSize = newConfig.get('bufferSize', 100);
        this.maxBufferSizeBytes = newConfig.get('maxBufferSizeBytes', 1024 * 1024);
        this.maxLogSize = newConfig.get('maxLogSize', 100 * 1024 * 1024);
        this.flushIntervalMs = newConfig.get('flushIntervalMs', 1000);
      }
    }, null, context.subscriptions);

    // Create the file operation worker
    this.worker = new FileOperationWorker();

    // Initialize the file system (as a worker task to ensure it's done sequentially)
    this.worker
      .enqueue(async () => {
        if (!context.storageUri) {
          throw new Error('StorageUri is undefined in the extension context.');
        }
        // Create folder if it doesn't exist
        if (!fs.existsSync(context.storageUri.fsPath)) {
          fs.mkdirSync(context.storageUri.fsPath, { recursive: true });
        }

        this.writeStream = fs.createWriteStream(this.logFilePath, {
          flags: 'a',
          highWaterMark: 10 * 1024 * 1024, // 10MB buffer for better performance
        });

        // Setup stream event handlers
        this.setupStreamHandlers();

        return true;
      }, 10) // High priority for initialization
      .catch((error) => {
        console.error('Failed to initialize file recorder:', error);
      });

    // Set up periodic flush timer
    setInterval(() => this.checkPeriodicFlush(), this.flushIntervalMs);
  }

  /**
   * Sets up event handlers for the write stream to manage backpressure and error handling
   *
   * @private
   */
  private setupStreamHandlers(): void {
    if (!this.writeStream) {
      return;
    }
    this.writeStream.on('error', (err) => {
      console.error('WriteStream error:', err);
    });

    this.writeStream.on('drain', () => {
      // Resolve the drain promise when backpressure is relieved
      if (this.drainResolve) {
        const resolveFunc = this.drainResolve;
        this.drainPromise = null;
        this.drainResolve = null;
        resolveFunc();
      }
    });
  }

  /**
   * Records a trace entry to the log file
   * Buffering is used to improve performance by reducing I/O operations
   *
   * @param trace The trace data to record
   * @returns Promise that resolves when the trace is queued for writing
   */
  async record(trace: ITrace | Action): Promise<void> {
    try {
      // Ensure trace is properly structured with all required fields
      // If an Action type is passed, convert it to ITrace
      const validatedTrace: ITrace = 'event' in trace && typeof trace.action_id === 'string'
        ? createRecord(trace as Action)
        : trace;

      // Use timestamp if not provided
      if (!validatedTrace.timestamp) {
        validatedTrace.timestamp = Date.now();
      }

      // Creating the log entry can be done outside the worker
      const logEntry = JSON.stringify(validatedTrace) + '\n';
      const entrySize = Buffer.byteLength(logEntry, 'utf8');

      // Use worker to handle buffering of the trace
      return this.worker.enqueue(async () => {
        // Add to buffer
        this.buffer.push(logEntry);
        this.bufferSizeBytes += entrySize;

        // Check if buffer needs to be flushed (by size or count)
        if (this.shouldFlushBuffer()) {
          await this.flushBuffer();
        }
      }, 0); // Normal priority
    } catch (error) {
      console.error('Failed to record trace:', error);
    }
  }

  /**
   * Determines if the buffer should be flushed based on size, count, or time elapsed
   *
   * @returns Boolean indicating whether the buffer should be flushed
   * @private
   */
  private shouldFlushBuffer(): boolean {
    if (this.buffer.length === 0) {
      return false;
    }
    return (
      this.buffer.length >= this.bufferSize ||
      this.bufferSizeBytes >= this.maxBufferSizeBytes ||
      Date.now() - this.lastFlushTime >= this.flushIntervalMs
    );
  }

  /**
   * Checks and performs periodic flush if needed
   * Scheduled by a timer to ensure logs are written even during periods of inactivity
   *
   * @private
   */
  private async checkPeriodicFlush(): Promise<void> {
    if (this.buffer.length > 0 && !this.isFlushPending) {
      this.worker.enqueue(async () => {
        await this.flushBuffer();
      }, 5); // Medium-high priority for periodic flush
    }
  }

  /**
   * Flushes the buffer to the log file
   * Handles backpressure by waiting for 'drain' events when needed
   *
   * @private
   * @returns Promise that resolves when the buffer is written or on error
   */
  private async flushBuffer(): Promise<void> {
    if (!this.writeStream || this.buffer.length === 0) {
      return;
    }

    // Set flag to prevent concurrent flushes
    if (this.isFlushPending) {
      return;
    }
    this.isFlushPending = true;
    this.flushCount++;

    try {
      // Join all buffer entries into one string for a single write operation
      const dataToWrite = this.buffer.join('');
      this.buffer = [];
      this.bufferSizeBytes = 0;
      this.lastFlushTime = Date.now();

      // Write the combined buffer to the stream
      const writeSuccess = this.writeStream.write(dataToWrite, 'utf8');

      // Handle backpressure if write returns false
      if (!writeSuccess && this.writeStream.writable) {
        this.drainPromise = new Promise<void>((resolve) => {
          this.drainResolve = resolve;

          // The drain event handler will resolve this promise
          // when backpressure is relieved
          const timeout = setTimeout(() => {
            console.warn('Stream drain timeout - forcing continue');
            if (this.drainResolve) {
              this.drainResolve();
              this.drainResolve = null;
              this.drainPromise = null;
            }
          }, 5000); // 5 second safety timeout

          // Create a one-time drain handler that clears the timeout
          const onDrain = () => {
            clearTimeout(timeout);
            this.writeStream?.removeListener('drain', onDrain);
            if (this.drainResolve) {
              this.drainResolve();
              this.drainResolve = null;
              this.drainPromise = null;
            }
          };

          this?.writeStream?.once('drain', onDrain);
        });

        // Wait for drain event
        await this.drainPromise;
      }

      // Check if log rotation is needed (after successful write)
      if (this.getLogFileSize() >= this.maxLogSize) {
        await this.rotateLog();
      }
    } catch (error) {
      console.error('Failed to flush buffer:', error);
    } finally {
      this.isFlushPending = false;
    }
  }

  /**
   * Gets the current size of the log file in bytes
   *
   * @private
   * @returns Size of the log file in bytes or 0 if file doesn't exist
   */
  private getLogFileSize(): number {
    if (fs.existsSync(this.logFilePath)) {
      const stats = fs.statSync(this.logFilePath);
      return stats.size;
    }
    return 0;
  }

  /**
   * Rotates the log file when it exceeds the maximum size
   * Compresses the old log file and creates a new one
   *
   * @private
   * @returns Promise that resolves when rotation is complete
   */
  private async rotateLog(): Promise<void> {
    // Ensure all buffered data is written before rotation
    await this.flushBuffer();

    if (!this.writeStream) {
      throw new Error('Write stream is not initialized.');
    }

    // Close the current write stream
    const closePromise = new Promise<void>((resolve) => {
      this.writeStream!.end(() => {
        resolve();
      });
    });

    await closePromise;

    const timestamp = Date.now();
    const rotatedLogFilePath = `${this.logFilePath}.${timestamp}.gz`;

    // Compress in a separate worker task
    await this.compressLogFile(this.logFilePath, rotatedLogFilePath);

    // Create a new write stream
    this.writeStream = fs.createWriteStream(this.logFilePath, {
      flags: 'a',
      highWaterMark: 64 * 1024, // 64KB buffer for better performance
    });

    this.setupStreamHandlers();
  }

  /**
   * Compresses a log file using gzip compression
   *
   * @param source Path to the source file to compress
   * @param destination Path where the compressed file will be saved
   * @private
   * @returns Promise that resolves when compression is complete
   */
  private compressLogFile(source: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const readStream = fs.createReadStream(source);
        const writeStream = fs.createWriteStream(destination);
        const gzip = zlib.createGzip({
          level: 6, // Balanced compression (faster than level 9)
        });

        const pipeline = readStream.pipe(gzip).pipe(writeStream);

        pipeline.on('finish', () => {
          try {
            fs.unlinkSync(source);
            resolve();
          } catch (err) {
            reject(err);
          }
        });

        pipeline.on('error', (error) => {
          reject(error);
        });

        // Add error handlers to each stream
        readStream.on('error', reject);
        gzip.on('error', reject);
        writeStream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Exports all log files to a compressed archive
   * Prompts the user for a destination and creates a tar.gz file
   *
   * @returns Promise that resolves with the URI of the exported file
   */
  async export(): Promise<vscode.Uri> {
    // UI operations must be done in the main thread
    const exportDestination = await this.promptForExportDestination();

    this.record({
      action_id: 'exportLogs',
      event: {
        destination: exportDestination.toString(),
        version:
          vscode.extensions.getExtension('datacurve.datacurve-tracer')?.packageJSON
            .version,
      },
    });

    // Show progress UI while exporting
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting trace logs',
        cancellable: false
      },
      async (progress) => {
        // Report initial progress
        progress.report({ increment: 0, message: 'Preparing export...' });

        // Delegate export operation to the worker with high priority
        return this.worker.enqueue(async () => {
          // Flush any remaining buffered log entries
          await this.flushBuffer();

          // Export log files to destination
          return this.exportToDestination(exportDestination, progress);
        }, 10); // High priority for user-initiated action
      }
    );
  }

  /**
   * Prompts the user to select a destination for the exported log files
   *
   * @private
   * @returns Promise that resolves with the selected URI
   * @throws Error if the user cancels the save dialog
   */
  private async promptForExportDestination(): Promise<vscode.Uri> {
    // Prompt user for export destination
    const exportDestination = await vscode.window.showSaveDialog({
      filters: {
        'Tar Files': ['tar.gz'],
      },
    });
    if (!exportDestination) {
      throw new Error('Export destination is undefined.');
    }
    return exportDestination;
  }

  /**
   * Exports log files to the specified destination as a tar.gz archive
   *
   * @param exportDestination URI where the archive will be saved
   * @param progress Progress object for reporting export status
   * @private
   * @returns Promise that resolves with the URI of the exported file
   */
  private async exportToDestination(
    exportDestination: vscode.Uri,
    progress: vscode.Progress<{ increment: number; message: string }>
  ): Promise<vscode.Uri> {
    // Ensure all pending writes are complete before exporting
    if (this.buffer.length > 0) {
      await this.flushBuffer();
    }

    // Initialize archiver
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: {
        level: 6, // Balanced compression (faster than level 9)
      },
    });

    // Create write stream to export destination
    const writeStream = fs.createWriteStream(exportDestination.fsPath);

    // Add log files to archive
    archive.glob('traces.log*', {
      cwd: path.dirname(this.logFilePath),
    });

    // Add datacurve-traces.log from parent directory if it exists
    const parentDir = path.dirname(path.dirname(this.logFilePath));
    const datacurveTracesPath = path.join(parentDir, 'datacurve-trace.log');
    if (fs.existsSync(datacurveTracesPath)) {
      archive.file(datacurveTracesPath, { name: 'datacurve-trace.log' });
    }

    // Setup progress reporting
    let lastProgressUpdate = 0;
    let filesProcessed = 0;
    let totalFiles = 0;

    // Track file count for progress calculation
    archive.on('entry', () => {
      filesProcessed++;
      if (totalFiles > 0) {
        const progressValue = Math.floor((filesProcessed / totalFiles) * 90);
        if (progressValue > lastProgressUpdate) {
          const increment = progressValue - lastProgressUpdate;
          lastProgressUpdate = progressValue;
          progress.report({
            increment: increment,
            message: `Exporting file ${filesProcessed} of ${totalFiles}`
          });
        }
      }
    });

    // Get file count for better progress reporting
    try {
      const files = await glob('traces.log*', { cwd: path.dirname(this.logFilePath) });
      totalFiles = files.length;
      // Add 1 to totalFiles if datacurve-traces.log exists
      if (fs.existsSync(datacurveTracesPath)) {
        totalFiles += 1;
      }
      progress.report({ increment: 5, message: `Exporting ${totalFiles} trace files...` });
    } catch (err) {
      console.error('Error getting file count:', err);
      progress.report({ increment: 5, message: 'Exporting trace files...' });
    }

    // Pipe archive to write stream
    archive.pipe(writeStream);

    return new Promise<vscode.Uri>((resolve, reject) => {
      writeStream.on('error', reject);
      archive.on('error', reject);

      archive.on('finish', () => {
        // Report completion
        progress.report({ increment: 100 - lastProgressUpdate, message: 'Export complete' });
        resolve(exportDestination);
      });

      // Finalize archive
      archive.finalize();
    });
  }

  /**
   * Cleans up resources when the recorder is no longer needed
   * Ensures all pending operations are complete before disposing
   */
  dispose(): void {
    // Ensure all operations are complete before disposing
    this.worker
      .enqueue(async () => {
        if (this.buffer.length > 0) {
          await this.flushBuffer();
        }

        if (this.writeStream) {
          const closePromise = new Promise<void>((resolve) => {
            this.writeStream!.end(() => {
              resolve();
            });
          });

          await closePromise;
          this.writeStream = null;
        }
      }, 10) // High priority for cleanup
      .catch((error) => {
        console.error('Error during dispose:', error);
      });
  }

  /**
   * Clears all trace logs by creating a new empty log file
   * Any existing log data will be lost
   */
  clearTraces(): void {
    // Clear traces by creating a new empty file
    this.worker.enqueue(async () => {
      if (this.writeStream) {
        await new Promise<void>((resolve) => {
          this.writeStream!.end(() => {
            resolve();
          });
        });
      }

      // clear all files in the log directory matching the pattern traces.log*
      const logDir = path.dirname(this.logFilePath);
      const logFiles = await glob('traces.log*', { cwd: logDir });
      for (const logFile of logFiles) {
        fs.unlinkSync(path.join(logDir, logFile));
      }

      // Create a new empty file
      this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'w' });
      this.setupStreamHandlers();

    }, 5); // Medium-high priority
  }

  /**
   * Gets diagnostic information about the recorder's current state
   * Useful for debugging and monitoring recorder performance
   *
   * @returns Object containing diagnostic metrics
   */
  getDiagnosticInfo(): object {
    return {
      bufferLength: this.buffer.length,
      bufferSizeBytes: this.bufferSizeBytes,
      queueSize: this.worker.getQueueSize(),
      flushCount: this.flushCount,
      isFlushPending: this.isFlushPending,
      logFileSize: this.getLogFileSize(),
    };
  }
}

export default WorkerFileRecorder;
