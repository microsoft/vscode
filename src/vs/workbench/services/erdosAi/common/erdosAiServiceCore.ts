/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { Conversation, ConversationInfo } from './conversationTypes.js';

export const IErdosAiServiceCore = createDecorator<IErdosAiServiceCore>('erdosAiServiceCore');
export const ERDOS_AI_VIEW_ID = 'workbench.panel.erdosAi';

export interface IErdosAiServiceCore {
	readonly _serviceBrand: undefined;

	newConversation(name?: string): Promise<Conversation>;
	loadConversation(id: number): Promise<Conversation | null>;
	sendMessage(message: string): Promise<void>;
	getDiffDataForMessage(messageId: string): any;
	executeStreamingForOrchestrator(message: string, userMessageId: number, requestId: string): Promise<void>;
	cancelStreaming(): Promise<void>;
	listConversations(): Promise<ConversationInfo[]>;
	deleteConversation(id: number): Promise<boolean>;
	deleteAllConversations(): Promise<boolean>;
	renameConversation(id: number, name: string): Promise<boolean>;
	isConversationBlank(id: number): Promise<boolean>;
	findHighestBlankConversation(): Promise<number | null>;
	generateRequestId(): string;
	getCurrentRequestId(): string | undefined;
	getCurrentConversation(): Conversation | null;
	getNextMessageId(): number;
	revertToMessage(messageId: number): Promise<{ status: string; message?: string }>;
	updateMessageContent(messageId: number, content: string): Promise<boolean>;
	
	// Events
	readonly onConversationCreated: Event<Conversation>;
	readonly onConversationLoaded: Event<Conversation>;
	readonly onMessageAdded: Event<any>;
	readonly onStreamingData: Event<any>;
	readonly onStreamingComplete: Event<void>;
	readonly onStreamingError: Event<any>;
	readonly onThinkingMessage: Event<any>;
	readonly onOrchestratorStateChange: Event<{isProcessing: boolean}>;
	readonly onFunctionCallDisplayMessage: Event<any>;
	readonly onWidgetRequested: Event<any>;
	readonly onWidgetStreamingUpdate: Event<any>;
	readonly onWidgetButtonAction: Event<any>;
	readonly onShowConversationHistory: Event<void>;
	readonly onShowSettings: Event<void>;
	
	showConversationHistory(): Promise<void>;
	showSettings(): Promise<void>;
	showThinkingMessage(message?: string): void;
	hideThinkingMessage(): void;
	isWidgetStreamingComplete(messageId: number): boolean;
	fireWidgetButtonAction(messageId: number, action: string): void;
	
	// Method needed by context service and widgets
	extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): string;
	
	
	// New widget decision methods
	setWidgetDecision(functionType: string, messageId: number, decision: 'accept' | 'cancel', content?: string, requestId?: string): void;
	signalProcessingContinuation(): void;
	processAllWork(): Promise<void>;
	
}
