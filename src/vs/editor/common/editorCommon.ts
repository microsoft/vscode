/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { BulkListenerCallback } from 'vs/base/common/eventEmitter';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { Range, IRange } from 'vs/editor/common/core/range';
import { Selection, ISelection } from 'vs/editor/common/core/selection';
import { IndentRange } from 'vs/editor/common/model/indentRanges';
import { ITextSource } from 'vs/editor/common/model/textSource';
import {
	ModelRawContentChangedEvent, IModelContentChangedEvent, IModelDecorationsChangedEvent,
	IModelLanguageChangedEvent, IModelOptionsChangedEvent
} from 'vs/editor/common/model/textModelEvents';
import * as editorOptions from 'vs/editor/common/config/editorOptions';
import { ICursorPositionChangedEvent, ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { ICursors, CursorConfiguration } from 'vs/editor/common/controller/cursorCommon';
import { ThemeColor } from 'vs/platform/theme/common/themeService';

/**
 * Vertical Lane in the overview ruler of the editor.
 */
export enum OverviewRulerLane {
	Left = 1,
	Center = 2,
	Right = 4,
	Full = 7
}

/**
 * Options for rendering a model decoration in the overview ruler.
 */
export interface IModelDecorationOverviewRulerOptions {
	/**
	 * CSS color to render in the overview ruler.
	 * e.g.: rgba(100, 100, 100, 0.5) or a color from the color registry
	 */
	color: string | ThemeColor;
	/**
	 * CSS color to render in the overview ruler.
	 * e.g.: rgba(100, 100, 100, 0.5) or a color from the color registry
	 */
	darkColor: string | ThemeColor;
	/**
	 * CSS color to render in the overview ruler.
	 * e.g.: rgba(100, 100, 100, 0.5) or a color from the color registry
	 */
	hcColor?: string | ThemeColor;
	/**
	 * The position in the overview ruler.
	 */
	position: OverviewRulerLane;
}

/**
 * Options for a model decoration.
 */
export interface IModelDecorationOptions {
	/**
	 * Customize the growing behavior of the decoration when typing at the edges of the decoration.
	 * Defaults to TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
	 */
	stickiness?: TrackedRangeStickiness;
	/**
	 * CSS class name describing the decoration.
	 */
	className?: string;
	/**
	 * Message to be rendered when hovering over the glyph margin decoration.
	 */
	glyphMarginHoverMessage?: IMarkdownString | IMarkdownString[];
	/**
	 * Array of MarkdownString to render as the decoration message.
	 */
	hoverMessage?: IMarkdownString | IMarkdownString[];
	/**
	 * Should the decoration expand to encompass a whole line.
	 */
	isWholeLine?: boolean;
	/**
	 * Always render the decoration (even when the range it encompasses is collapsed).
	 * @internal
	 */
	readonly showIfCollapsed?: boolean;
	/**
	 * If set, render this decoration in the overview ruler.
	 */
	overviewRuler?: IModelDecorationOverviewRulerOptions;
	/**
	 * If set, the decoration will be rendered in the glyph margin with this CSS class name.
	 */
	glyphMarginClassName?: string;
	/**
	 * If set, the decoration will be rendered in the lines decorations with this CSS class name.
	 */
	linesDecorationsClassName?: string;
	/**
	 * If set, the decoration will be rendered in the margin (covering its full width) with this CSS class name.
	 */
	marginClassName?: string;
	/**
	 * If set, the decoration will be rendered inline with the text with this CSS class name.
	 * Please use this only for CSS rules that must impact the text. For example, use `className`
	 * to have a background color decoration.
	 */
	inlineClassName?: string;
	/**
	 * If set, the decoration will be rendered before the text with this CSS class name.
	 */
	beforeContentClassName?: string;
	/**
	 * If set, the decoration will be rendered after the text with this CSS class name.
	 */
	afterContentClassName?: string;
}

/**
 * New model decorations.
 */
export interface IModelDeltaDecoration {
	/**
	 * Range that this decoration covers.
	 */
	range: IRange;
	/**
	 * Options associated with this decoration.
	 */
	options: IModelDecorationOptions;
}

/**
 * A decoration in the model.
 */
export interface IModelDecoration {
	/**
	 * Identifier for a decoration.
	 */
	readonly id: string;
	/**
	 * Identifier for a decoration's owener.
	 */
	readonly ownerId: number;
	/**
	 * Range that this decoration covers.
	 */
	readonly range: Range;
	/**
	 * Options associated with this decoration.
	 */
	readonly options: IModelDecorationOptions;
	/**
	 * A flag describing if this is a problem decoration (e.g. warning/error).
	 */
	readonly isForValidation: boolean;
}

/**
 * An accessor that can add, change or remove model decorations.
 * @internal
 */
export interface IModelDecorationsChangeAccessor {
	/**
	 * Add a new decoration.
	 * @param range Range that this decoration covers.
	 * @param options Options associated with this decoration.
	 * @return An unique identifier associated with this decoration.
	 */
	addDecoration(range: IRange, options: IModelDecorationOptions): string;
	/**
	 * Change the range that an existing decoration covers.
	 * @param id The unique identifier associated with the decoration.
	 * @param newRange The new range that this decoration covers.
	 */
	changeDecoration(id: string, newRange: IRange): void;
	/**
	 * Change the options associated with an existing decoration.
	 * @param id The unique identifier associated with the decoration.
	 * @param newOptions The new options associated with this decoration.
	 */
	changeDecorationOptions(id: string, newOptions: IModelDecorationOptions): void;
	/**
	 * Remove an existing decoration.
	 * @param id The unique identifier associated with the decoration.
	 */
	removeDecoration(id: string): void;
	/**
	 * Perform a minimum ammount of operations, in order to transform the decorations
	 * identified by `oldDecorations` to the decorations described by `newDecorations`
	 * and returns the new identifiers associated with the resulting decorations.
	 *
	 * @param oldDecorations Array containing previous decorations identifiers.
	 * @param newDecorations Array describing what decorations should result after the call.
	 * @return An array containing the new decorations identifiers.
	 */
	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];
}

/**
 * Word inside a model.
 */
export interface IWordAtPosition {
	/**
	 * The word.
	 */
	readonly word: string;
	/**
	 * The column where the word starts.
	 */
	readonly startColumn: number;
	/**
	 * The column where the word ends.
	 */
	readonly endColumn: number;
}

/**
 * End of line character preference.
 */
export enum EndOfLinePreference {
	/**
	 * Use the end of line character identified in the text buffer.
	 */
	TextDefined = 0,
	/**
	 * Use line feed (\n) as the end of line character.
	 */
	LF = 1,
	/**
	 * Use carriage return and line feed (\r\n) as the end of line character.
	 */
	CRLF = 2
}

/**
 * The default end of line to use when instantiating models.
 */
export enum DefaultEndOfLine {
	/**
	 * Use line feed (\n) as the end of line character.
	 */
	LF = 1,
	/**
	 * Use carriage return and line feed (\r\n) as the end of line character.
	 */
	CRLF = 2
}

/**
 * End of line character preference.
 */
