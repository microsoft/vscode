/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFindFirst } from '../../../../../base/common/arraysFind.js';
import { itemsEquals } from '../../../../../base/common/equals.js';
import { BugIndicatingError, onUnexpectedError, onUnexpectedExternalError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, IReader, ITransaction, autorun, derived, derivedHandleChanges, derivedOpts, observableSignal, observableValue, recomputeInitiallyAndOnChange, subtransaction, transaction } from '../../../../../base/common/observable.js';
import { commonPrefixLength, firstNonWhitespaceIndex } from '../../../../../base/common/strings.js';
import { isDefined } from '../../../../../base/common/types.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { CursorColumns } from '../../../../common/core/cursorColumns.js';
import { EditOperation } from '../../../../common/core/editOperation.js';
import { LineRange } from '../../../../common/core/lineRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { SingleTextEdit } from '../../../../common/core/textEdit.js';
import { TextLength } from '../../../../common/core/textLength.js';
import { ScrollType } from '../../../../common/editorCommon.js';
import { Command, InlineCompletion, InlineCompletionContext, InlineCompletionTriggerKind, PartialAcceptTriggerKind } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { EndOfLinePreference, ITextModel } from '../../../../common/model.js';
import { IFeatureDebounceInformation } from '../../../../common/services/languageFeatureDebounce.js';
import { IModelContentChangedEvent } from '../../../../common/textModelEvents.js';
import { SnippetController2 } from '../../../snippet/browser/snippetController2.js';
import { addPositions, getEndPositionsAfterApplying, substringPos, subtractPositions } from '../utils.js';
import { computeGhostText } from './computeGhostText.js';
import { GhostText, GhostTextOrReplacement, ghostTextOrReplacementEquals, ghostTextsOrReplacementsEqual } from './ghostText.js';
import { InlineCompletionWithUpdatedRange, InlineCompletionsSource } from './inlineCompletionsSource.js';
import { InlineEdit } from './inlineEdit.js';
import { InlineCompletionItem } from './provideInlineCompletions.js';
import { singleTextEditAugments, singleTextRemoveCommonPrefix } from './singleTextEditHelpers.js';
import { SuggestItemInfo } from './suggestWidgetAdapter.js';

export class InlineCompletionsModel extends Disposable {
	private readonly _source = this._register(this._instantiationService.createInstance(InlineCompletionsSource, this.textModel, this._textModelVersionId, this._debounceValue));
	private readonly _isActive = observableValue<boolean>(this, false);
	private readonly _onlyRequestInlineEditsSignal = observableSignal(this);
	private readonly _forceUpdateExplicitlySignal = observableSignal(this);

	// We use a semantic id to keep the same inline completion selected even if the provider reorders the completions.
	private readonly _selectedInlineCompletionId = observableValue<string | undefined>(this, undefined);
	private readonly _primaryPosition = derived(this, reader => this._positions.read(reader)[0] ?? new Position(1, 1));

	private _isAcceptingPartially = false;
	public get isAcceptingPartially() { return this._isAcceptingPartially; }

	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _onlyShowWhenCloseToCursor = this._editorObs.getOption(EditorOption.inlineSuggest).map(v => !!v.edits.experimental.onlyShowWhenCloseToCursor);
	private readonly _suggestPreviewEnabled = this._editorObs.getOption(EditorOption.suggest).map(v => v.preview);
	private readonly _suggestPreviewMode = this._editorObs.getOption(EditorOption.suggest).map(v => v.previewMode);
	private readonly _inlineSuggestMode = this._editorObs.getOption(EditorOption.inlineSuggest).map(v => v.mode);
	private readonly _inlineEditsEnabled = this._editorObs.getOption(EditorOption.inlineSuggest).map(v => !!v.edits.experimental?.enabled);

