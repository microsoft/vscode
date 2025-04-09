/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { matchesSubString } from '../../../../../base/common/filters.js';
import { observableSignal, IObservable } from '../../../../../base/common/observable.js';
import { commonPrefixLength, commonSuffixLength, splitLines } from '../../../../../base/common/strings.js';
import { ISingleEditOperation } from '../../../../common/core/editOperation.js';
import { applyEditsToRanges, OffsetEdit, SingleOffsetEdit } from '../../../../common/core/offsetEdit.js';
import { OffsetRange } from '../../../../common/core/offsetRange.js';
import { Position } from '../../../../common/core/position.js';
import { getPositionOffsetTransformerFromTextModel } from '../../../../common/core/positionToOffset.js';
import { Range } from '../../../../common/core/range.js';
import { SingleTextEdit, StringText, TextEdit } from '../../../../common/core/textEdit.js';
import { TextLength } from '../../../../common/core/textLength.js';
import { linesDiffComputers } from '../../../../common/diff/linesDiffComputers.js';
import { InlineCompletions, InlineCompletionsProvider, InlineCompletion, InlineCompletionContext, InlineCompletionTriggerKind, Command, InlineCompletionWarning } from '../../../../common/languages.js';
import { ITextModel, EndOfLinePreference } from '../../../../common/model.js';
import { TextModelText } from '../../../../common/model/textModelText.js';
import { singleTextRemoveCommonPrefix } from './singleTextEditHelpers.js';

export type InlineSuggestionItem = InlineEditItem | InlineCompletionItem;

abstract class InlineSuggestionItemBase {
	public didShow = false;

	constructor(
		/**
		 * A reference to the original inline completion this inline completion has been constructed from.
		 * Used for event data to ensure referential equality.
		*/
		protected readonly _sourceInlineCompletion: InlineCompletion,

		/**
		 * A reference to the original inline completion list this inline completion has been constructed from.
		 * Used for event data to ensure referential equality.
		*/
		readonly source: InlineSuggestionList,

		public readonly identity: InlineSuggestionIdentity,
		protected readonly _context: InlineCompletionContext,
	) { }

	abstract getSingleTextEdit(): SingleTextEdit;

	abstract withEdit(userEdit: OffsetEdit, textModel: ITextModel): InlineSuggestionItem | undefined;

	abstract withIdentity(identity: InlineSuggestionIdentity): InlineSuggestionItem;

	public get isFromExplicitRequest(): boolean { return this._context.triggerKind === InlineCompletionTriggerKind.Explicit; }
	public get forwardStable(): boolean { return this.source.inlineSuggestions.enableForwardStability ?? false; }
	public get range(): Range { return this.getSingleTextEdit().range; }
	public get insertText(): string { return this.getSingleTextEdit().text; }
	public get semanticId(): string { return this.hash; }
	/** @deprecated */
	public get shownCommand(): Command | undefined { return this._sourceInlineCompletion.shownCommand; }

	get action(): Command | undefined { return this._sourceInlineCompletion.action; }
	get command(): Command | undefined { return this._sourceInlineCompletion.command; }
	get warning(): InlineCompletionWarning | undefined { return this._sourceInlineCompletion.warning; }
	get showInlineEditMenu(): boolean { return !!this._sourceInlineCompletion.showInlineEditMenu; }

	public get hash() {
		return JSON.stringify([
			this.getSingleTextEdit().text,
			this.getSingleTextEdit().range.getStartPosition().toString()
		]);
	}

	public abstract canBeReused(model: ITextModel, position: Position): boolean;

	addRef(): void {
		this.identity.addRef();
		this.source.addRef();
	}

	removeRef(): void {
		this.identity.removeRef();
		this.source.removeRef();
	}

	getSourceCompletion(): InlineCompletion {
		return this._sourceInlineCompletion;
	}
}

export interface SnippetInfo {
	snippet: string;
	/* Could be different than the main range */
	range: Range;
}

