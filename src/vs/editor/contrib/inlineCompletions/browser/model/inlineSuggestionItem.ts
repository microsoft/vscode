/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { matchesSubString } from '../../../../../base/common/filters.js';
import { IObservable, ITransaction, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import { commonPrefixLength, commonSuffixLength, splitLines } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ISingleEditOperation } from '../../../../common/core/editOperation.js';
import { applyEditsToRanges, StringEdit, StringReplacement } from '../../../../common/core/edits/stringEdit.js';
import { TextEdit, TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { StringText } from '../../../../common/core/text/abstractText.js';
import { getPositionOffsetTransformerFromTextModel } from '../../../../common/core/text/getPositionOffsetTransformerFromTextModel.js';
import { PositionOffsetTransformerBase } from '../../../../common/core/text/positionToOffset.js';
import { TextLength } from '../../../../common/core/text/textLength.js';
import { linesDiffComputers } from '../../../../common/diff/linesDiffComputers.js';
import { Command, InlineCompletion, InlineCompletionHintStyle, InlineCompletionEndOfLifeReason, InlineCompletionTriggerKind, InlineCompletionWarning, PartialAcceptInfo, InlineCompletionHint } from '../../../../common/languages.js';
import { EndOfLinePreference, ITextModel } from '../../../../common/model.js';
import { TextModelText } from '../../../../common/model/textModelText.js';
import { InlineCompletionViewData, InlineCompletionViewKind } from '../view/inlineEdits/inlineEditsViewInterface.js';
import { InlineSuggestData, InlineSuggestionList, PartialAcceptance, SnippetInfo } from './provideInlineCompletions.js';
import { singleTextRemoveCommonPrefix } from './singleTextEditHelpers.js';

export type InlineSuggestionItem = InlineEditItem | InlineCompletionItem;

export namespace InlineSuggestionItem {
	export function create(
		data: InlineSuggestData,
		textModel: ITextModel,
	): InlineSuggestionItem {
		if (!data.isInlineEdit && !data.uri) {
			return InlineCompletionItem.create(data, textModel);
		} else {
			return InlineEditItem.create(data, textModel);
		}
	}
}

abstract class InlineSuggestionItemBase {
	constructor(
		protected readonly _data: InlineSuggestData,
		public readonly identity: InlineSuggestionIdentity,
		public readonly hint: InlineSuggestHint | undefined
	) { }

	/**
	 * A reference to the original inline completion list this inline completion has been constructed from.
	 * Used for event data to ensure referential equality.
	*/
	public get source(): InlineSuggestionList { return this._data.source; }

	public get isFromExplicitRequest(): boolean { return this._data.context.triggerKind === InlineCompletionTriggerKind.Explicit; }
	public get forwardStable(): boolean { return this.source.inlineSuggestions.enableForwardStability ?? false; }
	public get editRange(): Range { return this.getSingleTextEdit().range; }
	public get targetRange(): Range { return this.hint?.range && !this.hint.jumpToEdit ? this.hint?.range : this.editRange; }
	public get insertText(): string { return this.getSingleTextEdit().text; }
	public get semanticId(): string { return this.hash; }
	public get action(): Command | undefined { return this._sourceInlineCompletion.gutterMenuLinkAction; }
	public get command(): Command | undefined { return this._sourceInlineCompletion.command; }
	public get warning(): InlineCompletionWarning | undefined { return this._sourceInlineCompletion.warning; }
	public get showInlineEditMenu(): boolean { return !!this._sourceInlineCompletion.showInlineEditMenu; }
	public get hash() {
		return JSON.stringify([
			this.getSingleTextEdit().text,
			this.getSingleTextEdit().range.getStartPosition().toString()
		]);
	}
	/** @deprecated */
	public get shownCommand(): Command | undefined { return this._sourceInlineCompletion.shownCommand; }

	public get requestUuid(): string { return this._data.context.requestUuid; }

	public get partialAccepts(): PartialAcceptance { return this._data.partialAccepts; }

	/**
	 * A reference to the original inline completion this inline completion has been constructed from.
	 * Used for event data to ensure referential equality.
	*/
	private get _sourceInlineCompletion(): InlineCompletion { return this._data.sourceInlineCompletion; }


	public abstract getSingleTextEdit(): TextReplacement;

	public abstract withEdit(userEdit: StringEdit, textModel: ITextModel): InlineSuggestionItem | undefined;

	public abstract withIdentity(identity: InlineSuggestionIdentity): InlineSuggestionItem;
	public abstract canBeReused(model: ITextModel, position: Position): boolean;


	public addRef(): void {
		this.identity.addRef();
		this.source.addRef();
	}

	public removeRef(): void {
		this.identity.removeRef();
		this.source.removeRef();
	}

	public reportInlineEditShown(commandService: ICommandService, viewKind: InlineCompletionViewKind, viewData: InlineCompletionViewData) {
		this._data.reportInlineEditShown(commandService, this.insertText, viewKind, viewData);
	}

	public reportPartialAccept(acceptedCharacters: number, info: PartialAcceptInfo, partialAcceptance: PartialAcceptance) {
		this._data.reportPartialAccept(acceptedCharacters, info, partialAcceptance);
	}

	public reportEndOfLife(reason: InlineCompletionEndOfLifeReason): void {
		this._data.reportEndOfLife(reason);
	}

	public setEndOfLifeReason(reason: InlineCompletionEndOfLifeReason): void {
		this._data.setEndOfLifeReason(reason);
	}

	public setIsPreceeded(item: InlineSuggestionItem): void {
		this._data.setIsPreceeded(item.partialAccepts);
	}

	public setNotShownReasonIfNotSet(reason: string): void {
		this._data.setNotShownReason(reason);
	}

	/**
	 * Avoid using this method. Instead introduce getters for the needed properties.
	*/
	public getSourceCompletion(): InlineCompletion {
		return this._sourceInlineCompletion;
	}
}

export class InlineSuggestionIdentity {
	private static idCounter = 0;
	private readonly _onDispose = observableSignal(this);
	public readonly onDispose: IObservable<void> = this._onDispose;

	private readonly _jumpedTo = observableValue(this, false);
	public get jumpedTo(): IObservable<boolean> {
		return this._jumpedTo;
	}

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

	setJumpTo(tx: ITransaction | undefined): void {
		this._jumpedTo.set(true, tx);
	}
}

export class InlineSuggestHint {

	public static create(displayLocation: InlineCompletionHint) {
		return new InlineSuggestHint(
			Range.lift(displayLocation.range),
			displayLocation.content,
			displayLocation.style,
			displayLocation.jumpToEdit
		);
	}

	private constructor(
		public readonly range: Range,
		public readonly content: string,
		public readonly style: InlineCompletionHintStyle,
		public readonly jumpToEdit: boolean,
	) { }

	public withEdit(edit: StringEdit, positionOffsetTransformer: PositionOffsetTransformerBase): InlineSuggestHint | undefined {
		const offsetRange = new OffsetRange(
			positionOffsetTransformer.getOffset(this.range.getStartPosition()),
			positionOffsetTransformer.getOffset(this.range.getEndPosition())
		);

		const newOffsetRange = applyEditsToRanges([offsetRange], edit)[0];
		if (!newOffsetRange) {
			return undefined;
		}

		const newRange = positionOffsetTransformer.getRange(newOffsetRange);

		return new InlineSuggestHint(newRange, this.content, this.style, this.jumpToEdit);
	}
}

export class InlineCompletionItem extends InlineSuggestionItemBase {
	public static create(
		data: InlineSuggestData,
		textModel: ITextModel,
	): InlineCompletionItem {
		const identity = new InlineSuggestionIdentity();
		const transformer = getPositionOffsetTransformerFromTextModel(textModel);

		const insertText = data.insertText.replace(/\r\n|\r|\n/g, textModel.getEOL());

		const edit = reshapeInlineCompletion(new StringReplacement(transformer.getOffsetRange(data.range), insertText), textModel);
		const trimmedEdit = edit.removeCommonSuffixAndPrefix(textModel.getValue());
		const textEdit = transformer.getTextReplacement(edit);

		const displayLocation = data.hint ? InlineSuggestHint.create(data.hint) : undefined;

		return new InlineCompletionItem(edit, trimmedEdit, textEdit, textEdit.range, data.snippetInfo, data.additionalTextEdits, data, identity, displayLocation);
	}

	public readonly isInlineEdit = false;

	private constructor(
		private readonly _edit: StringReplacement,
		private readonly _trimmedEdit: StringReplacement,
		private readonly _textEdit: TextReplacement,
		private readonly _originalRange: Range,
		public readonly snippetInfo: SnippetInfo | undefined,
		public readonly additionalTextEdits: readonly ISingleEditOperation[],

		data: InlineSuggestData,
		identity: InlineSuggestionIdentity,
		displayLocation: InlineSuggestHint | undefined,
	) {
		super(data, identity, displayLocation);
	}

	override get hash(): string {
		return JSON.stringify(this._trimmedEdit.toJson());
	}

	override getSingleTextEdit(): TextReplacement { return this._textEdit; }

	override withIdentity(identity: InlineSuggestionIdentity): InlineCompletionItem {
		return new InlineCompletionItem(
			this._edit,
			this._trimmedEdit,
			this._textEdit,
			this._originalRange,
			this.snippetInfo,
			this.additionalTextEdits,
			this._data,
			identity,
			this.hint
		);
	}

	override withEdit(textModelEdit: StringEdit, textModel: ITextModel): InlineCompletionItem | undefined {
		const newEditRange = applyEditsToRanges([this._edit.replaceRange], textModelEdit);
		if (newEditRange.length === 0) {
			return undefined;
		}
		const newEdit = new StringReplacement(newEditRange[0], this._textEdit.text);
		const positionOffsetTransformer = getPositionOffsetTransformerFromTextModel(textModel);
		const newTextEdit = positionOffsetTransformer.getTextReplacement(newEdit);

		let newDisplayLocation = this.hint;
		if (newDisplayLocation) {
			newDisplayLocation = newDisplayLocation.withEdit(textModelEdit, positionOffsetTransformer);
			if (!newDisplayLocation) {
				return undefined;
			}
		}

		const trimmedEdit = newEdit.removeCommonSuffixAndPrefix(textModel.getValue());

		return new InlineCompletionItem(
			newEdit,
			trimmedEdit,
			newTextEdit,
			this._originalRange,
			this.snippetInfo,
			this.additionalTextEdits,
			this._data,
			this.identity,
			newDisplayLocation
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
		const singleTextEdit = this.getSingleTextEdit();
		return inlineCompletionIsVisible(singleTextEdit, this._originalRange, model, cursorPosition);
	}
}

export function inlineCompletionIsVisible(singleTextEdit: TextReplacement, originalRange: Range | undefined, model: ITextModel, cursorPosition: Position): boolean {
	const minimizedReplacement = singleTextRemoveCommonPrefix(singleTextEdit, model);
	const editRange = singleTextEdit.range;
	if (!editRange
		|| (originalRange && !originalRange.getStartPosition().equals(editRange.getStartPosition()))
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

export class InlineEditItem extends InlineSuggestionItemBase {
	public static create(
		data: InlineSuggestData,
		textModel: ITextModel,
	): InlineEditItem {
		const offsetEdit = getStringEdit(textModel, data.range, data.insertText);
		const text = new TextModelText(textModel);
		const textEdit = TextEdit.fromStringEdit(offsetEdit, text);
		const singleTextEdit = offsetEdit.isEmpty() ? new TextReplacement(new Range(1, 1, 1, 1), '') : textEdit.toReplacement(text); // FIXME: .toReplacement() can throw because offsetEdit is empty because we get an empty diff in getStringEdit after diffing
		const identity = new InlineSuggestionIdentity();

		const edits = offsetEdit.replacements.map(edit => {
			const replacedRange = Range.fromPositions(textModel.getPositionAt(edit.replaceRange.start), textModel.getPositionAt(edit.replaceRange.endExclusive));
			const replacedText = textModel.getValueInRange(replacedRange);
			return SingleUpdatedNextEdit.create(edit, replacedText);
		});
		const hint = data.hint ? InlineSuggestHint.create(data.hint) : undefined;
		return new InlineEditItem(offsetEdit, singleTextEdit, data.uri, data, identity, edits, hint, false, textModel.getVersionId());
	}

	public readonly snippetInfo: SnippetInfo | undefined = undefined;
	public readonly additionalTextEdits: readonly ISingleEditOperation[] = [];
	public readonly isInlineEdit = true;

	private constructor(
		private readonly _edit: StringEdit,
		private readonly _textEdit: TextReplacement,
		public readonly uri: URI | undefined,

		data: InlineSuggestData,

		identity: InlineSuggestionIdentity,
		private readonly _edits: readonly SingleUpdatedNextEdit[],
		hint: InlineSuggestHint | undefined,
		private readonly _lastChangePartOfInlineEdit = false,
		private readonly _inlineEditModelVersion: number,
	) {
		super(data, identity, hint);
	}

	public get updatedEditModelVersion(): number { return this._inlineEditModelVersion; }
	public get updatedEdit(): StringEdit { return this._edit; }

	override getSingleTextEdit(): TextReplacement {
		return this._textEdit;
	}

	override withIdentity(identity: InlineSuggestionIdentity): InlineEditItem {
		return new InlineEditItem(
			this._edit,
			this._textEdit,
			this.uri,
			this._data,
			identity,
			this._edits,
			this.hint,
			this._lastChangePartOfInlineEdit,
			this._inlineEditModelVersion,
		);
	}

	override canBeReused(model: ITextModel, position: Position): boolean {
		// TODO@hediet I believe this can be simplified to `return true;`, as applying an edit should kick out this suggestion.
		return this._lastChangePartOfInlineEdit && this.updatedEditModelVersion === model.getVersionId();
	}

	override withEdit(textModelChanges: StringEdit, textModel: ITextModel): InlineEditItem | undefined {
		const edit = this._applyTextModelChanges(textModelChanges, this._edits, textModel);
		return edit;
	}

	private _applyTextModelChanges(textModelChanges: StringEdit, edits: readonly SingleUpdatedNextEdit[], textModel: ITextModel): InlineEditItem | undefined {
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

		const newEdit = new StringEdit(edits.map(edit => edit.edit!));
		const positionOffsetTransformer = getPositionOffsetTransformerFromTextModel(textModel);
		const newTextEdit = positionOffsetTransformer.getTextEdit(newEdit).toReplacement(new TextModelText(textModel));

		let newDisplayLocation = this.hint;
		if (newDisplayLocation) {
			newDisplayLocation = newDisplayLocation.withEdit(textModelChanges, positionOffsetTransformer);
			if (!newDisplayLocation) {
				return undefined;
			}
		}

		return new InlineEditItem(
			newEdit,
			newTextEdit,
			this.uri,
			this._data,
			this.identity,
			edits,
			newDisplayLocation,
			lastChangePartOfInlineEdit,
			inlineEditModelVersion,
		);
	}
}

function getStringEdit(textModel: ITextModel, editRange: Range, replaceText: string): StringEdit {
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

	const offsetEdit = new StringEdit(
		innerChanges.map(c => {
			const rangeInModel = addRangeToPos(editRange.getStartPosition(), c.originalRange);
			const originalRange = getPositionOffsetTransformerFromTextModel(textModel).getOffsetRange(rangeInModel);

			const replaceText = modifiedText.getValueOfRange(c.modifiedRange);
			const edit = new StringReplacement(originalRange, replaceText);

			const originalText = textModel.getValueInRange(rangeInModel);
			return reshapeInlineEdit(edit, originalText, innerChanges.length, textModel);
		})
	);

	return offsetEdit;
}

class SingleUpdatedNextEdit {
	public static create(
		edit: StringReplacement,
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
		private _edit: StringReplacement | undefined,
		private _trimmedNewText: string,
		private _prefixLength: number,
		private _suffixLength: number,
		private _lastChangeUpdatedEdit: boolean = false,
	) {
	}

	public applyTextModelChanges(textModelChanges: StringEdit) {
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

	private _applyTextModelChanges(textModelChanges: StringEdit) {
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

	private _applyChanges(edit: StringReplacement, textModelChanges: StringEdit): { edit: StringReplacement; editHasChanged: boolean } | undefined {
		let editStart = edit.replaceRange.start;
		let editEnd = edit.replaceRange.endExclusive;
		let editReplaceText = edit.newText;
		let editHasChanged = false;

		const shouldPreserveEditShape = this._prefixLength > 0 || this._suffixLength > 0;

		for (let i = textModelChanges.replacements.length - 1; i >= 0; i--) {
			const change = textModelChanges.replacements[i];

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
			return { edit: new StringReplacement(new OffsetRange(editStart + this._prefixLength, editStart + this._prefixLength), ''), editHasChanged: true };
		}

		return { edit: new StringReplacement(new OffsetRange(editStart, editEnd), editReplaceText), editHasChanged };
	}
}

function reshapeInlineCompletion(edit: StringReplacement, textModel: ITextModel): StringReplacement {
	// If the insertion is a multi line insertion starting on the next line
	// Move it forwards so that the multi line insertion starts on the current line
	const eol = textModel.getEOL();
	if (edit.replaceRange.isEmpty && edit.newText.includes(eol)) {
		edit = reshapeMultiLineInsertion(edit, textModel);
	}

	return edit;
}

function reshapeInlineEdit(edit: StringReplacement, originalText: string, totalInnerEdits: number, textModel: ITextModel): StringReplacement {
	// TODO: EOL are not properly trimmed by the diffAlgorithm #12680
	const eol = textModel.getEOL();
	if (edit.newText.endsWith(eol) && originalText.endsWith(eol)) {
		edit = new StringReplacement(edit.replaceRange.deltaEnd(-eol.length), edit.newText.slice(0, -eol.length));
	}

	// INSERTION
	// If the insertion ends with a new line and is inserted at the start of a line which has text,
	// we move the insertion to the end of the previous line if possible
	if (totalInnerEdits === 1 && edit.replaceRange.isEmpty && edit.newText.includes(eol)) {
		const startPosition = textModel.getPositionAt(edit.replaceRange.start);
		const hasTextOnInsertionLine = textModel.getLineLength(startPosition.lineNumber) !== 0;
		if (hasTextOnInsertionLine) {
			edit = reshapeMultiLineInsertion(edit, textModel);
		}
	}

	// The diff algorithm extended a simple edit to the entire word
	// shrink it back to a simple edit if it is deletion/insertion only
	if (totalInnerEdits === 1) {
		const prefixLength = commonPrefixLength(originalText, edit.newText);
		const suffixLength = commonSuffixLength(originalText.slice(prefixLength), edit.newText.slice(prefixLength));

		// reshape it back to an insertion
		if (prefixLength + suffixLength === originalText.length) {
			return new StringReplacement(edit.replaceRange.deltaStart(prefixLength).deltaEnd(-suffixLength), edit.newText.substring(prefixLength, edit.newText.length - suffixLength));
		}

		// reshape it back to a deletion
		if (prefixLength + suffixLength === edit.newText.length) {
			return new StringReplacement(edit.replaceRange.deltaStart(prefixLength).deltaEnd(-suffixLength), '');
		}
	}

	return edit;
}

function reshapeMultiLineInsertion(edit: StringReplacement, textModel: ITextModel): StringReplacement {
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
	if (startColumn === 1 && startLineNumber > 1 && edit.newText.endsWith(eol) && !edit.newText.startsWith(eol)) {
		return new StringReplacement(edit.replaceRange.delta(-1), eol + edit.newText.slice(0, -eol.length));
	}

	return edit;
}