	constructor(
		public readonly textModel: ITextModel,
		private readonly _selectedSuggestItem: IObservable<SuggestItemInfo | undefined>,
		public readonly _textModelVersionId: IObservable<number | null, IModelContentChangedEvent | undefined>,
		private readonly _positions: IObservable<readonly Position[]>,
		private readonly _debounceValue: IFeatureDebounceInformation,
		private readonly _enabled: IObservable<boolean>,
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
	) {
		super();

		this._register(recomputeInitiallyAndOnChange(this._fetchInlineCompletionsPromise));

		let lastItem: InlineCompletionWithUpdatedRange | undefined = undefined;
		this._register(autorun(reader => {
			/** @description call handleItemDidShow */
			const item = this.inlineCompletionState.read(reader);
			const completion = item?.inlineCompletion;
			if (completion?.semanticId !== lastItem?.semanticId) {
				lastItem = completion;
				if (completion) {
					const i = completion.inlineCompletion;
					const src = i.source;
					src.provider.handleItemDidShow?.(src.inlineCompletions, i.sourceInlineCompletion, i.insertText);
				}
			}
		}));

		this._register(autorun(reader => {
			this._editorObs.versionId.read(reader);
			this._inAcceptFlow.set(false, undefined);
		}));


	}

	public debugGetSelectedSuggestItem(): IObservable<SuggestItemInfo | undefined> {
		return this._selectedSuggestItem;
	}

	public getIndentationInfo(reader: IReader) {
		let startsWithIndentation = false;
		let startsWithIndentationLessThanTabSize = true;
		const ghostText = this?.primaryGhostText.read(reader);
		if (!!this?._selectedSuggestItem && ghostText && ghostText.parts.length > 0) {
			const { column, lines } = ghostText.parts[0];

			const firstLine = lines[0];

			const indentationEndColumn = this.textModel.getLineIndentColumn(ghostText.lineNumber);
			const inIndentation = column <= indentationEndColumn;

			if (inIndentation) {
				let firstNonWsIdx = firstNonWhitespaceIndex(firstLine);
				if (firstNonWsIdx === -1) {
					firstNonWsIdx = firstLine.length - 1;
				}
				startsWithIndentation = firstNonWsIdx > 0;

				const tabSize = this.textModel.getOptions().tabSize;
				const visibleColumnIndentation = CursorColumns.visibleColumnFromColumn(firstLine, firstNonWsIdx + 1, tabSize);
				startsWithIndentationLessThanTabSize = visibleColumnIndentation < tabSize;
			}
		}
		return {
			startsWithIndentation,
			startsWithIndentationLessThanTabSize,
		};
	}

	private readonly _preserveCurrentCompletionReasons = new Set([
		VersionIdChangeReason.Redo,
		VersionIdChangeReason.Undo,
		VersionIdChangeReason.AcceptWord,
	]);

	private _getReason(e: IModelContentChangedEvent | undefined): VersionIdChangeReason {
		if (e?.isUndoing) { return VersionIdChangeReason.Undo; }
		if (e?.isRedoing) { return VersionIdChangeReason.Redo; }
		if (this.isAcceptingPartially) { return VersionIdChangeReason.AcceptWord; }
		return VersionIdChangeReason.Other;
	}

	public readonly dontRefetchSignal = observableSignal(this);