export enum EndOfLineSequence {
	/**
	 * Use line feed (\n) as the end of line character.
	 */
	LF = 0,
	/**
	 * Use carriage return and line feed (\r\n) as the end of line character.
	 */
	CRLF = 1
}

/**
 * An identifier for a single edit operation.
 */
export interface ISingleEditOperationIdentifier {
	/**
	 * Identifier major
	 */
	major: number;
	/**
	 * Identifier minor
	 */
	minor: number;
}

/**
 * A builder and helper for edit operations for a command.
 */
export interface IEditOperationBuilder {
	/**
	 * Add a new edit operation (a replace operation).
	 * @param range The range to replace (delete). May be empty to represent a simple insert.
	 * @param text The text to replace with. May be null to represent a simple delete.
	 */
	addEditOperation(range: Range, text: string): void;

	/**
	 * Add a new edit operation (a replace operation).
	 * The inverse edits will be accessible in `ICursorStateComputerData.getInverseEditOperations()`
	 * @param range The range to replace (delete). May be empty to represent a simple insert.
	 * @param text The text to replace with. May be null to represent a simple delete.
	 */
	addTrackedEditOperation(range: Range, text: string): void;

	/**
	 * Track `selection` when applying edit operations.
	 * A best effort will be made to not grow/expand the selection.
	 * An empty selection will clamp to a nearby character.
	 * @param selection The selection to track.
	 * @param trackPreviousOnEmpty If set, and the selection is empty, indicates whether the selection
	 *           should clamp to the previous or the next character.
	 * @return A unique identifer.
	 */
	trackSelection(selection: Selection, trackPreviousOnEmpty?: boolean): string;
}

/**
 * A helper for computing cursor state after a command.
 */
export interface ICursorStateComputerData {
	/**
	 * Get the inverse edit operations of the added edit operations.
	 */
	getInverseEditOperations(): IIdentifiedSingleEditOperation[];
	/**
	 * Get a previously tracked selection.
	 * @param id The unique identifier returned by `trackSelection`.
	 * @return The selection.
	 */
	getTrackedSelection(id: string): Selection;
}

/**
 * A command that modifies text / cursor state on a model.
 */
export interface ICommand {

	/**
	 * Signal that this command is inserting automatic whitespace that should be trimmed if possible.
	 * @internal
	 */
	readonly insertsAutoWhitespace?: boolean;

	/**
	 * Get the edit operations needed to execute this command.
	 * @param model The model the command will execute on.
	 * @param builder A helper to collect the needed edit operations and to track selections.
	 */
	getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void;

	/**
	 * Compute the cursor state after the edit operations were applied.
	 * @param model The model the commad has executed on.
	 * @param helper A helper to get inverse edit operations and to get previously tracked selections.
	 * @return The cursor state after the command executed.
	 */
	computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection;
}

/**
 * A single edit operation, that acts as a simple replace.
 * i.e. Replace text at `range` with `text` in model.
 */
export interface ISingleEditOperation {
	/**
	 * The range to replace. This can be empty to emulate a simple insert.
	 */
	range: IRange;
	/**
	 * The text to replace with. This can be null to emulate a simple delete.
	 */
	text: string;
	/**
	 * This indicates that this operation has "insert" semantics.
	 * i.e. forceMoveMarkers = true => if `range` is collapsed, all markers at the position will be moved.
	 */
	forceMoveMarkers?: boolean;
}

/**
 * A single edit operation, that has an identifier.
 */
export interface IIdentifiedSingleEditOperation {
	/**
	 * An identifier associated with this single edit operation.
	 */
	identifier: ISingleEditOperationIdentifier;
	/**
	 * The range to replace. This can be empty to emulate a simple insert.
	 */
	range: Range;
	/**
	 * The text to replace with. This can be null to emulate a simple delete.
	 */
	text: string;
	/**
	 * This indicates that this operation has "insert" semantics.
	 * i.e. forceMoveMarkers = true => if `range` is collapsed, all markers at the position will be moved.
	 */
	forceMoveMarkers: boolean;
	/**
	 * This indicates that this operation is inserting automatic whitespace
	 * that can be removed on next model edit operation if `config.trimAutoWhitespace` is true.
	 */
	isAutoWhitespaceEdit?: boolean;
	/**
	 * This indicates that this operation is in a set of operations that are tracked and should not be "simplified".
	 * @internal
	 */
	_isTracked?: boolean;
}

/**
 * A callback that can compute the cursor state after applying a series of edit operations.
 */
export interface ICursorStateComputer {
	/**
	 * A callback that can compute the resulting cursors state after some edit operations have been executed.
	 */
	(inverseEditOperations: IIdentifiedSingleEditOperation[]): Selection[];
}

export class TextModelResolvedOptions {
	_textModelResolvedOptionsBrand: void;

	readonly tabSize: number;
	readonly insertSpaces: boolean;
	readonly defaultEOL: DefaultEndOfLine;
	readonly trimAutoWhitespace: boolean;

	/**
	 * @internal
	 */
	constructor(src: {
		tabSize: number;
		insertSpaces: boolean;
		defaultEOL: DefaultEndOfLine;
		trimAutoWhitespace: boolean;
	}) {
		this.tabSize = src.tabSize | 0;
		this.insertSpaces = Boolean(src.insertSpaces);
		this.defaultEOL = src.defaultEOL | 0;
		this.trimAutoWhitespace = Boolean(src.trimAutoWhitespace);
	}

	/**
	 * @internal
	 */
	public equals(other: TextModelResolvedOptions): boolean {
		return (
			this.tabSize === other.tabSize
			&& this.insertSpaces === other.insertSpaces
			&& this.defaultEOL === other.defaultEOL
			&& this.trimAutoWhitespace === other.trimAutoWhitespace
		);
	}

	/**
	 * @internal
	 */
	public createChangeEvent(newOpts: TextModelResolvedOptions): IModelOptionsChangedEvent {
		return {
			tabSize: this.tabSize !== newOpts.tabSize,
			insertSpaces: this.insertSpaces !== newOpts.insertSpaces,
			trimAutoWhitespace: this.trimAutoWhitespace !== newOpts.trimAutoWhitespace,
		};
	}
}

/**
 * @internal
 */
export interface ITextModelCreationOptions {
	tabSize: number;
	insertSpaces: boolean;
	detectIndentation: boolean;
	trimAutoWhitespace: boolean;
	defaultEOL: DefaultEndOfLine;
}

export interface ITextModelUpdateOptions {
	tabSize?: number;
	insertSpaces?: boolean;
	trimAutoWhitespace?: boolean;
}

/**
 * A textual read-only model.
 */
export interface ITextModel {

	/**
	 * If true, the text model might contain RTL.
	 * If false, the text model **contains only** contain LTR.
	 * @internal
	 */
	mightContainRTL(): boolean;

	/**
	 * If true, the text model might contain non basic ASCII.
	 * If false, the text model **contains only** basic ASCII.
	 * @internal
	 */
	mightContainNonBasicASCII(): boolean;

	/**
	 * Get the resolved options for this model.
	 */
	getOptions(): TextModelResolvedOptions;

