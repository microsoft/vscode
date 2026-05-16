import fs from 'fs';
import path from 'path';
import { app } from 'electron';

class Logger {
  private logPath: string;

  constructor() {
    this.logPath = path.join(app.getPath('userData'), 'app.log');
  }

  private write(level: string, message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;

    console.log(logMessage.trim());

    try {
      fs.appendFileSync(this.logPath, logMessage, 'utf8');
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }

  info(message: string) {
    this.write('INFO', message);
  }

  warn(message: string) {
    this.write('WARN', message);
  }

  error(message: string, error?: any) {
    const errorMessage = error ? `${message} ${error.stack || error}` : message;
    this.write('ERROR', errorMessage);
  }
}

export const logger = new Logger();
