/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Command, Location, TextEdit } from 'vs/editor/common/languages';
import { FileType } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ChatAgentLocation, IChatAgentCommand, IChatAgentData, IChatAgentResult } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatModel, IChatModel, IChatRequestModel, IChatRequestVariableData, IExportableChatData, ISerializableChatData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatParserContext } from 'vs/workbench/contrib/chat/common/chatRequestParser';
import { IChatRequestVariableValue } from 'vs/workbench/contrib/chat/common/chatVariables';

export interface IChatRequest {
	message: string;
	variables: Record<string, IChatRequestVariableValue[]>;
}

export interface IChatResponseErrorDetails {
	message: string;
	responseIsIncomplete?: boolean;
	responseIsFiltered?: boolean;
	responseIsRedacted?: boolean;
}

export interface IChatResponseProgressFileTreeData {
	label: string;
	uri: URI;
	type?: FileType;
	children?: IChatResponseProgressFileTreeData[];
}

export type IDocumentContext = {
	uri: URI;
	version: number;
	ranges: IRange[];
};

export function isIDocumentContext(obj: unknown): obj is IDocumentContext {
	return (
		!!obj &&
		typeof obj === 'object' &&
		'uri' in obj && obj.uri instanceof URI &&
		'version' in obj && typeof obj.version === 'number' &&
		'ranges' in obj && Array.isArray(obj.ranges) && obj.ranges.every(Range.isIRange)
	);
}

export interface IChatUsedContext {
	documents: IDocumentContext[];
	kind: 'usedContext';
}

export function isIUsedContext(obj: unknown): obj is IChatUsedContext {
	return (
		!!obj &&
		typeof obj === 'object' &&
		'documents' in obj &&
		Array.isArray(obj.documents) &&
		obj.documents.every(isIDocumentContext)
	);
}

export interface IChatContentVariableReference {
	variableName: string;
	value?: URI | Location;
}

export interface IChatContentReference {
	reference: URI | Location | IChatContentVariableReference;
	iconPath?: ThemeIcon | { light: URI; dark: URI };
	kind: 'reference';
}

export interface IChatContentInlineReference {
	inlineReference: URI | Location;
	name?: string;
	kind: 'inlineReference';
}

export interface IChatAgentDetection {
	agentId: string;
	command?: IChatAgentCommand;
	kind: 'agentDetection';
}

export interface IChatMarkdownContent {
	content: IMarkdownString;
	kind: 'markdownContent';
}

export interface IChatTreeData {
	treeData: IChatResponseProgressFileTreeData;
	kind: 'treeData';
}

export interface IChatProgressMessage {
	content: IMarkdownString;
	kind: 'progressMessage';
}

export interface IChatWarningMessage {
	content: IMarkdownString;
	kind: 'warning';
}

export interface IChatAgentVulnerabilityDetails {
	title: string;
	description: string;
}

export interface IChatAgentMarkdownContentWithVulnerability {
	content: IMarkdownString;
	vulnerabilities: IChatAgentVulnerabilityDetails[];
	kind: 'markdownVuln';
}

export interface IChatCommandButton {
	command: Command;
	kind: 'command';
}

export interface IChatTextEdit {
	uri: URI;
	edits: TextEdit[];
	kind: 'textEdit';
}

export type IChatProgress =
	| IChatMarkdownContent
	| IChatAgentMarkdownContentWithVulnerability
	| IChatTreeData
	| IChatUsedContext
	| IChatContentReference
	| IChatContentInlineReference
	| IChatAgentDetection
	| IChatProgressMessage
	| IChatCommandButton
	| IChatWarningMessage
	| IChatTextEdit;

export interface IChatFollowup {
	kind: 'reply';
	message: string;
	agentId: string;
	subCommand?: string;
	title?: string;
	tooltip?: string;
}

// Name has to match the one in vscode.d.ts for some reason
export enum InteractiveSessionVoteDirection {
	Down = 0,
	Up = 1
}

export interface IChatVoteAction {
	kind: 'vote';
	direction: InteractiveSessionVoteDirection;
	reportIssue?: boolean;
}