export class InlineSuggestionIdentity {
	private static idCounter = 0;
	private readonly _onDispose = observableSignal(this);
	public readonly onDispose: IObservable<void> = this._onDispose;

	private _refCount = 1;
	public readonly id = 'InlineCompletionIdentity' + InlineSuggestionIdentity.idCounter++;

	addRef() {
		this._refCount++;
	}

	removeRef() {
		this._refCount--;
		if (this._refCount === 0) {
			this._onDispose.trigger(undefined);
		}
	}
}

/**
 * A ref counted pointer to the computed `InlineCompletions` and the `InlineCompletionsProvider` that
 * computed them.
 */
export class InlineSuggestionList {
	private refCount = 1;
	constructor(
		public readonly inlineSuggestions: InlineCompletions,
		public readonly provider: InlineCompletionsProvider
	) { }

	addRef(): void {
		this.refCount++;
	}

	removeRef(): void {
		this.refCount--;
		if (this.refCount === 0) {
			this.provider.freeInlineCompletions(this.inlineSuggestions);
		}
	}
}

export class InlineCompletionItem extends InlineSuggestionItemBase {
	public static create(
		range: Range,
		insertText: string,
		snippetInfo: SnippetInfo | undefined,
		additionalTextEdits: readonly ISingleEditOperation[],

		sourceInlineCompletion: InlineCompletion,
		source: InlineSuggestionList,

		context: InlineCompletionContext,
		textModel: ITextModel,
	): InlineCompletionItem {
		const identity = new InlineSuggestionIdentity();
		const textEdit = new SingleTextEdit(range, insertText);
		const edit = getPositionOffsetTransformerFromTextModel(textModel).getSingleOffsetEdit(textEdit);

		return new InlineCompletionItem(edit, textEdit, range, snippetInfo, additionalTextEdits, sourceInlineCompletion, source, identity, context);
	}

	public readonly isInlineEdit = false;

	private constructor(
		private readonly _edit: SingleOffsetEdit,
		private readonly _textEdit: SingleTextEdit,
		private readonly _originalRange: Range,
		public readonly snippetInfo: SnippetInfo | undefined,
		public readonly additionalTextEdits: readonly ISingleEditOperation[],


		sourceInlineCompletion: InlineCompletion,

		source: InlineSuggestionList,

		identity: InlineSuggestionIdentity,
		_context: InlineCompletionContext
	) {
		super(sourceInlineCompletion, source, identity, _context);
	}

	override getSingleTextEdit(): SingleTextEdit { return this._textEdit; }

	override withIdentity(identity: InlineSuggestionIdentity): InlineCompletionItem {
		return new InlineCompletionItem(
			this._edit,
			this._textEdit,
			this._originalRange,
			this.snippetInfo,
			this.additionalTextEdits,
			this._sourceInlineCompletion,
			this.source,
			identity,
			this._context
		);
	}

	override withEdit(textModelEdit: OffsetEdit, textModel: ITextModel): InlineCompletionItem | undefined {
		const newEditRange = applyEditsToRanges([this._edit.replaceRange], textModelEdit);
		if (newEditRange.length === 0) {
			return undefined;
		}
		const newEdit = new SingleOffsetEdit(newEditRange[0], this._textEdit.text);
		const newTextEdit = getPositionOffsetTransformerFromTextModel(textModel).getSingleTextEdit(newEdit);
		return new InlineCompletionItem(
			newEdit,
			newTextEdit,
			this._originalRange,
			this.snippetInfo,
			this.additionalTextEdits,
			this._sourceInlineCompletion,
			this.source,
			this.identity,
			this._context
		);
	}

	override canBeReused(model: ITextModel, position: Position): boolean {
		// TODO@hediet I believe this can be simplified to `return true;`, as applying an edit should kick out this suggestion.
		const updatedRange = this._textEdit.range;
		const result = !!updatedRange
			&& updatedRange.containsPosition(position)
			&& this.isVisible(model, position)
			&& TextLength.ofRange(updatedRange).isGreaterThanOrEqualTo(TextLength.ofRange(this._originalRange));
		return result;
	}