	private readonly _fetchInlineCompletionsPromise = derivedHandleChanges({
		owner: this,
		createEmptyChangeSummary: () => ({
			dontRefetch: false,
			preserveCurrentCompletion: false,
			inlineCompletionTriggerKind: InlineCompletionTriggerKind.Automatic,
			onlyRequestInlineEdits: false,
		}),
		handleChange: (ctx, changeSummary) => {
			/** @description fetch inline completions */
			if (ctx.didChange(this._textModelVersionId) && this._preserveCurrentCompletionReasons.has(this._getReason(ctx.change))) {
				changeSummary.preserveCurrentCompletion = true;
			} else if (ctx.didChange(this._forceUpdateExplicitlySignal)) {
				changeSummary.inlineCompletionTriggerKind = InlineCompletionTriggerKind.Explicit;
			} else if (ctx.didChange(this.dontRefetchSignal)) {
				changeSummary.dontRefetch = true;
			} else if (ctx.didChange(this._onlyRequestInlineEditsSignal)) {
				changeSummary.onlyRequestInlineEdits = true;
			}
			return true;
		},
	}, (reader, changeSummary) => {
		this.dontRefetchSignal.read(reader);
		this._onlyRequestInlineEditsSignal.read(reader);
		this._forceUpdateExplicitlySignal.read(reader);
		const shouldUpdate = (this._enabled.read(reader) && this._selectedSuggestItem.read(reader)) || this._isActive.read(reader);
		if (!shouldUpdate) {
			this._source.cancelUpdate();
			return undefined;
		}

		this._textModelVersionId.read(reader); // Refetch on text change

		const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.get();
		const suggestItem = this._selectedSuggestItem.read(reader);
		if (suggestWidgetInlineCompletions && !suggestItem) {
			const inlineCompletions = this._source.inlineCompletions.get();
			transaction(tx => {
				/** @description Seed inline completions with (newer) suggest widget inline completions */
				if (!inlineCompletions || suggestWidgetInlineCompletions.request.versionId > inlineCompletions.request.versionId) {
					this._source.inlineCompletions.set(suggestWidgetInlineCompletions.clone(), tx);
				}
				this._source.clearSuggestWidgetInlineCompletions(tx);
			});
		}

		const cursorPosition = this._primaryPosition.get();
		if (changeSummary.dontRefetch) {
			return Promise.resolve(true);
		}

		const context: InlineCompletionContext = {
			triggerKind: changeSummary.inlineCompletionTriggerKind,
			selectedSuggestionInfo: suggestItem?.toSelectedSuggestionInfo(),
			includeInlineCompletions: !changeSummary.onlyRequestInlineEdits,
			includeInlineEdits: this._inlineEditsEnabled.read(reader),
		};
		const itemToPreserveCandidate = this.selectedInlineCompletion.get();
		const itemToPreserve = changeSummary.preserveCurrentCompletion || itemToPreserveCandidate?.forwardStable
			? itemToPreserveCandidate : undefined;
		return this._source.fetch(cursorPosition, context, itemToPreserve);
	});

	public async trigger(tx?: ITransaction, onlyFetchInlineEdits: boolean = false): Promise<void> {
		subtransaction(tx, tx => {
			if (onlyFetchInlineEdits) {
				this._onlyRequestInlineEditsSignal.trigger(tx);
			}
			this._isActive.set(true, tx);
		});
		await this._fetchInlineCompletionsPromise.get();
	}

	public async triggerExplicitly(tx?: ITransaction, onlyFetchInlineEdits: boolean = false): Promise<void> {
		subtransaction(tx, tx => {
			if (onlyFetchInlineEdits) {
				this._onlyRequestInlineEditsSignal.trigger(tx);
			}
			this._isActive.set(true, tx);
			this._forceUpdateExplicitlySignal.trigger(tx);
		});
		await this._fetchInlineCompletionsPromise.get();
	}

	public stop(stopReason: 'explicitCancel' | 'automatic' = 'automatic', tx?: ITransaction): void {
		subtransaction(tx, tx => {
			if (stopReason === 'explicitCancel') {
				const completion = this.state.get()?.inlineCompletion?.inlineCompletion;
				if (completion && completion.source.provider.handleRejection) {
					completion.source.provider.handleRejection(completion.source.inlineCompletions, completion.sourceInlineCompletion);
				}
			}

			this._isActive.set(false, tx);
			this._source.clear(tx);
		});
	}

	private readonly _collapsedInlineEditId = observableValue<string | undefined>(this, undefined);

	public collapseInlineEdit(): void {
		const currentInlineEdit = this.inlineEditState.get()?.inlineCompletion;
		if (!currentInlineEdit) { return; }
		this._collapsedInlineEditId.set(currentInlineEdit.semanticId, undefined);
	}

	private readonly _inlineCompletionItems = derivedOpts({ owner: this }, reader => {
		const c = this._source.inlineCompletions.read(reader);
		if (!c) { return undefined; }
		const cursorPosition = this._primaryPosition.read(reader);
		let inlineEdit: InlineCompletionWithUpdatedRange | undefined = undefined;
		const visibleCompletions: InlineCompletionWithUpdatedRange[] = [];
		for (const completion of c.inlineCompletions) {
			if (!completion.inlineCompletion.sourceInlineCompletion.isInlineEdit) {
				if (completion.isVisible(this.textModel, cursorPosition, reader)) {
					visibleCompletions.push(completion);
				}
			} else {
				inlineEdit = completion;
			}
		}

		if (visibleCompletions.length !== 0) {
			// Don't show the inline edit if there is a visible completion
			inlineEdit = undefined;
		}

		return {
			inlineCompletions: visibleCompletions,
			inlineEdit,
		};
	});

