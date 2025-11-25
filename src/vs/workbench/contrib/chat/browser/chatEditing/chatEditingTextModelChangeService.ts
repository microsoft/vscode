/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getWindow } from '../../../../../base/browser/dom.js';
import { assert } from '../../../../../base/common/assert.js';
import { DeferredPromise, RunOnceScheduler, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditOperation, ISingleEditOperation } from '../../../../../editor/common/core/editOperation.js';
import { AnnotatedStringEdit, AnnotatedStringReplacement, StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit, VersionedExtensionId } from '../../../../../editor/common/languages.js';
import { IModelDeltaDecoration, ITextModel, ITextSnapshot, MinimapPosition, OverviewRulerLane } from '../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { offsetEditFromContentChanges, offsetEditFromLineRangeMapping, offsetEditToEditOperations } from '../../../../../editor/common/model/textModelStringEdit.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { EditSources, TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { editorSelectionBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { IAttributedRangeDTO, IModifiedEntryTelemetryInfo, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { AgentAttribution, AttributedEdits, AttributedRange, AttributedStringEdit, CombinedAttribution, getAttributedRanges, UserEditAttribution } from './chatEditingAttribution.js';
import { IDocumentDiff2 } from './chatEditingCodeEditorIntegration.js';
import { pendingRewriteMinimap } from './chatEditingModifiedFileEntry.js';

type affectedLines = { linesAdded: number; linesRemoved: number; lineCount: number; hasRemainingEdits: boolean };
type acceptedOrRejectedLines = affectedLines & { state: 'accepted' | 'rejected' };

export class SourceAnnotatedDetailedLineRangeMapping extends DetailedLineRangeMapping {
	constructor(
		inner: DetailedLineRangeMapping,
		/**
		 * The primary telemetry info for this hunk (typically the first agent that touched it).
		 */
		public readonly chatTelemetryInfo: IModifiedEntryTelemetryInfo | undefined,
		/**
		 * Fine-grained attribution for sub-regions within this hunk.
		 * Each entry represents a portion of the modified range that was edited by a specific agent.
		 */
		public readonly attributedRanges: readonly AttributedRange[] = []
	) {
		super(inner.original, inner.modified, inner.innerChanges);
	}
}

export interface ChatEditingDocumentDiff extends Omit<IDocumentDiff2, 'changes'> {
	readonly changes: readonly SourceAnnotatedDetailedLineRangeMapping[];
}

export class ChatEditingTextModelChangeService extends Disposable {

	private static readonly _lastEditDecorationOptions = ModelDecorationOptions.register({
		isWholeLine: true,
		description: 'chat-last-edit',
		className: 'chat-editing-last-edit-line',
		marginClassName: 'chat-editing-last-edit',
		overviewRuler: {
			position: OverviewRulerLane.Full,
			color: themeColorFromId(editorSelectionBackground)
		},
	});

	private static readonly _pendingEditDecorationOptions = ModelDecorationOptions.register({
		isWholeLine: true,
		description: 'chat-pending-edit',
		className: 'chat-editing-pending-edit',
		minimap: {
			position: MinimapPosition.Inline,
			color: themeColorFromId(pendingRewriteMinimap)
		}
	});

	private static readonly _atomicEditDecorationOptions = ModelDecorationOptions.register({
		isWholeLine: true,
		description: 'chat-atomic-edit',
		className: 'chat-editing-atomic-edit',
		minimap: {
			position: MinimapPosition.Inline,
			color: themeColorFromId(pendingRewriteMinimap)
		}
	});

	private _isEditFromUs: boolean = false;
	public get isEditFromUs() {
		return this._isEditFromUs;
	}
	private _allEditsAreFromUs: boolean = true;
	public get allEditsAreFromUs() {
		return this._allEditsAreFromUs;
	}
	private _isExternalEditInProgress: (() => boolean) | undefined;

	/**
	 * Current editing context - tracks which session/request is making edits.
	 * This is set before agent edits begin and cleared after they complete.
	 */
	private _currentEditContext: {
		attribution: AgentAttribution;
	} | undefined;

	/**
	 * Observable of the most recent request ID that modified this document.
	 */
	private readonly _lastModifyingRequestIdObs = observableValue<string>(this, '');
	public readonly lastModifyingRequestId: IObservable<string> = this._lastModifyingRequestIdObs;
	private _diffOperation: Promise<IDocumentDiff | undefined> | undefined;
	private _diffOperationIds: number = 0;

	private readonly _diffInfo = observableValue<IDocumentDiff & { changes: readonly SourceAnnotatedDetailedLineRangeMapping[] }>(this, nullDocumentDiff);

	public get diffInfo() {
		return this._diffInfo.map((value): ChatEditingDocumentDiff => {
			return {
				...value,
				originalModel: this.originalModel,
				modifiedModel: this.modifiedModel,
				keep: changes => this._keepHunk(changes),
				undo: changes => this._undoHunk(changes)
			};
		});
	}

	private readonly _editDecorationClear = this._register(new RunOnceScheduler(() => { this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []); }, 500));
	private _editDecorations: string[] = [];

	private readonly _didAcceptOrRejectAllHunks = this._register(new Emitter<ModifiedFileEntryState.Accepted | ModifiedFileEntryState.Rejected>());
	public readonly onDidAcceptOrRejectAllHunks = this._didAcceptOrRejectAllHunks.event;

	private readonly _didAcceptOrRejectLines = this._register(new Emitter<acceptedOrRejectedLines>());
	public readonly onDidAcceptOrRejectLines = this._didAcceptOrRejectLines.event;

	private notifyHunkAction(state: 'accepted' | 'rejected', affectedLines: affectedLines) {
		if (affectedLines.lineCount > 0) {
			this._didAcceptOrRejectLines.fire({ state, ...affectedLines });
		}
	}

	private _didUserEditModelFired = false;
	private readonly _didUserEditModel = this._register(new Emitter<void>());
	public readonly onDidUserEditModel = this._didUserEditModel.event;

	/**
	 * Tracks the cumulative edit from original document to modified document,
	 * with attribution data for each edit region.
	 * This allows us to know which agent made which edits.
	 */
	private _originalToModifiedEdit: AttributedStringEdit = AttributedEdits.empty;

	private lineChangeCount: number = 0;
	private linesAdded: number = 0;
	private linesRemoved: number = 0;

	constructor(
		private readonly originalModel: ITextModel,
		private readonly modifiedModel: ITextModel,
		private readonly state: IObservable<ModifiedFileEntryState>,
		isExternalEditInProgress: (() => boolean) | undefined,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
	) {
		super();
		this._isExternalEditInProgress = isExternalEditInProgress;
		this._register(this.modifiedModel.onDidChangeContent(e => {
			this._mirrorEdits(e);
		}));

		this._register(toDisposable(() => {
			this.clearCurrentEditLineDecoration();
		}));

		this._register(autorun(r => this.updateLineChangeCount(this._diffInfo.read(r))));

		if (!originalModel.equalsTextBuffer(modifiedModel.getTextBuffer())) {
			this._updateDiffInfoSeq();
		}
	}

	private updateLineChangeCount(diff: IDocumentDiff) {
		this.lineChangeCount = 0;
		this.linesAdded = 0;
		this.linesRemoved = 0;

		for (const change of diff.changes) {
			const modifiedRange = change.modified.endLineNumberExclusive - change.modified.startLineNumber;
			this.linesAdded += Math.max(0, modifiedRange);
			const originalRange = change.original.endLineNumberExclusive - change.original.startLineNumber;
			this.linesRemoved += Math.max(0, originalRange);

			this.lineChangeCount += Math.max(modifiedRange, originalRange);
		}
	}

	public clearCurrentEditLineDecoration() {
		if (!this.modifiedModel.isDisposed()) {
			this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []);
		}
	}

	/**
	 * Gets the attributed ranges for all tracked edits.
	 * This returns information about which agents edited which regions.
	 */
	public getAttributedRanges(): readonly AttributedRange[] {
		return getAttributedRanges(this._originalToModifiedEdit);
	}

	/**
	 * Gets the attributed ranges as DTOs for serialization.
	 */
	public getAttributedRangesDTO(): IAttributedRangeDTO[] {
		const ranges = this.getAttributedRanges();
		return ranges.map(({ range, attribution }): IAttributedRangeDTO => {
			const agentAttribution = attribution.agentAttribution;
			return {
				start: range.start,
				end: range.endExclusive,
				telemetryInfo: agentAttribution?.telemetryInfo ?? {
					agentId: undefined,
					command: undefined,
					sessionResource: this.modifiedModel.uri,
					requestId: '',
					result: undefined,
					modelId: undefined,
					modeId: undefined,
					applyCodeBlockSuggestionId: undefined,
					feature: undefined
				},
				requestId: agentAttribution?.requestId ?? '',
				undoStopId: agentAttribution?.undoStopId,
				isUserEdit: attribution.isUserEdit
			};
		});
	}

	/**
	 * Gets unique agent attributions from all tracked edits.
	 */
	public getUniqueAgentAttributions(): AgentAttribution[] {
		const seen = new Set<string>();
		const result: AgentAttribution[] = [];
		for (const r of this._originalToModifiedEdit.replacements) {
			const agent = r.data.agentAttribution;
			if (agent) {
				const key = agent.toKey();
				if (!seen.has(key)) {
					seen.add(key);
					result.push(agent);
				}
			}
		}
		return result;
	}

	/**
	 * Sets the current editing context for tracking edits.
	 * All edits made while this context is active will be attributed to the given agent.
	 */
	public setEditContext(telemetryInfo: IModifiedEntryTelemetryInfo, requestId: string, undoStopId: string | undefined): void {
		this._currentEditContext = {
			attribution: new AgentAttribution(telemetryInfo, requestId, undoStopId)
		};
	}

	/**
	 * Clears the current editing context.
	 */
	public async clearEditContext(): Promise<void> {
		if (this._currentEditContext) {
			await this._diffOperation; // ensure diff finishes
			this._lastModifyingRequestIdObs.set(this._currentEditContext.attribution.requestId, undefined);
		}
		this._currentEditContext = undefined;
	}

	/**
	 * Gets the primary attribution for a diff hunk by finding the first agent attribution
	 * that overlaps with the hunk's modified range.
	 */
	private _getHunkAttribution(change: DetailedLineRangeMapping): IModifiedEntryTelemetryInfo | undefined {
		// Convert line range to offset range
		const modifiedStartOffset = this.modifiedModel.getOffsetAt({
			lineNumber: change.modified.startLineNumber,
			column: 1
		});
		const modifiedEndOffset = change.modified.isEmpty
			? modifiedStartOffset
			: this.modifiedModel.getOffsetAt({
				lineNumber: change.modified.endLineNumberExclusive - 1,
				column: this.modifiedModel.getLineMaxColumn(change.modified.endLineNumberExclusive - 1)
			});
		const hunkRange = new OffsetRange(modifiedStartOffset, modifiedEndOffset);

		// Find the first agent attribution that overlaps with this hunk
		const attributedRanges = getAttributedRanges(this._originalToModifiedEdit);
		for (const { range, attribution } of attributedRanges) {
			if (range.intersects(hunkRange) && attribution.isAgentEdit) {
				return attribution.agentAttribution?.telemetryInfo;
			}
		}
		return undefined;
	}

	/**
	 * Gets all attributed ranges that overlap with a diff hunk's modified range.
	 */
	private _getHunkAttributedRanges(change: DetailedLineRangeMapping): AttributedRange[] {
		// Convert line range to offset range
		const modifiedStartOffset = this.modifiedModel.getOffsetAt({
			lineNumber: change.modified.startLineNumber,
			column: 1
		});
		const modifiedEndOffset = change.modified.isEmpty
			? modifiedStartOffset
			: this.modifiedModel.getOffsetAt({
				lineNumber: change.modified.endLineNumberExclusive - 1,
				column: this.modifiedModel.getLineMaxColumn(change.modified.endLineNumberExclusive - 1)
			});
		const hunkRange = new OffsetRange(modifiedStartOffset, modifiedEndOffset);

		// Find all attributed ranges that overlap with this hunk
		const attributedRanges = getAttributedRanges(this._originalToModifiedEdit);
		return attributedRanges.filter(({ range }) => range.intersects(hunkRange));
	}

	public async areOriginalAndModifiedIdentical(): Promise<boolean> {
		const diff = await this._diffOperation;
		return diff ? diff.identical : false;
	}

	async acceptAgentEdits(resource: URI, textEdits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel | undefined): Promise<{ rewriteRatio: number; maxLineNumber: number }> {

		assertType(textEdits.every(TextEdit.isTextEdit), 'INVALID args, can only handle text edits');
		assert(isEqual(resource, this.modifiedModel.uri), ' INVALID args, can only edit THIS document');

		const isAtomicEdits = textEdits.length > 0 && isLastEdits;
		let maxLineNumber = 0;
		let rewriteRatio = 0;

		const source = this._createEditSource(responseModel);

		if (isAtomicEdits) {
			// EDIT and DONE
			const minimalEdits = await this._editorWorkerService.computeMoreMinimalEdits(this.modifiedModel.uri, textEdits) ?? textEdits;
			const ops = minimalEdits.map(TextEdit.asEditOperation);
			const undoEdits = this._applyEdits(ops, source);

			if (undoEdits.length > 0) {
				let range: Range | undefined;
				for (let i = 0; i < undoEdits.length; i++) {
					const op = undoEdits[i];
					if (!range) {
						range = Range.lift(op.range);
					} else {
						range = Range.plusRange(range, op.range);
					}
				}
				if (range) {

					const defer = new DeferredPromise<void>();
					const listener = addDisposableListener(getWindow(undefined), 'animationend', e => {
						if (e.animationName === 'kf-chat-editing-atomic-edit') { // CHECK with chat.css
							defer.complete();
							listener.dispose();
						}
					});

					this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, [{
						options: ChatEditingTextModelChangeService._atomicEditDecorationOptions,
						range
					}]);

					await Promise.any([defer.p, timeout(500)]); // wait for animation to finish but also time-cap it
					listener.dispose();
				}
			}


		} else {
			// EDIT a bit, then DONE
			const ops = textEdits.map(TextEdit.asEditOperation);
			const undoEdits = this._applyEdits(ops, source);
			maxLineNumber = undoEdits.reduce((max, op) => Math.max(max, op.range.startLineNumber), 0);
			rewriteRatio = Math.min(1, maxLineNumber / this.modifiedModel.getLineCount());

			const newDecorations: IModelDeltaDecoration[] = [
				// decorate pending edit (region)
				{
					options: ChatEditingTextModelChangeService._pendingEditDecorationOptions,
					range: new Range(maxLineNumber + 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
				}
			];

			if (maxLineNumber > 0) {
				// decorate last edit
				newDecorations.push({
					options: ChatEditingTextModelChangeService._lastEditDecorationOptions,
					range: new Range(maxLineNumber, 1, maxLineNumber, Number.MAX_SAFE_INTEGER)
				});
			}
			this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, newDecorations);

		}

		if (isLastEdits) {
			this._updateDiffInfoSeq();
			this._editDecorationClear.schedule();
		}

		return { rewriteRatio, maxLineNumber };
	}

	private _createEditSource(responseModel: IChatResponseModel | undefined) {

		if (!responseModel) {
			return EditSources.unknown({ name: 'editSessionUndoRedo' });
		}

		const sessionId = responseModel.session.sessionId;
		const request = responseModel.session.getRequests().at(-1);
		const languageId = this.modifiedModel.getLanguageId();
		const agent = responseModel.agent;
		const extensionId = VersionedExtensionId.tryCreate(agent?.extensionId.value, agent?.extensionVersion);

		if (responseModel.request?.locationData?.type === ChatAgentLocation.EditorInline) {

			return EditSources.inlineChatApplyEdit({
				modelId: request?.modelId,
				requestId: request?.id,
				sessionId,
				languageId,
				extensionId,
			});
		}

		return EditSources.chatApplyEdits({
			modelId: request?.modelId,
			requestId: request?.id,
			sessionId,
			languageId,
			mode: request?.modeInfo?.modeId,
			extensionId,
			codeBlockSuggestionId: request?.modeInfo?.applyCodeBlockSuggestionId,
		});
	}

	private _applyEdits(edits: ISingleEditOperation[], source: TextModelEditSource) {

		if (edits.length === 0) {
			return [];
		}

		try {
			this._isEditFromUs = true;
			// make the actual edit
			let result: ISingleEditOperation[] = [];

			this.modifiedModel.pushEditOperations(null, edits, (undoEdits) => {
				result = undoEdits;
				return null;
			}, undefined, source);

			return result;
		} finally {
			this._isEditFromUs = false;
		}
	}

	/**
	 * Keeps the current modified document as the final contents.
	 */
	public keep() {
		this.notifyHunkAction('accepted', { linesAdded: this.linesAdded, linesRemoved: this.linesRemoved, lineCount: this.lineChangeCount, hasRemainingEdits: false });
		this.originalModel.setValue(this.modifiedModel.createSnapshot());
		this._reset();
	}

	/**
	 * Undoes the current modified document as the final contents.
	 */
	public undo() {
		this.notifyHunkAction('rejected', { linesAdded: this.linesAdded, linesRemoved: this.linesRemoved, lineCount: this.lineChangeCount, hasRemainingEdits: false });
		this.modifiedModel.pushStackElement();
		this._applyEdits([(EditOperation.replace(this.modifiedModel.getFullModelRange(), this.originalModel.getValue()))], EditSources.chatUndoEdits());
		this.modifiedModel.pushStackElement();
		this._reset();
	}

	private _reset() {
		this._originalToModifiedEdit = AttributedEdits.empty;
		this._diffInfo.set(nullDocumentDiff, undefined);
		this._didUserEditModelFired = false;
	}

	/**
	 * Merges attributed edits from serialized DTOs into the existing tracking state.
	 * This is used when restoring a session - it adds the restored ranges alongside
	 * any existing ranges from other sessions that may already be active.
	 *
	 * @param attributedRanges The serialized attributed ranges from the snapshot
	 */
	public mergeAttributedEdits(attributedRanges: readonly IAttributedRangeDTO[]): void {
		if (attributedRanges.length === 0) {
			return;
		}

		// Build an AttributedStringEdit from the DTOs
		const currentContent = this.modifiedModel.getValue();
		const sortedRanges = [...attributedRanges].sort((a, b) => a.start - b.start);
		const newReplacements: AnnotatedStringReplacement<CombinedAttribution>[] = [];

		for (const range of sortedRanges) {
			// Create attribution based on whether it's a user edit
			const attribution = range.isUserEdit
				? new CombinedAttribution(UserEditAttribution.instance)
				: new CombinedAttribution(new AgentAttribution(
					range.telemetryInfo,
					range.requestId,
					range.undoStopId,
				));

			// The newText is the content at that range in the current document
			const newText = currentContent.substring(range.start, range.end);

			newReplacements.push(new AnnotatedStringReplacement(
				new OffsetRange(range.start, range.end),
				newText,
				attribution,
			));
		}

		const restoredEdit = new AnnotatedStringEdit(newReplacements);

		// Merge with existing attributions rather than replacing them
		// This handles the case where another session is already active
		if (this._originalToModifiedEdit.isEmpty()) {
			this._originalToModifiedEdit = restoredEdit;
		} else {
			// Combine the existing and restored edits
			// We need to be careful about overlapping ranges - the existing edit takes precedence
			// since it represents the current live session state
			const existingRanges = getAttributedRanges(this._originalToModifiedEdit);
			const existingOffsets = new Set<string>();

			// Build a set of existing range keys for quick lookup
			for (const { range } of existingRanges) {
				existingOffsets.add(`${range.start}-${range.endExclusive}`);
			}

			// Filter out any restored ranges that overlap with existing ones
			const nonOverlappingReplacements = newReplacements.filter(replacement => {
				const key = `${replacement.replaceRange.start}-${replacement.replaceRange.endExclusive}`;
				if (existingOffsets.has(key)) {
					return false; // Skip - existing edit takes precedence
				}
				// Also check for any overlap (not just exact match)
				for (const { range } of existingRanges) {
					if (replacement.replaceRange.intersects(range)) {
						return false; // Skip overlapping ranges
					}
				}
				return true;
			});

			if (nonOverlappingReplacements.length > 0) {
				// Merge the non-overlapping restored ranges with existing ones
				const allReplacements = [
					...this._originalToModifiedEdit.replacements,
					...nonOverlappingReplacements,
				].sort((a, b) => a.replaceRange.start - b.replaceRange.start);

				this._originalToModifiedEdit = new AnnotatedStringEdit(allReplacements);
			}
		}
	}

	public async resetDocumentValues(newOriginal: string | ITextSnapshot | undefined, newModified: string | undefined): Promise<void> {
		let didChange = false;
		if (newOriginal !== undefined) {
			this.originalModel.setValue(newOriginal);
			didChange = true;
		}
		if (newModified !== undefined && this.modifiedModel.getValue() !== newModified) {
			// NOTE that this isn't done via `setValue` so that the undo stack is preserved
			this.modifiedModel.pushStackElement();
			this._applyEdits([(EditOperation.replace(this.modifiedModel.getFullModelRange(), newModified))], EditSources.chatReset());
			this.modifiedModel.pushStackElement();
			didChange = true;
		}
		if (didChange) {
			await this._updateDiffInfoSeq();
		}
	}

	private _mirrorEdits(event: IModelContentChangedEvent) {
		const edit = offsetEditFromContentChanges(event.changes);
		const isExternalEdit = this._isExternalEditInProgress?.();

		if (this._isEditFromUs || isExternalEdit) {
			// Agent edit: attribute to current context and compose
			const attribution = this._currentEditContext?.attribution;
			const combinedAttribution = attribution
				? new CombinedAttribution(attribution)
				: new CombinedAttribution(new AgentAttribution(
					// Fallback for external edits without context
					{ agentId: undefined, command: undefined, sessionResource: this.modifiedModel.uri, requestId: '', result: undefined, modelId: undefined, modeId: undefined, applyCodeBlockSuggestionId: undefined, feature: undefined },
					'external',
					undefined
				));

			const e_sum = this._originalToModifiedEdit;
			const e_ai = edit.mapData(() => combinedAttribution);
			this._originalToModifiedEdit = e_sum.compose(e_ai);
			if (isExternalEdit) {
				this._updateDiffInfoSeq();
			}
		} else {
			// User edit: need to rebase while preserving attributions
			//
			//           e_ai
			//   d0 ---------------> s0
			//   |                   |
			//   |                   |
			//   | e_user_r          | e_user
			//   |                   |
			//   |                   |
			//   v       e_ai_r      v
			///  d1 ---------------> s1
			//
			// d0 - document snapshot
			// s0 - document
			// e_ai - ai edits (attributed)
			// e_user - user edits
			//
			const e_ai = this._originalToModifiedEdit;
			const e_user = edit;

			const e_user_r = e_user.tryRebase(e_ai.toStringEdit().inverse(this.originalModel.getValue()));

			if (e_user_r === undefined) {
				// User edit overlaps/conflicts with AI edits - compose but retain original AI attributions.
				// The user edit will be attributed to user, and AI attributions will be preserved
				// for the portions that don't overlap.
				const userAttribution = new CombinedAttribution(AttributedEdits.fromUserEdit(e_user).replacements[0]?.data.attribution ?? new AgentAttribution(
					{ agentId: undefined, command: undefined, sessionResource: this.modifiedModel.uri, requestId: '', result: undefined, modelId: undefined, modeId: undefined, applyCodeBlockSuggestionId: undefined, feature: undefined },
					'user-conflict',
					undefined
				));
				const attributedUserEdit = edit.mapData(() => userAttribution);
				this._originalToModifiedEdit = e_ai.compose(attributedUserEdit);
			} else {
				// No conflict: apply user edit to original document, rebase AI edit
				const edits = offsetEditToEditOperations(e_user_r, this.originalModel);
				this.originalModel.applyEdits(edits);

				// Rebase the attributed edit, preserving attributions
				const rebasedEdit = e_ai.rebaseSkipConflicting(e_user_r);
				// Map the rebased StringEdit back to AttributedStringEdit, preserving data
				this._originalToModifiedEdit = this._rebaseAttributedEdit(e_ai, rebasedEdit);
			}

			this._allEditsAreFromUs = false;
			this._updateDiffInfoSeq();
			if (!this._didUserEditModelFired) {
				this._didUserEditModelFired = true;
				this._didUserEditModel.fire();
			}
		}
	}

	/**
	 * Rebases an attributed edit while preserving attribution data.
	 * When the underlying StringEdit is rebased, we need to map the attributions
	 * from the original edit to the new positions.
	 */
	private _rebaseAttributedEdit(original: AttributedStringEdit, rebased: StringEdit): AttributedStringEdit {
		// For each replacement in the rebased edit, find the corresponding
		// replacement in the original edit and copy its attribution
		const newReplacements: AnnotatedStringReplacement<CombinedAttribution>[] = [];

		for (const rebasedReplacement of rebased.replacements) {
			// Find the original replacement that this rebased replacement came from
			// by matching on the newText content (since that's preserved through rebase)
			let attribution: CombinedAttribution | undefined;
			for (const origReplacement of original.replacements) {
				// Match by comparing the new text - this is a heuristic that works
				// because rebase doesn't change the replacement text
				if (origReplacement.newText === rebasedReplacement.newText) {
					attribution = origReplacement.data;
					break;
				}
			}

			// If we couldn't find a matching attribution, create a default one
			if (!attribution) {
				attribution = new CombinedAttribution(new AgentAttribution(
					{ agentId: undefined, command: undefined, sessionResource: this.modifiedModel.uri, requestId: '', result: undefined, modelId: undefined, modeId: undefined, applyCodeBlockSuggestionId: undefined, feature: undefined },
					'rebased-unknown',
					undefined
				));
			}

			newReplacements.push(AnnotatedStringReplacement.replace(
				rebasedReplacement.replaceRange,
				rebasedReplacement.newText,
				attribution
			));
		}

		return AnnotatedStringEdit.create(newReplacements);
	}

	private async _keepHunk(change: DetailedLineRangeMapping): Promise<boolean> {
		if (!this._diffInfo.get().changes.includes(change)) {
			// diffInfo should have model version ids and check them (instead of the caller doing that)
			return false;
		}
		const edits: ISingleEditOperation[] = [];
		for (const edit of change.innerChanges ?? []) {
			const newText = this.modifiedModel.getValueInRange(edit.modifiedRange);
			edits.push(EditOperation.replace(edit.originalRange, newText));
		}
		this.originalModel.pushEditOperations(null, edits, _ => null);
		await this._updateDiffInfoSeq('accepted');
		if (this._diffInfo.get().identical) {
			this._didAcceptOrRejectAllHunks.fire(ModifiedFileEntryState.Accepted);
		}
		this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
		return true;
	}

	private async _undoHunk(change: DetailedLineRangeMapping): Promise<boolean> {
		if (!this._diffInfo.get().changes.includes(change)) {
			return false;
		}
		const edits: ISingleEditOperation[] = [];
		for (const edit of change.innerChanges ?? []) {
			const newText = this.originalModel.getValueInRange(edit.originalRange);
			edits.push(EditOperation.replace(edit.modifiedRange, newText));
		}
		this.modifiedModel.pushEditOperations(null, edits, _ => null);
		await this._updateDiffInfoSeq('rejected');
		if (this._diffInfo.get().identical) {
			this._didAcceptOrRejectAllHunks.fire(ModifiedFileEntryState.Rejected);
		}
		this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
		return true;
	}


	private async _updateDiffInfoSeq(notifyAction: 'accepted' | 'rejected' | undefined = undefined) {
		const myDiffOperationId = ++this._diffOperationIds;
		await Promise.resolve(this._diffOperation);
		const previousCount = this.lineChangeCount;
		const previousAdded = this.linesAdded;
		const previousRemoved = this.linesRemoved;
		if (this._diffOperationIds === myDiffOperationId) {
			const thisDiffOperation = this._updateDiffInfo();
			this._diffOperation = thisDiffOperation;
			await thisDiffOperation;
			if (notifyAction) {
				const affectedLines = {
					linesAdded: previousAdded - this.linesAdded,
					linesRemoved: previousRemoved - this.linesRemoved,
					lineCount: previousCount - this.lineChangeCount,
					hasRemainingEdits: this.lineChangeCount > 0
				};
				this.notifyHunkAction(notifyAction, affectedLines);
			}
		}
	}

	public hasHunkAt(range: IRange) {
		// return true if the range overlaps a diff range
		return this._diffInfo.get().changes.some(c => c.modified.intersectsStrict(LineRange.fromRangeInclusive(range)));
	}

	private async _updateDiffInfo(): Promise<IDocumentDiff | undefined> {

		if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed() || this._store.isDisposed) {
			return undefined;
		}

		if (this.state.get() !== ModifiedFileEntryState.Modified) {
			this._diffInfo.set(nullDocumentDiff, undefined);
			this._originalToModifiedEdit = AttributedEdits.empty;
			return nullDocumentDiff;
		}

		const docVersionNow = this.modifiedModel.getVersionId();
		const snapshotVersionNow = this.originalModel.getVersionId();

		const diff = await this._editorWorkerService.computeDiff(
			this.originalModel.uri,
			this.modifiedModel.uri,
			{
				ignoreTrimWhitespace: false, // NEVER ignore whitespace so that undo/accept edits are correct and so that all changes (1 of 2) are spelled out
				computeMoves: false,
				maxComputationTimeMs: 3000
			},
			'advanced'
		);

		if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed() || this._store.isDisposed) {
			return undefined;
		}

		// only update the diff if the documents didn't change in the meantime
		if (this.modifiedModel.getVersionId() === docVersionNow && this.originalModel.getVersionId() === snapshotVersionNow) {
			const diff2 = diff ?? nullDocumentDiff;

			// Map each diff hunk to its attribution using our tracked edit ranges
			this._diffInfo.set({
				...diff2,
				changes: diff2.changes.map(change => new SourceAnnotatedDetailedLineRangeMapping(
					change,
					this._getHunkAttribution(change),
					this._getHunkAttributedRanges(change)
				))
			}, undefined);

			// Rebuild the attributed edit from the diff, preserving existing attributions where possible
			const newEdit = offsetEditFromLineRangeMapping(this.originalModel, this.modifiedModel, diff2.changes);
			this._originalToModifiedEdit = this._mergeAttributionsFromDiff(newEdit, diff2.changes);
			return diff2;
		}
		return undefined;
	}

	/**
	 * Merges attribution data from the previous tracked edit into a new edit derived from diff.
	 * This preserves agent attribution when the diff is recomputed.
	 */
	private _mergeAttributionsFromDiff(newEdit: StringEdit, _changes: readonly DetailedLineRangeMapping[]): AttributedStringEdit {
		// Get the current attributed ranges
		const currentRanges = getAttributedRanges(this._originalToModifiedEdit);

		// If we have no existing attributions, just return an empty attributed edit
		if (currentRanges.length === 0 || this._originalToModifiedEdit.isEmpty()) {
			// Map all replacements to a default attribution (likely this is initial state)
			return newEdit.mapData(() => new CombinedAttribution(new AgentAttribution(
				{ agentId: undefined, command: undefined, sessionResource: this.modifiedModel.uri, requestId: '', result: undefined, modelId: undefined, modeId: undefined, applyCodeBlockSuggestionId: undefined, feature: undefined },
				'diff-initial',
				undefined
			)));
		}

		// For each replacement in the new edit, find overlapping attributions from the old edit
		const newReplacements: AnnotatedStringReplacement<CombinedAttribution>[] = [];

		for (const replacement of newEdit.replacements) {
			// Find the best matching attribution from current ranges
			let bestAttribution: CombinedAttribution | undefined;
			let bestOverlap = 0;

			for (const { range, attribution } of currentRanges) {
				const overlapStart = Math.max(replacement.replaceRange.start, range.start);
				const overlapEnd = Math.min(replacement.replaceRange.endExclusive, range.endExclusive);
				const overlap = Math.max(0, overlapEnd - overlapStart);

				if (overlap > bestOverlap) {
					bestOverlap = overlap;
					bestAttribution = attribution;
				}
			}

			// Use the best matching attribution, or create a default one
			if (!bestAttribution) {
				bestAttribution = new CombinedAttribution(new AgentAttribution(
					{ agentId: undefined, command: undefined, sessionResource: this.modifiedModel.uri, requestId: '', result: undefined, modelId: undefined, modeId: undefined, applyCodeBlockSuggestionId: undefined, feature: undefined },
					'diff-unattributed',
					undefined
				));
			}

			newReplacements.push(AnnotatedStringReplacement.replace(
				replacement.replaceRange,
				replacement.newText,
				bestAttribution
			));
		}

		return AnnotatedStringEdit.create(newReplacements);
	}
}
