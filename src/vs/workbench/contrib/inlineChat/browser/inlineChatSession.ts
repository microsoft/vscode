/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { ResourceEdit, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { IWorkspaceTextEdit, TextEdit, WorkspaceEdit } from 'vs/editor/common/languages';
import { IIdentifiedSingleEditOperation, IModelDecorationOptions, IModelDeltaDecoration, ITextModel, IValidEditOperation, TrackedRangeStickiness } from 'vs/editor/common/model';
import { EditMode, IInlineChatSessionProvider, IInlineChatSession, IInlineChatBulkEditResponse, IInlineChatEditResponse, InlineChatResponseType, CTX_INLINE_CHAT_HAS_STASHED_SESSION } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { isCancellationError } from 'vs/base/common/errors';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { DetailedLineRangeMapping, LineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IUntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { IInlineChatSessionService, Recording } from './inlineChatSessionService';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { coalesceInPlace } from 'vs/base/common/arrays';
import { Iterable } from 'vs/base/common/iterator';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ILogService } from 'vs/platform/log/common/log';
import { ChatModel, IChatResponseModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';


export type TelemetryData = {
	extension: string;
	rounds: string;
	undos: string;
	unstashed: number;
	edits: number;
	finishedByEdit: boolean;
	startTime: string;
	endTime: string;
	editMode: string;
	acceptedHunks: number;
	discardedHunks: number;
	responseTypes: string;
};

export type TelemetryDataClassification = {
	owner: 'jrieken';
	comment: 'Data about an interaction editor session';
	extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension providing the data' };
	rounds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of request that were made' };
	undos: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Requests that have been undone' };
	edits: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Did edits happen while the session was active' };
	unstashed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How often did this session become stashed and resumed' };
	finishedByEdit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Did edits cause the session to terminate' };
	startTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the session started' };
	endTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the session ended' };
	editMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What edit mode was choosen: live, livePreview, preview' };
	acceptedHunks: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of accepted hunks' };
	discardedHunks: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of discarded hunks' };
	responseTypes: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Comma separated list of response types like edits, message, mixed' };
};


export class SessionWholeRange {

	private static readonly _options: IModelDecorationOptions = ModelDecorationOptions.register({ description: 'inlineChat/session/wholeRange' });

	private readonly _onDidChange = new Emitter<this>();
	readonly onDidChange: Event<this> = this._onDidChange.event;

	private _decorationIds: string[] = [];

	constructor(private readonly _textModel: ITextModel, wholeRange: IRange) {
		this._decorationIds = _textModel.deltaDecorations([], [{ range: wholeRange, options: SessionWholeRange._options }]);
	}

	dispose() {
		this._onDidChange.dispose();
		if (!this._textModel.isDisposed()) {
			this._textModel.deltaDecorations(this._decorationIds, []);
		}
	}

	trackEdits(edits: ISingleEditOperation[]): void {
		const newDeco: IModelDeltaDecoration[] = [];
		for (const edit of edits) {
			newDeco.push({ range: edit.range, options: SessionWholeRange._options });
		}
		this._decorationIds.push(...this._textModel.deltaDecorations([], newDeco));
		this._onDidChange.fire(this);
	}

	fixup(changes: readonly DetailedLineRangeMapping[]): void {

		const newDeco: IModelDeltaDecoration[] = [];
		for (const { modified } of changes) {
			const modifiedRange = modified.isEmpty
				? new Range(modified.startLineNumber, 1, modified.startLineNumber, this._textModel.getLineLength(modified.startLineNumber))
				: new Range(modified.startLineNumber, 1, modified.endLineNumberExclusive - 1, this._textModel.getLineLength(modified.endLineNumberExclusive - 1));

			newDeco.push({ range: modifiedRange, options: SessionWholeRange._options });
		}
		const [first, ...rest] = this._decorationIds; // first is the original whole range
		const newIds = this._textModel.deltaDecorations(rest, newDeco);
		this._decorationIds = [first].concat(newIds);
		this._onDidChange.fire(this);
	}

	get trackedInitialRange(): Range {
		const [first] = this._decorationIds;
		return this._textModel.getDecorationRange(first) ?? new Range(1, 1, 1, 1);
	}

	get value(): Range {
		let result: Range | undefined;
		for (const id of this._decorationIds) {
			const range = this._textModel.getDecorationRange(id);
			if (range) {
				if (!result) {
					result = range;
				} else {
					result = Range.plusRange(result, range);
				}
			}
		}
		return result!;
	}
}

export class Session {

	private _lastInput: SessionPrompt | undefined;
	private _isUnstashed: boolean = false;
	private readonly _exchange: SessionExchange[] = [];
	private readonly _startTime = new Date();
	private readonly _teldata: TelemetryData;

	readonly textModelNAltVersion: number;
	private _textModelNSnapshotAltVersion: number | undefined;

	constructor(
		readonly editMode: EditMode,
		/**
		 * The URI of the document which is being EditorEdit
		 */
		readonly targetUri: URI,
		/**
		 * A copy of the document at the time the session was started
		 */
		readonly textModel0: ITextModel,
		/**
		 * The document into which AI edits went, when live this is `targetUri` otherwise it is a temporary document
		 */
		readonly textModelN: ITextModel,
		readonly provider: IInlineChatSessionProvider,
		readonly session: IInlineChatSession,
		readonly wholeRange: SessionWholeRange,
		readonly hunkData: HunkData,
		readonly chatModel: ChatModel,
	) {
		this.textModelNAltVersion = textModelN.getAlternativeVersionId();
		this._teldata = {
			extension: ExtensionIdentifier.toKey(provider.extensionId),
			startTime: this._startTime.toISOString(),
			endTime: this._startTime.toISOString(),
			edits: 0,
			finishedByEdit: false,
			rounds: '',
			undos: '',
			editMode,
			unstashed: 0,
			acceptedHunks: 0,
			discardedHunks: 0,
			responseTypes: ''
		};
	}

	addInput(input: SessionPrompt): void {
		this._lastInput = input;
	}

	get lastInput() {
		return this._lastInput;
	}

	get isUnstashed(): boolean {
		return this._isUnstashed;
	}

	markUnstashed() {
		this._teldata.unstashed! += 1;
		this._isUnstashed = true;
	}

	get textModelNSnapshotAltVersion(): number | undefined {
		return this._textModelNSnapshotAltVersion;
	}

	createSnapshot(): void {
		this._textModelNSnapshotAltVersion = this.textModelN.getAlternativeVersionId();
	}

	addExchange(exchange: SessionExchange): void {
		this._isUnstashed = false;
		const newLen = this._exchange.push(exchange);
		this._teldata.rounds += `${newLen}|`;
		// this._teldata.responseTypes += `${exchange.response instanceof ReplyResponse ? exchange.response.responseType : InlineChatResponseTypes.Empty}|`;
	}

	get lastExchange(): SessionExchange | undefined {
		return this._exchange[this._exchange.length - 1];
	}

	get hasChangedText(): boolean {
		return !this.textModel0.equalsTextBuffer(this.textModelN.getTextBuffer());
	}

	asChangedText(changes: readonly LineRangeMapping[]): string | undefined {
		if (changes.length === 0) {
			return undefined;
		}

		let startLine = Number.MAX_VALUE;
		let endLine = Number.MIN_VALUE;
		for (const change of changes) {
			startLine = Math.min(startLine, change.modified.startLineNumber);
			endLine = Math.max(endLine, change.modified.endLineNumberExclusive);
		}

		return this.textModelN.getValueInRange(new Range(startLine, 1, endLine, Number.MAX_VALUE));
	}

	recordExternalEditOccurred(didFinish: boolean) {
		this._teldata.edits += 1;
		this._teldata.finishedByEdit = didFinish;
	}

	asTelemetryData(): TelemetryData {

		for (const item of this.hunkData.getInfo()) {
			switch (item.getState()) {
				case HunkState.Accepted:
					this._teldata.acceptedHunks += 1;
					break;
				case HunkState.Rejected:
					this._teldata.discardedHunks += 1;
					break;
			}
		}

		this._teldata.endTime = new Date().toISOString();
		return this._teldata;
	}

	asRecording(): Recording {
		const result: Recording = {
			session: this.session,
			when: this._startTime,
			exchanges: []
		};
		for (const exchange of this._exchange) {
			const response = exchange.response;
			if (response instanceof ReplyResponse) {
				result.exchanges.push({ prompt: exchange.prompt.value, res: response.raw });
			}
		}
		return result;
	}
}


export class SessionPrompt {

	constructor(
		readonly value: string,
	) { }
}

export class SessionExchange {

	constructor(
		readonly prompt: SessionPrompt,
		readonly response: ReplyResponse | EmptyResponse | ErrorResponse
	) { }
}

export class EmptyResponse {

}

export class ErrorResponse {

	readonly message: string;
	readonly isCancellation: boolean;

	constructor(
		readonly error: any
	) {
		this.message = toErrorMessage(error, false);
		this.isCancellation = isCancellationError(error);
	}
}

export class ReplyResponse {

	readonly allLocalEdits: TextEdit[][] = [];
	readonly untitledTextModel: IUntitledTextEditorModel | undefined;
	readonly workspaceEdit: WorkspaceEdit | undefined;


	constructor(
		readonly raw: IInlineChatBulkEditResponse | IInlineChatEditResponse,
		readonly mdContent: IMarkdownString,
		localUri: URI,
		readonly modelAltVersionId: number,
		progressEdits: TextEdit[][],
		readonly requestId: string,
		readonly chatResponse: IChatResponseModel | undefined,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {

		const editsMap = new ResourceMap<TextEdit[][]>();

		editsMap.set(localUri, [...progressEdits]);

		if (raw.type === InlineChatResponseType.EditorEdit) {
			//
			editsMap.get(localUri)!.push(raw.edits);

		} else if (raw.type === InlineChatResponseType.BulkEdit) {
			//
			const edits = ResourceEdit.convert(raw.edits);

			for (const edit of edits) {
				if (edit instanceof ResourceFileEdit) {
					if (edit.newResource && !edit.oldResource) {
						editsMap.set(edit.newResource, []);
						if (edit.options.contents) {
							console.warn('CONTENT not supported');
						}
					}
				} else if (edit instanceof ResourceTextEdit) {
					//
					const array = editsMap.get(edit.resource);
					if (array) {
						array.push([edit.textEdit]);
					} else {
						editsMap.set(edit.resource, [[edit.textEdit]]);
					}
				}
			}
		}

		let needsWorkspaceEdit = false;

		for (const [uri, edits] of editsMap) {

			const flatEdits = edits.flat();
			if (flatEdits.length === 0) {
				editsMap.delete(uri);
				continue;
			}

			const isLocalUri = isEqual(uri, localUri);
			needsWorkspaceEdit = needsWorkspaceEdit || (uri.scheme !== Schemas.untitled && !isLocalUri);

			if (uri.scheme === Schemas.untitled && !isLocalUri && !this.untitledTextModel) { //TODO@jrieken the first untitled model WINS
				const langSelection = this._languageService.createByFilepathOrFirstLine(uri, undefined);
				const untitledTextModel = this._textFileService.untitled.create({
					associatedResource: uri,
					languageId: langSelection.languageId
				});
				this.untitledTextModel = untitledTextModel;
				untitledTextModel.resolve();
			}
		}

		this.allLocalEdits = editsMap.get(localUri) ?? [];

		if (needsWorkspaceEdit) {
			const workspaceEdits: IWorkspaceTextEdit[] = [];
			for (const [uri, edits] of editsMap) {
				for (const edit of edits.flat()) {
					workspaceEdits.push({ resource: uri, textEdit: edit, versionId: undefined });
				}
			}
			this.workspaceEdit = { edits: workspaceEdits };
		}
	}
}

export class StashedSession {

	private readonly _listener: IDisposable;
	private readonly _ctxHasStashedSession: IContextKey<boolean>;
	private _session: Session | undefined;

	constructor(
		editor: ICodeEditor,
		session: Session,
		private readonly _undoCancelEdits: IValidEditOperation[],
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInlineChatSessionService private readonly _sessionService: IInlineChatSessionService,
		@ILogService private readonly _logService: ILogService
	) {
		this._ctxHasStashedSession = CTX_INLINE_CHAT_HAS_STASHED_SESSION.bindTo(contextKeyService);

		// keep session for a little bit, only release when user continues to work (type, move cursor, etc.)
		this._session = session;
		this._ctxHasStashedSession.set(true);
		this._listener = Event.once(Event.any(editor.onDidChangeCursorSelection, editor.onDidChangeModelContent, editor.onDidChangeModel))(() => {
			this._session = undefined;
			this._sessionService.releaseSession(session);
			this._ctxHasStashedSession.reset();
		});
	}

	dispose() {
		this._listener.dispose();
		this._ctxHasStashedSession.reset();
		if (this._session) {
			this._sessionService.releaseSession(this._session);
		}
	}

	unstash(): Session | undefined {
		if (!this._session) {
			return undefined;
		}
		this._listener.dispose();
		const result = this._session;
		result.markUnstashed();
		result.hunkData.ignoreTextModelNChanges = true;
		result.textModelN.pushEditOperations(null, this._undoCancelEdits, () => null);
		result.hunkData.ignoreTextModelNChanges = false;
		this._session = undefined;
		this._logService.debug('[IE] Unstashed session');
		return result;
	}
}

// ---

function lineRangeAsRange(lineRange: LineRange, model: ITextModel): Range {
	return lineRange.isEmpty
		? new Range(lineRange.startLineNumber, 1, lineRange.startLineNumber, model.getLineLength(lineRange.startLineNumber))
		: new Range(lineRange.startLineNumber, 1, lineRange.endLineNumberExclusive - 1, model.getLineLength(lineRange.endLineNumberExclusive - 1));
}

export class HunkData {

	private static readonly _HUNK_TRACKED_RANGE = ModelDecorationOptions.register({
		description: 'inline-chat-hunk-tracked-range',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
	});

	private static readonly _HUNK_THRESHOLD = 8;

	private readonly _store = new DisposableStore();
	private readonly _data = new Map<RawHunk, { textModelNDecorations: string[]; textModel0Decorations: string[]; state: HunkState }>();
	private _ignoreChanges: boolean = false;

	constructor(
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		private readonly _textModel0: ITextModel,
		private readonly _textModelN: ITextModel,
	) {

		this._store.add(_textModelN.onDidChangeContent(e => {
			if (!this._ignoreChanges) {
				this._mirrorChanges(e);
			}
		}));
	}

	dispose(): void {
		if (!this._textModelN.isDisposed()) {
			this._textModelN.changeDecorations(accessor => {
				for (const { textModelNDecorations } of this._data.values()) {
					textModelNDecorations.forEach(accessor.removeDecoration, accessor);
				}
			});
		}
		if (!this._textModel0.isDisposed()) {
			this._textModel0.changeDecorations(accessor => {
				for (const { textModel0Decorations } of this._data.values()) {
					textModel0Decorations.forEach(accessor.removeDecoration, accessor);
				}
			});
		}
		this._data.clear();
		this._store.dispose();
	}

	set ignoreTextModelNChanges(value: boolean) {
		this._ignoreChanges = value;
	}

	get ignoreTextModelNChanges(): boolean {
		return this._ignoreChanges;
	}

	private _mirrorChanges(event: IModelContentChangedEvent) {

		// mirror textModelN changes to textModel0 execept for those that
		// overlap with a hunk

		type HunkRangePair = { rangeN: Range; range0: Range };
		const hunkRanges: HunkRangePair[] = [];

		const ranges0: Range[] = [];

		for (const { textModelNDecorations, textModel0Decorations, state } of this._data.values()) {

			if (state === HunkState.Pending) {
				// pending means the hunk's changes aren't "sync'd" yet
				for (let i = 1; i < textModelNDecorations.length; i++) {
					const rangeN = this._textModelN.getDecorationRange(textModelNDecorations[i]);
					const range0 = this._textModel0.getDecorationRange(textModel0Decorations[i]);
					if (rangeN && range0) {
						hunkRanges.push({ rangeN, range0 });
					}
				}

			} else if (state === HunkState.Accepted) {
				// accepted means the hunk's changes are also in textModel0
				for (let i = 1; i < textModel0Decorations.length; i++) {
					const range = this._textModel0.getDecorationRange(textModel0Decorations[i]);
					if (range) {
						ranges0.push(range);
					}
				}
			}
		}

		hunkRanges.sort((a, b) => Range.compareRangesUsingStarts(a.rangeN, b.rangeN));
		ranges0.sort(Range.compareRangesUsingStarts);

		const edits: IIdentifiedSingleEditOperation[] = [];

		for (const change of event.changes) {

			let isOverlapping = false;

			let pendingChangesLen = 0;

			for (const { rangeN, range0 } of hunkRanges) {
				if (rangeN.getEndPosition().isBefore(Range.getStartPosition(change.range))) {
					// pending hunk _before_ this change. When projecting into textModel0 we need to
					// subtract that. Because diffing is relaxed it might include changes that are not
					// actual insertions/deletions. Therefore we need to take the length of the original
					// range into account.
					pendingChangesLen += this._textModelN.getValueLengthInRange(rangeN);
					pendingChangesLen -= this._textModel0.getValueLengthInRange(range0);

				} else if (Range.areIntersectingOrTouching(rangeN, change.range)) {
					isOverlapping = true;
					break;

				} else {
					// hunks past this change aren't relevant
					break;
				}
			}

			if (isOverlapping) {
				// hunk overlaps, it grew
				continue;
			}

			const offset0 = change.rangeOffset - pendingChangesLen;
			const start0 = this._textModel0.getPositionAt(offset0);

			let acceptedChangesLen = 0;
			for (const range of ranges0) {
				if (range.getEndPosition().isBefore(start0)) {
					// accepted hunk _before_ this projected change. When projecting into textModel0
					// we need to add that
					acceptedChangesLen += this._textModel0.getValueLengthInRange(range);
				}
			}

			const start = this._textModel0.getPositionAt(offset0 + acceptedChangesLen);
			const end = this._textModel0.getPositionAt(offset0 + acceptedChangesLen + change.rangeLength);
			edits.push(EditOperation.replace(Range.fromPositions(start, end), change.text));
		}

		this._textModel0.pushEditOperations(null, edits, () => null);
	}

	async recompute() {

		const diff = await this._editorWorkerService.computeDiff(this._textModel0.uri, this._textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, computeMoves: false }, 'advanced');

		if (!diff || diff.changes.length === 0) {
			// return new HunkData([], session);
			return;
		}

		// merge changes neighboring changes
		const mergedChanges = [diff.changes[0]];
		for (let i = 1; i < diff.changes.length; i++) {
			const lastChange = mergedChanges[mergedChanges.length - 1];
			const thisChange = diff.changes[i];
			if (thisChange.modified.startLineNumber - lastChange.modified.endLineNumberExclusive <= HunkData._HUNK_THRESHOLD) {
				mergedChanges[mergedChanges.length - 1] = new DetailedLineRangeMapping(
					lastChange.original.join(thisChange.original),
					lastChange.modified.join(thisChange.modified),
					(lastChange.innerChanges ?? []).concat(thisChange.innerChanges ?? [])
				);
			} else {
				mergedChanges.push(thisChange);
			}
		}

		const hunks = mergedChanges.map(change => new RawHunk(change.original, change.modified, change.innerChanges ?? []));

		this._textModelN.changeDecorations(accessorN => {

			this._textModel0.changeDecorations(accessor0 => {

				// clean up old decorations
				for (const { textModelNDecorations, textModel0Decorations } of this._data.values()) {
					textModelNDecorations.forEach(accessorN.removeDecoration, accessorN);
					textModel0Decorations.forEach(accessor0.removeDecoration, accessor0);
				}

				this._data.clear();

				// add new decorations
				for (const hunk of hunks) {

					const textModelNDecorations: string[] = [];
					const textModel0Decorations: string[] = [];

					textModelNDecorations.push(accessorN.addDecoration(lineRangeAsRange(hunk.modified, this._textModelN), HunkData._HUNK_TRACKED_RANGE));
					textModel0Decorations.push(accessor0.addDecoration(lineRangeAsRange(hunk.original, this._textModel0), HunkData._HUNK_TRACKED_RANGE));

					for (const change of hunk.changes) {
						textModelNDecorations.push(accessorN.addDecoration(change.modifiedRange, HunkData._HUNK_TRACKED_RANGE));
						textModel0Decorations.push(accessor0.addDecoration(change.originalRange, HunkData._HUNK_TRACKED_RANGE));
					}

					this._data.set(hunk, {
						textModelNDecorations,
						textModel0Decorations,
						state: HunkState.Pending
					});
				}
			});
		});
	}

	get size(): number {
		return this._data.size;
	}

	get pending(): number {
		return Iterable.reduce(this._data.values(), (r, { state }) => r + (state === HunkState.Pending ? 1 : 0), 0);
	}

	private _discardEdits(item: HunkInformation): ISingleEditOperation[] {
		const edits: ISingleEditOperation[] = [];
		const rangesN = item.getRangesN();
		const ranges0 = item.getRanges0();
		for (let i = 1; i < rangesN.length; i++) {
			const modifiedRange = rangesN[i];

			const originalValue = this._textModel0.getValueInRange(ranges0[i]);
			edits.push(EditOperation.replace(modifiedRange, originalValue));
		}
		return edits;
	}

	discardAll() {
		const edits: ISingleEditOperation[][] = [];
		for (const item of this.getInfo()) {
			if (item.getState() !== HunkState.Rejected) {
				edits.push(this._discardEdits(item));
			}
		}
		const undoEdits: IValidEditOperation[][] = [];
		this._textModelN.pushEditOperations(null, edits.flat(), (_undoEdits) => {
			undoEdits.push(_undoEdits);
			return null;
		});
		return undoEdits.flat();
	}

	getInfo(): HunkInformation[] {

		const result: HunkInformation[] = [];

		for (const [hunk, data] of this._data.entries()) {
			const item: HunkInformation = {
				getState: () => {
					return data.state;
				},
				isInsertion: () => {
					return hunk.original.isEmpty;
				},
				getRangesN: () => {
					const ranges = data.textModelNDecorations.map(id => this._textModelN.getDecorationRange(id));
					coalesceInPlace(ranges);
					return ranges;
				},
				getRanges0: () => {
					const ranges = data.textModel0Decorations.map(id => this._textModel0.getDecorationRange(id));
					coalesceInPlace(ranges);
					return ranges;
				},
				discardChanges: () => {
					// DISCARD: replace modified range with original value. The modified range is retrieved from a decoration
					// which was created above so that typing in the editor keeps discard working.
					if (data.state === HunkState.Pending) {
						const edits = this._discardEdits(item);
						this._textModelN.pushEditOperations(null, edits, () => null);
						data.state = HunkState.Rejected;
					}
				},
				acceptChanges: () => {
					// ACCEPT: replace original range with modified value. The modified value is retrieved from the model via
					// its decoration and the original range is retrieved from the hunk.
					if (data.state === HunkState.Pending) {
						const edits: ISingleEditOperation[] = [];
						const rangesN = item.getRangesN();
						const ranges0 = item.getRanges0();
						for (let i = 1; i < ranges0.length; i++) {
							const originalRange = ranges0[i];
							const modifiedValue = this._textModelN.getValueInRange(rangesN[i]);
							edits.push(EditOperation.replace(originalRange, modifiedValue));
						}
						this._textModel0.pushEditOperations(null, edits, () => null);
						data.state = HunkState.Accepted;
					}
				}
			};
			result.push(item);
		}

		return result;
	}
}

class RawHunk {
	constructor(
		readonly original: LineRange,
		readonly modified: LineRange,
		readonly changes: RangeMapping[]
	) { }
}

export const enum HunkState {
	Pending = 0,
	Accepted = 1,
	Rejected = 2
}

export interface HunkInformation {
	/**
	 * The first element [0] is the whole modified range and subsequent elements are word-level changes
	 */
	getRangesN(): Range[];

	getRanges0(): Range[];

	isInsertion(): boolean;

	discardChanges(): void;

	/**
	 * Accept the hunk. Applies the corresponding edits into textModel0
	 */
	acceptChanges(): void;

	getState(): HunkState;
}