	private readonly _filteredInlineCompletionItems = derivedOpts({ owner: this, equalsFn: itemsEquals() }, reader => {
		const c = this._inlineCompletionItems.read(reader);
		return c?.inlineCompletions ?? [];
	});

	public readonly selectedInlineCompletionIndex = derived<number>(this, (reader) => {
		const selectedInlineCompletionId = this._selectedInlineCompletionId.read(reader);
		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		const idx = this._selectedInlineCompletionId === undefined ? -1
			: filteredCompletions.findIndex(v => v.semanticId === selectedInlineCompletionId);
		if (idx === -1) {
			// Reset the selection so that the selection does not jump back when it appears again
			this._selectedInlineCompletionId.set(undefined, undefined);
			return 0;
		}
		return idx;
	});

	public readonly selectedInlineCompletion = derived<InlineCompletionWithUpdatedRange | undefined>(this, (reader) => {
		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		const idx = this.selectedInlineCompletionIndex.read(reader);
		return filteredCompletions[idx];
	});

	public readonly activeCommands = derivedOpts<Command[]>({ owner: this, equalsFn: itemsEquals() },
		r => this.selectedInlineCompletion.read(r)?.inlineCompletion.source.inlineCompletions.commands ?? []
	);

	public readonly lastTriggerKind: IObservable<InlineCompletionTriggerKind | undefined>
		= this._source.inlineCompletions.map(this, v => v?.request.context.triggerKind);

	public readonly inlineCompletionsCount = derived<number | undefined>(this, reader => {
		if (this.lastTriggerKind.read(reader) === InlineCompletionTriggerKind.Explicit) {
			return this._filteredInlineCompletionItems.read(reader).length;
		} else {
			return undefined;
		}
	});

	public readonly state = derivedOpts<{
		kind: 'ghostText';
		edits: readonly SingleTextEdit[];
		primaryGhostText: GhostTextOrReplacement;
		ghostTexts: readonly GhostTextOrReplacement[];
		suggestItem: SuggestItemInfo | undefined;
		inlineCompletion: InlineCompletionWithUpdatedRange | undefined;
	} | {
		kind: 'inlineEdit';
		edits: readonly SingleTextEdit[];
		inlineEdit: InlineEdit;
		inlineCompletion: InlineCompletionWithUpdatedRange;
		cursorAtInlineEdit: boolean;
	} | undefined>({
		owner: this,
		equalsFn: (a, b) => {
			if (!a || !b) { return a === b; }

			if (a.kind === 'ghostText' && b.kind === 'ghostText') {
				return ghostTextsOrReplacementsEqual(a.ghostTexts, b.ghostTexts)
					&& a.inlineCompletion === b.inlineCompletion
					&& a.suggestItem === b.suggestItem;
			} else if (a.kind === 'inlineEdit' && b.kind === 'inlineEdit') {
				return a.inlineEdit.equals(b.inlineEdit) && a.cursorAtInlineEdit === b.cursorAtInlineEdit;
			}
			return false;
		}
	}, (reader) => {
		const model = this.textModel;

		const item = this._inlineCompletionItems.read(reader);
		if (item?.inlineEdit) {
			let edit = item.inlineEdit.toSingleTextEdit(reader);
			edit = singleTextRemoveCommonPrefix(edit, model);

			const cursorPos = this._primaryPosition.read(reader);
			const cursorAtInlineEdit = LineRange.fromRangeInclusive(edit.range).addMargin(1, 1).contains(cursorPos.lineNumber);

			const cursorDist = LineRange.fromRange(edit.range).distanceToLine(this._primaryPosition.read(reader).lineNumber);

			if (this._onlyShowWhenCloseToCursor.read(reader) && cursorDist > 3 && !item.inlineEdit.request.isExplicitRequest && !this._inAcceptFlow.read(reader)) {
				return undefined;
			}
			const disableCollapsing = true;
			const currentItemIsCollapsed = !disableCollapsing && (cursorDist > 1 && this._collapsedInlineEditId.read(reader) === item.inlineEdit.semanticId);

			const commands = item.inlineEdit.inlineCompletion.source.inlineCompletions.commands;
			const renderExplicitly = this._jumpedTo.read(reader);
			const inlineEdit = new InlineEdit(edit, currentItemIsCollapsed, renderExplicitly, commands ?? [], item.inlineEdit.inlineCompletion);

			return { kind: 'inlineEdit', inlineEdit, inlineCompletion: item.inlineEdit, edits: [edit], cursorAtInlineEdit };
		}

		this._jumpedTo.set(false, undefined);

		const suggestItem = this._selectedSuggestItem.read(reader);
		if (suggestItem) {
			const suggestCompletionEdit = singleTextRemoveCommonPrefix(suggestItem.toSingleTextEdit(), model);
			const augmentation = this._computeAugmentation(suggestCompletionEdit, reader);

			const isSuggestionPreviewEnabled = this._suggestPreviewEnabled.read(reader);
			if (!isSuggestionPreviewEnabled && !augmentation) { return undefined; }

			const fullEdit = augmentation?.edit ?? suggestCompletionEdit;
			const fullEditPreviewLength = augmentation ? augmentation.edit.text.length - suggestCompletionEdit.text.length : 0;

			const mode = this._suggestPreviewMode.read(reader);
			const positions = this._positions.read(reader);
			const edits = [fullEdit, ...getSecondaryEdits(this.textModel, positions, fullEdit)];
			const ghostTexts = edits
				.map((edit, idx) => computeGhostText(edit, model, mode, positions[idx], fullEditPreviewLength))
				.filter(isDefined);
			const primaryGhostText = ghostTexts[0] ?? new GhostText(fullEdit.range.endLineNumber, []);
			return { kind: 'ghostText', edits, primaryGhostText, ghostTexts, inlineCompletion: augmentation?.completion, suggestItem };
		} else {
			if (!this._isActive.read(reader)) { return undefined; }
			const inlineCompletion = this.selectedInlineCompletion.read(reader);
			if (!inlineCompletion) { return undefined; }

			const replacement = inlineCompletion.toSingleTextEdit(reader);
			const mode = this._inlineSuggestMode.read(reader);
			const positions = this._positions.read(reader);
			const edits = [replacement, ...getSecondaryEdits(this.textModel, positions, replacement)];
			const ghostTexts = edits
				.map((edit, idx) => computeGhostText(edit, model, mode, positions[idx], 0))
				.filter(isDefined);
			if (!ghostTexts[0]) { return undefined; }
			return { kind: 'ghostText', edits, primaryGhostText: ghostTexts[0], ghostTexts, inlineCompletion, suggestItem: undefined };
		}
	});

