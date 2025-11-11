/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, autorunSelfDisposable, IObservable, IReader } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { ISelection } from '../../../../editor/common/core/selection.js';
import { Command, Location, TextEdit } from '../../../../editor/common/languages.js';
import { FileType } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IAutostartResult } from '../../mcp/common/mcpTypes.js';
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
	kind: 'markdownContent';
	content: IMarkdownString;
	inlineReferences?: Record<string, IChatContentInlineReference>;
	fromSubagent?: boolean;
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
	readOnly?: boolean;
}

export interface IChatProgressMessage {
	content: IMarkdownString;
	kind: 'progressMessage';
}

export interface IChatTask extends IChatTaskDto {
	deferred: DeferredPromise<string | void>;
	progress: (IChatWarningMessage | IChatContentReference)[];
	readonly onDidAddProgress: Event<IChatWarningMessage | IChatContentReference>;
	add(progress: IChatWarningMessage | IChatContentReference): void;

	complete: (result: string | void) => void;
	task: () => Promise<string | void>;
	isSettled: () => boolean;
}

export interface IChatUndoStop {
	kind: 'undoStop';
	id: string;
}

export interface IChatExternalEditsDto {
	kind: 'externalEdits';
	start: boolean; /** true=start, false=stop */
	resources: UriComponents[];
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
	isExternalEdit?: boolean;
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
	isExternalEdit?: boolean;
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
	/** The predefined command ID that will be used for this terminal command */
	terminalCommandId?: string;
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
	readonly presentation: IPreparedToolInvocation['presentation'];
	readonly toolSpecificData?: IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatPullRequestContent | IChatTodoListContent;
	readonly confirmationMessages?: IToolConfirmationMessages;
	readonly originMessage: string | IMarkdownString | undefined;
	readonly invocationMessage: string | IMarkdownString;
	readonly pastTenseMessage: string | IMarkdownString | undefined;
	readonly source: ToolDataSource;
	readonly toolId: string;
	readonly toolCallId: string;
	readonly parameters: unknown;
	readonly fromSubAgent?: boolean;
	readonly state: IObservable<IChatToolInvocation.State>;

	kind: 'toolInvocation';
}

export namespace IChatToolInvocation {
	export const enum StateKind {
		WaitingForConfirmation,
		Executing,
		WaitingForPostApproval,
		Completed,
		Cancelled,
	}

	interface IChatToolInvocationStateBase {
		type: StateKind;
	}

	interface IChatToolInvocationWaitingForConfirmationState extends IChatToolInvocationStateBase {
		type: StateKind.WaitingForConfirmation;
		confirm(reason: ConfirmedReason): void;
	}

	interface IChatToolInvocationPostConfirmState {
		confirmed: ConfirmedReason;
	}

	interface IChatToolInvocationExecutingState extends IChatToolInvocationStateBase, IChatToolInvocationPostConfirmState {
		type: StateKind.Executing;
		progress: IObservable<{ message?: string | IMarkdownString; progress: number | undefined }>;
	}

	interface IChatToolInvocationPostExecuteState extends IChatToolInvocationPostConfirmState {
		resultDetails: IToolResult['toolResultDetails'];
	}

	interface IChatToolWaitingForPostApprovalState extends IChatToolInvocationStateBase, IChatToolInvocationPostExecuteState {
		type: StateKind.WaitingForPostApproval;
		confirm(reason: ConfirmedReason): void;
		contentForModel: IToolResult['content'];
	}

	interface IChatToolInvocationCompleteState extends IChatToolInvocationStateBase, IChatToolInvocationPostExecuteState {
		type: StateKind.Completed;
		postConfirmed: ConfirmedReason | undefined;
		contentForModel: IToolResult['content'];
	}

	interface IChatToolInvocationCancelledState extends IChatToolInvocationStateBase {
		type: StateKind.Cancelled;
		reason: ToolConfirmKind.Denied | ToolConfirmKind.Skipped;
	}

	export type State =
		| IChatToolInvocationWaitingForConfirmationState
		| IChatToolInvocationExecutingState
		| IChatToolWaitingForPostApprovalState
		| IChatToolInvocationCompleteState
		| IChatToolInvocationCancelledState;

