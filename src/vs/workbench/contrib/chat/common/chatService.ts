/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../base/common/actions.js';
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
import { IChatAgentCommand, IChatAgentData, IChatAgentResult, UserSelectedTools } from './chatAgents.js';
import { IChatEditingSession } from './chatEditingService.js';
import { ChatModel, IChatModel, IChatRequestModeInfo, IChatRequestModel, IChatRequestVariableData, IChatResponseModel, IExportableChatData, ISerializableChatData } from './chatModel.js';
import { IParsedChatRequest } from './chatParserTypes.js';
import { IChatParserContext } from './chatRequestParser.js';
import { IChatRequestVariableEntry } from './chatVariableEntries.js';
import { IChatRequestVariableValue } from './chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from './constants.js';
import { IPreparedToolInvocation, IToolConfirmationMessages, IToolResult, IToolResultInputOutputDetails, ToolDataSource } from './languageModelToolsService.js';

export interface IChatRequest {
	message: string;
	variables: Record<string, IChatRequestVariableValue[]>;
}

export enum ChatErrorLevel {
	Info = 0,
	Warning = 1,
	Error = 2
}

export interface IChatResponseErrorDetailsConfirmationButton {
	data: any;
	label: string;
	isSecondary?: boolean;
}

export interface IChatResponseErrorDetails {
	message: string;
	responseIsIncomplete?: boolean;
	responseIsFiltered?: boolean;
	responseIsRedacted?: boolean;
	isQuotaExceeded?: boolean;
	isRateLimited?: boolean;
	level?: ChatErrorLevel;
	confirmationButtons?: IChatResponseErrorDetailsConfirmationButton[];
	code?: string;
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

export enum ChatResponseClearToPreviousToolInvocationReason {
	NoReason = 0,
	FilteredContentRetry = 1,
	CopyrightContentRetry = 2,
}

export interface IChatContentReference {
	reference: URI | Location | IChatContentVariableReference | string;
	iconPath?: ThemeIcon | { light: URI; dark?: URI };
	options?: {
		status?: { description: string; kind: ChatResponseReferencePartStatusKind };
		diffMeta?: { added: number; removed: number };
	};
	kind: 'reference';
}

export interface IChatChangesSummary {
	readonly reference: URI;
	readonly sessionId: string;
	readonly requestId: string;
	readonly kind: 'changesSummary';
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
export interface IChatMultiDiffData {
	multiDiffData: {
		title: string;
		resources: Array<{
			originalUri?: URI;
			modifiedUri?: URI;
			goToFileUri?: URI;
			added?: number;
			removed?: number;
		}>;
	};
	kind: 'multiDiffData';
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

export interface IChatTaskSerialized {
	content: IMarkdownString;
	progress: (IChatWarningMessage | IChatContentReference)[];
	kind: 'progressTaskSerialized';
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

export interface IChatClearToPreviousToolInvocation {
	kind: 'clearToPreviousToolInvocation';
	reason: ChatResponseClearToPreviousToolInvocationReason;
}

export interface IChatNotebookEdit {
	uri: URI;
	edits: ICellEditOperation[];
	kind: 'notebookEdit';
	done?: boolean;
}

export interface IChatConfirmation {
	title: string;
	message: string | IMarkdownString;
	data: any;
	/** Indicates whether this came from a current chat session (true/undefined) or a restored historic session (false) */
	isLive?: boolean;
	buttons?: string[];
	isUsed?: boolean;
	kind: 'confirmation';
}

export interface IChatElicitationRequest {
	kind: 'elicitation';
	title: string | IMarkdownString;
	message: string | IMarkdownString;
	acceptButtonLabel: string;
	rejectButtonLabel: string | undefined;
	subtitle?: string | IMarkdownString;
	source?: ToolDataSource;
	state: 'pending' | 'accepted' | 'rejected';
	acceptedResult?: Record<string, unknown>;
	moreActions?: IAction[];
	accept(value: IAction | true): Promise<void>;
	reject?: () => Promise<void>;
	isHidden?: IObservable<boolean>;
	hide?(): void;
}

export interface IChatThinkingPart {
	kind: 'thinking';
	value?: string | string[];
	id?: string;
	metadata?: { readonly [key: string]: any };
}

export interface IChatTerminalToolInvocationData {
	kind: 'terminal';
	commandLine: {
		original: string;
		userEdited?: string;
		toolEdited?: string;
	};
	/** Message for model recommending the use of an alternative tool */
	alternativeRecommendation?: string;
	language: string;
	terminalToolSessionId?: string;
	autoApproveInfo?: IMarkdownString;
}

/**
 * @deprecated This is the old API shape, we should support this for a while before removing it so
 * we don't break existing chats
 */
export interface ILegacyChatTerminalToolInvocationData {
	kind: 'terminal';
	command: string;
	language: string;
}

export interface IChatToolInputInvocationData {
	kind: 'input';
	rawInput: any;
}

export const enum ToolConfirmKind {
	Denied,
	ConfirmationNotNeeded,
	Setting,
	LmServicePerTool,
	UserAction,
	Skipped
}

export type ConfirmedReason =
	| { type: ToolConfirmKind.Denied }
	| { type: ToolConfirmKind.ConfirmationNotNeeded }
	| { type: ToolConfirmKind.Setting; id: string }
	| { type: ToolConfirmKind.LmServicePerTool; scope: 'session' | 'workspace' | 'profile' }
	| { type: ToolConfirmKind.UserAction }
	| { type: ToolConfirmKind.Skipped };

export interface IChatToolInvocation {
	presentation: IPreparedToolInvocation['presentation'];
	toolSpecificData?: IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatPullRequestContent | IChatTodoListContent;
	/** Presence of this property says that confirmation is required */
	confirmationMessages?: IToolConfirmationMessages;
	confirmed: DeferredPromise<ConfirmedReason>;
	/** undefined=don't know yet. */
	isConfirmed: ConfirmedReason | undefined;
	originMessage: string | IMarkdownString | undefined;
	invocationMessage: string | IMarkdownString;
	pastTenseMessage: string | IMarkdownString | undefined;
	resultDetails: IToolResult['toolResultDetails'];
	source: ToolDataSource;
	progress: IObservable<{ message?: string | IMarkdownString; progress: number | undefined }>;
	readonly toolId: string;
	readonly toolCallId: string;
	readonly fromSubAgent?: boolean;

