/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../base/common/arrays.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString, MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { revive } from '../../../../base/common/marshalling.js';
import { Schemas } from '../../../../base/common/network.js';
import { equals } from '../../../../base/common/objects.js';
import { IObservable, ITransaction, observableValue } from '../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI, UriComponents, UriDto, isUriComponents } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IOffsetRange, OffsetRange } from '../../../../editor/common/core/offsetRange.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { Location, SymbolKind, TextEdit } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMarker, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { CellUri, ICellEditOperation } from '../../notebook/common/notebookCommon.js';
import { ChatAgentLocation, IChatAgentCommand, IChatAgentData, IChatAgentResult, IChatAgentService, IChatWelcomeMessageContent, reviveSerializedAgent } from './chatAgents.js';
import { ChatRequestTextPart, IParsedChatRequest, reviveParsedChatRequest } from './chatParserTypes.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, IChatAgentMarkdownContentWithVulnerability, IChatCodeCitation, IChatCommandButton, IChatConfirmation, IChatContentInlineReference, IChatContentReference, IChatFollowup, IChatLocationData, IChatMarkdownContent, IChatNotebookEdit, IChatProgress, IChatProgressMessage, IChatResponseCodeblockUriPart, IChatResponseProgressFileTreeData, IChatTask, IChatTextEdit, IChatToolInvocation, IChatToolInvocationSerialized, IChatTreeData, IChatUndoStop, IChatUsedContext, IChatWarningMessage, isIUsedContext } from './chatService.js';
import { IChatRequestVariableValue } from './chatVariables.js';

export interface IBaseChatRequestVariableEntry {
	id: string;
	fullName?: string;
	icon?: ThemeIcon;
	name: string;
	modelDescription?: string;
	range?: IOffsetRange;
	value: IChatRequestVariableValue;
	references?: IChatContentReference[];
	mimeType?: string;

	// TODO these represent different kinds, should be extracted to new interfaces with kind tags
	kind?: never;
	isFile?: boolean;
	isDirectory?: boolean;
	isTool?: boolean;
	isImage?: boolean;
	isOmitted?: boolean;
}

export interface IChatRequestImplicitVariableEntry extends Omit<IBaseChatRequestVariableEntry, 'kind'> {
	readonly kind: 'implicit';
	readonly isFile: true;
	readonly value: URI | Location | undefined;
	readonly isSelection: boolean;
	enabled: boolean;
}

export interface IChatRequestPasteVariableEntry extends Omit<IBaseChatRequestVariableEntry, 'kind'> {
	readonly kind: 'paste';
	code: string;
	language: string;
	pastedLines: string;

	// This is only used for old serialized data and should be removed once we no longer support it
	fileName: string;

	// This is only undefined on old serialized data
	copiedFrom: {
		readonly uri: URI;
		readonly range: IRange;
	} | undefined;
}

export interface ISymbolVariableEntry extends Omit<IBaseChatRequestVariableEntry, 'kind'> {
	readonly kind: 'symbol';
	readonly value: Location;
	readonly symbolKind: SymbolKind;
}

export interface ICommandResultVariableEntry extends Omit<IBaseChatRequestVariableEntry, 'kind'> {
	readonly kind: 'command';
}

export interface ILinkVariableEntry extends Omit<IBaseChatRequestVariableEntry, 'kind'> {
	readonly kind: 'link';
	readonly value: URI;
}

export interface IImageVariableEntry extends Omit<IBaseChatRequestVariableEntry, 'kind'> {
	readonly kind: 'image';
	readonly isPasted?: boolean;
	readonly isURL?: boolean;
}

export interface IDiagnosticVariableEntryFilterData {
	readonly owner?: string;
	readonly problemMessage?: string;
	readonly filterUri?: URI;
	readonly filterSeverity?: MarkerSeverity;
	readonly filterRange?: IRange;
}

export namespace IDiagnosticVariableEntryFilterData {
	export const icon = Codicon.error;

