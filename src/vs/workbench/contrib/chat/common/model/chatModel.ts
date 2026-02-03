/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../../base/common/arrays.js';
import { softAssertNever } from '../../../../../base/common/assert.js';
import { VSBuffer, decodeHex, encodeHex } from '../../../../../base/common/buffer.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString, isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { IObservable, autorun, autorunSelfDisposable, derived, observableFromEvent, observableSignalFromEvent, observableValue, observableValueOpts } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { hasKey, WithDefinedProps } from '../../../../../base/common/types.js';
import { URI, UriDto } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { ISelection } from '../../../../../editor/common/core/selection.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { EditSuggestionId } from '../../../../../editor/common/textModelEditSource.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { CellUri, ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { ChatRequestToolReferenceEntry, IChatRequestVariableEntry, isImplicitVariableEntry, isStringImplicitContextValue, isStringVariableEntry } from '../attachments/chatVariableEntries.js';
import { migrateLegacyTerminalToolSpecificData } from '../chat.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, ChatRequestQueueKind, ChatResponseClearToPreviousToolInvocationReason, ElicitationState, IChatAgentMarkdownContentWithVulnerability, IChatClearToPreviousToolInvocation, IChatCodeCitation, IChatCommandButton, IChatConfirmation, IChatContentInlineReference, IChatContentReference, IChatEditingSessionAction, IChatElicitationRequest, IChatElicitationRequestSerialized, IChatExtensionsContent, IChatFollowup, IChatLocationData, IChatMarkdownContent, IChatMcpServersStarting, IChatMcpServersStartingSerialized, IChatModelReference, IChatMultiDiffData, IChatMultiDiffDataSerialized, IChatNotebookEdit, IChatProgress, IChatProgressMessage, IChatPullRequestContent, IChatQuestionCarousel, IChatResponseCodeblockUriPart, IChatResponseProgressFileTreeData, IChatSendRequestOptions, IChatService, IChatSessionContext, IChatSessionTiming, IChatTask, IChatTaskSerialized, IChatTextEdit, IChatThinkingPart, IChatToolInvocation, IChatToolInvocationSerialized, IChatTreeData, IChatUndoStop, IChatUsage, IChatUsedContext, IChatWarningMessage, IChatWorkspaceEdit, ResponseModelState, isIUsedContext } from '../chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../constants.js';
import { IChatEditingService, IChatEditingSession, ModifiedFileEntryState } from '../editing/chatEditingService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../languageModels.js';
import { IChatAgentCommand, IChatAgentData, IChatAgentResult, IChatAgentService, UserSelectedTools, reviveSerializedAgent } from '../participants/chatAgents.js';
import { ChatRequestTextPart, IParsedChatRequest, reviveParsedChatRequest } from '../requestParser/chatParserTypes.js';
import { LocalChatSessionUri } from './chatUri.js';
import { ObjectMutationLog } from './objectMutationLog.js';


/**
 * Represents a queued chat request waiting to be processed.
 */
export interface IChatPendingRequest {
	readonly id: string;
	readonly request: IChatRequestModel;
	readonly kind: ChatRequestQueueKind;
	/**
	 * The options that were passed to sendRequest when this request was queued.
	 * userSelectedTools is snapshotted to a static observable at queue time.
	 */
	readonly sendOptions: IChatSendRequestOptions;
}

export const CHAT_ATTACHABLE_IMAGE_MIME_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
};

export function getAttachableImageExtension(mimeType: string): string | undefined {
	return Object.entries(CHAT_ATTACHABLE_IMAGE_MIME_TYPES).find(([_, value]) => value === mimeType)?.[0];
}

export interface IChatRequestVariableData {
	variables: readonly IChatRequestVariableEntry[];
}

export namespace IChatRequestVariableData {
	export function toExport(data: IChatRequestVariableData): IChatRequestVariableData {
		return { variables: data.variables.map(IChatRequestVariableEntry.toExport) };
	}
}

export interface IChatRequestModel {
	readonly id: string;
	readonly timestamp: number;
	readonly version: number;
	readonly modeInfo?: IChatRequestModeInfo;
	readonly session: IChatModel;
	readonly message: IParsedChatRequest;
	readonly attempt: number;
	readonly variableData: IChatRequestVariableData;
	readonly confirmation?: string;
	readonly locationData?: IChatLocationData;
	readonly attachedContext?: IChatRequestVariableEntry[];
	readonly isCompleteAddedRequest: boolean;
	readonly response?: IChatResponseModel;
	readonly editedFileEvents?: IChatAgentEditedFileEvent[];
	shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	readonly shouldBeBlocked: IObservable<boolean>;
	setShouldBeBlocked(value: boolean): void;
	readonly modelId?: string;
	readonly userSelectedTools?: UserSelectedTools;
}

export interface ICodeBlockInfo {
	readonly suggestionId: EditSuggestionId;
}

export interface IChatTextEditGroupState {
	sha1: string;
	applied: number;
}

export interface IChatTextEditGroup {
	uri: URI;
	edits: TextEdit[][];
	state?: IChatTextEditGroupState;
	kind: 'textEditGroup';
	done: boolean | undefined;
	isExternalEdit?: boolean;
}

export function isCellTextEditOperation(value: unknown): value is ICellTextEditOperation {
	const candidate = value as ICellTextEditOperation;
	return !!candidate && !!candidate.edit && !!candidate.uri && URI.isUri(candidate.uri);
}

export function isCellTextEditOperationArray(value: ICellTextEditOperation[] | ICellEditOperation[]): value is ICellTextEditOperation[] {
	return value.some(isCellTextEditOperation);
}

export interface ICellTextEditOperation {
	edit: TextEdit;
	uri: URI;
}

export interface IChatNotebookEditGroup {
	uri: URI;
	edits: (ICellTextEditOperation[] | ICellEditOperation[])[];
	state?: IChatTextEditGroupState;
	kind: 'notebookEditGroup';
	done: boolean | undefined;
	isExternalEdit?: boolean;
}

/**
 * Progress kinds that are included in the history of a response.
 * Excludes "internal" types that are included in history.
 */
export type IChatProgressHistoryResponseContent =
	| IChatMarkdownContent
	| IChatAgentMarkdownContentWithVulnerability
	| IChatResponseCodeblockUriPart
	| IChatTreeData
	| IChatMultiDiffDataSerialized
	| IChatContentInlineReference
	| IChatProgressMessage
	| IChatCommandButton
	| IChatWarningMessage
	| IChatTask
	| IChatTaskSerialized
	| IChatTextEditGroup
	| IChatNotebookEditGroup
	| IChatConfirmation
	| IChatQuestionCarousel
	| IChatExtensionsContent
	| IChatThinkingPart
	| IChatPullRequestContent
	| IChatWorkspaceEdit;

/**
 * "Normal" progress kinds that are rendered as parts of the stream of content.
 */
export type IChatProgressResponseContent =
	| IChatProgressHistoryResponseContent
	| IChatToolInvocation
	| IChatToolInvocationSerialized
	| IChatMultiDiffData
	| IChatUndoStop
	| IChatElicitationRequest
	| IChatElicitationRequestSerialized
	| IChatClearToPreviousToolInvocation
	| IChatMcpServersStarting
	| IChatMcpServersStartingSerialized;

export type IChatProgressResponseContentSerialized = Exclude<IChatProgressResponseContent,
	| IChatToolInvocation
	| IChatElicitationRequest
	| IChatTask
	| IChatMultiDiffData
	| IChatMcpServersStarting
>;

const nonHistoryKinds = new Set(['toolInvocation', 'toolInvocationSerialized', 'undoStop']);
function isChatProgressHistoryResponseContent(content: IChatProgressResponseContent): content is IChatProgressHistoryResponseContent {
	return !nonHistoryKinds.has(content.kind);
}

export function toChatHistoryContent(content: ReadonlyArray<IChatProgressResponseContent>): IChatProgressHistoryResponseContent[] {
	return content.filter(isChatProgressHistoryResponseContent);
}

export type IChatProgressRenderableResponseContent = Exclude<IChatProgressResponseContent, IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability | IChatResponseCodeblockUriPart>;

export interface IResponse {
	readonly value: ReadonlyArray<IChatProgressResponseContent>;
	getMarkdown(): string;
	toString(): string;
}

export interface IChatResponseModel {
	readonly onDidChange: Event<ChatResponseModelChangeReason>;
	readonly id: string;
	readonly requestId: string;
	readonly request: IChatRequestModel | undefined;
	readonly username: string;
	readonly session: IChatModel;
	readonly agent?: IChatAgentData;
	readonly usedContext: IChatUsedContext | undefined;
	readonly contentReferences: ReadonlyArray<IChatContentReference>;
	readonly codeCitations: ReadonlyArray<IChatCodeCitation>;
	readonly progressMessages: ReadonlyArray<IChatProgressMessage>;
	readonly slashCommand?: IChatAgentCommand;
	readonly agentOrSlashCommandDetected: boolean;
	/** View of the response shown to the user, may have parts omitted from undo stops. */
	readonly response: IResponse;
	/** Entire response from the model. */
	readonly entireResponse: IResponse;
	/** Milliseconds timestamp when this chat response was created. */
	readonly timestamp: number;
	/** Milliseconds timestamp when this chat response was completed or cancelled. */
	readonly completedAt?: number;
	/** The state of this response */
	readonly state: ResponseModelState;
	/** @internal */
	readonly stateT: ResponseModelStateT;
	/**
	 * Adjusted millisecond timestamp that excludes the duration during which
	 * the model was pending user confirmation. `Date.now() - confirmationAdjustedTimestamp`
	 * will return the amount of time the response was busy generating content.
	 * This is updated only when `isPendingConfirmation` changes state.
	 */
	readonly confirmationAdjustedTimestamp: IObservable<number>;
	readonly isComplete: boolean;
	readonly isCanceled: boolean;
	readonly isPendingConfirmation: IObservable<{ startedWaitingAt: number; detail?: string } | undefined>;
	readonly isInProgress: IObservable<boolean>;
	readonly shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	readonly shouldBeBlocked: IObservable<boolean>;
	readonly isCompleteAddedRequest: boolean;
	/** A stale response is one that has been persisted and rehydrated, so e.g. Commands that have their arguments stored in the EH are gone. */
	readonly isStale: boolean;
	readonly vote: ChatAgentVoteDirection | undefined;
	readonly voteDownReason: ChatAgentVoteDownReason | undefined;
	readonly followups?: IChatFollowup[] | undefined;
	readonly result?: IChatAgentResult;
	readonly usage?: IChatUsage;
	readonly codeBlockInfos: ICodeBlockInfo[] | undefined;

	initializeCodeBlockInfos(codeBlockInfo: ICodeBlockInfo[]): void;
	addUndoStop(undoStop: IChatUndoStop): void;
	setVote(vote: ChatAgentVoteDirection): void;
	setVoteDownReason(reason: ChatAgentVoteDownReason | undefined): void;
	setUsage(usage: IChatUsage): void;
	setEditApplied(edit: IChatTextEditGroup, editCount: number): boolean;
	updateContent(progress: IChatProgressResponseContent | IChatTextEdit | IChatNotebookEdit | IChatTask, quiet?: boolean): void;
	/**
	 * Adopts any partially-undo {@link response} as the {@link entireResponse}.
	 * Only valid when {@link isComplete}. This is needed because otherwise an
	 * undone and then diverged state would start showing old data because the
	 * undo stops would no longer exist in the model.
	 */
	finalizeUndoState(): void;
}