	isCompletePromise: Promise<void>;
	isComplete: boolean;
	complete(result: IToolResult): void;
	kind: 'toolInvocation';
}

export interface IToolResultOutputDetailsSerialized {
	output: {
		type: 'data';
		mimeType: string;
		base64Data: string;
	};
}

/**
 * This is a IChatToolInvocation that has been serialized, like after window reload, so it is no longer an active tool invocation.
 */
export interface IChatToolInvocationSerialized {
	presentation: IPreparedToolInvocation['presentation'];
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatPullRequestContent | IChatTodoListContent;
	invocationMessage: string | IMarkdownString;
	originMessage: string | IMarkdownString | undefined;
	pastTenseMessage: string | IMarkdownString | undefined;
	resultDetails?: Array<URI | Location> | IToolResultInputOutputDetails | IToolResultOutputDetailsSerialized;
	/** boolean used by pre-1.104 versions */
	isConfirmed: ConfirmedReason | boolean | undefined;
	isComplete: boolean;
	toolCallId: string;
	toolId: string;
	source: ToolDataSource;
	readonly fromSubAgent?: boolean;
	kind: 'toolInvocationSerialized';
}

export interface IChatExtensionsContent {
	extensions: string[];
	kind: 'extensions';
}

export interface IChatPullRequestContent {
	uri: URI;
	title: string;
	description: string;
	author: string;
	linkTag: string;
	kind: 'pullRequest';
}

export interface IChatTodoListContent {
	kind: 'todoList';
	sessionId: string;
	todoList: Array<{
		id: string;
		title: string;
		description: string;
		status: 'not-started' | 'in-progress' | 'completed';
	}>;
}

export interface IChatMcpServersInteractionRequired {
	kind: 'mcpServersInteractionRequired';
	isDone?: boolean;
	servers: Array<{
		serverId: string;
		serverLabel: string;
		errorMessage?: string;
	}>;
	startCommand: Command;
}

export interface IChatPrepareToolInvocationPart {
	readonly kind: 'prepareToolInvocation';
	readonly toolName: string;
}

export type IChatProgress =
	| IChatMarkdownContent
	| IChatAgentMarkdownContentWithVulnerability
	| IChatTreeData
	| IChatMultiDiffData
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
	| IChatClearToPreviousToolInvocation
	| IChatToolInvocation
	| IChatToolInvocationSerialized
	| IChatExtensionsContent
	| IChatPullRequestContent
	| IChatUndoStop
	| IChatPrepareToolInvocationPart
	| IChatThinkingPart
	| IChatTaskSerialized
	| IChatElicitationRequest
	| IChatMcpServersInteractionRequired;

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
	totalLines: number;
	copiedLines: number;
	modelId: string;
	languageId?: string;
}

export interface IChatInsertAction {
	kind: 'insert';
	codeBlockIndex: number;
	totalCharacters: number;
	totalLines: number;
	languageId?: string;
	modelId: string;
	newFile?: boolean;
}

export interface IChatApplyAction {
	kind: 'apply';
	codeBlockIndex: number;
	totalCharacters: number;
	totalLines: number;
	languageId?: string;
	modelId: string;
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

export interface IChatEditingHunkAction {
	kind: 'chatEditingHunkAction';
	uri: URI;
	lineCount: number;
	linesAdded: number;
	linesRemoved: number;
	outcome: 'accepted' | 'rejected';
	hasRemainingEdits: boolean;
	modeId?: string;
	modelId?: string;
	languageId?: string;
}

export type ChatUserAction = IChatVoteAction | IChatCopyAction | IChatInsertAction | IChatApplyAction | IChatTerminalAction | IChatCommandAction | IChatFollowupAction | IChatBugReportAction | IChatInlineChatCodeAction | IChatEditingSessionAction | IChatEditingHunkAction;

export interface IChatUserActionEvent {
	action: ChatUserAction;
	agentId: string | undefined;
	command: string | undefined;
	sessionId: string;
	requestId: string;
	result: IChatAgentResult | undefined;
	modelId?: string | undefined;
	modeId?: string | undefined;
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
	mode: ChatModeKind;
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
	type: ChatAgentLocation.EditorInline;
	document: URI;
	selection: ISelection;
	wholeRange: IRange;
	close: () => void;
	delegateSessionId: string | undefined;
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
	modeInfo?: IChatRequestModeInfo;
	userSelectedModelId?: string;
	userSelectedTools?: IObservable<UserSelectedTools>;
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
	/** agentId, but will not add a @ name to the request */
	agentIdSilent?: string;
	slashCommand?: string;