	export function fromMarker(marker: IMarker): IDiagnosticVariableEntryFilterData {
		return {
			filterUri: marker.resource,
			owner: marker.owner,
			problemMessage: marker.message,
			filterRange: { startLineNumber: marker.startLineNumber, endLineNumber: marker.endLineNumber, startColumn: marker.startColumn, endColumn: marker.endColumn }
		};
	}

	export function toEntry(data: IDiagnosticVariableEntryFilterData): IDiagnosticVariableEntry {
		return {
			id: id(data),
			name: label(data),
			icon,
			value: data,
			kind: 'diagnostic' as const,
			range: data.filterRange ? new OffsetRange(data.filterRange.startLineNumber, data.filterRange.endLineNumber) : undefined,
			...data,
		};
	}

	export function id(data: IDiagnosticVariableEntryFilterData) {
		return [data.filterUri, data.owner, data.filterSeverity, data.filterRange?.startLineNumber].join(':');
	}

	export function label(data: IDiagnosticVariableEntryFilterData) {
		const enum TrimThreshold {
			MaxChars = 30,
			MaxSpaceLookback = 10,
		}
		if (data.problemMessage) {
			if (data.problemMessage.length < TrimThreshold.MaxChars) {
				return data.problemMessage;
			}

			// Trim the message, on a space if it would not lose too much
			// data (MaxSpaceLookback) or just blindly otherwise.
			const lastSpace = data.problemMessage.lastIndexOf(' ', TrimThreshold.MaxChars);
			if (lastSpace === -1 || lastSpace + TrimThreshold.MaxSpaceLookback < TrimThreshold.MaxChars) {
				return data.problemMessage.substring(0, TrimThreshold.MaxChars) + '…';
			}
			return data.problemMessage.substring(0, lastSpace) + '…';
		}
		let labelStr = localize('chat.attachment.problems.all', "All Problems");
		if (data.filterUri) {
			labelStr = localize('chat.attachment.problems.inFile', "Problems in {0}", basename(data.filterUri));
		}

		return labelStr;
	}
}

export interface IDiagnosticVariableEntry extends Omit<IBaseChatRequestVariableEntry, 'kind'>, IDiagnosticVariableEntryFilterData {
	readonly kind: 'diagnostic';
}

export type IChatRequestVariableEntry = IChatRequestImplicitVariableEntry | IChatRequestPasteVariableEntry | ISymbolVariableEntry | ICommandResultVariableEntry | ILinkVariableEntry | IBaseChatRequestVariableEntry | IDiagnosticVariableEntry | IImageVariableEntry;

export function isImplicitVariableEntry(obj: IChatRequestVariableEntry): obj is IChatRequestImplicitVariableEntry {
	return obj.kind === 'implicit';
}

export function isPasteVariableEntry(obj: IChatRequestVariableEntry): obj is IChatRequestPasteVariableEntry {
	return obj.kind === 'paste';
}

export function isLinkVariableEntry(obj: IChatRequestVariableEntry): obj is ILinkVariableEntry {
	return obj.kind === 'link';
}

export function isImageVariableEntry(obj: IChatRequestVariableEntry): obj is IImageVariableEntry {
	return obj.kind === 'image';
}

export function isDiagnosticsVariableEntry(obj: IChatRequestVariableEntry): obj is IDiagnosticVariableEntry {
	return obj.kind === 'diagnostic';
}

export function isChatRequestVariableEntry(obj: unknown): obj is IChatRequestVariableEntry {
	const entry = obj as IChatRequestVariableEntry;
	return typeof entry === 'object' &&
		entry !== null &&
		typeof entry.id === 'string' &&
		typeof entry.name === 'string';
}

export interface IChatRequestVariableData {
	variables: IChatRequestVariableEntry[];
}

export interface IChatRequestModel {
	readonly id: string;
	readonly timestamp: number;
	readonly username: string;
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
	shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
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
}