	public isVisible(model: ITextModel, cursorPosition: Position): boolean {
		const minimizedReplacement = singleTextRemoveCommonPrefix(this.getSingleTextEdit(), model);
		if (!this.range
			|| !this._originalRange.getStartPosition().equals(this.range.getStartPosition())
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
}

export class InlineEditItem extends InlineSuggestionItemBase {
	public static create(
		range: Range,
		insertText: string,

		sourceInlineCompletion: InlineCompletion,
		source: InlineSuggestionList,

		context: InlineCompletionContext,
		textModel: ITextModel,
	): InlineEditItem {
		const offsetEdit = getOffsetEdit(textModel, range, insertText);
		const text = new TextModelText(textModel);
		const textEdit = TextEdit.fromOffsetEdit(offsetEdit, text);
		const singleTextEdit = textEdit.toSingle(text);
		const identity = new InlineSuggestionIdentity();

		const edits = offsetEdit.edits.map(edit => {
			const replacedRange = Range.fromPositions(textModel.getPositionAt(edit.replaceRange.start), textModel.getPositionAt(edit.replaceRange.endExclusive));
			const replacedText = textModel.getValueInRange(replacedRange);
			return SingleUpdatedNextEdit.create(edit, replacedText);
		});
		return new InlineEditItem(offsetEdit, singleTextEdit, sourceInlineCompletion, source, identity, context, edits, false, textModel.getVersionId());
	}

	public readonly snippetInfo: SnippetInfo | undefined = undefined;
	public readonly additionalTextEdits: readonly ISingleEditOperation[] = [];
	public readonly isInlineEdit = true;

	private constructor(
		private readonly _edit: OffsetEdit,
		private readonly _textEdit: SingleTextEdit,

		sourceInlineCompletion: InlineCompletion,

		source: InlineSuggestionList,

		identity: InlineSuggestionIdentity,
		_context: InlineCompletionContext,
		private readonly _edits: readonly SingleUpdatedNextEdit[],
		private readonly _lastChangePartOfInlineEdit = false,
		private readonly _inlineEditModelVersion: number,
	) {
		super(sourceInlineCompletion, source, identity, _context);
	}

	public get updatedEditModelVersion(): number { return this._inlineEditModelVersion; }
	public get updatedEdit(): OffsetEdit { return this._edit; }

	override getSingleTextEdit(): SingleTextEdit {
		return this._textEdit;
	}

	override withIdentity(identity: InlineSuggestionIdentity): InlineEditItem {
		return new InlineEditItem(
			this._edit,
			this._textEdit,
			this._sourceInlineCompletion,
			this.source,
			identity,
			this._context,
			this._edits,
			this._lastChangePartOfInlineEdit,
			this._inlineEditModelVersion
		);
	}

	override canBeReused(model: ITextModel, position: Position): boolean {
		// TODO@hediet I believe this can be simplified to `return true;`, as applying an edit should kick out this suggestion.
		return this._lastChangePartOfInlineEdit && this.updatedEditModelVersion === model.getVersionId();
	}

	override withEdit(textModelChanges: OffsetEdit, textModel: ITextModel): InlineEditItem | undefined {
		const edit = this._applyTextModelChanges(textModelChanges, this._edits, textModel);
		return edit;
	}

	private _applyTextModelChanges(textModelChanges: OffsetEdit, edits: readonly SingleUpdatedNextEdit[], textModel: ITextModel): InlineEditItem | undefined {
		edits = edits.map(innerEdit => innerEdit.applyTextModelChanges(textModelChanges));

		if (edits.some(edit => edit.edit === undefined)) {
			return undefined; // change is invalid, so we will have to drop the completion
		}

		const newTextModelVersion = textModel.getVersionId();

		let inlineEditModelVersion = this._inlineEditModelVersion;
		const lastChangePartOfInlineEdit = edits.some(edit => edit.lastChangeUpdatedEdit);
		if (lastChangePartOfInlineEdit) {
			inlineEditModelVersion = newTextModelVersion ?? -1;
		}

		if (newTextModelVersion === null || inlineEditModelVersion + 20 < newTextModelVersion) {
			return undefined; // the completion has been ignored for a while, remove it
		}

		edits = edits.filter(innerEdit => !innerEdit.edit!.isEmpty);
		if (edits.length === 0) {
			return undefined; // the completion has been typed by the user
		}

		const edit = new OffsetEdit(edits.map(edit => edit.edit!));

		const textEdit = getPositionOffsetTransformerFromTextModel(textModel).getTextEdit(edit).toSingle(new TextModelText(textModel));

		return new InlineEditItem(
			edit,
			textEdit,
			this._sourceInlineCompletion,
			this.source,
			this.identity,
			this._context,
			edits,
			lastChangePartOfInlineEdit,
			inlineEditModelVersion,
		);
	}
}

function getOffsetEdit(textModel: ITextModel, editRange: Range, replaceText: string): OffsetEdit {
	const eol = textModel.getEOL();
	const editOriginalText = textModel.getValueInRange(editRange);
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
			const rangeInModel = addRangeToPos(editRange.getStartPosition(), c.originalRange);
			const originalRange = getPositionOffsetTransformerFromTextModel(textModel).getOffsetRange(rangeInModel);

			const replaceText = modifiedText.getValueOfRange(c.modifiedRange);
			const edit = new SingleOffsetEdit(originalRange, replaceText);

			const originalText = textModel.getValueInRange(rangeInModel);
			return reshapeEdit(edit, originalText, innerChanges.length, textModel);
		})
	);

	return offsetEdit;
}

