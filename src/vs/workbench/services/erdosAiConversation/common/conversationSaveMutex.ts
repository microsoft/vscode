/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IConversationSaveMutex = createDecorator<IConversationSaveMutex>('conversationSaveMutex');

export interface IConversationSaveMutex {
    readonly _serviceBrand: undefined;

    /**
     * Execute a save operation with mutex protection
     * @param conversationId The conversation ID to lock
     * @param saveOperation The async save operation to execute
     */
    executeSave<T>(conversationId: number, saveOperation: () => Promise<T>): Promise<T>;

    /**
     * Check if there are pending save operations for a conversation
     */
    hasPendingOperations(conversationId: number): boolean;

    /**
     * Wait for all pending save operations to complete for a conversation
     */
    waitForPendingOperations(conversationId: number): Promise<void>;
}