export type ChatResponseModelChangeReason =
	| { reason: 'other' }
	| { reason: 'completedRequest' }
	| { reason: 'undoStop'; id: string };

export const defaultChatResponseModelChangeReason: ChatResponseModelChangeReason = { reason: 'other' };

export interface IChatRequestModeInfo {
	kind: ChatModeKind | undefined; // is undefined in case of modeId == 'apply'
	isBuiltin: boolean;
	modeInstructions: IChatRequestModeInstructions | undefined;
	modeId: 'ask' | 'agent' | 'edit' | 'custom' | 'applyCodeBlock' | undefined;
	applyCodeBlockSuggestionId: EditSuggestionId | undefined;
}

export interface IChatRequestModeInstructions {
	readonly name: string;
	readonly content: string;
	readonly toolReferences: readonly ChatRequestToolReferenceEntry[];
	readonly metadata?: Record<string, boolean | string | number>;
}

export interface IChatRequestModelParameters {
	session: ChatModel;
	message: IParsedChatRequest;
	variableData: IChatRequestVariableData;
	timestamp: number;
	attempt?: number;
	modeInfo?: IChatRequestModeInfo;
	confirmation?: string;
	locationData?: IChatLocationData;
	attachedContext?: IChatRequestVariableEntry[];
	isCompleteAddedRequest?: boolean;
	modelId?: string;
	restoredId?: string;
	editedFileEvents?: IChatAgentEditedFileEvent[];
	userSelectedTools?: UserSelectedTools;
}

export class ChatRequestModel implements IChatRequestModel {
	public readonly id: string;
	public response: ChatResponseModel | undefined;
	public shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	public readonly timestamp: number;
	public readonly message: IParsedChatRequest;
	public readonly isCompleteAddedRequest: boolean;
	public readonly modelId?: string;
	public readonly modeInfo?: IChatRequestModeInfo;
	public readonly userSelectedTools?: UserSelectedTools;

	private readonly _shouldBeBlocked = observableValue<boolean>(this, false);
	public get shouldBeBlocked(): IObservable<boolean> {
		return this._shouldBeBlocked;
	}

	public setShouldBeBlocked(value: boolean): void {
		this._shouldBeBlocked.set(value, undefined);
	}

	private _session: ChatModel;
	private readonly _attempt: number;
	private _variableData: IChatRequestVariableData;
	private readonly _confirmation?: string;
	private readonly _locationData?: IChatLocationData;
	private readonly _attachedContext?: IChatRequestVariableEntry[];
	private readonly _editedFileEvents?: IChatAgentEditedFileEvent[];

	public get session(): ChatModel {
		return this._session;
	}

	public get attempt(): number {
		return this._attempt;
	}

	public get variableData(): IChatRequestVariableData {
		return this._variableData;
	}

	public set variableData(v: IChatRequestVariableData) {
		this._version++;
		this._variableData = v;
	}

	public get confirmation(): string | undefined {
		return this._confirmation;
	}

	public get locationData(): IChatLocationData | undefined {
		return this._locationData;
	}

	public get attachedContext(): IChatRequestVariableEntry[] | undefined {
		return this._attachedContext;
	}

	public get editedFileEvents(): IChatAgentEditedFileEvent[] | undefined {
		return this._editedFileEvents;
	}

	private _version = 0;
	public get version(): number {
		return this._version;
	}

	constructor(params: IChatRequestModelParameters) {
		this._session = params.session;
		this.message = params.message;
		this._variableData = params.variableData;
		this.timestamp = params.timestamp;
		this._attempt = params.attempt ?? 0;
		this.modeInfo = params.modeInfo;
		this._confirmation = params.confirmation;
		this._locationData = params.locationData;
		this._attachedContext = params.attachedContext;
		this.isCompleteAddedRequest = params.isCompleteAddedRequest ?? false;
		this.modelId = params.modelId;
		this.id = params.restoredId ?? 'request_' + generateUuid();
		this._editedFileEvents = params.editedFileEvents;
		this.userSelectedTools = params.userSelectedTools;
	}

	adoptTo(session: ChatModel) {
		this._session = session;
	}
}

class AbstractResponse implements IResponse {
	protected _responseParts: IChatProgressResponseContent[];

	/**
	 * A stringified representation of response data which might be presented to a screenreader or used when copying a response.
	 */
	protected _responseRepr = '';

	/**
	 * Just the markdown content of the response, used for determining the rendering rate of markdown
	 */
	protected _markdownContent = '';

	get value(): IChatProgressResponseContent[] {
		return this._responseParts;
	}

	constructor(value: IChatProgressResponseContent[]) {
		this._responseParts = value;
		this._updateRepr();
	}

	toString(): string {
		return this._responseRepr;
	}

	/**
	 * _Just_ the content of markdown parts in the response
	 */
	getMarkdown(): string {
		return this._markdownContent;
	}

	protected _updateRepr() {
		this._responseRepr = this.partsToRepr(this._responseParts);

		this._markdownContent = this._responseParts.map(part => {
			if (part.kind === 'inlineReference') {
				return this.inlineRefToRepr(part);
			} else if (part.kind === 'markdownContent' || part.kind === 'markdownVuln') {
				return part.content.value;
			} else {
				return '';
			}
		})
			.filter(s => s.length > 0)
			.join('');
	}

	private partsToRepr(parts: readonly IChatProgressResponseContent[]): string {
		const blocks: string[] = [];
		let currentBlockSegments: string[] = [];
		let hasEditGroupsAfterLastClear = false;

		for (const part of parts) {
			let segment: { text: string; isBlock?: boolean } | undefined;
			switch (part.kind) {
				case 'clearToPreviousToolInvocation':
					currentBlockSegments = [];
					blocks.length = 0;
					hasEditGroupsAfterLastClear = false; // Reset edit groups flag when clearing
					continue;
				case 'treeData':
				case 'progressMessage':
				case 'codeblockUri':
				case 'extensions':
				case 'pullRequest':
				case 'undoStop':
				case 'workspaceEdit':
				case 'elicitation2':
				case 'elicitationSerialized':
				case 'thinking':
				case 'multiDiffData':
				case 'mcpServersStarting':
				case 'questionCarousel':
					// Ignore
					continue;
				case 'toolInvocation':
				case 'toolInvocationSerialized':
					// Include tool invocations in the copy text
					segment = this.getToolInvocationText(part);
					break;
				case 'inlineReference':
					segment = { text: this.inlineRefToRepr(part) };
					break;
				case 'command':
					segment = { text: part.command.title, isBlock: true };
					break;
				case 'textEditGroup':
				case 'notebookEditGroup':
					// Mark that we have edit groups after the last clear
					hasEditGroupsAfterLastClear = true;
					// Skip individual edit groups to avoid duplication
					continue;
				case 'confirmation':
					if (part.message instanceof MarkdownString) {
						segment = { text: `${part.title}\n${part.message.value}`, isBlock: true };
						break;
					}
					segment = { text: `${part.title}\n${part.message}`, isBlock: true };
					break;
				case 'markdownContent':
				case 'markdownVuln':
				case 'progressTask':
				case 'progressTaskSerialized':
				case 'warning':
					segment = { text: part.content.value };
					break;
				default:
					// Ignore any unknown/obsolete parts, but assert that all are handled:
					softAssertNever(part);
					continue;
			}

			if (segment.isBlock) {
				if (currentBlockSegments.length) {
					blocks.push(currentBlockSegments.join(''));
					currentBlockSegments = [];
				}
				blocks.push(segment.text);
			} else {
				currentBlockSegments.push(segment.text);
			}
		}

		if (currentBlockSegments.length) {
			blocks.push(currentBlockSegments.join(''));
		}

		// Add consolidated edit summary at the end if there were any edit groups after the last clear
		if (hasEditGroupsAfterLastClear) {
			blocks.push(localize('editsSummary', "Made changes."));
		}

		return blocks.join('\n\n');
	}

	private inlineRefToRepr(part: IChatContentInlineReference) {
		if ('uri' in part.inlineReference) {
			return this.uriToRepr(part.inlineReference.uri);
		}

		return 'name' in part.inlineReference
			? '`' + part.inlineReference.name + '`'
			: this.uriToRepr(part.inlineReference);
	}

	private getToolInvocationText(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): { text: string; isBlock?: boolean } {
		// Extract the message and input details
		let message = '';
		let input = '';

		if (toolInvocation.pastTenseMessage) {
			message = typeof toolInvocation.pastTenseMessage === 'string'
				? toolInvocation.pastTenseMessage
				: toolInvocation.pastTenseMessage.value;
		} else {
			message = typeof toolInvocation.invocationMessage === 'string'
				? toolInvocation.invocationMessage
				: toolInvocation.invocationMessage.value;
		}

		// Handle different types of tool invocations
		if (toolInvocation.toolSpecificData) {
			if (toolInvocation.toolSpecificData.kind === 'terminal') {
				message = 'Ran terminal command';
				const terminalData = migrateLegacyTerminalToolSpecificData(toolInvocation.toolSpecificData);
				input = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
			}
		}

		// Format the tool invocation text
		let text = message;
		if (input) {
			text += `: ${input}`;
		}

		// For completed tool invocations, also include the result details if available
		if (toolInvocation.kind === 'toolInvocationSerialized' || (toolInvocation.kind === 'toolInvocation' && IChatToolInvocation.isComplete(toolInvocation))) {
			const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);
			if (resultDetails && 'input' in resultDetails) {
				const resultPrefix = toolInvocation.kind === 'toolInvocationSerialized' || IChatToolInvocation.isComplete(toolInvocation) ? 'Completed' : 'Errored';
				text += `\n${resultPrefix} with input: ${resultDetails.input}`;
			}
		}

		return { text, isBlock: true };
	}

	private uriToRepr(uri: URI): string {
		if (uri.scheme === Schemas.http || uri.scheme === Schemas.https) {
			return uri.toString(false);
		}

		return basename(uri);
	}
}

/** A view of a subset of a response */
class ResponseView extends AbstractResponse {
	constructor(
		_response: IResponse,
		public readonly undoStop: string,
	) {
		let idx = _response.value.findIndex(v => v.kind === 'undoStop' && v.id === undoStop);
		// Undo stops are inserted before `codeblockUri`'s, which are preceeded by a
		// markdownContent containing the opening code fence. Adjust the index
		// backwards to avoid a buggy response if it looked like this happened.
		if (_response.value[idx + 1]?.kind === 'codeblockUri' && _response.value[idx - 1]?.kind === 'markdownContent') {
			idx--;
		}

		super(idx === -1 ? _response.value.slice() : _response.value.slice(0, idx));
	}
}

export class Response extends AbstractResponse implements IDisposable {
	private _onDidChangeValue = new Emitter<void>();
	public get onDidChangeValue() {
		return this._onDidChangeValue.event;
	}

	private _citations: IChatCodeCitation[] = [];


