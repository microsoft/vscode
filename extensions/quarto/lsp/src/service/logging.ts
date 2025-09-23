/*
 * logging.ts
 *
 * Copyright (C) 2023 by Posit Software, PBC
 * Copyright (c) Microsoft Corporation. All rights reserved.
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

/**
 * The level of verbosity that the language service logs at.
 */
export enum LogLevel {
  /** Log extremely verbose info about language server operation, such as calls into the file system */
  Trace,

  /** Log verbose info about language server operation, such as when references are re-computed for a md file. */
  Debug,

  /** Informational messages that highlight the progress of the application at coarse-grained level. */
  Info,

  /** Potentially harmful situations which still allow the application to continue running. */
  Warn,

  /** Error events that might still allow the application to continue running. */
  Error,
}

/**
 * Logs debug messages from the language service
 */
export interface ILogger {
  /**
   * Get the current log level.
   */
  get level(): LogLevel;

  /**
   * Log a message at a given log level.
   *
   * @param level The level the message should be logged at.
   * @param message The main text of the log.
   * @param data Additional information about what is being logged.
   */
  log(level: LogLevel, message: string, data?: Record<string, unknown>): void;

  logTrace(message: string, data?: Record<string, unknown>): void;
  logDebug(message: string, data?: Record<string, unknown>): void;
  logInfo(message: string, data?: Record<string, unknown>): void;
  logWarn(message: string, data?: Record<string, unknown>): void;
  logError(message: string, data?: Record<string, unknown>): void;

  /**
   * Log notification at Trace level.
   * @param method Message type name.
   */
  logNotification(method: string, data?: Record<string, unknown>): void;

  /**
   * Log request at Trace level.
   * @param method Message type name.
   */
  logRequest(method: string, data?: Record<string, unknown>): void;
}
