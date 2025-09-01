/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { 
    Conversation, 
    ConversationInfo, 
    ConversationMessage, 
    StreamingMessage, 
    MessageMetadata,
    ConversationPaths
} from '../../erdosAi/common/conversationTypes.js';

export const IConversationManager = createDecorator<IConversationManager>('conversationManager');

export interface IConversationManager {
	readonly _serviceBrand: undefined;

	setMessageIdGenerator(generator: () => number): void;
	getCurrentConversation(): Conversation | null;
	addMessage(conversationId: number, role: 'user' | 'assistant', content: string, metadata?: Partial<MessageMetadata>): Promise<ConversationMessage>;
	addMessageWithId(message: ConversationMessage): Promise<void>;
	addFunctionCallMessage(
		conversationId: number, 
		messageId: number, 
		functionCall: any, 
		relatedToId: number,
		createPendingOutput?: boolean,
		pendingOutputId?: number,
		requestId?: string
	): Promise<ConversationMessage>;
	addFunctionCallOutput(functionCallOutput: any): Promise<void>;
	getMessages(): ConversationMessage[];
	getNextMessageId(): number;
	getConversationPaths(id: number): ConversationPaths;
	createNewConversation(name?: string): Promise<Conversation>;
	saveConversationLog(conversation: Conversation): Promise<void>;
	loadConversation(id: number): Promise<Conversation | null>;
	switchToConversation(id: number): Promise<boolean>;
	deleteConversation(id: number): Promise<boolean>;
	deleteAllConversations(): Promise<boolean>;
	renameConversation(id: number, newName: string): Promise<boolean>;
	listConversations(): Promise<ConversationInfo[]>;
	isConversationBlank(id: number): Promise<boolean>;
	findHighestBlankConversation(): Promise<number | null>;
	addUserMessage(content: string, metadata?: MessageMetadata): number;
	addAssistantMessage(content: string, metadata?: MessageMetadata): number;
	updateMessage(id: number, updates: Partial<ConversationMessage>): boolean;
	getCurrentMessages(): ConversationMessage[];
	startStreamingMessage(initialContent?: string): StreamingMessage;
	startStreamingMessageWithId(messageId: number, initialContent?: string): StreamingMessage;
	updateStreamingMessage(content: string, append?: boolean): void;
	completeStreamingMessage(metadata?: MessageMetadata, contentProcessor?: (content: string) => string): number;
	cancelStreamingMessage(): void;
	getCurrentStreamingMessage(): StreamingMessage | undefined;
	addMessageWithSpecificId(message: ConversationMessage): void;
	clearStreaming(): void;
	shouldPromptForName(conversationId: number): Promise<boolean>;
	generateAIConversationName(conversationId: number, backendClient: any): Promise<string | null>;
	generateConversationName(firstMessage: string): string;
	hasNewerMessages(conversation: any, functionCallMessageId: number, callId: string): boolean;
	triggerConversationNameCheck(): void;
	replacePendingFunctionCallOutput(callId: string, actualOutput: string, success?: boolean): Promise<void>;
	updateConversationDisplay(): Promise<void>;
}