	export function executionConfirmedOrDenied(invocation: IChatToolInvocation | IChatToolInvocationSerialized, reader?: IReader): ConfirmedReason | undefined {
		if (invocation.kind === 'toolInvocationSerialized') {
			if (invocation.isConfirmed === undefined || typeof invocation.isConfirmed === 'boolean') {
				return { type: invocation.isConfirmed ? ToolConfirmKind.UserAction : ToolConfirmKind.Denied };
			}
			return invocation.isConfirmed;
		}

		const state = invocation.state.read(reader);
		if (state.type === StateKind.WaitingForConfirmation) {
			return undefined; // don't know yet
		}
		if (state.type === StateKind.Cancelled) {
			return { type: state.reason };
		}

		return state.confirmed;
	}

	export function awaitConfirmation(invocation: IChatToolInvocation, token?: CancellationToken): Promise<ConfirmedReason> {
		const reason = executionConfirmedOrDenied(invocation);
		if (reason) {
			return Promise.resolve(reason);
		}

		const store = new DisposableStore();
		return new Promise<ConfirmedReason>(resolve => {
			if (token) {
				store.add(token.onCancellationRequested(() => {
					resolve({ type: ToolConfirmKind.Denied });
				}));
			}

			store.add(autorun(reader => {
				const reason = executionConfirmedOrDenied(invocation, reader);
				if (reason) {
					store.dispose();
					resolve(reason);
				}
			}));
		}).finally(() => {
			store.dispose();
		});
	}

	function postApprovalConfirmedOrDenied(invocation: IChatToolInvocation, reader?: IReader): ConfirmedReason | undefined {
		const state = invocation.state.read(reader);
		if (state.type === StateKind.Completed) {
			return state.postConfirmed || { type: ToolConfirmKind.ConfirmationNotNeeded };
		}
		if (state.type === StateKind.Cancelled) {
			return { type: state.reason };
		}

		return undefined;
	}

	export function confirmWith(invocation: IChatToolInvocation | undefined, reason: ConfirmedReason) {
		const state = invocation?.state.get();
		if (state?.type === StateKind.WaitingForConfirmation || state?.type === StateKind.WaitingForPostApproval) {
			state.confirm(reason);
			return true;
		}
		return false;
	}

	export function awaitPostConfirmation(invocation: IChatToolInvocation, token?: CancellationToken): Promise<ConfirmedReason> {
		const reason = postApprovalConfirmedOrDenied(invocation);
		if (reason) {
			return Promise.resolve(reason);
		}

		const store = new DisposableStore();
		return new Promise<ConfirmedReason>(resolve => {
			if (token) {
				store.add(token.onCancellationRequested(() => {
					resolve({ type: ToolConfirmKind.Denied });
				}));
			}

			store.add(autorun(reader => {
				const reason = postApprovalConfirmedOrDenied(invocation, reader);
				if (reason) {
					store.dispose();
					resolve(reason);
				}
			}));
		}).finally(() => {
			store.dispose();
		});
	}

	export function resultDetails(invocation: IChatToolInvocation | IChatToolInvocationSerialized, reader?: IReader) {
		if (invocation.kind === 'toolInvocationSerialized') {
			return invocation.resultDetails;
		}

		const state = invocation.state.read(reader);
		if (state.type === StateKind.Completed || state.type === StateKind.WaitingForPostApproval) {
			return state.resultDetails;
		}

		return undefined;
	}

	export function isComplete(invocation: IChatToolInvocation | IChatToolInvocationSerialized, reader?: IReader): boolean {
		if ('isComplete' in invocation) { // serialized
			return true; // always cancelled or complete
		}

		const state = invocation.state.read(reader);
		return state.type === StateKind.Completed || state.type === StateKind.Cancelled;
	}
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

export interface IChatMcpServersStarting {
	readonly kind: 'mcpServersStarting';
	readonly state?: IObservable<IAutostartResult>; // not hydrated when serialized
	didStartServerIds?: string[];
}

export class ChatMcpServersStarting implements IChatMcpServersStarting {
	public readonly kind = 'mcpServersStarting';