export function isCellTextEditOperation(value: unknown): value is ICellTextEditOperation {
	const candidate = value as ICellTextEditOperation;
	return !!candidate && !!candidate.edit && !!candidate.uri && URI.isUri(candidate.uri);
}

export interface ICellTextEditOperation {
	edit: TextEdit;
	uri: URI;
}

export interface IChatNotebookEditGroup {
	uri: URI;
	edits: (ICellTextEditOperation | ICellEditOperation)[];
	state?: IChatTextEditGroupState;
	kind: 'notebookEditGroup';
	done: boolean | undefined;
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
	| IChatContentInlineReference
	| IChatProgressMessage
	| IChatCommandButton
	| IChatWarningMessage
	| IChatTask
	| IChatTextEditGroup
	| IChatNotebookEditGroup
	| IChatConfirmation;

/**
 * "Normal" progress kinds that are rendered as parts of the stream of content.
 */
export type IChatProgressResponseContent =
	| IChatProgressHistoryResponseContent
	| IChatToolInvocation
	| IChatToolInvocationSerialized
	| IChatUndoStop;

const nonHistoryKinds = new Set(['toolInvocation', 'toolInvocationSerialized']);
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
	readonly isPaused: IObservable<boolean>;
	readonly isPendingConfirmation: boolean;
	readonly shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	readonly isCompleteAddedRequest: boolean;
	/** A stale response is one that has been persisted and rehydrated, so e.g. Commands that have their arguments stored in the EH are gone. */
	readonly isStale: boolean;
	readonly vote: ChatAgentVoteDirection | undefined;
	readonly voteDownReason: ChatAgentVoteDownReason | undefined;
	readonly followups?: IChatFollowup[] | undefined;
	readonly result?: IChatAgentResult;
	addUndoStop(undoStop: IChatUndoStop): void;
	setVote(vote: ChatAgentVoteDirection): void;
	setVoteDownReason(reason: ChatAgentVoteDownReason | undefined): void;
	setEditApplied(edit: IChatTextEditGroup, editCount: number): boolean;
	setPaused(isPause: boolean, tx?: ITransaction): void;
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

export class ChatRequestModel implements IChatRequestModel {

	public response: ChatResponseModel | undefined;

	public readonly id: string;

	public get session() {
		return this._session;
	}

	public shouldBeRemovedOnSend: IChatRequestDisablement | undefined;

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

