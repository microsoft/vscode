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
	getDiffDataForMessage(messageId: string): Promise<any>;
	executeStreamingForOrchestrator(message: string, userMessageId: number, requestId: string): Promise<void>;
	cancelStreaming(): Promise<void>;
	listConversations(): Promise<ConversationInfo[]>;
	deleteConversation(id: number): Promise<boolean>;
	deleteAllConversations(): Promise<boolean>;
	renameConversation(id: number, name: string): Promise<boolean>;
	isConversationBlank(id: number): Promise<boolean>;
	findHighestBlankConversation(): Promise<number | null>;
	checkBackendHealth(): Promise<boolean>;
	getBackendEnvironment(): Promise<string>;
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
	fireWidgetButtonAction(messageId: number, action: string): void;
	
	// Orchestrator methods (moved inline)
	startAiSearch(query: string, requestId: string): void;
	continueConversation(relatedToId: number, requestId: string): void;
	handleFunctionCompletion(status: string, data: any): void;
	cancel(): void;
	
	// Command handler methods
	acceptConsoleCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}>;
	acceptTerminalCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}>;
	acceptSearchReplaceCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}>;
	acceptDeleteFileCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}>;
	acceptFileCommand(messageId: number, command: string, requestId: string): Promise<{status: string, data: any}>;
	cancelConsoleCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;
	cancelTerminalCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;
	cancelSearchReplaceCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;
	cancelDeleteFileCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;
	cancelFileCommand(messageId: number, requestId: string): Promise<{status: string, data: any}>;
	updateMessageContent(messageId: number, content: string): Promise<boolean>;
	
	// Additional methods needed by contextService
	extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string>;
	getHelpAsMarkdown(topic: string, packageName?: string, language?: 'R' | 'Python'): Promise<string>;
	
	// Settings methods needed by SettingsPanel
	getAvailableModels(): Promise<string[]>;
	getSelectedModel(): Promise<string>;
	getTemperature(): Promise<number>;
	getSecurityMode(): Promise<'secure' | 'improve'>;
	getWebSearchEnabled(): Promise<boolean>;
	setSelectedModel(model: string): Promise<boolean>;
	setTemperature(temperature: number): Promise<boolean>;
	setSecurityMode(mode: 'secure' | 'improve'): Promise<boolean>;
	setWebSearchEnabled(enabled: boolean): Promise<boolean>;
}