	/**
	 * Get the current version id of the model.
	 * Anytime a change happens to the model (even undo/redo),
	 * the version id is incremented.
	 */
	getVersionId(): number;

	/**
	 * Get the alternative version id of the model.
	 * This alternative version id is not always incremented,
	 * it will return the same values in the case of undo-redo.
	 */
	getAlternativeVersionId(): number;

	/**
	 * Replace the entire text buffer value contained in this model.
	 */
	setValue(newValue: string): void;

	/**
	 * Replace the entire text buffer value contained in this model.
	 * @internal
	 */
	setValueFromTextSource(newValue: ITextSource): void;

	/**
	 * Get the text stored in this model.
	 * @param eol The end of line character preference. Defaults to `EndOfLinePreference.TextDefined`.
	 * @param preserverBOM Preserve a BOM character if it was detected when the model was constructed.
	 * @return The text.
	 */
	getValue(eol?: EndOfLinePreference, preserveBOM?: boolean): string;

	/**
	 * Get the length of the text stored in this model.
	 */
	getValueLength(eol?: EndOfLinePreference, preserveBOM?: boolean): number;

	/**
	 * Check if the raw text stored in this model equals another raw text.
	 * @internal
	 */
	equals(other: ITextSource): boolean;

	/**
	 * Get the text in a certain range.
	 * @param range The range describing what text to get.
	 * @param eol The end of line character preference. This will only be used for multiline ranges. Defaults to `EndOfLinePreference.TextDefined`.
	 * @return The text.
	 */
	getValueInRange(range: IRange, eol?: EndOfLinePreference): string;

	/**
	 * Get the length of text in a certain range.
	 * @param range The range describing what text length to get.
	 * @return The text length.
	 */
	getValueLengthInRange(range: IRange): number;

	/**
	 * Splits characters in two buckets. First bucket (A) is of characters that
	 * sit in lines with length < `LONG_LINE_BOUNDARY`. Second bucket (B) is of
	 * characters that sit in lines with length >= `LONG_LINE_BOUNDARY`.
	 * If count(B) > count(A) return true. Returns false otherwise.
	 * @internal
	 */
	isDominatedByLongLines(): boolean;

	/**
	 * Get the number of lines in the model.
	 */
	getLineCount(): number;

	/**
	 * Get the text for a certain line.
	 */
	getLineContent(lineNumber: number): string;

	/**
	 * @internal
	 */
	getIndentLevel(lineNumber: number): number;

	/**
	 * @internal
	 */
	getIndentRanges(): IndentRange[];

	/**
	 * @internal
	 */
	getLineIndentGuide(lineNumber: number): number;

	/**
	 * Get the text for all lines.
	 */
	getLinesContent(): string[];

	/**
	 * Get the end of line sequence predominantly used in the text buffer.
	 * @return EOL char sequence (e.g.: '\n' or '\r\n').
	 */
	getEOL(): string;

	/**
	 * Change the end of line sequence used in the text buffer.
	 */
	setEOL(eol: EndOfLineSequence): void;

	/**
	 * Get the minimum legal column for line at `lineNumber`
	 */
	getLineMinColumn(lineNumber: number): number;

	/**
	 * Get the maximum legal column for line at `lineNumber`
	 */
	getLineMaxColumn(lineNumber: number): number;

	/**
	 * Returns the column before the first non whitespace character for line at `lineNumber`.
	 * Returns 0 if line is empty or contains only whitespace.
	 */
	getLineFirstNonWhitespaceColumn(lineNumber: number): number;

	/**
	 * Returns the column after the last non whitespace character for line at `lineNumber`.
	 * Returns 0 if line is empty or contains only whitespace.
	 */
	getLineLastNonWhitespaceColumn(lineNumber: number): number;

	/**
	 * Create a valid position,
	 */
	validatePosition(position: IPosition): Position;

	/**
	 * Advances the given position by the given offest (negative offsets are also accepted)
	 * and returns it as a new valid position.
	 *
	 * If the offset and position are such that their combination goes beyond the beginning or
	 * end of the model, throws an exception.
	 *
	 * If the ofsset is such that the new position would be in the middle of a multi-byte
	 * line terminator, throws an exception.
	 */
	modifyPosition(position: IPosition, offset: number): Position;

	/**
	 * Create a valid range.
	 */
	validateRange(range: IRange): Range;

	/**
	 * Converts the position to a zero-based offset.
	 *
	 * The position will be [adjusted](#TextDocument.validatePosition).
	 *
	 * @param position A position.
	 * @return A valid zero-based offset.
	 */
	getOffsetAt(position: IPosition): number;

	/**
	 * Converts a zero-based offset to a position.
	 *
	 * @param offset A zero-based offset.
	 * @return A valid [position](#Position).
	 */
	getPositionAt(offset: number): Position;

	/**
	 * Get a range covering the entire model
	 */
	getFullModelRange(): Range;

	/**
	 * Returns if the model was disposed or not.
	 */
	isDisposed(): boolean;

	/**
	 * Only basic mode supports allowed on this model because it is simply too large.
	 * (tokenization is allowed and other basic supports)
	 * @internal
	 */
	isTooLargeForHavingARichMode(): boolean;

	/**
	 * The file is so large, that even tokenization is disabled.
	 * @internal
	 */
	isTooLargeForTokenization(): boolean;

	/**
	 * Search the model.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchOnlyEditableRange Limit the searching to only search inside the editable range of the model.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wordSeparators Force the matching to match entire words only. Pass null otherwise.
	 * @param captureMatches The result will contain the captured groups.
	 * @param limitResultCount Limit the number of results
	 * @return The ranges where the matches are. It is empty if not matches have been found.
	 */
	findMatches(searchString: string, searchOnlyEditableRange: boolean, isRegex: boolean, matchCase: boolean, wordSeparators: string, captureMatches: boolean, limitResultCount?: number): FindMatch[];
	/**
	 * Search the model.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchScope Limit the searching to only search inside this range.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wordSeparators Force the matching to match entire words only. Pass null otherwise.
	 * @param captureMatches The result will contain the captured groups.
	 * @param limitResultCount Limit the number of results
	 * @return The ranges where the matches are. It is empty if no matches have been found.
	 */
	findMatches(searchString: string, searchScope: IRange, isRegex: boolean, matchCase: boolean, wordSeparators: string, captureMatches: boolean, limitResultCount?: number): FindMatch[];
	/**
	 * Search the model for the next match. Loops to the beginning of the model if needed.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchStart Start the searching at the specified position.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wordSeparators Force the matching to match entire words only. Pass null otherwise.
	 * @param captureMatches The result will contain the captured groups.
	 * @return The range where the next match is. It is null if no next match has been found.
	 */
	findNextMatch(searchString: string, searchStart: IPosition, isRegex: boolean, matchCase: boolean, wordSeparators: string, captureMatches: boolean): FindMatch;
	/**
	 * Search the model for the previous match. Loops to the end of the model if needed.
	 * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
	 * @param searchStart Start the searching at the specified position.
	 * @param isRegex Used to indicate that `searchString` is a regular expression.
	 * @param matchCase Force the matching to match lower/upper case exactly.
	 * @param wordSeparators Force the matching to match entire words only. Pass null otherwise.
	 * @param captureMatches The result will contain the captured groups.
	 * @return The range where the previous match is. It is null if no previous match has been found.
	 */
	findPreviousMatch(searchString: string, searchStart: IPosition, isRegex: boolean, matchCase: boolean, wordSeparators: string, captureMatches: boolean): FindMatch;
}