	constructor(value: IMarkdownString | ReadonlyArray<SerializedChatResponsePart>) {
		super(asArray(value).map((v) => (
			'kind' in v ? v :
				isMarkdownString(v) ? { content: v, kind: 'markdownContent' } satisfies IChatMarkdownContent :
					{ kind: 'treeData', treeData: v }
		)));
	}

	dispose(): void {
		this._onDidChangeValue.dispose();
	}


	clear(): void {
		this._responseParts = [];
		this._updateRepr(true);
	}

	clearToPreviousToolInvocation(message?: string): void {
		// look through the response parts and find the last tool invocation, then slice the response parts to that point
		let lastToolInvocationIndex = -1;
		for (let i = this._responseParts.length - 1; i >= 0; i--) {
			const part = this._responseParts[i];
			if (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') {
				lastToolInvocationIndex = i;
				break;
			}
		}
		if (lastToolInvocationIndex !== -1) {
			this._responseParts = this._responseParts.slice(0, lastToolInvocationIndex + 1);
		} else {
			this._responseParts = [];
		}
		if (message) {
			this._responseParts.push({ kind: 'warning', content: new MarkdownString(message) });
		}
		this._updateRepr(true);
	}

	updateContent(progress: IChatProgressResponseContent | IChatTextEdit | IChatNotebookEdit | IChatTask, quiet?: boolean): void {
		if (progress.kind === 'clearToPreviousToolInvocation') {
			if (progress.reason === ChatResponseClearToPreviousToolInvocationReason.CopyrightContentRetry) {
				this.clearToPreviousToolInvocation(localize('copyrightContentRetry', "Response cleared due to possible match to public code, retrying with modified prompt."));
			} else if (progress.reason === ChatResponseClearToPreviousToolInvocationReason.FilteredContentRetry) {
				this.clearToPreviousToolInvocation(localize('filteredContentRetry', "Response cleared due to content safety filters, retrying with modified prompt."));
			} else {
				this.clearToPreviousToolInvocation();
			}
			return;
		} else if (progress.kind === 'markdownContent') {

			// last response which is NOT a text edit group because we do want to support heterogenous streaming but not have
			// the MD be chopped up by text edit groups (and likely other non-renderable parts)
			const lastResponsePart = this._responseParts
				.filter(p => p.kind !== 'textEditGroup')
				.at(-1);

			if (!lastResponsePart || lastResponsePart.kind !== 'markdownContent' || !canMergeMarkdownStrings(lastResponsePart.content, progress.content)) {
				// The last part can't be merged with- not markdown, or markdown with different permissions
				this._responseParts.push(progress);
			} else {
				// Don't modify the current object, since it's being diffed by the renderer
				const idx = this._responseParts.indexOf(lastResponsePart);
				this._responseParts[idx] = { ...lastResponsePart, content: appendMarkdownString(lastResponsePart.content, progress.content) };
			}
			this._updateRepr(quiet);
		} else if (progress.kind === 'thinking') {

			// tries to split thinking chunks if it is an array. only while certain models give us array chunks.
			const lastResponsePart = this._responseParts
				.filter(p => p.kind !== 'textEditGroup')
				.at(-1);

			const lastText = lastResponsePart && lastResponsePart.kind === 'thinking'
				? (Array.isArray(lastResponsePart.value) ? lastResponsePart.value.join('') : (lastResponsePart.value || ''))
				: '';
			const currText = Array.isArray(progress.value) ? progress.value.join('') : (progress.value || '');
			const isEmpty = (s: string) => s.length === 0;

			// Do not merge if either the current or last thinking chunk is empty; empty chunks separate thinking
			if (!lastResponsePart
				|| lastResponsePart.kind !== 'thinking'
				|| isEmpty(currText)
				|| isEmpty(lastText)
				|| !canMergeMarkdownStrings(new MarkdownString(lastText), new MarkdownString(currText))) {
				this._responseParts.push(progress);
			} else {
				const idx = this._responseParts.indexOf(lastResponsePart);
				this._responseParts[idx] = {
					...lastResponsePart,
					value: appendMarkdownString(new MarkdownString(lastText), new MarkdownString(currText)).value
				};
			}
			this._updateRepr(quiet);
		} else if (progress.kind === 'textEdit' || progress.kind === 'notebookEdit') {
			// merge edits for the same file no matter when they come in
			const notebookUri = CellUri.parse(progress.uri)?.notebook;
			const uri = notebookUri ?? progress.uri;
			const isExternalEdit = progress.isExternalEdit;

			if (progress.kind === 'textEdit' && !notebookUri) {
				// Text edits to a regular (non-notebook) file
				this._mergeOrPushTextEditGroup(uri, progress.edits, progress.done, isExternalEdit);
			} else if (progress.kind === 'textEdit') {
				// Text edits to a notebook cell - convert to ICellTextEditOperation
				const cellEdits = progress.edits.map(edit => ({ uri: progress.uri, edit }));
				this._mergeOrPushNotebookEditGroup(uri, cellEdits, progress.done, isExternalEdit);
			} else {
				// Notebook cell edits (ICellEditOperation)
				this._mergeOrPushNotebookEditGroup(uri, progress.edits, progress.done, isExternalEdit);
			}
			this._updateRepr(quiet);
		} else if (progress.kind === 'progressTask') {
			// Add a new resolving part
			const responsePosition = this._responseParts.push(progress) - 1;
			this._updateRepr(quiet);

			const disp = progress.onDidAddProgress(() => {
				this._updateRepr(false);
			});

			progress.task?.().then((content) => {
				// Stop listening for progress updates once the task settles
				disp.dispose();

				// Replace the resolving part's content with the resolved response
				if (typeof content === 'string') {
					(this._responseParts[responsePosition] as IChatTask).content = new MarkdownString(content);
				}
				this._updateRepr(false);
			});

		} else if (progress.kind === 'toolInvocation') {
			autorunSelfDisposable(reader => {
				progress.state.read(reader); // update repr when state changes
				this._updateRepr(false);

				if (IChatToolInvocation.isComplete(progress, reader)) {
					reader.dispose();
				}
			});
			this._responseParts.push(progress);
			this._updateRepr(quiet);
		} else {
			this._responseParts.push(progress);
			this._updateRepr(quiet);
		}
	}

	public addCitation(citation: IChatCodeCitation) {
		this._citations.push(citation);
		this._updateRepr();
	}

	private _mergeOrPushTextEditGroup(uri: URI, edits: TextEdit[], done: boolean | undefined, isExternalEdit: boolean | undefined): void {
		for (const candidate of this._responseParts) {
			if (candidate.kind === 'textEditGroup' && !candidate.done && isEqual(candidate.uri, uri)) {
				candidate.edits.push(edits);
				candidate.done = done;
				return;
			}
		}
		this._responseParts.push({ kind: 'textEditGroup', uri, edits: [edits], done, isExternalEdit });
	}

	private _mergeOrPushNotebookEditGroup(uri: URI, edits: ICellTextEditOperation[] | ICellEditOperation[], done: boolean | undefined, isExternalEdit: boolean | undefined): void {
		for (const candidate of this._responseParts) {
			if (candidate.kind === 'notebookEditGroup' && !candidate.done && isEqual(candidate.uri, uri)) {
				candidate.edits.push(edits);
				candidate.done = done;
				return;
			}
		}
		this._responseParts.push({ kind: 'notebookEditGroup', uri, edits: [edits], done, isExternalEdit });
	}

	protected override _updateRepr(quiet?: boolean) {
		super._updateRepr();
		if (!this._onDidChangeValue) {
			return; // called from parent constructor
		}

		this._responseRepr += this._citations.length ? '\n\n' + getCodeCitationsMessage(this._citations) : '';

		if (!quiet) {
			this._onDidChangeValue.fire();
		}
	}
}

export interface IChatResponseModelParameters {
	responseContent: IMarkdownString | ReadonlyArray<SerializedChatResponsePart>;
	session: ChatModel;
	agent?: IChatAgentData;
	slashCommand?: IChatAgentCommand;
	requestId: string;
	timestamp?: number;
	vote?: ChatAgentVoteDirection;
	voteDownReason?: ChatAgentVoteDownReason;
	result?: IChatAgentResult;
	followups?: ReadonlyArray<IChatFollowup>;
	isCompleteAddedRequest?: boolean;
	shouldBeRemovedOnSend?: IChatRequestDisablement;
	shouldBeBlocked?: boolean;
	restoredId?: string;
	modelState?: ResponseModelStateT;
	timeSpentWaiting?: number;
	/**
	 * undefined means it will be set later.
	*/
	codeBlockInfos: ICodeBlockInfo[] | undefined;
}

export type ResponseModelStateT =
	| { value: ResponseModelState.Pending }
	| { value: ResponseModelState.NeedsInput }
	| { value: ResponseModelState.Complete | ResponseModelState.Cancelled | ResponseModelState.Failed; completedAt: number };

export class ChatResponseModel extends Disposable implements IChatResponseModel {
	private readonly _onDidChange = this._register(new Emitter<ChatResponseModelChangeReason>());
	readonly onDidChange = this._onDidChange.event;

	public readonly id: string;
	public readonly requestId: string;
	private _session: ChatModel;
	private _agent: IChatAgentData | undefined;
	private _slashCommand: IChatAgentCommand | undefined;
	private _modelState = observableValue<ResponseModelStateT>(this, { value: ResponseModelState.Pending });
	private _vote?: ChatAgentVoteDirection;
	private _voteDownReason?: ChatAgentVoteDownReason;
	private _result?: IChatAgentResult;
	private _usage?: IChatUsage;
	private _shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	public readonly isCompleteAddedRequest: boolean;
	private readonly _shouldBeBlocked = observableValue<boolean>(this, false);
	private readonly _timestamp: number;
	private _timeSpentWaitingAccumulator: number;

	public confirmationAdjustedTimestamp: IObservable<number>;

	public get shouldBeBlocked(): IObservable<boolean> {
		return this._shouldBeBlocked;
	}

	public get request(): IChatRequestModel | undefined {
		return this.session.getRequests().find(r => r.id === this.requestId);
	}

	public get session() {
		return this._session;
	}

	public get shouldBeRemovedOnSend() {
		return this._shouldBeRemovedOnSend;
	}

	public get isComplete(): boolean {
		return this._modelState.get().value !== ResponseModelState.Pending && this._modelState.get().value !== ResponseModelState.NeedsInput;
	}

	public get timestamp(): number {
		return this._timestamp;
	}

	public set shouldBeRemovedOnSend(disablement: IChatRequestDisablement | undefined) {
		if (this._shouldBeRemovedOnSend === disablement) {
			return;
		}

		this._shouldBeRemovedOnSend = disablement;
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
	}

	public get isCanceled(): boolean {
		return this._modelState.get().value === ResponseModelState.Cancelled;
	}

	public get completedAt(): number | undefined {
		const state = this._modelState.get();
		if (state.value === ResponseModelState.Complete || state.value === ResponseModelState.Cancelled || state.value === ResponseModelState.Failed) {
			return state.completedAt;
		}
		return undefined;
	}

	public get state(): ResponseModelState {
		const state = this._modelState.get().value;
		if (state === ResponseModelState.Complete && !!this._result?.errorDetails && this.result?.errorDetails?.code !== 'canceled') {
			// This check covers sessions created in previous vscode versions which saved a failed response as 'Complete'
			return ResponseModelState.Failed;
		}

		return state;
	}

