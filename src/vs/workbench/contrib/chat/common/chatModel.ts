/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../base/common/arrays.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString, MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { revive } from '../../../../base/common/marshalling.js';
import { Schemas } from '../../../../base/common/network.js';
import { equals } from '../../../../base/common/objects.js';
import { IObservable, ObservablePromise, autorunSelfDisposable, observableFromEvent, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI, UriComponents, UriDto, isUriComponents } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { EditSuggestionId } from '../../../../editor/common/textModelEditSource.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CellUri, ICellEditOperation } from '../../notebook/common/notebookCommon.js';
import { migrateLegacyTerminalToolSpecificData } from './chat.js';
import { IChatAgentCommand, IChatAgentData, IChatAgentResult, IChatAgentService, UserSelectedTools, reviveSerializedAgent } from './chatAgents.js';
import { IChatEditingService, IChatEditingSession } from './chatEditingService.js';
import { ChatRequestTextPart, IParsedChatRequest, reviveParsedChatRequest } from './chatParserTypes.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, ChatResponseClearToPreviousToolInvocationReason, IChatAgentMarkdownContentWithVulnerability, IChatClearToPreviousToolInvocation, IChatCodeCitation, IChatCommandButton, IChatConfirmation, IChatContentInlineReference, IChatContentReference, IChatEditingSessionAction, IChatElicitationRequest, IChatExtensionsContent, IChatFollowup, IChatLocationData, IChatMarkdownContent, IChatMcpServersStarting, IChatMultiDiffData, IChatNotebookEdit, IChatPrepareToolInvocationPart, IChatProgress, IChatProgressMessage, IChatPullRequestContent, IChatResponseCodeblockUriPart, IChatResponseProgressFileTreeData, IChatSessionContext, IChatTask, IChatTaskSerialized, IChatTextEdit, IChatThinkingPart, IChatToolInvocation, IChatToolInvocationSerialized, IChatTreeData, IChatUndoStop, IChatUsedContext, IChatWarningMessage, isIUsedContext } from './chatService.js';
import { LocalChatSessionUri } from './chatUri.js';
import { ChatRequestToolReferenceEntry, IChatRequestVariableEntry } from './chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from './constants.js';


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
	variables: IChatRequestVariableEntry[];
}

export interface IChatRequestModel {
	readonly id: string;
	readonly timestamp: number;
	readonly username: string;
	readonly modeInfo?: IChatRequestModeInfo;
	readonly avatarIconUri?: URI;
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
	shouldBeBlocked: boolean;
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
	| IChatMultiDiffData
	| IChatContentInlineReference
	| IChatProgressMessage
	| IChatCommandButton
	| IChatWarningMessage
	| IChatTask
	| IChatTaskSerialized
	| IChatTextEditGroup
	| IChatNotebookEditGroup
	| IChatConfirmation
	| IChatExtensionsContent
	| IChatThinkingPart
	| IChatPullRequestContent;

/**
 * "Normal" progress kinds that are rendered as parts of the stream of content.
 */
export type IChatProgressResponseContent =
	| IChatProgressHistoryResponseContent
	| IChatToolInvocation
	| IChatToolInvocationSerialized
	| IChatUndoStop
	| IChatPrepareToolInvocationPart
	| IChatElicitationRequest
	| IChatClearToPreviousToolInvocation
	| IChatMcpServersStarting;

const nonHistoryKinds = new Set(['toolInvocation', 'toolInvocationSerialized', 'undoStop', 'prepareToolInvocation']);
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
	readonly avatarIcon?: ThemeIcon | URI;
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
	readonly isComplete: boolean;
	readonly isCanceled: boolean;
	readonly isPendingConfirmation: IObservable<boolean>;
	readonly isInProgress: IObservable<boolean>;
	readonly shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	shouldBeBlocked: boolean;
	readonly isCompleteAddedRequest: boolean;
	/** A stale response is one that has been persisted and rehydrated, so e.g. Commands that have their arguments stored in the EH are gone. */
	readonly isStale: boolean;
	readonly vote: ChatAgentVoteDirection | undefined;
	readonly voteDownReason: ChatAgentVoteDownReason | undefined;
	readonly followups?: IChatFollowup[] | undefined;
	readonly result?: IChatAgentResult;
	readonly codeBlockInfos: ICodeBlockInfo[] | undefined;

