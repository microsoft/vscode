/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConversationMessage } from './conversationTypes.js';

/**
 * Manages message storage and retrieval within a conversation
 * Maintains sequential IDs and handles message persistence
 */
export class MessageStore {
    private messages: Map<number, ConversationMessage> = new Map();
    private messageOrder: number[] = [];
    private nextId = 1;

    /**
     * This method should not be used - all ID generation should go through the centralized service
     */
    public getNextMessageId(): number {
        throw new Error('MessageStore.getNextMessageId() is deprecated - use external message ID generator');
    }

    /**
     * DEPRECATED: Add a new message to the store
     * @param message Message data (without ID and timestamp)
     * @returns The assigned message ID
     * 
     * NOTE: This method should not be used - ConversationManager should handle message creation
     * with proper external ID generation
     */
    public addMessage(message: Omit<ConversationMessage, 'id' | 'timestamp'>): number {
        throw new Error('MessageStore.addMessage() is deprecated - use ConversationManager.addMessage() with external ID generator');
    }

    /**
     * @param message Complete message with ID and timestamp
     */
    public addMessageWithId(message: ConversationMessage): void {
        this.messages.set(message.id, message);
        
        // Insert message ID in sorted order instead of just pushing
        const insertIndex = this.messageOrder.findIndex(id => id > message.id);
        if (insertIndex === -1) {
            // All existing IDs are smaller, append to end
            this.messageOrder.push(message.id);
        } else {
            // Insert at the correct position to maintain sorted order
            this.messageOrder.splice(insertIndex, 0, message.id);
        }
        
        // Update next ID to ensure we don't conflict with externally generated IDs
        if (message.id >= this.nextId) {
            this.nextId = message.id + 1;
        }
    }

    /**
     * Get a message by ID
     * @param id Message ID
     * @returns Message or undefined if not found
     */
    public getMessage(id: number): ConversationMessage | undefined {
        return this.messages.get(id);
    }

    /**
     * Update an existing message
     * @param id Message ID
     * @param updates Partial message updates
     * @returns True if message was updated, false if not found
     */
    public updateMessage(id: number, updates: Partial<ConversationMessage>): boolean {
        const message = this.messages.get(id);
        if (!message) {
            return false;
        }

        const updatedMessage = { ...message, ...updates };
        this.messages.set(id, updatedMessage);
        return true;
    }

    /**
     * Delete a message by ID
     * @param id Message ID
     * @returns True if message was deleted, false if not found
     */
    public deleteMessage(id: number): boolean {
        const deleted = this.messages.delete(id);
        if (deleted) {
            const index = this.messageOrder.indexOf(id);
            if (index !== -1) {
                this.messageOrder.splice(index, 1);
            }
        }
        return deleted;
    }

    /**
     * Get all messages in chronological order
     * @returns Array of messages sorted by creation order
     */
    public getAllMessages(): ConversationMessage[] {
        return this.messageOrder
            .map(id => this.messages.get(id))
            .filter((msg): msg is ConversationMessage => msg !== undefined);
    }

    /**
     * Get messages with pagination
     * @param limit Maximum number of messages to return
     * @param offset Number of messages to skip from the beginning
     * @returns Array of messages
     */
    public getMessages(limit?: number, offset = 0): ConversationMessage[] {
        const allMessages = this.getAllMessages();
        
        if (limit === undefined) {
            return allMessages.slice(offset);
        }
        
        return allMessages.slice(offset, offset + limit);
    }

    /**
     * Get the most recent messages
     * @param count Number of recent messages to return
     * @returns Array of most recent messages
     */
    public getRecentMessages(count: number): ConversationMessage[] {
        const allMessages = this.getAllMessages();
        return allMessages.slice(-count);
    }

    /**
     * Find messages by criteria
     * @param predicate Function to test each message
     * @returns Array of matching messages
     */
    public findMessages(predicate: (message: ConversationMessage) => boolean): ConversationMessage[] {
        return this.getAllMessages().filter(predicate);
    }

    /**
     * Get the total number of messages
     * @returns Message count
     */
    public getMessageCount(): number {
        return this.messageOrder.length;
    }

    /**
     * Clear all messages
     */
    public clear(): void {
        this.messages.clear();
        this.messageOrder = [];
        this.nextId = 1;
    }

    /**
     * Load messages from an array (for persistence)
     * @param messages Array of messages to load
     */
    public loadMessages(messages: ConversationMessage[]): void {
        this.clear();
        
        // Sort messages by ID to ensure proper order
        const sortedMessages = messages.sort((a, b) => a.id - b.id);
        
        for (const message of sortedMessages) {
            this.messages.set(message.id, message);
            this.messageOrder.push(message.id);
            
            // Update next ID to be higher than any existing ID
            if (message.id >= this.nextId) {
                this.nextId = message.id + 1;
            }
        }
    }

    /**
     * Export messages as an array (for persistence)
     * @returns Array of all messages
     */
    public exportMessages(): ConversationMessage[] {
        return this.getAllMessages();
    }

    /**
     * Get messages that are not procedural (visible in UI)
     * @returns Array of non-procedural messages
     */
    public getVisibleMessages(): ConversationMessage[] {
        return this.getAllMessages().filter(msg => !msg.procedural);
    }

    /**
     * Get the last user message
     * @returns Last user message or undefined
     */
    public getLastUserMessage(): ConversationMessage | undefined {
        const messages = this.getAllMessages();
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                return messages[i];
            }
        }
        return undefined;
    }

    /**
     * Get the last assistant message
     * @returns Last assistant message or undefined
     */
    public getLastAssistantMessage(): ConversationMessage | undefined {
        const messages = this.getAllMessages();
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
                return messages[i];
            }
        }
        return undefined;
    }
}