export class FindMatch {
	_findMatchBrand: void;

	public readonly range: Range;
	public readonly matches: string[];

	/**
	 * @internal
	 */
	constructor(range: Range, matches: string[]) {
		this.range = range;
		this.matches = matches;
	}
}

export interface IReadOnlyModel extends ITextModel {
	/**
	 * Gets the resource associated with this editor model.
	 */
	readonly uri: URI;

	/**
	 * Get the language associated with this model.
	 * @internal
	 */
	getLanguageIdentifier(): LanguageIdentifier;

	/**
	 * Get the language associated with this model.
	 */
	getModeId(): string;

	/**
	 * Get the word under or besides `position`.
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Might be null.
	 */
	getWordAtPosition(position: IPosition): IWordAtPosition;

	/**
	 * Get the word under or besides `position` trimmed to `position`.column
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Will never be null.
	 */
	getWordUntilPosition(position: IPosition): IWordAtPosition;
}

/**
 * @internal
 */
export interface IFoundBracket {
	range: Range;
	open: string;
	close: string;
	isOpen: boolean;
}

/**
 * A model that is tokenized.
 */
export interface ITokenizedModel extends ITextModel {

	/**
	 * Force tokenization information for `lineNumber` to be accurate.
	 * @internal
	 */
	forceTokenization(lineNumber: number): void;

	/**
	 * If it is cheap, force tokenization information for `lineNumber` to be accurate.
	 * This is based on a heuristic.
	 * @internal
	 */
	tokenizeIfCheap(lineNumber: number): void;

	/**
	 * Check if calling `forceTokenization` for this `lineNumber` will be cheap (time-wise).
	 * This is based on a heuristic.
	 * @internal
	 */
	isCheapToTokenize(lineNumber: number): boolean;

	/**
	 * Get the tokens for the line `lineNumber`.
	 * The tokens might be inaccurate. Use `forceTokenization` to ensure accurate tokens.
	 * @internal
	 */
	getLineTokens(lineNumber: number): LineTokens;

	/**
	 * Get the language associated with this model.
	 * @internal
	 */
	getLanguageIdentifier(): LanguageIdentifier;

	/**
	 * Get the language associated with this model.
	 */
	getModeId(): string;

	/**
	 * Set the current language mode associated with the model.
	 * @internal
	 */
	setMode(languageIdentifier: LanguageIdentifier): void;

	/**
	 * Returns the real (inner-most) language mode at a given position.
	 * The result might be inaccurate. Use `forceTokenization` to ensure accurate tokens.
	 * @internal
	 */
	getLanguageIdAtPosition(lineNumber: number, column: number): LanguageId;

	/**
	 * Get the word under or besides `position`.
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Might be null.
	 */
	getWordAtPosition(position: IPosition): IWordAtPosition;

	/**
	 * Get the word under or besides `position` trimmed to `position`.column
	 * @param position The position to look for a word.
	 * @param skipSyntaxTokens Ignore syntax tokens, as identified by the mode.
	 * @return The word under or besides `position`. Will never be null.
	 */
	getWordUntilPosition(position: IPosition): IWordAtPosition;

	/**
	 * Find the matching bracket of `request` up, counting brackets.
	 * @param request The bracket we're searching for
	 * @param position The position at which to start the search.
	 * @return The range of the matching bracket, or null if the bracket match was not found.
	 * @internal
	 */
	findMatchingBracketUp(bracket: string, position: IPosition): Range;

	/**
	 * Find the first bracket in the model before `position`.
	 * @param position The position at which to start the search.
	 * @return The info for the first bracket before `position`, or null if there are no more brackets before `positions`.
	 * @internal
	 */
	findPrevBracket(position: IPosition): IFoundBracket;

	/**
	 * Find the first bracket in the model after `position`.
	 * @param position The position at which to start the search.
	 * @return The info for the first bracket after `position`, or null if there are no more brackets after `positions`.
	 * @internal
	 */
	findNextBracket(position: IPosition): IFoundBracket;

	/**
	 * Given a `position`, if the position is on top or near a bracket,
	 * find the matching bracket of that bracket and return the ranges of both brackets.
	 * @param position The position at which to look for a bracket.
	 * @internal
	 */
	matchBracket(position: IPosition): [Range, Range];
}

/**
 * A model that can track markers.
 */
export interface ITextModelWithMarkers extends ITextModel {
	/**
	 * @internal
	 */
	_addMarker(internalDecorationId: number, lineNumber: number, column: number, stickToPreviousCharacter: boolean): string;
	/**
	 * @internal
	 */
	_changeMarker(id: string, newLineNumber: number, newColumn: number): void;
	/**
	 * @internal
	 */
	_changeMarkerStickiness(id: string, newStickToPreviousCharacter: boolean): void;
	/**
	 * @internal
	 */
	_getMarker(id: string): Position;
	/**
	 * @internal
	 */
	_removeMarker(id: string): void;
}

/**
 * Describes the behavior of decorations when typing/editing near their edges.
 * Note: Please do not edit the values, as they very carefully match `DecorationRangeBehavior`
 */
export enum TrackedRangeStickiness {
	AlwaysGrowsWhenTypingAtEdges = 0,
	NeverGrowsWhenTypingAtEdges = 1,
	GrowsOnlyWhenTypingBefore = 2,
	GrowsOnlyWhenTypingAfter = 3,
}

/**
 * A model that can have decorations.
 */