	public didStartServerIds?: string[] = [];

	public get isEmpty() {
		const s = this.state.get();
		return !s.working && s.serversRequiringInteraction.length === 0;
	}

	constructor(public readonly state: IObservable<IAutostartResult>) { }

	wait() {
		return new Promise<IAutostartResult>(resolve => {
			autorunSelfDisposable(reader => {
				const s = this.state.read(reader);
				if (!s.working) {
					reader.dispose();
					resolve(s);
				}
			});
		});
	}

	toJSON(): IChatMcpServersStarting {
		return { kind: 'mcpServersStarting', didStartServerIds: this.didStartServerIds };
	}
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
	| IChatMcpServersStarting;

export interface IChatFollowup {
	kind: 'reply';
	message: string;
	agentId: string;
	subCommand?: string;
	title?: string;
	tooltip?: string;
}

export function isChatFollowup(obj: unknown): obj is IChatFollowup {
	return (
		!!obj &&
		(obj as IChatFollowup).kind === 'reply' &&
		typeof (obj as IChatFollowup).message === 'string' &&
		typeof (obj as IChatFollowup).agentId === 'string'
	);
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
	sessionResource: URI;
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
	sessionResource: URI;
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
	delegateSessionResource: URI | undefined;
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

	readonly onDidSubmitRequest: Event<{ readonly chatSessionResource: URI }>;

	isEnabled(location: ChatAgentLocation): boolean;
	hasSessions(): boolean;
	startSession(location: ChatAgentLocation, token: CancellationToken, isGlobalEditingSession?: boolean, options?: { canUseTools?: boolean }): ChatModel;
	getSession(sessionResource: URI): IChatModel | undefined;
	getSessionByLegacyId(sessionId: string): IChatModel | undefined;
	getOrRestoreSession(sessionResource: URI): Promise<IChatModel | undefined>;
	getPersistedSessionTitle(sessionResource: URI): string | undefined;
	isPersistedSessionEmpty(sessionResource: URI): boolean;
	loadSessionFromContent(data: IExportableChatData | ISerializableChatData | URI): IChatModel | undefined;
	loadSessionForResource(resource: URI, location: ChatAgentLocation, token: CancellationToken): Promise<IChatModel | undefined>;
	readonly editingSessions: IChatEditingSession[];
	getChatSessionFromInternalUri(sessionResource: URI): IChatSessionContext | undefined;

	/**
	 * Returns whether the request was accepted.`
	 */
	sendRequest(sessionResource: URI, message: string, options?: IChatSendRequestOptions): Promise<IChatSendRequestData | undefined>;

	resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions): Promise<void>;
	adoptRequest(sessionResource: URI, request: IChatRequestModel): Promise<void>;
	removeRequest(sessionResource: URI, requestId: string): Promise<void>;
	cancelCurrentRequestForSession(sessionResource: URI): void;
	clearSession(sessionResource: URI): Promise<void>;
	addCompleteRequest(sessionResource: URI, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, attempt: number | undefined, response: IChatCompleteResponse): void;
	setChatSessionTitle(sessionResource: URI, title: string): void;
	getLocalSessionHistory(): Promise<IChatDetail[]>;
	clearAllHistoryEntries(): Promise<void>;
	removeHistoryEntry(sessionResource: URI): Promise<void>;
	getChatStorageFolder(): URI;
	logChatIndex(): void;

	readonly onDidPerformUserAction: Event<IChatUserActionEvent>;
	notifyUserAction(event: IChatUserActionEvent): void;
	readonly onDidDisposeSession: Event<{ readonly sessionResource: URI; readonly reason: 'cleared' }>;

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void;

	activateDefaultAgent(location: ChatAgentLocation): Promise<void>;

	readonly edits2Enabled: boolean;

	readonly requestInProgressObs: IObservable<boolean>;
}

export interface IChatSessionContext {
	readonly chatSessionType: string;
	readonly chatSessionResource: URI;
	readonly isUntitled: boolean;
}

export const KEYWORD_ACTIVIATION_SETTING_ID = 'accessibility.voice.keywordActivation';
