/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareUndefinedSmallest, numberComparator } from '../../../../../base/common/arrays.js';
import { findLastMax } from '../../../../../base/common/arraysFind.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { equalsIfDefined, itemEquals } from '../../../../../base/common/equals.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { matchesSubString } from '../../../../../base/common/filters.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, IObservableWithChange, IReader, ITransaction, derived, derivedHandleChanges, disposableObservableValue, observableValue, transaction } from '../../../../../base/common/observable.js';
import { commonPrefixLength, commonSuffixLength, splitLines } from '../../../../../base/common/strings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { applyEditsToRanges, OffsetEdit, SingleOffsetEdit } from '../../../../common/core/offsetEdit.js';
import { OffsetRange } from '../../../../common/core/offsetRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { SingleTextEdit, StringText } from '../../../../common/core/textEdit.js';
import { TextLength } from '../../../../common/core/textLength.js';
import { linesDiffComputers } from '../../../../common/diff/linesDiffComputers.js';
import { InlineCompletionContext, InlineCompletionTriggerKind } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { EndOfLinePreference, ITextModel } from '../../../../common/model.js';
import { OffsetEdits } from '../../../../common/model/textModelOffsetEdit.js';
import { IFeatureDebounceInformation } from '../../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { IModelContentChangedEvent } from '../../../../common/textModelEvents.js';
import { InlineCompletionItem, InlineCompletionProviderResult, provideInlineCompletions } from './provideInlineCompletions.js';
import { singleTextRemoveCommonPrefix } from './singleTextEditHelpers.js';
import { StructuredLogger, IRecordableEditorLogEntry, IRecordableLogEntry, formatRecordableLogEntry } from '../structuredLogger.js';

export class InlineCompletionsSource extends Disposable {
	private static _requestId = 0;

	private readonly _updateOperation = this._register(new MutableDisposable<UpdateOperation>());
	public readonly inlineCompletions = this._register(disposableObservableValue<UpToDateInlineCompletions | undefined>('inlineCompletions', undefined));
	public readonly suggestWidgetInlineCompletions = this._register(disposableObservableValue<UpToDateInlineCompletions | undefined>('suggestWidgetInlineCompletions', undefined));

	private readonly _loggingEnabled = observableConfigValue('editor.inlineSuggest.logFetch', false, this._configurationService).recomputeInitiallyAndOnChange(this._store);

	private readonly _structuredFetchLogger = this._register(this._instantiationService.createInstance(StructuredLogger.cast<
		{ kind: 'start'; requestId: number; context: unknown } & IRecordableEditorLogEntry
		| { kind: 'end'; error: any; durationMs: number; result: unknown; requestId: number } & IRecordableLogEntry
	>(),
		'editor.inlineSuggest.logFetch.commandId'
	));

	constructor(
		private readonly _textModel: ITextModel,
		private readonly _versionId: IObservableWithChange<number | null, IModelContentChangedEvent | undefined>,
		private readonly _debounceValue: IFeatureDebounceInformation,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this.clearOperationOnTextModelChange.recomputeInitiallyAndOnChange(this._store);
	}

	public readonly clearOperationOnTextModelChange = derived(this, reader => {
		this._versionId.read(reader);
		this._updateOperation.clear();
		return undefined; // always constant
	});

	private _log(entry:
		{ sourceId: string; kind: 'start'; requestId: number; context: unknown } & IRecordableEditorLogEntry
		| { sourceId: string; kind: 'end'; error: any; durationMs: number; result: unknown; requestId: number } & IRecordableLogEntry
	) {
		if (this._loggingEnabled.get()) {
			this._logService.info(formatRecordableLogEntry(entry));
		}
		this._structuredFetchLogger.log(entry);
	}

	private readonly _loadingCount = observableValue(this, 0);
	public readonly loading = this._loadingCount.map(this, v => v > 0);