	public readonly status = derived(this, reader => {
		if (this._source.loading.read(reader)) { return 'loading'; }
		const s = this.state.read(reader);
		if (s?.kind === 'ghostText') { return 'ghostText'; }
		if (s?.kind === 'inlineEdit') { return 'inlineEdit'; }
		return 'noSuggestion';
	});

	public readonly inlineCompletionState = derived(reader => {
		const s = this.state.read(reader);
		if (!s || s.kind !== 'ghostText') {
			return undefined;
		}
		if (this._editorObs.inComposition.read(reader)) {
			return undefined;
		}
		return s;
	});

	public readonly inlineEditState = derived(reader => {
		const s = this.state.read(reader);
		if (!s || s.kind !== 'inlineEdit') {
			return undefined;
		}
		return s;
	});

	public readonly inlineEditAvailable = derived(reader => {
		const s = this.inlineEditState.read(reader);
		return !!s;
	});

	private _computeAugmentation(suggestCompletion: SingleTextEdit, reader: IReader | undefined) {
		const model = this.textModel;
		const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(reader);
		const candidateInlineCompletions = suggestWidgetInlineCompletions
			? suggestWidgetInlineCompletions.inlineCompletions
			: [this.selectedInlineCompletion.read(reader)].filter(isDefined);

		const augmentedCompletion = mapFindFirst(candidateInlineCompletions, completion => {
			let r = completion.toSingleTextEdit(reader);
			r = singleTextRemoveCommonPrefix(
				r,
				model,
				Range.fromPositions(r.range.getStartPosition(), suggestCompletion.range.getEndPosition())
			);
			return singleTextEditAugments(r, suggestCompletion) ? { completion, edit: r } : undefined;
		});

		return augmentedCompletion;
	}

	public readonly ghostTexts = derivedOpts({ owner: this, equalsFn: ghostTextsOrReplacementsEqual }, reader => {
		const v = this.inlineCompletionState.read(reader);
		if (!v) {
			return undefined;
		}
		return v.ghostTexts;
	});