export interface ITextModelWithDecorations {
	/**
	 * Change the decorations. The callback will be called with a change accessor
	 * that becomes invalid as soon as the callback finishes executing.
	 * This allows for all events to be queued up until the change
	 * is completed. Returns whatever the callback returns.
	 * @param ownerId Identifies the editor id in which these decorations should appear. If no `ownerId` is provided, the decorations will appear in all editors that attach this model.
	 * @internal
	 */
	changeDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T, ownerId?: number): T;

	/**
	 * Perform a minimum ammount of operations, in order to transform the decorations
	 * identified by `oldDecorations` to the decorations described by `newDecorations`
	 * and returns the new identifiers associated with the resulting decorations.
	 *
	 * @param oldDecorations Array containing previous decorations identifiers.
	 * @param newDecorations Array describing what decorations should result after the call.
	 * @param ownerId Identifies the editor id in which these decorations should appear. If no `ownerId` is provided, the decorations will appear in all editors that attach this model.
	 * @return An array containing the new decorations identifiers.
	 */
	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[], ownerId?: number): string[];

	/**
	 * Remove all decorations that have been added with this specific ownerId.
	 * @param ownerId The owner id to search for.
	 * @internal
	 */
	removeAllDecorationsWithOwnerId(ownerId: number): void;

	/**
	 * Get the options associated with a decoration.
	 * @param id The decoration id.
	 * @return The decoration options or null if the decoration was not found.
	 */
	getDecorationOptions(id: string): IModelDecorationOptions;

	/**
	 * Get the range associated with a decoration.
	 * @param id The decoration id.
	 * @return The decoration range or null if the decoration was not found.
	 */
	getDecorationRange(id: string): Range;

	/**
	 * Gets all the decorations for the line `lineNumber` as an array.
	 * @param lineNumber The line number
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 * @return An array with the decorations
	 */
	getLineDecorations(lineNumber: number, ownerId?: number, filterOutValidation?: boolean): IModelDecoration[];

	/**
	 * Gets all the decorations for the lines between `startLineNumber` and `endLineNumber` as an array.
	 * @param startLineNumber The start line number
	 * @param endLineNumber The end line number
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 * @return An array with the decorations
	 */
	getLinesDecorations(startLineNumber: number, endLineNumber: number, ownerId?: number, filterOutValidation?: boolean): IModelDecoration[];

	/**
	 * Gets all the deocorations in a range as an array. Only `startLineNumber` and `endLineNumber` from `range` are used for filtering.
	 * So for now it returns all the decorations on the same line as `range`.
	 * @param range The range to search in
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 * @return An array with the decorations
	 */
	getDecorationsInRange(range: IRange, ownerId?: number, filterOutValidation?: boolean): IModelDecoration[];

	/**
	 * Gets all the decorations as an array.
	 * @param ownerId If set, it will ignore decorations belonging to other owners.
	 * @param filterOutValidation If set, it will ignore decorations specific to validation (i.e. warnings, errors).
	 */
	getAllDecorations(ownerId?: number, filterOutValidation?: boolean): IModelDecoration[];
}

/**
 * An editable text model.
 */
export interface IEditableTextModel extends ITextModelWithMarkers {

	/**
	 * Normalize a string containing whitespace according to indentation rules (converts to spaces or to tabs).
	 */
	normalizeIndentation(str: string): string;

	/**
	 * Get what is considered to be one indent (e.g. a tab character or 4 spaces, etc.).
	 */
	getOneIndent(): string;

	/**
	 * Change the options of this model.
	 */
	updateOptions(newOpts: ITextModelUpdateOptions): void;

	/**
	 * Detect the indentation options for this model from its content.
	 */
	detectIndentation(defaultInsertSpaces: boolean, defaultTabSize: number): void;

	/**
	 * Push a stack element onto the undo stack. This acts as an undo/redo point.
	 * The idea is to use `pushEditOperations` to edit the model and then to
	 * `pushStackElement` to create an undo/redo stop point.
	 */
	pushStackElement(): void;

	/**
	 * Push edit operations, basically editing the model. This is the preferred way
	 * of editing the model. The edit operations will land on the undo stack.
	 * @param beforeCursorState The cursor state before the edit operaions. This cursor state will be returned when `undo` or `redo` are invoked.
	 * @param editOperations The edit operations.
	 * @param cursorStateComputer A callback that can compute the resulting cursors state after the edit operations have been executed.
	 * @return The cursor state returned by the `cursorStateComputer`.
	 */
	pushEditOperations(beforeCursorState: Selection[], editOperations: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer): Selection[];

	/**
	 * Edit the model without adding the edits to the undo stack.
	 * This can have dire consequences on the undo stack! See @pushEditOperations for the preferred way.
	 * @param operations The edit operations.
	 * @return The inverse edit operations, that, when applied, will bring the model back to the previous state.
	 */
	applyEdits(operations: IIdentifiedSingleEditOperation[]): IIdentifiedSingleEditOperation[];

	/**
	 * Undo edit operations until the first previous stop point created by `pushStackElement`.
	 * The inverse edit operations will be pushed on the redo stack.
	 * @internal
	 */
	undo(): Selection[];

	/**
	 * Redo edit operations until the next stop point created by `pushStackElement`.
	 * The inverse edit operations will be pushed on the undo stack.
	 * @internal
	 */
	redo(): Selection[];

	/**
	 * Set an editable range on the model.
	 * @internal
	 */
	setEditableRange(range: IRange): void;

	/**
	 * Check if the model has an editable range.
	 * @internal
	 */
	hasEditableRange(): boolean;

	/**
	 * Get the editable range on the model.
	 * @internal
	 */
	getEditableRange(): Range;
}

/**
 * A model.
 */