	constructor(
		private _session: ChatModel,
		public readonly message: IParsedChatRequest,
		private _variableData: IChatRequestVariableData,
		public readonly timestamp: number,
		private _attempt: number = 0,
		private _confirmation?: string,
		private _locationData?: IChatLocationData,
		private _attachedContext?: IChatRequestVariableEntry[],
		public readonly isCompleteAddedRequest = false,
		restoredId?: string,
	) {
		this.id = restoredId ?? 'request_' + generateUuid();
		// this.timestamp = Date.now();
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

		for (const part of parts) {
			let segment: { text: string; isBlock?: boolean } | undefined;
			switch (part.kind) {
				case 'treeData':
				case 'progressMessage':
				case 'codeblockUri':
				case 'toolInvocation':
				case 'toolInvocationSerialized':
				case 'undoStop':
					// Ignore
					continue;
				case 'inlineReference':
					segment = { text: this.inlineRefToRepr(part) };
					break;
				case 'command':
					segment = { text: part.command.title, isBlock: true };
					break;
				case 'textEditGroup':
				case 'notebookEditGroup':
					segment = { text: localize('editsSummary', "Made changes."), isBlock: true };
					break;
				case 'confirmation':
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
		const idx = _response.value.findIndex(v => v.kind === 'undoStop' && v.id === undoStop);
		super(idx === -1 ? _response.value.slice() : _response.value.slice(0, idx));
	}
}

export class Response extends AbstractResponse implements IDisposable {
	private _onDidChangeValue = new Emitter<void>();
	public get onDidChangeValue() {
		return this._onDidChangeValue.event;
	}

	private _citations: IChatCodeCitation[] = [];


	constructor(value: IMarkdownString | ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability | IChatResponseCodeblockUriPart>) {
		super(asArray(value).map((v) => (isMarkdownString(v) ?
			{ content: v, kind: 'markdownContent' } satisfies IChatMarkdownContent :
			'kind' in v ? v : { kind: 'treeData', treeData: v })));
	}

	dispose(): void {
		this._onDidChangeValue.dispose();
	}


	clear(): void {
		this._responseParts = [];
		this._updateRepr(true);
	}

	updateContent(progress: IChatProgressResponseContent | IChatTextEdit | IChatNotebookEdit | IChatTask | IChatUndoStop, quiet?: boolean): void {
		if (progress.kind === 'markdownContent') {

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
					done: progress.done
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
			if (progress.confirmationMessages) {
				progress.confirmed.p.then(() => {
					this._updateRepr(false);
				});
			}
			progress.isCompletePromise.then(() => {
				this._updateRepr(false);
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


export class ChatResponseModel extends Disposable implements IChatResponseModel {
	private readonly _onDidChange = this._register(new Emitter<ChatResponseModelChangeReason>());
	readonly onDidChange = this._onDidChange.event;

	public readonly id: string;

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

	private _isPaused = observableValue('isPaused', false);
	public get isPaused(): IObservable<boolean> {
		return this._isPaused;
	}

	public get isPendingConfirmation() {
		return this._response.value.some(part =>
			part.kind === 'toolInvocation' && part.isConfirmed === undefined
			|| part.kind === 'confirmation' && part.isUsed === false);
	}

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

	/** Functions run once the chat response is unpaused. */
	private bufferedPauseContent?: (() => void)[];

	constructor(
		_response: IMarkdownString | ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability | IChatResponseCodeblockUriPart>,
		private _session: ChatModel,
		private _agent: IChatAgentData | undefined,
		private _slashCommand: IChatAgentCommand | undefined,
		public readonly requestId: string,
		private _isComplete: boolean = false,
		private _isCanceled = false,
		private _vote?: ChatAgentVoteDirection,
		private _voteDownReason?: ChatAgentVoteDownReason,
		private _result?: IChatAgentResult,
		followups?: ReadonlyArray<IChatFollowup>,
		public readonly isCompleteAddedRequest = false,
		private _shouldBeRemovedOnSend: IChatRequestDisablement | undefined = undefined,
		restoredId?: string
	) {
		super();

		// If we are creating a response with some existing content, consider it stale
		this._isStale = Array.isArray(_response) && (_response.length !== 0 || isMarkdownString(_response) && _response.value.length !== 0);

		this._followups = followups ? [...followups] : undefined;
		this._response = this._register(new Response(_response));
		this._register(this._response.onDidChangeValue(() => this._onDidChange.fire(defaultChatResponseModelChangeReason)));
		this.id = restoredId ?? 'response_' + generateUuid();
	}

	/**
	 * Apply a progress update to the actual response content.
	 */
	updateContent(responsePart: IChatProgressResponseContent | IChatTextEdit | IChatNotebookEdit, quiet?: boolean) {
		this.bufferWhenPaused(() => this._response.updateContent(responsePart, quiet));
	}

	/**
	 * Adds an undo stop at the current position in the stream.
	 */
	addUndoStop(undoStop: IChatUndoStop) {
		this.bufferWhenPaused(() => {
			this._onDidChange.fire({ reason: 'undoStop', id: undoStop.id });
			this._response.updateContent(undoStop, true);
		});
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

	setPaused(isPause: boolean, tx?: ITransaction): void {
		this._isPaused.set(isPause, tx);
		this._onDidChange.fire(defaultChatResponseModelChangeReason);

		this.bufferedPauseContent?.forEach(f => f());
		this.bufferedPauseContent = undefined;
	}

	finalizeUndoState(): void {
		this._finalizedResponse = this.response;
		this._responseView = undefined;
		this._shouldBeRemovedOnSend = undefined;
	}

	private bufferWhenPaused(apply: () => void) {
		if (!this._isPaused.get()) {
			apply();
		} else {
			this.bufferedPauseContent ??= [];
			this.bufferedPauseContent.push(apply);
		}
	}
}

export const enum ChatPauseState {
	NotPausable,
	Paused,
	Unpaused,
}

export interface IChatRequestDisablement {
	requestId: string;
	afterUndoStop?: string;
}

export interface IChatModel {
	readonly onDidDispose: Event<void>;
	readonly onDidChange: Event<IChatChangeEvent>;
	readonly sessionId: string;
	readonly initState: ChatModelInitState;
	readonly initialLocation: ChatAgentLocation;
	readonly title: string;
	readonly welcomeMessage: IChatWelcomeMessageContent | undefined;
	readonly sampleQuestions: IChatFollowup[] | undefined;
	readonly requestInProgress: boolean;
	readonly requestPausibility: ChatPauseState;
	readonly inputPlaceholder?: string;
	toggleLastRequestPaused(paused?: boolean): void;
	/**
	 * Sets requests as 'disabled', removing them from the UI. If a request ID
	 * is given without undo stops, it's removed entirely. If an undo stop
	 * is given, all content after that stop is removed.
	 */
	setDisabledRequests(requestIds: IChatRequestDisablement[]): void;
	getRequests(): IChatRequestModel[];
	toExport(): IExportableChatData;
	toJSON(): ISerializableChatData;
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
	response: ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability> | undefined;

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

export interface IChatInitEvent {
	kind: 'initialize';
}

export enum ChatModelInitState {
	Created,
	Initializing,
	Initialized
}

export class ChatModel extends Disposable implements IChatModel {
	static getDefaultTitle(requests: (ISerializableChatRequestData | IChatRequestModel)[]): string {
		const firstRequestMessage = requests.at(0)?.message ?? '';
		const message = typeof firstRequestMessage === 'string' ?
			firstRequestMessage :
			firstRequestMessage.text;
		return message.split('\n')[0].substring(0, 50);
	}

	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChange = this._register(new Emitter<IChatChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private _requests: ChatRequestModel[];
	private _initState: ChatModelInitState = ChatModelInitState.Created;
	private _isInitializedDeferred = new DeferredPromise<void>();

	private _welcomeMessage: IChatWelcomeMessageContent | undefined;
	get welcomeMessage(): IChatWelcomeMessageContent | undefined {
		return this._welcomeMessage;
	}

	private _sampleQuestions: IChatFollowup[] | undefined;
	get sampleQuestions(): IChatFollowup[] | undefined {
		return this._sampleQuestions;
	}

	// TODO to be clear, this is not the same as the id from the session object, which belongs to the provider.
	// It's easier to be able to identify this model before its async initialization is complete
	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	get requestInProgress(): boolean {
		const lastRequest = this.lastRequest;
		if (!lastRequest?.response) {
			return false;
		}

		if (lastRequest.response.isPendingConfirmation) {
			return false;
		}

		return !lastRequest.response.isComplete;
	}

	get requestPausibility(): ChatPauseState {
		const lastRequest = this.lastRequest;
		if (!lastRequest?.response?.agent || lastRequest.response.isComplete || lastRequest.response.isPendingConfirmation) {
			return ChatPauseState.NotPausable;
		}

		return lastRequest.response.isPaused.get() ? ChatPauseState.Paused : ChatPauseState.Unpaused;
	}

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
		return this.chatAgentService.getDefaultAgent(ChatAgentLocation.Panel);
	}

	get requesterUsername(): string {
		return this._defaultAgent?.metadata.requester?.name ??
			this.initialData?.requesterUsername ?? '';
	}

	get responderUsername(): string {
		return this._defaultAgent?.fullName ??
			this.initialData?.responderUsername ?? '';
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

	get initState(): ChatModelInitState {
		return this._initState;
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

	get initialLocation() {
		return this._initialLocation;
	}

	constructor(
		private readonly initialData: ISerializableChatData | IExportableChatData | undefined,
		private readonly _initialLocation: ChatAgentLocation,
		@ILogService private readonly logService: ILogService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
	) {
		super();

		const isValid = isSerializableSessionData(initialData);
		if (initialData && !isValid) {
			this.logService.warn(`ChatModel#constructor: Loaded malformed session data: ${JSON.stringify(initialData)}`);
		}

		this._isImported = (!!initialData && !isValid) || (initialData?.isImported ?? false);
		this._sessionId = (isValid && initialData.sessionId) || generateUuid();
		this._requests = initialData ? this._deserialize(initialData) : [];
		this._creationDate = (isValid && initialData.creationDate) || Date.now();
		this._lastMessageDate = (isValid && initialData.lastMessageDate) || this._creationDate;
		this._customTitle = isValid ? initialData.customTitle : undefined;

		this._initialRequesterAvatarIconUri = initialData?.requesterAvatarIconUri && URI.revive(initialData.requesterAvatarIconUri);
		this._initialResponderAvatarIconUri = isUriComponents(initialData?.responderAvatarIconUri) ? URI.revive(initialData.responderAvatarIconUri) : initialData?.responderAvatarIconUri;
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
				const request = new ChatRequestModel(this, parsedRequest, variableData, raw.timestamp ?? -1, undefined, undefined, undefined, undefined, undefined, raw.requestId);
				request.shouldBeRemovedOnSend = raw.isHidden ? { requestId: raw.requestId } : raw.shouldBeRemovedOnSend;
				if (raw.response || raw.result || (raw as any).responseErrorDetails) {
					const agent = (raw.agent && 'metadata' in raw.agent) ? // Check for the new format, ignore entries in the old format
						reviveSerializedAgent(raw.agent) : undefined;

					// Port entries from old format
					const result = 'responseErrorDetails' in raw ?
						// eslint-disable-next-line local/code-no-dangerous-type-assertions
						{ errorDetails: raw.responseErrorDetails } as IChatAgentResult : raw.result;
					request.response = new ChatResponseModel(raw.response ?? [new MarkdownString(raw.response)], this, agent, raw.slashCommand, request.id, true, raw.isCanceled, raw.vote, raw.voteDownReason, result, raw.followups, undefined, undefined, raw.responseId);
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

	toggleLastRequestPaused(isPaused?: boolean) {
		if (this.requestPausibility !== ChatPauseState.NotPausable && this.lastRequest?.response?.agent) {
			const pausedValue = isPaused ?? !this.lastRequest.response.isPaused.get();
			this.lastRequest.response.setPaused(pausedValue);
			this.chatAgentService.setRequestPaused(this.lastRequest.response.agent.id, this.lastRequest.id, pausedValue);
			this._onDidChange.fire({ kind: 'changedRequest', request: this.lastRequest });
		}
	}

	startInitialize(): void {
		if (this.initState !== ChatModelInitState.Created) {
			throw new Error(`ChatModel is in the wrong state for startInitialize: ${ChatModelInitState[this.initState]}`);
		}
		this._initState = ChatModelInitState.Initializing;
	}

	deinitialize(): void {
		this._initState = ChatModelInitState.Created;
		this._isInitializedDeferred = new DeferredPromise<void>();
	}

	initialize(welcomeMessage?: IChatWelcomeMessageContent, sampleQuestions?: IChatFollowup[]): void {
		if (this.initState !== ChatModelInitState.Initializing) {
			// Must call startInitialize before initialize, and only call it once
			throw new Error(`ChatModel is in the wrong state for initialize: ${ChatModelInitState[this.initState]}`);
		}

		this._initState = ChatModelInitState.Initialized;
		this._welcomeMessage = welcomeMessage;
		this._sampleQuestions = sampleQuestions;

		this._isInitializedDeferred.complete();
		this._onDidChange.fire({ kind: 'initialize' });
	}

	setInitializationError(error: Error): void {
		if (this.initState !== ChatModelInitState.Initializing) {
			throw new Error(`ChatModel is in the wrong state for setInitializationError: ${ChatModelInitState[this.initState]}`);
		}

		if (!this._isInitializedDeferred.isSettled) {
			this._isInitializedDeferred.error(error);
		}
	}

	waitForInitialization(): Promise<void> {
		return this._isInitializedDeferred.p;
	}

	getRequests(): ChatRequestModel[] {
		return this._requests;
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

	addRequest(message: IParsedChatRequest, variableData: IChatRequestVariableData, attempt: number, chatAgent?: IChatAgentData, slashCommand?: IChatAgentCommand, confirmation?: string, locationData?: IChatLocationData, attachments?: IChatRequestVariableEntry[], workingSet?: URI[], isCompleteAddedRequest?: boolean): ChatRequestModel {
		const request = new ChatRequestModel(this, message, variableData, Date.now(), attempt, confirmation, locationData, attachments, isCompleteAddedRequest);
		request.response = new ChatResponseModel([], this, chatAgent, slashCommand, request.id, undefined, undefined, undefined, undefined, undefined, undefined, isCompleteAddedRequest);

		this._requests.push(request);
		this._lastMessageDate = Date.now();
		this._onDidChange.fire({ kind: 'addRequest', request });
		return request;
	}

	setCustomTitle(title: string): void {
		this._customTitle = title;
	}

	updateRequest(request: ChatRequestModel, variableData: IChatRequestVariableData) {
		request.variableData = variableData;
		this._onDidChange.fire({ kind: 'changedRequest', request });
	}

	adoptRequest(request: ChatRequestModel): void {
		// this doesn't use `removeRequest` because it must not dispose the request object
		const oldOwner = request.session;
		const index = oldOwner._requests.findIndex(candidate => candidate.id === request.id);

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
			request.response = new ChatResponseModel([], this, undefined, undefined, request.id);
		}

		if (request.response.isComplete) {
			throw new Error('acceptResponseProgress: Adding progress to a completed response');
		}

		if (progress.kind === 'markdownContent' ||
			progress.kind === 'treeData' ||
			progress.kind === 'inlineReference' ||
			progress.kind === 'codeblockUri' ||
			progress.kind === 'markdownVuln' ||
			progress.kind === 'progressMessage' ||
			progress.kind === 'command' ||
			progress.kind === 'textEdit' ||
			progress.kind === 'notebookEdit' ||
			progress.kind === 'warning' ||
			progress.kind === 'progressTask' ||
			progress.kind === 'confirmation' ||
			progress.kind === 'toolInvocation'
		) {
			request.response.updateContent(progress, quiet);
		} else if (progress.kind === 'usedContext' || progress.kind === 'reference') {
			request.response.applyReference(progress);
		} else if (progress.kind === 'codeCitation') {
			request.response.applyCodeCitation(progress);
		} else if (progress.kind === 'move') {
			this._onDidChange.fire({ kind: 'move', target: progress.uri, range: progress.range });
		} else if (progress.kind === 'undoStop') {
			request.response.addUndoStop(progress);
		} else {
			this.logService.error(`Couldn't handle progress: ${JSON.stringify(progress)}`);
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
			request.response = new ChatResponseModel([], this, undefined, undefined, request.id);
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
					parts: r.message.parts.map(p => p && 'toJSON' in p ? (p.toJSON as Function)() : p)
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
							} else {
								return item as any; // TODO
							}
						})
						: undefined,
					responseId: r.response?.id,
					shouldBeRemovedOnSend: r.shouldBeRemovedOnSend,
					result: r.response?.result,
					followups: r.response?.followups,
					isCanceled: r.response?.isCanceled,
					vote: r.response?.vote,
					voteDownReason: r.response?.voteDownReason,
					agent: agentJson,
					slashCommand: r.response?.slashCommand,
					usedContext: r.response?.usedContext,
					contentReferences: r.response?.contentReferences,
					codeCitations: r.response?.codeCitations,
					timestamp: r.timestamp
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