	public readonly primaryGhostText = derivedOpts({ owner: this, equalsFn: ghostTextOrReplacementEquals }, reader => {
		const v = this.inlineCompletionState.read(reader);
		if (!v) {
			return undefined;
		}
		return v?.primaryGhostText;
	});

	private readonly _tabShouldIndent = derived(this, reader => {
		function isMultiLine(range: Range): boolean {
			return range.startLineNumber !== range.endLineNumber;
		}

		function getNonIndentationRange(model: ITextModel, lineNumber: number): Range {
			const columnStart = model.getLineIndentColumn(lineNumber);
			const lastNonWsColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
			const columnEnd = Math.max(lastNonWsColumn, columnStart);
			return new Range(lineNumber, columnStart, lineNumber, columnEnd);
		}

		const selections = this._editorObs.selections.read(reader);
		return selections?.some(s => {
			if (s.isEmpty()) {
				return this.textModel.getLineLength(s.startLineNumber) === 0;
			} else {
				return isMultiLine(s) || s.containsRange(getNonIndentationRange(this.textModel, s.startLineNumber));
			}
		});
	});

	public readonly tabShouldJumpToInlineEdit = derived(this, reader => {
		if (this._tabShouldIndent.read(reader)) {
			return false;
		}

		const s = this.inlineEditState.read(reader);
		if (!s) {
			return false;
		}
		return !s.cursorAtInlineEdit;
	});

	public readonly tabShouldAcceptInlineEdit = derived(this, reader => {
		if (this._jumpedTo.read(reader)) {
			return true;
		}
		if (this._tabShouldIndent.read(reader)) {
			return false;
		}

		const s = this.inlineEditState.read(reader);
		if (!s) {
			return false;
		}
		return s.cursorAtInlineEdit;
	});

	private async _deltaSelectedInlineCompletionIndex(delta: 1 | -1): Promise<void> {
		await this.triggerExplicitly();

		const completions = this._filteredInlineCompletionItems.get() || [];
		if (completions.length > 0) {
			const newIdx = (this.selectedInlineCompletionIndex.get() + delta + completions.length) % completions.length;
			this._selectedInlineCompletionId.set(completions[newIdx].semanticId, undefined);
		} else {
			this._selectedInlineCompletionId.set(undefined, undefined);
		}
	}

	public async next(): Promise<void> { await this._deltaSelectedInlineCompletionIndex(1); }

	public async previous(): Promise<void> { await this._deltaSelectedInlineCompletionIndex(-1); }

	public async accept(editor: ICodeEditor): Promise<void> {
		if (editor.getModel() !== this.textModel) {
			throw new BugIndicatingError();
		}

		let completion: InlineCompletionItem;

		const state = this.state.get();
		if (state?.kind === 'ghostText') {
			if (!state || state.primaryGhostText.isEmpty() || !state.inlineCompletion) {
				return;
			}
			completion = state.inlineCompletion.toInlineCompletion(undefined);
		} else if (state?.kind === 'inlineEdit') {
			completion = state.inlineCompletion.toInlineCompletion(undefined);
		} else {
			return;
		}

		if (completion.command) {
			// Make sure the completion list will not be disposed.
			completion.source.addRef();
		}

		editor.pushUndoStop();
		if (completion.snippetInfo) {
			editor.executeEdits(
				'inlineSuggestion.accept',
				[
					EditOperation.replace(completion.range, ''),
					...completion.additionalTextEdits
				]
			);
			editor.setPosition(completion.snippetInfo.range.getStartPosition(), 'inlineCompletionAccept');
			SnippetController2.get(editor)?.insert(completion.snippetInfo.snippet, { undoStopBefore: false });
		} else {
			const edits = state.edits;
			const selections = getEndPositionsAfterApplying(edits).map(p => Selection.fromPositions(p));
			editor.executeEdits('inlineSuggestion.accept', [
				...edits.map(edit => EditOperation.replace(edit.range, edit.text)),
				...completion.additionalTextEdits
			]);
			editor.setSelections(selections, 'inlineCompletionAccept');
		}

		// Reset before invoking the command, as the command might cause a follow up trigger (which we don't want to reset).
		this.stop();

		if (completion.command) {
			await this._commandService
				.executeCommand(completion.command.id, ...(completion.command.arguments || []))
				.then(undefined, onUnexpectedExternalError);
			completion.source.removeRef();
		}

		this._inAcceptFlow.set(true, undefined);
	}