	public fetch(position: Position, context: InlineCompletionContext, activeInlineCompletion: InlineCompletionWithUpdatedRange | undefined, withDebounce: boolean, userJumpedToActiveCompletion: IObservable<boolean>): Promise<boolean> {
		const request = new UpdateRequest(position, context, this._textModel.getVersionId());

		const target = context.selectedSuggestionInfo ? this.suggestWidgetInlineCompletions : this.inlineCompletions;

		if (this._updateOperation.value?.request.satisfies(request)) {
			return this._updateOperation.value.promise;
		} else if (target.get()?.request.satisfies(request)) {
			return Promise.resolve(true);
		}

		const updateOngoing = !!this._updateOperation.value;
		this._updateOperation.clear();

		const source = new CancellationTokenSource();

		const promise = (async () => {
			this._loadingCount.set(this._loadingCount.get() + 1, undefined);
			try {
				const recommendedDebounceValue = this._debounceValue.get(this._textModel);
				const debounceValue = findLastMax(
					this._languageFeaturesService.inlineCompletionsProvider.all(this._textModel).map(p => p.debounceDelayMs),
					compareUndefinedSmallest(numberComparator)
				) ?? recommendedDebounceValue;

				// Debounce in any case if update is ongoing
				const shouldDebounce = updateOngoing || (withDebounce && context.triggerKind === InlineCompletionTriggerKind.Automatic);
				if (shouldDebounce) {
					// This debounces the operation
					await wait(debounceValue, source.token);
				}

				if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
					return false;
				}

				const requestId = InlineCompletionsSource._requestId++;
				if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
					this._log({ sourceId: 'InlineCompletions.fetch', kind: 'start', requestId, modelUri: this._textModel.uri.toString(), modelVersion: this._textModel.getVersionId(), context: { triggerKind: context.triggerKind }, time: Date.now() });
				}

				const startTime = new Date();
				let updatedCompletions: InlineCompletionProviderResult | undefined = undefined;
				let error: any = undefined;
				try {
					updatedCompletions = await provideInlineCompletions(
						this._languageFeaturesService.inlineCompletionsProvider,
						position,
						this._textModel,
						context,
						source.token,
						this._languageConfigurationService
					);
				} catch (e) {
					error = e;
					throw e;
				} finally {
					if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
						if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
							error = 'canceled';
						}
						const result = updatedCompletions?.completions.map(c => ({
							range: c.range.toString(),
							text: c.insertText,
							isInlineEdit: !!c.isInlineEdit,
							source: c.source.provider.groupId,
						}));
						this._log({ sourceId: 'InlineCompletions.fetch', kind: 'end', requestId, durationMs: (Date.now() - startTime.getTime()), error, result, time: Date.now() });
					}
				}

				if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId || userJumpedToActiveCompletion.get() /* In the meantime the user showed interest for the active completion so dont hide it */) {
					updatedCompletions.dispose();
					return false;
				}

				// Reuse Inline Edit if possible
				if (activeInlineCompletion && activeInlineCompletion.isInlineEdit && activeInlineCompletion.updatedEditModelVersion === this._textModel.getVersionId() && (
					activeInlineCompletion.canBeReused(this._textModel, position)
					|| updatedCompletions.has(activeInlineCompletion.inlineCompletion) /* Inline Edit wins over completions if it's already been shown*/
					|| updatedCompletions.isEmpty() /* Incoming completion is empty, keep the current one alive */
				)) {
					activeInlineCompletion.reuse();
					updatedCompletions.dispose();
					return false;
				}

				const endTime = new Date();
				this._debounceValue.update(this._textModel, endTime.getTime() - startTime.getTime());

				// Reuse Inline Completion if possible
				const completions = new UpToDateInlineCompletions(updatedCompletions, request, this._textModel, this._versionId);
				if (activeInlineCompletion && !activeInlineCompletion.isInlineEdit && activeInlineCompletion.canBeReused(this._textModel, position)) {
					const asInlineCompletion = activeInlineCompletion.toInlineCompletion(undefined);
					if (!updatedCompletions.has(asInlineCompletion)) {
						completions.prepend(activeInlineCompletion.inlineCompletion, asInlineCompletion.range, true);
					}
				}

				this._updateOperation.clear();
				transaction(tx => {
					/** @description Update completions with provider result */
					target.set(completions, tx);
				});

			} finally {
				this._loadingCount.set(this._loadingCount.get() - 1, undefined);
			}

			return true;
		})();

		const updateOperation = new UpdateOperation(request, source, promise);
		this._updateOperation.value = updateOperation;

		return promise;
	}

	public clear(tx: ITransaction): void {
		this._updateOperation.clear();
		this.inlineCompletions.set(undefined, tx);
		this.suggestWidgetInlineCompletions.set(undefined, tx);
	}

	public clearSuggestWidgetInlineCompletions(tx: ITransaction): void {
		if (this._updateOperation.value?.request.context.selectedSuggestionInfo) {
			this._updateOperation.clear();
		}
		this.suggestWidgetInlineCompletions.set(undefined, tx);
	}

	public cancelUpdate(): void {
		this._updateOperation.clear();
	}
}