class SingleUpdatedNextEdit {
	public static create(
		edit: SingleOffsetEdit,
		replacedText: string,
	): SingleUpdatedNextEdit {
		const prefixLength = commonPrefixLength(edit.newText, replacedText);
		const suffixLength = commonSuffixLength(edit.newText, replacedText);
		const trimmedNewText = edit.newText.substring(prefixLength, edit.newText.length - suffixLength);
		return new SingleUpdatedNextEdit(edit, trimmedNewText, prefixLength, suffixLength);
	}

	public get edit() { return this._edit; }
	public get lastChangeUpdatedEdit() { return this._lastChangeUpdatedEdit; }

	constructor(
		private _edit: SingleOffsetEdit | undefined,
		private _trimmedNewText: string,
		private _prefixLength: number,
		private _suffixLength: number,
		private _lastChangeUpdatedEdit: boolean = false,
	) {
	}

	public applyTextModelChanges(textModelChanges: OffsetEdit) {
		const c = this._clone();
		c._applyTextModelChanges(textModelChanges);
		return c;
	}

	private _clone(): SingleUpdatedNextEdit {
		return new SingleUpdatedNextEdit(
			this._edit,
			this._trimmedNewText,
			this._prefixLength,
			this._suffixLength,
			this._lastChangeUpdatedEdit,
		);
	}

	private _applyTextModelChanges(textModelChanges: OffsetEdit) {
		this._lastChangeUpdatedEdit = false;

		if (!this._edit) {
			throw new BugIndicatingError('UpdatedInnerEdits: No edit to apply changes to');
		}

		const result = this._applyChanges(this._edit, textModelChanges);
		if (!result) {
			this._edit = undefined;
			return;
		}

		this._edit = result.edit;
		this._lastChangeUpdatedEdit = result.editHasChanged;
	}

	private _applyChanges(edit: SingleOffsetEdit, textModelChanges: OffsetEdit): { edit: SingleOffsetEdit; editHasChanged: boolean } | undefined {
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
