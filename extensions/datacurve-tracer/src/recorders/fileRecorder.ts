import * as vscode from 'vscode';
import { ITrace } from '../types';
import { Recorder } from './recorder';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import archiver from 'archiver';

class FileRecorder extends Recorder {
  private logFilePath: string;
  private buffer: string[];
  private bufferSize: number;
  private writeStream: fs.WriteStream;
  private maxLogSize: number = 100 * 1024 * 1024; // 100MB

  constructor(context: vscode.ExtensionContext) {
    super(context);
    if (!context.storageUri) {
      throw new Error('StorageUri is undefined in the extension context.');
    }
    this.logFilePath = path.join(context.storageUri.fsPath, 'traces.log');
    this.buffer = [];
    this.bufferSize = 10; // Adjust buffer size as needed
    // create folder if it doesn't exist
    if (!fs.existsSync(context.storageUri.fsPath)) {
      fs.mkdirSync(context.storageUri.fsPath);
    }
    this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
  }

  async record(trace: ITrace): Promise<void> {
    if (!trace.timestamp) {
      trace.timestamp = Date.now();
    }
    try {
      console.log('Recording trace:', trace);
      const logEntry = JSON.stringify(trace) + '\n';
      this.buffer.push(logEntry);

      if (this.buffer.length >= this.bufferSize) {
        this.flushBuffer();
      }

      if (this.getLogFileSize() >= this.maxLogSize) {
        await this.rotateLog();
      }
    } catch (error) {
      console.error('Failed to record trace:', error);
    } finally {
      // Async functions automatically return a resolved Promise
    }
  }

  private flushBuffer(): void {
    const logEntries = this.buffer.join('');
    this.buffer = [];

    this.writeStream.write(logEntries, (error) => {
      if (error) {
        console.error('Failed to write log entries:', error);
      }
    });
  }

  private getLogFileSize(): number {
    if (fs.existsSync(this.logFilePath)) {
      const stats = fs.statSync(this.logFilePath);
      return stats.size;
    }
    return 0;
  }

  private async rotateLog(): Promise<void> {
    this.flushBuffer();
    this.writeStream.end();

    const rotatedLogFilePath = `${this.logFilePath}.${Date.now()}.gz`;
    await this.compressLogFile(this.logFilePath, rotatedLogFilePath);

    this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
  }

  private compressLogFile(source: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(source);
      const writeStream = fs.createWriteStream(destination);
      const gzip = zlib.createGzip();

      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on('finish', () => {
          fs.unlinkSync(source);
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

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

  private async exportToDestination(
    exportDestination: vscode.Uri,
  ): Promise<vscode.Uri> {
    // initialize archiver
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: {
        level: 9,
      },
    });

    // create write stream to export destination
    const writeStream = fs.createWriteStream(exportDestination.fsPath);

    // add log files to archive
    archive.glob('traces.log*', {
      cwd: path.dirname(this.logFilePath),
    });

    // pipe archive to write stream
    archive.pipe(writeStream);
    const prom = new Promise((resolve, reject) => {
      archive.on('finish', () => {
        resolve(exportDestination);
      });
      archive.on('error', (error: Error) => {
        reject(error);
      });
    });

    // finalize archive after promise is registered
    archive.finalize();
    return prom as Promise<vscode.Uri>;
  }

  async export(): Promise<vscode.Uri> {
    // Flush any remaining buffered log entries
    this.flushBuffer();
    // Prompt user for export destination
    const exportDestination = await this.promptForExportDestination();
    // Export log files to destination
    return this.exportToDestination(exportDestination);
  }

  dispose(): void {
    this.flushBuffer(); // Ensure all buffered entries are written before disposing
    this.writeStream.end();
  }
}

export default FileRecorder;