function wait(ms: number, cancellationToken?: CancellationToken): Promise<void> {
	return new Promise(resolve => {
		let d: IDisposable | undefined = undefined;
		const handle = setTimeout(() => {
			if (d) { d.dispose(); }
			resolve();
		}, ms);
		if (cancellationToken) {
			d = cancellationToken.onCancellationRequested(() => {
				clearTimeout(handle);
				if (d) { d.dispose(); }
				resolve();
			});
		}
	});
}

class UpdateRequest {
	constructor(
		public readonly position: Position,
		public readonly context: InlineCompletionContext,
		public readonly versionId: number,
	) {
	}

	public satisfies(other: UpdateRequest): boolean {
		return this.position.equals(other.position)
			&& equalsIfDefined(this.context.selectedSuggestionInfo, other.context.selectedSuggestionInfo, itemEquals())
			&& (other.context.triggerKind === InlineCompletionTriggerKind.Automatic
				|| this.context.triggerKind === InlineCompletionTriggerKind.Explicit)
			&& this.versionId === other.versionId;
	}

	public get isExplicitRequest() {
		return this.context.triggerKind === InlineCompletionTriggerKind.Explicit;
	}
}

class UpdateOperation implements IDisposable {
	constructor(
		public readonly request: UpdateRequest,
		public readonly cancellationTokenSource: CancellationTokenSource,
		public readonly promise: Promise<boolean>,
	) {
	}

	dispose() {
		this.cancellationTokenSource.cancel();
	}
}

export class UpToDateInlineCompletions implements IDisposable {
	private readonly _inlineCompletions: InlineCompletionWithUpdatedRange[];
	public get inlineCompletions(): ReadonlyArray<InlineCompletionWithUpdatedRange> { return this._inlineCompletions; }

	private _refCount = 1;
	private readonly _prependedInlineCompletionItems: InlineCompletionItem[] = [];

	constructor(
		private readonly inlineCompletionProviderResult: InlineCompletionProviderResult,
		public readonly request: UpdateRequest,
		private readonly _textModel: ITextModel,
		private readonly _versionId: IObservableWithChange<number | null, IModelContentChangedEvent | undefined>,
	) {
		this._inlineCompletions = inlineCompletionProviderResult.completions.map(
			completion => new InlineCompletionWithUpdatedRange(completion, undefined, this._textModel, this._versionId, this.request)
		);
	}

	public clone(): this {
		this._refCount++;
		return this;
	}

	public dispose(): void {
		this._refCount--;
		if (this._refCount === 0) {
			this.inlineCompletionProviderResult.dispose();
			for (const i of this._prependedInlineCompletionItems) {
				i.source.removeRef();
			}
			this._inlineCompletions.forEach(i => i.dispose());
		}
	}

	public prepend(inlineCompletion: InlineCompletionItem, range: Range, addRefToSource: boolean): void {
		if (addRefToSource) {
			inlineCompletion.source.addRef();
		}

		this._inlineCompletions.unshift(new InlineCompletionWithUpdatedRange(inlineCompletion, range, this._textModel, this._versionId, this.request));
		this._prependedInlineCompletionItems.push(inlineCompletion);
	}
}

