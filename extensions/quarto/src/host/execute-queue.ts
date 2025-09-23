/*
 * execute-queue.ts
 *
 * Copyright (C) 2024 by Posit Software, PBC
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

import PQueue from 'p-queue';

/**
 * Language specific execution queue
 *
 * A singleton class that constructs and manages multiple execution queues, identified by
 * their `key` (typically the language name).
 */
export class ExecuteQueue {
  /// Singleton instance
  private static _instance: ExecuteQueue;

  /// Maps a `key` to its `queue`
  private _queues = new Map<string, PQueue>();

  /**
   * Constructor
   *
   * Private since we only want one of these. Access using `instance()` instead.
   */
  private constructor() { }

  /**
   * Accessor for the singleton instance
   *
   * Creates it if it doesn't exist.
   */
  static get instance(): ExecuteQueue {
    if (!ExecuteQueue._instance) {
      // Initialize if we've never accessed it
      ExecuteQueue._instance = new ExecuteQueue();
    }

    return ExecuteQueue._instance;
  }

  /**
   * Add a `callback` for execution on `key`'s task queue
   *
   * Returns a promise that resolves when the task finishes
   */
  async add(key: string, callback: () => Promise<void>): Promise<void> {
    let queue = this._queues.get(key);

    if (queue === undefined) {
      // If we've never initialized this key's queue, do so now.
      // Limit `concurrency` to 1, because we don't want tasks run out of order.
      queue = new PQueue({ concurrency: 1 });
      this._queues.set(key, queue);
    }

    return queue.add(callback);
  }
}
