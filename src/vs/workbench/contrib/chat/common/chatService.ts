/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Location, ProviderResult } from 'vs/editor/common/languages';
import { FileType } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatAgentCommand, IChatAgentData } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatModel, IChatModel, IChatRequestVariableData, ISerializableChatData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatRequestVariableValue } from 'vs/workbench/contrib/chat/common/chatVariables';

export interface IChat {
	id: number; // TODO Maybe remove this and move to a subclass that only the provider knows about
	requesterUsername: string;
	requesterAvatarIconUri?: URI;
	responderUsername: string;
	responderAvatarIconUri?: URI;
	inputPlaceholder?: string;
	dispose?(): void;
}

export interface IChatRequest {
	session: IChat;
	message: string;
	variables: Record<string, IChatRequestVariableValue[]>;
}

export interface IChatResponseErrorDetails {
	message: string;
	responseIsIncomplete?: boolean;
	responseIsFiltered?: boolean;
	responseIsRedacted?: boolean;
}

export interface IChatResponse {
	session: IChat;
	errorDetails?: IChatResponseErrorDetails;
	timings?: {
		firstProgress?: number;
		totalElapsed: number;
	};
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

export interface IChatContentReference {
	reference: URI | Location;
	kind: 'reference';
}

export interface IChatContentInlineReference {
	inlineReference: URI | Location;
	name?: string;
	kind: 'inlineReference';
}

export interface IChatAgentDetection {
	agentName: string;
	command?: IChatAgentCommand;
	kind: 'agentDetection';
}

export interface IChatContent {
	content: string;
	kind: 'content';
}

export interface IChatMarkdownContent {
	content: IMarkdownString;
	kind: 'markdownContent';
}

export interface IChatTreeData {
	treeData: IChatResponseProgressFileTreeData;
	kind: 'treeData';
}

export interface IChatAsyncContent {
	/**
	 * The placeholder to show while the content is loading
	 */
	content: string;
	resolvedContent: Promise<string | IMarkdownString | IChatTreeData>;
	kind: 'asyncContent';
}

export interface IChatProgressMessage {
	content: IMarkdownString;
	kind: 'progressMessage';
}

export interface IChatAgentVulnerabilityDetails {
	title: string;
	description: string;
}

export interface IChatAgentContentWithVulnerabilities {
	content: string;
	vulnerabilities?: IChatAgentVulnerabilityDetails[];
	kind: 'vulnerability';
}

// TODO@roblourens Temp until I get MarkdownString out of ChatModel
export interface IChatAgentMarkdownContentWithVulnerability {
	content: IMarkdownString;
	vulnerabilities?: IChatAgentVulnerabilityDetails[];
	kind: 'markdownVuln';
}

export type IChatProgress =
	| IChatContent
	| IChatMarkdownContent
	| IChatAgentContentWithVulnerabilities
	| IChatAgentMarkdownContentWithVulnerability
	| IChatTreeData
	| IChatAsyncContent
	| IChatUsedContext
	| IChatContentReference
	| IChatContentInlineReference
	| IChatAgentDetection
	| IChatProgressMessage;

export interface IChatProvider {
	readonly id: string;
	readonly displayName: string;
	readonly iconUrl?: string;
	prepareSession(token: CancellationToken): ProviderResult<IChat | undefined>;
	provideWelcomeMessage?(token: CancellationToken): ProviderResult<(string | IMarkdownString | IChatReplyFollowup[])[] | undefined>;
	provideSampleQuestions?(token: CancellationToken): ProviderResult<IChatReplyFollowup[] | undefined>;
}

export interface IChatReplyFollowup {
	kind: 'reply';
	message: string;
	title?: string;
	tooltip?: string;
}

export interface IChatResponseCommandFollowup {
	kind: 'command';
	commandId: string;
	args?: any[];
	title: string; // supports codicon strings
	when?: string;
}

export type IChatFollowup = IChatReplyFollowup | IChatResponseCommandFollowup;

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

export enum ChatAgentCopyKind {
	// Keyboard shortcut or context menu
	Action = 1,
	Toolbar = 2
}

export interface IChatCopyAction {
	kind: 'copy';
	codeBlockIndex: number;
	copyKind: ChatAgentCopyKind;
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
	command: IChatResponseCommandFollowup;
}

export interface IChatFollowupAction {
	kind: 'followUp';
	followup: IChatReplyFollowup;
}

export interface IChatBugReportAction {
	kind: 'bug';
}

export type ChatUserAction = IChatVoteAction | IChatCopyAction | IChatInsertAction | IChatTerminalAction | IChatCommandAction | IChatFollowupAction | IChatBugReportAction;

export interface IChatUserActionEvent {
	action: ChatUserAction;
	providerId: string;
	agentId: string | undefined;
	sessionId: string;
	requestId: string;
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
	errorDetails?: IChatResponseErrorDetails;
	followups?: IChatFollowup[];
}

export interface IChatDetail {
	sessionId: string;
	title: string;
}

export interface IChatProviderInfo {
	id: string;
	displayName: string;
}

export interface IChatTransferredSessionData {
	sessionId: string;
	inputValue: string;
}

export const IChatService = createDecorator<IChatService>('IChatService');

export interface IChatService {
	_serviceBrand: undefined;
	transferredSessionData: IChatTransferredSessionData | undefined;

	onDidSubmitAgent: Event<{ agent: IChatAgentData; slashCommand: IChatAgentCommand; sessionId: string }>;
	onDidRegisterProvider: Event<{ providerId: string }>;
	registerProvider(provider: IChatProvider): IDisposable;
	hasSessions(providerId: string): boolean;
	getProviderInfos(): IChatProviderInfo[];
	startSession(providerId: string, token: CancellationToken): ChatModel | undefined;
	getSession(sessionId: string): IChatModel | undefined;
	getSessionId(sessionProviderId: number): string | undefined;
	getOrRestoreSession(sessionId: string): IChatModel | undefined;
	loadSessionFromContent(data: ISerializableChatData): IChatModel | undefined;

	/**
	 * Returns whether the request was accepted.
	 */
	sendRequest(sessionId: string, message: string): Promise<{ responseCompletePromise: Promise<void> } | undefined>;
	removeRequest(sessionid: string, requestId: string): Promise<void>;
	cancelCurrentRequestForSession(sessionId: string): void;
	clearSession(sessionId: string): void;
	addCompleteRequest(sessionId: string, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, response: IChatCompleteResponse): void;
	sendRequestToProvider(sessionId: string, message: IChatDynamicRequest): void;
	getHistory(): IChatDetail[];
	clearAllHistoryEntries(): void;
	removeHistoryEntry(sessionId: string): void;

	onDidPerformUserAction: Event<IChatUserActionEvent>;
	notifyUserAction(event: IChatUserActionEvent): void;
	onDidDisposeSession: Event<{ sessionId: string; providerId: string; reason: 'initializationFailed' | 'cleared' }>;

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void;
}
