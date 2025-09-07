/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';

/**
 * Mutex for conversation save operations to prevent race conditions
 * Ensures only one save operation can happen at a time per conversation
 */
export class ConversationSaveMutex extends Disposable {
    readonly _serviceBrand: undefined;
    private readonly conversationLocks = new Map<number, Promise<void>>();
    private readonly saveQueue = new Map<number, Array<() => Promise<void>>>();

    constructor(
        @ILogService private readonly logService: ILogService
    ) {
        super();
    }

    /**
     * Execute a save operation with mutex protection
     * @param conversationId The conversation ID to lock
     * @param saveOperation The async save operation to execute
     */
    async executeSave<T>(conversationId: number, saveOperation: () => Promise<T>): Promise<T> {
        const lockKey = conversationId;
        
        // Create a promise for this save operation
        const savePromise = new Promise<T>((resolve, reject) => {
            const wrappedOperation = async () => {
                try {
                    const result = await saveOperation();
                    resolve(result);
                } catch (error) {
                    this.logService.error(`[SAVE_MUTEX] Save operation failed for conversation ${conversationId}:`, error);
                    reject(error);
                }
            };

            // Add to queue
            if (!this.saveQueue.has(lockKey)) {
                this.saveQueue.set(lockKey, []);
            }
            this.saveQueue.get(lockKey)!.push(wrappedOperation);
        });

        // Process the queue for this conversation
        this.processQueue(lockKey);

        return savePromise;
    }

    private async processQueue(conversationId: number): Promise<void> {
        // If there's already a lock for this conversation, wait for it
        if (this.conversationLocks.has(conversationId)) {
            await this.conversationLocks.get(conversationId);
        }

        const queue = this.saveQueue.get(conversationId);
        if (!queue || queue.length === 0) {
            return;
        }

        // Create a new lock for this conversation
        const lockPromise = this.processQueueInternal(conversationId);
        this.conversationLocks.set(conversationId, lockPromise);

        try {
            await lockPromise;
        } finally {
            // Remove the lock when done
            this.conversationLocks.delete(conversationId);
        }
    }

    private async processQueueInternal(conversationId: number): Promise<void> {
        const queue = this.saveQueue.get(conversationId);
        if (!queue) {
            return;
        }

        // Process all operations in sequence
        while (queue.length > 0) {
            const operation = queue.shift()!;
            try {
                await operation();
            } catch (error) {
                this.logService.error(`[SAVE_MUTEX] Queue operation failed for conversation ${conversationId}:`, error);
                // Continue processing other operations even if one fails
            }
        }

        // Clean up empty queue
        if (queue.length === 0) {
            this.saveQueue.delete(conversationId);
        }
    }

    /**
     * Check if there are pending save operations for a conversation
     */
    hasPendingOperations(conversationId: number): boolean {
        const queue = this.saveQueue.get(conversationId);
        return (queue && queue.length > 0) || this.conversationLocks.has(conversationId);
    }

    /**
     * Wait for all pending save operations to complete for a conversation
     */
    async waitForPendingOperations(conversationId: number): Promise<void> {
        const lock = this.conversationLocks.get(conversationId);
        if (lock) {
            await lock;
        }
    }

    override dispose(): void {
        super.dispose();
        this.conversationLocks.clear();
        this.saveQueue.clear();
    }
}