	public async acceptNextWord(editor: ICodeEditor): Promise<void> {
		await this._acceptNext(editor, (pos, text) => {
			const langId = this.textModel.getLanguageIdAtPosition(pos.lineNumber, pos.column);
			const config = this._languageConfigurationService.getLanguageConfiguration(langId);
			const wordRegExp = new RegExp(config.wordDefinition.source, config.wordDefinition.flags.replace('g', ''));

			const m1 = text.match(wordRegExp);
			let acceptUntilIndexExclusive = 0;
			if (m1 && m1.index !== undefined) {
				if (m1.index === 0) {
					acceptUntilIndexExclusive = m1[0].length;
				} else {
					acceptUntilIndexExclusive = m1.index;
				}
			} else {
				acceptUntilIndexExclusive = text.length;
			}

			const wsRegExp = /\s+/g;
			const m2 = wsRegExp.exec(text);
			if (m2 && m2.index !== undefined) {
				if (m2.index + m2[0].length < acceptUntilIndexExclusive) {
					acceptUntilIndexExclusive = m2.index + m2[0].length;
				}
			}
			return acceptUntilIndexExclusive;
		}, PartialAcceptTriggerKind.Word);
	}

	public async acceptNextLine(editor: ICodeEditor): Promise<void> {
		await this._acceptNext(editor, (pos, text) => {
			const m = text.match(/\n/);
			if (m && m.index !== undefined) {
				return m.index + 1;
			}
			return text.length;
		}, PartialAcceptTriggerKind.Line);
	}

	private async _acceptNext(editor: ICodeEditor, getAcceptUntilIndex: (position: Position, text: string) => number, kind: PartialAcceptTriggerKind): Promise<void> {
		if (editor.getModel() !== this.textModel) {
			throw new BugIndicatingError();
		}

		const state = this.inlineCompletionState.get();
		if (!state || state.primaryGhostText.isEmpty() || !state.inlineCompletion) {
			return;
		}
		const ghostText = state.primaryGhostText;
		const completion = state.inlineCompletion.toInlineCompletion(undefined);

		if (completion.snippetInfo || completion.filterText !== completion.insertText) {
			// not in WYSIWYG mode, partial commit might change completion, thus it is not supported
			await this.accept(editor);
			return;
		}

		const firstPart = ghostText.parts[0];
		const ghostTextPos = new Position(ghostText.lineNumber, firstPart.column);
		const ghostTextVal = firstPart.text;
		const acceptUntilIndexExclusive = getAcceptUntilIndex(ghostTextPos, ghostTextVal);
		if (acceptUntilIndexExclusive === ghostTextVal.length && ghostText.parts.length === 1) {
			this.accept(editor);
			return;
		}
		const partialGhostTextVal = ghostTextVal.substring(0, acceptUntilIndexExclusive);

		const positions = this._positions.get();
		const cursorPosition = positions[0];

		// Executing the edit might free the completion, so we have to hold a reference on it.
		completion.source.addRef();
		try {
			this._isAcceptingPartially = true;
			try {
				editor.pushUndoStop();
				const replaceRange = Range.fromPositions(cursorPosition, ghostTextPos);
				const newText = editor.getModel()!.getValueInRange(replaceRange) + partialGhostTextVal;
				const primaryEdit = new SingleTextEdit(replaceRange, newText);
				const edits = [primaryEdit, ...getSecondaryEdits(this.textModel, positions, primaryEdit)];
				const selections = getEndPositionsAfterApplying(edits).map(p => Selection.fromPositions(p));
				editor.executeEdits('inlineSuggestion.accept', edits.map(edit => EditOperation.replace(edit.range, edit.text)));
				editor.setSelections(selections, 'inlineCompletionPartialAccept');
				editor.revealPositionInCenterIfOutsideViewport(editor.getPosition()!, ScrollType.Immediate);
			} finally {
				this._isAcceptingPartially = false;
			}

			if (completion.source.provider.handlePartialAccept) {
				const acceptedRange = Range.fromPositions(completion.range.getStartPosition(), TextLength.ofText(partialGhostTextVal).addToPosition(ghostTextPos));
				// This assumes that the inline completion and the model use the same EOL style.
				const text = editor.getModel()!.getValueInRange(acceptedRange, EndOfLinePreference.LF);
				completion.source.provider.handlePartialAccept(
					completion.source.inlineCompletions,
					completion.sourceInlineCompletion,
					text.length,
					{ kind, }
				);
			}
		} finally {
			completion.source.removeRef();
		}
	}

