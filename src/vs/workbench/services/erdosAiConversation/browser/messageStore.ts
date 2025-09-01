/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ConversationMessage } from '../../erdosAi/common/conversationTypes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMessageStore } from '../common/messageStore.js';

export class MessageStore extends Disposable implements IMessageStore {
    readonly _serviceBrand: undefined;
    private messages: Map<number, ConversationMessage> = new Map();
    private messageOrder: number[] = [];

    constructor() {
        super();
    }



    public addMessageWithId(message: ConversationMessage): void {
        this.messages.set(message.id, message);
        
        const insertIndex = this.messageOrder.findIndex(id => id > message.id);
        if (insertIndex === -1) {
            this.messageOrder.push(message.id);
        } else {
            this.messageOrder.splice(insertIndex, 0, message.id);
        }
    }

    public getMessage(id: number): ConversationMessage | undefined {
        return this.messages.get(id);
    }

    public updateMessage(id: number, updates: Partial<ConversationMessage>): boolean {
        const message = this.messages.get(id);
        if (!message) {
            return false;
        }

        const updatedMessage = { ...message, ...updates };
        this.messages.set(id, updatedMessage);
        return true;
    }

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

    public getAllMessages(): ConversationMessage[] {
        return this.messageOrder
            .map(id => this.messages.get(id))
            .filter((msg): msg is ConversationMessage => msg !== undefined);
    }

    public getVisibleMessages(): ConversationMessage[] {
        return this.getAllMessages().filter(msg => !msg.procedural);
    }

    public getMessages(limit?: number, offset = 0): ConversationMessage[] {
        const allMessages = this.getAllMessages();
        
        if (limit === undefined) {
            return allMessages.slice(offset);
        }
        
        return allMessages.slice(offset, offset + limit);
    }



    public getMessageCount(): number {
        return this.messageOrder.length;
    }

    public clear(): void {
        this.messages.clear();
        this.messageOrder = [];
    }

    public loadMessages(messages: ConversationMessage[]): void {
        this.clear();
        
        const sortedMessages = messages.sort((a, b) => a.id - b.id);
        
        for (const message of sortedMessages) {
            this.messages.set(message.id, message);
            this.messageOrder.push(message.id);
        }
    }
}