	public get stateT(): ResponseModelStateT {
		return this._modelState.get();
	}

	public get vote(): ChatAgentVoteDirection | undefined {
		return this._vote;
	}

	public get voteDownReason(): ChatAgentVoteDownReason | undefined {
		return this._voteDownReason;
	}

	public get followups(): IChatFollowup[] | undefined {
		return this._followups;
	}

	private _response: Response;
	private _finalizedResponse?: IResponse;
	public get entireResponse(): IResponse {
		return this._finalizedResponse || this._response;
	}

	public get result(): IChatAgentResult | undefined {
		return this._result;
	}

	public get usage(): IChatUsage | undefined {
		return this._usage;
	}

	public get username(): string {
		return this.session.responderUsername;
	}

	private _followups?: IChatFollowup[];

	public get agent(): IChatAgentData | undefined {
		return this._agent;
	}

	public get slashCommand(): IChatAgentCommand | undefined {
		return this._slashCommand;
	}

	private _agentOrSlashCommandDetected: boolean | undefined;
	public get agentOrSlashCommandDetected(): boolean {
		return this._agentOrSlashCommandDetected ?? false;
	}

	private _usedContext: IChatUsedContext | undefined;
	public get usedContext(): IChatUsedContext | undefined {
		return this._usedContext;
	}

	private readonly _contentReferences: IChatContentReference[] = [];
	public get contentReferences(): ReadonlyArray<IChatContentReference> {
		return Array.from(this._contentReferences);
	}

	private readonly _codeCitations: IChatCodeCitation[] = [];
	public get codeCitations(): ReadonlyArray<IChatCodeCitation> {
		return this._codeCitations;
	}

	private readonly _progressMessages: IChatProgressMessage[] = [];
	public get progressMessages(): ReadonlyArray<IChatProgressMessage> {
		return this._progressMessages;
	}

	private _isStale: boolean = false;
	public get isStale(): boolean {
		return this._isStale;
	}


	readonly isPendingConfirmation: IObservable<{ startedWaitingAt: number; detail?: string } | undefined>;

	readonly isInProgress: IObservable<boolean>;

	private _responseView?: ResponseView;
	public get response(): IResponse {
		const undoStop = this._shouldBeRemovedOnSend?.afterUndoStop;
		if (!undoStop) {
			return this._finalizedResponse || this._response;
		}

		if (this._responseView?.undoStop !== undoStop) {
			this._responseView = new ResponseView(this._response, undoStop);
		}

		return this._responseView;
	}

	private _codeBlockInfos: ICodeBlockInfo[] | undefined;
	public get codeBlockInfos(): ICodeBlockInfo[] | undefined {
		return this._codeBlockInfos;
	}

	constructor(params: IChatResponseModelParameters) {
		super();

		this._session = params.session;
		this._agent = params.agent;
		this._slashCommand = params.slashCommand;
		this.requestId = params.requestId;
		this._timestamp = params.timestamp || Date.now();
		if (params.modelState) {
			this._modelState.set(params.modelState, undefined);
		}
		this._timeSpentWaitingAccumulator = params.timeSpentWaiting || 0;
		this._vote = params.vote;
		this._voteDownReason = params.voteDownReason;
		this._result = params.result;
		this._followups = params.followups ? [...params.followups] : undefined;
		this.isCompleteAddedRequest = params.isCompleteAddedRequest ?? false;
		this._shouldBeRemovedOnSend = params.shouldBeRemovedOnSend;
		this._shouldBeBlocked.set(params.shouldBeBlocked ?? false, undefined);

		// If we are creating a response with some existing content, consider it stale
		this._isStale = Array.isArray(params.responseContent) && (params.responseContent.length !== 0 || isMarkdownString(params.responseContent) && params.responseContent.value.length !== 0);

		this._response = this._register(new Response(params.responseContent));
		this._codeBlockInfos = params.codeBlockInfos ? [...params.codeBlockInfos] : undefined;

		const signal = observableSignalFromEvent(this, this.onDidChange);

		const _pendingInfo = signal.map((_value, r): string | undefined => {
			signal.read(r);

			for (const part of this._response.value) {
				if (part.kind === 'toolInvocation') {
					const state = part.state.read(r);
					if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
						const title = state.confirmationMessages?.title;
						return title ? (isMarkdownString(title) ? title.value : title) : undefined;
					}
					if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
						return localize('waitingForPostApproval', "Approve tool result?");
					}
				}
				if (part.kind === 'confirmation' && !part.isUsed) {
					return part.title;
				}
				if (part.kind === 'elicitation2' && part.state.read(r) === ElicitationState.Pending) {
					const title = part.title;
					return isMarkdownString(title) ? title.value : title;
				}
			}

			return undefined;
		});

		const _startedWaitingAt = _pendingInfo.map(p => !!p).map(p => p ? Date.now() : undefined);
		this.isPendingConfirmation = _startedWaitingAt.map((waiting, r) => waiting ? { startedWaitingAt: waiting, detail: _pendingInfo.read(r) } : undefined);

		this.isInProgress = signal.map((_value, r) => {

			signal.read(r);

			return !_pendingInfo.read(r)
				&& !this.shouldBeRemovedOnSend
				&& (this._modelState.read(r).value === ResponseModelState.Pending || this._modelState.read(r).value === ResponseModelState.NeedsInput);
		});

		this._register(this._response.onDidChangeValue(() => this._onDidChange.fire(defaultChatResponseModelChangeReason)));
		this.id = params.restoredId ?? 'response_' + generateUuid();

		let lastStartedWaitingAt: number | undefined = undefined;
		this.confirmationAdjustedTimestamp = derived(reader => {
			const pending = this.isPendingConfirmation.read(reader);
			if (pending) {
				this._modelState.set({ value: ResponseModelState.NeedsInput }, undefined);
				if (!lastStartedWaitingAt) {
					lastStartedWaitingAt = pending.startedWaitingAt;
				}
			} else if (lastStartedWaitingAt) {
				// Restore state to Pending if it was set to NeedsInput by this observable
				if (this._modelState.read(reader).value === ResponseModelState.NeedsInput) {
					this._modelState.set({ value: ResponseModelState.Pending }, undefined);
				}
				this._timeSpentWaitingAccumulator += Date.now() - lastStartedWaitingAt;
				lastStartedWaitingAt = undefined;
			}

			return this._timestamp + this._timeSpentWaitingAccumulator;
		}).recomputeInitiallyAndOnChange(this._store);
	}

	initializeCodeBlockInfos(codeBlockInfo: ICodeBlockInfo[]): void {
		if (this._codeBlockInfos) {
			throw new BugIndicatingError('Code block infos have already been initialized');
		}
		this._codeBlockInfos = [...codeBlockInfo];
	}

	setBlockedState(isBlocked: boolean): void {
		this._shouldBeBlocked.set(isBlocked, undefined);
	}

	/**
	 * Apply a progress update to the actual response content.
	 */
	updateContent(responsePart: IChatProgressResponseContent | IChatTextEdit | IChatNotebookEdit, quiet?: boolean) {
		this._response.updateContent(responsePart, quiet);
	}

	/**
	 * Adds an undo stop at the current position in the stream.
	 */
	addUndoStop(undoStop: IChatUndoStop) {
		this._onDidChange.fire({ reason: 'undoStop', id: undoStop.id });
		this._response.updateContent(undoStop, true);
	}

	/**
	 * Apply one of the progress updates that are not part of the actual response content.
	 */
	applyReference(progress: IChatUsedContext | IChatContentReference) {
		if (progress.kind === 'usedContext') {
			this._usedContext = progress;
		} else if (progress.kind === 'reference') {
			this._contentReferences.push(progress);
			this._onDidChange.fire(defaultChatResponseModelChangeReason);
		}
	}

	applyCodeCitation(progress: IChatCodeCitation) {
		this._codeCitations.push(progress);
		this._response.addCitation(progress);
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
	}

	setAgent(agent: IChatAgentData, slashCommand?: IChatAgentCommand) {
		this._agent = agent;
		this._slashCommand = slashCommand;
		this._agentOrSlashCommandDetected = !agent.isDefault || !!slashCommand;
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
	}

	setResult(result: IChatAgentResult): void {
		this._result = result;
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
	}

	setUsage(usage: IChatUsage): void {
		this._usage = usage;
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
	}

	complete(): void {
		// No-op if it's already complete
		if (this.isComplete) {
			return;
		}
		if (this._result?.errorDetails?.responseIsRedacted) {
			this._response.clear();
		}

		// Canceled sessions can be considered 'Complete'
		const state = !!this._result?.errorDetails && this._result.errorDetails.code !== 'canceled' ? ResponseModelState.Failed : ResponseModelState.Complete;
		this._modelState.set({ value: state, completedAt: Date.now() }, undefined);
		this._onDidChange.fire({ reason: 'completedRequest' });
	}

	cancel(): void {
		this._modelState.set({ value: ResponseModelState.Cancelled, completedAt: Date.now() }, undefined);
		this._onDidChange.fire({ reason: 'completedRequest' });
	}

	setFollowups(followups: IChatFollowup[] | undefined): void {
		this._followups = followups;
		this._onDidChange.fire(defaultChatResponseModelChangeReason); // Fire so that command followups get rendered on the row
	}

	setVote(vote: ChatAgentVoteDirection): void {
		this._vote = vote;
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
	}

	setVoteDownReason(reason: ChatAgentVoteDownReason | undefined): void {
		this._voteDownReason = reason;
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
	}

	setEditApplied(edit: IChatTextEditGroup, editCount: number): boolean {
		if (!this.response.value.includes(edit)) {
			return false;
		}
		if (!edit.state) {
			return false;
		}
		edit.state.applied = editCount; // must not be edit.edits.length
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
		return true;
	}

	adoptTo(session: ChatModel) {
		this._session = session;
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
	}


	finalizeUndoState(): void {
		this._finalizedResponse = this.response;
		this._responseView = undefined;
		this._shouldBeRemovedOnSend = undefined;
	}

	toJSON(): ISerializableChatResponseData {
		const modelState = this._modelState.get();
		const pendingConfirmation = this.isPendingConfirmation.get();

		return {
			responseId: this.id,
			result: this.result,
			responseMarkdownInfo: this.codeBlockInfos?.map<ISerializableMarkdownInfo>(info => ({ suggestionId: info.suggestionId })),
			followups: this.followups,
			modelState: modelState.value === ResponseModelState.Pending || modelState.value === ResponseModelState.NeedsInput ? { value: ResponseModelState.Cancelled, completedAt: Date.now() } : modelState,
			vote: this.vote,
			voteDownReason: this.voteDownReason,
			slashCommand: this.slashCommand,
			usedContext: this.usedContext,
			contentReferences: this.contentReferences,
			codeCitations: this.codeCitations,
			timestamp: this._timestamp,
			timeSpentWaiting: (pendingConfirmation ? Date.now() - pendingConfirmation.startedWaitingAt : 0) + this._timeSpentWaitingAccumulator,
		} satisfies WithDefinedProps<ISerializableChatResponseData>;
	}
}


export interface IChatRequestDisablement {
	requestId: string;
	afterUndoStop?: string;
}