export class InlineCompletionWithUpdatedRange extends Disposable {
	public readonly semanticId = JSON.stringify([
		this.inlineCompletion.filterText,
		this.inlineCompletion.insertText,
		this.inlineCompletion.range.getStartPosition().toString()
	]);

	public get forwardStable() {
		return this.source.inlineCompletions.enableForwardStability ?? false;
	}

	private readonly _updatedEditObj: UpdatedEdit; // helper as derivedHandleChanges can not access previous value
	public get updatedEdit(): IObservable<OffsetEdit | undefined> { return this._updatedEditObj.offsetEdit; }
	public get updatedEditModelVersion() { return this._updatedEditObj.modelVersion; }

	public get source() { return this.inlineCompletion.source; }
	public get sourceInlineCompletion() { return this.inlineCompletion.sourceInlineCompletion; }
	public get isInlineEdit() { return this.inlineCompletion.isInlineEdit; }

	constructor(
		public readonly inlineCompletion: InlineCompletionItem,
		updatedRange: Range | undefined,
		private readonly _textModel: ITextModel,
		private readonly _modelVersion: IObservableWithChange<number | null, IModelContentChangedEvent | undefined>,
		public readonly request: UpdateRequest,
	) {
		super();

		this._updatedEditObj = this._register(this._toUpdatedEdit(updatedRange ?? this.inlineCompletion.range, this.inlineCompletion.insertText));
	}

	public toInlineCompletion(reader: IReader | undefined): InlineCompletionItem {
		const singleTextEdit = this.toSingleTextEdit(reader);
		return this.inlineCompletion.withRangeInsertTextAndFilterText(singleTextEdit.range, singleTextEdit.text, singleTextEdit.text);
	}

	public toSingleTextEdit(reader: IReader | undefined): SingleTextEdit {
		this._modelVersion.read(reader);
		const offsetEdit = this.updatedEdit.read(reader);
		if (!offsetEdit) {
			return new SingleTextEdit(this._updatedRange.read(reader) ?? emptyRange, this.inlineCompletion.insertText);
		}

		const startOffset = offsetEdit.edits[0].replaceRange.start;
		const endOffset = offsetEdit.edits[offsetEdit.edits.length - 1].replaceRange.endExclusive;
		const overallOffsetRange = new OffsetRange(startOffset, endOffset);
		const overallLnColRange = Range.fromPositions(
			this._textModel.getPositionAt(overallOffsetRange.start),
			this._textModel.getPositionAt(overallOffsetRange.endExclusive)
		);
		let text = this._textModel.getValueInRange(overallLnColRange);
		for (let i = offsetEdit.edits.length - 1; i >= 0; i--) {
			const edit = offsetEdit.edits[i];
			const relativeStartOffset = edit.replaceRange.start - startOffset;
			const relativeEndOffset = edit.replaceRange.endExclusive - startOffset;
			text = text.substring(0, relativeStartOffset) + edit.newText + text.substring(relativeEndOffset);
		}
		return new SingleTextEdit(overallLnColRange, text);
	}

	public isVisible(model: ITextModel, cursorPosition: Position, reader: IReader | undefined): boolean {
		const minimizedReplacement = singleTextRemoveCommonPrefix(this.toSingleTextEdit(reader), model);
		const updatedRange = this._updatedRange.read(reader);
		if (
			!updatedRange
			|| !this.inlineCompletion.range.getStartPosition().equals(updatedRange.getStartPosition())
			|| cursorPosition.lineNumber !== minimizedReplacement.range.startLineNumber
			|| minimizedReplacement.isEmpty // if the completion is empty after removing the common prefix of the completion and the model, the completion item would not be visible
		) {
			return false;
		}

		// We might consider comparing by .toLowerText, but this requires GhostTextReplacement
		const originalValue = model.getValueInRange(minimizedReplacement.range, EndOfLinePreference.LF);
		const filterText = minimizedReplacement.text;

		const cursorPosIndex = Math.max(0, cursorPosition.column - minimizedReplacement.range.startColumn);

		let filterTextBefore = filterText.substring(0, cursorPosIndex);
		let filterTextAfter = filterText.substring(cursorPosIndex);

		let originalValueBefore = originalValue.substring(0, cursorPosIndex);
		let originalValueAfter = originalValue.substring(cursorPosIndex);

		const originalValueIndent = model.getLineIndentColumn(minimizedReplacement.range.startLineNumber);
		if (minimizedReplacement.range.startColumn <= originalValueIndent) {
			// Remove indentation
			originalValueBefore = originalValueBefore.trimStart();
			if (originalValueBefore.length === 0) {
				originalValueAfter = originalValueAfter.trimStart();
			}
			filterTextBefore = filterTextBefore.trimStart();
			if (filterTextBefore.length === 0) {
				filterTextAfter = filterTextAfter.trimStart();
			}
		}

		return filterTextBefore.startsWith(originalValueBefore)
			&& !!matchesSubString(originalValueAfter, filterTextAfter);
	}