	initializeCodeBlockInfos(codeBlockInfo: ICodeBlockInfo[]): void;
	addUndoStop(undoStop: IChatUndoStop): void;
	setVote(vote: ChatAgentVoteDirection): void;
	setVoteDownReason(reason: ChatAgentVoteDownReason | undefined): void;
	setEditApplied(edit: IChatTextEditGroup, editCount: number): boolean;
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
	| { reason: 'undoStop'; id: string };

const defaultChatResponseModelChangeReason: ChatResponseModelChangeReason = { reason: 'other' };

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

	public shouldBeBlocked: boolean = false;

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

	public get username(): string {
		return this.session.requesterUsername;
	}

	public get avatarIconUri(): URI | undefined {
		return this.session.requesterAvatarIconUri;
	}

	public get attempt(): number {
		return this._attempt;
	}

	public get variableData(): IChatRequestVariableData {
		return this._variableData;
	}

	public set variableData(v: IChatRequestVariableData) {
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
				case 'prepareToolInvocation':
				case 'elicitation':
				case 'thinking':
				case 'multiDiffData':
				case 'mcpServersStarting':
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
				default:
					segment = { text: part.content.value };
					break;
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


	constructor(value: IMarkdownString | ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability | IChatResponseCodeblockUriPart | IChatThinkingPart>) {
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
			const isEmpty = (s: string) => s.trim().length === 0;

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
			// If the progress.uri is a cell Uri, its possible its part of the inline chat.
			// Old approach of notebook inline chat would not start and end with notebook Uri, so we need to check for old approach.
			const useOldApproachForInlineNotebook = progress.uri.scheme === Schemas.vscodeNotebookCell && !this._responseParts.find(part => part.kind === 'notebookEditGroup');
			// merge edits for the same file no matter when they come in
			const notebookUri = useOldApproachForInlineNotebook ? undefined : CellUri.parse(progress.uri)?.notebook;
			const uri = notebookUri ?? progress.uri;
			let found = false;
			const groupKind = progress.kind === 'textEdit' && !notebookUri ? 'textEditGroup' : 'notebookEditGroup';
			const edits: any = groupKind === 'textEditGroup' ? progress.edits : progress.edits.map(edit => TextEdit.isTextEdit(edit) ? { uri: progress.uri, edit } : edit);
			const isExternalEdit = progress.isExternalEdit;
			for (let i = 0; !found && i < this._responseParts.length; i++) {
				const candidate = this._responseParts[i];
				if (candidate.kind === groupKind && !candidate.done && isEqual(candidate.uri, uri)) {
					candidate.edits.push(edits);
					candidate.done = progress.done;
					found = true;
				}
			}
			if (!found) {
				this._responseParts.push({
					kind: groupKind,
					uri,
					edits: groupKind === 'textEditGroup' ? [edits] : edits,
					done: progress.done,
					isExternalEdit,
				});
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
	responseContent: IMarkdownString | ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability | IChatResponseCodeblockUriPart | IChatThinkingPart>;
	session: ChatModel;
	agent?: IChatAgentData;
	slashCommand?: IChatAgentCommand;
	requestId: string;
	isComplete?: boolean;
	isCanceled?: boolean;
	vote?: ChatAgentVoteDirection;
	voteDownReason?: ChatAgentVoteDownReason;
	result?: IChatAgentResult;
	followups?: ReadonlyArray<IChatFollowup>;
	isCompleteAddedRequest?: boolean;
	shouldBeRemovedOnSend?: IChatRequestDisablement;
	shouldBeBlocked?: boolean;
	restoredId?: string;
	/**
	 * undefined means it will be set later.
	*/
	codeBlockInfos: ICodeBlockInfo[] | undefined;
}

export class ChatResponseModel extends Disposable implements IChatResponseModel {
	private readonly _onDidChange = this._register(new Emitter<ChatResponseModelChangeReason>());
	readonly onDidChange = this._onDidChange.event;

	public readonly id: string;
	public readonly requestId: string;
	private _session: ChatModel;
	private _agent: IChatAgentData | undefined;
	private _slashCommand: IChatAgentCommand | undefined;
	private _isComplete: boolean;
	private _isCanceled: boolean;
	private _vote?: ChatAgentVoteDirection;
	private _voteDownReason?: ChatAgentVoteDownReason;
	private _result?: IChatAgentResult;
	private _shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	public readonly isCompleteAddedRequest: boolean;
	private _shouldBeBlocked: boolean = false;

	public get shouldBeBlocked() {
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
		return this._isComplete;
	}

	public set shouldBeRemovedOnSend(disablement: IChatRequestDisablement | undefined) {
		this._shouldBeRemovedOnSend = disablement;
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
	}

	public get isCanceled(): boolean {
		return this._isCanceled;
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

	public get username(): string {
		return this.session.responderUsername;
	}

	public get avatarIcon(): ThemeIcon | URI | undefined {
		return this.session.responderAvatarIcon;
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


	readonly isPendingConfirmation: IObservable<boolean>;

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
		this._isComplete = params.isComplete ?? false;
		this._isCanceled = params.isCanceled ?? false;
		this._vote = params.vote;
		this._voteDownReason = params.voteDownReason;
		this._result = params.result;
		this._followups = params.followups ? [...params.followups] : undefined;
		this.isCompleteAddedRequest = params.isCompleteAddedRequest ?? false;
		this._shouldBeRemovedOnSend = params.shouldBeRemovedOnSend;
		this._shouldBeBlocked = params.shouldBeBlocked ?? false;

		// If we are creating a response with some existing content, consider it stale
		this._isStale = Array.isArray(params.responseContent) && (params.responseContent.length !== 0 || isMarkdownString(params.responseContent) && params.responseContent.value.length !== 0);

		this._response = this._register(new Response(params.responseContent));
		this._codeBlockInfos = params.codeBlockInfos ? [...params.codeBlockInfos] : undefined;

		const signal = observableSignalFromEvent(this, this.onDidChange);

		this.isPendingConfirmation = signal.map((_value, r) => {

			signal.read(r);

			return this._response.value.some(part =>
				part.kind === 'toolInvocation' && part.state.read(r).type === IChatToolInvocation.StateKind.WaitingForConfirmation
				|| part.kind === 'confirmation' && part.isUsed === false
			);
		});

		this.isInProgress = signal.map((_value, r) => {

			signal.read(r);

			return !this.isPendingConfirmation.read(r)
				&& !this.shouldBeRemovedOnSend
				&& !this._isComplete;
		});

		this._register(this._response.onDidChangeValue(() => this._onDidChange.fire(defaultChatResponseModelChangeReason)));
		this.id = params.restoredId ?? 'response_' + generateUuid();

		this._register(this._session.onDidChange((e) => {
			if (e.kind === 'setCheckpoint') {
				const isDisabled = e.disabledResponseIds.has(this.id);
				const didChange = this._shouldBeBlocked === isDisabled;
				this._shouldBeBlocked = isDisabled;
				if (didChange) {
					this._onDidChange.fire(defaultChatResponseModelChangeReason);
				}
			}
		}));
	}

	initializeCodeBlockInfos(codeBlockInfo: ICodeBlockInfo[]): void {
		if (this._codeBlockInfos) {
			throw new BugIndicatingError('Code block infos have already been initialized');
		}
		this._codeBlockInfos = [...codeBlockInfo];
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

	complete(): void {
		if (this._result?.errorDetails?.responseIsRedacted) {
			this._response.clear();
		}

		this._isComplete = true;
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
	}

	cancel(): void {
		this._isComplete = true;
		this._isCanceled = true;
		this._onDidChange.fire(defaultChatResponseModelChangeReason);
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

}


export interface IChatRequestDisablement {
	requestId: string;
	afterUndoStop?: string;
}

export interface IChatModel extends IDisposable {
	readonly onDidDispose: Event<void>;
	readonly onDidChange: Event<IChatChangeEvent>;
	/** @deprecated Use {@link sessionResource} instead */
	readonly sessionId: string;
	readonly sessionResource: URI;
	readonly initialLocation: ChatAgentLocation;
	readonly title: string;
	readonly hasCustomTitle: boolean;
	readonly requestInProgress: boolean;
	readonly requestInProgressObs: IObservable<boolean>;
	readonly inputPlaceholder?: string;
	readonly editingSessionObs?: ObservablePromise<IChatEditingSession> | undefined;
	readonly editingSession?: IChatEditingSession | undefined;
	/**
	 * Sets requests as 'disabled', removing them from the UI. If a request ID
	 * is given without undo stops, it's removed entirely. If an undo stop
	 * is given, all content after that stop is removed.
	 */
	setDisabledRequests(requestIds: IChatRequestDisablement[]): void;
	getRequests(): IChatRequestModel[];
	setCheckpoint(requestId: string | undefined): void;
	readonly checkpoint: IChatRequestModel | undefined;
	addRequest(message: IParsedChatRequest, variableData: IChatRequestVariableData, attempt: number, modeInfo?: IChatRequestModeInfo, chatAgent?: IChatAgentData, slashCommand?: IChatAgentCommand, confirmation?: string, locationData?: IChatLocationData, attachments?: IChatRequestVariableEntry[], isCompleteAddedRequest?: boolean, modelId?: string, userSelectedTools?: UserSelectedTools): IChatRequestModel;
	acceptResponseProgress(request: IChatRequestModel, progress: IChatProgress, quiet?: boolean): void;
	setResponse(request: IChatRequestModel, result: IChatAgentResult): void;
	completeResponse(request: IChatRequestModel): void;
	setCustomTitle(title: string): void;
	toExport(): IExportableChatData;
	toJSON(): ISerializableChatData;
	readonly contributedChatSession: IChatSessionContext | undefined;
	setContributedChatSession(session: IChatSessionContext | undefined): void;
}

export interface ISerializableChatsData {
	[sessionId: string]: ISerializableChatData;
}

export type ISerializableChatAgentData = UriDto<IChatAgentData>;

export interface ISerializableChatRequestData {
	requestId: string;
	message: string | IParsedChatRequest; // string => old format
	/** Is really like "prompt data". This is the message in the format in which the agent gets it + variable values. */
	variableData: IChatRequestVariableData;
	response: ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability | IChatThinkingPart> | undefined;

	/**Old, persisted name for shouldBeRemovedOnSend */
	isHidden?: boolean;
	shouldBeRemovedOnSend?: IChatRequestDisablement;
	responseId?: string;
	agent?: ISerializableChatAgentData;
	workingSet?: UriComponents[];
	slashCommand?: IChatAgentCommand;
	// responseErrorDetails: IChatResponseErrorDetails | undefined;
	result?: IChatAgentResult; // Optional for backcompat
	followups: ReadonlyArray<IChatFollowup> | undefined;
	isCanceled: boolean | undefined;
	vote: ChatAgentVoteDirection | undefined;
	voteDownReason?: ChatAgentVoteDownReason;
	/** For backward compat: should be optional */
	usedContext?: IChatUsedContext;
	contentReferences?: ReadonlyArray<IChatContentReference>;
	codeCitations?: ReadonlyArray<IChatCodeCitation>;
	timestamp?: number;
	confirmation?: string;
	editedFileEvents?: IChatAgentEditedFileEvent[];
	modelId?: string;

	responseMarkdownInfo: ISerializableMarkdownInfo[] | undefined;
}

export interface ISerializableMarkdownInfo {
	readonly suggestionId: EditSuggestionId;
}

export interface IExportableChatData {
	initialLocation: ChatAgentLocation | undefined;
	requests: ISerializableChatRequestData[];
	requesterUsername: string;
	responderUsername: string;
	requesterAvatarIconUri: UriComponents | undefined;
	responderAvatarIconUri: ThemeIcon | UriComponents | undefined; // Keeping Uri name for backcompat
}

/*
	NOTE: every time the serialized data format is updated, we need to create a new interface, because we may need to handle any old data format when parsing.
*/

export interface ISerializableChatData1 extends IExportableChatData {
	sessionId: string;
	creationDate: number;
	isImported: boolean;

	/** Indicates that this session was created in this window. Is cleared after the chat has been written to storage once. Needed to sync chat creations/deletions between empty windows. */
	isNew?: boolean;
}

export interface ISerializableChatData2 extends ISerializableChatData1 {
	version: 2;
	lastMessageDate: number;
	computedTitle: string | undefined;
}

export interface ISerializableChatData3 extends Omit<ISerializableChatData2, 'version' | 'computedTitle'> {
	version: 3;
	customTitle: string | undefined;
}

/**
* Chat data that has been parsed and normalized to the current format.
*/
export type ISerializableChatData = ISerializableChatData3;

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
			lastMessageDate: raw.creationDate,
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

	if ('version' in raw && (raw.version === 2 || raw.version === 3)) {
		if (!raw.lastMessageDate) {
			// A bug led to not porting creationDate properly, and that was copied to lastMessageDate, so fix that up if missing.
			raw.lastMessageDate = getLastYearDate();
		}
	}

	// eslint-disable-next-line local/code-no-any-casts
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
	const data = obj as IExportableChatData;
	return typeof data === 'object' &&
		typeof data.requesterUsername === 'string';
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
	| IChatSetCheckpointEvent
	| IChatSetCustomTitleEvent
	;

export interface IChatAddRequestEvent {
	kind: 'addRequest';
	request: IChatRequestModel;
}

export interface IChatSetCheckpointEvent {
	kind: 'setCheckpoint';
	disabledRequestIds: Set<string>;
	disabledResponseIds: Set<string>;
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
	hiddenRequestIds: readonly IChatRequestDisablement[];
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

	private _requests: ChatRequestModel[];

	private _contributedChatSession: IChatSessionContext | undefined;
	public get contributedChatSession(): IChatSessionContext | undefined {
		return this._contributedChatSession;
	}
	public setContributedChatSession(session: IChatSessionContext | undefined) {
		this._contributedChatSession = session;
	}

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

	get requestInProgress(): boolean {
		return this.requestInProgressObs.get();
	}

	readonly requestInProgressObs: IObservable<boolean>;


	get hasRequests(): boolean {
		return this._requests.length > 0;
	}

	get lastRequest(): ChatRequestModel | undefined {
		return this._requests.at(-1);
	}

	private _creationDate: number;
	get creationDate(): number {
		return this._creationDate;
	}

	private _lastMessageDate: number;
	get lastMessageDate(): number {
		return this._lastMessageDate;
	}

	private get _defaultAgent() {
		return this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Ask);
	}

	private readonly _initialRequesterUsername: string | undefined;
	get requesterUsername(): string {
		return this._defaultAgent?.metadata.requester?.name ??
			this._initialRequesterUsername ?? '';
	}

	private readonly _initialResponderUsername: string | undefined;
	get responderUsername(): string {
		return this._defaultAgent?.fullName ??
			this._initialResponderUsername ?? '';
	}

	private readonly _initialRequesterAvatarIconUri: URI | undefined;
	get requesterAvatarIconUri(): URI | undefined {
		return this._defaultAgent?.metadata.requester?.icon ??
			this._initialRequesterAvatarIconUri;
	}

	private readonly _initialResponderAvatarIconUri: ThemeIcon | URI | undefined;
	get responderAvatarIcon(): ThemeIcon | URI | undefined {
		return this._defaultAgent?.metadata.themeIcon ??
			this._initialResponderAvatarIconUri;
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

	private _editingSession: ObservablePromise<IChatEditingSession> | undefined;
	get editingSessionObs(): ObservablePromise<IChatEditingSession> | undefined {
		return this._editingSession;
	}

	get editingSession(): IChatEditingSession | undefined {
		return this._editingSession?.promiseResult.get()?.data;
	}

	private readonly _initialLocation: ChatAgentLocation;
	get initialLocation(): ChatAgentLocation {
		return this._initialLocation;
	}

	private readonly _canUseTools: boolean = true;
	get canUseTools(): boolean {
		return this._canUseTools;
	}

	constructor(
		initialData: ISerializableChatData | IExportableChatData | undefined,
		initialModelProps: { initialLocation: ChatAgentLocation; canUseTools: boolean; resource?: URI },
		@ILogService private readonly logService: ILogService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
	) {
		super();

		const isValid = isSerializableSessionData(initialData);
		if (initialData && !isValid) {
			this.logService.warn(`ChatModel#constructor: Loaded malformed session data: ${JSON.stringify(initialData)}`);
		}

		this._isImported = (!!initialData && !isValid) || (initialData?.isImported ?? false);
		this._sessionId = (isValid && initialData.sessionId) || generateUuid();
		this._sessionResource = initialModelProps.resource ?? LocalChatSessionUri.forSession(this._sessionId);

		this._requests = initialData ? this._deserialize(initialData) : [];
		this._creationDate = (isValid && initialData.creationDate) || Date.now();
		this._lastMessageDate = (isValid && initialData.lastMessageDate) || this._creationDate;
		this._customTitle = isValid ? initialData.customTitle : undefined;

		this._initialRequesterUsername = initialData?.requesterUsername;
		this._initialResponderUsername = initialData?.responderUsername;
		this._initialRequesterAvatarIconUri = initialData?.requesterAvatarIconUri && URI.revive(initialData.requesterAvatarIconUri);
		this._initialResponderAvatarIconUri = isUriComponents(initialData?.responderAvatarIconUri) ? URI.revive(initialData.responderAvatarIconUri) : initialData?.responderAvatarIconUri;

		this._initialLocation = initialData?.initialLocation ?? initialModelProps.initialLocation;
		this._canUseTools = initialModelProps.canUseTools;

		const lastResponse = observableFromEvent(this, this.onDidChange, () => this._requests.at(-1)?.response);

		this.requestInProgressObs = lastResponse.map((response, r) => {
			return response?.isInProgress.read(r) ?? false;
		});
	}

	startEditingSession(isGlobalEditingSession?: boolean, transferFromSession?: IChatEditingSession): void {
		const editingSessionPromise = transferFromSession
			? this.chatEditingService.transferEditingSession(this, transferFromSession)
			: isGlobalEditingSession ?
				this.chatEditingService.startOrContinueGlobalEditingSession(this) :
				this.chatEditingService.createEditingSession(this);
		this._editingSession = new ObservablePromise(editingSessionPromise);
		this._editingSession.promise.then(editingSession => {
			this._store.isDisposed ? editingSession.dispose() : this._register(editingSession);
		});
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

	private _deserialize(obj: IExportableChatData): ChatRequestModel[] {
		const requests = obj.requests;
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
				// eslint-disable-next-line local/code-no-any-casts
				if (raw.response || raw.result || (raw as any).responseErrorDetails) {
					const agent = (raw.agent && 'metadata' in raw.agent) ? // Check for the new format, ignore entries in the old format
						reviveSerializedAgent(raw.agent) : undefined;

					// Port entries from old format
					const result = 'responseErrorDetails' in raw ?
						// eslint-disable-next-line local/code-no-dangerous-type-assertions
						{ errorDetails: raw.responseErrorDetails } as IChatAgentResult : raw.result;
					request.response = new ChatResponseModel({
						responseContent: raw.response ?? [new MarkdownString(raw.response)],
						session: this,
						agent,
						slashCommand: raw.slashCommand,
						requestId: request.id,
						isComplete: true,
						isCanceled: raw.isCanceled,
						vote: raw.vote,
						voteDownReason: raw.voteDownReason,
						result,
						followups: raw.followups,
						restoredId: raw.responseId,
						shouldBeBlocked: request.shouldBeBlocked,
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

		variableData.variables = variableData.variables.map<IChatRequestVariableEntry>((v): IChatRequestVariableEntry => {
			// Old variables format
			if (v && 'values' in v && Array.isArray(v.values)) {
				return {
					kind: 'generic',
					id: v.id ?? '',
					name: v.name,
					value: v.values[0]?.value,
					range: v.range,
					modelDescription: v.modelDescription,
					references: v.references
				};
			} else {
				return v;
			}
		});

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
			request.shouldBeBlocked = false;
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
					request.shouldBeBlocked = true;
				}
			});

			if (!checkpoint) {
				return; // Invalid request ID
			}
		}

		const disabledRequestIds = new Set<string>();
		const disabledResponseIds = new Set<string>();
		for (let i = this._requests.length - 1; i >= 0; i -= 1) {
			const request = this._requests[i];
			if (this._checkpoint && !checkpoint) {
				request.shouldBeBlocked = false;
			} else if (checkpoint && i >= checkpointIndex) {
				request.shouldBeBlocked = true;
				disabledRequestIds.add(request.id);
				if (request.response) {
					disabledResponseIds.add(request.response.id);
				}
			} else if (checkpoint && i < checkpointIndex) {
				request.shouldBeBlocked = false;
			}
		}

		this._checkpoint = checkpoint;
		this._onDidChange.fire({
			kind: 'setCheckpoint',
			disabledRequestIds,
			disabledResponseIds
		});
	}

	private _checkpoint: ChatRequestModel | undefined = undefined;
	public get checkpoint() {
		return this._checkpoint;
	}

	setDisabledRequests(requestIds: IChatRequestDisablement[]) {
		this._requests.forEach((request) => {
			const shouldBeRemovedOnSend = requestIds.find(r => r.requestId === request.id);
			request.shouldBeRemovedOnSend = shouldBeRemovedOnSend;
			if (request.response) {
				request.response.shouldBeRemovedOnSend = shouldBeRemovedOnSend;
			}
		});

		this._onDidChange.fire({
			kind: 'setHidden',
			hiddenRequestIds: requestIds,
		});
	}

	addRequest(message: IParsedChatRequest, variableData: IChatRequestVariableData, attempt: number, modeInfo?: IChatRequestModeInfo, chatAgent?: IChatAgentData, slashCommand?: IChatAgentCommand, confirmation?: string, locationData?: IChatLocationData, attachments?: IChatRequestVariableEntry[], isCompleteAddedRequest?: boolean, modelId?: string, userSelectedTools?: UserSelectedTools): ChatRequestModel {
		const editedFileEvents = [...this.currentEditedFileEvents.values()];
		this.currentEditedFileEvents.clear();
		const request = new ChatRequestModel({
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
		this._lastMessageDate = Date.now();
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
			request.response.addUndoStop({ id: generateUuid(), kind: 'undoStop' });
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

	completeResponse(request: ChatRequestModel): void {
		if (!request.response) {
			throw new Error('Call setResponse before completeResponse');
		}

		request.response.complete();
		this._onDidChange.fire({ kind: 'completedRequest', request });
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
			requesterUsername: this.requesterUsername,
			requesterAvatarIconUri: this.requesterAvatarIconUri,
			responderUsername: this.responderUsername,
			responderAvatarIconUri: this.responderAvatarIcon,
			initialLocation: this.initialLocation,
			requests: this._requests.map((r): ISerializableChatRequestData => {
				const message = {
					...r.message,
					parts: r.message.parts.map((p: any) => p && 'toJSON' in p ? (p.toJSON as Function)() : p)
				};
				const agent = r.response?.agent;
				const agentJson = agent && 'toJSON' in agent ? (agent.toJSON as Function)() :
					agent ? { ...agent } : undefined;
				return {
					requestId: r.id,
					message,
					variableData: r.variableData,
					response: r.response ?
						r.response.entireResponse.value.map(item => {
							// Keeping the shape of the persisted data the same for back compat
							if (item.kind === 'treeData') {
								return item.treeData;
							} else if (item.kind === 'markdownContent') {
								return item.content;
							} else if (item.kind === 'thinking') {
								return {
									kind: 'thinking',
									value: item.value,
									id: item.id,
									metadata: item.metadata
								};
							} else if (item.kind === 'confirmation') {
								return { ...item, isLive: false };
							} else {
								// eslint-disable-next-line local/code-no-any-casts
								return item as any; // TODO
							}
						})
						: undefined,
					responseId: r.response?.id,
					shouldBeRemovedOnSend: r.shouldBeRemovedOnSend,
					result: r.response?.result,
					responseMarkdownInfo: r.response?.codeBlockInfos?.map<ISerializableMarkdownInfo>(info => ({ suggestionId: info.suggestionId })),
					followups: r.response?.followups,
					isCanceled: r.response?.isCanceled,
					vote: r.response?.vote,
					voteDownReason: r.response?.voteDownReason,
					agent: agentJson,
					slashCommand: r.response?.slashCommand,
					usedContext: r.response?.usedContext,
					contentReferences: r.response?.contentReferences,
					codeCitations: r.response?.codeCitations,
					timestamp: r.timestamp,
					confirmation: r.confirmation,
					editedFileEvents: r.editedFileEvents,
					modelId: r.modelId,
				};
			}),
		};
	}

	toJSON(): ISerializableChatData {
		return {
			version: 3,
			...this.toExport(),
			sessionId: this.sessionId,
			creationDate: this._creationDate,
			isImported: this._isImported,
			lastMessageDate: this._lastMessageDate,
			customTitle: this._customTitle
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

	export function createUri(sessionId: string, toolCallId: string, index: number, basename?: string): URI {
		return URI.from({
			scheme: ChatResponseResource.scheme,
			authority: sessionId,
			path: `/tool/${toolCallId}/${index}` + (basename ? `/${basename}` : ''),
		});
	}

	export function parseUri(uri: URI): undefined | { sessionId: string; toolCallId: string; index: number } {
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

		return {
			sessionId: uri.authority,
			toolCallId: toolCallId,
			index: Number(index),
		};
	}
}