/**
 * Information about a chat request that needs user input to continue.
 */
export interface IChatRequestNeedsInputInfo {
	/** The chat session title */
	readonly title: string;
	/** Optional detail message, e.g., "<toolname> needs approval to run." */
	readonly detail?: string;
}

export interface IChatModel extends IDisposable {
	readonly onDidDispose: Event<void>;
	readonly onDidChange: Event<IChatChangeEvent>;
	/** @deprecated Use {@link sessionResource} instead */
	readonly sessionId: string;
	/** Milliseconds timestamp this chat model was created. */
	readonly timestamp: number;
	readonly timing: IChatSessionTiming;
	readonly sessionResource: URI;
	readonly initialLocation: ChatAgentLocation;
	readonly title: string;
	readonly hasCustomTitle: boolean;
	readonly responderUsername: string;
	/** True whenever a request is currently running */
	readonly requestInProgress: IObservable<boolean>;
	/** Provides session information when a request needs user interaction to continue */
	readonly requestNeedsInput: IObservable<IChatRequestNeedsInputInfo | undefined>;
	readonly inputPlaceholder?: string;
	readonly editingSession?: IChatEditingSession | undefined;
	readonly checkpoint: IChatRequestModel | undefined;
	startEditingSession(isGlobalEditingSession?: boolean, transferFromSession?: IChatEditingSession): void;
	/** Input model for managing input state */
	readonly inputModel: IInputModel;
	readonly hasRequests: boolean;
	readonly lastRequest: IChatRequestModel | undefined;
	/** Whether this model will be kept alive while it is running or has edits */
	readonly willKeepAlive: boolean;
	readonly lastRequestObs: IObservable<IChatRequestModel | undefined>;
	getRequests(): IChatRequestModel[];
	setCheckpoint(requestId: string | undefined): void;

	toExport(): IExportableChatData;
	toJSON(): ISerializableChatData;
	readonly contributedChatSession: IChatSessionContext | undefined;

	readonly repoData: IExportableRepoData | undefined;
	setRepoData(data: IExportableRepoData | undefined): void;

	readonly onDidChangePendingRequests: Event<void>;
	getPendingRequests(): readonly IChatPendingRequest[];
}

export interface ISerializableChatsData {
	[sessionId: string]: ISerializableChatData;
}

export type ISerializableChatAgentData = UriDto<IChatAgentData>;

interface ISerializableChatResponseData {
	responseId?: string;
	result?: IChatAgentResult; // Optional for backcompat
	responseMarkdownInfo?: ISerializableMarkdownInfo[];
	followups?: ReadonlyArray<IChatFollowup>;
	modelState?: ResponseModelStateT;
	vote?: ChatAgentVoteDirection;
	voteDownReason?: ChatAgentVoteDownReason;
	timestamp?: number;
	slashCommand?: IChatAgentCommand;
	/** For backward compat: should be optional */
	usedContext?: IChatUsedContext;
	contentReferences?: ReadonlyArray<IChatContentReference>;
	codeCitations?: ReadonlyArray<IChatCodeCitation>;
	timeSpentWaiting?: number;
}

export type SerializedChatResponsePart = IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability | IChatThinkingPart | IChatProgressResponseContentSerialized;

export interface ISerializableChatRequestData extends ISerializableChatResponseData {
	requestId: string;
	message: string | IParsedChatRequest; // string => old format
	/** Is really like "prompt data". This is the message in the format in which the agent gets it + variable values. */
	variableData: IChatRequestVariableData;
	response: ReadonlyArray<SerializedChatResponsePart> | undefined;

	/**Old, persisted name for shouldBeRemovedOnSend */
	isHidden?: boolean;
	shouldBeRemovedOnSend?: IChatRequestDisablement;
	agent?: ISerializableChatAgentData;
	// responseErrorDetails: IChatResponseErrorDetails | undefined;
	/** @deprecated modelState is used instead now */
	isCanceled?: boolean;
	timestamp?: number;
	confirmation?: string;
	editedFileEvents?: IChatAgentEditedFileEvent[];
	modelId?: string;
}

export interface ISerializableMarkdownInfo {
	readonly suggestionId: EditSuggestionId;
}

/**
 * Repository state captured for chat session export.
 * Enables reproducing the workspace state by cloning, checking out the commit, and applying diffs.
 */
export interface IExportableRepoData {
	/**
	 * Classification of the workspace's version control state.
	 * - `remote-git`: Git repo with a configured remote URL
	 * - `local-git`: Git repo without any remote (local only)
	 * - `plain-folder`: Not a git repository
	 */
	workspaceType: 'remote-git' | 'local-git' | 'plain-folder';

	/**
	 * Sync status between local and remote.
	 * - `synced`: Local HEAD matches remote tracking branch (fully pushed)
	 * - `unpushed`: Local has commits not pushed to the remote tracking branch
	 * - `unpublished`: Local branch has no remote tracking branch configured
	 * - `local-only`: No remote configured (local git repo only)
	 * - `no-git`: Not a git repository
	 */
	syncStatus: 'synced' | 'unpushed' | 'unpublished' | 'local-only' | 'no-git';

	/**
	 * Remote URL of the repository (e.g., https://github.com/org/repo.git).
	 * Undefined if no remote is configured.
	 */
	remoteUrl?: string;

	/**
	 * Vendor/host of the remote repository.
	 * Undefined if no remote is configured.
	 */
	remoteVendor?: 'github' | 'ado' | 'other';

	/**
	 * Remote tracking branch for the current branch (e.g., "origin/feature/my-work").
	 * Undefined if branch is unpublished or no remote.
	 */
	remoteTrackingBranch?: string;

	/**
	 * Default remote branch used as base for unpublished branches (e.g., "origin/main").
	 * Helpful for computing merge-base when branch has no tracking.
	 */
	remoteBaseBranch?: string;

	/**
	 * Commit hash of the remote tracking branch HEAD.
	 * Undefined if branch has no remote tracking branch.
	 */
	remoteHeadCommit?: string;

	/**
	 * Name of the current local branch (e.g., "feature/my-work").
	 */
	localBranch?: string;

	/**
	 * Commit hash of the local HEAD when captured.
	 */
	localHeadCommit?: string;

	/**
	 * Working tree diffs (uncommitted changes).
	 */
	diffs?: IExportableRepoDiff[];

	/**
	 * Status of the diffs collection.
	 * - `included`: Diffs were successfully captured and included
	 * - `tooManyChanges`: Diffs skipped because >100 files changed (degenerate case like mass renames)
	 * - `tooLarge`: Diffs skipped because total size exceeded 900KB
	 * - `trimmedForStorage`: Diffs were trimmed to save storage (older session)
	 * - `noChanges`: No working tree changes detected
	 * - `notCaptured`: Diffs not captured (default/undefined case)
	 */
	diffsStatus?: 'included' | 'tooManyChanges' | 'tooLarge' | 'trimmedForStorage' | 'noChanges' | 'notCaptured';

	/**
	 * Number of changed files detected, even if diffs were not included.
	 */
	changedFileCount?: number;
}

/**
 * A file change exported as a unified diff patch compatible with `git apply`.
 */
export interface IExportableRepoDiff {
	relativePath: string;
	changeType: 'added' | 'modified' | 'deleted' | 'renamed';
	oldRelativePath?: string;
	unifiedDiff?: string;
	status: string;
}

export interface IExportableChatData {
	initialLocation: ChatAgentLocation | undefined;
	requests: ISerializableChatRequestData[];
	responderUsername: string;
}

/*
	NOTE: every time the serialized data format is updated, we need to create a new interface, because we may need to handle any old data format when parsing.
*/

export interface ISerializableChatData1 extends IExportableChatData {
	sessionId: string;
	creationDate: number;
}

export interface ISerializableChatData2 extends ISerializableChatData1 {
	version: 2;
	computedTitle: string | undefined;
}

export interface ISerializableChatData3 extends Omit<ISerializableChatData2, 'version' | 'computedTitle'> {
	version: 3;
	customTitle: string | undefined;
	/**
	 * Whether the session had pending edits when it was stored.
	 * todo@connor4312 This will be cleaned up with the globalization of edits.
	 */
	hasPendingEdits?: boolean;
	/** Current draft input state (added later, fully backwards compatible) */
	inputState?: ISerializableChatModelInputState;
	repoData?: IExportableRepoData;
}

/**
 * Input model for managing chat input state independently from the chat model.
 * This keeps display logic separated from the core chat model.
 *
 * The input model:
 * - Manages the current draft state (text, attachments, mode, model selection, cursor/selection)
 * - Provides an observable interface for reactive UI updates
 * - Automatically persists through the chat model's serialization
 * - Enables bidirectional sync between the UI (ChatInputPart) and the model
 * - Uses `undefined` state to indicate no persisted state (new/empty chat)
 *
 * This architecture ensures that:
 * - Input state is preserved when moving chats between editor/sidebar/window
 * - No manual state transfer is needed when switching contexts
 * - The UI stays in sync with the persisted state
 * - New chats use UI defaults (persisted preferences) instead of hardcoded values
 */
export interface IInputModel {
	/** Observable for current input state (undefined for new/uninitialized chats) */
	readonly state: IObservable<IChatModelInputState | undefined>;

	/** Update the input state (partial update) */
	setState(state: Partial<IChatModelInputState>): void;

	/** Clear input state (after sending or clearing) */
	clearState(): void;

	/** Serializes the state */
	toJSON(): ISerializableChatModelInputState | undefined;
}

/**
 * Represents the current state of the chat input that hasn't been sent yet.
 * This is the "draft" state that should be preserved across sessions.
 */
export interface IChatModelInputState {
	/** Current attachments in the input */
	attachments: readonly IChatRequestVariableEntry[];

	/** Currently selected chat mode */
	mode: {
		/** Mode ID (e.g., 'ask', 'edit', 'agent', or custom mode ID) */
		id: string;
		/** Mode kind for builtin modes */
		kind: ChatModeKind | undefined;
	};

	/** Currently selected language model, if any */
	selectedModel: ILanguageModelChatMetadataAndIdentifier | undefined;

	/** Current input text */
	inputText: string;

	/** Current selection ranges */
	selections: ISelection[];

	/** Contributed stored state */
	contrib: Record<string, unknown>;
}

/**
 * Serializable version of IChatModelInputState
 */
export interface ISerializableChatModelInputState {
	attachments: readonly IChatRequestVariableEntry[];
	mode: {
		id: string;
		kind: ChatModeKind | undefined;
	};
	selectedModel: {
		identifier: string;
		metadata: ILanguageModelChatMetadata;
	} | undefined;
	inputText: string;
	selections: ISelection[];
	contrib: Record<string, unknown>;
}

/**
* Chat data that has been parsed and normalized to the current format.
*/
export type ISerializableChatData = ISerializableChatData3;

export type IChatDataSerializerLog = ObjectMutationLog<IChatModel, ISerializableChatData>;

export interface ISerializedChatDataReference {
	value: ISerializableChatData | IExportableChatData;
	serializer: IChatDataSerializerLog;
}

/**
 * Chat data that has been loaded but not normalized, and could be any format
 */
export type ISerializableChatDataIn = ISerializableChatData1 | ISerializableChatData2 | ISerializableChatData3;