export interface IModel extends IReadOnlyModel, IEditableTextModel, ITextModelWithMarkers, ITokenizedModel, ITextModelWithDecorations {
	/**
	 * @deprecated Please use `onDidChangeContent` instead.
	 * An event emitted when the contents of the model have changed.
	 * @internal
	 * @event
	 */
	onDidChangeRawContent(listener: (e: ModelRawContentChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the contents of the model have changed.
	 * @event
	 */
	onDidChangeContent(listener: (e: IModelContentChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when decorations of the model have changed.
	 * @event
	 */
	onDidChangeDecorations(listener: (e: IModelDecorationsChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the model options have changed.
	 * @event
	 */
	onDidChangeOptions(listener: (e: IModelOptionsChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the language associated with the model has changed.
	 * @event
	 */
	onDidChangeLanguage(listener: (e: IModelLanguageChangedEvent) => void): IDisposable;
	/**
	 * An event emitted right before disposing the model.
	 * @event
	 */
	onWillDispose(listener: () => void): IDisposable;

	/**
	 * @internal
	 */
	addBulkListener(listener: BulkListenerCallback): IDisposable;

	/**
	 * A unique identifier associated with this model.
	 */
	readonly id: string;

	/**
	 * Destroy this model. This will unbind the model from the mode
	 * and make all necessary clean-up to release this object to the GC.
	 * @internal
	 */
	destroy(): void;

	/**
	 * Destroy this model. This will unbind the model from the mode
	 * and make all necessary clean-up to release this object to the GC.
	 */
	dispose(): void;

	/**
	 * @internal
	 */
	onBeforeAttached(): void;

	/**
	 * @internal
	 */
	onBeforeDetached(): void;

	/**
	 * Returns if this model is attached to an editor or not.
	 * @internal
	 */
	isAttachedToEditor(): boolean;
}

/**
 * A model for the diff editor.
 */
export interface IDiffEditorModel {
	/**
	 * Original model.
	 */
	original: IModel;
	/**
	 * Modified model.
	 */
	modified: IModel;
}

/**
 * An event describing that an editor has had its model reset (i.e. `editor.setModel()`).
 */
export interface IModelChangedEvent {
	/**
	 * The `uri` of the previous model or null.
	 */
	readonly oldModelUrl: URI;
	/**
	 * The `uri` of the new model or null.
	 */
	readonly newModelUrl: URI;
}

export interface IDimension {
	width: number;
	height: number;
}

/**
 * A change
 */
export interface IChange {
	readonly originalStartLineNumber: number;
	readonly originalEndLineNumber: number;
	readonly modifiedStartLineNumber: number;
	readonly modifiedEndLineNumber: number;
}
/**
 * A character level change.
 */
export interface ICharChange extends IChange {
	readonly originalStartColumn: number;
	readonly originalEndColumn: number;
	readonly modifiedStartColumn: number;
	readonly modifiedEndColumn: number;
}
/**
 * A line change
 */
export interface ILineChange extends IChange {
	readonly charChanges: ICharChange[];
}
/**
 * Information about a line in the diff editor
 */
export interface IDiffLineInformation {
	readonly equivalentLineNumber: number;
}

/**
 * @internal
 */
export interface IConfiguration {
	onDidChange(listener: (e: editorOptions.IConfigurationChangedEvent) => void): IDisposable;

	readonly editor: editorOptions.InternalEditorOptions;

	setMaxLineNumber(maxLineNumber: number): void;
}

// --- view

export interface IScrollEvent {
	readonly scrollTop: number;
	readonly scrollLeft: number;
	readonly scrollWidth: number;
	readonly scrollHeight: number;

	readonly scrollTopChanged: boolean;
	readonly scrollLeftChanged: boolean;
	readonly scrollWidthChanged: boolean;
	readonly scrollHeightChanged: boolean;
}

export interface INewScrollPosition {
	scrollLeft?: number;
	scrollTop?: number;
}

/**
 * Description of an action contribution
 */
export interface IActionDescriptor {
	/**
	 * An unique identifier of the contributed action.
	 */
	id: string;
	/**
	 * A label of the action that will be presented to the user.
	 */
	label: string;
	/**
	 * Precondition rule.
	 */
	precondition?: string;
	/**
	 * An array of keybindings for the action.
	 */
	keybindings?: number[];
	/**
	 * The keybinding rule (condition on top of precondition).
	 */
	keybindingContext?: string;
	/**
	 * Control if the action should show up in the context menu and where.
	 * The context menu of the editor has these default:
	 *   navigation - The navigation group comes first in all cases.
	 *   1_modification - This group comes next and contains commands that modify your code.
	 *   9_cutcopypaste - The last default group with the basic editing commands.
	 * You can also create your own group.
	 * Defaults to null (don't show in context menu).
	 */
	contextMenuGroupId?: string;
	/**
	 * Control the order in the context menu group.
	 */
	contextMenuOrder?: number;
	/**
	 * Method that will be executed when the action is triggered.
	 * @param editor The editor instance is passed in as a convinience
	 */
	run(editor: ICommonCodeEditor): void | TPromise<void>;
}

export interface IEditorAction {
	readonly id: string;
	readonly label: string;
	readonly alias: string;
	isSupported(): boolean;
	run(): TPromise<void>;
}

export type IEditorModel = IModel | IDiffEditorModel;

/**
 * A (serializable) state of the cursors.
 */
export interface ICursorState {
	inSelectionMode: boolean;
	selectionStart: IPosition;
	position: IPosition;
}
/**
 * A (serializable) state of the view.
 */
export interface IViewState {
	scrollTop: number;
	scrollTopWithoutViewZones: number;
	scrollLeft: number;
}
/**
 * A (serializable) state of the code editor.
 */
export interface ICodeEditorViewState {
	cursorState: ICursorState[];
	viewState: IViewState;
	contributionsState: { [id: string]: any };
}
/**
 * (Serializable) View state for the diff editor.
 */
export interface IDiffEditorViewState {
	original: ICodeEditorViewState;
	modified: ICodeEditorViewState;
}
/**
 * An editor view state.
 */
export type IEditorViewState = ICodeEditorViewState | IDiffEditorViewState;

export const enum ScrollType {
	Smooth = 0,
	Immediate = 1,
}

/**
 * An editor.
 */
export interface IEditor {
	/**
	 * An event emitted when the editor has been disposed.
	 * @event
	 */
	onDidDispose(listener: () => void): IDisposable;

	/**
	 * Dispose the editor.
	 */
	dispose(): void;

	/**
	 * Get a unique id for this editor instance.
	 */
	getId(): string;

	/**
	 * Get the editor type. Please see `EditorType`.
	 * This is to avoid an instanceof check
	 */
	getEditorType(): string;

	/**
	 * Destroy the editor.
	 * @internal
	 */
	destroy(): void;

	/**
	 * Update the editor's options after the editor has been created.
	 */
	updateOptions(newOptions: editorOptions.IEditorOptions): void;

	/**
	 * Indicates that the editor becomes visible.
	 * @internal
	 */
	onVisible(): void;

	/**
	 * Indicates that the editor becomes hidden.
	 * @internal
	 */
	onHide(): void;

	/**
	 * Instructs the editor to remeasure its container. This method should
	 * be called when the container of the editor gets resized.
	 */
	layout(dimension?: IDimension): void;

	/**
	 * Brings browser focus to the editor text
	 */
	focus(): void;

	/**
	 * Returns true if this editor has keyboard focus (e.g. cursor is blinking).
	 */
	isFocused(): boolean;

	/**
	 * Returns all actions associated with this editor.
	 */
	getActions(): IEditorAction[];

	/**
	 * Returns all actions associated with this editor.
	 */
	getSupportedActions(): IEditorAction[];

	/**
	 * Saves current view state of the editor in a serializable object.
	 */
	saveViewState(): IEditorViewState;

	/**
	 * Restores the view state of the editor from a serializable object generated by `saveViewState`.
	 */
	restoreViewState(state: IEditorViewState): void;

	/**
	 * Given a position, returns a column number that takes tab-widths into account.
	 */
	getVisibleColumnFromPosition(position: IPosition): number;

	/**
	 * Returns the primary position of the cursor.
	 */
	getPosition(): Position;

	/**
	 * Set the primary position of the cursor. This will remove any secondary cursors.
	 * @param position New primary cursor's position
	 */
	setPosition(position: IPosition): void;

	/**
	 * Scroll vertically as necessary and reveal a line.
	 */
	revealLine(lineNumber: number, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically as necessary and reveal a line centered vertically.
	 */
	revealLineInCenter(lineNumber: number, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically as necessary and reveal a line centered vertically only if it lies outside the viewport.
	 */
	revealLineInCenterIfOutsideViewport(lineNumber: number, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a position.
	 */
	revealPosition(position: IPosition, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a position centered vertically.
	 */
	revealPositionInCenter(position: IPosition, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a position centered vertically only if it lies outside the viewport.
	 */
	revealPositionInCenterIfOutsideViewport(position: IPosition, scrollType?: ScrollType): void;

	/**
	 * Returns the primary selection of the editor.
	 */
	getSelection(): Selection;

	/**
	 * Returns all the selections of the editor.
	 */
	getSelections(): Selection[];

	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection: IRange): void;
	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection: Range): void;
	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection: ISelection): void;
	/**
	 * Set the primary selection of the editor. This will remove any secondary cursors.
	 * @param selection The new selection
	 */
	setSelection(selection: Selection): void;

	/**
	 * Set the selections for all the cursors of the editor.
	 * Cursors will be removed or added, as necessary.
	 */
	setSelections(selections: ISelection[]): void;

	/**
	 * Scroll vertically as necessary and reveal lines.
	 */
	revealLines(startLineNumber: number, endLineNumber: number, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically as necessary and reveal lines centered vertically.
	 */
	revealLinesInCenter(lineNumber: number, endLineNumber: number, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically as necessary and reveal lines centered vertically only if it lies outside the viewport.
	 */
	revealLinesInCenterIfOutsideViewport(lineNumber: number, endLineNumber: number, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a range.
	 */
	revealRange(range: IRange, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a range centered vertically.
	 */
	revealRangeInCenter(range: IRange, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a range at the top of the viewport.
	 */
	revealRangeAtTop(range: IRange, scrollType?: ScrollType): void;

	/**
	 * Scroll vertically or horizontally as necessary and reveal a range centered vertically only if it lies outside the viewport.
	 */
	revealRangeInCenterIfOutsideViewport(range: IRange, scrollType?: ScrollType): void;

	/**
	 * Directly trigger a handler or an editor action.
	 * @param source The source of the call.
	 * @param handlerId The id of the handler or the id of a contribution.
	 * @param payload Extra data to be sent to the handler.
	 */
	trigger(source: string, handlerId: string, payload: any): void;

	/**
	 * Gets the current model attached to this editor.
	 */
	getModel(): IEditorModel;

	/**
	 * Sets the current model attached to this editor.
	 * If the previous model was created by the editor via the value key in the options
	 * literal object, it will be destroyed. Otherwise, if the previous model was set
	 * via setModel, or the model key in the options literal object, the previous model
	 * will not be destroyed.
	 * It is safe to call setModel(null) to simply detach the current model from the editor.
	 */
	setModel(model: IEditorModel): void;

	/**
	 * Change the decorations. All decorations added through this changeAccessor
	 * will get the ownerId of the editor (meaning they will not show up in other
	 * editors).
	 * @see IModel.changeDecorations
	 * @internal
	 */
	changeDecorations(callback: (changeAccessor: IModelDecorationsChangeAccessor) => any): any;
}

/**
 * An editor contribution that gets created every time a new editor gets created and gets disposed when the editor gets disposed.
 */
export interface IEditorContribution {
	/**
	 * Get a unique identifier for this contribution.
	 */
	getId(): string;
	/**
	 * Dispose this contribution.
	 */
	dispose(): void;
	/**
	 * Store view state.
	 */
	saveViewState?(): any;
	/**
	 * Restore view state.
	 */
	restoreViewState?(state: any): void;
}

/**
 * @internal
 */
export function isThemeColor(o): o is ThemeColor {
	return o && typeof o.id === 'string';
}

/**
 * @internal
 */
export interface IThemeDecorationRenderOptions {
	backgroundColor?: string | ThemeColor;

	outline?: string;
	outlineColor?: string | ThemeColor;
	outlineStyle?: string;
	outlineWidth?: string;

	border?: string;
	borderColor?: string | ThemeColor;
	borderRadius?: string;
	borderSpacing?: string;
	borderStyle?: string;
	borderWidth?: string;

	textDecoration?: string;
	cursor?: string;
	color?: string | ThemeColor;
	letterSpacing?: string;

	gutterIconPath?: string | URI;
	gutterIconSize?: string;

	overviewRulerColor?: string | ThemeColor;

	before?: IContentDecorationRenderOptions;
	after?: IContentDecorationRenderOptions;
}

/**
 * @internal
 */
export interface IContentDecorationRenderOptions {
	contentText?: string;
	contentIconPath?: string | URI;

	border?: string;
	borderColor?: string | ThemeColor;
	textDecoration?: string;
	color?: string | ThemeColor;
	backgroundColor?: string | ThemeColor;

	margin?: string;
	width?: string;
	height?: string;
}

/**
 * @internal
 */
export interface IDecorationRenderOptions extends IThemeDecorationRenderOptions {
	isWholeLine?: boolean;
	rangeBehavior?: TrackedRangeStickiness;
	overviewRulerLane?: OverviewRulerLane;

	light?: IThemeDecorationRenderOptions;
	dark?: IThemeDecorationRenderOptions;
}

/**
 * @internal
 */
export interface IThemeDecorationInstanceRenderOptions {
	before?: IContentDecorationRenderOptions;
	after?: IContentDecorationRenderOptions;
}

/**
 * @internal
 */
export interface IDecorationInstanceRenderOptions extends IThemeDecorationInstanceRenderOptions {
	light?: IThemeDecorationInstanceRenderOptions;
	dark?: IThemeDecorationInstanceRenderOptions;
}

/**
 * @internal
 */
export interface IDecorationOptions {
	range: IRange;
	hoverMessage?: IMarkdownString | IMarkdownString[];
	renderOptions?: IDecorationInstanceRenderOptions;
}

export interface ICommonCodeEditor extends IEditor {
	/**
	 * An event emitted when the content of the current model has changed.
	 * @event
	 */
	onDidChangeModelContent(listener: (e: IModelContentChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the language of the current model has changed.
	 * @event
	 */
	onDidChangeModelLanguage(listener: (e: IModelLanguageChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the options of the current model has changed.
	 * @event
	 */
	onDidChangeModelOptions(listener: (e: IModelOptionsChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the configuration of the editor has changed. (e.g. `editor.updateOptions()`)
	 * @event
	 */
	onDidChangeConfiguration(listener: (e: editorOptions.IConfigurationChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the cursor position has changed.
	 * @event
	 */
	onDidChangeCursorPosition(listener: (e: ICursorPositionChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the cursor selection has changed.
	 * @event
	 */
	onDidChangeCursorSelection(listener: (e: ICursorSelectionChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the model of this editor has changed (e.g. `editor.setModel()`).
	 * @event
	 */
	onDidChangeModel(listener: (e: IModelChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the decorations of the current model have changed.
	 * @event
	 */
	onDidChangeModelDecorations(listener: (e: IModelDecorationsChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor gained focus (i.e. cursor blinking).
	 * @event
	 */
	onDidFocusEditorText(listener: () => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor lost focus.
	 * @event
	 */
	onDidBlurEditorText(listener: () => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor or an editor widget gained focus.
	 * @event
	 */
	onDidFocusEditor(listener: () => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor or an editor widget lost focus.
	 * @event
	 */
	onDidBlurEditor(listener: () => void): IDisposable;
	/**
	 * An event emitted before interpreting typed characters (on the keyboard).
	 * @event
	 * @internal
	 */
	onWillType(listener: (text: string) => void): IDisposable;
	/**
	 * An event emitted before interpreting typed characters (on the keyboard).
	 * @event
	 * @internal
	 */
	onDidType(listener: (text: string) => void): IDisposable;
	/**
	 * An event emitted when users paste text in the editor.
	 * @event
	 * @internal
	 */
	onDidPaste(listener: (range: Range) => void): IDisposable;

	/**
	 * Saves current view state of the editor in a serializable object.
	 */
	saveViewState(): ICodeEditorViewState;

	/**
	 * Restores the view state of the editor from a serializable object generated by `saveViewState`.
	 */
	restoreViewState(state: ICodeEditorViewState): void;

	/**
	 * Returns true if this editor or one of its widgets has keyboard focus.
	 */
	hasWidgetFocus(): boolean;

	/**
	 * Get a contribution of this editor.
	 * @id Unique identifier of the contribution.
	 * @return The contribution or null if contribution not found.
	 */
	getContribution<T extends IEditorContribution>(id: string): T;

	/**
	 * Execute `fn` with the editor's services.
	 * @internal
	 */
	invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T;

	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): IModel;

	/**
	 * Returns the current editor's configuration
	 */
	getConfiguration(): editorOptions.InternalEditorOptions;

	/**
	 * Returns the 'raw' editor's configuration (without any validation or defaults).
	 * @internal
	 */
	getRawConfiguration(): editorOptions.IEditorOptions;

	/**
	 * Get value of the current model attached to this editor.
	 * @see IModel.getValue
	 */
	getValue(options?: { preserveBOM: boolean; lineEnding: string; }): string;

	/**
	 * Set the value of the current model attached to this editor.
	 * @see IModel.setValue
	 */
	setValue(newValue: string): void;

	/**
	 * Get the scrollWidth of the editor's viewport.
	 */
	getScrollWidth(): number;
	/**
	 * Get the scrollLeft of the editor's viewport.
	 */
	getScrollLeft(): number;

	/**
	 * Get the scrollHeight of the editor's viewport.
	 */
	getScrollHeight(): number;
	/**
	 * Get the scrollTop of the editor's viewport.
	 */
	getScrollTop(): number;

	/**
	 * Change the scrollLeft of the editor's viewport.
	 */
	setScrollLeft(newScrollLeft: number): void;
	/**
	 * Change the scrollTop of the editor's viewport.
	 */
	setScrollTop(newScrollTop: number): void;
	/**
	 * Change the scroll position of the editor's viewport.
	 */
	setScrollPosition(position: INewScrollPosition): void;

	/**
	 * Get an action that is a contribution to this editor.
	 * @id Unique identifier of the contribution.
	 * @return The action or null if action not found.
	 */
	getAction(id: string): IEditorAction;

	/**
	 * Execute a command on the editor.
	 * The edits will land on the undo-redo stack, but no "undo stop" will be pushed.
	 * @param source The source of the call.
	 * @param command The command to execute
	 */
	executeCommand(source: string, command: ICommand): void;

	/**
	 * Push an "undo stop" in the undo-redo stack.
	 */
	pushUndoStop(): boolean;

	/**
	 * Execute edits on the editor.
	 * The edits will land on the undo-redo stack, but no "undo stop" will be pushed.
	 * @param source The source of the call.
	 * @param edits The edits to execute.
	 * @param endCursoState Cursor state after the edits were applied.
	 */
	executeEdits(source: string, edits: IIdentifiedSingleEditOperation[], endCursoState?: Selection[]): boolean;

	/**
	 * Execute multiple (concommitent) commands on the editor.
	 * @param source The source of the call.
	 * @param command The commands to execute
	 */
	executeCommands(source: string, commands: ICommand[]): void;

	/**
	 * @internal
	 */
	_getCursors(): ICursors;

	/**
	 * @internal
	 */
	_getCursorConfiguration(): CursorConfiguration;

	/**
	 * Get all the decorations on a line (filtering out decorations from other editors).
	 */
	getLineDecorations(lineNumber: number): IModelDecoration[];

	/**
	 * All decorations added through this call will get the ownerId of this editor.
	 * @see IModel.deltaDecorations
	 */
	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];

	/**
	 * @internal
	 */
	setDecorations(decorationTypeKey: string, ranges: IDecorationOptions[]): void;

	/**
	 * @internal
	 */
	removeDecorations(decorationTypeKey: string): void;

	/**
	 * Get the layout info for the editor.
	 */
	getLayoutInfo(): editorOptions.EditorLayoutInfo;

	/**
	 * @internal
	 */
	getTelemetryData(): { [key: string]: any; };
}

export interface ICommonDiffEditor extends IEditor {
	/**
	 * An event emitted when the diff information computed by this diff editor has been updated.
	 * @event
	 */
	onDidUpdateDiff(listener: () => void): IDisposable;

	/**
	 * Saves current view state of the editor in a serializable object.
	 */
	saveViewState(): IDiffEditorViewState;

	/**
	 * Restores the view state of the editor from a serializable object generated by `saveViewState`.
	 */
	restoreViewState(state: IDiffEditorViewState): void;

	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): IDiffEditorModel;

	/**
	 * Get the `original` editor.
	 */
	getOriginalEditor(): ICommonCodeEditor;

	/**
	 * Get the `modified` editor.
	 */
	getModifiedEditor(): ICommonCodeEditor;

	/**
	 * Get the computed diff information.
	 */
	getLineChanges(): ILineChange[];

	/**
	 * Get information based on computed diff about a line number from the original model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 */
	getDiffLineInformationForOriginal(lineNumber: number): IDiffLineInformation;

	/**
	 * Get information based on computed diff about a line number from the modified model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 */
	getDiffLineInformationForModified(lineNumber: number): IDiffLineInformation;

	/**
	 * @see ICodeEditor.getValue
	 */
	getValue(options?: { preserveBOM: boolean; lineEnding: string; }): string;

	/**
	 * Returns whether the diff editor is ignoring trim whitespace or not.
	 * @internal
	 */
	readonly ignoreTrimWhitespace: boolean;

	/**
	 * Returns whether the diff editor is rendering side by side or not.
	 * @internal
	 */
	readonly renderSideBySide: boolean;
	/**
	 * Returns whether the diff editor is rendering +/- indicators or not.
	 * @internal
	 */
	readonly renderIndicators: boolean;
}

/**
 * The type of the `IEditor`.
 */
export var EditorType = {
	ICodeEditor: 'vs.editor.ICodeEditor',
	IDiffEditor: 'vs.editor.IDiffEditor'
};

/**
 *@internal
 */
export function isCommonCodeEditor(thing: any): thing is ICommonCodeEditor {
	if (thing && typeof (<ICommonCodeEditor>thing).getEditorType === 'function') {
		return (<ICommonCodeEditor>thing).getEditorType() === EditorType.ICodeEditor;
	} else {
		return false;
	}
}

/**
 *@internal
 */
export function isCommonDiffEditor(thing: any): thing is ICommonDiffEditor {
	if (thing && typeof (<ICommonDiffEditor>thing).getEditorType === 'function') {
		return (<ICommonDiffEditor>thing).getEditorType() === EditorType.IDiffEditor;
	} else {
		return false;
	}
}

/**
 * Built-in commands.
 * @internal
 */
export var Handler = {
	ExecuteCommand: 'executeCommand',
	ExecuteCommands: 'executeCommands',

	Type: 'type',
	ReplacePreviousChar: 'replacePreviousChar',
	CompositionStart: 'compositionStart',
	CompositionEnd: 'compositionEnd',
	Paste: 'paste',

	Cut: 'cut',

	Undo: 'undo',
	Redo: 'redo',
};