export enum ChatCopyKind {
	// Keyboard shortcut or context menu
	Action = 1,
	Toolbar = 2
}

export interface IChatCopyAction {
	kind: 'copy';
	codeBlockIndex: number;
	copyKind: ChatCopyKind;
	copiedCharacters: number;
	totalCharacters: number;
	copiedText: string;
}

export interface IChatInsertAction {
	kind: 'insert';
	codeBlockIndex: number;
	totalCharacters: number;
	newFile?: boolean;
}

export interface IChatTerminalAction {
	kind: 'runInTerminal';
	codeBlockIndex: number;
	languageId?: string;
}

export interface IChatCommandAction {
	kind: 'command';
	commandButton: IChatCommandButton;
}

export interface IChatFollowupAction {
	kind: 'followUp';
	followup: IChatFollowup;
}

export interface IChatBugReportAction {
	kind: 'bug';
}

export interface IChatInlineChatCodeAction {
	kind: 'inlineChat';
	action: 'accepted' | 'discarded';
}

export type ChatUserAction = IChatVoteAction | IChatCopyAction | IChatInsertAction | IChatTerminalAction | IChatCommandAction | IChatFollowupAction | IChatBugReportAction | IChatInlineChatCodeAction;

export interface IChatUserActionEvent {
	action: ChatUserAction;
	agentId: string | undefined;
	sessionId: string;
	requestId: string;
	result: IChatAgentResult | undefined;
}

export interface IChatDynamicRequest {
	/**
	 * The message that will be displayed in the UI
	 */
	message: string;

	/**
	 * Any extra metadata/context that will go to the provider.
	 */
	metadata?: any;
}

export interface IChatCompleteResponse {
	message: string | ReadonlyArray<IChatProgress>;
	result?: IChatAgentResult;
	followups?: IChatFollowup[];
}

export interface IChatDetail {
	sessionId: string;
	title: string;
}

export interface IChatProviderInfo {
	id: string;
}

export interface IChatTransferredSessionData {
	sessionId: string;
	inputValue: string;
}

export interface IChatSendRequestData {
	responseCompletePromise: Promise<void>;
	agent: IChatAgentData;
	slashCommand?: IChatAgentCommand;
}

export interface IChatSendRequestOptions {
	implicitVariablesEnabled?: boolean;
	location?: ChatAgentLocation;
	parserContext?: IChatParserContext;
	attempt?: number;
	noCommandDetection?: boolean;
}

export const IChatService = createDecorator<IChatService>('IChatService');

export interface IChatService {
	_serviceBrand: undefined;
	transferredSessionData: IChatTransferredSessionData | undefined;

	isEnabled(location: ChatAgentLocation): boolean;
	hasSessions(): boolean;
	startSession(location: ChatAgentLocation, token: CancellationToken): ChatModel | undefined;
	getSession(sessionId: string): IChatModel | undefined;
	getOrRestoreSession(sessionId: string): IChatModel | undefined;
	loadSessionFromContent(data: IExportableChatData | ISerializableChatData): IChatModel | undefined;

	/**
	 * Returns whether the request was accepted.
	 */
	sendRequest(sessionId: string, message: string, options?: IChatSendRequestOptions): Promise<IChatSendRequestData | undefined>;

	resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions): Promise<void>;

	removeRequest(sessionid: string, requestId: string): Promise<void>;
	cancelCurrentRequestForSession(sessionId: string): void;
	clearSession(sessionId: string): void;
	addCompleteRequest(sessionId: string, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, attempt: number | undefined, response: IChatCompleteResponse): void;
	getHistory(): IChatDetail[];
	clearAllHistoryEntries(): void;
	removeHistoryEntry(sessionId: string): void;

	onDidPerformUserAction: Event<IChatUserActionEvent>;
	notifyUserAction(event: IChatUserActionEvent): void;
	onDidDisposeSession: Event<{ sessionId: string; reason: 'initializationFailed' | 'cleared' }>;

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void;
}

export const KEYWORD_ACTIVIATION_SETTING_ID = 'accessibility.voice.keywordActivation';