	public handleSuggestAccepted(item: SuggestItemInfo) {
		const itemEdit = singleTextRemoveCommonPrefix(item.toSingleTextEdit(), this.textModel);
		const augmentedCompletion = this._computeAugmentation(itemEdit, undefined);
		if (!augmentedCompletion) { return; }

		const inlineCompletion = augmentedCompletion.completion.inlineCompletion;
		inlineCompletion.source.provider.handlePartialAccept?.(
			inlineCompletion.source.inlineCompletions,
			inlineCompletion.sourceInlineCompletion,
			itemEdit.text.length,
			{
				kind: PartialAcceptTriggerKind.Suggest,
			}
		);
	}

	public extractReproSample(): Repro {
		const value = this.textModel.getValue();
		const item = this.state.get()?.inlineCompletion?.toInlineCompletion(undefined);
		return {
			documentValue: value,
			inlineCompletion: item?.sourceInlineCompletion,
		};
	}

	private _jumpedTo = observableValue(this, false);
	private _inAcceptFlow = observableValue(this, false);

	public jump(): void {
		const s = this.inlineEditState.get();
		if (!s) { return; }

		transaction(tx => {
			this._jumpedTo.set(true, tx);
			this.dontRefetchSignal.trigger(tx);
			this._editor.setPosition(s.inlineEdit.range.getStartPosition(), 'inlineCompletions.jump');
			this._editor.revealLine(s.inlineEdit.range.startLineNumber);
			this._editor.focus();
		});
	}

	public async handleInlineCompletionShown(inlineCompletion: InlineCompletionItem): Promise<void> {
		if (!inlineCompletion.shownCommand) {
			return;
		}
		if (inlineCompletion.didShow) {
			return;
		}
		inlineCompletion.markAsShown();
		await this._commandService.executeCommand(inlineCompletion.shownCommand.id, ...(inlineCompletion.shownCommand.arguments || []));
	}
}

interface Repro {
	documentValue: string;
	inlineCompletion: InlineCompletion | undefined;
}

export enum VersionIdChangeReason {
	Undo,
	Redo,
	AcceptWord,
	Other,
}

export function getSecondaryEdits(textModel: ITextModel, positions: readonly Position[], primaryEdit: SingleTextEdit): SingleTextEdit[] {
	if (positions.length === 1) {
		// No secondary cursor positions
		return [];
	}
	const primaryPosition = positions[0];
	const secondaryPositions = positions.slice(1);
	const primaryEditStartPosition = primaryEdit.range.getStartPosition();
	const primaryEditEndPosition = primaryEdit.range.getEndPosition();
	const replacedTextAfterPrimaryCursor = textModel.getValueInRange(
		Range.fromPositions(primaryPosition, primaryEditEndPosition)
	);
	const positionWithinTextEdit = subtractPositions(primaryPosition, primaryEditStartPosition);
	if (positionWithinTextEdit.lineNumber < 1) {
		onUnexpectedError(new BugIndicatingError(
			`positionWithinTextEdit line number should be bigger than 0.
			Invalid subtraction between ${primaryPosition.toString()} and ${primaryEditStartPosition.toString()}`
		));
		return [];
	}
	const secondaryEditText = substringPos(primaryEdit.text, positionWithinTextEdit);
	return secondaryPositions.map(pos => {
		const posEnd = addPositions(subtractPositions(pos, primaryEditStartPosition), primaryEditEndPosition);
		const textAfterSecondaryCursor = textModel.getValueInRange(
			Range.fromPositions(pos, posEnd)
		);
		const l = commonPrefixLength(replacedTextAfterPrimaryCursor, textAfterSecondaryCursor);
		const range = Range.fromPositions(pos, pos.delta(0, l));
		return new SingleTextEdit(range, secondaryEditText);
	});
}