	/**
	 * The label of the confirmation action that was selected.
	 */
	confirmation?: string;

	/**
	 * Summary data for chat sessions context
	 */
	chatSummary?: {
		prompt?: string;
		history?: string;
	};
}

export const IChatService = createDecorator<IChatService>('IChatService');

export interface IChatService {
	_serviceBrand: undefined;
	transferredSessionData: IChatTransferredSessionData | undefined;

	onDidSubmitRequest: Event<{ chatSessionId: string }>;

	isEnabled(location: ChatAgentLocation): boolean;
	hasSessions(): boolean;
	startSession(location: ChatAgentLocation, token: CancellationToken, isGlobalEditingSession?: boolean, inputType?: string): ChatModel;
	getSession(sessionId: string): IChatModel | undefined;
	getOrRestoreSession(sessionId: string): Promise<IChatModel | undefined>;
	getPersistedSessionTitle(sessionId: string): string | undefined;
	isPersistedSessionEmpty(sessionId: string): boolean;
	loadSessionFromContent(data: IExportableChatData | ISerializableChatData | URI): IChatModel | undefined;
	loadSessionForResource(resource: URI, location: ChatAgentLocation, token: CancellationToken): Promise<IChatModel | undefined>;
	readonly editingSessions: IChatEditingSession[];
	getChatSessionFromInternalId(sessionId: string): { chatSessionType: string; chatSessionId: string; isUntitled: boolean } | undefined;

	/**
	 * Returns whether the request was accepted.`
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
	onDidDisposeSession: Event<{ sessionId: string; reason: 'cleared' }>;

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void;

	activateDefaultAgent(location: ChatAgentLocation): Promise<void>;

	readonly edits2Enabled: boolean;

	readonly requestInProgressObs: IObservable<boolean>;
}

export const KEYWORD_ACTIVIATION_SETTING_ID = 'accessibility.voice.keywordActivation';