	public reuse(): void {
		this._updatedEditObj.reuse();
	}

	public canBeReused(model: ITextModel, position: Position): boolean {
		if (!this.updatedEdit.get()) {
			return false;
		}

		if (this.sourceInlineCompletion.isInlineEdit) {
			return this._updatedEditObj.lastChangePartOfInlineEdit;
		}

		const updatedRange = this._updatedRange.read(undefined);
		const result = !!updatedRange
			&& updatedRange.containsPosition(position)
			&& this.isVisible(model, position, undefined)
			&& TextLength.ofRange(updatedRange).isGreaterThanOrEqualTo(TextLength.ofRange(this.inlineCompletion.range));
		return result;
	}

	private readonly _updatedRange = derived(reader => {
		const edit = this.updatedEdit.read(reader);
		if (!edit || edit.edits.length === 0) {
			return undefined;
		}

		return Range.fromPositions(
			this._textModel.getPositionAt(edit.edits[0].replaceRange.start),
			this._textModel.getPositionAt(edit.edits[edit.edits.length - 1].replaceRange.endExclusive)
		);
	});

	private _toUpdatedEdit(editRange: Range, replaceText: string): UpdatedEdit {
		return this.isInlineEdit
			? this._toInlineEditEdit(editRange, replaceText)
			: this._toInlineCompletionEdit(editRange, replaceText);
	}

	private _toInlineCompletionEdit(editRange: Range, replaceText: string): UpdatedEdit {
		const startOffset = this._textModel.getOffsetAt(editRange.getStartPosition());
		const endOffset = this._textModel.getOffsetAt(editRange.getEndPosition());
		const originalRange = OffsetRange.ofStartAndLength(startOffset, endOffset - startOffset);
		const offsetEdit = new OffsetEdit([new SingleOffsetEdit(originalRange, replaceText)]);
		return new UpdatedEdit(offsetEdit, this._textModel, this._modelVersion, false);
	}

	private _toInlineEditEdit(editRange: Range, replaceText: string): UpdatedEdit {
		const eol = this._textModel.getEOL();
		const editOriginalText = this._textModel.getValueInRange(editRange);
		const editReplaceText = replaceText.replace(/\r\n|\r|\n/g, eol);

		const diffAlgorithm = linesDiffComputers.getDefault();
		const lineDiffs = diffAlgorithm.computeDiff(
			splitLines(editOriginalText),
			splitLines(editReplaceText),
			{
				ignoreTrimWhitespace: false,
				computeMoves: false,
				extendToSubwords: true,
				maxComputationTimeMs: 500,
			}
		);

		const innerChanges = lineDiffs.changes.flatMap(c => c.innerChanges ?? []);

		function addRangeToPos(pos: Position, range: Range): Range {
			const start = TextLength.fromPosition(range.getStartPosition());
			return TextLength.ofRange(range).createRange(start.addToPosition(pos));
		}

		const modifiedText = new StringText(editReplaceText);

		const offsetEdit = new OffsetEdit(
			innerChanges.map(c => {
				const range = addRangeToPos(editRange.getStartPosition(), c.originalRange);
				const startOffset = this._textModel.getOffsetAt(range.getStartPosition());
				const endOffset = this._textModel.getOffsetAt(range.getEndPosition());
				const originalRange = OffsetRange.ofStartAndLength(startOffset, endOffset - startOffset);

				const replaceText = modifiedText.getValueOfRange(c.modifiedRange);
				const originalText = this._textModel.getValueInRange(range);
				const edit = new SingleOffsetEdit(originalRange, replaceText);

				return reshapeEdit(edit, originalText, innerChanges.length, this._textModel);
			})
		);

		return new UpdatedEdit(offsetEdit, this._textModel, this._modelVersion, true);
	}
}

