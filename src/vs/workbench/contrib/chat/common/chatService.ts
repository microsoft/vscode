/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { ISelection } from '../../../../editor/common/core/selection.js';
import { Command, Location, TextEdit } from '../../../../editor/common/languages.js';
import { FileType } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICellEditOperation } from '../../notebook/common/notebookCommon.js';
import { IWorkspaceSymbol } from '../../search/common/search.js';
import { IChatAgentCommand, IChatAgentData, IChatAgentResult } from './chatAgents.js';
import { ChatModel, IChatModel, IChatRequestModel, IChatRequestVariableData, IChatRequestVariableEntry, IChatResponseModel, IExportableChatData, ISerializableChatData } from './chatModel.js';
import { IParsedChatRequest } from './chatParserTypes.js';
import { IChatParserContext } from './chatRequestParser.js';
import { IChatRequestVariableValue } from './chatVariables.js';
import { ChatAgentLocation, ChatMode } from './constants.js';
import { IPreparedToolInvocation, IToolConfirmationMessages, IToolResult } from './languageModelToolsService.js';

export interface IChatRequest {
	message: string;
	variables: Record<string, IChatRequestVariableValue[]>;
}

export enum ChatErrorLevel {
	Info = 0,
	Warning = 1,
	Error = 2
}

export interface IChatResponseErrorDetails {
	message: string;
	responseIsIncomplete?: boolean;
	responseIsFiltered?: boolean;
	responseIsRedacted?: boolean;
	isQuotaExceeded?: boolean;
	level?: ChatErrorLevel;
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

export enum ChatResponseReferencePartStatusKind {
	Complete = 1,
	Partial = 2,
	Omitted = 3
}

export interface IChatContentReference {
	reference: URI | Location | IChatContentVariableReference | string;
	iconPath?: ThemeIcon | { light: URI; dark?: URI };
	options?: { status?: { description: string; kind: ChatResponseReferencePartStatusKind } };
	kind: 'reference';
}

export interface IChatCodeCitation {
	value: URI;
	license: string;
	snippet: string;
	kind: 'codeCitation';
}

export interface IChatContentInlineReference {
	resolveId?: string;
	inlineReference: URI | Location | IWorkspaceSymbol;
	name?: string;
	kind: 'inlineReference';
}

export interface IChatMarkdownContent {
	content: IMarkdownString;
	inlineReferences?: Record<string, IChatContentInlineReference>;
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

export interface IChatTask extends IChatTaskDto {
	deferred: DeferredPromise<string | void>;
	progress: (IChatWarningMessage | IChatContentReference)[];
	onDidAddProgress: Event<IChatWarningMessage | IChatContentReference>;
	add(progress: IChatWarningMessage | IChatContentReference): void;

	complete: (result: string | void) => void;
	task: () => Promise<string | void>;
	isSettled: () => boolean;
}

export interface IChatUndoStop {
	kind: 'undoStop';
	id: string;
}

export interface IChatTaskDto {
	content: IMarkdownString;
	kind: 'progressTask';
}

export interface IChatTaskResult {
	content: IMarkdownString | void;
	kind: 'progressTaskResult';
}

export interface IChatWarningMessage {
	content: IMarkdownString;
	kind: 'warning';
}

export interface IChatAgentVulnerabilityDetails {
	title: string;
	description: string;
}

export interface IChatResponseCodeblockUriPart {
	kind: 'codeblockUri';
	uri: URI;
	isEdit?: boolean;
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

export interface IChatMoveMessage {
	uri: URI;
	range: IRange;
	kind: 'move';
}

export interface IChatTextEdit {
	uri: URI;
	edits: TextEdit[];
	kind: 'textEdit';
	done?: boolean;
}

export interface IChatNotebookEdit {
	uri: URI;
	edits: ICellEditOperation[];
	kind: 'notebookEdit';
	done?: boolean;
}

export interface IChatConfirmation {
	title: string;
	message: string;
	data: any;
	buttons?: string[];
	isUsed?: boolean;
	kind: 'confirmation';
}

export interface IChatTerminalToolInvocationData {
	kind: 'terminal';
	command: string;
	language: string;
}

export interface IChatToolInputInvocationData {
	kind: 'input';
	rawInput: any;
}

export interface IChatToolInvocation {
	presentation: IPreparedToolInvocation['presentation'];
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData;
	/** Presence of this property says that confirmation is required */
	confirmationMessages?: IToolConfirmationMessages;
	confirmed: DeferredPromise<boolean>;
	/** A 3-way: undefined=don't know yet. */
	isConfirmed: boolean | undefined;
	invocationMessage: string | IMarkdownString;
	pastTenseMessage: string | IMarkdownString | undefined;
	resultDetails: IToolResult['toolResultDetails'];
	progress: IObservable<{ message?: string | IMarkdownString; progress: number }>;
	readonly toolId: string;
	readonly toolCallId: string;