/**
 * Normalize chat data from storage to the current format.
 * TODO- ChatModel#_deserialize and reviveSerializedAgent also still do some normalization and maybe that should be done in here too.
 */
export function normalizeSerializableChatData(raw: ISerializableChatDataIn): ISerializableChatData {
	normalizeOldFields(raw);

	if (!('version' in raw)) {
		return {
			version: 3,
			...raw,
			customTitle: undefined,
		};
	}

	if (raw.version === 2) {
		return {
			...raw,
			version: 3,
			customTitle: raw.computedTitle
		};
	}

	return raw;
}

function normalizeOldFields(raw: ISerializableChatDataIn): void {
	// Fill in fields that very old chat data may be missing
	if (!raw.sessionId) {
		raw.sessionId = generateUuid();
	}

	if (!raw.creationDate) {
		raw.creationDate = getLastYearDate();
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any, local/code-no-any-casts
	if ((raw.initialLocation as any) === 'editing-session') {
		raw.initialLocation = ChatAgentLocation.Chat;
	}
}

function getLastYearDate(): number {
	const lastYearDate = new Date();
	lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
	return lastYearDate.getTime();
}

export function isExportableSessionData(obj: unknown): obj is IExportableChatData {
	return !!obj &&
		Array.isArray((obj as IExportableChatData).requests) &&
		typeof (obj as IExportableChatData).responderUsername === 'string';
}

export function isSerializableSessionData(obj: unknown): obj is ISerializableChatData {
	const data = obj as ISerializableChatData;
	return isExportableSessionData(obj) &&
		typeof data.creationDate === 'number' &&
		typeof data.sessionId === 'string' &&
		obj.requests.every((request: ISerializableChatRequestData) =>
			!request.usedContext /* for backward compat allow missing usedContext */ || isIUsedContext(request.usedContext)
		);
}

export type IChatChangeEvent =
	| IChatInitEvent
	| IChatAddRequestEvent | IChatChangedRequestEvent | IChatRemoveRequestEvent
	| IChatAddResponseEvent
	| IChatSetAgentEvent
	| IChatMoveEvent
	| IChatSetHiddenEvent
	| IChatCompletedRequestEvent
	| IChatSetCustomTitleEvent
	;

export interface IChatAddRequestEvent {
	kind: 'addRequest';
	request: IChatRequestModel;
}

export interface IChatChangedRequestEvent {
	kind: 'changedRequest';
	request: IChatRequestModel;
}

export interface IChatCompletedRequestEvent {
	kind: 'completedRequest';
	request: IChatRequestModel;
}

export interface IChatAddResponseEvent {
	kind: 'addResponse';
	response: IChatResponseModel;
}

export const enum ChatRequestRemovalReason {
	/**
	 * "Normal" remove
	 */
	Removal,

	/**
	 * Removed because the request will be resent
	 */
	Resend,

	/**
	 * Remove because the request is moving to another model
	 */
	Adoption
}

export interface IChatRemoveRequestEvent {
	kind: 'removeRequest';
	requestId: string;
	responseId?: string;
	reason: ChatRequestRemovalReason;
}

export interface IChatSetHiddenEvent {
	kind: 'setHidden';
}

export interface IChatMoveEvent {
	kind: 'move';
	target: URI;
	range: IRange;
}

export interface IChatSetAgentEvent {
	kind: 'setAgent';
	agent: IChatAgentData;
	command?: IChatAgentCommand;
}

export interface IChatSetCustomTitleEvent {
	kind: 'setCustomTitle';
	title: string;
}

export interface IChatInitEvent {
	kind: 'initialize';
}

/**
 * Internal implementation of IInputModel
 */
class InputModel implements IInputModel {
	private readonly _state: ReturnType<typeof observableValue<IChatModelInputState | undefined>>;
	readonly state: IObservable<IChatModelInputState | undefined>;

	constructor(initialState: IChatModelInputState | undefined) {
		this._state = observableValueOpts({ debugName: 'inputModelState', equalsFn: equals }, initialState);
		this.state = this._state;
	}

	setState(state: Partial<IChatModelInputState>): void {
		const current = this._state.get();
		this._state.set({
			// If current is undefined, provide defaults for required fields
			attachments: [],
			mode: { id: 'agent', kind: ChatModeKind.Agent },
			selectedModel: undefined,
			inputText: '',
			selections: [],
			contrib: {},
			...current,
			...state
		}, undefined);
	}

	clearState(): void {
		this._state.set(undefined, undefined);
	}

	toJSON(): ISerializableChatModelInputState | undefined {
		const value = this.state.get();
		if (!value) {
			return undefined;
		}

		// Filter out extension-contributed context items (kind: 'string' or implicit entries with StringChatContextValue)
		// These have handles that become invalid after window reload and cannot be properly restored.
		const persistableAttachments = value.attachments.filter(attachment => {
			if (isStringVariableEntry(attachment)) {
				return false;
			}
			if (isImplicitVariableEntry(attachment) && isStringImplicitContextValue(attachment.value)) {
				return false;
			}
			return true;
		});

		return {
			contrib: value.contrib,
			attachments: persistableAttachments,
			mode: value.mode,
			selectedModel: value.selectedModel ? {
				identifier: value.selectedModel.identifier,
				metadata: value.selectedModel.metadata
			} : undefined,
			inputText: value.inputText,
			selections: value.selections
		};
	}
}

export class ChatModel extends Disposable implements IChatModel {
	static getDefaultTitle(requests: (ISerializableChatRequestData | IChatRequestModel)[]): string {
		const firstRequestMessage = requests.at(0)?.message ?? '';
		const message = typeof firstRequestMessage === 'string' ?
			firstRequestMessage :
			firstRequestMessage.text;
		return message.split('\n')[0].substring(0, 200);
	}

	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChange = this._register(new Emitter<IChatChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _pendingRequests: IChatPendingRequest[] = [];
	private readonly _onDidChangePendingRequests = this._register(new Emitter<void>());
	readonly onDidChangePendingRequests = this._onDidChangePendingRequests.event;

	private _requests: ChatRequestModel[];

	private _contributedChatSession: IChatSessionContext | undefined;
	public get contributedChatSession(): IChatSessionContext | undefined {
		return this._contributedChatSession;
	}
	public setContributedChatSession(session: IChatSessionContext | undefined) {
		this._contributedChatSession = session;
	}

	private _repoData: IExportableRepoData | undefined;
	public get repoData(): IExportableRepoData | undefined {
		return this._repoData;
	}
	public setRepoData(data: IExportableRepoData | undefined): void {
		this._repoData = data;
	}

	getPendingRequests(): readonly IChatPendingRequest[] {
		return this._pendingRequests;
	}

	setPendingRequests(requests: readonly { requestId: string; kind: ChatRequestQueueKind }[]): void {
		const existingMap = new Map(this._pendingRequests.map(p => [p.id, p]));
		const newPending: IChatPendingRequest[] = [];
		for (const { requestId, kind } of requests) {
			const existing = existingMap.get(requestId);
			if (existing) {
				// Update kind if changed, keep existing request and sendOptions
				newPending.push(existing.kind === kind ? existing : { id: existing.id, request: existing.request, kind, sendOptions: existing.sendOptions });
			}
		}
		this._pendingRequests.length = 0;
		this._pendingRequests.push(...newPending);
		this._onDidChangePendingRequests.fire();
	}

	/**
	 * @internal Used by ChatService to add a request to the queue.
	 * Steering messages are placed before queued messages.
	 */
	addPendingRequest(request: ChatRequestModel, kind: ChatRequestQueueKind, sendOptions: IChatSendRequestOptions): IChatPendingRequest {
		const pendingRequest: IChatPendingRequest = {
			id: request.id,
			request,
			kind,
			sendOptions,
		};

		if (kind === ChatRequestQueueKind.Steering) {
			// Insert after the last steering message, or at the beginning if there is none
			let insertIndex = 0;
			for (let i = 0; i < this._pendingRequests.length; i++) {
				if (this._pendingRequests[i].kind === ChatRequestQueueKind.Steering) {
					insertIndex = i + 1;
				} else {
					break;
				}
			}
			this._pendingRequests.splice(insertIndex, 0, pendingRequest);
		} else {
			// Queued messages always go at the end
			this._pendingRequests.push(pendingRequest);
		}

		this._onDidChangePendingRequests.fire();
		return pendingRequest;
	}

	/**
	 * @internal Used by ChatService to remove a pending request
	 */
	removePendingRequest(id: string): void {
		const index = this._pendingRequests.findIndex(r => r.id === id);
		if (index !== -1) {
			this._pendingRequests.splice(index, 1);
			this._onDidChangePendingRequests.fire();
		}
	}

	/**
	 * @internal Used by ChatService to dequeue the next pending request
	 */
	dequeuePendingRequest(): IChatPendingRequest | undefined {
		const request = this._pendingRequests.shift();
		if (request) {
			this._onDidChangePendingRequests.fire();
		}
		return request;
	}

	/**
	 * @internal Used by ChatService to clear all pending requests
	 */
	clearPendingRequests(): void {
		if (this._pendingRequests.length > 0) {
			this._pendingRequests.length = 0;
			this._onDidChangePendingRequests.fire();
		}
	}

	readonly lastRequestObs: IObservable<IChatRequestModel | undefined>;

	// TODO to be clear, this is not the same as the id from the session object, which belongs to the provider.
	// It's easier to be able to identify this model before its async initialization is complete
	private readonly _sessionId: string;
	/** @deprecated Use {@link sessionResource} instead */
	get sessionId(): string {
		return this._sessionId;
	}

	private readonly _sessionResource: URI;
	get sessionResource(): URI {
		return this._sessionResource;
	}

	readonly requestInProgress: IObservable<boolean>;
	readonly requestNeedsInput: IObservable<IChatRequestNeedsInputInfo | undefined>;

	/** Input model for managing input state */
	readonly inputModel: InputModel;

	get hasRequests(): boolean {
		return this._requests.length > 0;
	}

	get lastRequest(): ChatRequestModel | undefined {
		return this._requests.at(-1);
	}

	private _timestamp: number;
	get timestamp(): number {
		return this._timestamp;
	}

	get timing(): IChatSessionTiming {
		const lastRequest = this._requests.at(-1);
		const lastResponse = lastRequest?.response;
		const lastRequestStarted = lastRequest?.timestamp;
		const lastRequestEnded = lastResponse?.completedAt ?? lastResponse?.timestamp;
		return {
			created: this._timestamp,
			lastRequestStarted,
			lastRequestEnded,
		};
	}

	get lastMessageDate(): number {
		return this._requests.at(-1)?.timestamp ?? this._timestamp;
	}

	private get _defaultAgent() {
		return this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Ask);
	}

	private readonly _initialResponderUsername: string | undefined;
	get responderUsername(): string {
		return this._defaultAgent?.fullName ??
			this._initialResponderUsername ?? '';
	}

	private _isImported = false;
	get isImported(): boolean {
		return this._isImported;
	}

	private _customTitle: string | undefined;
	get customTitle(): string | undefined {
		return this._customTitle;
	}

	get title(): string {
		return this._customTitle || ChatModel.getDefaultTitle(this._requests);
	}

	get hasCustomTitle(): boolean {
		return this._customTitle !== undefined;
	}

	private _editingSession: IChatEditingSession | undefined;

	get editingSession(): IChatEditingSession | undefined {
		return this._editingSession;
	}

	private readonly _initialLocation: ChatAgentLocation;
	get initialLocation(): ChatAgentLocation {
		return this._initialLocation;
	}

	private readonly _canUseTools: boolean = true;
	get canUseTools(): boolean {
		return this._canUseTools;
	}

	private _disableBackgroundKeepAlive: boolean;
	get willKeepAlive(): boolean {
		return !this._disableBackgroundKeepAlive;
	}

	public dataSerializer?: IChatDataSerializerLog;

	constructor(
		dataRef: ISerializedChatDataReference | undefined,
		initialModelProps: { initialLocation: ChatAgentLocation; canUseTools: boolean; inputState?: ISerializableChatModelInputState; resource?: URI; sessionId?: string; disableBackgroundKeepAlive?: boolean },
		@ILogService private readonly logService: ILogService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();

		const initialData = dataRef?.value;
		const isValidExportedData = isExportableSessionData(initialData);
		const isValidFullData = isValidExportedData && isSerializableSessionData(initialData);
		if (initialData && !isValidExportedData) {
			this.logService.warn(`ChatModel#constructor: Loaded malformed session data: ${JSON.stringify(initialData)}`);
		}

		this._isImported = !!initialData && isValidExportedData && !isValidFullData;
		this._sessionId = (isValidFullData && initialData.sessionId) || initialModelProps.sessionId || generateUuid();
		this._sessionResource = initialModelProps.resource ?? LocalChatSessionUri.forSession(this._sessionId);
		this._disableBackgroundKeepAlive = initialModelProps.disableBackgroundKeepAlive ?? false;

		this._requests = initialData ? this._deserialize(initialData) : [];
		this._timestamp = (isValidFullData && initialData.creationDate) || Date.now();
		this._customTitle = isValidFullData ? initialData.customTitle : undefined;

		// Initialize input model from serialized data (undefined for new chats)
		const serializedInputState = initialModelProps.inputState || (isValidFullData && initialData.inputState ? initialData.inputState : undefined);
		this.inputModel = new InputModel(serializedInputState && {
			attachments: serializedInputState.attachments,
			mode: serializedInputState.mode,
			selectedModel: serializedInputState.selectedModel && {
				identifier: serializedInputState.selectedModel.identifier,
				metadata: serializedInputState.selectedModel.metadata
			},
			contrib: serializedInputState.contrib,
			inputText: serializedInputState.inputText,
			selections: serializedInputState.selections
		});

		this.dataSerializer = dataRef?.serializer;
		this._initialResponderUsername = initialData?.responderUsername;

		this._repoData = isValidFullData && initialData.repoData ? initialData.repoData : undefined;

		this._initialLocation = initialData?.initialLocation ?? initialModelProps.initialLocation;

		this._canUseTools = initialModelProps.canUseTools;

		this.lastRequestObs = observableFromEvent(this, this.onDidChange, () => this._requests.at(-1));

		this._register(autorun(reader => {
			const request = this.lastRequestObs.read(reader);
			if (!request?.response) {
				return;
			}

			reader.store.add(request.response.onDidChange(async ev => {
				if (!this._editingSession || ev.reason !== 'completedRequest') {
					return;
				}

				this._onDidChange.fire({ kind: 'completedRequest', request });
			}));
		}));

		this.requestInProgress = this.lastRequestObs.map((request, r) => {
			return request?.response?.isInProgress.read(r) ?? false;
		});

		this.requestNeedsInput = this.lastRequestObs.map((request, r) => {
			const pendingInfo = request?.response?.isPendingConfirmation.read(r);
			if (!pendingInfo) {
				return undefined;
			}
			return {
				title: this.title,
				detail: pendingInfo.detail,
			};
		});

		// Retain a reference to itself when a request is in progress, so the ChatModel stays alive in the background
		// only while running a request. TODO also keep it alive for 5min or so so we don't have to dispose/restore too often?
		if (this.initialLocation === ChatAgentLocation.Chat && !initialModelProps.disableBackgroundKeepAlive) {
			const selfRef = this._register(new MutableDisposable<IChatModelReference>());
			this._register(autorun(r => {
				const inProgress = this.requestInProgress.read(r);
				const needsInput = this.requestNeedsInput.read(r);
				const shouldStayAlive = inProgress || !!needsInput;
				if (shouldStayAlive && !selfRef.value) {
					selfRef.value = chatService.getActiveSessionReference(this._sessionResource);
				} else if (!shouldStayAlive && selfRef.value) {
					selfRef.clear();
				}
			}));
		}
	}

	startEditingSession(isGlobalEditingSession?: boolean, transferFromSession?: IChatEditingSession): void {
		const session = this._editingSession ??= this._register(
			transferFromSession
				? this.chatEditingService.transferEditingSession(this, transferFromSession)
				: isGlobalEditingSession
					? this.chatEditingService.startOrContinueGlobalEditingSession(this)
					: this.chatEditingService.createEditingSession(this)
		);

		if (!this._disableBackgroundKeepAlive) {
			// todo@connor4312: hold onto a reference so background sessions don't
			// trigger early disposal. This will be cleaned up with the globalization of edits.
			const selfRef = this._register(new MutableDisposable<IChatModelReference>());
			this._register(autorun(r => {
				const hasModified = session.entries.read(r).some(e => e.state.read(r) === ModifiedFileEntryState.Modified);
				if (hasModified && !selfRef.value) {
					selfRef.value = this.chatService.getActiveSessionReference(this._sessionResource);
				} else if (!hasModified && selfRef.value) {
					selfRef.clear();
				}
			}));
		}

		this._register(autorun(reader => {
			this._setDisabledRequests(session.requestDisablement.read(reader));
		}));
	}

	private currentEditedFileEvents = new ResourceMap<IChatAgentEditedFileEvent>();
	notifyEditingAction(action: IChatEditingSessionAction): void {
		const state = action.outcome === 'accepted' ? ChatRequestEditedFileEventKind.Keep :
			action.outcome === 'rejected' ? ChatRequestEditedFileEventKind.Undo :
				action.outcome === 'userModified' ? ChatRequestEditedFileEventKind.UserModification : null;
		if (state === null) {
			return;
		}

		if (!this.currentEditedFileEvents.has(action.uri) || this.currentEditedFileEvents.get(action.uri)?.eventKind === ChatRequestEditedFileEventKind.Keep) {
			this.currentEditedFileEvents.set(action.uri, { eventKind: state, uri: action.uri });
		}
	}

	private _deserialize(obj: IExportableChatData | ISerializedChatDataReference): ChatRequestModel[] {
		const requests = hasKey(obj, { serializer: true }) ? obj.value.requests : obj.requests;
		if (!Array.isArray(requests)) {
			this.logService.error(`Ignoring malformed session data: ${JSON.stringify(obj)}`);
			return [];
		}

		try {
			return requests.map((raw: ISerializableChatRequestData) => {
				const parsedRequest =
					typeof raw.message === 'string'
						? this.getParsedRequestFromString(raw.message)
						: reviveParsedChatRequest(raw.message);

				// Old messages don't have variableData, or have it in the wrong (non-array) shape
				const variableData: IChatRequestVariableData = this.reviveVariableData(raw.variableData);
				const request = new ChatRequestModel({
					session: this,
					message: parsedRequest,
					variableData,
					timestamp: raw.timestamp ?? -1,
					restoredId: raw.requestId,
					confirmation: raw.confirmation,
					editedFileEvents: raw.editedFileEvents,
					modelId: raw.modelId,
				});
				request.shouldBeRemovedOnSend = raw.isHidden ? { requestId: raw.requestId } : raw.shouldBeRemovedOnSend;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, local/code-no-any-casts
				if (raw.response || raw.result || (raw as any).responseErrorDetails) {
					const agent = (raw.agent && 'metadata' in raw.agent) ? // Check for the new format, ignore entries in the old format
						reviveSerializedAgent(raw.agent) : undefined;

					// Port entries from old format
					const result = 'responseErrorDetails' in raw ?
						// eslint-disable-next-line local/code-no-dangerous-type-assertions
						{ errorDetails: raw.responseErrorDetails } as IChatAgentResult : raw.result;
					let modelState = raw.modelState || { value: raw.isCanceled ? ResponseModelState.Cancelled : ResponseModelState.Complete, completedAt: Date.now() };
					if (modelState.value === ResponseModelState.Pending || modelState.value === ResponseModelState.NeedsInput) {
						modelState = { value: ResponseModelState.Cancelled, completedAt: Date.now() };
					}

					request.response = new ChatResponseModel({
						responseContent: raw.response ?? [new MarkdownString(raw.response)],
						session: this,
						agent,
						slashCommand: raw.slashCommand,
						requestId: request.id,
						modelState,
						vote: raw.vote,
						timestamp: raw.timestamp,
						voteDownReason: raw.voteDownReason,
						result,
						followups: raw.followups,
						restoredId: raw.responseId,
						timeSpentWaiting: raw.timeSpentWaiting,
						shouldBeBlocked: request.shouldBeBlocked.get(),
						codeBlockInfos: raw.responseMarkdownInfo?.map<ICodeBlockInfo>(info => ({ suggestionId: info.suggestionId })),
					});
					request.response.shouldBeRemovedOnSend = raw.isHidden ? { requestId: raw.requestId } : raw.shouldBeRemovedOnSend;
					if (raw.usedContext) { // @ulugbekna: if this's a new vscode sessions, doc versions are incorrect anyway?
						request.response.applyReference(revive(raw.usedContext));
					}

					raw.contentReferences?.forEach(r => request.response!.applyReference(revive(r)));
					raw.codeCitations?.forEach(c => request.response!.applyCodeCitation(revive(c)));
				}
				return request;
			});
		} catch (error) {
			this.logService.error('Failed to parse chat data', error);
			return [];
		}
	}

	private reviveVariableData(raw: IChatRequestVariableData): IChatRequestVariableData {
		const variableData = raw && Array.isArray(raw.variables)
			? raw :
			{ variables: [] };

		variableData.variables = variableData.variables.map<IChatRequestVariableEntry>(IChatRequestVariableEntry.fromExport);

		return variableData;
	}

	private getParsedRequestFromString(message: string): IParsedChatRequest {
		// TODO These offsets won't be used, but chat replies need to go through the parser as well
		const parts = [new ChatRequestTextPart(new OffsetRange(0, message.length), { startColumn: 1, startLineNumber: 1, endColumn: 1, endLineNumber: 1 }, message)];
		return {
			text: message,
			parts
		};
	}



	getRequests(): ChatRequestModel[] {
		return this._requests;
	}

	resetCheckpoint(): void {
		for (const request of this._requests) {
			request.setShouldBeBlocked(false);
		}
	}

	setCheckpoint(requestId: string | undefined) {
		let checkpoint: ChatRequestModel | undefined;
		let checkpointIndex = -1;
		if (requestId !== undefined) {
			this._requests.forEach((request, index) => {
				if (request.id === requestId) {
					checkpointIndex = index;
					checkpoint = request;
					request.setShouldBeBlocked(true);
				}
			});

			if (!checkpoint) {
				return; // Invalid request ID
			}
		}

		for (let i = this._requests.length - 1; i >= 0; i -= 1) {
			const request = this._requests[i];
			if (this._checkpoint && !checkpoint) {
				request.setShouldBeBlocked(false);
			} else if (checkpoint && i >= checkpointIndex) {
				request.setShouldBeBlocked(true);
				if (request.response) {
					request.response.setBlockedState(true);
				}
			} else if (checkpoint && i < checkpointIndex) {
				request.setShouldBeBlocked(false);
			}
		}

		this._checkpoint = checkpoint;
	}

	private _checkpoint: ChatRequestModel | undefined = undefined;
	public get checkpoint() {
		return this._checkpoint;
	}

	private _setDisabledRequests(requestIds: IChatRequestDisablement[]) {
		this._requests.forEach((request) => {
			const shouldBeRemovedOnSend = requestIds.find(r => r.requestId === request.id);
			request.shouldBeRemovedOnSend = shouldBeRemovedOnSend;
			if (request.response) {
				request.response.shouldBeRemovedOnSend = shouldBeRemovedOnSend;
			}
		});

		this._onDidChange.fire({ kind: 'setHidden' });
	}

	addRequest(message: IParsedChatRequest, variableData: IChatRequestVariableData, attempt: number, modeInfo?: IChatRequestModeInfo, chatAgent?: IChatAgentData, slashCommand?: IChatAgentCommand, confirmation?: string, locationData?: IChatLocationData, attachments?: IChatRequestVariableEntry[], isCompleteAddedRequest?: boolean, modelId?: string, userSelectedTools?: UserSelectedTools, id?: string): ChatRequestModel {
		const editedFileEvents = [...this.currentEditedFileEvents.values()];
		this.currentEditedFileEvents.clear();
		const request = new ChatRequestModel({
			restoredId: id,
			session: this,
			message,
			variableData,
			timestamp: Date.now(),
			attempt,
			modeInfo,
			confirmation,
			locationData,
			attachedContext: attachments,
			isCompleteAddedRequest,
			modelId,
			editedFileEvents: editedFileEvents.length ? editedFileEvents : undefined,
			userSelectedTools,
		});
		request.response = new ChatResponseModel({
			responseContent: [],
			session: this,
			agent: chatAgent,
			slashCommand,
			requestId: request.id,
			isCompleteAddedRequest,
			codeBlockInfos: undefined,
		});

		this._requests.push(request);
		this._onDidChange.fire({ kind: 'addRequest', request });
		return request;
	}

	public setCustomTitle(title: string): void {
		this._customTitle = title;
		this._onDidChange.fire({ kind: 'setCustomTitle', title });
	}

	updateRequest(request: ChatRequestModel, variableData: IChatRequestVariableData) {
		request.variableData = variableData;
		this._onDidChange.fire({ kind: 'changedRequest', request });
	}

	adoptRequest(request: ChatRequestModel): void {
		// this doesn't use `removeRequest` because it must not dispose the request object
		const oldOwner = request.session;
		const index = oldOwner._requests.findIndex((candidate: ChatRequestModel) => candidate.id === request.id);

		if (index === -1) {
			return;
		}

		oldOwner._requests.splice(index, 1);

		request.adoptTo(this);
		request.response?.adoptTo(this);
		this._requests.push(request);

		oldOwner._onDidChange.fire({ kind: 'removeRequest', requestId: request.id, responseId: request.response?.id, reason: ChatRequestRemovalReason.Adoption });
		this._onDidChange.fire({ kind: 'addRequest', request });
	}

	acceptResponseProgress(request: ChatRequestModel, progress: IChatProgress, quiet?: boolean): void {
		if (!request.response) {
			request.response = new ChatResponseModel({
				responseContent: [],
				session: this,
				requestId: request.id,
				codeBlockInfos: undefined,
			});
		}

		if (request.response.isComplete) {
			throw new Error('acceptResponseProgress: Adding progress to a completed response');
		}

		if (progress.kind === 'usedContext' || progress.kind === 'reference') {
			request.response.applyReference(progress);
		} else if (progress.kind === 'codeCitation') {
			request.response.applyCodeCitation(progress);
		} else if (progress.kind === 'move') {
			this._onDidChange.fire({ kind: 'move', target: progress.uri, range: progress.range });
		} else if (progress.kind === 'codeblockUri' && progress.isEdit) {
			request.response.addUndoStop({ id: progress.undoStopId ?? generateUuid(), kind: 'undoStop' });
			request.response.updateContent(progress, quiet);
		} else if (progress.kind === 'progressTaskResult') {
			// Should have been handled upstream, not sent to model
			this.logService.error(`Couldn't handle progress: ${JSON.stringify(progress)}`);
		} else {
			request.response.updateContent(progress, quiet);
		}
	}

	removeRequest(id: string, reason: ChatRequestRemovalReason = ChatRequestRemovalReason.Removal): void {
		const index = this._requests.findIndex(request => request.id === id);
		const request = this._requests[index];

		if (index !== -1) {
			this._onDidChange.fire({ kind: 'removeRequest', requestId: request.id, responseId: request.response?.id, reason });
			this._requests.splice(index, 1);
			request.response?.dispose();
		}
	}

	cancelRequest(request: ChatRequestModel): void {
		if (request.response) {
			request.response.cancel();
		}
	}

	setResponse(request: ChatRequestModel, result: IChatAgentResult): void {
		if (!request.response) {
			request.response = new ChatResponseModel({
				responseContent: [],
				session: this,
				requestId: request.id,
				codeBlockInfos: undefined,
			});
		}

		request.response.setResult(result);
	}

	setFollowups(request: ChatRequestModel, followups: IChatFollowup[] | undefined): void {
		if (!request.response) {
			// Maybe something went wrong?
			return;
		}
		request.response.setFollowups(followups);
	}

	setResponseModel(request: ChatRequestModel, response: ChatResponseModel): void {
		request.response = response;
		this._onDidChange.fire({ kind: 'addResponse', response });
	}

	toExport(): IExportableChatData {
		return {
			responderUsername: this.responderUsername,
			initialLocation: this.initialLocation,
			requests: this._requests.map((r): ISerializableChatRequestData => {
				const message = {
					...r.message,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					parts: r.message.parts.map((p: any) => p && 'toJSON' in p ? (p.toJSON as Function)() : p)
				};
				const agent = r.response?.agent;
				const agentJson = agent && 'toJSON' in agent ? (agent.toJSON as Function)() :
					agent ? { ...agent } : undefined;
				return {
					requestId: r.id,
					message,
					variableData: IChatRequestVariableData.toExport(r.variableData),
					response: r.response ?
						r.response.entireResponse.value.map(item => {
							// Keeping the shape of the persisted data the same for back compat
							if (item.kind === 'treeData') {
								return item.treeData;
							} else if (item.kind === 'markdownContent') {
								return item.content;
							} else {
								// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
								return item as any; // TODO
							}
						})
						: undefined,
					shouldBeRemovedOnSend: r.shouldBeRemovedOnSend,
					agent: agentJson,
					timestamp: r.timestamp,
					confirmation: r.confirmation,
					editedFileEvents: r.editedFileEvents,
					modelId: r.modelId,
					...r.response?.toJSON(),
				};
			}),
		};
	}

	toJSON(): ISerializableChatData {
		return {
			version: 3,
			...this.toExport(),
			sessionId: this.sessionId,
			creationDate: this._timestamp,
			customTitle: this._customTitle,
			inputState: this.inputModel.toJSON(),
			repoData: this._repoData,
		};
	}

	override dispose() {
		this._requests.forEach(r => r.response?.dispose());
		this._onDidDispose.fire();

		super.dispose();
	}
}

export function updateRanges(variableData: IChatRequestVariableData, diff: number): IChatRequestVariableData {
	return {
		variables: variableData.variables.map(v => ({
			...v,
			range: v.range && {
				start: v.range.start - diff,
				endExclusive: v.range.endExclusive - diff
			}
		}))
	};
}

export function canMergeMarkdownStrings(md1: IMarkdownString, md2: IMarkdownString): boolean {
	if (md1.baseUri && md2.baseUri) {
		const baseUriEquals = md1.baseUri.scheme === md2.baseUri.scheme
			&& md1.baseUri.authority === md2.baseUri.authority
			&& md1.baseUri.path === md2.baseUri.path
			&& md1.baseUri.query === md2.baseUri.query
			&& md1.baseUri.fragment === md2.baseUri.fragment;
		if (!baseUriEquals) {
			return false;
		}
	} else if (md1.baseUri || md2.baseUri) {
		return false;
	}

	return equals(md1.isTrusted, md2.isTrusted) &&
		md1.supportHtml === md2.supportHtml &&
		md1.supportThemeIcons === md2.supportThemeIcons;
}

export function appendMarkdownString(md1: IMarkdownString, md2: IMarkdownString | string): IMarkdownString {
	const appendedValue = typeof md2 === 'string' ? md2 : md2.value;
	return {
		value: md1.value + appendedValue,
		isTrusted: md1.isTrusted,
		supportThemeIcons: md1.supportThemeIcons,
		supportHtml: md1.supportHtml,
		baseUri: md1.baseUri
	};
}

export function getCodeCitationsMessage(citations: ReadonlyArray<IChatCodeCitation>): string {
	if (citations.length === 0) {
		return '';
	}

	const licenseTypes = citations.reduce((set, c) => set.add(c.license), new Set<string>());
	const label = licenseTypes.size === 1 ?
		localize('codeCitation', "Similar code found with 1 license type", licenseTypes.size) :
		localize('codeCitations', "Similar code found with {0} license types", licenseTypes.size);
	return label;
}

export enum ChatRequestEditedFileEventKind {
	Keep = 1,
	Undo = 2,
	UserModification = 3,
}

export interface IChatAgentEditedFileEvent {
	readonly uri: URI;
	readonly eventKind: ChatRequestEditedFileEventKind;
}

/** URI for a resource embedded in a chat request/response */
export namespace ChatResponseResource {
	export const scheme = 'vscode-chat-response-resource';

	export function createUri(sessionResource: URI, toolCallId: string, index: number, basename?: string): URI {
		return URI.from({
			scheme: ChatResponseResource.scheme,
			authority: encodeHex(VSBuffer.fromString(sessionResource.toString())),
			path: `/tool/${toolCallId}/${index}` + (basename ? `/${basename}` : ''),
		});
	}

	export function parseUri(uri: URI): undefined | { sessionResource: URI; toolCallId: string; index: number } {
		if (uri.scheme !== ChatResponseResource.scheme) {
			return undefined;
		}

		const parts = uri.path.split('/');
		if (parts.length < 5) {
			return undefined;
		}

		const [, kind, toolCallId, index] = parts;
		if (kind !== 'tool') {
			return undefined;
		}

		let sessionResource: URI;
		try {
			sessionResource = URI.parse(decodeHex(uri.authority).toString());
		} catch (e) {
			if (e instanceof SyntaxError) { // pre-1.108 local session ID
				sessionResource = LocalChatSessionUri.forSession(uri.authority);
			} else {
				throw e;
			}
		}

		return {
			sessionResource,
			toolCallId: toolCallId,
			index: Number(index),
		};
	}
}