class UpdatedEdit extends Disposable {

	private _innerEdits: SingleUpdatedEdit[];

	private _inlineEditModelVersion: number;
	public get modelVersion() { return this._inlineEditModelVersion; }

	private _lastChangePartOfInlineEdit = false;
	public get lastChangePartOfInlineEdit() { return this._lastChangePartOfInlineEdit; }

	protected readonly _updatedEdit = derivedHandleChanges<OffsetEdit | undefined | null, OffsetEdit[]>({
		owner: this,
		equalityComparer: equalsIfDefined((a, b) => a?.equals(b)),
		createEmptyChangeSummary: () => [] as OffsetEdit[],
		handleChange: (context, changeSummary) => {
			if (context.didChange(this._modelVersion) && context.change) {
				changeSummary.push(OffsetEdits.fromContentChanges(context.change.changes));
			}
			return true;
		}
	}, (reader, changeSummary) => {
		this._modelVersion.read(reader);

		for (const change of changeSummary) {
			this._innerEdits = this._applyTextModelChanges(change, this._innerEdits);
		}

		if (this._innerEdits.length === 0) {
			return undefined;
		}

		if (this._innerEdits.some(e => e.edit === undefined)) {
			throw new BugIndicatingError('UpdatedEdit: Invalid state');
		}

		return new OffsetEdit(this._innerEdits.map(edit => edit.edit!));
	});

	public get offsetEdit(): IObservable<OffsetEdit | undefined> { return this._updatedEdit.map(e => e ?? undefined); }

	constructor(
		offsetEdit: OffsetEdit,
		private readonly _textModel: ITextModel,
		private readonly _modelVersion: IObservableWithChange<number | null, IModelContentChangedEvent | undefined>,
		isInlineEdit: boolean,
	) {
		super();

		this._inlineEditModelVersion = this._modelVersion.get() ?? -1;

		this._innerEdits = offsetEdit.edits.map(edit => {
			if (isInlineEdit) {
				const replacedRange = Range.fromPositions(this._textModel.getPositionAt(edit.replaceRange.start), this._textModel.getPositionAt(edit.replaceRange.endExclusive));
				const replacedText = this._textModel.getValueInRange(replacedRange);
				return new SingleUpdatedNextEdit(edit, replacedText);
			}

			return new SingleUpdatedCompletion(edit);
		});

		this._updatedEdit.recomputeInitiallyAndOnChange(this._store); // make sure to call this after setting `_lastEdit`
	}

	private _applyTextModelChanges(textModelChanges: OffsetEdit, edits: SingleUpdatedEdit[]): SingleUpdatedEdit[] {
		for (const innerEdit of edits) {
			innerEdit.applyTextModelChanges(textModelChanges);
		}

		if (edits.some(edit => edit.edit === undefined)) {
			return []; // change is invalid, so we will have to drop the completion
		}

		const currentModelVersion = this._modelVersion.get();

		this._lastChangePartOfInlineEdit = edits.some(edit => edit.lastChangeUpdatedEdit);
		if (this._lastChangePartOfInlineEdit) {
			this._inlineEditModelVersion = currentModelVersion ?? -1;
		}

		if (currentModelVersion === null || this._inlineEditModelVersion + 20 < currentModelVersion) {
			return []; // the completion has been ignored for a while, remove it
		}

		edits = edits.filter(innerEdit => !innerEdit.edit!.isEmpty);
		if (edits.length === 0) {
			return []; // the completion has been typed by the user
		}

		return edits;
	}