	isCompletePromise: Promise<void>;
	isComplete: boolean;
	complete(result: IToolResult): void;
	kind: 'toolInvocation';
}

/**
 * This is a IChatToolInvocation that has been serialized, like after window reload, so it is no longer an active tool invocation.
 */
export interface IChatToolInvocationSerialized {
	presentation: IPreparedToolInvocation['presentation'];
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData;
	invocationMessage: string | IMarkdownString;
	pastTenseMessage: string | IMarkdownString | undefined;
	resultDetails: IToolResult['toolResultDetails'];
	isConfirmed: boolean | undefined;
	isComplete: boolean;
	toolCallId: string;
	toolId: string;
	kind: 'toolInvocationSerialized';
}

export interface IChatExtensionsContent {
	extensions: string[];
	kind: 'extensions';
}

export type IChatProgress =
	| IChatMarkdownContent
	| IChatAgentMarkdownContentWithVulnerability
	| IChatTreeData
	| IChatUsedContext
	| IChatContentReference
	| IChatContentInlineReference
	| IChatCodeCitation
	| IChatProgressMessage
	| IChatTask
	| IChatTaskResult
	| IChatCommandButton
	| IChatWarningMessage
	| IChatTextEdit
	| IChatNotebookEdit
	| IChatMoveMessage
	| IChatResponseCodeblockUriPart
	| IChatConfirmation
	| IChatToolInvocation
	| IChatToolInvocationSerialized
	| IChatExtensionsContent
	| IChatUndoStop;

export interface IChatFollowup {
	kind: 'reply';
	message: string;
	agentId: string;
	subCommand?: string;
	title?: string;
	tooltip?: string;
}

export enum ChatAgentVoteDirection {
	Down = 0,
	Up = 1
}

export enum ChatAgentVoteDownReason {
	IncorrectCode = 'incorrectCode',
	DidNotFollowInstructions = 'didNotFollowInstructions',
	IncompleteCode = 'incompleteCode',
	MissingContext = 'missingContext',
	PoorlyWrittenOrFormatted = 'poorlyWrittenOrFormatted',
	RefusedAValidRequest = 'refusedAValidRequest',
	OffensiveOrUnsafe = 'offensiveOrUnsafe',
	Other = 'other',
	WillReportIssue = 'willReportIssue'
}

export interface IChatVoteAction {
	kind: 'vote';
	direction: ChatAgentVoteDirection;
	reason: ChatAgentVoteDownReason | undefined;
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

export interface IChatApplyAction {
	kind: 'apply';
	codeBlockIndex: number;
	totalCharacters: number;
	newFile?: boolean;
	codeMapper?: string;
	editsProposed: boolean;
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


export interface IChatEditingSessionAction {
	kind: 'chatEditingSessionAction';
	uri: URI;
	hasRemainingEdits: boolean;
	outcome: 'accepted' | 'rejected' | 'userModified';
}

export type ChatUserAction = IChatVoteAction | IChatCopyAction | IChatInsertAction | IChatApplyAction | IChatTerminalAction | IChatCommandAction | IChatFollowupAction | IChatBugReportAction | IChatInlineChatCodeAction | IChatEditingSessionAction;

export interface IChatUserActionEvent {
	action: ChatUserAction;
	agentId: string | undefined;
	command: string | undefined;
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
	lastMessageDate: number;
	isActive: boolean;
}

export interface IChatProviderInfo {
	id: string;
}

export interface IChatTransferredSessionData {
	sessionId: string;
	inputValue: string;
	location: ChatAgentLocation;
	mode: ChatMode;
}

export interface IChatSendRequestResponseState {
	responseCreatedPromise: Promise<IChatResponseModel>;
	responseCompletePromise: Promise<void>;
}

export interface IChatSendRequestData extends IChatSendRequestResponseState {
	agent: IChatAgentData;
	slashCommand?: IChatAgentCommand;
}

export interface IChatEditorLocationData {
	type: ChatAgentLocation.Editor;
	document: URI;
	selection: ISelection;
	wholeRange: IRange;
}

export interface IChatNotebookLocationData {
	type: ChatAgentLocation.Notebook;
	sessionInputUri: URI;
}

export interface IChatTerminalLocationData {
	type: ChatAgentLocation.Terminal;
	// TBD
}

export type IChatLocationData = IChatEditorLocationData | IChatNotebookLocationData | IChatTerminalLocationData;

export interface IChatSendRequestOptions {
	mode?: ChatMode;
	userSelectedModelId?: string;
	userSelectedTools?: string[];
	toolSelectionIsExclusive?: boolean;
	location?: ChatAgentLocation;
	locationData?: IChatLocationData;
	parserContext?: IChatParserContext;
	attempt?: number;
	noCommandDetection?: boolean;
	acceptedConfirmationData?: any[];
	rejectedConfirmationData?: any[];
	attachedContext?: IChatRequestVariableEntry[];

	/** The target agent ID can be specified with this property instead of using @ in 'message' */
	agentId?: string;
	slashCommand?: string;

	/**
	 * The label of the confirmation action that was selected.
	 */
	confirmation?: string;
}

export const IChatService = createDecorator<IChatService>('IChatService');

export interface IChatService {
	_serviceBrand: undefined;
	transferredSessionData: IChatTransferredSessionData | undefined;

	onDidSubmitRequest: Event<{ chatSessionId: string }>;

	isEnabled(location: ChatAgentLocation): boolean;
	hasSessions(): boolean;
	startSession(location: ChatAgentLocation, token: CancellationToken, isGlobalEditingSession?: boolean): ChatModel;
	getSession(sessionId: string): IChatModel | undefined;
	getOrRestoreSession(sessionId: string): Promise<IChatModel | undefined>;
	isPersistedSessionEmpty(sessionId: string): boolean;
	loadSessionFromContent(data: IExportableChatData | ISerializableChatData): IChatModel | undefined;

	/**
	 * Returns whether the request was accepted.
	 */
	sendRequest(sessionId: string, message: string, options?: IChatSendRequestOptions): Promise<IChatSendRequestData | undefined>;

	resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions): Promise<void>;
	adoptRequest(sessionId: string, request: IChatRequestModel): Promise<void>;
	removeRequest(sessionid: string, requestId: string): Promise<void>;
	cancelCurrentRequestForSession(sessionId: string): void;
	clearSession(sessionId: string): Promise<void>;
	addCompleteRequest(sessionId: string, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, attempt: number | undefined, response: IChatCompleteResponse): void;
	getHistory(): Promise<IChatDetail[]>;
	setChatSessionTitle(sessionId: string, title: string): void;
	clearAllHistoryEntries(): Promise<void>;
	removeHistoryEntry(sessionId: string): Promise<void>;
	getChatStorageFolder(): URI;
	logChatIndex(): void;

	onDidPerformUserAction: Event<IChatUserActionEvent>;
	notifyUserAction(event: IChatUserActionEvent): void;
	onDidDisposeSession: Event<{ sessionId: string; reason: 'initializationFailed' | 'cleared' }>;

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void;

	activateDefaultAgent(location: ChatAgentLocation): Promise<void>;

	readonly edits2Enabled: boolean;
}

export const KEYWORD_ACTIVIATION_SETTING_ID = 'accessibility.voice.keywordActivation';