	reuse(): void {
		this._inlineEditModelVersion = this._modelVersion.get() ?? -1;
	}
}

abstract class SingleUpdatedEdit {

	private _edit: SingleOffsetEdit | undefined;
	public get edit() { return this._edit; }

	private _lastChangeUpdatedEdit = false;
	public get lastChangeUpdatedEdit() { return this._lastChangeUpdatedEdit; }

	constructor(
		edit: SingleOffsetEdit,
	) {
		this._edit = edit;
	}

	public applyTextModelChanges(textModelChanges: OffsetEdit) {
		this._lastChangeUpdatedEdit = false;

		if (!this._edit) {
			throw new BugIndicatingError('UpdatedInnerEdits: No edit to apply changes to');
		}

		const result = this.applyChanges(this._edit, textModelChanges);
		if (!result) {
			this._edit = undefined;
			return;
		}

		this._edit = result.edit;
		this._lastChangeUpdatedEdit = result.editHasChanged;
	}

	protected abstract applyChanges(edit: SingleOffsetEdit, textModelChanges: OffsetEdit): { edit: SingleOffsetEdit; editHasChanged: boolean } | undefined;
}

class SingleUpdatedCompletion extends SingleUpdatedEdit {

	constructor(
		edit: SingleOffsetEdit,
	) {
		super(edit);
	}

	protected applyChanges(edit: SingleOffsetEdit, textModelChanges: OffsetEdit): { edit: SingleOffsetEdit; editHasChanged: boolean } {
		const newEditRange = applyEditsToRanges([edit.replaceRange], textModelChanges)[0];
		return { edit: new SingleOffsetEdit(newEditRange, edit.newText), editHasChanged: !newEditRange.equals(edit.replaceRange) };
	}
}

class SingleUpdatedNextEdit extends SingleUpdatedEdit {

	private _trimmedNewText: string;
	private _prefixLength: number;
	private _suffixLength: number;

	constructor(
		edit: SingleOffsetEdit,
		replacedText: string,
	) {
		super(edit);

		this._prefixLength = commonPrefixLength(edit.newText, replacedText);
		this._suffixLength = commonSuffixLength(edit.newText, replacedText);
		this._trimmedNewText = edit.newText.substring(this._prefixLength, edit.newText.length - this._suffixLength);
	}

	protected applyChanges(edit: SingleOffsetEdit, textModelChanges: OffsetEdit): { edit: SingleOffsetEdit; editHasChanged: boolean } | undefined {
		let editStart = edit.replaceRange.start;
		let editEnd = edit.replaceRange.endExclusive;
		let editReplaceText = edit.newText;
		let editHasChanged = false;

		const shouldPreserveEditShape = this._prefixLength > 0 || this._suffixLength > 0;

		for (let i = textModelChanges.edits.length - 1; i >= 0; i--) {
			const change = textModelChanges.edits[i];

			// INSERTIONS (only support inserting at start of edit)
			const isInsertion = change.newText.length > 0 && change.replaceRange.isEmpty;

			if (isInsertion && !shouldPreserveEditShape && change.replaceRange.start === editStart && editReplaceText.startsWith(change.newText)) {
				editStart += change.newText.length;
				editReplaceText = editReplaceText.substring(change.newText.length);
				editEnd = Math.max(editStart, editEnd);
				editHasChanged = true;
				continue;
			}

			if (isInsertion && shouldPreserveEditShape && change.replaceRange.start === editStart + this._prefixLength && this._trimmedNewText.startsWith(change.newText)) {
				editEnd += change.newText.length;
				editHasChanged = true;
				this._prefixLength += change.newText.length;
				this._trimmedNewText = this._trimmedNewText.substring(change.newText.length);
				continue;
			}

			// DELETIONS
			const isDeletion = change.newText.length === 0 && change.replaceRange.length > 0;
			if (isDeletion && change.replaceRange.start >= editStart + this._prefixLength && change.replaceRange.endExclusive <= editEnd - this._suffixLength) {
				// user deleted text IN-BETWEEN the deletion range
				editEnd -= change.replaceRange.length;
				editHasChanged = true;
				continue;
			}

			// user did exactly the edit
			if (change.equals(edit)) {
				editHasChanged = true;
				editStart = change.replaceRange.endExclusive;
				editReplaceText = '';
				continue;
			}

			// MOVE EDIT
			if (change.replaceRange.start > editEnd) {
				// the change happens after the completion range
				continue;
			}
			if (change.replaceRange.endExclusive < editStart) {
				// the change happens before the completion range
				editStart += change.newText.length - change.replaceRange.length;
				editEnd += change.newText.length - change.replaceRange.length;
				continue;
			}

			// The change intersects the completion, so we will have to drop the completion
			return undefined;
		}

		// the resulting edit is a noop as the original and new text are the same
		if (this._trimmedNewText.length === 0 && editStart + this._prefixLength === editEnd - this._suffixLength) {
			return { edit: new SingleOffsetEdit(new OffsetRange(editStart + this._prefixLength, editStart + this._prefixLength), ''), editHasChanged: true };
		}

		return { edit: new SingleOffsetEdit(new OffsetRange(editStart, editEnd), editReplaceText), editHasChanged };
	}
}

const emptyRange = new Range(1, 1, 1, 1);

function reshapeEdit(edit: SingleOffsetEdit, originalText: string, totalInnerEdits: number, textModel: ITextModel): SingleOffsetEdit {
	// TODO: EOL are not properly trimmed by the diffAlgorithm #12680
	const eol = textModel.getEOL();
	if (edit.newText.endsWith(eol) && originalText.endsWith(eol)) {
		edit = new SingleOffsetEdit(edit.replaceRange.deltaEnd(-eol.length), edit.newText.slice(0, -eol.length));
	}

	// INSERTION
	// If the insertion ends with a new line and is inserted at the start of a line which has text,
	// we move the insertion to the end of the previous line if possible
	if (totalInnerEdits === 1 && edit.replaceRange.isEmpty && edit.newText.includes(eol)) {
		edit = reshapeMultiLineInsertion(edit, textModel);
	}

	// The diff algorithm extended a simple edit to the entire word
	// shrink it back to a simple edit if it is deletion/insertion only
	if (totalInnerEdits === 1) {
		const prefixLength = commonPrefixLength(originalText, edit.newText);
		const suffixLength = commonSuffixLength(originalText.slice(prefixLength), edit.newText.slice(prefixLength));

		// reshape it back to an insertion
		if (prefixLength + suffixLength === originalText.length) {
			return new SingleOffsetEdit(edit.replaceRange.deltaStart(prefixLength).deltaEnd(-suffixLength), edit.newText.substring(prefixLength, edit.newText.length - suffixLength));
		}

		// reshape it back to a deletion
		if (prefixLength + suffixLength === edit.newText.length) {
			return new SingleOffsetEdit(edit.replaceRange.deltaStart(prefixLength).deltaEnd(-suffixLength), '');
		}
	}

	return edit;
}

function reshapeMultiLineInsertion(edit: SingleOffsetEdit, textModel: ITextModel): SingleOffsetEdit {
	if (!edit.replaceRange.isEmpty) {
		throw new BugIndicatingError('Unexpected original range');
	}

	if (edit.replaceRange.start === 0) {
		return edit;
	}

	const eol = textModel.getEOL();
	const startPosition = textModel.getPositionAt(edit.replaceRange.start);
	const startColumn = startPosition.column;
	const startLineNumber = startPosition.lineNumber;

	// If the insertion ends with a new line and is inserted at the start of a line which has text,
	// we move the insertion to the end of the previous line if possible
	if (startColumn === 1 && startLineNumber > 1 && textModel.getLineLength(startLineNumber) !== 0 && edit.newText.endsWith(eol) && !edit.newText.startsWith(eol)) {
		return new SingleOffsetEdit(edit.replaceRange.delta(-1), eol + edit.newText.slice(0, -eol.length));
	}

	return edit;
}
