/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * The version of the editor.
	 */
	export const version: string;

	/**
	 * Represents a reference to a command. Provides a title which
	 * will be used to represent a command in the UI and, optionally,
	 * an array of arguments which will be passed to the command handler
	 * function when invoked.
	 */
	export interface Command {
		/**
		 * Title of the command, like `save`.
		 */
		title: string;

		/**
		 * The identifier of the actual command handler.
		 * @see {@link commands.registerCommand}
		 */
		command: string;

		/**
		 * A tooltip for the command, when represented in the UI.
		 */
		tooltip?: string;

		/**
		 * Arguments that the command handler should be
		 * invoked with.
		 */
		arguments?: any[];
	}

	/**
	 * Represents a line of text, such as a line of source code.
	 *
	 * TextLine objects are __immutable__. When a {@link TextDocument document} changes,
	 * previously retrieved lines will not represent the latest state.
	 */
	export interface TextLine {

		/**
		 * The zero-based line number.
		 */
		readonly lineNumber: number;

		/**
		 * The text of this line without the line separator characters.
		 */
		readonly text: string;

		/**
		 * The range this line covers without the line separator characters.
		 */
		readonly range: Range;

		/**
		 * The range this line covers with the line separator characters.
		 */
		readonly rangeIncludingLineBreak: Range;

		/**
		 * The offset of the first character which is not a whitespace character as defined
		 * by `/\s/`. **Note** that if a line is all whitespace the length of the line is returned.
		 */
		readonly firstNonWhitespaceCharacterIndex: number;

		/**
		 * Whether this line is whitespace only, shorthand
		 * for {@link TextLine.firstNonWhitespaceCharacterIndex} === {@link TextLine.text TextLine.text.length}.
		 */
		readonly isEmptyOrWhitespace: boolean;
	}

	/**
	 * Represents a text document, such as a source file. Text documents have
	 * {@link TextLine lines} and knowledge about an underlying resource like a file.
	 */
	export interface TextDocument {

		/**
		 * The associated uri for this document.
		 *
		 * *Note* that most documents use the `file`-scheme, which means they are files on disk. However, **not** all documents are
		 * saved on disk and therefore the `scheme` must be checked before trying to access the underlying file or siblings on disk.
		 *
		 * @see {@link FileSystemProvider}
		 * @see {@link TextDocumentContentProvider}
		 */
		readonly uri: Uri;

		/**
		 * The file system path of the associated resource. Shorthand
		 * notation for {@link TextDocument.uri TextDocument.uri.fsPath}. Independent of the uri scheme.
		 */
		readonly fileName: string;

		/**
		 * Is this document representing an untitled file which has never been saved yet. *Note* that
		 * this does not mean the document will be saved to disk, use {@linkcode Uri.scheme}
		 * to figure out where a document will be {@link FileSystemProvider saved}, e.g. `file`, `ftp` etc.
		 */
		readonly isUntitled: boolean;

		/**
		 * The identifier of the language associated with this document.
		 */
		readonly languageId: string;

		/**
		 * The file encoding of this document that will be used when the document is saved.
		 *
		 * Use the {@link workspace.onDidChangeTextDocument onDidChangeTextDocument}-event to
		 * get notified when the document encoding changes.
		 *
		 * Note that the possible encoding values are currently defined as any of the following:
		 * 'utf8', 'utf8bom', 'utf16le', 'utf16be', 'windows1252', 'iso88591', 'iso88593',
		 * 'iso885915', 'macroman', 'cp437', 'windows1256', 'iso88596', 'windows1257',
		 * 'iso88594', 'iso885914', 'windows1250', 'iso88592', 'cp852', 'windows1251',
		 * 'cp866', 'cp1125', 'iso88595', 'koi8r', 'koi8u', 'iso885913', 'windows1253',
		 * 'iso88597', 'windows1255', 'iso88598', 'iso885910', 'iso885916', 'windows1254',
		 * 'iso88599', 'windows1258', 'gbk', 'gb18030', 'cp950', 'big5hkscs', 'shiftjis',
		 * 'eucjp', 'euckr', 'windows874', 'iso885911', 'koi8ru', 'koi8t', 'gb2312',
		 * 'cp865', 'cp850'.
		 */
		readonly encoding: string;

		/**
		 * The version number of this document (it will strictly increase after each
		 * change, including undo/redo).
		 */
		readonly version: number;

		/**
		 * `true` if there are unpersisted changes.
		 */
		readonly isDirty: boolean;

		/**
		 * `true` if the document has been closed. A closed document isn't synchronized anymore
		 * and won't be re-used when the same resource is opened again.
		 */
		readonly isClosed: boolean;

		/**
		 * Save the underlying file.
		 *
		 * @returns A promise that will resolve to `true` when the file
		 * has been saved. If the save failed, will return `false`.
		 */
		save(): Thenable<boolean>;

		/**
		 * The {@link EndOfLine end of line} sequence that is predominately
		 * used in this document.
		 */
		readonly eol: EndOfLine;

		/**
		 * The number of lines in this document.
		 */
		readonly lineCount: number;

		/**
		 * Returns a text line denoted by the line number. Note
		 * that the returned object is *not* live and changes to the
		 * document are not reflected.
		 *
		 * @param line A line number in `[0, lineCount)`.
		 * @returns A {@link TextLine line}.
		 */
		lineAt(line: number): TextLine;

		/**
		 * Returns a text line denoted by the position. Note
		 * that the returned object is *not* live and changes to the
		 * document are not reflected.
		 *
		 * The position will be {@link TextDocument.validatePosition adjusted}.
		 *
		 * @see {@link TextDocument.lineAt}
		 *
		 * @param position A position.
		 * @returns A {@link TextLine line}.
		 */
		lineAt(position: Position): TextLine;

		/**
		 * Converts the position to a zero-based offset.
		 *
		 * The position will be {@link TextDocument.validatePosition adjusted}.
		 *
		 * @param position A position.
		 * @returns A valid zero-based offset in UTF-16 [code units](https://developer.mozilla.org/en-US/docs/Glossary/Code_unit).
		 */
		offsetAt(position: Position): number;

		/**
		 * Converts a zero-based offset to a position.
		 *
		 * @param offset A zero-based offset into the document. This offset is in UTF-16 [code units](https://developer.mozilla.org/en-US/docs/Glossary/Code_unit).
		 * @returns A valid {@link Position}.
		 */
		positionAt(offset: number): Position;

		/**
		 * Get the text of this document. A substring can be retrieved by providing
		 * a range. The range will be {@link TextDocument.validateRange adjusted}.
		 *
		 * @param range Include only the text included by the range.
		 * @returns The text inside the provided range or the entire text.
		 */
		getText(range?: Range): string;

		/**
		 * Get a word-range at the given position. By default words are defined by
		 * common separators, like space, -, _, etc. In addition, per language custom
		 * [word definitions] can be defined. It
		 * is also possible to provide a custom regular expression.
		 *
		 * * *Note 1:* A custom regular expression must not match the empty string and
		 * if it does, it will be ignored.
		 * * *Note 2:* A custom regular expression will fail to match multiline strings
		 * and in the name of speed regular expressions should not match words with
		 * spaces. Use {@linkcode TextLine.text} for more complex, non-wordy, scenarios.
		 *
		 * The position will be {@link TextDocument.validatePosition adjusted}.
		 *
		 * @param position A position.
		 * @param regex Optional regular expression that describes what a word is.
		 * @returns A range spanning a word, or `undefined`.
		 */
		getWordRangeAtPosition(position: Position, regex?: RegExp): Range | undefined;

		/**
		 * Ensure a range is completely contained in this document.
		 *
		 * @param range A range.
		 * @returns The given range or a new, adjusted range.
		 */
		validateRange(range: Range): Range;

		/**
		 * Ensure a position is contained in the range of this document.
		 *
		 * @param position A position.
		 * @returns The given position or a new, adjusted position.
		 */
		validatePosition(position: Position): Position;
	}

	/**
	 * Represents a line and character position, such as
	 * the position of the cursor.
	 *
	 * Position objects are __immutable__. Use the {@link Position.with with} or
	 * {@link Position.translate translate} methods to derive new positions
	 * from an existing position.
	 */
	export class Position {

		/**
		 * The zero-based line value.
		 */
		readonly line: number;

		/**
		 * The zero-based character value.
		 *
		 * Character offsets are expressed using UTF-16 [code units](https://developer.mozilla.org/en-US/docs/Glossary/Code_unit).
		 */
		readonly character: number;

		/**
		 * @param line A zero-based line value.
		 * @param character A zero-based character value.
		 */
		constructor(line: number, character: number);

		/**
		 * Check if this position is before `other`.
		 *
		 * @param other A position.
		 * @returns `true` if position is on a smaller line
		 * or on the same line on a smaller character.
		 */
		isBefore(other: Position): boolean;

		/**
		 * Check if this position is before or equal to `other`.
		 *
		 * @param other A position.
		 * @returns `true` if position is on a smaller line
		 * or on the same line on a smaller or equal character.
		 */
		isBeforeOrEqual(other: Position): boolean;

		/**
		 * Check if this position is after `other`.
		 *
		 * @param other A position.
		 * @returns `true` if position is on a greater line
		 * or on the same line on a greater character.
		 */
		isAfter(other: Position): boolean;

		/**
		 * Check if this position is after or equal to `other`.
		 *
		 * @param other A position.
		 * @returns `true` if position is on a greater line
		 * or on the same line on a greater or equal character.
		 */
		isAfterOrEqual(other: Position): boolean;

		/**
		 * Check if this position is equal to `other`.
		 *
		 * @param other A position.
		 * @returns `true` if the line and character of the given position are equal to
		 * the line and character of this position.
		 */
		isEqual(other: Position): boolean;

		/**
		 * Compare this to `other`.
		 *
		 * @param other A position.
		 * @returns A number smaller than zero if this position is before the given position,
		 * a number greater than zero if this position is after the given position, or zero when
		 * this and the given position are equal.
		 */
		compareTo(other: Position): number;

		/**
		 * Create a new position relative to this position.
		 *
		 * @param lineDelta Delta value for the line value, default is `0`.
		 * @param characterDelta Delta value for the character value, default is `0`.
		 * @returns A position which line and character is the sum of the current line and
		 * character and the corresponding deltas.
		 */
		translate(lineDelta?: number, characterDelta?: number): Position;

		/**
		 * Derived a new position relative to this position.
		 *
		 * @param change An object that describes a delta to this position.
		 * @returns A position that reflects the given delta. Will return `this` position if the change
		 * is not changing anything.
		 */
		translate(change: {
			/**
			 * Delta value for the line value, default is `0`.
			 */
			lineDelta?: number;
			/**
			 * Delta value for the character value, default is `0`.
			 */
			characterDelta?: number;
		}): Position;

		/**
		 * Create a new position derived from this position.
		 *
		 * @param line Value that should be used as line value, default is the {@link Position.line existing value}
		 * @param character Value that should be used as character value, default is the {@link Position.character existing value}
		 * @returns A position where line and character are replaced by the given values.
		 */
		with(line?: number, character?: number): Position;

		/**
		 * Derived a new position from this position.
		 *
		 * @param change An object that describes a change to this position.
		 * @returns A position that reflects the given change. Will return `this` position if the change
		 * is not changing anything.
		 */
		with(change: {
			/**
			 * New line value, defaults the line value of `this`.
			 */
			line?: number;
			/**
			 * New character value, defaults the character value of `this`.
			 */
			character?: number;
		}): Position;
	}

	/**
	 * A range represents an ordered pair of two positions.
	 * It is guaranteed that {@link Range.start start}.isBeforeOrEqual({@link Range.end end})
	 *
	 * Range objects are __immutable__. Use the {@link Range.with with},
	 * {@link Range.intersection intersection}, or {@link Range.union union} methods
	 * to derive new ranges from an existing range.
	 */
	export class Range {

		/**
		 * The start position. It is before or equal to {@link Range.end end}.
		 */
		readonly start: Position;

		/**
		 * The end position. It is after or equal to {@link Range.start start}.
		 */
		readonly end: Position;

		/**
		 * Create a new range from two positions. If `start` is not
		 * before or equal to `end`, the values will be swapped.
		 *
		 * @param start A position.
		 * @param end A position.
		 */
		constructor(start: Position, end: Position);

		/**
		 * Create a new range from number coordinates. It is a shorter equivalent of
		 * using `new Range(new Position(startLine, startCharacter), new Position(endLine, endCharacter))`
		 *
		 * @param startLine A zero-based line value.
		 * @param startCharacter A zero-based character value.
		 * @param endLine A zero-based line value.
		 * @param endCharacter A zero-based character value.
		 */
		constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);

		/**
		 * `true` if `start` and `end` are equal.
		 */
		isEmpty: boolean;

		/**
		 * `true` if `start.line` and `end.line` are equal.
		 */
		isSingleLine: boolean;

		/**
		 * Check if a position or a range is contained in this range.
		 *
		 * @param positionOrRange A position or a range.
		 * @returns `true` if the position or range is inside or equal
		 * to this range.
		 */
		contains(positionOrRange: Position | Range): boolean;

		/**
		 * Check if `other` equals this range.
		 *
		 * @param other A range.
		 * @returns `true` when start and end are {@link Position.isEqual equal} to
		 * start and end of this range.
		 */
		isEqual(other: Range): boolean;

		/**
		 * Intersect `range` with this range and returns a new range or `undefined`
		 * if the ranges have no overlap.
		 *
		 * @param range A range.
		 * @returns A range of the greater start and smaller end positions. Will
		 * return undefined when there is no overlap.
		 */
		intersection(range: Range): Range | undefined;

		/**
		 * Compute the union of `other` with this range.
		 *
		 * @param other A range.
		 * @returns A range of smaller start position and the greater end position.
		 */
		union(other: Range): Range;

		/**
		 * Derived a new range from this range.
		 *
		 * @param start A position that should be used as start. The default value is the {@link Range.start current start}.
		 * @param end A position that should be used as end. The default value is the {@link Range.end current end}.
		 * @returns A range derived from this range with the given start and end position.
		 * If start and end are not different `this` range will be returned.
		 */
		with(start?: Position, end?: Position): Range;

		/**
		 * Derived a new range from this range.
		 *
		 * @param change An object that describes a change to this range.
		 * @returns A range that reflects the given change. Will return `this` range if the change
		 * is not changing anything.
		 */
		with(change: {
			/**
			 * New start position, defaults to {@link Range.start current start}
			 */
			start?: Position;
			/**
			 * New end position, defaults to {@link Range.end current end}
			 */
			end?: Position;
		}): Range;
	}

	/**
	 * Represents a text selection in an editor.
	 */
	export class Selection extends Range {

		/**
		 * The position at which the selection starts.
		 * This position might be before or after {@link Selection.active active}.
		 */
		readonly anchor: Position;

		/**
		 * The position of the cursor.
		 * This position might be before or after {@link Selection.anchor anchor}.
		 */
		readonly active: Position;

		/**
		 * Create a selection from two positions.
		 *
		 * @param anchor A position.
		 * @param active A position.
		 */
		constructor(anchor: Position, active: Position);

		/**
		 * Create a selection from four coordinates.
		 *
		 * @param anchorLine A zero-based line value.
		 * @param anchorCharacter A zero-based character value.
		 * @param activeLine A zero-based line value.
		 * @param activeCharacter A zero-based character value.
		 */
		constructor(anchorLine: number, anchorCharacter: number, activeLine: number, activeCharacter: number);

		/**
		 * A selection is reversed if its {@link Selection.anchor anchor} is the {@link Selection.end end} position.
		 */
		readonly isReversed: boolean;
	}

	/**
	 * Represents sources that can cause {@link window.onDidChangeTextEditorSelection selection change events}.
	 */
	export enum TextEditorSelectionChangeKind {
		/**
		 * Selection changed due to typing in the editor.
		 */
		Keyboard = 1,
		/**
		 * Selection change due to clicking in the editor.
		 */
		Mouse = 2,
		/**
		 * Selection changed because a command ran.
		 */
		Command = 3
	}

	/**
	 * Represents an event describing the change in a {@link TextEditor.selections text editor's selections}.
	 */
	export interface TextEditorSelectionChangeEvent {
		/**
		 * The {@link TextEditor text editor} for which the selections have changed.
		 */
		readonly textEditor: TextEditor;
		/**
		 * The new value for the {@link TextEditor.selections text editor's selections}.
		 */
		readonly selections: readonly Selection[];
		/**
		 * The {@link TextEditorSelectionChangeKind change kind} which has triggered this
		 * event. Can be `undefined`.
		 */
		readonly kind: TextEditorSelectionChangeKind | undefined;
	}

	/**
	 * Represents an event describing the change in a {@link TextEditor.visibleRanges text editor's visible ranges}.
	 */
	export interface TextEditorVisibleRangesChangeEvent {
		/**
		 * The {@link TextEditor text editor} for which the visible ranges have changed.
		 */
		readonly textEditor: TextEditor;
		/**
		 * The new value for the {@link TextEditor.visibleRanges text editor's visible ranges}.
		 */
		readonly visibleRanges: readonly Range[];
	}

	/**
	 * Represents an event describing the change in a {@link TextEditor.options text editor's options}.
	 */
	export interface TextEditorOptionsChangeEvent {
		/**
		 * The {@link TextEditor text editor} for which the options have changed.
		 */
		readonly textEditor: TextEditor;
		/**
		 * The new value for the {@link TextEditor.options text editor's options}.
		 */
		readonly options: TextEditorOptions;
	}

	/**
	 * Represents an event describing the change of a {@link TextEditor.viewColumn text editor's view column}.
	 */
	export interface TextEditorViewColumnChangeEvent {
		/**
		 * The {@link TextEditor text editor} for which the view column has changed.
		 */
		readonly textEditor: TextEditor;
		/**
		 * The new value for the {@link TextEditor.viewColumn text editor's view column}.
		 */
		readonly viewColumn: ViewColumn;
	}

	/**
	 * Rendering style of the cursor.
	 */
	export enum TextEditorCursorStyle {
		/**
		 * Render the cursor as a vertical thick line.
		 */
		Line = 1,
		/**
		 * Render the cursor as a block filled.
		 */
		Block = 2,
		/**
		 * Render the cursor as a thick horizontal line.
		 */
		Underline = 3,
		/**
		 * Render the cursor as a vertical thin line.
		 */
		LineThin = 4,
		/**
		 * Render the cursor as a block outlined.
		 */
		BlockOutline = 5,
		/**
		 * Render the cursor as a thin horizontal line.
		 */
		UnderlineThin = 6
	}

	/**
	 * Rendering style of the line numbers.
	 */
	export enum TextEditorLineNumbersStyle {
		/**
		 * Do not render the line numbers.
		 */
		Off = 0,
		/**
		 * Render the line numbers.
		 */
		On = 1,
		/**
		 * Render the line numbers with values relative to the primary cursor location.
		 */
		Relative = 2,
		/**
		 * Render the line numbers on every 10th line number.
		 */
		Interval = 3,
	}

	/**
	 * Represents a {@link TextEditor text editor}'s {@link TextEditor.options options}.
	 */
	export interface TextEditorOptions {

		/**
		 * The size in spaces a tab takes. This is used for two purposes:
		 *  - the rendering width of a tab character;
		 *  - the number of spaces to insert when {@link TextEditorOptions.insertSpaces insertSpaces} is true
		 *    and `indentSize` is set to `"tabSize"`.
		 *
		 * When getting a text editor's options, this property will always be a number (resolved).
		 * When setting a text editor's options, this property is optional and it can be a number or `"auto"`.
		 */
		tabSize?: number | string;

		/**
		 * The number of spaces to insert when {@link TextEditorOptions.insertSpaces insertSpaces} is true.
		 *
		 * When getting a text editor's options, this property will always be a number (resolved).
		 * When setting a text editor's options, this property is optional and it can be a number or `"tabSize"`.
		 */
		indentSize?: number | string;

		/**
		 * When pressing Tab insert {@link TextEditorOptions.tabSize n} spaces.
		 * When getting a text editor's options, this property will always be a boolean (resolved).
		 * When setting a text editor's options, this property is optional and it can be a boolean or `"auto"`.
		 */
		insertSpaces?: boolean | string;

		/**
		 * The rendering style of the cursor in this editor.
		 * When getting a text editor's options, this property will always be present.
		 * When setting a text editor's options, this property is optional.
		 */
		cursorStyle?: TextEditorCursorStyle;

		/**
		 * Render relative line numbers w.r.t. the current line number.
		 * When getting a text editor's options, this property will always be present.
		 * When setting a text editor's options, this property is optional.
		 */
		lineNumbers?: TextEditorLineNumbersStyle;
	}

	/**
	 * Represents a handle to a set of decorations
	 * sharing the same {@link DecorationRenderOptions styling options} in a {@link TextEditor text editor}.
	 *
	 * To get an instance of a `TextEditorDecorationType` use
	 * {@link window.createTextEditorDecorationType createTextEditorDecorationType}.
	 */
	export interface TextEditorDecorationType {

		/**
		 * Internal representation of the handle.
		 */
		readonly key: string;

		/**
		 * Remove this decoration type and all decorations on all text editors using it.
		 */
		dispose(): void;
	}

	/**
	 * Represents different {@link TextEditor.revealRange reveal} strategies in a text editor.
	 */
	export enum TextEditorRevealType {
		/**
		 * The range will be revealed with as little scrolling as possible.
		 */
		Default = 0,
		/**
		 * The range will always be revealed in the center of the viewport.
		 */
		InCenter = 1,
		/**
		 * If the range is outside the viewport, it will be revealed in the center of the viewport.
		 * Otherwise, it will be revealed with as little scrolling as possible.
		 */
		InCenterIfOutsideViewport = 2,
		/**
		 * The range will always be revealed at the top of the viewport.
		 */
		AtTop = 3
	}

	/**
	 * Represents different positions for rendering a decoration in an {@link DecorationRenderOptions.overviewRulerLane overview ruler}.
	 * The overview ruler supports three lanes.
	 */
	export enum OverviewRulerLane {
		/**
		 * The left lane of the overview ruler.
		 */
		Left = 1,
		/**
		 * The center lane of the overview ruler.
		 */
		Center = 2,
		/**
		 * The right lane of the overview ruler.
		 */
		Right = 4,
		/**
		 * All lanes of the overview ruler.
		 */
		Full = 7
	}

	/**
	 * Describes the behavior of decorations when typing/editing at their edges.
	 */
	export enum DecorationRangeBehavior {
		/**
		 * The decoration's range will widen when edits occur at the start or end.
		 */
		OpenOpen = 0,
		/**
		 * The decoration's range will not widen when edits occur at the start or end.
		 */
		ClosedClosed = 1,
		/**
		 * The decoration's range will widen when edits occur at the start, but not at the end.
		 */
		OpenClosed = 2,
		/**
		 * The decoration's range will widen when edits occur at the end, but not at the start.
		 */
		ClosedOpen = 3
	}

	/**
	 * Represents options to configure the behavior of showing a {@link TextDocument document} in an {@link TextEditor editor}.
	 */
	export interface TextDocumentShowOptions {
		/**
		 * An optional view column in which the {@link TextEditor editor} should be shown.
		 * The default is the {@link ViewColumn.Active active}. Columns that do not exist
		 * will be created as needed up to the maximum of {@linkcode ViewColumn.Nine}.
		 * Use {@linkcode ViewColumn.Beside} to open the editor to the side of the currently
		 * active one.
		 */
		viewColumn?: ViewColumn;

		/**
		 * An optional flag that when `true` will stop the {@link TextEditor editor} from taking focus.
		 */
		preserveFocus?: boolean;

		/**
		 * An optional flag that controls if an {@link TextEditor editor}-tab shows as preview. Preview tabs will
		 * be replaced and reused until set to stay - either explicitly or through editing.
		 *
		 * *Note* that the flag is ignored if a user has disabled preview editors in settings.
		 */
		preview?: boolean;

		/**
		 * An optional selection to apply for the document in the {@link TextEditor editor}.
		 */
		selection?: Range;
	}

	/**
	 * Represents an event describing the change in a {@link NotebookEditor.selections notebook editor's selections}.
	 */
	export interface NotebookEditorSelectionChangeEvent {
		/**
		 * The {@link NotebookEditor notebook editor} for which the selections have changed.
		 */
		readonly notebookEditor: NotebookEditor;

		/**
		 * The new value for the {@link NotebookEditor.selections notebook editor's selections}.
		 */
		readonly selections: readonly NotebookRange[];
	}

	/**
	 * Represents an event describing the change in a {@link NotebookEditor.visibleRanges notebook editor's visibleRanges}.
	 */
	export interface NotebookEditorVisibleRangesChangeEvent {
		/**
		 * The {@link NotebookEditor notebook editor} for which the visible ranges have changed.
		 */
		readonly notebookEditor: NotebookEditor;

		/**
		 * The new value for the {@link NotebookEditor.visibleRanges notebook editor's visibleRanges}.
		 */
		readonly visibleRanges: readonly NotebookRange[];
	}

	/**
	 * Represents options to configure the behavior of showing a {@link NotebookDocument notebook document} in an {@link NotebookEditor notebook editor}.
	 */
	export interface NotebookDocumentShowOptions {
		/**
		 * An optional view column in which the {@link NotebookEditor notebook editor} should be shown.
		 * The default is the {@link ViewColumn.Active active}. Columns that do not exist
		 * will be created as needed up to the maximum of {@linkcode ViewColumn.Nine}.
		 * Use {@linkcode ViewColumn.Beside} to open the editor to the side of the currently
		 * active one.
		 */
		readonly viewColumn?: ViewColumn;

		/**
		 * An optional flag that when `true` will stop the {@link NotebookEditor notebook editor} from taking focus.
		 */
		readonly preserveFocus?: boolean;

		/**
		 * An optional flag that controls if an {@link NotebookEditor notebook editor}-tab shows as preview. Preview tabs will
		 * be replaced and reused until set to stay - either explicitly or through editing. The default behaviour depends
		 * on the `workbench.editor.enablePreview`-setting.
		 */
		readonly preview?: boolean;

		/**
		 * An optional selection to apply for the document in the {@link NotebookEditor notebook editor}.
		 */
		readonly selections?: readonly NotebookRange[];
	}

	/**
	 * A reference to one of the workbench colors as defined in https://code.visualstudio.com/api/references/theme-color.
	 * Using a theme color is preferred over a custom color as it gives theme authors and users the possibility to change the color.
	 */
	export class ThemeColor {

		/**
		 * The id of this color.
		 */
		readonly id: string;

		/**
		 * Creates a reference to a theme color.
		 * @param id of the color. The available colors are listed in https://code.visualstudio.com/api/references/theme-color.
		 */
		constructor(id: string);
	}

	/**
	 * A reference to a named icon. Currently, {@link ThemeIcon.File File}, {@link ThemeIcon.Folder Folder},
	 * and [ThemeIcon ids](https://code.visualstudio.com/api/references/icons-in-labels#icon-listing) are supported.
	 * Using a theme icon is preferred over a custom icon as it gives product theme authors the possibility to change the icons.
	 *
	 * *Note* that theme icons can also be rendered inside labels and descriptions. Places that support theme icons spell this out
	 * and they use the `$(<name>)`-syntax, for instance `quickPick.label = "Hello World $(globe)"`.
	 */
	export class ThemeIcon {
		/**
		 * Reference to an icon representing a file. The icon is taken from the current file icon theme or a placeholder icon is used.
		 */
		static readonly File: ThemeIcon;

		/**
		 * Reference to an icon representing a folder. The icon is taken from the current file icon theme or a placeholder icon is used.
		 */
		static readonly Folder: ThemeIcon;

		/**
		 * The id of the icon. The available icons are listed in https://code.visualstudio.com/api/references/icons-in-labels#icon-listing.
		 */
		readonly id: string;

		/**
		 * The optional ThemeColor of the icon. The color is currently only used in {@link TreeItem}.
		 */
		readonly color?: ThemeColor | undefined;

		/**
		 * Creates a reference to a theme icon.
		 * @param id id of the icon. The available icons are listed in https://code.visualstudio.com/api/references/icons-in-labels#icon-listing.
		 * @param color optional `ThemeColor` for the icon. The color is currently only used in {@link TreeItem}.
		 */
		constructor(id: string, color?: ThemeColor);
	}

	/**
	 * Represents an icon in the UI. This is either an uri, separate uris for the light- and dark-themes,
	 * or a {@link ThemeIcon theme icon}.
	 */
	export type IconPath = Uri | {
		/**
		 * The icon path for the light theme.
		 */
		light: Uri;
		/**
		 * The icon path for the dark theme.
		 */
		dark: Uri;
	} | ThemeIcon;

	/**
	 * Represents theme specific rendering styles for a {@link TextEditorDecorationType text editor decoration}.
	 */
	export interface ThemableDecorationRenderOptions {
		/**
		 * Background color of the decoration. Use rgba() and define transparent background colors to play well with other decorations.
		 * Alternatively a color from the color registry can be {@link ThemeColor referenced}.
		 */
		backgroundColor?: string | ThemeColor;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		outline?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 * Better use 'outline' for setting one or more of the individual outline properties.
		 */
		outlineColor?: string | ThemeColor;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 * Better use 'outline' for setting one or more of the individual outline properties.
		 */
		outlineStyle?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 * Better use 'outline' for setting one or more of the individual outline properties.
		 */
		outlineWidth?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		border?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 * Better use 'border' for setting one or more of the individual border properties.
		 */
		borderColor?: string | ThemeColor;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 * Better use 'border' for setting one or more of the individual border properties.
		 */
		borderRadius?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 * Better use 'border' for setting one or more of the individual border properties.
		 */
		borderSpacing?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 * Better use 'border' for setting one or more of the individual border properties.
		 */
		borderStyle?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 * Better use 'border' for setting one or more of the individual border properties.
		 */
		borderWidth?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		fontStyle?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		fontWeight?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		textDecoration?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		cursor?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		color?: string | ThemeColor;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		opacity?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		letterSpacing?: string;

		/**
		 * An **absolute path** or an URI to an image to be rendered in the gutter.
		 */
		gutterIconPath?: string | Uri;

		/**
		 * Specifies the size of the gutter icon.
		 * Available values are 'auto', 'contain', 'cover' and any percentage value.
		 * For further information: https://msdn.microsoft.com/en-us/library/jj127316(v=vs.85).aspx
		 */
		gutterIconSize?: string;

		/**
		 * The color of the decoration in the overview ruler. Use rgba() and define transparent colors to play well with other decorations.
		 */
		overviewRulerColor?: string | ThemeColor;

		/**
		 * Defines the rendering options of the attachment that is inserted before the decorated text.
		 */
		before?: ThemableDecorationAttachmentRenderOptions;

		/**
		 * Defines the rendering options of the attachment that is inserted after the decorated text.
		 */
		after?: ThemableDecorationAttachmentRenderOptions;
	}

	/**
	 * Represents theme specific rendering styles for {@link ThemableDecorationRenderOptions.before before} and
	 * {@link ThemableDecorationRenderOptions.after after} the content of text decorations.
	 */
	export interface ThemableDecorationAttachmentRenderOptions {
		/**
		 * Defines a text content that is shown in the attachment. Either an icon or a text can be shown, but not both.
		 */
		contentText?: string;
		/**
		 * An **absolute path** or an URI to an image to be rendered in the attachment. Either an icon
		 * or a text can be shown, but not both.
		 */
		contentIconPath?: string | Uri;
		/**
		 * CSS styling property that will be applied to the decoration attachment.
		 */
		border?: string;
		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		borderColor?: string | ThemeColor;
		/**
		 * CSS styling property that will be applied to the decoration attachment.
		 */
		fontStyle?: string;
		/**
		 * CSS styling property that will be applied to the decoration attachment.
		 */
		fontWeight?: string;
		/**
		 * CSS styling property that will be applied to the decoration attachment.
		 */
		textDecoration?: string;
		/**
		 * CSS styling property that will be applied to the decoration attachment.
		 */
		color?: string | ThemeColor;
		/**
		 * CSS styling property that will be applied to the decoration attachment.
		 */
		backgroundColor?: string | ThemeColor;
		/**
		 * CSS styling property that will be applied to the decoration attachment.
		 */
		margin?: string;
		/**
		 * CSS styling property that will be applied to the decoration attachment.
		 */
		width?: string;
		/**
		 * CSS styling property that will be applied to the decoration attachment.
		 */
		height?: string;
	}

	/**
	 * Represents rendering styles for a {@link TextEditorDecorationType text editor decoration}.
	 */
	export interface DecorationRenderOptions extends ThemableDecorationRenderOptions {
		/**
		 * Should the decoration be rendered also on the whitespace after the line text.
		 * Defaults to `false`.
		 */
		isWholeLine?: boolean;

		/**
		 * Customize the growing behavior of the decoration when edits occur at the edges of the decoration's range.
		 * Defaults to `DecorationRangeBehavior.OpenOpen`.
		 */
		rangeBehavior?: DecorationRangeBehavior;

		/**
		 * The position in the overview ruler where the decoration should be rendered.
		 */
		overviewRulerLane?: OverviewRulerLane;

		/**
		 * Overwrite options for light themes.
		 */
		light?: ThemableDecorationRenderOptions;

		/**
		 * Overwrite options for dark themes.
		 */
		dark?: ThemableDecorationRenderOptions;
	}

	/**
	 * Represents options for a specific decoration in a {@link TextEditorDecorationType decoration set}.
	 */
	export interface DecorationOptions {

		/**
		 * Range to which this decoration is applied. The range must not be empty.
		 */
		range: Range;

		/**
		 * A message that should be rendered when hovering over the decoration.
		 */
		hoverMessage?: MarkdownString | MarkedString | Array<MarkdownString | MarkedString>;

		/**
		 * Render options applied to the current decoration. For performance reasons, keep the
		 * number of decoration specific options small, and use decoration types wherever possible.
		 */
		renderOptions?: DecorationInstanceRenderOptions;
	}

	/**
	 * Represents themable render options for decoration instances.
	 */
	export interface ThemableDecorationInstanceRenderOptions {
		/**
		 * Defines the rendering options of the attachment that is inserted before the decorated text.
		 */
		before?: ThemableDecorationAttachmentRenderOptions;

		/**
		 * Defines the rendering options of the attachment that is inserted after the decorated text.
		 */
		after?: ThemableDecorationAttachmentRenderOptions;
	}

	/**
	 * Represents render options for decoration instances. See {@link DecorationOptions.renderOptions}.
	 */
	export interface DecorationInstanceRenderOptions extends ThemableDecorationInstanceRenderOptions {
		/**
		 * Overwrite options for light themes.
		 */
		light?: ThemableDecorationInstanceRenderOptions;

		/**
		 * Overwrite options for dark themes.
		 */
		dark?: ThemableDecorationInstanceRenderOptions;
	}

	/**
	 * Represents an editor that is attached to a {@link TextDocument document}.
	 */
	export interface TextEditor {

		/**
		 * The document associated with this text editor. The document will be the same for the entire lifetime of this text editor.
		 */
		readonly document: TextDocument;

		/**
		 * The primary selection on this text editor. Shorthand for `TextEditor.selections[0]`.
		 */
		selection: Selection;

		/**
		 * The selections in this text editor. The primary selection is always at index 0.
		 */
		selections: readonly Selection[];

		/**
		 * The current visible ranges in the editor (vertically).
		 * This accounts only for vertical scrolling, and not for horizontal scrolling.
		 */
		readonly visibleRanges: readonly Range[];

		/**
		 * Text editor options.
		 */
		options: TextEditorOptions;

		/**
		 * The column in which this editor shows. Will be `undefined` in case this
		 * isn't one of the main editors, e.g. an embedded editor, or when the editor
		 * column is larger than three.
		 */
		readonly viewColumn: ViewColumn | undefined;

		/**
		 * Perform an edit on the document associated with this text editor.
		 *
		 * The given callback-function is invoked with an {@link TextEditorEdit edit-builder} which must
		 * be used to make edits. Note that the edit-builder is only valid while the
		 * callback executes.
		 *
		 * @param callback A function which can create edits using an {@link TextEditorEdit edit-builder}.
		 * @param options The undo/redo behavior around this edit. By default, undo stops will be created before and after this edit.
		 * @returns A promise that resolves with a value indicating if the edits could be applied.
		 */
		edit(callback: (editBuilder: TextEditorEdit) => void, options?: {
			/**
			 * Add undo stop before making the edits.
			 */
			readonly undoStopBefore: boolean;
			/**
			 * Add undo stop after making the edits.
			 */
			readonly undoStopAfter: boolean;
		}): Thenable<boolean>;

		/**
		 * Insert a {@link SnippetString snippet} and put the editor into snippet mode. "Snippet mode"
		 * means the editor adds placeholders and additional cursors so that the user can complete
		 * or accept the snippet.
		 *
		 * @param snippet The snippet to insert in this edit.
		 * @param location Position or range at which to insert the snippet, defaults to the current editor selection or selections.
		 * @param options The undo/redo behavior around this edit. By default, undo stops will be created before and after this edit.
		 * @returns A promise that resolves with a value indicating if the snippet could be inserted. Note that the promise does not signal
		 * that the snippet is completely filled-in or accepted.
		 */
		insertSnippet(snippet: SnippetString, location?: Position | Range | readonly Position[] | readonly Range[], options?: {
			/**
			 * Add undo stop before making the edits.
			 */
			readonly undoStopBefore: boolean;
			/**
			 * Add undo stop after making the edits.
			 */
			readonly undoStopAfter: boolean;
			/**
			 * Keep whitespace of the {@link SnippetString.value} as is.
			 */
			readonly keepWhitespace?: boolean;
		}): Thenable<boolean>;

		/**
		 * Adds a set of decorations to the text editor. If a set of decorations already exists with
		 * the given {@link TextEditorDecorationType decoration type}, they will be replaced. If
		 * `rangesOrOptions` is empty, the existing decorations with the given {@link TextEditorDecorationType decoration type}
		 * will be removed.
		 *
		 * @see {@link window.createTextEditorDecorationType createTextEditorDecorationType}.
		 *
		 * @param decorationType A decoration type.
		 * @param rangesOrOptions Either {@link Range ranges} or more detailed {@link DecorationOptions options}.
		 */
		setDecorations(decorationType: TextEditorDecorationType, rangesOrOptions: readonly Range[] | readonly DecorationOptions[]): void;

		/**
		 * Scroll as indicated by `revealType` in order to reveal the given range.
		 *
		 * @param range A range.
		 * @param revealType The scrolling strategy for revealing `range`.
		 */
		revealRange(range: Range, revealType?: TextEditorRevealType): void;

		/**
		 * Show the text editor.
		 *
		 * @deprecated Use {@link window.showTextDocument} instead.
		 *
		 * @param column The {@link ViewColumn column} in which to show this editor.
		 * This method shows unexpected behavior and will be removed in the next major update.
		 */
		show(column?: ViewColumn): void;

		/**
		 * Hide the text editor.
		 *
		 * @deprecated Use the command `workbench.action.closeActiveEditor` instead.
		 * This method shows unexpected behavior and will be removed in the next major update.
		 */
		hide(): void;
	}

	/**
	 * Represents an end of line character sequence in a {@link TextDocument document}.
	 */
	export enum EndOfLine {
		/**
		 * The line feed `\n` character.
		 */
		LF = 1,
		/**
		 * The carriage return line feed `\r\n` sequence.
		 */
		CRLF = 2
	}

	/**
	 * A complex edit that will be applied in one transaction on a TextEditor.
	 * This holds a description of the edits and if the edits are valid (i.e. no overlapping regions, document was not changed in the meantime, etc.)
	 * they can be applied on a {@link TextDocument document} associated with a {@link TextEditor text editor}.
	 */
	export interface TextEditorEdit {
		/**
		 * Replace a certain text region with a new value.
		 * You can use `\r\n` or `\n` in `value` and they will be normalized to the current {@link TextDocument document}.
		 *
		 * @param location The range this operation should remove.
		 * @param value The new text this operation should insert after removing `location`.
		 */
		replace(location: Position | Range | Selection, value: string): void;

		/**
		 * Insert text at a location.
		 * You can use `\r\n` or `\n` in `value` and they will be normalized to the current {@link TextDocument document}.
		 * Although the equivalent text edit can be made with {@link TextEditorEdit.replace replace}, `insert` will produce a different resulting selection (it will get moved).
		 *
		 * @param location The position where the new text should be inserted.
		 * @param value The new text this operation should insert.
		 */
		insert(location: Position, value: string): void;

		/**
		 * Delete a certain text region.
		 *
		 * @param location The range this operation should remove.
		 */
		delete(location: Range | Selection): void;

		/**
		 * Set the end of line sequence.
		 *
		 * @param endOfLine The new end of line for the {@link TextDocument document}.
		 */
		setEndOfLine(endOfLine: EndOfLine): void;
	}

	/**
	 * A universal resource identifier representing either a file on disk
	 * or another resource, like untitled resources.
	 */
	export class Uri {

		/**
		 * Create an URI from a string, e.g. `http://www.example.com/some/path`,
		 * `file:///usr/home`, or `scheme:with/path`.
		 *
		 * *Note* that for a while uris without a `scheme` were accepted. That is not correct
		 * as all uris should have a scheme. To avoid breakage of existing code the optional
		 * `strict`-argument has been added. We *strongly* advise to use it, e.g. `Uri.parse('my:uri', true)`
		 *
		 * @see {@link Uri.toString}
		 * @param value The string value of an Uri.
		 * @param strict Throw an error when `value` is empty or when no `scheme` can be parsed.
		 * @returns A new Uri instance.
		 */
		static parse(value: string, strict?: boolean): Uri;

		/**
		 * Create an URI from a file system path. The {@link Uri.scheme scheme}
		 * will be `file`.
		 *
		 * The *difference* between {@link Uri.parse} and {@link Uri.file} is that the latter treats the argument
		 * as path, not as stringified-uri. E.g. `Uri.file(path)` is *not* the same as
		 * `Uri.parse('file://' + path)` because the path might contain characters that are
		 * interpreted (# and ?). See the following sample:
		 * ```ts
		 * const good = URI.file('/coding/c#/project1');
		 * good.scheme === 'file';
		 * good.path === '/coding/c#/project1';
		 * good.fragment === '';
		 *
		 * const bad = URI.parse('file://' + '/coding/c#/project1');
		 * bad.scheme === 'file';
		 * bad.path === '/coding/c'; // path is now broken
		 * bad.fragment === '/project1';
		 * ```
		 *
		 * @param path A file system or UNC path.
		 * @returns A new Uri instance.
		 */
		static file(path: string): Uri;

		/**
		 * Create a new uri which path is the result of joining
		 * the path of the base uri with the provided path segments.
		 *
		 * - Note 1: `joinPath` only affects the path component
		 * and all other components (scheme, authority, query, and fragment) are
		 * left as they are.
		 * - Note 2: The base uri must have a path; an error is thrown otherwise.
		 *
		 * The path segments are normalized in the following ways:
		 * - sequences of path separators (`/` or `\`) are replaced with a single separator
		 * - for `file`-uris on windows, the backslash-character (`\`) is considered a path-separator
		 * - the `..`-segment denotes the parent segment, the `.` denotes the current segment
		 * - paths have a root which always remains, for instance on windows drive-letters are roots
		 * so that is true: `joinPath(Uri.file('file:///c:/root'), '../../other').fsPath === 'c:/other'`
		 *
		 * @param base An uri. Must have a path.
		 * @param pathSegments One more more path fragments
		 * @returns A new uri which path is joined with the given fragments
		 */
		static joinPath(base: Uri, ...pathSegments: string[]): Uri;

		/**
		 * Create an URI from its component parts
		 *
		 * @see {@link Uri.toString}
		 * @param components The component parts of an Uri.
		 * @returns A new Uri instance.
		 */
		static from(components: {
			/**
			 * The scheme of the uri
			 */
			readonly scheme: string;
			/**
			 * The authority of the uri
			 */
			readonly authority?: string;
			/**
			 * The path of the uri
			 */
			readonly path?: string;
			/**
			 * The query string of the uri
			 */
			readonly query?: string;
			/**
			 * The fragment identifier of the uri
			 */
			readonly fragment?: string;
		}): Uri;

		/**
		 * Use the `file` and `parse` factory functions to create new `Uri` objects.
		 */
		private constructor(scheme: string, authority: string, path: string, query: string, fragment: string);

		/**
		 * Scheme is the `http` part of `http://www.example.com/some/path?query#fragment`.
		 * The part before the first colon.
		 */
		readonly scheme: string;

		/**
		 * Authority is the `www.example.com` part of `http://www.example.com/some/path?query#fragment`.
		 * The part between the first double slashes and the next slash.
		 */
		readonly authority: string;

		/**
		 * Path is the `/some/path` part of `http://www.example.com/some/path?query#fragment`.
		 */
		readonly path: string;

		/**
		 * Query is the `query` part of `http://www.example.com/some/path?query#fragment`.
		 */
		readonly query: string;

		/**
		 * Fragment is the `fragment` part of `http://www.example.com/some/path?query#fragment`.
		 */
		readonly fragment: string;

		/**
		 * The string representing the corresponding file system path of this Uri.
		 *
		 * Will handle UNC paths and normalize windows drive letters to lower-case. Also
		 * uses the platform specific path separator.
		 *
		 * * Will *not* validate the path for invalid characters and semantics.
		 * * Will *not* look at the scheme of this Uri.
		 * * The resulting string shall *not* be used for display purposes but
		 * for disk operations, like `readFile` et al.
		 *
		 * The *difference* to the {@linkcode Uri.path path}-property is the use of the platform specific
		 * path separator and the handling of UNC paths. The sample below outlines the difference:
		 * ```ts
		 * const u = URI.parse('file://server/c$/folder/file.txt')
		 * u.authority === 'server'
		 * u.path === '/c$/folder/file.txt'
		 * u.fsPath === '\\server\c$\folder\file.txt'
		 * ```
		 */
		readonly fsPath: string;

		/**
		 * Derive a new Uri from this Uri.
		 *
		 * ```ts
		 * let file = Uri.parse('before:some/file/path');
		 * let other = file.with({ scheme: 'after' });
		 * assert.ok(other.toString() === 'after:some/file/path');
		 * ```
		 *
		 * @param change An object that describes a change to this Uri. To unset components use `null` or
		 *  the empty string.
		 * @returns A new Uri that reflects the given change. Will return `this` Uri if the change
		 *  is not changing anything.
		 */
		with(change: {
			/**
			 * The new scheme, defaults to this Uri's scheme.
			 */
			scheme?: string;
			/**
			 * The new authority, defaults to this Uri's authority.
			 */
			authority?: string;
			/**
			 * The new path, defaults to this Uri's path.
			 */
			path?: string;
			/**
			 * The new query, defaults to this Uri's query.
			 */
			query?: string;
			/**
			 * The new fragment, defaults to this Uri's fragment.
			 */
			fragment?: string;
		}): Uri;

		/**
		 * Returns a string representation of this Uri. The representation and normalization
		 * of a URI depends on the scheme.
		 *
		 * * The resulting string can be safely used with {@link Uri.parse}.
		 * * The resulting string shall *not* be used for display purposes.
		 *
		 * *Note* that the implementation will encode _aggressive_ which often leads to unexpected,
		 * but not incorrect, results. For instance, colons are encoded to `%3A` which might be unexpected
		 * in file-uri. Also `&` and `=` will be encoded which might be unexpected for http-uris. For stability
		 * reasons this cannot be changed anymore. If you suffer from too aggressive encoding you should use
		 * the `skipEncoding`-argument: `uri.toString(true)`.
		 *
		 * @param skipEncoding Do not percentage-encode the result, defaults to `false`. Note that
		 *	the `#` and `?` characters occurring in the path will always be encoded.
		 * @returns A string representation of this Uri.
		 */
		toString(skipEncoding?: boolean): string;

		/**
		 * Returns a JSON representation of this Uri.
		 *
		 * @returns An object.
		 */
		toJSON(): any;
	}

	/**
	 * A cancellation token is passed to an asynchronous or long running
	 * operation to request cancellation, like cancelling a request
	 * for completion items because the user continued to type.
	 *
	 * To get an instance of a `CancellationToken` use a
	 * {@link CancellationTokenSource}.
	 */
	export interface CancellationToken {

		/**
		 * Is `true` when the token has been cancelled, `false` otherwise.
		 */
		isCancellationRequested: boolean;

		/**
		 * An {@link Event} which fires upon cancellation.
		 */
		onCancellationRequested: Event<any>;
	}

	/**
	 * A cancellation source creates and controls a {@link CancellationToken cancellation token}.
	 */
	export class CancellationTokenSource {

		/**
		 * The cancellation token of this source.
		 */
		token: CancellationToken;

		/**
		 * Signal cancellation on the token.
		 */
		cancel(): void;

		/**
		 * Dispose object and free resources.
		 */
		dispose(): void;
	}

	/**
	 * An error type that should be used to signal cancellation of an operation.
	 *
	 * This type can be used in response to a {@link CancellationToken cancellation token}
	 * being cancelled or when an operation is being cancelled by the
	 * executor of that operation.
	 */
	export class CancellationError extends Error {

		/**
		 * Creates a new cancellation error.
		 */
		constructor();
	}

	/**
	 * Represents a type which can release resources, such
	 * as event listening or a timer.
	 */
	export class Disposable {

		/**
		 * Combine many disposable-likes into one. You can use this method when having objects with
		 * a dispose function which aren't instances of `Disposable`.
		 *
		 * @param disposableLikes Objects that have at least a `dispose`-function member. Note that asynchronous
		 * dispose-functions aren't awaited.
		 * @returns Returns a new disposable which, upon dispose, will
		 * dispose all provided disposables.
		 */
		static from(...disposableLikes: {
			/**
			 * Function to clean up resources.
			 */
			dispose: () => any;
		}[]): Disposable;

		/**
		 * Creates a new disposable that calls the provided function
		 * on dispose.
		 *
		 * *Note* that an asynchronous function is not awaited.
		 *
		 * @param callOnDispose Function that disposes something.
		 */
		constructor(callOnDispose: () => any);

		/**
		 * Dispose this object.
		 */
		dispose(): any;
	}

	/**
	 * Represents a typed event.
	 *
	 * A function that represents an event to which you subscribe by calling it with
	 * a listener function as argument.
	 *
	 * @example
	 * item.onDidChange(function(event) { console.log("Event happened: " + event); });
	 */
	export interface Event<T> {

		/**
		 * A function that represents an event to which you subscribe by calling it with
		 * a listener function as argument.
		 *
		 * @param listener The listener function will be called when the event happens.
		 * @param thisArgs The `this`-argument which will be used when calling the event listener.
		 * @param disposables An array to which a {@link Disposable} will be added.
		 * @returns A disposable which unsubscribes the event listener.
		 */
		(listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
	}

	/**
	 * An event emitter can be used to create and manage an {@link Event} for others
	 * to subscribe to. One emitter always owns one event.
	 *
	 * Use this class if you want to provide event from within your extension, for instance
	 * inside a {@link TextDocumentContentProvider} or when providing
	 * API to other extensions.
	 */
	export class EventEmitter<T> {

		/**
		 * The event listeners can subscribe to.
		 */
		event: Event<T>;

		/**
		 * Notify all subscribers of the {@link EventEmitter.event event}. Failure
		 * of one or more listener will not fail this function call.
		 *
		 * @param data The event object.
		 */
		fire(data: T): void;

		/**
		 * Dispose this object and free resources.
		 */
		dispose(): void;
	}

	/**
	 * A file system watcher notifies about changes to files and folders
	 * on disk or from other {@link FileSystemProvider FileSystemProviders}.
	 *
	 * To get an instance of a `FileSystemWatcher` use
	 * {@link workspace.createFileSystemWatcher createFileSystemWatcher}.
	 */
	export interface FileSystemWatcher extends Disposable {

		/**
		 * true if this file system watcher has been created such that
		 * it ignores creation file system events.
		 */
		readonly ignoreCreateEvents: boolean;

		/**
		 * true if this file system watcher has been created such that
		 * it ignores change file system events.
		 */
		readonly ignoreChangeEvents: boolean;

		/**
		 * true if this file system watcher has been created such that
		 * it ignores delete file system events.
		 */
		readonly ignoreDeleteEvents: boolean;

		/**
		 * An event which fires on file/folder creation.
		 */
		readonly onDidCreate: Event<Uri>;

		/**
		 * An event which fires on file/folder change.
		 */
		readonly onDidChange: Event<Uri>;

		/**
		 * An event which fires on file/folder deletion.
		 */
		readonly onDidDelete: Event<Uri>;
	}

	/**
	 * A text document content provider allows to add readonly documents
	 * to the editor, such as source from a dll or generated html from md.
	 *
	 * Content providers are {@link workspace.registerTextDocumentContentProvider registered}
	 * for a {@link Uri.scheme uri-scheme}. When a uri with that scheme is to
	 * be {@link workspace.openTextDocument loaded} the content provider is
	 * asked.
	 */
	export interface TextDocumentContentProvider {

		/**
		 * An event to signal a resource has changed.
		 */
		onDidChange?: Event<Uri>;

		/**
		 * Provide textual content for a given uri.
		 *
		 * The editor will use the returned string-content to create a readonly
		 * {@link TextDocument document}. Resources allocated should be released when
		 * the corresponding document has been {@link workspace.onDidCloseTextDocument closed}.
		 *
		 * **Note**: The contents of the created {@link TextDocument document} might not be
		 * identical to the provided text due to end-of-line-sequence normalization.
		 *
		 * @param uri An uri which scheme matches the scheme this provider was {@link workspace.registerTextDocumentContentProvider registered} for.
		 * @param token A cancellation token.
		 * @returns A string or a thenable that resolves to such.
		 */
		provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string>;
	}

	/**
	 * The kind of {@link QuickPickItem quick pick item}.
	 */
	export enum QuickPickItemKind {
		/**
		 * When a {@link QuickPickItem} has a kind of {@link Separator}, the item is just a visual separator and does not represent a real item.
		 * The only property that applies is {@link QuickPickItem.label label }. All other properties on {@link QuickPickItem} will be ignored and have no effect.
		 */
		Separator = -1,
		/**
		 * The default {@link QuickPickItem.kind} is an item that can be selected in the quick pick.
		 */
		Default = 0,
	}

	/**
	 * Represents an item that can be selected from
	 * a list of items.
	 */
	export interface QuickPickItem {

		/**
		 * A human-readable string which is rendered prominent. Supports rendering of {@link ThemeIcon theme icons} via
		 * the `$(<name>)`-syntax.
		 *
		 * Note: When {@link QuickPickItem.kind kind} is set to {@link QuickPickItemKind.Default} (so a regular item
		 * instead of a separator), it supports rendering of {@link ThemeIcon theme icons} via the `$(<name>)`-syntax.
		 */
		label: string;

		/**
		 * The kind of QuickPickItem that will determine how this item is rendered in the quick pick. When not specified,
		 * the default is {@link QuickPickItemKind.Default}.
		 */
		kind?: QuickPickItemKind;

		/**
		 * The icon path or {@link ThemeIcon} for the QuickPickItem.
		 */
		iconPath?: IconPath;

		/**
		 * A human-readable string which is rendered less prominent in the same line. Supports rendering of
		 * {@link ThemeIcon theme icons} via the `$(<name>)`-syntax.
		 *
		 * Note: this property is ignored when {@link QuickPickItem.kind kind} is set to {@link QuickPickItemKind.Separator}
		 */
		description?: string;

		/**
		 * A human-readable string which is rendered less prominent in a separate line. Supports rendering of
		 * {@link ThemeIcon theme icons} via the `$(<name>)`-syntax.
		 *
		 * Note: this property is ignored when {@link QuickPickItem.kind kind} is set to {@link QuickPickItemKind.Separator}
		 */
		detail?: string;

		/**
		 * Optional flag indicating if this item is picked initially. This is only honored when using
		 * the {@link window.showQuickPick showQuickPick()} API. To do the same thing with
		 * the {@link window.createQuickPick createQuickPick()} API, simply set the {@link QuickPick.selectedItems}
		 * to the items you want picked initially.
		 * (*Note:* This is only honored when the picker allows multiple selections.)
		 *
		 * @see {@link QuickPickOptions.canPickMany}
		 *
		 * Note: this property is ignored when {@link QuickPickItem.kind kind} is set to {@link QuickPickItemKind.Separator}
		 */
		picked?: boolean;

		/**
		 * Always show this item.
		 *
		 * Note: this property is ignored when {@link QuickPickItem.kind kind} is set to {@link QuickPickItemKind.Separator}
		 */
		alwaysShow?: boolean;

		/**
		 * Optional buttons that will be rendered on this particular item. These buttons will trigger
		 * an {@link QuickPickItemButtonEvent} when clicked. Buttons are only rendered when using a quickpick
		 * created by the {@link window.createQuickPick createQuickPick()} API. Buttons are not rendered when using
		 * the {@link window.showQuickPick showQuickPick()} API.
		 *
		 * Note: this property is ignored when {@link QuickPickItem.kind kind} is set to {@link QuickPickItemKind.Separator}
		 */
		buttons?: readonly QuickInputButton[];
	}

	/**
	 * Options to configure the behavior of the quick pick UI.
	 */
	export interface QuickPickOptions {

		/**
		 * An optional string that represents the title of the quick pick.
		 */
		title?: string;

		/**
		 * An optional flag to include the description when filtering the picks.
		 */
		matchOnDescription?: boolean;

		/**
		 * An optional flag to include the detail when filtering the picks.
		 */
		matchOnDetail?: boolean;

		/**
		 * An optional string to show as placeholder in the input box to guide the user what to pick on.
		 */
		placeHolder?: string;

		/**
		 * Set to `true` to keep the picker open when focus moves to another part of the editor or to another window.
		 * This setting is ignored on iPad and is always false.
		 */
		ignoreFocusOut?: boolean;

		/**
		 * An optional flag to make the picker accept multiple selections, if true the result is an array of picks.
		 */
		canPickMany?: boolean;

		/**
		 * An optional function that is invoked whenever an item is selected.
		 */
		onDidSelectItem?(item: QuickPickItem | string): any;
	}

	/**
	 * Options to configure the behaviour of the {@link WorkspaceFolder workspace folder} pick UI.
	 */
	export interface WorkspaceFolderPickOptions {

		/**
		 * An optional string to show as placeholder in the input box to guide the user what to pick on.
		 */
		placeHolder?: string;

		/**
		 * Set to `true` to keep the picker open when focus moves to another part of the editor or to another window.
		 * This setting is ignored on iPad and is always false.
		 */
		ignoreFocusOut?: boolean;
	}

	/**
	 * Options to configure the behaviour of a file open dialog.
	 *
	 * * Note 1: On Windows and Linux, a file dialog cannot be both a file selector and a folder selector, so if you
	 * set both `canSelectFiles` and `canSelectFolders` to `true` on these platforms, a folder selector will be shown.
	 * * Note 2: Explicitly setting `canSelectFiles` and `canSelectFolders` to `false` is futile
	 * and the editor then silently adjusts the options to select files.
	 */
	export interface OpenDialogOptions {
		/**
		 * The resource the dialog shows when opened.
		 */
		defaultUri?: Uri;

		/**
		 * A human-readable string for the open button.
		 */
		openLabel?: string;

		/**
		 * Allow to select files, defaults to `true`.
		 */
		canSelectFiles?: boolean;

		/**
		 * Allow to select folders, defaults to `false`.
		 */
		canSelectFolders?: boolean;

		/**
		 * Allow to select many files or folders.
		 */
		canSelectMany?: boolean;

		/**
		 * A set of file filters that are used by the dialog. Each entry is a human-readable label,
		 * like "TypeScript", and an array of extensions, for example:
		 * ```ts
		 * {
		 * 	'Images': ['png', 'jpg'],
		 * 	'TypeScript': ['ts', 'tsx']
		 * }
		 * ```
		 */
		filters?: { [name: string]: string[] };

		/**
		 * Dialog title.
		 *
		 * This parameter might be ignored, as not all operating systems display a title on open dialogs
		 * (for example, macOS).
		 */
		title?: string;
	}

	/**
	 * Options to configure the behaviour of a file save dialog.
	 */
	export interface SaveDialogOptions {
		/**
		 * The resource the dialog shows when opened.
		 */
		defaultUri?: Uri;

		/**
		 * A human-readable string for the save button.
		 */
		saveLabel?: string;

		/**
		 * A set of file filters that are used by the dialog. Each entry is a human-readable label,
		 * like "TypeScript", and an array of extensions, for example:
		 * ```ts
		 * {
		 * 	'Images': ['png', 'jpg'],
		 * 	'TypeScript': ['ts', 'tsx']
		 * }
		 * ```
		 */
		filters?: { [name: string]: string[] };

		/**
		 * Dialog title.
		 *
		 * This parameter might be ignored, as not all operating systems display a title on save dialogs
		 * (for example, macOS).
		 */
		title?: string;
	}

	/**
	 * Represents an action that is shown with an information, warning, or
	 * error message.
	 *
	 * @see {@link window.showInformationMessage showInformationMessage}
	 * @see {@link window.showWarningMessage showWarningMessage}
	 * @see {@link window.showErrorMessage showErrorMessage}
	 */
	export interface MessageItem {

		/**
		 * A short title like 'Retry', 'Open Log' etc.
		 */
		title: string;

		/**
		 * A hint for modal dialogs that the item should be triggered
		 * when the user cancels the dialog (e.g. by pressing the ESC
		 * key).
		 *
		 * Note: this option is ignored for non-modal messages.
		 */
		isCloseAffordance?: boolean;
	}

	/**
	 * Options to configure the behavior of the message.
	 *
	 * @see {@link window.showInformationMessage showInformationMessage}
	 * @see {@link window.showWarningMessage showWarningMessage}
	 * @see {@link window.showErrorMessage showErrorMessage}
	 */
	export interface MessageOptions {

		/**
		 * Indicates that this message should be modal.
		 */
		modal?: boolean;

		/**
		 * Human-readable detail message that is rendered less prominent. _Note_ that detail
		 * is only shown for {@link MessageOptions.modal modal} messages.
		 */
		detail?: string;
	}

	/**
	 * Impacts the behavior and appearance of the validation message.
	 */
	/**
	 * The severity level for input box validation.
	 */
	export enum InputBoxValidationSeverity {
		/**
		 * Informational severity level.
		 */
		Info = 1,
		/**
		 * Warning severity level.
		 */
		Warning = 2,
		/**
		 * Error severity level.
		 */
		Error = 3
	}

	/**
	 * Object to configure the behavior of the validation message.
	 */
	export interface InputBoxValidationMessage {
		/**
		 * The validation message to display.
		 */
		readonly message: string;

		/**
		 * The severity of the validation message.
		 * NOTE: When using `InputBoxValidationSeverity.Error`, the user will not be allowed to accept (hit ENTER) the input.
		 * `Info` and `Warning` will still allow the InputBox to accept the input.
		 */
		readonly severity: InputBoxValidationSeverity;
	}

	/**
	 * Options to configure the behavior of the input box UI.
	 */
	export interface InputBoxOptions {

		/**
		 * An optional string that represents the title of the input box.
		 */
		title?: string;

		/**
		 * The value to pre-fill in the input box.
		 */
		value?: string;

		/**
		 * Selection of the pre-filled {@linkcode InputBoxOptions.value value}. Defined as tuple of two number where the
		 * first is the inclusive start index and the second the exclusive end index. When `undefined` the whole
		 * pre-filled value will be selected, when empty (start equals end) only the cursor will be set,
		 * otherwise the defined range will be selected.
		 */
		valueSelection?: [number, number];

		/**
		 * The text to display underneath the input box.
		 */
		prompt?: string;

		/**
		 * An optional string to show as placeholder in the input box to guide the user what to type.
		 */
		placeHolder?: string;

		/**
		 * Controls if a password input is shown. Password input hides the typed text.
		 */
		password?: boolean;

		/**
		 * Set to `true` to keep the input box open when focus moves to another part of the editor or to another window.
		 * This setting is ignored on iPad and is always false.
		 */
		ignoreFocusOut?: boolean;

		/**
		 * An optional function that will be called to validate input and to give a hint
		 * to the user.
		 *
		 * @param value The current value of the input box.
		 * @returns Either a human-readable string which is presented as an error message or an {@link InputBoxValidationMessage}
		 *  which can provide a specific message severity. Return `undefined`, `null`, or the empty string when 'value' is valid.
		 */
		validateInput?(value: string): string | InputBoxValidationMessage | undefined | null |
			Thenable<string | InputBoxValidationMessage | undefined | null>;
	}

	/**
	 * A relative pattern is a helper to construct glob patterns that are matched
	 * relatively to a base file path. The base path can either be an absolute file
	 * path as string or uri or a {@link WorkspaceFolder workspace folder}, which is the
	 * preferred way of creating the relative pattern.
	 */
	export class RelativePattern {

		/**
		 * A base file path to which this pattern will be matched against relatively. The
		 * file path must be absolute, should not have any trailing path separators and
		 * not include any relative segments (`.` or `..`).
		 */
		baseUri: Uri;

		/**
		 * A base file path to which this pattern will be matched against relatively.
		 *
		 * This matches the `fsPath` value of {@link RelativePattern.baseUri}.
		 *
		 * *Note:* updating this value will update {@link RelativePattern.baseUri} to
		 * be a uri with `file` scheme.
		 *
		 * @deprecated This property is deprecated, please use {@link RelativePattern.baseUri} instead.
		 */
		base: string;

		/**
		 * A file glob pattern like `*.{ts,js}` that will be matched on file paths
		 * relative to the base path.
		 *
		 * Example: Given a base of `/home/work/folder` and a file path of `/home/work/folder/index.js`,
		 * the file glob pattern will match on `index.js`.
		 */
		pattern: string;

		/**
		 * Creates a new relative pattern object with a base file path and pattern to match. This pattern
		 * will be matched on file paths relative to the base.
		 *
		 * Example:
		 * ```ts
		 * const folder = vscode.workspace.workspaceFolders?.[0];
		 * if (folder) {
		 *
		 *   // Match any TypeScript file in the root of this workspace folder
		 *   const pattern1 = new vscode.RelativePattern(folder, '*.ts');
		 *
		 *   // Match any TypeScript file in `someFolder` inside this workspace folder
		 *   const pattern2 = new vscode.RelativePattern(folder, 'someFolder/*.ts');
		 * }
		 * ```
		 *
		 * @param base A base to which this pattern will be matched against relatively. It is recommended
		 * to pass in a {@link WorkspaceFolder workspace folder} if the pattern should match inside the workspace.
		 * Otherwise, a uri or string should only be used if the pattern is for a file path outside the workspace.
		 * @param pattern A file glob pattern like `*.{ts,js}` that will be matched on paths relative to the base.
		 */
		constructor(base: WorkspaceFolder | Uri | string, pattern: string);
	}

	/**
	 * A file glob pattern to match file paths against. This can either be a glob pattern string
	 * (like `**​/*.{ts,js}` or `*.{ts,js}`) or a {@link RelativePattern relative pattern}.
	 *
	 * Glob patterns can have the following syntax:
	 * * `*` to match zero or more characters in a path segment
	 * * `?` to match on one character in a path segment
	 * * `**` to match any number of path segments, including none
	 * * `{}` to group conditions (e.g. `**​/*.{ts,js}` matches all TypeScript and JavaScript files)
	 * * `[]` to declare a range of characters to match in a path segment (e.g., `example.[0-9]` to match on `example.0`, `example.1`, …)
	 * * `[!...]` to negate a range of characters to match in a path segment (e.g., `example.[!0-9]` to match on `example.a`, `example.b`, but not `example.0`)
	 *
	 * Note: a backslash (`\`) is not valid within a glob pattern. If you have an existing file
	 * path to match against, consider to use the {@link RelativePattern relative pattern} support
	 * that takes care of converting any backslash into slash. Otherwise, make sure to convert
	 * any backslash to slash when creating the glob pattern.
	 */
	export type GlobPattern = string | RelativePattern;

	/**
	 * A document filter denotes a document by different properties like
	 * the {@link TextDocument.languageId language}, the {@link Uri.scheme scheme} of
	 * its resource, or a glob-pattern that is applied to the {@link TextDocument.fileName path}.
	 *
	 * @example <caption>A language filter that applies to typescript files on disk</caption>
	 * { language: 'typescript', scheme: 'file' }
	 *
	 * @example <caption>A language filter that applies to all package.json paths</caption>
	 * { language: 'json', pattern: '**​/package.json' }
	 */
	export interface DocumentFilter {

		/**
		 * A language id, like `typescript`.
		 */
		readonly language?: string;

		/**
		 * The {@link NotebookDocument.notebookType type} of a notebook, like `jupyter-notebook`. This allows
		 * to narrow down on the type of a notebook that a {@link NotebookCell.document cell document} belongs to.
		 *
		 * *Note* that setting the `notebookType`-property changes how `scheme` and `pattern` are interpreted. When set
		 * they are evaluated against the {@link NotebookDocument.uri notebook uri}, not the document uri.
		 *
		 * @example <caption>Match python document inside jupyter notebook that aren't stored yet (`untitled`)</caption>
		 * { language: 'python', notebookType: 'jupyter-notebook', scheme: 'untitled' }
		 */
		readonly notebookType?: string;

		/**
		 * A Uri {@link Uri.scheme scheme}, like `file` or `untitled`.
		 */
		readonly scheme?: string;

		/**
		 * A {@link GlobPattern glob pattern} that is matched on the absolute path of the document. Use a {@link RelativePattern relative pattern}
		 * to filter documents to a {@link WorkspaceFolder workspace folder}.
		 */
		readonly pattern?: GlobPattern;
	}

	/**
	 * A language selector is the combination of one or many language identifiers
	 * and {@link DocumentFilter language filters}.
	 *
	 * *Note* that a document selector that is just a language identifier selects *all*
	 * documents, even those that are not saved on disk. Only use such selectors when
	 * a feature works without further context, e.g. without the need to resolve related
	 * 'files'.
	 *
	 * @example
	 * let sel:DocumentSelector = { scheme: 'file', language: 'typescript' };
	 */
	export type DocumentSelector = DocumentFilter | string | ReadonlyArray<DocumentFilter | string>;

	/**
	 * A provider result represents the values a provider, like the {@linkcode HoverProvider},
	 * may return. For once this is the actual result type `T`, like `Hover`, or a thenable that resolves
	 * to that type `T`. In addition, `null` and `undefined` can be returned - either directly or from a
	 * thenable.
	 *
	 * The snippets below are all valid implementations of the {@linkcode HoverProvider}:
	 *
	 * ```ts
	 * let a: HoverProvider = {
	 * 	provideHover(doc, pos, token): ProviderResult<Hover> {
	 * 		return new Hover('Hello World');
	 * 	}
	 * }
	 *
	 * let b: HoverProvider = {
	 * 	provideHover(doc, pos, token): ProviderResult<Hover> {
	 * 		return new Promise(resolve => {
	 * 			resolve(new Hover('Hello World'));
	 * 	 	});
	 * 	}
	 * }
	 *
	 * let c: HoverProvider = {
	 * 	provideHover(doc, pos, token): ProviderResult<Hover> {
	 * 		return; // undefined
	 * 	}
	 * }
	 * ```
	 */
	export type ProviderResult<T> = T | undefined | null | Thenable<T | undefined | null>;

	/**
	 * Kind of a code action.
	 *
	 * Kinds are a hierarchical list of identifiers separated by `.`, e.g. `"refactor.extract.function"`.
	 *
	 * Code action kinds are used by the editor for UI elements such as the refactoring context menu. Users
	 * can also trigger code actions with a specific kind with the `editor.action.codeAction` command.
	 */
	export class CodeActionKind {
		/**
		 * Empty kind.
		 */
		static readonly Empty: CodeActionKind;

		/**
		 * Base kind for quickfix actions: `quickfix`.
		 *
		 * Quick fix actions address a problem in the code and are shown in the normal code action context menu.
		 */
		static readonly QuickFix: CodeActionKind;

		/**
		 * Base kind for refactoring actions: `refactor`
		 *
		 * Refactoring actions are shown in the refactoring context menu.
		 */
		static readonly Refactor: CodeActionKind;

		/**
		 * Base kind for refactoring extraction actions: `refactor.extract`
		 *
		 * Example extract actions:
		 *
		 * - Extract method
		 * - Extract function
		 * - Extract variable
		 * - Extract interface from class
		 * - ...
		 */
		static readonly RefactorExtract: CodeActionKind;

		/**
		 * Base kind for refactoring inline actions: `refactor.inline`
		 *
		 * Example inline actions:
		 *
		 * - Inline function
		 * - Inline variable
		 * - Inline constant
		 * - ...
		 */
		static readonly RefactorInline: CodeActionKind;

		/**
		 * Base kind for refactoring move actions: `refactor.move`
		 *
		 * Example move actions:
		 *
		 * - Move a function to a new file
		 * - Move a property between classes
		 * - Move method to base class
		 * - ...
		 */
		static readonly RefactorMove: CodeActionKind;

		/**
		 * Base kind for refactoring rewrite actions: `refactor.rewrite`
		 *
		 * Example rewrite actions:
		 *
		 * - Convert JavaScript function to class
		 * - Add or remove parameter
		 * - Encapsulate field
		 * - Make method static
		 * - ...
		 */
		static readonly RefactorRewrite: CodeActionKind;

		/**
		 * Base kind for source actions: `source`
		 *
		 * Source code actions apply to the entire file. They must be explicitly requested and will not show in the
		 * normal [lightbulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action) menu. Source actions
		 * can be run on save using `editor.codeActionsOnSave` and are also shown in the `source` context menu.
		 */
		static readonly Source: CodeActionKind;

		/**
		 * Base kind for an organize imports source action: `source.organizeImports`.
		 */
		static readonly SourceOrganizeImports: CodeActionKind;

		/**
		 * Base kind for auto-fix source actions: `source.fixAll`.
		 *
		 * Fix all actions automatically fix errors that have a clear fix that do not require user input.
		 * They should not suppress errors or perform unsafe fixes such as generating new types or classes.
		 */
		static readonly SourceFixAll: CodeActionKind;

		/**
		 * Base kind for all code actions applying to the entire notebook's scope. CodeActionKinds using
		 * this should always begin with `notebook.`
		 *
		 * This requires that new CodeActions be created for it and contributed via extensions.
		 * Pre-existing kinds can not just have the new `notebook.` prefix added to them, as the functionality
		 * is unique to the full-notebook scope.
		 *
		 * Notebook CodeActionKinds can be initialized as either of the following (both resulting in `notebook.source.xyz`):
		 * - `const newKind =  CodeActionKind.Notebook.append(CodeActionKind.Source.append('xyz').value)`
		 * - `const newKind =  CodeActionKind.Notebook.append('source.xyz')`
		 *
		 * Example Kinds/Actions:
		 * - `notebook.source.organizeImports` (might move all imports to a new top cell)
		 * - `notebook.source.normalizeVariableNames` (might rename all variables to a standardized casing format)
		 */
		static readonly Notebook: CodeActionKind;

		/**
		 * Private constructor, use static `CodeActionKind.XYZ` to derive from an existing code action kind.
		 *
		 * @param value The value of the kind, such as `refactor.extract.function`.
		 */
		private constructor(value: string);

		/**
		 * String value of the kind, e.g. `"refactor.extract.function"`.
		 */
		readonly value: string;

		/**
		 * Create a new kind by appending a more specific selector to the current kind.
		 *
		 * Does not modify the current kind.
		 */
		append(parts: string): CodeActionKind;

		/**
		 * Checks if this code action kind intersects `other`.
		 *
		 * The kind `"refactor.extract"` for example intersects `refactor`, `"refactor.extract"` and `"refactor.extract.function"`,
		 * but not `"unicorn.refactor.extract"`, or `"refactor.extractAll"`.
		 *
		 * @param other Kind to check.
		 */
		intersects(other: CodeActionKind): boolean;

		/**
		 * Checks if `other` is a sub-kind of this `CodeActionKind`.
		 *
		 * The kind `"refactor.extract"` for example contains `"refactor.extract"` and ``"refactor.extract.function"`,
		 * but not `"unicorn.refactor.extract"`, or `"refactor.extractAll"` or `refactor`.
		 *
		 * @param other Kind to check.
		 */
		contains(other: CodeActionKind): boolean;
	}

	/**
	 * The reason why code actions were requested.
	 */
	export enum CodeActionTriggerKind {
		/**
		 * Code actions were explicitly requested by the user or by an extension.
		 */
		Invoke = 1,

		/**
		 * Code actions were requested automatically.
		 *
		 * This typically happens when current selection in a file changes, but can
		 * also be triggered when file content changes.
		 */
		Automatic = 2,
	}

	/**
	 * Contains additional diagnostic information about the context in which
	 * a {@link CodeActionProvider.provideCodeActions code action} is run.
	 */
	export interface CodeActionContext {
		/**
		 * The reason why code actions were requested.
		 */
		readonly triggerKind: CodeActionTriggerKind;

		/**
		 * An array of diagnostics.
		 */
		readonly diagnostics: readonly Diagnostic[];

		/**
		 * Requested kind of actions to return.
		 *
		 * Actions not of this kind are filtered out before being shown by the [lightbulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action).
		 */
		readonly only: CodeActionKind | undefined;
	}

	/**
	 * A code action represents a change that can be performed in code, e.g. to fix a problem or
	 * to refactor code.
	 *
	 * A CodeAction must set either {@linkcode CodeAction.edit edit} and/or a {@linkcode CodeAction.command command}. If both are supplied, the `edit` is applied first, then the command is executed.
	 */
	export class CodeAction {

		/**
		 * A short, human-readable, title for this code action.
		 */
		title: string;

		/**
		 * A {@link WorkspaceEdit workspace edit} this code action performs.
		 */
		edit?: WorkspaceEdit;

		/**
		 * {@link Diagnostic Diagnostics} that this code action resolves.
		 */
		diagnostics?: Diagnostic[];

		/**
		 * A {@link Command} this code action executes.
		 *
		 * If this command throws an exception, the editor displays the exception message to users in the editor at the
		 * current cursor position.
		 */
		command?: Command;

		/**
		 * {@link CodeActionKind Kind} of the code action.
		 *
		 * Used to filter code actions.
		 */
		kind?: CodeActionKind;

		/**
		 * Marks this as a preferred action. Preferred actions are used by the `auto fix` command and can be targeted
		 * by keybindings.
		 *
		 * A quick fix should be marked preferred if it properly addresses the underlying error.
		 * A refactoring should be marked preferred if it is the most reasonable choice of actions to take.
		 */
		isPreferred?: boolean;

		/**
		 * Marks that the code action cannot currently be applied.
		 *
		 * - Disabled code actions are not shown in automatic [lightbulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action)
		 * code action menu.
		 *
		 * - Disabled actions are shown as faded out in the code action menu when the user request a more specific type
		 * of code action, such as refactorings.
		 *
		 * - If the user has a [keybinding](https://code.visualstudio.com/docs/editor/refactoring#_keybindings-for-code-actions)
		 * that auto applies a code action and only a disabled code actions are returned, the editor will show the user an
		 * error message with `reason` in the editor.
		 */
		disabled?: {
			/**
			 * Human readable description of why the code action is currently disabled.
			 *
			 * This is displayed in the code actions UI.
			 */
			readonly reason: string;
		};

		/**
		 * Creates a new code action.
		 *
		 * A code action must have at least a {@link CodeAction.title title} and {@link CodeAction.edit edits}
		 * and/or a {@link CodeAction.command command}.
		 *
		 * @param title The title of the code action.
		 * @param kind The kind of the code action.
		 */
		constructor(title: string, kind?: CodeActionKind);
	}

	/**
	 * Provides contextual actions for code. Code actions typically either fix problems or beautify/refactor code.
	 *
	 * Code actions are surfaced to users in a few different ways:
	 *
	 * - The [lightbulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action) feature, which shows
	 *   a list of code actions at the current cursor position. The lightbulb's list of actions includes both quick fixes
	 *   and refactorings.
	 * - As commands that users can run, such as `Refactor`. Users can run these from the command palette or with keybindings.
	 * - As source actions, such `Organize Imports`.
	 * - {@link CodeActionKind.QuickFix Quick fixes} are shown in the problems view.
	 * - Change applied on save by the `editor.codeActionsOnSave` setting.
	 */
	export interface CodeActionProvider<T extends CodeAction = CodeAction> {
		/**
		 * Get code actions for a given range in a document.
		 *
		 * Only return code actions that are relevant to user for the requested range. Also keep in mind how the
		 * returned code actions will appear in the UI. The lightbulb widget and `Refactor` commands for instance show
		 * returned code actions as a list, so do not return a large number of code actions that will overwhelm the user.
		 *
		 * @param document The document in which the command was invoked.
		 * @param range The selector or range for which the command was invoked. This will always be a
		 * {@link Selection selection} if the actions are being requested in the currently active editor.
		 * @param context Provides additional information about what code actions are being requested. You can use this
		 * to see what specific type of code actions are being requested by the editor in order to return more relevant
		 * actions and avoid returning irrelevant code actions that the editor will discard.
		 * @param token A cancellation token.
		 *
		 * @returns An array of code actions, such as quick fixes or refactorings. The lack of a result can be signaled
		 * by returning `undefined`, `null`, or an empty array.
		 *
		 * We also support returning `Command` for legacy reasons, however all new extensions should return
		 * `CodeAction` object instead.
		 */
		provideCodeActions(document: TextDocument, range: Range | Selection, context: CodeActionContext, token: CancellationToken): ProviderResult<Array<Command | T>>;

		/**
		 * Given a code action fill in its {@linkcode CodeAction.edit edit}-property. Changes to
		 * all other properties, like title, are ignored. A code action that has an edit
		 * will not be resolved.
		 *
		 * *Note* that a code action provider that returns commands, not code actions, cannot successfully
		 * implement this function. Returning commands is deprecated and instead code actions should be
		 * returned.
		 *
		 * @param codeAction A code action.
		 * @param token A cancellation token.
		 * @returns The resolved code action or a thenable that resolves to such. It is OK to return the given
		 * `item`. When no result is returned, the given `item` will be used.
		 */
		resolveCodeAction?(codeAction: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * Metadata about the type of code actions that a {@link CodeActionProvider} provides.
	 */
	export interface CodeActionProviderMetadata {
		/**
		 * List of {@link CodeActionKind CodeActionKinds} that a {@link CodeActionProvider} may return.
		 *
		 * This list is used to determine if a given `CodeActionProvider` should be invoked or not.
		 * To avoid unnecessary computation, every `CodeActionProvider` should list use `providedCodeActionKinds`. The
		 * list of kinds may either be generic, such as `[CodeActionKind.Refactor]`, or list out every kind provided,
		 * such as `[CodeActionKind.Refactor.Extract.append('function'), CodeActionKind.Refactor.Extract.append('constant'), ...]`.
		 */
		readonly providedCodeActionKinds?: readonly CodeActionKind[];

		/**
		 * Static documentation for a class of code actions.
		 *
		 * Documentation from the provider is shown in the code actions menu if either:
		 *
		 * - Code actions of `kind` are requested by the editor. In this case, the editor will show the documentation that
		 *   most closely matches the requested code action kind. For example, if a provider has documentation for
		 *   both `Refactor` and `RefactorExtract`, when the user requests code actions for `RefactorExtract`,
		 *   the editor will use the documentation for `RefactorExtract` instead of the documentation for `Refactor`.
		 *
		 * - Any code actions of `kind` are returned by the provider.
		 *
		 * At most one documentation entry will be shown per provider.
		 */
		readonly documentation?: ReadonlyArray<{
			/**
			 * The kind of the code action being documented.
			 *
			 * If the kind is generic, such as `CodeActionKind.Refactor`, the documentation will be shown whenever any
			 * refactorings are returned. If the kind if more specific, such as `CodeActionKind.RefactorExtract`, the
			 * documentation will only be shown when extract refactoring code actions are returned.
			 */
			readonly kind: CodeActionKind;

			/**
			 * Command that displays the documentation to the user.
			 *
			 * This can display the documentation directly in the editor or open a website using {@linkcode env.openExternal};
			 *
			 * The title of this documentation code action is taken from {@linkcode Command.title}
			 */
			readonly command: Command;
		}>;
	}

	/**
	 * A code lens represents a {@link Command} that should be shown along with
	 * source text, like the number of references, a way to run tests, etc.
	 *
	 * A code lens is _unresolved_ when no command is associated to it. For performance
	 * reasons the creation of a code lens and resolving should be done to two stages.
	 *
	 * @see {@link CodeLensProvider.provideCodeLenses}
	 * @see {@link CodeLensProvider.resolveCodeLens}
	 */
	export class CodeLens {

		/**
		 * The range in which this code lens is valid. Should only span a single line.
		 */
		range: Range;

		/**
		 * The command this code lens represents.
		 */
		command?: Command;

		/**
		 * `true` when there is a command associated.
		 */
		readonly isResolved: boolean;

		/**
		 * Creates a new code lens object.
		 *
		 * @param range The range to which this code lens applies.
		 * @param command The command associated to this code lens.
		 */
		constructor(range: Range, command?: Command);
	}

	/**
	 * A code lens provider adds {@link Command commands} to source text. The commands will be shown
	 * as dedicated horizontal lines in between the source text.
	 */
	export interface CodeLensProvider<T extends CodeLens = CodeLens> {

		/**
		 * An optional event to signal that the code lenses from this provider have changed.
		 */
		onDidChangeCodeLenses?: Event<void>;

		/**
		 * Compute a list of {@link CodeLens lenses}. This call should return as fast as possible and if
		 * computing the commands is expensive implementors should only return code lens objects with the
		 * range set and implement {@link CodeLensProvider.resolveCodeLens resolve}.
		 *
		 * @param document The document in which the command was invoked.
		 * @param token A cancellation token.
		 * @returns An array of code lenses or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideCodeLenses(document: TextDocument, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * This function will be called for each visible code lens, usually when scrolling and after
		 * calls to {@link CodeLensProvider.provideCodeLenses compute}-lenses.
		 *
		 * @param codeLens Code lens that must be resolved.
		 * @param token A cancellation token.
		 * @returns The given, resolved code lens or thenable that resolves to such.
		 */
		resolveCodeLens?(codeLens: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * Information about where a symbol is defined.
	 *
	 * Provides additional metadata over normal {@link Location} definitions, including the range of
	 * the defining symbol
	 */
	export type DefinitionLink = LocationLink;

	/**
	 * The definition of a symbol represented as one or many {@link Location locations}.
	 * For most programming languages there is only one location at which a symbol is
	 * defined.
	 */
	export type Definition = Location | Location[];

	/**
	 * The definition provider interface defines the contract between extensions and
	 * the [go to definition](https://code.visualstudio.com/docs/editor/editingevolved#_go-to-definition)
	 * and peek definition features.
	 */
	export interface DefinitionProvider {

		/**
		 * Provide the definition of the symbol at the given position and document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @returns A definition or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideDefinition(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Definition | DefinitionLink[]>;
	}

	/**
	 * The implementation provider interface defines the contract between extensions and
	 * the go to implementation feature.
	 */
	export interface ImplementationProvider {

		/**
		 * Provide the implementations of the symbol at the given position and document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @returns A definition or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideImplementation(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Definition | DefinitionLink[]>;
	}

	/**
	 * The type definition provider defines the contract between extensions and
	 * the go to type definition feature.
	 */
	export interface TypeDefinitionProvider {

		/**
		 * Provide the type definition of the symbol at the given position and document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @returns A definition or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideTypeDefinition(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Definition | DefinitionLink[]>;
	}

	/**
	 * The declaration of a symbol representation as one or many {@link Location locations}
	 * or {@link LocationLink location links}.
	 */
	export type Declaration = Location | Location[] | LocationLink[];

	/**
	 * The declaration provider interface defines the contract between extensions and
	 * the go to declaration feature.
	 */
	export interface DeclarationProvider {

		/**
		 * Provide the declaration of the symbol at the given position and document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @returns A declaration or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideDeclaration(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Declaration>;
	}

	/**
	 * Human-readable text that supports formatting via the [markdown syntax](https://commonmark.org).
	 *
	 * Rendering of {@link ThemeIcon theme icons} via the `$(<name>)`-syntax is supported
	 * when the {@linkcode supportThemeIcons} is set to `true`.
	 *
	 * Rendering of embedded html is supported when {@linkcode supportHtml} is set to `true`.
	 */
	export class MarkdownString {

		/**
		 * The markdown string.
		 */
		value: string;

		/**
		 * Indicates that this markdown string is from a trusted source. Only *trusted*
		 * markdown supports links that execute commands, e.g. `[Run it](command:myCommandId)`.
		 *
		 * Defaults to `false` (commands are disabled).
		 */
		isTrusted?: boolean | {
			/**
			 * A set of commend ids that are allowed to be executed by this markdown string.
			 */
			readonly enabledCommands: readonly string[];
		};

		/**
		 * Indicates that this markdown string can contain {@link ThemeIcon ThemeIcons}, e.g. `$(zap)`.
		 */
		supportThemeIcons?: boolean;

		/**
		 * Indicates that this markdown string can contain raw html tags. Defaults to `false`.
		 *
		 * When `supportHtml` is false, the markdown renderer will strip out any raw html tags
		 * that appear in the markdown text. This means you can only use markdown syntax for rendering.
		 *
		 * When `supportHtml` is true, the markdown render will also allow a safe subset of html tags
		 * and attributes to be rendered. See https://github.com/microsoft/vscode/blob/6d2920473c6f13759c978dd89104c4270a83422d/src/vs/base/browser/markdownRenderer.ts#L296
		 * for a list of all supported tags and attributes.
		 */
		supportHtml?: boolean;

		/**
		 * Uri that relative paths are resolved relative to.
		 *
		 * If the `baseUri` ends with `/`, it is considered a directory and relative paths in the markdown are resolved relative to that directory:
		 *
		 * ```ts
		 * const md = new vscode.MarkdownString(`[link](./file.js)`);
		 * md.baseUri = vscode.Uri.file('/path/to/dir/');
		 * // Here 'link' in the rendered markdown resolves to '/path/to/dir/file.js'
		 * ```
		 *
		 * If the `baseUri` is a file, relative paths in the markdown are resolved relative to the parent dir of that file:
		 *
		 * ```ts
		 * const md = new vscode.MarkdownString(`[link](./file.js)`);
		 * md.baseUri = vscode.Uri.file('/path/to/otherFile.js');
		 * // Here 'link' in the rendered markdown resolves to '/path/to/file.js'
		 * ```
		 */
		baseUri?: Uri;

		/**
		 * Creates a new markdown string with the given value.
		 *
		 * @param value Optional, initial value.
		 * @param supportThemeIcons Optional, Specifies whether {@link ThemeIcon ThemeIcons} are supported within the {@linkcode MarkdownString}.
		 */
		constructor(value?: string, supportThemeIcons?: boolean);

		/**
		 * Appends and escapes the given string to this markdown string.
		 * @param value Plain text.
		 */
		appendText(value: string): MarkdownString;

		/**
		 * Appends the given string 'as is' to this markdown string. When {@linkcode MarkdownString.supportThemeIcons supportThemeIcons} is `true`, {@link ThemeIcon ThemeIcons} in the `value` will be iconified.
		 * @param value Markdown string.
		 */
		appendMarkdown(value: string): MarkdownString;

		/**
		 * Appends the given string as codeblock using the provided language.
		 * @param value A code snippet.
		 * @param language An optional {@link languages.getLanguages language identifier}.
		 */
		appendCodeblock(value: string, language?: string): MarkdownString;
	}

	/**
	 * MarkedString can be used to render human-readable text. It is either a markdown string
	 * or a code-block that provides a language and a code snippet. Note that
	 * markdown strings will be sanitized - that means html will be escaped.
	 *
	 * @deprecated This type is deprecated, please use {@linkcode MarkdownString} instead.
	 */
	export type MarkedString = string | {
		/**
		 * The language of a markdown code block
		 * @deprecated please use {@linkcode MarkdownString} instead
		 */
		language: string;
		/**
		 * The code snippet of a markdown code block.
		 * @deprecated please use {@linkcode MarkdownString} instead
		 */
		value: string;
	};

	/**
	 * A hover represents additional information for a symbol or word. Hovers are
	 * rendered in a tooltip-like widget.
	 */
	export class Hover {

		/**
		 * The contents of this hover.
		 */
		contents: Array<MarkdownString | MarkedString>;

		/**
		 * The range to which this hover applies. When missing, the
		 * editor will use the range at the current position or the
		 * current position itself.
		 */
		range?: Range;

		/**
		 * Creates a new hover object.
		 *
		 * @param contents The contents of the hover.
		 * @param range The range to which the hover applies.
		 */
		constructor(contents: MarkdownString | MarkedString | Array<MarkdownString | MarkedString>, range?: Range);
	}

	/**
	 * The hover provider interface defines the contract between extensions and
	 * the [hover](https://code.visualstudio.com/docs/editor/intellisense)-feature.
	 */
	export interface HoverProvider {

		/**
		 * Provide a hover for the given position and document. Multiple hovers at the same
		 * position will be merged by the editor. A hover can have a range which defaults
		 * to the word range at the position when omitted.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @returns A hover or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideHover(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Hover>;
	}

	/**
	 * An EvaluatableExpression represents an expression in a document that can be evaluated by an active debugger or runtime.
	 * The result of this evaluation is shown in a tooltip-like widget.
	 * If only a range is specified, the expression will be extracted from the underlying document.
	 * An optional expression can be used to override the extracted expression.
	 * In this case the range is still used to highlight the range in the document.
	 */
	export class EvaluatableExpression {

		/**
		 * The range is used to extract the evaluatable expression from the underlying document and to highlight it.
		 */
		readonly range: Range;

		/**
		 * If specified the expression overrides the extracted expression.
		 */
		readonly expression?: string | undefined;

		/**
		 * Creates a new evaluatable expression object.
		 *
		 * @param range The range in the underlying document from which the evaluatable expression is extracted.
		 * @param expression If specified overrides the extracted expression.
		 */
		constructor(range: Range, expression?: string);
	}

	/**
	 * The evaluatable expression provider interface defines the contract between extensions and
	 * the debug hover. In this contract the provider returns an evaluatable expression for a given position
	 * in a document and the editor evaluates this expression in the active debug session and shows the result in a debug hover.
	 */
	export interface EvaluatableExpressionProvider {

		/**
		 * Provide an evaluatable expression for the given document and position.
		 * The editor will evaluate this expression in the active debug session and will show the result in the debug hover.
		 * The expression can be implicitly specified by the range in the underlying document or by explicitly returning an expression.
		 *
		 * @param document The document for which the debug hover is about to appear.
		 * @param position The line and character position in the document where the debug hover is about to appear.
		 * @param token A cancellation token.
		 * @returns An EvaluatableExpression or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideEvaluatableExpression(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<EvaluatableExpression>;
	}

	/**
	 * Provide inline value as text.
	 */
	export class InlineValueText {
		/**
		 * The document range for which the inline value applies.
		 */
		readonly range: Range;
		/**
		 * The text of the inline value.
		 */
		readonly text: string;
		/**
		 * Creates a new InlineValueText object.
		 *
		 * @param range The document line where to show the inline value.
		 * @param text The value to be shown for the line.
		 */
		constructor(range: Range, text: string);
	}

	/**
	 * Provide inline value through a variable lookup.
	 * If only a range is specified, the variable name will be extracted from the underlying document.
	 * An optional variable name can be used to override the extracted name.
	 */
	export class InlineValueVariableLookup {
		/**
		 * The document range for which the inline value applies.
		 * The range is used to extract the variable name from the underlying document.
		 */
		readonly range: Range;
		/**
		 * If specified the name of the variable to look up.
		 */
		readonly variableName?: string | undefined;
		/**
		 * How to perform the lookup.
		 */
		readonly caseSensitiveLookup: boolean;
		/**
		 * Creates a new InlineValueVariableLookup object.
		 *
		 * @param range The document line where to show the inline value.
		 * @param variableName The name of the variable to look up.
		 * @param caseSensitiveLookup How to perform the lookup. If missing lookup is case sensitive.
		 */
		constructor(range: Range, variableName?: string, caseSensitiveLookup?: boolean);
	}

	/**
	 * Provide an inline value through an expression evaluation.
	 * If only a range is specified, the expression will be extracted from the underlying document.
	 * An optional expression can be used to override the extracted expression.
	 */
	export class InlineValueEvaluatableExpression {
		/**
		 * The document range for which the inline value applies.
		 * The range is used to extract the evaluatable expression from the underlying document.
		 */
		readonly range: Range;
		/**
		 * If specified the expression overrides the extracted expression.
		 */
		readonly expression?: string | undefined;
		/**
		 * Creates a new InlineValueEvaluatableExpression object.
		 *
		 * @param range The range in the underlying document from which the evaluatable expression is extracted.
		 * @param expression If specified overrides the extracted expression.
		 */
		constructor(range: Range, expression?: string);
	}

	/**
	 * Inline value information can be provided by different means:
	 * - directly as a text value (class InlineValueText).
	 * - as a name to use for a variable lookup (class InlineValueVariableLookup)
	 * - as an evaluatable expression (class InlineValueEvaluatableExpression)
	 * The InlineValue types combines all inline value types into one type.
	 */
	export type InlineValue = InlineValueText | InlineValueVariableLookup | InlineValueEvaluatableExpression;

	/**
	 * A value-object that contains contextual information when requesting inline values from a InlineValuesProvider.
	 */
	export interface InlineValueContext {

		/**
		 * The stack frame (as a DAP Id) where the execution has stopped.
		 */
		readonly frameId: number;

		/**
		 * The document range where execution has stopped.
		 * Typically the end position of the range denotes the line where the inline values are shown.
		 */
		readonly stoppedLocation: Range;
	}

	/**
	 * The inline values provider interface defines the contract between extensions and the editor's debugger inline values feature.
	 * In this contract the provider returns inline value information for a given document range
	 * and the editor shows this information in the editor at the end of lines.
	 */
	export interface InlineValuesProvider {

		/**
		 * An optional event to signal that inline values have changed.
		 * @see {@link EventEmitter}
		 */
		onDidChangeInlineValues?: Event<void> | undefined;

		/**
		 * Provide "inline value" information for a given document and range.
		 * The editor calls this method whenever debugging stops in the given document.
		 * The returned inline values information is rendered in the editor at the end of lines.
		 *
		 * @param document The document for which the inline values information is needed.
		 * @param viewPort The visible document range for which inline values should be computed.
		 * @param context A bag containing contextual information like the current location.
		 * @param token A cancellation token.
		 * @returns An array of InlineValueDescriptors or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideInlineValues(document: TextDocument, viewPort: Range, context: InlineValueContext, token: CancellationToken): ProviderResult<InlineValue[]>;
	}

	/**
	 * A document highlight kind.
	 */
	export enum DocumentHighlightKind {

		/**
		 * A textual occurrence.
		 */
		Text = 0,

		/**
		 * Read-access of a symbol, like reading a variable.
		 */
		Read = 1,

		/**
		 * Write-access of a symbol, like writing to a variable.
		 */
		Write = 2
	}

	/**
	 * A document highlight is a range inside a text document which deserves
	 * special attention. Usually a document highlight is visualized by changing
	 * the background color of its range.
	 */
	export class DocumentHighlight {

		/**
		 * The range this highlight applies to.
		 */
		range: Range;

		/**
		 * The highlight kind, default is {@link DocumentHighlightKind.Text text}.
		 */
		kind?: DocumentHighlightKind;

		/**
		 * Creates a new document highlight object.
		 *
		 * @param range The range the highlight applies to.
		 * @param kind The highlight kind, default is {@link DocumentHighlightKind.Text text}.
		 */
		constructor(range: Range, kind?: DocumentHighlightKind);
	}

	/**
	 * The document highlight provider interface defines the contract between extensions and
	 * the word-highlight-feature.
	 */
	export interface DocumentHighlightProvider {

		/**
		 * Provide a set of document highlights, like all occurrences of a variable or
		 * all exit-points of a function.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @returns An array of document highlights or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideDocumentHighlights(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<DocumentHighlight[]>;
	}

	/**
	 * A symbol kind.
	 */
	export enum SymbolKind {
		/**
		 * The `File` symbol kind.
		 */
		File = 0,
		/**
		 * The `Module` symbol kind.
		 */
		Module = 1,
		/**
		 * The `Namespace` symbol kind.
		 */
		Namespace = 2,
		/**
		 * The `Package` symbol kind.
		 */
		Package = 3,
		/**
		 * The `Class` symbol kind.
		 */
		Class = 4,
		/**
		 * The `Method` symbol kind.
		 */
		Method = 5,
		/**
		 * The `Property` symbol kind.
		 */
		Property = 6,
		/**
		 * The `Field` symbol kind.
		 */
		Field = 7,
		/**
		 * The `Constructor` symbol kind.
		 */
		Constructor = 8,
		/**
		 * The `Enum` symbol kind.
		 */
		Enum = 9,
		/**
		 * The `Interface` symbol kind.
		 */
		Interface = 10,
		/**
		 * The `Function` symbol kind.
		 */
		Function = 11,
		/**
		 * The `Variable` symbol kind.
		 */
		Variable = 12,
		/**
		 * The `Constant` symbol kind.
		 */
		Constant = 13,
		/**
		 * The `String` symbol kind.
		 */
		String = 14,
		/**
		 * The `Number` symbol kind.
		 */
		Number = 15,
		/**
		 * The `Boolean` symbol kind.
		 */
		Boolean = 16,
		/**
		 * The `Array` symbol kind.
		 */
		Array = 17,
		/**
		 * The `Object` symbol kind.
		 */
		Object = 18,
		/**
		 * The `Key` symbol kind.
		 */
		Key = 19,
		/**
		 * The `Null` symbol kind.
		 */
		Null = 20,
		/**
		 * The `EnumMember` symbol kind.
		 */
		EnumMember = 21,
		/**
		 * The `Struct` symbol kind.
		 */
		Struct = 22,
		/**
		 * The `Event` symbol kind.
		 */
		Event = 23,
		/**
		 * The `Operator` symbol kind.
		 */
		Operator = 24,
		/**
		 * The `TypeParameter` symbol kind.
		 */
		TypeParameter = 25
	}

	/**
	 * Symbol tags are extra annotations that tweak the rendering of a symbol.
	 */
	export enum SymbolTag {

		/**
		 * Render a symbol as obsolete, usually using a strike-out.
		 */
		Deprecated = 1
	}

	/**
	 * Represents information about programming constructs like variables, classes,
	 * interfaces etc.
	 */
	export class SymbolInformation {

		/**
		 * The name of this symbol.
		 */
		name: string;

		/**
		 * The name of the symbol containing this symbol.
		 */
		containerName: string;

		/**
		 * The kind of this symbol.
		 */
		kind: SymbolKind;

		/**
		 * Tags for this symbol.
		 */
		tags?: readonly SymbolTag[];

		/**
		 * The location of this symbol.
		 */
		location: Location;

		/**
		 * Creates a new symbol information object.
		 *
		 * @param name The name of the symbol.
		 * @param kind The kind of the symbol.
		 * @param containerName The name of the symbol containing the symbol.
		 * @param location The location of the symbol.
		 */
		constructor(name: string, kind: SymbolKind, containerName: string, location: Location);

		/**
		 * Creates a new symbol information object.
		 *
		 * @deprecated Please use the constructor taking a {@link Location} object.
		 *
		 * @param name The name of the symbol.
		 * @param kind The kind of the symbol.
		 * @param range The range of the location of the symbol.
		 * @param uri The resource of the location of symbol, defaults to the current document.
		 * @param containerName The name of the symbol containing the symbol.
		 */
		constructor(name: string, kind: SymbolKind, range: Range, uri?: Uri, containerName?: string);
	}

	/**
	 * Represents programming constructs like variables, classes, interfaces etc. that appear in a document. Document
	 * symbols can be hierarchical and they have two ranges: one that encloses its definition and one that points to
	 * its most interesting range, e.g. the range of an identifier.
	 */
	export class DocumentSymbol {

		/**
		 * The name of this symbol.
		 */
		name: string;

		/**
		 * More detail for this symbol, e.g. the signature of a function.
		 */
		detail: string;

		/**
		 * The kind of this symbol.
		 */
		kind: SymbolKind;

		/**
		 * Tags for this symbol.
		 */
		tags?: readonly SymbolTag[];

		/**
		 * The range enclosing this symbol not including leading/trailing whitespace but everything else, e.g. comments and code.
		 */
		range: Range;

		/**
		 * The range that should be selected and reveal when this symbol is being picked, e.g. the name of a function.
		 * Must be contained by the {@linkcode DocumentSymbol.range range}.
		 */
		selectionRange: Range;

		/**
		 * Children of this symbol, e.g. properties of a class.
		 */
		children: DocumentSymbol[];

		/**
		 * Creates a new document symbol.
		 *
		 * @param name The name of the symbol.
		 * @param detail Details for the symbol.
		 * @param kind The kind of the symbol.
		 * @param range The full range of the symbol.
		 * @param selectionRange The range that should be reveal.
		 */
		constructor(name: string, detail: string, kind: SymbolKind, range: Range, selectionRange: Range);
	}

	/**
	 * The document symbol provider interface defines the contract between extensions and
	 * the [go to symbol](https://code.visualstudio.com/docs/editor/editingevolved#_go-to-symbol)-feature.
	 */
	export interface DocumentSymbolProvider {

		/**
		 * Provide symbol information for the given document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param token A cancellation token.
		 * @returns An array of document highlights or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideDocumentSymbols(document: TextDocument, token: CancellationToken): ProviderResult<SymbolInformation[] | DocumentSymbol[]>;
	}

	/**
	 * Metadata about a document symbol provider.
	 */
	export interface DocumentSymbolProviderMetadata {
		/**
		 * A human-readable string that is shown when multiple outlines trees show for one document.
		 */
		label?: string;
	}

	/**
	 * The workspace symbol provider interface defines the contract between extensions and
	 * the [symbol search](https://code.visualstudio.com/docs/editor/editingevolved#_open-symbol-by-name)-feature.
	 */
	export interface WorkspaceSymbolProvider<T extends SymbolInformation = SymbolInformation> {

		/**
		 * Project-wide search for a symbol matching the given query string.
		 *
		 * The `query`-parameter should be interpreted in a *relaxed way* as the editor will apply its own highlighting
		 * and scoring on the results. A good rule of thumb is to match case-insensitive and to simply check that the
		 * characters of *query* appear in their order in a candidate symbol. Don't use prefix, substring, or similar
		 * strict matching.
		 *
		 * To improve performance implementors can implement `resolveWorkspaceSymbol` and then provide symbols with partial
		 * {@link SymbolInformation.location location}-objects, without a `range` defined. The editor will then call
		 * `resolveWorkspaceSymbol` for selected symbols only, e.g. when opening a workspace symbol.
		 *
		 * @param query A query string, can be the empty string in which case all symbols should be returned.
		 * @param token A cancellation token.
		 * @returns An array of document highlights or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideWorkspaceSymbols(query: string, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Given a symbol fill in its {@link SymbolInformation.location location}. This method is called whenever a symbol
		 * is selected in the UI. Providers can implement this method and return incomplete symbols from
		 * {@linkcode WorkspaceSymbolProvider.provideWorkspaceSymbols provideWorkspaceSymbols} which often helps to improve
		 * performance.
		 *
		 * @param symbol The symbol that is to be resolved. Guaranteed to be an instance of an object returned from an
		 * earlier call to `provideWorkspaceSymbols`.
		 * @param token A cancellation token.
		 * @returns The resolved symbol or a thenable that resolves to that. When no result is returned,
		 * the given `symbol` is used.
		 */
		resolveWorkspaceSymbol?(symbol: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * Value-object that contains additional information when
	 * requesting references.
	 */
	export interface ReferenceContext {

		/**
		 * Include the declaration of the current symbol.
		 */
		readonly includeDeclaration: boolean;
	}

	/**
	 * The reference provider interface defines the contract between extensions and
	 * the [find references](https://code.visualstudio.com/docs/editor/editingevolved#_peek)-feature.
	 */
	export interface ReferenceProvider {

		/**
		 * Provide a set of project-wide references for the given position and document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param context Additional information about the references request.
		 * @param token A cancellation token.
		 *
		 * @returns An array of locations or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): ProviderResult<Location[]>;
	}

	/**
	 * A text edit represents edits that should be applied
	 * to a document.
	 */
	export class TextEdit {

		/**
		 * Utility to create a replace edit.
		 *
		 * @param range A range.
		 * @param newText A string.
		 * @returns A new text edit object.
		 */
		static replace(range: Range, newText: string): TextEdit;

		/**
		 * Utility to create an insert edit.
		 *
		 * @param position A position, will become an empty range.
		 * @param newText A string.
		 * @returns A new text edit object.
		 */
		static insert(position: Position, newText: string): TextEdit;

		/**
		 * Utility to create a delete edit.
		 *
		 * @param range A range.
		 * @returns A new text edit object.
		 */
		static delete(range: Range): TextEdit;

		/**
		 * Utility to create an eol-edit.
		 *
		 * @param eol An eol-sequence
		 * @returns A new text edit object.
		 */
		static setEndOfLine(eol: EndOfLine): TextEdit;

		/**
		 * The range this edit applies to.
		 */
		range: Range;

		/**
		 * The string this edit will insert.
		 */
		newText: string;

		/**
		 * The eol-sequence used in the document.
		 *
		 * *Note* that the eol-sequence will be applied to the
		 * whole document.
		 */
		newEol?: EndOfLine;

		/**
		 * Create a new TextEdit.
		 *
		 * @param range A range.
		 * @param newText A string.
		 */
		constructor(range: Range, newText: string);
	}

	/**
	 * A snippet edit represents an interactive edit that is performed by
	 * the editor.
	 *
	 * *Note* that a snippet edit can always be performed as a normal {@link TextEdit text edit}.
	 * This will happen when no matching editor is open or when a {@link WorkspaceEdit workspace edit}
	 * contains snippet edits for multiple files. In that case only those that match the active editor
	 * will be performed as snippet edits and the others as normal text edits.
	 */
	export class SnippetTextEdit {

		/**
		 * Utility to create a replace snippet edit.
		 *
		 * @param range A range.
		 * @param snippet A snippet string.
		 * @returns A new snippet edit object.
		 */
		static replace(range: Range, snippet: SnippetString): SnippetTextEdit;

		/**
		 * Utility to create an insert snippet edit.
		 *
		 * @param position A position, will become an empty range.
		 * @param snippet A snippet string.
		 * @returns A new snippet edit object.
		 */
		static insert(position: Position, snippet: SnippetString): SnippetTextEdit;

		/**
		 * The range this edit applies to.
		 */
		range: Range;

		/**
		 * The {@link SnippetString snippet} this edit will perform.
		 */
		snippet: SnippetString;

		/**
		 * Whether the snippet edit should be applied with existing whitespace preserved.
		 */
		keepWhitespace?: boolean;

		/**
		 * Create a new snippet edit.
		 *
		 * @param range A range.
		 * @param snippet A snippet string.
		 */
		constructor(range: Range, snippet: SnippetString);
	}

	/**
	 * A notebook edit represents edits that should be applied to the contents of a notebook.
	 */
	export class NotebookEdit {

		/**
		 * Utility to create a edit that replaces cells in a notebook.
		 *
		 * @param range The range of cells to replace
		 * @param newCells The new notebook cells.
		 */
		static replaceCells(range: NotebookRange, newCells: NotebookCellData[]): NotebookEdit;

		/**
		 * Utility to create an edit that replaces cells in a notebook.
		 *
		 * @param index The index to insert cells at.
		 * @param newCells The new notebook cells.
		 */
		static insertCells(index: number, newCells: NotebookCellData[]): NotebookEdit;

		/**
		 * Utility to create an edit that deletes cells in a notebook.
		 *
		 * @param range The range of cells to delete.
		 */
		static deleteCells(range: NotebookRange): NotebookEdit;

		/**
		 * Utility to create an edit that update a cell's metadata.
		 *
		 * @param index The index of the cell to update.
		 * @param newCellMetadata The new metadata for the cell.
		 */
		static updateCellMetadata(index: number, newCellMetadata: { [key: string]: any }): NotebookEdit;

		/**
		 * Utility to create an edit that updates the notebook's metadata.
		 *
		 * @param newNotebookMetadata The new metadata for the notebook.
		 */
		static updateNotebookMetadata(newNotebookMetadata: { [key: string]: any }): NotebookEdit;

		/**
		 * Range of the cells being edited. May be empty.
		 */
		range: NotebookRange;

		/**
		 * New cells being inserted. May be empty.
		 */
		newCells: NotebookCellData[];

		/**
		 * Optional new metadata for the cells.
		 */
		newCellMetadata?: { [key: string]: any };

		/**
		 * Optional new metadata for the notebook.
		 */
		newNotebookMetadata?: { [key: string]: any };

		/**
		 * Create a new notebook edit.
		 *
		 * @param range A notebook range.
		 * @param newCells An array of new cell data.
		 */
		constructor(range: NotebookRange, newCells: NotebookCellData[]);
	}

	/**
	 * Additional data for entries of a workspace edit. Supports to label entries and marks entries
	 * as needing confirmation by the user. The editor groups edits with equal labels into tree nodes,
	 * for instance all edits labelled with "Changes in Strings" would be a tree node.
	 */
	export interface WorkspaceEditEntryMetadata {

		/**
		 * A flag which indicates that user confirmation is needed.
		 */
		needsConfirmation: boolean;

		/**
		 * A human-readable string which is rendered prominent.
		 */
		label: string;

		/**
		 * A human-readable string which is rendered less prominent on the same line.
		 */
		description?: string;

		/**
		 * The icon path or {@link ThemeIcon} for the edit.
		 */
		iconPath?: IconPath;
	}

	/**
	 * Additional data about a workspace edit.
	 */
	export interface WorkspaceEditMetadata {
		/**
		 * Signal to the editor that this edit is a refactoring.
		 */
		isRefactoring?: boolean;
	}

	/**
	 * A workspace edit is a collection of textual and files changes for
	 * multiple resources and documents.
	 *
	 * Use the {@link workspace.applyEdit applyEdit}-function to apply a workspace edit.
	 */
	export class WorkspaceEdit {

		/**
		 * The number of affected resources of textual or resource changes.
		 */
		readonly size: number;

		/**
		 * Replace the given range with given text for the given resource.
		 *
		 * @param uri A resource identifier.
		 * @param range A range.
		 * @param newText A string.
		 * @param metadata Optional metadata for the entry.
		 */
		replace(uri: Uri, range: Range, newText: string, metadata?: WorkspaceEditEntryMetadata): void;

		/**
		 * Insert the given text at the given position.
		 *
		 * @param uri A resource identifier.
		 * @param position A position.
		 * @param newText A string.
		 * @param metadata Optional metadata for the entry.
		 */
		insert(uri: Uri, position: Position, newText: string, metadata?: WorkspaceEditEntryMetadata): void;

		/**
		 * Delete the text at the given range.
		 *
		 * @param uri A resource identifier.
		 * @param range A range.
		 * @param metadata Optional metadata for the entry.
		 */
		delete(uri: Uri, range: Range, metadata?: WorkspaceEditEntryMetadata): void;

		/**
		 * Check if a text edit for a resource exists.
		 *
		 * @param uri A resource identifier.
		 * @returns `true` if the given resource will be touched by this edit.
		 */
		has(uri: Uri): boolean;

		/**
		 * Set (and replace) text edits or snippet edits for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of edits.
		 */
		set(uri: Uri, edits: ReadonlyArray<TextEdit | SnippetTextEdit>): void;

		/**
		 * Set (and replace) text edits or snippet edits with metadata for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of edits.
		 */
		set(uri: Uri, edits: ReadonlyArray<[TextEdit | SnippetTextEdit, WorkspaceEditEntryMetadata | undefined]>): void;

		/**
		 * Set (and replace) notebook edits for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of edits.
		 */
		set(uri: Uri, edits: readonly NotebookEdit[]): void;

		/**
		 * Set (and replace) notebook edits with metadata for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of edits.
		 */
		set(uri: Uri, edits: ReadonlyArray<[NotebookEdit, WorkspaceEditEntryMetadata | undefined]>): void;

		/**
		 * Get the text edits for a resource.
		 *
		 * @param uri A resource identifier.
		 * @returns An array of text edits.
		 */
		get(uri: Uri): TextEdit[];

		/**
		 * Create a regular file.
		 *
		 * @param uri Uri of the new file.
		 * @param options Defines if an existing file should be overwritten or be
		 * ignored. When `overwrite` and `ignoreIfExists` are both set `overwrite` wins.
		 * When both are unset and when the file already exists then the edit cannot
		 * be applied successfully. The `content`-property allows to set the initial contents
		 * the file is being created with.
		 * @param metadata Optional metadata for the entry.
		 */
		createFile(uri: Uri, options?: {
			/**
			 * Overwrite existing file. Overwrite wins over `ignoreIfExists`
			 */
			readonly overwrite?: boolean;
			/**
			 * Do nothing if a file with `uri` exists already.
			 */
			readonly ignoreIfExists?: boolean;
			/**
			 * The initial contents of the new file.
			 *
			 * If creating a file from a {@link DocumentDropEditProvider drop operation}, you can
			 * pass in a {@link DataTransferFile} to improve performance by avoiding extra data copying.
			 */
			readonly contents?: Uint8Array | DataTransferFile;
		}, metadata?: WorkspaceEditEntryMetadata): void;

		/**
		 * Delete a file or folder.
		 *
		 * @param uri The uri of the file that is to be deleted.
		 * @param metadata Optional metadata for the entry.
		 */
		deleteFile(uri: Uri, options?: {
			/**
			 * Delete the content recursively if a folder is denoted.
			 */
			readonly recursive?: boolean;
			/**
			 * Do nothing if a file with `uri` exists already.
			 */
			readonly ignoreIfNotExists?: boolean;
		}, metadata?: WorkspaceEditEntryMetadata): void;

		/**
		 * Rename a file or folder.
		 *
		 * @param oldUri The existing file.
		 * @param newUri The new location.
		 * @param options Defines if existing files should be overwritten or be
		 * ignored. When overwrite and ignoreIfExists are both set overwrite wins.
		 * @param metadata Optional metadata for the entry.
		 */
		renameFile(oldUri: Uri, newUri: Uri, options?: {
			/**
			 * Overwrite existing file. Overwrite wins over `ignoreIfExists`
			 */
			readonly overwrite?: boolean;
			/**
			 * Do nothing if a file with `uri` exists already.
			 */
			readonly ignoreIfExists?: boolean;
		}, metadata?: WorkspaceEditEntryMetadata): void;

		/**
		 * Get all text edits grouped by resource.
		 *
		 * @returns A shallow copy of `[Uri, TextEdit[]]`-tuples.
		 */
		entries(): [Uri, TextEdit[]][];
	}

	/**
	 * A snippet string is a template which allows to insert text
	 * and to control the editor cursor when insertion happens.
	 *
	 * A snippet can define tab stops and placeholders with `$1`, `$2`
	 * and `${3:foo}`. `$0` defines the final tab stop, it defaults to
	 * the end of the snippet. Variables are defined with `$name` and
	 * `${name:default value}`. Also see
	 * [the full snippet syntax](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_create-your-own-snippets).
	 */
	export class SnippetString {

		/**
		 * The snippet string.
		 */
		value: string;

		/**
		 * Create a new snippet string.
		 *
		 * @param value A snippet string.
		 */
		constructor(value?: string);

		/**
		 * Builder-function that appends the given string to
		 * the {@linkcode SnippetString.value value} of this snippet string.
		 *
		 * @param string A value to append 'as given'. The string will be escaped.
		 * @returns This snippet string.
		 */
		appendText(string: string): SnippetString;

		/**
		 * Builder-function that appends a tabstop (`$1`, `$2` etc) to
		 * the {@linkcode SnippetString.value value} of this snippet string.
		 *
		 * @param number The number of this tabstop, defaults to an auto-increment
		 * value starting at 1.
		 * @returns This snippet string.
		 */
		appendTabstop(number?: number): SnippetString;

		/**
		 * Builder-function that appends a placeholder (`${1:value}`) to
		 * the {@linkcode SnippetString.value value} of this snippet string.
		 *
		 * @param value The value of this placeholder - either a string or a function
		 * with which a nested snippet can be created.
		 * @param number The number of this tabstop, defaults to an auto-increment
		 * value starting at 1.
		 * @returns This snippet string.
		 */
		appendPlaceholder(value: string | ((snippet: SnippetString) => any), number?: number): SnippetString;

		/**
		 * Builder-function that appends a choice (`${1|a,b,c|}`) to
		 * the {@linkcode SnippetString.value value} of this snippet string.
		 *
		 * @param values The values for choices - the array of strings
		 * @param number The number of this tabstop, defaults to an auto-increment
		 * value starting at 1.
		 * @returns This snippet string.
		 */
		appendChoice(values: readonly string[], number?: number): SnippetString;

		/**
		 * Builder-function that appends a variable (`${VAR}`) to
		 * the {@linkcode SnippetString.value value} of this snippet string.
		 *
		 * @param name The name of the variable - excluding the `$`.
		 * @param defaultValue The default value which is used when the variable name cannot
		 * be resolved - either a string or a function with which a nested snippet can be created.
		 * @returns This snippet string.
		 */
		appendVariable(name: string, defaultValue: string | ((snippet: SnippetString) => any)): SnippetString;
	}

	/**
	 * The rename provider interface defines the contract between extensions and
	 * the [rename](https://code.visualstudio.com/docs/editor/editingevolved#_rename-symbol)-feature.
	 */
	export interface RenameProvider {

		/**
		 * Provide an edit that describes changes that have to be made to one
		 * or many resources to rename a symbol to a different name.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param newName The new name of the symbol. If the given name is not valid, the provider must return a rejected promise.
		 * @param token A cancellation token.
		 * @returns A workspace edit or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): ProviderResult<WorkspaceEdit>;

		/**
		 * Optional function for resolving and validating a position *before* running rename. The result can
		 * be a range or a range and a placeholder text. The placeholder text should be the identifier of the symbol
		 * which is being renamed - when omitted the text in the returned range is used.
		 *
		 * *Note:* This function should throw an error or return a rejected thenable when the provided location
		 * doesn't allow for a rename.
		 *
		 * @param document The document in which rename will be invoked.
		 * @param position The position at which rename will be invoked.
		 * @param token A cancellation token.
		 * @returns The range or range and placeholder text of the identifier that is to be renamed. The lack of a result can signaled by returning `undefined` or `null`.
		 */
		prepareRename?(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Range | {
			/**
			 * The range of the identifier that can be renamed.
			 */
			range: Range;
			/**
			 * The placeholder of the editors rename input box.
			 */
			placeholder: string;
		}>;
	}

	/**
	 * A semantic tokens legend contains the needed information to decipher
	 * the integer encoded representation of semantic tokens.
	 */
	export class SemanticTokensLegend {
		/**
		 * The possible token types.
		 */
		readonly tokenTypes: string[];
		/**
		 * The possible token modifiers.
		 */
		readonly tokenModifiers: string[];

		/**
		 * Creates a semantic tokens legend.
		 *
		 * @param tokenTypes An array of token types.
		 * @param tokenModifiers An array of token modifiers.
		 */
		constructor(tokenTypes: string[], tokenModifiers?: string[]);
	}

	/**
	 * A semantic tokens builder can help with creating a `SemanticTokens` instance
	 * which contains delta encoded semantic tokens.
	 */
	export class SemanticTokensBuilder {

		/**
		 * Creates a semantic tokens builder.
		 *
		 * @param legend A semantic tokens legend.
		 */
		constructor(legend?: SemanticTokensLegend);

		/**
		 * Add another token.
		 *
		 * @param line The token start line number (absolute value).
		 * @param char The token start character (absolute value).
		 * @param length The token length in characters.
		 * @param tokenType The encoded token type.
		 * @param tokenModifiers The encoded token modifiers.
		 */
		push(line: number, char: number, length: number, tokenType: number, tokenModifiers?: number): void;

		/**
		 * Add another token. Use only when providing a legend.
		 *
		 * @param range The range of the token. Must be single-line.
		 * @param tokenType The token type.
		 * @param tokenModifiers The token modifiers.
		 */
		push(range: Range, tokenType: string, tokenModifiers?: readonly string[]): void;

		/**
		 * Finish and create a `SemanticTokens` instance.
		 */
		build(resultId?: string): SemanticTokens;
	}

	/**
	 * Represents semantic tokens, either in a range or in an entire document.
	 * @see {@link DocumentSemanticTokensProvider.provideDocumentSemanticTokens provideDocumentSemanticTokens} for an explanation of the format.
	 * @see {@link SemanticTokensBuilder} for a helper to create an instance.
	 */
	export class SemanticTokens {
		/**
		 * The result id of the tokens.
		 *
		 * This is the id that will be passed to `DocumentSemanticTokensProvider.provideDocumentSemanticTokensEdits` (if implemented).
		 */
		readonly resultId: string | undefined;
		/**
		 * The actual tokens data.
		 * @see {@link DocumentSemanticTokensProvider.provideDocumentSemanticTokens provideDocumentSemanticTokens} for an explanation of the format.
		 */
		readonly data: Uint32Array;

		/**
		 * Create new semantic tokens.
		 *
		 * @param data Token data.
		 * @param resultId Result identifier.
		 */
		constructor(data: Uint32Array, resultId?: string);
	}

	/**
	 * Represents edits to semantic tokens.
	 * @see {@link DocumentSemanticTokensProvider.provideDocumentSemanticTokensEdits provideDocumentSemanticTokensEdits} for an explanation of the format.
	 */
	export class SemanticTokensEdits {
		/**
		 * The result id of the tokens.
		 *
		 * This is the id that will be passed to `DocumentSemanticTokensProvider.provideDocumentSemanticTokensEdits` (if implemented).
		 */
		readonly resultId: string | undefined;
		/**
		 * The edits to the tokens data.
		 * All edits refer to the initial data state.
		 */
		readonly edits: SemanticTokensEdit[];

		/**
		 * Create new semantic tokens edits.
		 *
		 * @param edits An array of semantic token edits
		 * @param resultId Result identifier.
		 */
		constructor(edits: SemanticTokensEdit[], resultId?: string);
	}

	/**
	 * Represents an edit to semantic tokens.
	 * @see {@link DocumentSemanticTokensProvider.provideDocumentSemanticTokensEdits provideDocumentSemanticTokensEdits} for an explanation of the format.
	 */
	export class SemanticTokensEdit {
		/**
		 * The start offset of the edit.
		 */
		readonly start: number;
		/**
		 * The count of elements to remove.
		 */
		readonly deleteCount: number;
		/**
		 * The elements to insert.
		 */
		readonly data: Uint32Array | undefined;

		/**
		 * Create a semantic token edit.
		 *
		 * @param start Start offset
		 * @param deleteCount Number of elements to remove.
		 * @param data Elements to insert
		 */
		constructor(start: number, deleteCount: number, data?: Uint32Array);
	}

	/**
	 * The document semantic tokens provider interface defines the contract between extensions and
	 * semantic tokens.
	 */
	export interface DocumentSemanticTokensProvider {
		/**
		 * An optional event to signal that the semantic tokens from this provider have changed.
		 */
		onDidChangeSemanticTokens?: Event<void>;

		/**
		 * Tokens in a file are represented as an array of integers. The position of each token is expressed relative to
		 * the token before it, because most tokens remain stable relative to each other when edits are made in a file.
		 *
		 * ---
		 * In short, each token takes 5 integers to represent, so a specific token `i` in the file consists of the following array indices:
		 *  - at index `5*i`   - `deltaLine`: token line number, relative to the previous token
		 *  - at index `5*i+1` - `deltaStart`: token start character, relative to the previous token (relative to 0 or the previous token's start if they are on the same line)
		 *  - at index `5*i+2` - `length`: the length of the token. A token cannot be multiline.
		 *  - at index `5*i+3` - `tokenType`: will be looked up in `SemanticTokensLegend.tokenTypes`. We currently ask that `tokenType` < 65536.
		 *  - at index `5*i+4` - `tokenModifiers`: each set bit will be looked up in `SemanticTokensLegend.tokenModifiers`
		 *
		 * ---
		 * ### How to encode tokens
		 *
		 * Here is an example for encoding a file with 3 tokens in a uint32 array:
		 * ```
		 *    { line: 2, startChar:  5, length: 3, tokenType: "property",  tokenModifiers: ["private", "static"] },
		 *    { line: 2, startChar: 10, length: 4, tokenType: "type",      tokenModifiers: [] },
		 *    { line: 5, startChar:  2, length: 7, tokenType: "class",     tokenModifiers: [] }
		 * ```
		 *
		 * 1. First of all, a legend must be devised. This legend must be provided up-front and capture all possible token types.
		 * For this example, we will choose the following legend which must be passed in when registering the provider:
		 * ```
		 *    tokenTypes: ['property', 'type', 'class'],
		 *    tokenModifiers: ['private', 'static']
		 * ```
		 *
		 * 2. The first transformation step is to encode `tokenType` and `tokenModifiers` as integers using the legend. Token types are looked
		 * up by index, so a `tokenType` value of `1` means `tokenTypes[1]`. Multiple token modifiers can be set by using bit flags,
		 * so a `tokenModifier` value of `3` is first viewed as binary `0b00000011`, which means `[tokenModifiers[0], tokenModifiers[1]]` because
		 * bits 0 and 1 are set. Using this legend, the tokens now are:
		 * ```
		 *    { line: 2, startChar:  5, length: 3, tokenType: 0, tokenModifiers: 3 },
		 *    { line: 2, startChar: 10, length: 4, tokenType: 1, tokenModifiers: 0 },
		 *    { line: 5, startChar:  2, length: 7, tokenType: 2, tokenModifiers: 0 }
		 * ```
		 *
		 * 3. The next step is to represent each token relative to the previous token in the file. In this case, the second token
		 * is on the same line as the first token, so the `startChar` of the second token is made relative to the `startChar`
		 * of the first token, so it will be `10 - 5`. The third token is on a different line than the second token, so the
		 * `startChar` of the third token will not be altered:
		 * ```
		 *    { deltaLine: 2, deltaStartChar: 5, length: 3, tokenType: 0, tokenModifiers: 3 },
		 *    { deltaLine: 0, deltaStartChar: 5, length: 4, tokenType: 1, tokenModifiers: 0 },
		 *    { deltaLine: 3, deltaStartChar: 2, length: 7, tokenType: 2, tokenModifiers: 0 }
		 * ```
		 *
		 * 4. Finally, the last step is to inline each of the 5 fields for a token in a single array, which is a memory friendly representation:
		 * ```
		 *    // 1st token,  2nd token,  3rd token
		 *    [  2,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ]
		 * ```
		 *
		 * @see {@link SemanticTokensBuilder} for a helper to encode tokens as integers.
		 * *NOTE*: When doing edits, it is possible that multiple edits occur until the editor decides to invoke the semantic tokens provider.
		 * *NOTE*: If the provider cannot temporarily compute semantic tokens, it can indicate this by throwing an error with the message 'Busy'.
		 */
		provideDocumentSemanticTokens(document: TextDocument, token: CancellationToken): ProviderResult<SemanticTokens>;

		/**
		 * Instead of always returning all the tokens in a file, it is possible for a `DocumentSemanticTokensProvider` to implement
		 * this method (`provideDocumentSemanticTokensEdits`) and then return incremental updates to the previously provided semantic tokens.
		 *
		 * ---
		 * ### How tokens change when the document changes
		 *
		 * Suppose that `provideDocumentSemanticTokens` has previously returned the following semantic tokens:
		 * ```
		 *    // 1st token,  2nd token,  3rd token
		 *    [  2,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ]
		 * ```
		 *
		 * Also suppose that after some edits, the new semantic tokens in a file are:
		 * ```
		 *    // 1st token,  2nd token,  3rd token
		 *    [  3,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ]
		 * ```
		 * It is possible to express these new tokens in terms of an edit applied to the previous tokens:
		 * ```
		 *    [  2,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ] // old tokens
		 *    [  3,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ] // new tokens
		 *
		 *    edit: { start:  0, deleteCount: 1, data: [3] } // replace integer at offset 0 with 3
		 * ```
		 *
		 * *NOTE*: If the provider cannot compute `SemanticTokensEdits`, it can "give up" and return all the tokens in the document again.
		 * *NOTE*: All edits in `SemanticTokensEdits` contain indices in the old integers array, so they all refer to the previous result state.
		 */
		provideDocumentSemanticTokensEdits?(document: TextDocument, previousResultId: string, token: CancellationToken): ProviderResult<SemanticTokens | SemanticTokensEdits>;
	}

	/**
	 * The document range semantic tokens provider interface defines the contract between extensions and
	 * semantic tokens.
	 */
	export interface DocumentRangeSemanticTokensProvider {
		/**
		 * @see {@link DocumentSemanticTokensProvider.provideDocumentSemanticTokens provideDocumentSemanticTokens}.
		 */
		provideDocumentRangeSemanticTokens(document: TextDocument, range: Range, token: CancellationToken): ProviderResult<SemanticTokens>;
	}

	/**
	 * Value-object describing what options formatting should use.
	 */
	export interface FormattingOptions {

		/**
		 * Size of a tab in spaces.
		 */
		tabSize: number;

		/**
		 * Prefer spaces over tabs.
		 */
		insertSpaces: boolean;

		/**
		 * Signature for further properties.
		 */
		[key: string]: boolean | number | string;
	}

	/**
	 * The document formatting provider interface defines the contract between extensions and
	 * the formatting-feature.
	 */
	export interface DocumentFormattingEditProvider {

		/**
		 * Provide formatting edits for a whole document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param options Options controlling formatting.
		 * @param token A cancellation token.
		 * @returns A set of text edits or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;
	}

	/**
	 * The document formatting provider interface defines the contract between extensions and
	 * the formatting-feature.
	 */
	export interface DocumentRangeFormattingEditProvider {

		/**
		 * Provide formatting edits for a range in a document.
		 *
		 * The given range is a hint and providers can decide to format a smaller
		 * or larger range. Often this is done by adjusting the start and end
		 * of the range to full syntax nodes.
		 *
		 * @param document The document in which the command was invoked.
		 * @param range The range which should be formatted.
		 * @param options Options controlling formatting.
		 * @param token A cancellation token.
		 * @returns A set of text edits or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;


		/**
		 * Provide formatting edits for multiple ranges in a document.
		 *
		 * This function is optional but allows a formatter to perform faster when formatting only modified ranges or when
		 * formatting a large number of selections.
		 *
		 * The given ranges are hints and providers can decide to format a smaller
		 * or larger range. Often this is done by adjusting the start and end
		 * of the range to full syntax nodes.
		 *
		 * @param document The document in which the command was invoked.
		 * @param ranges The ranges which should be formatted.
		 * @param options Options controlling formatting.
		 * @param token A cancellation token.
		 * @returns A set of text edits or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideDocumentRangesFormattingEdits?(document: TextDocument, ranges: Range[], options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;
	}

	/**
	 * The document formatting provider interface defines the contract between extensions and
	 * the formatting-feature.
	 */
	export interface OnTypeFormattingEditProvider {

		/**
		 * Provide formatting edits after a character has been typed.
		 *
		 * The given position and character should hint to the provider
		 * what range the position to expand to, like find the matching `{`
		 * when `}` has been entered.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param ch The character that has been typed.
		 * @param options Options controlling formatting.
		 * @param token A cancellation token.
		 * @returns A set of text edits or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideOnTypeFormattingEdits(document: TextDocument, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;
	}

	/**
	 * Represents a parameter of a callable-signature. A parameter can
	 * have a label and a doc-comment.
	 */
	export class ParameterInformation {

		/**
		 * The label of this signature.
		 *
		 * Either a string or inclusive start and exclusive end offsets within its containing
		 * {@link SignatureInformation.label signature label}. *Note*: A label of type string must be
		 * a substring of its containing signature information's {@link SignatureInformation.label label}.
		 */
		label: string | [number, number];

		/**
		 * The human-readable doc-comment of this signature. Will be shown
		 * in the UI but can be omitted.
		 */
		documentation?: string | MarkdownString;

		/**
		 * Creates a new parameter information object.
		 *
		 * @param label A label string or inclusive start and exclusive end offsets within its containing signature label.
		 * @param documentation A doc string.
		 */
		constructor(label: string | [number, number], documentation?: string | MarkdownString);
	}

	/**
	 * Represents the signature of something callable. A signature
	 * can have a label, like a function-name, a doc-comment, and
	 * a set of parameters.
	 */
	export class SignatureInformation {

		/**
		 * The label of this signature. Will be shown in
		 * the UI.
		 */
		label: string;

		/**
		 * The human-readable doc-comment of this signature. Will be shown
		 * in the UI but can be omitted.
		 */
		documentation?: string | MarkdownString;

		/**
		 * The parameters of this signature.
		 */
		parameters: ParameterInformation[];

		/**
		 * The index of the active parameter.
		 *
		 * If provided, this is used in place of {@linkcode SignatureHelp.activeParameter}.
		 */
		activeParameter?: number;

		/**
		 * Creates a new signature information object.
		 *
		 * @param label A label string.
		 * @param documentation A doc string.
		 */
		constructor(label: string, documentation?: string | MarkdownString);
	}

	/**
	 * Signature help represents the signature of something
	 * callable. There can be multiple signatures but only one
	 * active and only one active parameter.
	 */
	export class SignatureHelp {

		/**
		 * One or more signatures.
		 */
		signatures: SignatureInformation[];

		/**
		 * The active signature.
		 */
		activeSignature: number;

		/**
		 * The active parameter of the active signature.
		 */
		activeParameter: number;
	}

	/**
	 * How a {@linkcode SignatureHelpProvider} was triggered.
	 */
	export enum SignatureHelpTriggerKind {
		/**
		 * Signature help was invoked manually by the user or by a command.
		 */
		Invoke = 1,

		/**
		 * Signature help was triggered by a trigger character.
		 */
		TriggerCharacter = 2,

		/**
		 * Signature help was triggered by the cursor moving or by the document content changing.
		 */
		ContentChange = 3,
	}

	/**
	 * Additional information about the context in which a
	 * {@linkcode SignatureHelpProvider.provideSignatureHelp SignatureHelpProvider} was triggered.
	 */
	export interface SignatureHelpContext {
		/**
		 * Action that caused signature help to be triggered.
		 */
		readonly triggerKind: SignatureHelpTriggerKind;

		/**
		 * Character that caused signature help to be triggered.
		 *
		 * This is `undefined` when signature help is not triggered by typing, such as when manually invoking
		 * signature help or when moving the cursor.
		 */
		readonly triggerCharacter: string | undefined;

		/**
		 * `true` if signature help was already showing when it was triggered.
		 *
		 * Retriggers occur when the signature help is already active and can be caused by actions such as
		 * typing a trigger character, a cursor move, or document content changes.
		 */
		readonly isRetrigger: boolean;

		/**
		 * The currently active {@linkcode SignatureHelp}.
		 *
		 * The `activeSignatureHelp` has its {@linkcode SignatureHelp.activeSignature activeSignature} field updated based on
		 * the user arrowing through available signatures.
		 */
		readonly activeSignatureHelp: SignatureHelp | undefined;
	}

	/**
	 * The signature help provider interface defines the contract between extensions and
	 * the [parameter hints](https://code.visualstudio.com/docs/editor/intellisense)-feature.
	 */
	export interface SignatureHelpProvider {

		/**
		 * Provide help for the signature at the given position and document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @param context Information about how signature help was triggered.
		 *
		 * @returns Signature help or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken, context: SignatureHelpContext): ProviderResult<SignatureHelp>;
	}

	/**
	 * Metadata about a registered {@linkcode SignatureHelpProvider}.
	 */
	export interface SignatureHelpProviderMetadata {
		/**
		 * List of characters that trigger signature help.
		 */
		readonly triggerCharacters: readonly string[];

		/**
		 * List of characters that re-trigger signature help.
		 *
		 * These trigger characters are only active when signature help is already showing. All trigger characters
		 * are also counted as re-trigger characters.
		 */
		readonly retriggerCharacters: readonly string[];
	}

	/**
	 * A structured label for a {@link CompletionItem completion item}.
	 */
	export interface CompletionItemLabel {

		/**
		 * The label of this completion item.
		 *
		 * By default this is also the text that is inserted when this completion is selected.
		 */
		label: string;

		/**
		 * An optional string which is rendered less prominently directly after {@link CompletionItemLabel.label label},
		 * without any spacing. Should be used for function signatures or type annotations.
		 */
		detail?: string;

		/**
		 * An optional string which is rendered less prominently after {@link CompletionItemLabel.detail}. Should be used
		 * for fully qualified names or file path.
		 */
		description?: string;
	}

	/**
	 * Completion item kinds.
	 */
	export enum CompletionItemKind {
		/**
		 * The `Text` completion item kind.
		 */
		Text = 0,
		/**
		 * The `Method` completion item kind.
		 */
		Method = 1,
		/**
		 * The `Function` completion item kind.
		 */
		Function = 2,
		/**
		 * The `Constructor` completion item kind.
		 */
		Constructor = 3,
		/**
		 * The `Field` completion item kind.
		 */
		Field = 4,
		/**
		 * The `Variable` completion item kind.
		 */
		Variable = 5,
		/**
		 * The `Class` completion item kind.
		 */
		Class = 6,
		/**
		 * The `Interface` completion item kind.
		 */
		Interface = 7,
		/**
		 * The `Module` completion item kind.
		 */
		Module = 8,
		/**
		 * The `Property` completion item kind.
		 */
		Property = 9,
		/**
		 * The `Unit` completion item kind.
		 */
		Unit = 10,
		/**
		 * The `Value` completion item kind.
		 */
		Value = 11,
		/**
		 * The `Enum` completion item kind.
		 */
		Enum = 12,
		/**
		 * The `Keyword` completion item kind.
		 */
		Keyword = 13,
		/**
		 * The `Snippet` completion item kind.
		 */
		Snippet = 14,
		/**
		 * The `Color` completion item kind.
		 */
		Color = 15,
		/**
		 * The `Reference` completion item kind.
		 */
		Reference = 17,
		/**
		 * The `File` completion item kind.
		 */
		File = 16,
		/**
		 * The `Folder` completion item kind.
		 */
		Folder = 18,
		/**
		 * The `EnumMember` completion item kind.
		 */
		EnumMember = 19,
		/**
		 * The `Constant` completion item kind.
		 */
		Constant = 20,
		/**
		 * The `Struct` completion item kind.
		 */
		Struct = 21,
		/**
		 * The `Event` completion item kind.
		 */
		Event = 22,
		/**
		 * The `Operator` completion item kind.
		 */
		Operator = 23,
		/**
		 * The `TypeParameter` completion item kind.
		 */
		TypeParameter = 24,
		/**
		 * The `User` completion item kind.
		 */
		User = 25,
		/**
		 * The `Issue` completion item kind.
		 */
		Issue = 26,
	}

	/**
	 * Completion item tags are extra annotations that tweak the rendering of a completion
	 * item.
	 */
	export enum CompletionItemTag {
		/**
		 * Render a completion as obsolete, usually using a strike-out.
		 */
		Deprecated = 1
	}

	/**
	 * A completion item represents a text snippet that is proposed to complete text that is being typed.
	 *
	 * It is sufficient to create a completion item from just a {@link CompletionItem.label label}. In that
	 * case the completion item will replace the {@link TextDocument.getWordRangeAtPosition word}
	 * until the cursor with the given label or {@link CompletionItem.insertText insertText}. Otherwise the
	 * given {@link CompletionItem.textEdit edit} is used.
	 *
	 * When selecting a completion item in the editor its defined or synthesized text edit will be applied
	 * to *all* cursors/selections whereas {@link CompletionItem.additionalTextEdits additionalTextEdits} will be
	 * applied as provided.
	 *
	 * @see {@link CompletionItemProvider.provideCompletionItems}
	 * @see {@link CompletionItemProvider.resolveCompletionItem}
	 */
	export class CompletionItem {

		/**
		 * The label of this completion item. By default
		 * this is also the text that is inserted when selecting
		 * this completion.
		 */
		label: string | CompletionItemLabel;

		/**
		 * The kind of this completion item. Based on the kind
		 * an icon is chosen by the editor.
		 */
		kind?: CompletionItemKind;

		/**
		 * Tags for this completion item.
		 */
		tags?: readonly CompletionItemTag[];

		/**
		 * A human-readable string with additional information
		 * about this item, like type or symbol information.
		 */
		detail?: string;

		/**
		 * A human-readable string that represents a doc-comment.
		 */
		documentation?: string | MarkdownString;

		/**
		 * A string that should be used when comparing this item
		 * with other items. When `falsy` the {@link CompletionItem.label label}
		 * is used.
		 *
		 * Note that `sortText` is only used for the initial ordering of completion
		 * items. When having a leading word (prefix) ordering is based on how
		 * well completions match that prefix and the initial ordering is only used
		 * when completions match equally well. The prefix is defined by the
		 * {@linkcode CompletionItem.range range}-property and can therefore be different
		 * for each completion.
		 */
		sortText?: string;

		/**
		 * A string that should be used when filtering a set of
		 * completion items. When `falsy` the {@link CompletionItem.label label}
		 * is used.
		 *
		 * Note that the filter text is matched against the leading word (prefix) which is defined
		 * by the {@linkcode CompletionItem.range range}-property.
		 */
		filterText?: string;

		/**
		 * Select this item when showing. *Note* that only one completion item can be selected and
		 * that the editor decides which item that is. The rule is that the *first* item of those
		 * that match best is selected.
		 */
		preselect?: boolean;

		/**
		 * A string or snippet that should be inserted in a document when selecting
		 * this completion. When `falsy` the {@link CompletionItem.label label}
		 * is used.
		 */
		insertText?: string | SnippetString;

		/**
		 * A range or a insert and replace range selecting the text that should be replaced by this completion item.
		 *
		 * When omitted, the range of the {@link TextDocument.getWordRangeAtPosition current word} is used as replace-range
		 * and as insert-range the start of the {@link TextDocument.getWordRangeAtPosition current word} to the
		 * current position is used.
		 *
		 * *Note 1:* A range must be a {@link Range.isSingleLine single line} and it must
		 * {@link Range.contains contain} the position at which completion has been {@link CompletionItemProvider.provideCompletionItems requested}.
		 * *Note 2:* A insert range must be a prefix of a replace range, that means it must be contained and starting at the same position.
		 */
		range?: Range | {
			/**
			 * The range that should be used when insert-accepting a completion. Must be a prefix of `replaceRange`.
			 */
			inserting: Range;
			/**
			 * The range that should be used when replace-accepting a completion.
			 */
			replacing: Range;
		};

		/**
		 * An optional set of characters that when pressed while this completion is active will accept it first and
		 * then type that character. *Note* that all commit characters should have `length=1` and that superfluous
		 * characters will be ignored.
		 */
		commitCharacters?: string[];

		/**
		 * Keep whitespace of the {@link CompletionItem.insertText insertText} as is. By default, the editor adjusts leading
		 * whitespace of new lines so that they match the indentation of the line for which the item is accepted - setting
		 * this to `true` will prevent that.
		 */
		keepWhitespace?: boolean;

		/**
		 * @deprecated Use `CompletionItem.insertText` and `CompletionItem.range` instead.
		 *
		 * An {@link TextEdit edit} which is applied to a document when selecting
		 * this completion. When an edit is provided the value of
		 * {@link CompletionItem.insertText insertText} is ignored.
		 *
		 * The {@link Range} of the edit must be single-line and on the same
		 * line completions were {@link CompletionItemProvider.provideCompletionItems requested} at.
		 */
		textEdit?: TextEdit;

		/**
		 * An optional array of additional {@link TextEdit text edits} that are applied when
		 * selecting this completion. Edits must not overlap with the main {@link CompletionItem.textEdit edit}
		 * nor with themselves.
		 */
		additionalTextEdits?: TextEdit[];

		/**
		 * An optional {@link Command} that is executed *after* inserting this completion. *Note* that
		 * additional modifications to the current document should be described with the
		 * {@link CompletionItem.additionalTextEdits additionalTextEdits}-property.
		 */
		command?: Command;

		/**
		 * Creates a new completion item.
		 *
		 * Completion items must have at least a {@link CompletionItem.label label} which then
		 * will be used as insert text as well as for sorting and filtering.
		 *
		 * @param label The label of the completion.
		 * @param kind The {@link CompletionItemKind kind} of the completion.
		 */
		constructor(label: string | CompletionItemLabel, kind?: CompletionItemKind);
	}

	/**
	 * Represents a collection of {@link CompletionItem completion items} to be presented
	 * in the editor.
	 */
	export class CompletionList<T extends CompletionItem = CompletionItem> {

		/**
		 * This list is not complete. Further typing should result in recomputing
		 * this list.
		 */
		isIncomplete?: boolean;

		/**
		 * The completion items.
		 */
		items: T[];

		/**
		 * Creates a new completion list.
		 *
		 * @param items The completion items.
		 * @param isIncomplete The list is not complete.
		 */
		constructor(items?: T[], isIncomplete?: boolean);
	}

	/**
	 * How a {@link CompletionItemProvider completion provider} was triggered
	 */
	export enum CompletionTriggerKind {
		/**
		 * Completion was triggered normally.
		 */
		Invoke = 0,
		/**
		 * Completion was triggered by a trigger character.
		 */
		TriggerCharacter = 1,
		/**
		 * Completion was re-triggered as current completion list is incomplete
		 */
		TriggerForIncompleteCompletions = 2
	}

	/**
	 * Contains additional information about the context in which
	 * {@link CompletionItemProvider.provideCompletionItems completion provider} is triggered.
	 */
	export interface CompletionContext {
		/**
		 * How the completion was triggered.
		 */
		readonly triggerKind: CompletionTriggerKind;

		/**
		 * Character that triggered the completion item provider.
		 *
		 * `undefined` if the provider was not triggered by a character.
		 *
		 * The trigger character is already in the document when the completion provider is triggered.
		 */
		readonly triggerCharacter: string | undefined;
	}

	/**
	 * The completion item provider interface defines the contract between extensions and
	 * [IntelliSense](https://code.visualstudio.com/docs/editor/intellisense).
	 *
	 * Providers can delay the computation of the {@linkcode CompletionItem.detail detail}
	 * and {@linkcode CompletionItem.documentation documentation} properties by implementing the
	 * {@linkcode CompletionItemProvider.resolveCompletionItem resolveCompletionItem}-function. However, properties that
	 * are needed for the initial sorting and filtering, like `sortText`, `filterText`, `insertText`, and `range`, must
	 * not be changed during resolve.
	 *
	 * Providers are asked for completions either explicitly by a user gesture or -depending on the configuration-
	 * implicitly when typing words or trigger characters.
	 */
	export interface CompletionItemProvider<T extends CompletionItem = CompletionItem> {

		/**
		 * Provide completion items for the given position and document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @param context How the completion was triggered.
		 *
		 * @returns An array of completions, a {@link CompletionList completion list}, or a thenable that resolves to either.
		 * The lack of a result can be signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): ProviderResult<T[] | CompletionList<T>>;

		/**
		 * Given a completion item fill in more data, like {@link CompletionItem.documentation doc-comment}
		 * or {@link CompletionItem.detail details}.
		 *
		 * The editor will only resolve a completion item once.
		 *
		 * *Note* that this function is called when completion items are already showing in the UI or when an item has been
		 * selected for insertion. Because of that, no property that changes the presentation (label, sorting, filtering etc)
		 * or the (primary) insert behaviour ({@link CompletionItem.insertText insertText}) can be changed.
		 *
		 * This function may fill in {@link CompletionItem.additionalTextEdits additionalTextEdits}. However, that means an item might be
		 * inserted *before* resolving is done and in that case the editor will do a best effort to still apply those additional
		 * text edits.
		 *
		 * @param item A completion item currently active in the UI.
		 * @param token A cancellation token.
		 * @returns The resolved completion item or a thenable that resolves to of such. It is OK to return the given
		 * `item`. When no result is returned, the given `item` will be used.
		 */
		resolveCompletionItem?(item: T, token: CancellationToken): ProviderResult<T>;
	}


	/**
	 * The inline completion item provider interface defines the contract between extensions and
	 * the inline completion feature.
	 *
	 * Providers are asked for completions either explicitly by a user gesture or implicitly when typing.
	 */
	export interface InlineCompletionItemProvider {

		/**
		 * Provides inline completion items for the given position and document.
		 * If inline completions are enabled, this method will be called whenever the user stopped typing.
		 * It will also be called when the user explicitly triggers inline completions or explicitly asks for the next or previous inline completion.
		 * In that case, all available inline completions should be returned.
		 * `context.triggerKind` can be used to distinguish between these scenarios.
		 *
		 * @param document The document inline completions are requested for.
		 * @param position The position inline completions are requested for.
		 * @param context A context object with additional information.
		 * @param token A cancellation token.
		 * @returns An array of completion items or a thenable that resolves to an array of completion items.
		 */
		provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<InlineCompletionItem[] | InlineCompletionList>;
	}

	/**
	 * Represents a collection of {@link InlineCompletionItem inline completion items} to be presented
	 * in the editor.
	 */
	export class InlineCompletionList {
		/**
		 * The inline completion items.
		 */
		items: InlineCompletionItem[];

		/**
		 * Creates a new list of inline completion items.
		 */
		constructor(items: InlineCompletionItem[]);
	}

	/**
	 * Provides information about the context in which an inline completion was requested.
	 */
	export interface InlineCompletionContext {
		/**
		 * Describes how the inline completion was triggered.
		 */
		readonly triggerKind: InlineCompletionTriggerKind;

		/**
		 * Provides information about the currently selected item in the autocomplete widget if it is visible.
		 *
		 * If set, provided inline completions must extend the text of the selected item
		 * and use the same range, otherwise they are not shown as preview.
		 * As an example, if the document text is `console.` and the selected item is `.log` replacing the `.` in the document,
		 * the inline completion must also replace `.` and start with `.log`, for example `.log()`.
		 *
		 * Inline completion providers are requested again whenever the selected item changes.
		 */
		readonly selectedCompletionInfo: SelectedCompletionInfo | undefined;
	}

	/**
	 * Describes the currently selected completion item.
	 */
	export interface SelectedCompletionInfo {
		/**
		 * The range that will be replaced if this completion item is accepted.
		 */
		readonly range: Range;

		/**
		 * The text the range will be replaced with if this completion is accepted.
		 */
		readonly text: string;
	}

	/**
	 * Describes how an {@link InlineCompletionItemProvider inline completion provider} was triggered.
	 */
	export enum InlineCompletionTriggerKind {
		/**
		 * Completion was triggered explicitly by a user gesture.
		 * Return multiple completion items to enable cycling through them.
		 */
		Invoke = 0,

		/**
		 * Completion was triggered automatically while editing.
		 * It is sufficient to return a single completion item in this case.
		 */
		Automatic = 1,
	}

	/**
	 * An inline completion item represents a text snippet that is proposed inline to complete text that is being typed.
	 *
	 * @see {@link InlineCompletionItemProvider.provideInlineCompletionItems}
	 */
	export class InlineCompletionItem {
		/**
		 * The text to replace the range with. Must be set.
		 * Is used both for the preview and the accept operation.
		 */
		insertText: string | SnippetString;

		/**
		 * A text that is used to decide if this inline completion should be shown. When `falsy`
		 * the {@link InlineCompletionItem.insertText} is used.
		 *
		 * An inline completion is shown if the text to replace is a prefix of the filter text.
		 */
		filterText?: string;

		/**
		 * The range to replace.
		 * Must begin and end on the same line.
		 *
		 * Prefer replacements over insertions to provide a better experience when the user deletes typed text.
		 */
		range?: Range;

		/**
		 * An optional {@link Command} that is executed *after* inserting this completion.
		 */
		command?: Command;

		/**
		 * Creates a new inline completion item.
		 *
		 * @param insertText The text to replace the range with.
		 * @param range The range to replace. If not set, the word at the requested position will be used.
		 * @param command An optional {@link Command} that is executed *after* inserting this completion.
		 */
		constructor(insertText: string | SnippetString, range?: Range, command?: Command);
	}

	/**
	 * A document link is a range in a text document that links to an internal or external resource, like another
	 * text document or a web site.
	 */
	export class DocumentLink {

		/**
		 * The range this link applies to.
		 */
		range: Range;

		/**
		 * The uri this link points to.
		 */
		target?: Uri;

		/**
		 * The tooltip text when you hover over this link.
		 *
		 * If a tooltip is provided, is will be displayed in a string that includes instructions on how to
		 * trigger the link, such as `{0} (ctrl + click)`. The specific instructions vary depending on OS,
		 * user settings, and localization.
		 */
		tooltip?: string;

		/**
		 * Creates a new document link.
		 *
		 * @param range The range the document link applies to. Must not be empty.
		 * @param target The uri the document link points to.
		 */
		constructor(range: Range, target?: Uri);
	}

	/**
	 * The document link provider defines the contract between extensions and feature of showing
	 * links in the editor.
	 */
	export interface DocumentLinkProvider<T extends DocumentLink = DocumentLink> {

		/**
		 * Provide links for the given document. Note that the editor ships with a default provider that detects
		 * `http(s)` and `file` links.
		 *
		 * @param document The document in which the command was invoked.
		 * @param token A cancellation token.
		 * @returns An array of {@link DocumentLink document links} or a thenable that resolves to such. The lack of a result
		 * can be signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideDocumentLinks(document: TextDocument, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Given a link fill in its {@link DocumentLink.target target}. This method is called when an incomplete
		 * link is selected in the UI. Providers can implement this method and return incomplete links
		 * (without target) from the {@linkcode DocumentLinkProvider.provideDocumentLinks provideDocumentLinks} method which
		 * often helps to improve performance.
		 *
		 * @param link The link that is to be resolved.
		 * @param token A cancellation token.
		 */
		resolveDocumentLink?(link: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * Represents a color in RGBA space.
	 */
	export class Color {

		/**
		 * The red component of this color in the range `[0-1]`.
		 */
		readonly red: number;

		/**
		 * The green component of this color in the range `[0-1]`.
		 */
		readonly green: number;

		/**
		 * The blue component of this color in the range `[0-1]`.
		 */
		readonly blue: number;

		/**
		 * The alpha component of this color in the range `[0-1]`.
		 */
		readonly alpha: number;

		/**
		 * Creates a new color instance.
		 *
		 * @param red The red component.
		 * @param green The green component.
		 * @param blue The blue component.
		 * @param alpha The alpha component.
		 */
		constructor(red: number, green: number, blue: number, alpha: number);
	}

	/**
	 * Represents a color range from a document.
	 */
	export class ColorInformation {

		/**
		 * The range in the document where this color appears.
		 */
		range: Range;

		/**
		 * The actual color value for this color range.
		 */
		color: Color;

		/**
		 * Creates a new color range.
		 *
		 * @param range The range the color appears in. Must not be empty.
		 * @param color The value of the color.
		 */
		constructor(range: Range, color: Color);
	}

	/**
	 * A color presentation object describes how a {@linkcode Color} should be represented as text and what
	 * edits are required to refer to it from source code.
	 *
	 * For some languages one color can have multiple presentations, e.g. css can represent the color red with
	 * the constant `Red`, the hex-value `#ff0000`, or in rgba and hsla forms. In csharp other representations
	 * apply, e.g. `System.Drawing.Color.Red`.
	 */
	export class ColorPresentation {

		/**
		 * The label of this color presentation. It will be shown on the color
		 * picker header. By default this is also the text that is inserted when selecting
		 * this color presentation.
		 */
		label: string;

		/**
		 * An {@link TextEdit edit} which is applied to a document when selecting
		 * this presentation for the color.  When `falsy` the {@link ColorPresentation.label label}
		 * is used.
		 */
		textEdit?: TextEdit;

		/**
		 * An optional array of additional {@link TextEdit text edits} that are applied when
		 * selecting this color presentation. Edits must not overlap with the main {@link ColorPresentation.textEdit edit} nor with themselves.
		 */
		additionalTextEdits?: TextEdit[];

		/**
		 * Creates a new color presentation.
		 *
		 * @param label The label of this color presentation.
		 */
		constructor(label: string);
	}

	/**
	 * The document color provider defines the contract between extensions and feature of
	 * picking and modifying colors in the editor.
	 */
	export interface DocumentColorProvider {

		/**
		 * Provide colors for the given document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param token A cancellation token.
		 * @returns An array of {@link ColorInformation color information} or a thenable that resolves to such. The lack of a result
		 * can be signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideDocumentColors(document: TextDocument, token: CancellationToken): ProviderResult<ColorInformation[]>;

		/**
		 * Provide {@link ColorPresentation representations} for a color.
		 *
		 * @param color The color to show and insert.
		 * @param context A context object with additional information
		 * @param token A cancellation token.
		 * @returns An array of color presentations or a thenable that resolves to such. The lack of a result
		 * can be signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideColorPresentations(color: Color, context: {
			/**
			 * The text document that contains the color
			 */
			readonly document: TextDocument;
			/**
			 * The range in the document where the color is located.
			 */
			readonly range: Range;
		}, token: CancellationToken): ProviderResult<ColorPresentation[]>;
	}

	/**
	 * Inlay hint kinds.
	 *
	 * The kind of an inline hint defines its appearance, e.g the corresponding foreground and background colors are being
	 * used.
	 */
	export enum InlayHintKind {
		/**
		 * An inlay hint that is for a type annotation.
		 */
		Type = 1,
		/**
		 * An inlay hint that is for a parameter.
		 */
		Parameter = 2,
	}

	/**
	 * An inlay hint label part allows for interactive and composite labels of inlay hints.
	 */
	export class InlayHintLabelPart {

		/**
		 * The value of this label part.
		 */
		value: string;

		/**
		 * The tooltip text when you hover over this label part.
		 *
		 * *Note* that this property can be set late during
		 * {@link InlayHintsProvider.resolveInlayHint resolving} of inlay hints.
		 */
		tooltip?: string | MarkdownString | undefined;

		/**
		 * An optional {@link Location source code location} that represents this label
		 * part.
		 *
		 * The editor will use this location for the hover and for code navigation features: This
		 * part will become a clickable link that resolves to the definition of the symbol at the
		 * given location (not necessarily the location itself), it shows the hover that shows at
		 * the given location, and it shows a context menu with further code navigation commands.
		 *
		 * *Note* that this property can be set late during
		 * {@link InlayHintsProvider.resolveInlayHint resolving} of inlay hints.
		 */
		location?: Location | undefined;

		/**
		 * An optional command for this label part.
		 *
		 * The editor renders parts with commands as clickable links. The command is added to the context menu
		 * when a label part defines {@link InlayHintLabelPart.location location} and {@link InlayHintLabelPart.command command} .
		 *
		 * *Note* that this property can be set late during
		 * {@link InlayHintsProvider.resolveInlayHint resolving} of inlay hints.
		 */
		command?: Command | undefined;

		/**
		 * Creates a new inlay hint label part.
		 *
		 * @param value The value of the part.
		 */
		constructor(value: string);
	}

	/**
	 * Inlay hint information.
	 */
	export class InlayHint {

		/**
		 * The position of this hint.
		 */
		position: Position;

		/**
		 * The label of this hint. A human readable string or an array of {@link InlayHintLabelPart label parts}.
		 *
		 * *Note* that neither the string nor the label part can be empty.
		 */
		label: string | InlayHintLabelPart[];

		/**
		 * The tooltip text when you hover over this item.
		 *
		 * *Note* that this property can be set late during
		 * {@link InlayHintsProvider.resolveInlayHint resolving} of inlay hints.
		 */
		tooltip?: string | MarkdownString | undefined;

		/**
		 * The kind of this hint. The inlay hint kind defines the appearance of this inlay hint.
		 */
		kind?: InlayHintKind;

		/**
		 * Optional {@link TextEdit text edits} that are performed when accepting this inlay hint. The default
		 * gesture for accepting an inlay hint is the double click.
		 *
		 * *Note* that edits are expected to change the document so that the inlay hint (or its nearest variant) is
		 * now part of the document and the inlay hint itself is now obsolete.
		 *
		 * *Note* that this property can be set late during
		 * {@link InlayHintsProvider.resolveInlayHint resolving} of inlay hints.
		 */
		textEdits?: TextEdit[];

		/**
		 * Render padding before the hint. Padding will use the editor's background color,
		 * not the background color of the hint itself. That means padding can be used to visually
		 * align/separate an inlay hint.
		 */
		paddingLeft?: boolean;

		/**
		 * Render padding after the hint. Padding will use the editor's background color,
		 * not the background color of the hint itself. That means padding can be used to visually
		 * align/separate an inlay hint.
		 */
		paddingRight?: boolean;

		/**
		 * Creates a new inlay hint.
		 *
		 * @param position The position of the hint.
		 * @param label The label of the hint.
		 * @param kind The {@link InlayHintKind kind} of the hint.
		 */
		constructor(position: Position, label: string | InlayHintLabelPart[], kind?: InlayHintKind);
	}

	/**
	 * The inlay hints provider interface defines the contract between extensions and
	 * the inlay hints feature.
	 */
	export interface InlayHintsProvider<T extends InlayHint = InlayHint> {

		/**
		 * An optional event to signal that inlay hints from this provider have changed.
		 */
		onDidChangeInlayHints?: Event<void>;

		/**
		 * Provide inlay hints for the given range and document.
		 *
		 * *Note* that inlay hints that are not {@link Range.contains contained} by the given range are ignored.
		 *
		 * @param document The document in which the command was invoked.
		 * @param range The range for which inlay hints should be computed.
		 * @param token A cancellation token.
		 * @returns An array of inlay hints or a thenable that resolves to such.
		 */
		provideInlayHints(document: TextDocument, range: Range, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Given an inlay hint fill in {@link InlayHint.tooltip tooltip}, {@link InlayHint.textEdits text edits},
		 * or complete label {@link InlayHintLabelPart parts}.
		 *
		 * *Note* that the editor will resolve an inlay hint at most once.
		 *
		 * @param hint An inlay hint.
		 * @param token A cancellation token.
		 * @returns The resolved inlay hint or a thenable that resolves to such. It is OK to return the given `item`. When no result is returned, the given `item` will be used.
		 */
		resolveInlayHint?(hint: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * A line based folding range. To be valid, start and end line must be bigger than zero and smaller than the number of lines in the document.
	 * Invalid ranges will be ignored.
	 */
	export class FoldingRange {

		/**
		 * The zero-based start line of the range to fold. The folded area starts after the line's last character.
		 * To be valid, the end must be zero or larger and smaller than the number of lines in the document.
		 */
		start: number;

		/**
		 * The zero-based end line of the range to fold. The folded area ends with the line's last character.
		 * To be valid, the end must be zero or larger and smaller than the number of lines in the document.
		 */
		end: number;

		/**
		 * Describes the {@link FoldingRangeKind Kind} of the folding range such as {@link FoldingRangeKind.Comment Comment} or
		 * {@link FoldingRangeKind.Region Region}. The kind is used to categorize folding ranges and used by commands
		 * like 'Fold all comments'. See
		 * {@link FoldingRangeKind} for an enumeration of all kinds.
		 * If not set, the range is originated from a syntax element.
		 */
		kind?: FoldingRangeKind;

		/**
		 * Creates a new folding range.
		 *
		 * @param start The start line of the folded range.
		 * @param end The end line of the folded range.
		 * @param kind The kind of the folding range.
		 */
		constructor(start: number, end: number, kind?: FoldingRangeKind);
	}

	/**
	 * An enumeration of specific folding range kinds. The kind is an optional field of a {@link FoldingRange}
	 * and is used to distinguish specific folding ranges such as ranges originated from comments. The kind is used by commands like
	 * `Fold all comments` or `Fold all regions`.
	 * If the kind is not set on the range, the range originated from a syntax element other than comments, imports or region markers.
	 */
	export enum FoldingRangeKind {
		/**
		 * Kind for folding range representing a comment.
		 */
		Comment = 1,
		/**
		 * Kind for folding range representing a import.
		 */
		Imports = 2,
		/**
		 * Kind for folding range representing regions originating from folding markers like `#region` and `#endregion`.
		 */
		Region = 3
	}

	/**
	 * Folding context (for future use)
	 */
	export interface FoldingContext {
	}

	/**
	 * The folding range provider interface defines the contract between extensions and
	 * [Folding](https://code.visualstudio.com/docs/editor/codebasics#_folding) in the editor.
	 */
	export interface FoldingRangeProvider {

		/**
		 * An optional event to signal that the folding ranges from this provider have changed.
		 */
		onDidChangeFoldingRanges?: Event<void>;

		/**
		 * Returns a list of folding ranges or null and undefined if the provider
		 * does not want to participate or was cancelled.
		 * @param document The document in which the command was invoked.
		 * @param context Additional context information (for future use)
		 * @param token A cancellation token.
		 */
		provideFoldingRanges(document: TextDocument, context: FoldingContext, token: CancellationToken): ProviderResult<FoldingRange[]>;
	}

	/**
	 * A selection range represents a part of a selection hierarchy. A selection range
	 * may have a parent selection range that contains it.
	 */
	export class SelectionRange {

		/**
		 * The {@link Range} of this selection range.
		 */
		range: Range;

		/**
		 * The parent selection range containing this range.
		 */
		parent?: SelectionRange;

		/**
		 * Creates a new selection range.
		 *
		 * @param range The range of the selection range.
		 * @param parent The parent of the selection range.
		 */
		constructor(range: Range, parent?: SelectionRange);
	}

	/**
	 * The selection range provider interface defines the contract between extensions and the "Expand and Shrink Selection" feature.
	 */
	export interface SelectionRangeProvider {
		/**
		 * Provide selection ranges for the given positions.
		 *
		 * Selection ranges should be computed individually and independent for each position. The editor will merge
		 * and deduplicate ranges but providers must return hierarchies of selection ranges so that a range
		 * is {@link Range.contains contained} by its parent.
		 *
		 * @param document The document in which the command was invoked.
		 * @param positions The positions at which the command was invoked.
		 * @param token A cancellation token.
		 * @returns Selection ranges or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideSelectionRanges(document: TextDocument, positions: readonly Position[], token: CancellationToken): ProviderResult<SelectionRange[]>;
	}

	/**
	 * Represents programming constructs like functions or constructors in the context
	 * of call hierarchy.
	 */
	export class CallHierarchyItem {
		/**
		 * The name of this item.
		 */
		name: string;

		/**
		 * The kind of this item.
		 */
		kind: SymbolKind;

		/**
		 * Tags for this item.
		 */
		tags?: readonly SymbolTag[];

		/**
		 * More detail for this item, e.g. the signature of a function.
		 */
		detail?: string;

		/**
		 * The resource identifier of this item.
		 */
		uri: Uri;

		/**
		 * The range enclosing this symbol not including leading/trailing whitespace but everything else, e.g. comments and code.
		 */
		range: Range;

		/**
		 * The range that should be selected and revealed when this symbol is being picked, e.g. the name of a function.
		 * Must be contained by the {@linkcode CallHierarchyItem.range range}.
		 */
		selectionRange: Range;

		/**
		 * Creates a new call hierarchy item.
		 */
		constructor(kind: SymbolKind, name: string, detail: string, uri: Uri, range: Range, selectionRange: Range);
	}

	/**
	 * Represents an incoming call, e.g. a caller of a method or constructor.
	 */
	export class CallHierarchyIncomingCall {

		/**
		 * The item that makes the call.
		 */
		from: CallHierarchyItem;

		/**
		 * The range at which at which the calls appears. This is relative to the caller
		 * denoted by {@linkcode CallHierarchyIncomingCall.from this.from}.
		 */
		fromRanges: Range[];

		/**
		 * Create a new call object.
		 *
		 * @param item The item making the call.
		 * @param fromRanges The ranges at which the calls appear.
		 */
		constructor(item: CallHierarchyItem, fromRanges: Range[]);
	}

	/**
	 * Represents an outgoing call, e.g. calling a getter from a method or a method from a constructor etc.
	 */
	export class CallHierarchyOutgoingCall {

		/**
		 * The item that is called.
		 */
		to: CallHierarchyItem;

		/**
		 * The range at which this item is called. This is the range relative to the caller, e.g the item
		 * passed to {@linkcode CallHierarchyProvider.provideCallHierarchyOutgoingCalls provideCallHierarchyOutgoingCalls}
		 * and not {@linkcode CallHierarchyOutgoingCall.to this.to}.
		 */
		fromRanges: Range[];

		/**
		 * Create a new call object.
		 *
		 * @param item The item being called
		 * @param fromRanges The ranges at which the calls appear.
		 */
		constructor(item: CallHierarchyItem, fromRanges: Range[]);
	}

	/**
	 * The call hierarchy provider interface describes the contract between extensions
	 * and the call hierarchy feature which allows to browse calls and caller of function,
	 * methods, constructor etc.
	 */
	export interface CallHierarchyProvider {

		/**
		 * Bootstraps call hierarchy by returning the item that is denoted by the given document
		 * and position. This item will be used as entry into the call graph. Providers should
		 * return `undefined` or `null` when there is no item at the given location.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @returns One or multiple call hierarchy items or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		prepareCallHierarchy(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<CallHierarchyItem | CallHierarchyItem[]>;

		/**
		 * Provide all incoming calls for an item, e.g all callers for a method. In graph terms this describes directed
		 * and annotated edges inside the call graph, e.g the given item is the starting node and the result is the nodes
		 * that can be reached.
		 *
		 * @param item The hierarchy item for which incoming calls should be computed.
		 * @param token A cancellation token.
		 * @returns A set of incoming calls or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideCallHierarchyIncomingCalls(item: CallHierarchyItem, token: CancellationToken): ProviderResult<CallHierarchyIncomingCall[]>;

		/**
		 * Provide all outgoing calls for an item, e.g call calls to functions, methods, or constructors from the given item. In
		 * graph terms this describes directed and annotated edges inside the call graph, e.g the given item is the starting
		 * node and the result is the nodes that can be reached.
		 *
		 * @param item The hierarchy item for which outgoing calls should be computed.
		 * @param token A cancellation token.
		 * @returns A set of outgoing calls or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideCallHierarchyOutgoingCalls(item: CallHierarchyItem, token: CancellationToken): ProviderResult<CallHierarchyOutgoingCall[]>;
	}

	/**
	 * Represents an item of a type hierarchy, like a class or an interface.
	 */
	export class TypeHierarchyItem {
		/**
		 * The name of this item.
		 */
		name: string;

		/**
		 * The kind of this item.
		 */
		kind: SymbolKind;

		/**
		 * Tags for this item.
		 */
		tags?: ReadonlyArray<SymbolTag>;

		/**
		 * More detail for this item, e.g. the signature of a function.
		 */
		detail?: string;

		/**
		 * The resource identifier of this item.
		 */
		uri: Uri;

		/**
		 * The range enclosing this symbol not including leading/trailing whitespace
		 * but everything else, e.g. comments and code.
		 */
		range: Range;

		/**
		 * The range that should be selected and revealed when this symbol is being
		 * picked, e.g. the name of a class. Must be contained by the {@link TypeHierarchyItem.range range}-property.
		 */
		selectionRange: Range;

		/**
		 * Creates a new type hierarchy item.
		 *
		 * @param kind The kind of the item.
		 * @param name The name of the item.
		 * @param detail The details of the item.
		 * @param uri The Uri of the item.
		 * @param range The whole range of the item.
		 * @param selectionRange The selection range of the item.
		 */
		constructor(kind: SymbolKind, name: string, detail: string, uri: Uri, range: Range, selectionRange: Range);
	}

	/**
	 * The type hierarchy provider interface describes the contract between extensions
	 * and the type hierarchy feature.
	 */
	export interface TypeHierarchyProvider {

		/**
		 * Bootstraps type hierarchy by returning the item that is denoted by the given document
		 * and position. This item will be used as entry into the type graph. Providers should
		 * return `undefined` or `null` when there is no item at the given location.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @returns One or multiple type hierarchy items or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		prepareTypeHierarchy(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<TypeHierarchyItem | TypeHierarchyItem[]>;

		/**
		 * Provide all supertypes for an item, e.g all types from which a type is derived/inherited. In graph terms this describes directed
		 * and annotated edges inside the type graph, e.g the given item is the starting node and the result is the nodes
		 * that can be reached.
		 *
		 * @param item The hierarchy item for which super types should be computed.
		 * @param token A cancellation token.
		 * @returns A set of direct supertypes or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideTypeHierarchySupertypes(item: TypeHierarchyItem, token: CancellationToken): ProviderResult<TypeHierarchyItem[]>;

		/**
		 * Provide all subtypes for an item, e.g all types which are derived/inherited from the given item. In
		 * graph terms this describes directed and annotated edges inside the type graph, e.g the given item is the starting
		 * node and the result is the nodes that can be reached.
		 *
		 * @param item The hierarchy item for which subtypes should be computed.
		 * @param token A cancellation token.
		 * @returns A set of direct subtypes or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideTypeHierarchySubtypes(item: TypeHierarchyItem, token: CancellationToken): ProviderResult<TypeHierarchyItem[]>;
	}

	/**
	 * Represents a list of ranges that can be edited together along with a word pattern to describe valid range contents.
	 */
	export class LinkedEditingRanges {
		/**
		 * Create a new linked editing ranges object.
		 *
		 * @param ranges A list of ranges that can be edited together
		 * @param wordPattern An optional word pattern that describes valid contents for the given ranges
		 */
		constructor(ranges: Range[], wordPattern?: RegExp);

		/**
		 * A list of ranges that can be edited together. The ranges must have
		 * identical length and text content. The ranges cannot overlap.
		 */
		readonly ranges: Range[];

		/**
		 * An optional word pattern that describes valid contents for the given ranges.
		 * If no pattern is provided, the language configuration's word pattern will be used.
		 */
		readonly wordPattern: RegExp | undefined;
	}

	/**
	 * The linked editing range provider interface defines the contract between extensions and
	 * the linked editing feature.
	 */
	export interface LinkedEditingRangeProvider {
		/**
		 * For a given position in a document, returns the range of the symbol at the position and all ranges
		 * that have the same content. A change to one of the ranges can be applied to all other ranges if the new content
		 * is valid. An optional word pattern can be returned with the result to describe valid contents.
		 * If no result-specific word pattern is provided, the word pattern from the language configuration is used.
		 *
		 * @param document The document in which the provider was invoked.
		 * @param position The position at which the provider was invoked.
		 * @param token A cancellation token.
		 * @returns A list of ranges that can be edited together
		 */
		provideLinkedEditingRanges(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<LinkedEditingRanges>;
	}

	/**
	 * Identifies a {@linkcode DocumentDropEdit} or {@linkcode DocumentPasteEdit}
	 */
	export class DocumentDropOrPasteEditKind {
		static readonly Empty: DocumentDropOrPasteEditKind;

		/**
		 * The root kind for basic text edits.
		 *
		 * This kind should be used for edits that insert basic text into the document. A good example of this is
		 * an edit that pastes the clipboard text while also updating imports in the file based on the pasted text.
		 * For this we could use a kind such as `text.updateImports.someLanguageId`.
		 *
		 * Even though most drop/paste edits ultimately insert text, you should not use {@linkcode Text} as the base kind
		 * for every edit as this is redundant. Instead a more specific kind that describes the type of content being
		 * inserted should be used instead. For example, if the edit adds a Markdown link, use `markdown.link` since even
		 * though the content being inserted is text, it's more important to know that the edit inserts Markdown syntax.
		 */
		static readonly Text: DocumentDropOrPasteEditKind;

		/**
		 * Root kind for edits that update imports in a document in addition to inserting text.
		 */
		static readonly TextUpdateImports: DocumentDropOrPasteEditKind;

		/**
		 * Use {@linkcode DocumentDropOrPasteEditKind.Empty} instead.
		 */
		private constructor(value: string);

		/**
		 * The raw string value of the kind.
		 */
		readonly value: string;

		/**
		 * Create a new kind by appending additional scopes to the current kind.
		 *
		 * Does not modify the current kind.
		 */
		append(...parts: string[]): DocumentDropOrPasteEditKind;

		/**
		 * Checks if this kind intersects `other`.
		 *
		 * The kind `"text.plain"` for example intersects `text`, `"text.plain"` and `"text.plain.list"`,
		 * but not `"unicorn"`, or `"textUnicorn.plain"`.
		 *
		 * @param other Kind to check.
		 */
		intersects(other: DocumentDropOrPasteEditKind): boolean;

		/**
		 * Checks if `other` is a sub-kind of this `DocumentDropOrPasteEditKind`.
		 *
		 * The kind `"text.plain"` for example contains `"text.plain"` and `"text.plain.list"`,
		 * but not `"text"` or `"unicorn.text.plain"`.
		 *
		 * @param other Kind to check.
		 */
		contains(other: DocumentDropOrPasteEditKind): boolean;
	}

	/**
	 * An edit operation applied {@link DocumentDropEditProvider on drop}.
	 */
	export class DocumentDropEdit {
		/**
		 * Human readable label that describes the edit.
		 */
		title?: string;

		/**
		 * {@link DocumentDropOrPasteEditKind Kind} of the edit.
		 */
		kind?: DocumentDropOrPasteEditKind;

		/**
		 * Controls the ordering or multiple edits. If this provider yield to edits, it will be shown lower in the list.
		 */
		yieldTo?: readonly DocumentDropOrPasteEditKind[];

		/**
		 * The text or snippet to insert at the drop location.
		 */
		insertText: string | SnippetString;

		/**
		 * An optional additional edit to apply on drop.
		 */
		additionalEdit?: WorkspaceEdit;

		/**
		 * @param insertText The text or snippet to insert at the drop location.
		 * @param title Human readable label that describes the edit.
		 * @param kind {@link DocumentDropOrPasteEditKind Kind} of the edit.
		 */
		constructor(insertText: string | SnippetString, title?: string, kind?: DocumentDropOrPasteEditKind);
	}

	/**
	 * Provider which handles dropping of resources into a text editor.
	 *
	 * This allows users to drag and drop resources (including resources from external apps) into the editor. While dragging
	 * and dropping files, users can hold down `shift` to drop the file into the editor instead of opening it.
	 * Requires `editor.dropIntoEditor.enabled` to be on.
	 */
	export interface DocumentDropEditProvider<T extends DocumentDropEdit = DocumentDropEdit> {
		/**
		 * Provide edits which inserts the content being dragged and dropped into the document.
		 *
		 * @param document The document in which the drop occurred.
		 * @param position The position in the document where the drop occurred.
		 * @param dataTransfer A {@link DataTransfer} object that holds data about what is being dragged and dropped.
		 * @param token A cancellation token.
		 *
		 * @returns A {@link DocumentDropEdit} or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideDocumentDropEdits(document: TextDocument, position: Position, dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<T | T[]>;

		/**
		 * Optional method which fills in the {@linkcode DocumentDropEdit.additionalEdit} before the edit is applied.
		 *
		 * This is called once per edit and should be used if generating the complete edit may take a long time.
		 * Resolve can only be used to change {@link DocumentDropEdit.additionalEdit}.
		 *
		 * @param edit The {@linkcode DocumentDropEdit} to resolve.
		 * @param token A cancellation token.
		 *
		 * @returns The resolved edit or a thenable that resolves to such. It is OK to return the given
		 * `edit`. If no result is returned, the given `edit` is used.
		 */
		resolveDocumentDropEdit?(edit: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * Provides additional metadata about how a {@linkcode DocumentDropEditProvider} works.
	 */
	export interface DocumentDropEditProviderMetadata {
		/**
		 * List of {@link DocumentDropOrPasteEditKind kinds} that the provider may return in {@linkcode DocumentDropEditProvider.provideDocumentDropEdits provideDocumentDropEdits}.
		 *
		 * This is used to filter out providers when a specific {@link DocumentDropOrPasteEditKind kind} of edit is requested.
		 */
		readonly providedDropEditKinds?: readonly DocumentDropOrPasteEditKind[];

		/**
		 * List of {@link DataTransfer} mime types that the provider can handle.
		 *
		 * This can either be an exact mime type such as `image/png`, or a wildcard pattern such as `image/*`.
		 *
		 * Use `text/uri-list` for resources dropped from the explorer or other tree views in the workbench.
		 *
		 * Use `files` to indicate that the provider should be invoked if any {@link DataTransferFile files} are present in the {@link DataTransfer}.
		 * Note that {@link DataTransferFile} entries are only created when dropping content from outside the editor, such as
		 * from the operating system.
		 */
		readonly dropMimeTypes: readonly string[];
	}


	/**
	 * The reason why paste edits were requested.
	 */
	export enum DocumentPasteTriggerKind {
		/**
		 * Pasting was requested as part of a normal paste operation.
		 */
		Automatic = 0,

		/**
		 * Pasting was requested by the user with the `paste as` command.
		 */
		PasteAs = 1,
	}

	/**
	 * Additional information about the paste operation.
	 */
	export interface DocumentPasteEditContext {

		/**
		 * Requested kind of paste edits to return.
		 *
		 * When a explicit kind if requested by {@linkcode DocumentPasteTriggerKind.PasteAs PasteAs}, providers are
		 * encourage to be more flexible when generating an edit of the requested kind.
		 */
		readonly only: DocumentDropOrPasteEditKind | undefined;

		/**
		 * The reason why paste edits were requested.
		 */
		readonly triggerKind: DocumentPasteTriggerKind;
	}

	/**
	 * Provider invoked when the user copies or pastes in a {@linkcode TextDocument}.
	 */
	export interface DocumentPasteEditProvider<T extends DocumentPasteEdit = DocumentPasteEdit> {

		/**
		 * Optional method invoked after the user copies from a {@link TextEditor text editor}.
		 *
		 * This allows the provider to attach metadata about the copied text to the {@link DataTransfer}. This data
		 * transfer is then passed back to providers in {@linkcode provideDocumentPasteEdits}.
		 *
		 * Note that currently any changes to the {@linkcode DataTransfer} are isolated to the current editor window.
		 * This means that any added metadata cannot be seen by other editor windows or by other applications.
		 *
		 * @param document Text document where the copy took place.
		 * @param ranges Ranges being copied in {@linkcode document}.
		 * @param dataTransfer The data transfer associated with the copy. You can store additional values on this for
		 * later use in {@linkcode provideDocumentPasteEdits}. This object is only valid for the duration of this method.
		 * @param token A cancellation token.
		 *
		 * @return Optional thenable that resolves when all changes to the `dataTransfer` are complete.
		 */
		prepareDocumentPaste?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, token: CancellationToken): void | Thenable<void>;

		/**
		 * Invoked before the user pastes into a {@link TextEditor text editor}.
		 *
		 * Returned edits can replace the standard pasting behavior.
		 *
		 * @param document Document being pasted into
		 * @param ranges Range in the {@linkcode document} to paste into.
		 * @param dataTransfer The {@link DataTransfer data transfer} associated with the paste. This object is only
		 * valid for the duration of the paste operation.
		 * @param context Additional context for the paste.
		 * @param token A cancellation token.
		 *
		 * @return Set of potential {@link DocumentPasteEdit edits} that can apply the paste. Only a single returned
		 * {@linkcode DocumentPasteEdit} is applied at a time. If multiple edits are returned from all providers, then
		 * the first is automatically applied and a widget is shown that lets the user switch to the other edits.
		 */
		provideDocumentPasteEdits?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, context: DocumentPasteEditContext, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Optional method which fills in the {@linkcode DocumentPasteEdit.additionalEdit} before the edit is applied.
		 *
		 * This is called once per edit and should be used if generating the complete edit may take a long time.
		 * Resolve can only be used to change {@linkcode DocumentPasteEdit.insertText} or {@linkcode DocumentPasteEdit.additionalEdit}.
		 *
		 * @param pasteEdit The {@linkcode DocumentPasteEdit} to resolve.
		 * @param token A cancellation token.
		 *
		 * @returns The resolved paste edit or a thenable that resolves to such. It is OK to return the given
		 * `pasteEdit`. If no result is returned, the given `pasteEdit` is used.
		 */
		resolveDocumentPasteEdit?(pasteEdit: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * An edit the applies a paste operation.
	 */
	export class DocumentPasteEdit {

		/**
		 * Human readable label that describes the edit.
		 */
		title: string;

		/**
		 * {@link DocumentDropOrPasteEditKind Kind} of the edit.
		 */
		kind: DocumentDropOrPasteEditKind;

		/**
		 * The text or snippet to insert at the pasted locations.
		 *
		 * If your edit requires more advanced insertion logic, set this to an empty string and provide an {@link DocumentPasteEdit.additionalEdit additional edit} instead.
		 */
		insertText: string | SnippetString;

		/**
		 * An optional additional edit to apply on paste.
		 */
		additionalEdit?: WorkspaceEdit;

		/**
		 * Controls ordering when multiple paste edits can potentially be applied.
		 *
		 * If this edit yields to another, it will be shown lower in the list of possible paste edits shown to the user.
		 */
		yieldTo?: readonly DocumentDropOrPasteEditKind[];

		/**
		 * Create a new paste edit.
		 *
		 * @param insertText The text or snippet to insert at the pasted locations.
		 * @param title Human readable label that describes the edit.
		 * @param kind {@link DocumentDropOrPasteEditKind Kind} of the edit.
		 */
		constructor(insertText: string | SnippetString, title: string, kind: DocumentDropOrPasteEditKind);
	}

	/**
	 * Provides additional metadata about how a {@linkcode DocumentPasteEditProvider} works.
	 */
	export interface DocumentPasteProviderMetadata {
		/**
		 * List of {@link DocumentDropOrPasteEditKind kinds} that the provider may return in {@linkcode DocumentPasteEditProvider.provideDocumentPasteEdits provideDocumentPasteEdits}.
		 *
		 * This is used to filter out providers when a specific {@link DocumentDropOrPasteEditKind kind} of edit is requested.
		 */
		readonly providedPasteEditKinds: readonly DocumentDropOrPasteEditKind[];

		/**
		 * Mime types that {@linkcode DocumentPasteEditProvider.prepareDocumentPaste prepareDocumentPaste} may add on copy.
		 */
		readonly copyMimeTypes?: readonly string[];

		/**
		 * Mime types that {@linkcode DocumentPasteEditProvider.provideDocumentPasteEdits provideDocumentPasteEdits} should be invoked for.
		 *
		 * This can either be an exact mime type such as `image/png`, or a wildcard pattern such as `image/*`.
		 *
		 * Use `text/uri-list` for resources dropped from the explorer or other tree views in the workbench.
		 *
		 * Use `files` to indicate that the provider should be invoked if any {@link DataTransferFile files} are present in the {@linkcode DataTransfer}.
		 * Note that {@linkcode DataTransferFile} entries are only created when pasting content from outside the editor, such as
		 * from the operating system.
		 */
		readonly pasteMimeTypes?: readonly string[];
	}

	/**
	 * A tuple of two characters, like a pair of
	 * opening and closing brackets.
	 */
	export type CharacterPair = [string, string];

	/**
	 * Describes how comments for a language work.
	 */
	export interface CommentRule {

		/**
		 * The line comment token, like `// this is a comment`
		 */
		lineComment?: string;

		/**
		 * The block comment character pair, like `/* block comment *&#47;`
		 */
		blockComment?: CharacterPair;
	}

	/**
	 * Describes indentation rules for a language.
	 */
	export interface IndentationRule {
		/**
		 * If a line matches this pattern, then all the lines after it should be unindented once (until another rule matches).
		 */
		decreaseIndentPattern: RegExp;
		/**
		 * If a line matches this pattern, then all the lines after it should be indented once (until another rule matches).
		 */
		increaseIndentPattern: RegExp;
		/**
		 * If a line matches this pattern, then **only the next line** after it should be indented once.
		 */
		indentNextLinePattern?: RegExp;
		/**
		 * If a line matches this pattern, then its indentation should not be changed and it should not be evaluated against the other rules.
		 */
		unIndentedLinePattern?: RegExp;
	}

	/**
	 * Describes what to do with the indentation when pressing Enter.
	 */
	export enum IndentAction {
		/**
		 * Insert new line and copy the previous line's indentation.
		 */
		None = 0,
		/**
		 * Insert new line and indent once (relative to the previous line's indentation).
		 */
		Indent = 1,
		/**
		 * Insert two new lines:
		 *  - the first one indented which will hold the cursor
		 *  - the second one at the same indentation level
		 */
		IndentOutdent = 2,
		/**
		 * Insert new line and outdent once (relative to the previous line's indentation).
		 */
		Outdent = 3
	}

	/**
	 * Describes what to do when pressing Enter.
	 */
	export interface EnterAction {
		/**
		 * Describe what to do with the indentation.
		 */
		indentAction: IndentAction;
		/**
		 * Describes text to be appended after the new line and after the indentation.
		 */
		appendText?: string;
		/**
		 * Describes the number of characters to remove from the new line's indentation.
		 */
		removeText?: number;
	}

	/**
	 * Describes a rule to be evaluated when pressing Enter.
	 */
	export interface OnEnterRule {
		/**
		 * This rule will only execute if the text before the cursor matches this regular expression.
		 */
		beforeText: RegExp;
		/**
		 * This rule will only execute if the text after the cursor matches this regular expression.
		 */
		afterText?: RegExp;
		/**
		 * This rule will only execute if the text above the current line matches this regular expression.
		 */
		previousLineText?: RegExp;
		/**
		 * The action to execute.
		 */
		action: EnterAction;
	}

	/**
	 * Enumeration of commonly encountered syntax token types.
	 */
	export enum SyntaxTokenType {
		/**
		 * Everything except tokens that are part of comments, string literals and regular expressions.
		 */
		Other = 0,
		/**
		 * A comment.
		 */
		Comment = 1,
		/**
		 * A string literal.
		 */
		String = 2,
		/**
		 * A regular expression.
		 */
		RegEx = 3
	}

	/**
	 * Describes pairs of strings where the close string will be automatically inserted when typing the opening string.
	 */
	export interface AutoClosingPair {
		/**
		 * The string that will trigger the automatic insertion of the closing string.
		 */
		open: string;
		/**
		 * The closing string that will be automatically inserted when typing the opening string.
		 */
		close: string;
		/**
		 * A set of tokens where the pair should not be auto closed.
		 */
		notIn?: SyntaxTokenType[];
	}

	/**
	 * The language configuration interfaces defines the contract between extensions
	 * and various editor features, like automatic bracket insertion, automatic indentation etc.
	 */
	export interface LanguageConfiguration {
		/**
		 * The language's comment settings.
		 */
		comments?: CommentRule;
		/**
		 * The language's brackets.
		 * This configuration implicitly affects pressing Enter around these brackets.
		 */
		brackets?: CharacterPair[];
		/**
		 * The language's word definition.
		 * If the language supports Unicode identifiers (e.g. JavaScript), it is preferable
		 * to provide a word definition that uses exclusion of known separators.
		 * e.g.: A regex that matches anything except known separators (and dot is allowed to occur in a floating point number):
		 * ```
		 * /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
		 * ```
		 */
		wordPattern?: RegExp;
		/**
		 * The language's indentation settings.
		 */
		indentationRules?: IndentationRule;
		/**
		 * The language's rules to be evaluated when pressing Enter.
		 */
		onEnterRules?: OnEnterRule[];
		/**
		 * The language's auto closing pairs.
		 */
		autoClosingPairs?: AutoClosingPair[];

		/**
		 * **Deprecated** Do not use.
		 *
		 * @deprecated Will be replaced by a better API soon.
		 */
		__electricCharacterSupport?: {
			/**
			 * This property is deprecated and will be **ignored** from
			 * the editor.
			 * @deprecated
			 */
			brackets?: any;
			/**
			 * This property is deprecated and not fully supported anymore by
			 * the editor (scope and lineStart are ignored).
			 * Use the autoClosingPairs property in the language configuration file instead.
			 * @deprecated
			 */
			docComment?: {
				/**
				 * @deprecated
				 */
				scope: string;
				/**
				 * @deprecated
				 */
				open: string;
				/**
				 * @deprecated
				 */
				lineStart: string;
				/**
				 * @deprecated
				 */
				close?: string;
			};
		};

		/**
		 * **Deprecated** Do not use.
		 *
		 * @deprecated * Use the autoClosingPairs property in the language configuration file instead.
		 */
		__characterPairSupport?: {
			/**
			 * @deprecated
			 */
			autoClosingPairs: {
				/**
				 * @deprecated
				 */
				open: string;
				/**
				 * @deprecated
				 */
				close: string;
				/**
				 * @deprecated
				 */
				notIn?: string[];
			}[];
		};
	}

	/**
	 * The configuration target
	 */
	export enum ConfigurationTarget {
		/**
		 * Global configuration
		 */
		Global = 1,

		/**
		 * Workspace configuration
		 */
		Workspace = 2,

		/**
		 * Workspace folder configuration
		 */
		WorkspaceFolder = 3
	}

	/**
	 * Represents the configuration. It is a merged view of
	 *
	 * - *Default Settings*
	 * - *Global (User) Settings*
	 * - *Workspace settings*
	 * - *Workspace Folder settings* - From one of the {@link workspace.workspaceFolders Workspace Folders} under which requested resource belongs to.
	 * - *Language settings* - Settings defined under requested language.
	 *
	 * The *effective* value (returned by {@linkcode WorkspaceConfiguration.get get}) is computed by overriding or merging the values in the following order:
	 *
	 * 1. `defaultValue` (if defined in `package.json` otherwise derived from the value's type)
	 * 1. `globalValue` (if defined)
	 * 1. `workspaceValue` (if defined)
	 * 1. `workspaceFolderValue` (if defined)
	 * 1. `defaultLanguageValue` (if defined)
	 * 1. `globalLanguageValue` (if defined)
	 * 1. `workspaceLanguageValue` (if defined)
	 * 1. `workspaceFolderLanguageValue` (if defined)
	 *
	 * **Note:** Only `object` value types are merged and all other value types are overridden.
	 *
	 * Example 1: Overriding
	 *
	 * ```ts
	 * defaultValue = 'on';
	 * globalValue = 'relative'
	 * workspaceFolderValue = 'off'
	 * value = 'off'
	 * ```
	 *
	 * Example 2: Language Values
	 *
	 * ```ts
	 * defaultValue = 'on';
	 * globalValue = 'relative'
	 * workspaceFolderValue = 'off'
	 * globalLanguageValue = 'on'
	 * value = 'on'
	 * ```
	 *
	 * Example 3: Object Values
	 *
	 * ```ts
	 * defaultValue = { "a": 1, "b": 2 };
	 * globalValue = { "b": 3, "c": 4 };
	 * value = { "a": 1, "b": 3, "c": 4 };
	 * ```
	 *
	 * *Note:* Workspace and Workspace Folder configurations contains `launch` and `tasks` settings. Their basename will be
	 * part of the section identifier. The following snippets shows how to retrieve all configurations
	 * from `launch.json`:
	 *
	 * ```ts
	 * // launch.json configuration
	 * const config = workspace.getConfiguration('launch', vscode.workspace.workspaceFolders[0].uri);
	 *
	 * // retrieve values
	 * const values = config.get('configurations');
	 * ```
	 *
	 * Refer to [Settings](https://code.visualstudio.com/docs/getstarted/settings) for more information.
	 */
	export interface WorkspaceConfiguration {

		/**
		 * Return a value from this configuration.
		 *
		 * @param section Configuration name, supports _dotted_ names.
		 * @returns The value `section` denotes or `undefined`.
		 */
		get<T>(section: string): T | undefined;

		/**
		 * Return a value from this configuration.
		 *
		 * @param section Configuration name, supports _dotted_ names.
		 * @param defaultValue A value should be returned when no value could be found, is `undefined`.
		 * @returns The value `section` denotes or the default.
		 */
		get<T>(section: string, defaultValue: T): T;

		/**
		 * Check if this configuration has a certain value.
		 *
		 * @param section Configuration name, supports _dotted_ names.
		 * @returns `true` if the section doesn't resolve to `undefined`.
		 */
		has(section: string): boolean;

		/**
		 * Retrieve all information about a configuration setting. A configuration value
		 * often consists of a *default* value, a global or installation-wide value,
		 * a workspace-specific value, folder-specific value
		 * and language-specific values (if {@link WorkspaceConfiguration} is scoped to a language).
		 *
		 * Also provides all language ids under which the given configuration setting is defined.
		 *
		 * *Note:* The configuration name must denote a leaf in the configuration tree
		 * (`editor.fontSize` vs `editor`) otherwise no result is returned.
		 *
		 * @param section Configuration name, supports _dotted_ names.
		 * @returns Information about a configuration setting or `undefined`.
		 */
		inspect<T>(section: string): {

			/**
			 * The fully qualified key of the configuration value
			 */
			key: string;

			/**
			 * The default value which is used when no other value is defined
			 */
			defaultValue?: T;

			/**
			 * The global or installation-wide value.
			 */
			globalValue?: T;

			/**
			 * The workspace-specific value.
			 */
			workspaceValue?: T;

			/**
			 * The workspace-folder-specific value.
			 */
			workspaceFolderValue?: T;

			/**
			 * Language specific default value when this configuration value is created for a {@link ConfigurationScope language scope}.
			 */
			defaultLanguageValue?: T;

			/**
			 * Language specific global value when this configuration value is created for a {@link ConfigurationScope language scope}.
			 */
			globalLanguageValue?: T;

			/**
			 * Language specific workspace value when this configuration value is created for a {@link ConfigurationScope language scope}.
			 */
			workspaceLanguageValue?: T;

			/**
			 * Language specific workspace-folder value when this configuration value is created for a {@link ConfigurationScope language scope}.
			 */
			workspaceFolderLanguageValue?: T;

			/**
			 * All language identifiers for which this configuration is defined.
			 */
			languageIds?: string[];

		} | undefined;

		/**
		 * Update a configuration value. The updated configuration values are persisted.
		 *
		 * A value can be changed in
		 *
		 * - {@link ConfigurationTarget.Global Global settings}: Changes the value for all instances of the editor.
		 * - {@link ConfigurationTarget.Workspace Workspace settings}: Changes the value for current workspace, if available.
		 * - {@link ConfigurationTarget.WorkspaceFolder Workspace folder settings}: Changes the value for settings from one of the {@link workspace.workspaceFolders Workspace Folders} under which the requested resource belongs to.
		 * - Language settings: Changes the value for the requested languageId.
		 *
		 * *Note:* To remove a configuration value use `undefined`, like so: `config.update('somekey', undefined)`
		 *
		 * @param section Configuration name, supports _dotted_ names.
		 * @param value The new value.
		 * @param configurationTarget The {@link ConfigurationTarget configuration target} or a boolean value.
		 *	- If `true` updates {@link ConfigurationTarget.Global Global settings}.
		 *	- If `false` updates {@link ConfigurationTarget.Workspace Workspace settings}.
		 *	- If `undefined` or `null` updates to {@link ConfigurationTarget.WorkspaceFolder Workspace folder settings} if configuration is resource specific,
		 * 	otherwise to {@link ConfigurationTarget.Workspace Workspace settings}.
		 * @param overrideInLanguage Whether to update the value in the scope of requested languageId or not.
		 *	- If `true` updates the value under the requested languageId.
		 *	- If `undefined` updates the value under the requested languageId only if the configuration is defined for the language.
		 * @throws error while updating
		 *	- configuration which is not registered.
		 *	- window configuration to workspace folder
		 *	- configuration to workspace or workspace folder when no workspace is opened.
		 *	- configuration to workspace folder when there is no workspace folder settings.
		 *	- configuration to workspace folder when {@link WorkspaceConfiguration} is not scoped to a resource.
		 */
		update(section: string, value: any, configurationTarget?: ConfigurationTarget | boolean | null, overrideInLanguage?: boolean): Thenable<void>;

		/**
		 * Readable dictionary that backs this configuration.
		 */
		readonly [key: string]: any;
	}

	/**
	 * Represents a location inside a resource, such as a line
	 * inside a text file.
	 */
	export class Location {

		/**
		 * The resource identifier of this location.
		 */
		uri: Uri;

		/**
		 * The document range of this location.
		 */
		range: Range;

		/**
		 * Creates a new location object.
		 *
		 * @param uri The resource identifier.
		 * @param rangeOrPosition The range or position. Positions will be converted to an empty range.
		 */
		constructor(uri: Uri, rangeOrPosition: Range | Position);
	}

	/**
	 * Represents the connection of two locations. Provides additional metadata over normal {@link Location locations},
	 * including an origin range.
	 */
	export interface LocationLink {
		/**
		 * Span of the origin of this link.
		 *
		 * Used as the underlined span for mouse definition hover. Defaults to the word range at
		 * the definition position.
		 */
		originSelectionRange?: Range;

		/**
		 * The target resource identifier of this link.
		 */
		targetUri: Uri;

		/**
		 * The full target range of this link.
		 */
		targetRange: Range;

		/**
		 * The span of this link.
		 */
		targetSelectionRange?: Range;
	}

	/**
	 * The event that is fired when diagnostics change.
	 */
	export interface DiagnosticChangeEvent {

		/**
		 * An array of resources for which diagnostics have changed.
		 */
		readonly uris: readonly Uri[];
	}

	/**
	 * Represents the severity of diagnostics.
	 */
	export enum DiagnosticSeverity {

		/**
		 * Something not allowed by the rules of a language or other means.
		 */
		Error = 0,

		/**
		 * Something suspicious but allowed.
		 */
		Warning = 1,

		/**
		 * Something to inform about but not a problem.
		 */
		Information = 2,

		/**
		 * Something to hint to a better way of doing it, like proposing
		 * a refactoring.
		 */
		Hint = 3
	}

	/**
	 * Represents a related message and source code location for a diagnostic. This should be
	 * used to point to code locations that cause or related to a diagnostics, e.g. when duplicating
	 * a symbol in a scope.
	 */
	export class DiagnosticRelatedInformation {

		/**
		 * The location of this related diagnostic information.
		 */
		location: Location;

		/**
		 * The message of this related diagnostic information.
		 */
		message: string;

		/**
		 * Creates a new related diagnostic information object.
		 *
		 * @param location The location.
		 * @param message The message.
		 */
		constructor(location: Location, message: string);
	}

	/**
	 * Additional metadata about the type of a diagnostic.
	 */
	export enum DiagnosticTag {
		/**
		 * Unused or unnecessary code.
		 *
		 * Diagnostics with this tag are rendered faded out. The amount of fading
		 * is controlled by the `"editorUnnecessaryCode.opacity"` theme color. For
		 * example, `"editorUnnecessaryCode.opacity": "#000000c0"` will render the
		 * code with 75% opacity. For high contrast themes, use the
		 * `"editorUnnecessaryCode.border"` theme color to underline unnecessary code
		 * instead of fading it out.
		 */
		Unnecessary = 1,

		/**
		 * Deprecated or obsolete code.
		 *
		 * Diagnostics with this tag are rendered with a strike through.
		 */
		Deprecated = 2,
	}

	/**
	 * Represents a diagnostic, such as a compiler error or warning. Diagnostic objects
	 * are only valid in the scope of a file.
	 */
	export class Diagnostic {

		/**
		 * The range to which this diagnostic applies.
		 */
		range: Range;

		/**
		 * The human-readable message.
		 */
		message: string;

		/**
		 * The severity, default is {@link DiagnosticSeverity.Error error}.
		 */
		severity: DiagnosticSeverity;

		/**
		 * A human-readable string describing the source of this
		 * diagnostic, e.g. 'typescript' or 'super lint'.
		 */
		source?: string;

		/**
		 * A code or identifier for this diagnostic.
		 * Should be used for later processing, e.g. when providing {@link CodeActionContext code actions}.
		 */
		code?: string | number | {
			/**
			 * A code or identifier for this diagnostic.
			 * Should be used for later processing, e.g. when providing {@link CodeActionContext code actions}.
			 */
			value: string | number;

			/**
			 * A target URI to open with more information about the diagnostic error.
			 */
			target: Uri;
		};

		/**
		 * An array of related diagnostic information, e.g. when symbol-names within
		 * a scope collide all definitions can be marked via this property.
		 */
		relatedInformation?: DiagnosticRelatedInformation[];

		/**
		 * Additional metadata about the diagnostic.
		 */
		tags?: DiagnosticTag[];

		/**
		 * Creates a new diagnostic object.
		 *
		 * @param range The range to which this diagnostic applies.
		 * @param message The human-readable message.
		 * @param severity The severity, default is {@link DiagnosticSeverity.Error error}.
		 */
		constructor(range: Range, message: string, severity?: DiagnosticSeverity);
	}

	/**
	 * A diagnostics collection is a container that manages a set of
	 * {@link Diagnostic diagnostics}. Diagnostics are always scopes to a
	 * diagnostics collection and a resource.
	 *
	 * To get an instance of a `DiagnosticCollection` use
	 * {@link languages.createDiagnosticCollection createDiagnosticCollection}.
	 */
	export interface DiagnosticCollection extends Iterable<[uri: Uri, diagnostics: readonly Diagnostic[]]> {

		/**
		 * The name of this diagnostic collection, for instance `typescript`. Every diagnostic
		 * from this collection will be associated with this name. Also, the task framework uses this
		 * name when defining [problem matchers](https://code.visualstudio.com/docs/editor/tasks#_defining-a-problem-matcher).
		 */
		readonly name: string;

		/**
		 * Assign diagnostics for given resource. Will replace
		 * existing diagnostics for that resource.
		 *
		 * @param uri A resource identifier.
		 * @param diagnostics Array of diagnostics or `undefined`
		 */
		set(uri: Uri, diagnostics: readonly Diagnostic[] | undefined): void;

		/**
		 * Replace diagnostics for multiple resources in this collection.
		 *
		 *  _Note_ that multiple tuples of the same uri will be merged, e.g
		 * `[[file1, [d1]], [file1, [d2]]]` is equivalent to `[[file1, [d1, d2]]]`.
		 * If a diagnostics item is `undefined` as in `[file1, undefined]`
		 * all previous but not subsequent diagnostics are removed.
		 *
		 * @param entries An array of tuples, like `[[file1, [d1, d2]], [file2, [d3, d4, d5]]]`, or `undefined`.
		 */
		set(entries: ReadonlyArray<[Uri, readonly Diagnostic[] | undefined]>): void;

		/**
		 * Remove all diagnostics from this collection that belong
		 * to the provided `uri`. The same as `#set(uri, undefined)`.
		 *
		 * @param uri A resource identifier.
		 */
		delete(uri: Uri): void;

		/**
		 * Remove all diagnostics from this collection. The same
		 * as calling `#set(undefined)`;
		 */
		clear(): void;

		/**
		 * Iterate over each entry in this collection.
		 *
		 * @param callback Function to execute for each entry.
		 * @param thisArg The `this` context used when invoking the handler function.
		 */
		forEach(callback: (uri: Uri, diagnostics: readonly Diagnostic[], collection: DiagnosticCollection) => any, thisArg?: any): void;

		/**
		 * Get the diagnostics for a given resource. *Note* that you cannot
		 * modify the diagnostics-array returned from this call.
		 *
		 * @param uri A resource identifier.
		 * @returns An immutable array of {@link Diagnostic diagnostics} or `undefined`.
		 */
		get(uri: Uri): readonly Diagnostic[] | undefined;

		/**
		 * Check if this collection contains diagnostics for a
		 * given resource.
		 *
		 * @param uri A resource identifier.
		 * @returns `true` if this collection has diagnostic for the given resource.
		 */
		has(uri: Uri): boolean;

		/**
		 * Dispose and free associated resources. Calls
		 * {@link DiagnosticCollection.clear clear}.
		 */
		dispose(): void;
	}

	/**
	 * Represents the severity of a language status item.
	 */
	/**
	 * Represents the severity level of a language status.
	 */
	export enum LanguageStatusSeverity {
		/**
		 * Informational severity level.
		 */
		Information = 0,
		/**
		 * Warning severity level.
		 */
		Warning = 1,
		/**
		 * Error severity level.
		 */
		Error = 2
	}

	/**
	 * A language status item is the preferred way to present language status reports for the active text editors,
	 * such as selected linter or notifying about a configuration problem.
	 */
	export interface LanguageStatusItem {

		/**
		 * The identifier of this item.
		 */
		readonly id: string;

		/**
		 * The short name of this item, like 'Java Language Status', etc.
		 */
		name: string | undefined;

		/**
		 * A {@link DocumentSelector selector} that defines for what editors
		 * this item shows.
		 */
		selector: DocumentSelector;

		/**
		 * The severity of this item.
		 *
		 * Defaults to {@link LanguageStatusSeverity.Information information}. You can use this property to
		 * signal to users that there is a problem that needs attention, like a missing executable or an
		 * invalid configuration.
		 */
		severity: LanguageStatusSeverity;

		/**
		 * The text to show for the entry. You can embed icons in the text by leveraging the syntax:
		 *
		 * `My text $(icon-name) contains icons like $(icon-name) this one.`
		 *
		 * Where the icon-name is taken from the ThemeIcon [icon set](https://code.visualstudio.com/api/references/icons-in-labels#icon-listing), e.g.
		 * `light-bulb`, `thumbsup`, `zap` etc.
		 */
		text: string;

		/**
		 * Optional, human-readable details for this item.
		 */
		detail?: string;

		/**
		 * Controls whether the item is shown as "busy". Defaults to `false`.
		 */
		busy: boolean;

		/**
		 * A {@linkcode Command command} for this item.
		 */
		command: Command | undefined;

		/**
		 * Accessibility information used when a screen reader interacts with this item
		 */
		accessibilityInformation?: AccessibilityInformation;

		/**
		 * Dispose and free associated resources.
		 */
		dispose(): void;
	}

	/**
	 * Denotes a location of an editor in the window. Editors can be arranged in a grid
	 * and each column represents one editor location in that grid by counting the editors
	 * in order of their appearance.
	 */
	export enum ViewColumn {
		/**
		 * A *symbolic* editor column representing the currently active column. This value
		 * can be used when opening editors, but the *resolved* {@link TextEditor.viewColumn viewColumn}-value
		 * of editors will always be `One`, `Two`, `Three`,... or `undefined` but never `Active`.
		 */
		Active = -1,
		/**
		 * A *symbolic* editor column representing the column to the side of the active one. This value
		 * can be used when opening editors, but the *resolved* {@link TextEditor.viewColumn viewColumn}-value
		 * of editors will always be `One`, `Two`, `Three`,... or `undefined` but never `Beside`.
		 */
		Beside = -2,
		/**
		 * The first editor column.
		 */
		One = 1,
		/**
		 * The second editor column.
		 */
		Two = 2,
		/**
		 * The third editor column.
		 */
		Three = 3,
		/**
		 * The fourth editor column.
		 */
		Four = 4,
		/**
		 * The fifth editor column.
		 */
		Five = 5,
		/**
		 * The sixth editor column.
		 */
		Six = 6,
		/**
		 * The seventh editor column.
		 */
		Seven = 7,
		/**
		 * The eighth editor column.
		 */
		Eight = 8,
		/**
		 * The ninth editor column.
		 */
		Nine = 9
	}

	/**
	 * An output channel is a container for readonly textual information.
	 *
	 * To get an instance of an `OutputChannel` use
	 * {@link window.createOutputChannel createOutputChannel}.
	 */
	export interface OutputChannel {

		/**
		 * The human-readable name of this output channel.
		 */
		readonly name: string;

		/**
		 * Append the given value to the channel.
		 *
		 * @param value A string, falsy values will not be printed.
		 */
		append(value: string): void;

		/**
		 * Append the given value and a line feed character
		 * to the channel.
		 *
		 * @param value A string, falsy values will be printed.
		 */
		appendLine(value: string): void;

		/**
		 * Replaces all output from the channel with the given value.
		 *
		 * @param value A string, falsy values will not be printed.
		 */
		replace(value: string): void;

		/**
		 * Removes all output from the channel.
		 */
		clear(): void;

		/**
		 * Reveal this channel in the UI.
		 *
		 * @param preserveFocus When `true` the channel will not take focus.
		 */
		show(preserveFocus?: boolean): void;

		/**
		 * Reveal this channel in the UI.
		 *
		 * @deprecated Use the overload with just one parameter (`show(preserveFocus?: boolean): void`).
		 *
		 * @param column This argument is **deprecated** and will be ignored.
		 * @param preserveFocus When `true` the channel will not take focus.
		 */
		show(column?: ViewColumn, preserveFocus?: boolean): void;

		/**
		 * Hide this channel from the UI.
		 */
		hide(): void;

		/**
		 * Dispose and free associated resources.
		 */
		dispose(): void;
	}

	/**
	 * A channel for containing log output.
	 *
	 * To get an instance of a `LogOutputChannel` use
	 * {@link window.createOutputChannel createOutputChannel}.
	 */
	export interface LogOutputChannel extends OutputChannel {

		/**
		 * The current log level of the channel. Defaults to {@link env.logLevel editor log level}.
		 */
		readonly logLevel: LogLevel;

		/**
		 * An {@link Event} which fires when the log level of the channel changes.
		 */
		readonly onDidChangeLogLevel: Event<LogLevel>;

		/**
		 * Outputs the given trace message to the channel. Use this method to log verbose information.
		 *
		 * The message is only logged if the channel is configured to display {@link LogLevel.Trace trace} log level.
		 *
		 * @param message trace message to log
		 */
		trace(message: string, ...args: any[]): void;

		/**
		 * Outputs the given debug message to the channel.
		 *
		 * The message is only logged if the channel is configured to display {@link LogLevel.Debug debug} log level or lower.
		 *
		 * @param message debug message to log
		 */
		debug(message: string, ...args: any[]): void;

		/**
		 * Outputs the given information message to the channel.
		 *
		 * The message is only logged if the channel is configured to display {@link LogLevel.Info info} log level or lower.
		 *
		 * @param message info message to log
		 */
		info(message: string, ...args: any[]): void;

		/**
		 * Outputs the given warning message to the channel.
		 *
		 * The message is only logged if the channel is configured to display {@link LogLevel.Warning warning} log level or lower.
		 *
		 * @param message warning message to log
		 */
		warn(message: string, ...args: any[]): void;

		/**
		 * Outputs the given error or error message to the channel.
		 *
		 * The message is only logged if the channel is configured to display {@link LogLevel.Error error} log level or lower.
		 *
		 * @param error Error or error message to log
		 */
		error(error: string | Error, ...args: any[]): void;
	}

	/**
	 * Accessibility information which controls screen reader behavior.
	 */
	export interface AccessibilityInformation {
		/**
		 * Label to be read out by a screen reader once the item has focus.
		 */
		readonly label: string;

		/**
		 * Role of the widget which defines how a screen reader interacts with it.
		 * The role should be set in special cases when for example a tree-like element behaves like a checkbox.
		 * If role is not specified the editor will pick the appropriate role automatically.
		 * More about aria roles can be found here https://w3c.github.io/aria/#widget_roles
		 */
		readonly role?: string;
	}

	/**
	 * Represents the alignment of status bar items.
	 */
	export enum StatusBarAlignment {

		/**
		 * Aligned to the left side.
		 */
		Left = 1,

		/**
		 * Aligned to the right side.
		 */
		Right = 2
	}

	/**
	 * A status bar item is a status bar contribution that can
	 * show text and icons and run a command on click.
	 */
	export interface StatusBarItem {

		/**
		 * The identifier of this item.
		 *
		 * *Note*: if no identifier was provided by the {@linkcode window.createStatusBarItem}
		 * method, the identifier will match the {@link Extension.id extension identifier}.
		 */
		readonly id: string;

		/**
		 * The alignment of this item.
		 */
		readonly alignment: StatusBarAlignment;

		/**
		 * The priority of this item. Higher value means the item should
		 * be shown more to the left.
		 */
		readonly priority: number | undefined;

		/**
		 * The name of the entry, like 'Python Language Indicator', 'Git Status' etc.
		 * Try to keep the length of the name short, yet descriptive enough that
		 * users can understand what the status bar item is about.
		 */
		name: string | undefined;

		/**
		 * The text to show for the entry. You can embed icons in the text by leveraging the syntax:
		 *
		 * `My text $(icon-name) contains icons like $(icon-name) this one.`
		 *
		 * Where the icon-name is taken from the ThemeIcon [icon set](https://code.visualstudio.com/api/references/icons-in-labels#icon-listing), e.g.
		 * `light-bulb`, `thumbsup`, `zap` etc.
		 */
		text: string;

		/**
		 * The tooltip text when you hover over this entry.
		 */
		tooltip: string | MarkdownString | undefined;

		/**
		 * The foreground color for this entry.
		 */
		color: string | ThemeColor | undefined;

		/**
		 * The background color for this entry.
		 *
		 * *Note*: only the following colors are supported:
		 * * `new ThemeColor('statusBarItem.errorBackground')`
		 * * `new ThemeColor('statusBarItem.warningBackground')`
		 *
		 * More background colors may be supported in the future.
		 *
		 * *Note*: when a background color is set, the statusbar may override
		 * the `color` choice to ensure the entry is readable in all themes.
		 */
		backgroundColor: ThemeColor | undefined;

		/**
		 * {@linkcode Command} or identifier of a command to run on click.
		 *
		 * The command must be {@link commands.getCommands known}.
		 *
		 * Note that if this is a {@linkcode Command} object, only the {@linkcode Command.command command} and {@linkcode Command.arguments arguments}
		 * are used by the editor.
		 */
		command: string | Command | undefined;

		/**
		 * Accessibility information used when a screen reader interacts with this StatusBar item
		 */
		accessibilityInformation: AccessibilityInformation | undefined;

		/**
		 * Shows the entry in the status bar.
		 */
		show(): void;

		/**
		 * Hide the entry in the status bar.
		 */
		hide(): void;

		/**
		 * Dispose and free associated resources. Call
		 * {@link StatusBarItem.hide hide}.
		 */
		dispose(): void;
	}

	/**
	 * Defines a generalized way of reporting progress updates.
	 */
	export interface Progress<T> {

		/**
		 * Report a progress update.
		 * @param value A progress item, like a message and/or an
		 * report on how much work finished
		 */
		report(value: T): void;
	}

	/**
	 * An individual terminal instance within the integrated terminal.
	 */
	export interface Terminal {

		/**
		 * The name of the terminal.
		 */
		readonly name: string;

		/**
		 * The process ID of the shell process.
		 */
		readonly processId: Thenable<number | undefined>;

		/**
		 * The object used to initialize the terminal, this is useful for example to detecting the
		 * shell type of when the terminal was not launched by this extension or for detecting what
		 * folder the shell was launched in.
		 */
		readonly creationOptions: Readonly<TerminalOptions | ExtensionTerminalOptions>;

		/**
		 * The exit status of the terminal, this will be undefined while the terminal is active.
		 *
		 * **Example:** Show a notification with the exit code when the terminal exits with a
		 * non-zero exit code.
		 * ```typescript
		 * window.onDidCloseTerminal(t => {
		 *   if (t.exitStatus && t.exitStatus.code) {
		 *   	vscode.window.showInformationMessage(`Exit code: ${t.exitStatus.code}`);
		 *   }
		 * });
		 * ```
		 */
		readonly exitStatus: TerminalExitStatus | undefined;

		/**
		 * The current state of the {@link Terminal}.
		 */
		readonly state: TerminalState;

		/**
		 * An object that contains [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)-powered
		 * features for the terminal. This will always be `undefined` immediately after the terminal
		 * is created. Listen to {@link window.onDidChangeTerminalShellIntegration} to be notified
		 * when shell integration is activated for a terminal.
		 *
		 * Note that this object may remain undefined if shell integration never activates. For
		 * example Command Prompt does not support shell integration and a user's shell setup could
		 * conflict with the automatic shell integration activation.
		 */
		readonly shellIntegration: TerminalShellIntegration | undefined;

		/**
		 * Send text to the terminal. The text is written to the stdin of the underlying pty process
		 * (shell) of the terminal.
		 *
		 * @param text The text to send.
		 * @param shouldExecute Indicates that the text being sent should be executed rather than just inserted in the terminal.
		 * The character(s) added are `\n` or `\r\n`, depending on the platform. This defaults to `true`.
		 */
		sendText(text: string, shouldExecute?: boolean): void;

		/**
		 * Show the terminal panel and reveal this terminal in the UI.
		 *
		 * @param preserveFocus When `true` the terminal will not take focus.
		 */
		show(preserveFocus?: boolean): void;

		/**
		 * Hide the terminal panel if this terminal is currently showing.
		 */
		hide(): void;

		/**
		 * Dispose and free associated resources.
		 */
		dispose(): void;
	}

	/**
	 * The location of the terminal.
	 */
	export enum TerminalLocation {
		/**
		 * In the terminal view
		 */
		Panel = 1,
		/**
		 * In the editor area
		 */
		Editor = 2,
	}

	/**
	 * Assumes a {@link TerminalLocation} of editor and allows specifying a {@link ViewColumn} and
	 * {@link TerminalEditorLocationOptions.preserveFocus preserveFocus } property
	 */
	export interface TerminalEditorLocationOptions {
		/**
		 * A view column in which the {@link Terminal terminal} should be shown in the editor area.
		 * The default is the {@link ViewColumn.Active active}. Columns that do not exist
		 * will be created as needed up to the maximum of {@linkcode ViewColumn.Nine}.
		 * Use {@linkcode ViewColumn.Beside} to open the editor to the side of the currently
		 * active one.
		 */
		viewColumn: ViewColumn;
		/**
		 * An optional flag that when `true` will stop the {@link Terminal} from taking focus.
		 */
		preserveFocus?: boolean;
	}

	/**
	 * Uses the parent {@link Terminal}'s location for the terminal
	 */
	export interface TerminalSplitLocationOptions {
		/**
		 * The parent terminal to split this terminal beside. This works whether the parent terminal
		 * is in the panel or the editor area.
		 */
		parentTerminal: Terminal;
	}

	/**
	 * Represents the state of a {@link Terminal}.
	 */
	export interface TerminalState {
		/**
		 * Whether the {@link Terminal} has been interacted with. Interaction means that the
		 * terminal has sent data to the process which depending on the terminal's _mode_. By
		 * default input is sent when a key is pressed or when a command or extension sends text,
		 * but based on the terminal's mode it can also happen on:
		 *
		 * - a pointer click event
		 * - a pointer scroll event
		 * - a pointer move event
		 * - terminal focus in/out
		 *
		 * For more information on events that can send data see "DEC Private Mode Set (DECSET)" on
		 * https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
		 */
		readonly isInteractedWith: boolean;

		/**
		 * The detected shell type of the {@link Terminal}. This will be `undefined` when there is
		 * not a clear signal as to what the shell is, or the shell is not supported yet. This
		 * value should change to the shell type of a sub-shell when launched (for example, running
		 * `bash` inside `zsh`).
		 *
		 * Note that the possible values are currently defined as any of the following:
		 * 'bash', 'cmd', 'csh', 'fish', 'gitbash', 'julia', 'ksh', 'node', 'nu', 'pwsh', 'python',
		 * 'sh', 'wsl', 'zsh'.
		 */
		readonly shell: string | undefined;
	}

	/**
	 * [Shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)-powered capabilities owned by a terminal.
	 */
	export interface TerminalShellIntegration {
		/**
		 * The current working directory of the terminal. This {@link Uri} may represent a file on
		 * another machine (eg. ssh into another machine). This requires the shell integration to
		 * support working directory reporting.
		 */
		readonly cwd: Uri | undefined;

		/**
		 * Execute a command, sending ^C as necessary to interrupt any running command if needed.
		 *
		 * @param commandLine The command line to execute, this is the exact text that will be sent
		 * to the terminal.
		 *
		 * @example
		 * // Execute a command in a terminal immediately after being created
		 * const myTerm = window.createTerminal();
		 * window.onDidChangeTerminalShellIntegration(async ({ terminal, shellIntegration }) => {
		 *   if (terminal === myTerm) {
		 *     const execution = shellIntegration.executeCommand('echo "Hello world"');
		 *     window.onDidEndTerminalShellExecution(event => {
		 *       if (event.execution === execution) {
		 *         console.log(`Command exited with code ${event.exitCode}`);
		 *       }
		 *     });
		 *   }
		 * }));
		 * // Fallback to sendText if there is no shell integration within 3 seconds of launching
		 * setTimeout(() => {
		 *   if (!myTerm.shellIntegration) {
		 *     myTerm.sendText('echo "Hello world"');
		 *     // Without shell integration, we can't know when the command has finished or what the
		 *     // exit code was.
		 *   }
		 * }, 3000);
		 *
		 * @example
		 * // Send command to terminal that has been alive for a while
		 * const commandLine = 'echo "Hello world"';
		 * if (term.shellIntegration) {
		 *   const execution = shellIntegration.executeCommand({ commandLine });
		 *   window.onDidEndTerminalShellExecution(event => {
		 *     if (event.execution === execution) {
		 *       console.log(`Command exited with code ${event.exitCode}`);
		 *     }
		 *   });
		 * } else {
		 *   term.sendText(commandLine);
		 *   // Without shell integration, we can't know when the command has finished or what the
		 *   // exit code was.
		 * }
		 */
		executeCommand(commandLine: string): TerminalShellExecution;

		/**
		 * Execute a command, sending ^C as necessary to interrupt any running command if needed.
		 *
		 * *Note* This is not guaranteed to work as [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)
		 * must be activated. Check whether {@link TerminalShellExecution.exitCode} is rejected to
		 * verify whether it was successful.
		 *
		 * @param executable A command to run.
		 * @param args Arguments to launch the executable with. The arguments will be escaped such
		 * that they are interpreted as single arguments when the argument both contains whitespace
		 * and does not include any single quote, double quote or backtick characters.
		 *
		 * Note that this escaping is not intended to be a security measure, be careful when passing
		 * untrusted data to this API as strings like `$(...)` can often be used in shells to
		 * execute code within a string.
		 *
		 * @example
		 * // Execute a command in a terminal immediately after being created
		 * const myTerm = window.createTerminal();
		 * window.onDidChangeTerminalShellIntegration(async ({ terminal, shellIntegration }) => {
		 *   if (terminal === myTerm) {
		 *     const command = shellIntegration.executeCommand({
		 *       command: 'echo',
		 *       args: ['Hello world']
		 *     });
		 *     const code = await command.exitCode;
		 *     console.log(`Command exited with code ${code}`);
		 *   }
		 * }));
		 * // Fallback to sendText if there is no shell integration within 3 seconds of launching
		 * setTimeout(() => {
		 *   if (!myTerm.shellIntegration) {
		 *     myTerm.sendText('echo "Hello world"');
		 *     // Without shell integration, we can't know when the command has finished or what the
		 *     // exit code was.
		 *   }
		 * }, 3000);
		 *
		 * @example
		 * // Send command to terminal that has been alive for a while
		 * const commandLine = 'echo "Hello world"';
		 * if (term.shellIntegration) {
		 *   const command = term.shellIntegration.executeCommand({
		 *     command: 'echo',
		 *     args: ['Hello world']
		 *   });
		 *   const code = await command.exitCode;
		 *   console.log(`Command exited with code ${code}`);
		 * } else {
		 *   term.sendText(commandLine);
		 *   // Without shell integration, we can't know when the command has finished or what the
		 *   // exit code was.
		 * }
		 */
		executeCommand(executable: string, args: string[]): TerminalShellExecution;
	}

	/**
	 * A command that was executed in a terminal.
	 */
	export interface TerminalShellExecution {
		/**
		 * The command line that was executed. The {@link TerminalShellExecutionCommandLineConfidence confidence}
		 * of this value depends on the specific shell's shell integration implementation. This
		 * value may become more accurate after {@link window.onDidEndTerminalShellExecution} is
		 * fired.
		 *
		 * @example
		 * // Log the details of the command line on start and end
		 * window.onDidStartTerminalShellExecution(event => {
		 *   const commandLine = event.execution.commandLine;
		 *   console.log(`Command started\n${summarizeCommandLine(commandLine)}`);
		 * });
		 * window.onDidEndTerminalShellExecution(event => {
		 *   const commandLine = event.execution.commandLine;
		 *   console.log(`Command ended\n${summarizeCommandLine(commandLine)}`);
		 * });
		 * function summarizeCommandLine(commandLine: TerminalShellExecutionCommandLine) {
		 *   return [
		 *     `  Command line: ${command.commandLine.value}`,
		 *     `  Confidence: ${command.commandLine.confidence}`,
		 *     `  Trusted: ${command.commandLine.isTrusted}
		 *   ].join('\n');
		 * }
		 */
		readonly commandLine: TerminalShellExecutionCommandLine;

		/**
		 * The working directory that was reported by the shell when this command executed. This
		 * {@link Uri} may represent a file on another machine (eg. ssh into another machine). This
		 * requires the shell integration to support working directory reporting.
		 */
		readonly cwd: Uri | undefined;

		/**
		 * Creates a stream of raw data (including escape sequences) that is written to the
		 * terminal. This will only include data that was written after `read` was called for
		 * the first time, ie. you must call `read` immediately after the command is executed via
		 * {@link TerminalShellIntegration.executeCommand} or
		 * {@link window.onDidStartTerminalShellExecution} to not miss any data.
		 *
		 * @example
		 * // Log all data written to the terminal for a command
		 * const command = term.shellIntegration.executeCommand({ commandLine: 'echo "Hello world"' });
		 * const stream = command.read();
		 * for await (const data of stream) {
		 *   console.log(data);
		 * }
		 */
		read(): AsyncIterable<string>;
	}

	/**
	 * A command line that was executed in a terminal.
	 */
	export interface TerminalShellExecutionCommandLine {
		/**
		 * The full command line that was executed, including both the command and its arguments.
		 */
		readonly value: string;

		/**
		 * Whether the command line value came from a trusted source and is therefore safe to
		 * execute without user additional confirmation, such as a notification that asks "Do you
		 * want to execute (command)?". This verification is likely only needed if you are going to
		 * execute the command again.
		 *
		 * This is `true` only when the command line was reported explicitly by the shell
		 * integration script (ie. {@link TerminalShellExecutionCommandLineConfidence.High high confidence})
		 * and it used a nonce for verification.
		 */
		readonly isTrusted: boolean;

		/**
		 * The confidence of the command line value which is determined by how the value was
		 * obtained. This depends upon the implementation of the shell integration script.
		 */
		readonly confidence: TerminalShellExecutionCommandLineConfidence;
	}

	/**
	 * The confidence of a {@link TerminalShellExecutionCommandLine} value.
	 */
	export enum TerminalShellExecutionCommandLineConfidence {
		/**
		 * The command line value confidence is low. This means that the value was read from the
		 * terminal buffer using markers reported by the shell integration script. Additionally one
		 * of the following conditions will be met:
		 *
		 * - The command started on the very left-most column which is unusual, or
		 * - The command is multi-line which is more difficult to accurately detect due to line
		 *   continuation characters and right prompts.
		 * - Command line markers were not reported by the shell integration script.
		 */
		Low = 0,

		/**
		 * The command line value confidence is medium. This means that the value was read from the
		 * terminal buffer using markers reported by the shell integration script. The command is
		 * single-line and does not start on the very left-most column (which is unusual).
		 */
		Medium = 1,

		/**
		 * The command line value confidence is high. This means that the value was explicitly sent
		 * from the shell integration script or the command was executed via the
		 * {@link TerminalShellIntegration.executeCommand} API.
		 */
		High = 2
	}

	/**
	 * An event signalling that a terminal's shell integration has changed.
	 */
	export interface TerminalShellIntegrationChangeEvent {
		/**
		 * The terminal that shell integration has been activated in.
		 */
		readonly terminal: Terminal;

		/**
		 * The shell integration object.
		 */
		readonly shellIntegration: TerminalShellIntegration;
	}

	/**
	 * An event signalling that an execution has started in a terminal.
	 */
	export interface TerminalShellExecutionStartEvent {
		/**
		 * The terminal that shell integration has been activated in.
		 */
		readonly terminal: Terminal;

		/**
		 * The shell integration object.
		 */
		readonly shellIntegration: TerminalShellIntegration;

		/**
		 * The terminal shell execution that has ended.
		 */
		readonly execution: TerminalShellExecution;
	}

	/**
	 * An event signalling that an execution has ended in a terminal.
	 */
	export interface TerminalShellExecutionEndEvent {
		/**
		 * The terminal that shell integration has been activated in.
		 */
		readonly terminal: Terminal;

		/**
		 * The shell integration object.
		 */
		readonly shellIntegration: TerminalShellIntegration;

		/**
		 * The terminal shell execution that has ended.
		 */
		readonly execution: TerminalShellExecution;

		/**
		 * The exit code reported by the shell.
		 *
		 * When this is `undefined` it can mean several things:
		 *
		 * - The shell either did not report an exit  code (ie. the shell integration script is
		 *   misbehaving)
		 * - The shell reported a command started before the command finished (eg. a sub-shell was
		 *   opened).
		 * - The user canceled the command via ctrl+c.
		 * - The user pressed enter when there was no input.
		 *
		 * Generally this should not happen. Depending on the use case, it may be best to treat this
		 * as a failure.
		 *
		 * @example
		 * const execution = shellIntegration.executeCommand({
		 *   command: 'echo',
		 *   args: ['Hello world']
		 * });
		 * window.onDidEndTerminalShellExecution(event => {
		 *   if (event.execution === execution) {
		 *     if (event.exitCode === undefined) {
		 * 	     console.log('Command finished but exit code is unknown');
		 *     } else if (event.exitCode === 0) {
		 * 	     console.log('Command succeeded');
		 *     } else {
		 * 	     console.log('Command failed');
		 *     }
		 *   }
		 * });
		 */
		readonly exitCode: number | undefined;
	}

	/**
	 * Provides information on a line in a terminal in order to provide links for it.
	 */
	export interface TerminalLinkContext {
		/**
		 * This is the text from the unwrapped line in the terminal.
		 */
		line: string;

		/**
		 * The terminal the link belongs to.
		 */
		terminal: Terminal;
	}

	/**
	 * A provider that enables detection and handling of links within terminals.
	 */
	export interface TerminalLinkProvider<T extends TerminalLink = TerminalLink> {
		/**
		 * Provide terminal links for the given context. Note that this can be called multiple times
		 * even before previous calls resolve, make sure to not share global objects (eg. `RegExp`)
		 * that could have problems when asynchronous usage may overlap.
		 * @param context Information about what links are being provided for.
		 * @param token A cancellation token.
		 * @returns A list of terminal links for the given line.
		 */
		provideTerminalLinks(context: TerminalLinkContext, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Handle an activated terminal link.
		 * @param link The link to handle.
		 */
		handleTerminalLink(link: T): ProviderResult<void>;
	}

	/**
	 * A link on a terminal line.
	 */
	export class TerminalLink {
		/**
		 * The start index of the link on {@link TerminalLinkContext.line}.
		 */
		startIndex: number;

		/**
		 * The length of the link on {@link TerminalLinkContext.line}.
		 */
		length: number;

		/**
		 * The tooltip text when you hover over this link.
		 *
		 * If a tooltip is provided, is will be displayed in a string that includes instructions on
		 * how to trigger the link, such as `{0} (ctrl + click)`. The specific instructions vary
		 * depending on OS, user settings, and localization.
		 */
		tooltip?: string;

		/**
		 * Creates a new terminal link.
		 * @param startIndex The start index of the link on {@link TerminalLinkContext.line}.
		 * @param length The length of the link on {@link TerminalLinkContext.line}.
		 * @param tooltip The tooltip text when you hover over this link.
		 *
		 * If a tooltip is provided, is will be displayed in a string that includes instructions on
		 * how to trigger the link, such as `{0} (ctrl + click)`. The specific instructions vary
		 * depending on OS, user settings, and localization.
		 */
		constructor(startIndex: number, length: number, tooltip?: string);
	}

	/**
	 * Provides a terminal profile for the contributed terminal profile when launched via the UI or
	 * command.
	 */
	export interface TerminalProfileProvider {
		/**
		 * Provide the terminal profile.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 * @returns The terminal profile.
		 */
		provideTerminalProfile(token: CancellationToken): ProviderResult<TerminalProfile>;
	}

	/**
	 * A terminal profile defines how a terminal will be launched.
	 */
	export class TerminalProfile {
		/**
		 * The options that the terminal will launch with.
		 */
		options: TerminalOptions | ExtensionTerminalOptions;

		/**
		 * Creates a new terminal profile.
		 * @param options The options that the terminal will launch with.
		 */
		constructor(options: TerminalOptions | ExtensionTerminalOptions);
	}

	/**
	 * A file decoration represents metadata that can be rendered with a file.
	 */
	export class FileDecoration {

		/**
		 * A very short string that represents this decoration.
		 */
		badge?: string;

		/**
		 * A human-readable tooltip for this decoration.
		 */
		tooltip?: string;

		/**
		 * The color of this decoration.
		 */
		color?: ThemeColor;

		/**
		 * A flag expressing that this decoration should be
		 * propagated to its parents.
		 */
		propagate?: boolean;

		/**
		 * Creates a new decoration.
		 *
		 * @param badge A letter that represents the decoration.
		 * @param tooltip The tooltip of the decoration.
		 * @param color The color of the decoration.
		 */
		constructor(badge?: string, tooltip?: string, color?: ThemeColor);
	}

	/**
	 * The decoration provider interfaces defines the contract between extensions and
	 * file decorations.
	 */
	export interface FileDecorationProvider {

		/**
		 * An optional event to signal that decorations for one or many files have changed.
		 *
		 * *Note* that this event should be used to propagate information about children.
		 *
		 * @see {@link EventEmitter}
		 */
		onDidChangeFileDecorations?: Event<undefined | Uri | Uri[]>;

		/**
		 * Provide decorations for a given uri.
		 *
		 * *Note* that this function is only called when a file gets rendered in the UI.
		 * This means a decoration from a descendent that propagates upwards must be signaled
		 * to the editor via the {@link FileDecorationProvider.onDidChangeFileDecorations onDidChangeFileDecorations}-event.
		 *
		 * @param uri The uri of the file to provide a decoration for.
		 * @param token A cancellation token.
		 * @returns A decoration or a thenable that resolves to such.
		 */
		provideFileDecoration(uri: Uri, token: CancellationToken): ProviderResult<FileDecoration>;
	}


	/**
	 * In a remote window the extension kind describes if an extension
	 * runs where the UI (window) runs or if an extension runs remotely.
	 */
	export enum ExtensionKind {

		/**
		 * Extension runs where the UI runs.
		 */
		UI = 1,

		/**
		 * Extension runs where the remote extension host runs.
		 */
		Workspace = 2
	}

	/**
	 * Represents an extension.
	 *
	 * To get an instance of an `Extension` use {@link extensions.getExtension getExtension}.
	 */
	export interface Extension<T> {

		/**
		 * The canonical extension identifier in the form of: `publisher.name`.
		 */
		readonly id: string;

		/**
		 * The uri of the directory containing the extension.
		 */
		readonly extensionUri: Uri;

		/**
		 * The absolute file path of the directory containing this extension. Shorthand
		 * notation for {@link Extension.extensionUri Extension.extensionUri.fsPath} (independent of the uri scheme).
		 */
		readonly extensionPath: string;

		/**
		 * `true` if the extension has been activated.
		 */
		readonly isActive: boolean;

		/**
		 * The parsed contents of the extension's package.json.
		 */
		readonly packageJSON: any;

		/**
		 * The extension kind describes if an extension runs where the UI runs
		 * or if an extension runs where the remote extension host runs. The extension kind
		 * is defined in the `package.json`-file of extensions but can also be refined
		 * via the `remote.extensionKind`-setting. When no remote extension host exists,
		 * the value is {@linkcode ExtensionKind.UI}.
		 */
		extensionKind: ExtensionKind;

		/**
		 * The public API exported by this extension (return value of `activate`).
		 * It is an invalid action to access this field before this extension has been activated.
		 */
		readonly exports: T;

		/**
		 * Activates this extension and returns its public API.
		 *
		 * @returns A promise that will resolve when this extension has been activated.
		 */
		activate(): Thenable<T>;
	}

	/**
	 * The ExtensionMode is provided on the `ExtensionContext` and indicates the
	 * mode the specific extension is running in.
	 */
	export enum ExtensionMode {
		/**
		 * The extension is installed normally (for example, from the marketplace
		 * or VSIX) in the editor.
		 */
		Production = 1,

		/**
		 * The extension is running from an `--extensionDevelopmentPath` provided
		 * when launching the editor.
		 */
		Development = 2,

		/**
		 * The extension is running from an `--extensionTestsPath` and
		 * the extension host is running unit tests.
		 */
		Test = 3,
	}

	/**
	 * An extension context is a collection of utilities private to an
	 * extension.
	 *
	 * An instance of an `ExtensionContext` is provided as the first
	 * parameter to the `activate`-call of an extension.
	 */
	export interface ExtensionContext {

		/**
		 * An array to which disposables can be added. When this
		 * extension is deactivated the disposables will be disposed.
		 *
		 * *Note* that asynchronous dispose-functions aren't awaited.
		 */
		readonly subscriptions: {
			/**
			 * Function to clean up resources.
			 */
			dispose(): any;
		}[];

		/**
		 * A memento object that stores state in the context
		 * of the currently opened {@link workspace.workspaceFolders workspace}.
		 */
		readonly workspaceState: Memento;

		/**
		 * A memento object that stores state independent
		 * of the current opened {@link workspace.workspaceFolders workspace}.
		 */
		readonly globalState: Memento & {
			/**
			 * Set the keys whose values should be synchronized across devices when synchronizing user-data
			 * like configuration, extensions, and mementos.
			 *
			 * Note that this function defines the whole set of keys whose values are synchronized:
			 *  - calling it with an empty array stops synchronization for this memento
			 *  - calling it with a non-empty array replaces all keys whose values are synchronized
			 *
			 * For any given set of keys this function needs to be called only once but there is no harm in
			 * repeatedly calling it.
			 *
			 * @param keys The set of keys whose values are synced.
			 */
			setKeysForSync(keys: readonly string[]): void;
		};

		/**
		 * A secret storage object that stores state independent
		 * of the current opened {@link workspace.workspaceFolders workspace}.
		 */
		readonly secrets: SecretStorage;

		/**
		 * The uri of the directory containing the extension.
		 */
		readonly extensionUri: Uri;

		/**
		 * The absolute file path of the directory containing the extension. Shorthand
		 * notation for {@link TextDocument.uri ExtensionContext.extensionUri.fsPath} (independent of the uri scheme).
		 */
		readonly extensionPath: string;

		/**
		 * Gets the extension's global environment variable collection for this workspace, enabling changes to be
		 * applied to terminal environment variables.
		 */
		readonly environmentVariableCollection: GlobalEnvironmentVariableCollection;

		/**
		 * Get the absolute path of a resource contained in the extension.
		 *
		 * *Note* that an absolute uri can be constructed via {@linkcode Uri.joinPath} and
		 * {@linkcode ExtensionContext.extensionUri extensionUri}, e.g. `vscode.Uri.joinPath(context.extensionUri, relativePath);`
		 *
		 * @param relativePath A relative path to a resource contained in the extension.
		 * @returns The absolute path of the resource.
		 */
		asAbsolutePath(relativePath: string): string;

		/**
		 * The uri of a workspace specific directory in which the extension
		 * can store private state. The directory might not exist and creation is
		 * up to the extension. However, the parent directory is guaranteed to be existent.
		 * The value is `undefined` when no workspace nor folder has been opened.
		 *
		 * Use {@linkcode ExtensionContext.workspaceState workspaceState} or
		 * {@linkcode ExtensionContext.globalState globalState} to store key value data.
		 *
		 * @see {@linkcode FileSystem workspace.fs} for how to read and write files and folders from
		 *  a uri.
		 */
		readonly storageUri: Uri | undefined;

		/**
		 * An absolute file path of a workspace specific directory in which the extension
		 * can store private state. The directory might not exist on disk and creation is
		 * up to the extension. However, the parent directory is guaranteed to be existent.
		 *
		 * Use {@linkcode ExtensionContext.workspaceState workspaceState} or
		 * {@linkcode ExtensionContext.globalState globalState} to store key value data.
		 *
		 * @deprecated Use {@link ExtensionContext.storageUri storageUri} instead.
		 */
		readonly storagePath: string | undefined;

		/**
		 * The uri of a directory in which the extension can store global state.
		 * The directory might not exist on disk and creation is
		 * up to the extension. However, the parent directory is guaranteed to be existent.
		 *
		 * Use {@linkcode ExtensionContext.globalState globalState} to store key value data.
		 *
		 * @see {@linkcode FileSystem workspace.fs} for how to read and write files and folders from
		 *  an uri.
		 */
		readonly globalStorageUri: Uri;

		/**
		 * An absolute file path in which the extension can store global state.
		 * The directory might not exist on disk and creation is
		 * up to the extension. However, the parent directory is guaranteed to be existent.
		 *
		 * Use {@linkcode ExtensionContext.globalState globalState} to store key value data.
		 *
		 * @deprecated Use {@link ExtensionContext.globalStorageUri globalStorageUri} instead.
		 */
		readonly globalStoragePath: string;

		/**
		 * The uri of a directory in which the extension can create log files.
		 * The directory might not exist on disk and creation is up to the extension. However,
		 * the parent directory is guaranteed to be existent.
		 *
		 * @see {@linkcode FileSystem workspace.fs} for how to read and write files and folders from
		 *  an uri.
		 */
		readonly logUri: Uri;

		/**
		 * An absolute file path of a directory in which the extension can create log files.
		 * The directory might not exist on disk and creation is up to the extension. However,
		 * the parent directory is guaranteed to be existent.
		 *
		 * @deprecated Use {@link ExtensionContext.logUri logUri} instead.
		 */
		readonly logPath: string;

		/**
		 * The mode the extension is running in. See {@link ExtensionMode}
		 * for possible values and scenarios.
		 */
		readonly extensionMode: ExtensionMode;

		/**
		 * The current `Extension` instance.
		 */
		readonly extension: Extension<any>;

		/**
		 * An object that keeps information about how this extension can use language models.
		 *
		 * @see {@link LanguageModelChat.sendRequest}
		 */
		readonly languageModelAccessInformation: LanguageModelAccessInformation;
	}

	/**
	 * A memento represents a storage utility. It can store and retrieve
	 * values.
	 */
	export interface Memento {

		/**
		 * Returns the stored keys.
		 *
		 * @returns The stored keys.
		 */
		keys(): readonly string[];

		/**
		 * Return a value.
		 *
		 * @param key A string.
		 * @returns The stored value or `undefined`.
		 */
		get<T>(key: string): T | undefined;

		/**
		 * Return a value.
		 *
		 * @param key A string.
		 * @param defaultValue A value that should be returned when there is no
		 * value (`undefined`) with the given key.
		 * @returns The stored value or the defaultValue.
		 */
		get<T>(key: string, defaultValue: T): T;

		/**
		 * Store a value. The value must be JSON-stringifyable.
		 *
		 * *Note* that using `undefined` as value removes the key from the underlying
		 * storage.
		 *
		 * @param key A string.
		 * @param value A value. MUST not contain cyclic references.
		 */
		update(key: string, value: any): Thenable<void>;
	}

	/**
	 * The event data that is fired when a secret is added or removed.
	 */
	export interface SecretStorageChangeEvent {
		/**
		 * The key of the secret that has changed.
		 */
		readonly key: string;
	}

	/**
	 * Represents a storage utility for secrets (or any information that is sensitive)
	 * that will be stored encrypted. The implementation of the secret storage will
	 * be different on each platform and the secrets will not be synced across
	 * machines.
	 */
	export interface SecretStorage {
		/**
		 * Retrieve a secret that was stored with key. Returns undefined if there
		 * is no password matching that key.
		 * @param key The key the secret was stored under.
		 * @returns The stored value or `undefined`.
		 */
		get(key: string): Thenable<string | undefined>;

		/**
		 * Store a secret under a given key.
		 * @param key The key to store the secret under.
		 * @param value The secret.
		 */
		store(key: string, value: string): Thenable<void>;

		/**
		 * Remove a secret from storage.
		 * @param key The key the secret was stored under.
		 */
		delete(key: string): Thenable<void>;

		/**
		 * Fires when a secret is stored or deleted.
		 */
		onDidChange: Event<SecretStorageChangeEvent>;
	}

	/**
	 * Represents a color theme kind.
	 */
	export enum ColorThemeKind {
		/**
		 * A light color theme.
		 */
		Light = 1,
		/**
		 * A dark color theme.
		 */
		Dark = 2,
		/**
		 * A dark high contrast color theme.
		 */
		HighContrast = 3,
		/**
		 * A light high contrast color theme.
		 */
		HighContrastLight = 4
	}

	/**
	 * Represents a color theme.
	 */
	export interface ColorTheme {

		/**
		 * The kind of this color theme: light, dark, high contrast dark and high contrast light.
		 */
		readonly kind: ColorThemeKind;
	}

	/**
	 * Controls the behaviour of the terminal's visibility.
	 */
	export enum TaskRevealKind {
		/**
		 * Always brings the terminal to front if the task is executed.
		 */
		Always = 1,

		/**
		 * Only brings the terminal to front if a problem is detected executing the task
		 * (e.g. the task couldn't be started because).
		 */
		Silent = 2,

		/**
		 * The terminal never comes to front when the task is executed.
		 */
		Never = 3
	}

	/**
	 * Controls how the task channel is used between tasks
	 */
	export enum TaskPanelKind {

		/**
		 * Shares a panel with other tasks. This is the default.
		 */
		Shared = 1,

		/**
		 * Uses a dedicated panel for this tasks. The panel is not
		 * shared with other tasks.
		 */
		Dedicated = 2,

		/**
		 * Creates a new panel whenever this task is executed.
		 */
		New = 3
	}

	/**
	 * Controls how the task is presented in the UI.
	 */
	export interface TaskPresentationOptions {
		/**
		 * Controls whether the task output is reveal in the user interface.
		 * Defaults to `RevealKind.Always`.
		 */
		reveal?: TaskRevealKind;

		/**
		 * Controls whether the command associated with the task is echoed
		 * in the user interface.
		 */
		echo?: boolean;

		/**
		 * Controls whether the panel showing the task output is taking focus.
		 */
		focus?: boolean;

		/**
		 * Controls if the task panel is used for this task only (dedicated),
		 * shared between tasks (shared) or if a new panel is created on
		 * every task execution (new). Defaults to `TaskInstanceKind.Shared`
		 */
		panel?: TaskPanelKind;

		/**
		 * Controls whether to show the "Terminal will be reused by tasks, press any key to close it" message.
		 */
		showReuseMessage?: boolean;

		/**
		 * Controls whether the terminal is cleared before executing the task.
		 */
		clear?: boolean;

		/**
		 * Controls whether the terminal is closed after executing the task.
		 */
		close?: boolean;
	}

	/**
	 * A grouping for tasks. The editor by default supports the
	 * 'Clean', 'Build', 'RebuildAll' and 'Test' group.
	 */
	export class TaskGroup {

		/**
		 * The clean task group;
		 */
		static Clean: TaskGroup;

		/**
		 * The build task group;
		 */
		static Build: TaskGroup;

		/**
		 * The rebuild all task group;
		 */
		static Rebuild: TaskGroup;

		/**
		 * The test all task group;
		 */
		static Test: TaskGroup;

		/**
		 * Whether the task that is part of this group is the default for the group.
		 * This property cannot be set through API, and is controlled by a user's task configurations.
		 */
		readonly isDefault: boolean | undefined;

		/**
		 * The ID of the task group. Is one of TaskGroup.Clean.id, TaskGroup.Build.id, TaskGroup.Rebuild.id, or TaskGroup.Test.id.
		 */
		readonly id: string;

		/**
		 * Private constructor
		 *
		 * @param id Identifier of a task group.
		 * @param label The human-readable name of a task group.
		 */
		private constructor(id: string, label: string);
	}

	/**
	 * A structure that defines a task kind in the system.
	 * The value must be JSON-stringifyable.
	 */
	export interface TaskDefinition {
		/**
		 * The task definition describing the task provided by an extension.
		 * Usually a task provider defines more properties to identify
		 * a task. They need to be defined in the package.json of the
		 * extension under the 'taskDefinitions' extension point. The npm
		 * task definition for example looks like this
		 * ```typescript
		 * interface NpmTaskDefinition extends TaskDefinition {
		 *     script: string;
		 * }
		 * ```
		 *
		 * Note that type identifier starting with a '$' are reserved for internal
		 * usages and shouldn't be used by extensions.
		 */
		readonly type: string;

		/**
		 * Additional attributes of a concrete task definition.
		 */
		[name: string]: any;
	}

	/**
	 * Options for a process execution
	 */
	export interface ProcessExecutionOptions {
		/**
		 * The current working directory of the executed program or shell.
		 * If omitted the tools current workspace root is used.
		 */
		cwd?: string;

		/**
		 * The additional environment of the executed program or shell. If omitted
		 * the parent process' environment is used. If provided it is merged with
		 * the parent process' environment.
		 */
		env?: { [key: string]: string };
	}

	/**
	 * The execution of a task happens as an external process
	 * without shell interaction.
	 */
	export class ProcessExecution {

		/**
		 * Creates a process execution.
		 *
		 * @param process The process to start.
		 * @param options Optional options for the started process.
		 */
		constructor(process: string, options?: ProcessExecutionOptions);

		/**
		 * Creates a process execution.
		 *
		 * @param process The process to start.
		 * @param args Arguments to be passed to the process.
		 * @param options Optional options for the started process.
		 */
		constructor(process: string, args: string[], options?: ProcessExecutionOptions);

		/**
		 * The process to be executed.
		 */
		process: string;

		/**
		 * The arguments passed to the process. Defaults to an empty array.
		 */
		args: string[];

		/**
		 * The process options used when the process is executed.
		 * Defaults to undefined.
		 */
		options?: ProcessExecutionOptions;
	}

	/**
	 * The shell quoting options.
	 */
	export interface ShellQuotingOptions {

		/**
		 * The character used to do character escaping. If a string is provided only spaces
		 * are escaped. If a `{ escapeChar, charsToEscape }` literal is provide all characters
		 * in `charsToEscape` are escaped using the `escapeChar`.
		 */
		escape?: string | {
			/**
			 * The escape character.
			 */
			escapeChar: string;
			/**
			 * The characters to escape.
			 */
			charsToEscape: string;
		};

		/**
		 * The character used for strong quoting. The string's length must be 1.
		 */
		strong?: string;

		/**
		 * The character used for weak quoting. The string's length must be 1.
		 */
		weak?: string;
	}

	/**
	 * Options for a shell execution
	 */
	export interface ShellExecutionOptions {
		/**
		 * The shell executable.
		 */
		executable?: string;

		/**
		 * The arguments to be passed to the shell executable used to run the task. Most shells
		 * require special arguments to execute a command. For  example `bash` requires the `-c`
		 * argument to execute a command, `PowerShell` requires `-Command` and `cmd` requires both
		 * `/d` and `/c`.
		 */
		shellArgs?: string[];

		/**
		 * The shell quotes supported by this shell.
		 */
		shellQuoting?: ShellQuotingOptions;

		/**
		 * The current working directory of the executed shell.
		 * If omitted the tools current workspace root is used.
		 */
		cwd?: string;

		/**
		 * The additional environment of the executed shell. If omitted
		 * the parent process' environment is used. If provided it is merged with
		 * the parent process' environment.
		 */
		env?: { [key: string]: string };
	}

	/**
	 * Defines how an argument should be quoted if it contains
	 * spaces or unsupported characters.
	 */
	export enum ShellQuoting {

		/**
		 * Character escaping should be used. This for example
		 * uses \ on bash and ` on PowerShell.
		 */
		Escape = 1,

		/**
		 * Strong string quoting should be used. This for example
		 * uses " for Windows cmd and ' for bash and PowerShell.
		 * Strong quoting treats arguments as literal strings.
		 * Under PowerShell echo 'The value is $(2 * 3)' will
		 * print `The value is $(2 * 3)`
		 */
		Strong = 2,

		/**
		 * Weak string quoting should be used. This for example
		 * uses " for Windows cmd, bash and PowerShell. Weak quoting
		 * still performs some kind of evaluation inside the quoted
		 * string.  Under PowerShell echo "The value is $(2 * 3)"
		 * will print `The value is 6`
		 */
		Weak = 3
	}

	/**
	 * A string that will be quoted depending on the used shell.
	 */
	export interface ShellQuotedString {
		/**
		 * The actual string value.
		 */
		value: string;

		/**
		 * The quoting style to use.
		 */
		quoting: ShellQuoting;
	}

	/**
	 * Represents a task execution that happens inside a shell.
	 */
	export class ShellExecution {
		/**
		 * Creates a shell execution with a full command line.
		 *
		 * @param commandLine The command line to execute.
		 * @param options Optional options for the started the shell.
		 */
		constructor(commandLine: string, options?: ShellExecutionOptions);

		/**
		 * Creates a shell execution with a command and arguments. For the real execution the editor will
		 * construct a command line from the command and the arguments. This is subject to interpretation
		 * especially when it comes to quoting. If full control over the command line is needed please
		 * use the constructor that creates a `ShellExecution` with the full command line.
		 *
		 * @param command The command to execute.
		 * @param args The command arguments.
		 * @param options Optional options for the started the shell.
		 */
		constructor(command: string | ShellQuotedString, args: Array<string | ShellQuotedString>, options?: ShellExecutionOptions);

		/**
		 * The shell command line. Is `undefined` if created with a command and arguments.
		 */
		commandLine: string | undefined;

		/**
		 * The shell command. Is `undefined` if created with a full command line.
		 */
		command: string | ShellQuotedString | undefined;

		/**
		 * The shell args. Is `undefined` if created with a full command line.
		 */
		args: Array<string | ShellQuotedString> | undefined;

		/**
		 * The shell options used when the command line is executed in a shell.
		 * Defaults to undefined.
		 */
		options?: ShellExecutionOptions;
	}

	/**
	 * Class used to execute an extension callback as a task.
	 */
	export class CustomExecution {
		/**
		 * Constructs a CustomExecution task object. The callback will be executed when the task is run, at which point the
		 * extension should return the Pseudoterminal it will "run in". The task should wait to do further execution until
		 * {@link Pseudoterminal.open} is called. Task cancellation should be handled using
		 * {@link Pseudoterminal.close}. When the task is complete fire
		 * {@link Pseudoterminal.onDidClose}.
		 * @param callback The callback that will be called when the task is started by a user. Any ${} style variables that
		 * were in the task definition will be resolved and passed into the callback as `resolvedDefinition`.
		 */
		constructor(callback: (resolvedDefinition: TaskDefinition) => Thenable<Pseudoterminal>);
	}

	/**
	 * The scope of a task.
	 */
	export enum TaskScope {
		/**
		 * The task is a global task. Global tasks are currently not supported.
		 */
		Global = 1,

		/**
		 * The task is a workspace task
		 */
		Workspace = 2
	}

	/**
	 * Run options for a task.
	 */
	export interface RunOptions {
		/**
		 * Controls whether task variables are re-evaluated on rerun.
		 */
		reevaluateOnRerun?: boolean;
	}

	/**
	 * A task to execute
	 */
	export class Task {

		/**
		 * Creates a new task.
		 *
		 * @param taskDefinition The task definition as defined in the taskDefinitions extension point.
		 * @param scope Specifies the task's scope. It is either a global or a workspace task or a task for a specific workspace folder. Global tasks are currently not supported.
		 * @param name The task's name. Is presented in the user interface.
		 * @param source The task's source (e.g. 'gulp', 'npm', ...). Is presented in the user interface.
		 * @param execution The process or shell execution.
		 * @param problemMatchers the names of problem matchers to use, like '$tsc'
		 *  or '$eslint'. Problem matchers can be contributed by an extension using
		 *  the `problemMatchers` extension point.
		 */
		constructor(taskDefinition: TaskDefinition, scope: WorkspaceFolder | TaskScope.Global | TaskScope.Workspace, name: string, source: string, execution?: ProcessExecution | ShellExecution | CustomExecution, problemMatchers?: string | string[]);

		/**
		 * Creates a new task.
		 *
		 * @deprecated Use the new constructors that allow specifying a scope for the task.
		 *
		 * @param taskDefinition The task definition as defined in the taskDefinitions extension point.
		 * @param name The task's name. Is presented in the user interface.
		 * @param source The task's source (e.g. 'gulp', 'npm', ...). Is presented in the user interface.
		 * @param execution The process or shell execution.
		 * @param problemMatchers the names of problem matchers to use, like '$tsc'
		 *  or '$eslint'. Problem matchers can be contributed by an extension using
		 *  the `problemMatchers` extension point.
		 */
		constructor(taskDefinition: TaskDefinition, name: string, source: string, execution?: ProcessExecution | ShellExecution, problemMatchers?: string | string[]);

		/**
		 * The task's definition.
		 */
		definition: TaskDefinition;

		/**
		 * The task's scope.
		 */
		readonly scope: TaskScope.Global | TaskScope.Workspace | WorkspaceFolder | undefined;

		/**
		 * The task's name
		 */
		name: string;

		/**
		 * A human-readable string which is rendered less prominently on a separate line in places
		 * where the task's name is displayed. Supports rendering of {@link ThemeIcon theme icons}
		 * via the `$(<name>)`-syntax.
		 */
		detail?: string;

		/**
		 * The task's execution engine
		 */
		execution?: ProcessExecution | ShellExecution | CustomExecution;

		/**
		 * Whether the task is a background task or not.
		 */
		isBackground: boolean;

		/**
		 * A human-readable string describing the source of this shell task, e.g. 'gulp'
		 * or 'npm'. Supports rendering of {@link ThemeIcon theme icons} via the `$(<name>)`-syntax.
		 */
		source: string;

		/**
		 * The task group this tasks belongs to. See TaskGroup
		 * for a predefined set of available groups.
		 * Defaults to undefined meaning that the task doesn't
		 * belong to any special group.
		 */
		group?: TaskGroup;

		/**
		 * The presentation options. Defaults to an empty literal.
		 */
		presentationOptions: TaskPresentationOptions;

		/**
		 * The problem matchers attached to the task. Defaults to an empty
		 * array.
		 */
		problemMatchers: string[];

		/**
		 * Run options for the task
		 */
		runOptions: RunOptions;
	}

	/**
	 * A task provider allows to add tasks to the task service.
	 * A task provider is registered via {@link tasks.registerTaskProvider}.
	 */
	export interface TaskProvider<T extends Task = Task> {
		/**
		 * Provides tasks.
		 * @param token A cancellation token.
		 * @returns an array of tasks
		 */
		provideTasks(token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Resolves a task that has no {@linkcode Task.execution execution} set. Tasks are
		 * often created from information found in the `tasks.json`-file. Such tasks miss
		 * the information on how to execute them and a task provider must fill in
		 * the missing information in the `resolveTask`-method. This method will not be
		 * called for tasks returned from the above `provideTasks` method since those
		 * tasks are always fully resolved. A valid default implementation for the
		 * `resolveTask` method is to return `undefined`.
		 *
		 * Note that when filling in the properties of `task`, you _must_ be sure to
		 * use the exact same `TaskDefinition` and not create a new one. Other properties
		 * may be changed.
		 *
		 * @param task The task to resolve.
		 * @param token A cancellation token.
		 * @returns The resolved task
		 */
		resolveTask(task: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * An object representing an executed Task. It can be used
	 * to terminate a task.
	 *
	 * This interface is not intended to be implemented.
	 */
	export interface TaskExecution {
		/**
		 * The task that got started.
		 */
		task: Task;

		/**
		 * Terminates the task execution.
		 */
		terminate(): void;
	}

	/**
	 * An event signaling the start of a task execution.
	 *
	 * This interface is not intended to be implemented.
	 */
	export interface TaskStartEvent {
		/**
		 * The task item representing the task that got started.
		 */
		readonly execution: TaskExecution;
	}

	/**
	 * An event signaling the end of an executed task.
	 *
	 * This interface is not intended to be implemented.
	 */
	export interface TaskEndEvent {
		/**
		 * The task item representing the task that finished.
		 */
		readonly execution: TaskExecution;
	}

	/**
	 * An event signaling the start of a process execution
	 * triggered through a task
	 */
	export interface TaskProcessStartEvent {

		/**
		 * The task execution for which the process got started.
		 */
		readonly execution: TaskExecution;

		/**
		 * The underlying process id.
		 */
		readonly processId: number;
	}

	/**
	 * An event signaling the end of a process execution
	 * triggered through a task
	 */
	export interface TaskProcessEndEvent {

		/**
		 * The task execution for which the process got started.
		 */
		readonly execution: TaskExecution;

		/**
		 * The process's exit code. Will be `undefined` when the task is terminated.
		 */
		readonly exitCode: number | undefined;
	}

	/**
	 * A task filter denotes tasks by their version and types
	 */
	export interface TaskFilter {
		/**
		 * The task version as used in the tasks.json file.
		 * The string support the package.json semver notation.
		 */
		version?: string;

		/**
		 * The task type to return;
		 */
		type?: string;
	}

	/**
	 * Namespace for tasks functionality.
	 */
	export namespace tasks {

		/**
		 * Register a task provider.
		 *
		 * @param type The task kind type this provider is registered for.
		 * @param provider A task provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerTaskProvider(type: string, provider: TaskProvider): Disposable;

		/**
		 * Fetches all tasks available in the systems. This includes tasks
		 * from `tasks.json` files as well as tasks from task providers
		 * contributed through extensions.
		 *
		 * @param filter Optional filter to select tasks of a certain type or version.
		 * @returns A thenable that resolves to an array of tasks.
		 */
		export function fetchTasks(filter?: TaskFilter): Thenable<Task[]>;

		/**
		 * Executes a task that is managed by the editor. The returned
		 * task execution can be used to terminate the task.
		 *
		 * @throws When running a ShellExecution or a ProcessExecution
		 * task in an environment where a new process cannot be started.
		 * In such an environment, only CustomExecution tasks can be run.
		 *
		 * @param task the task to execute
		 * @returns A thenable that resolves to a task execution.
		 */
		export function executeTask(task: Task): Thenable<TaskExecution>;

		/**
		 * The currently active task executions or an empty array.
		 */
		export const taskExecutions: readonly TaskExecution[];

		/**
		 * Fires when a task starts.
		 */
		export const onDidStartTask: Event<TaskStartEvent>;

		/**
		 * Fires when a task ends.
		 */
		export const onDidEndTask: Event<TaskEndEvent>;

		/**
		 * Fires when the underlying process has been started.
		 * This event will not fire for tasks that don't
		 * execute an underlying process.
		 */
		export const onDidStartTaskProcess: Event<TaskProcessStartEvent>;

		/**
		 * Fires when the underlying process has ended.
		 * This event will not fire for tasks that don't
		 * execute an underlying process.
		 */
		export const onDidEndTaskProcess: Event<TaskProcessEndEvent>;
	}

	/**
	 * Enumeration of file types. The types `File` and `Directory` can also be
	 * a symbolic links, in that case use `FileType.File | FileType.SymbolicLink` and
	 * `FileType.Directory | FileType.SymbolicLink`.
	 */
	export enum FileType {
		/**
		 * The file type is unknown.
		 */
		Unknown = 0,
		/**
		 * A regular file.
		 */
		File = 1,
		/**
		 * A directory.
		 */
		Directory = 2,
		/**
		 * A symbolic link to a file.
		 */
		SymbolicLink = 64
	}

	/**
	 * Permissions of a file.
	 */
	export enum FilePermission {
		/**
		 * The file is readonly.
		 *
		 * *Note:* All `FileStat` from a `FileSystemProvider` that is registered with
		 * the option `isReadonly: true` will be implicitly handled as if `FilePermission.Readonly`
		 * is set. As a consequence, it is not possible to have a readonly file system provider
		 * registered where some `FileStat` are not readonly.
		 */
		Readonly = 1
	}

	/**
	 * The `FileStat`-type represents metadata about a file
	 */
	export interface FileStat {
		/**
		 * The type of the file, e.g. is a regular file, a directory, or symbolic link
		 * to a file.
		 *
		 * *Note:* This value might be a bitmask, e.g. `FileType.File | FileType.SymbolicLink`.
		 */
		type: FileType;
		/**
		 * The creation timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
		 */
		ctime: number;
		/**
		 * The modification timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
		 *
		 * *Note:* If the file changed, it is important to provide an updated `mtime` that advanced
		 * from the previous value. Otherwise there may be optimizations in place that will not show
		 * the updated file contents in an editor for example.
		 */
		mtime: number;
		/**
		 * The size in bytes.
		 *
		 * *Note:* If the file changed, it is important to provide an updated `size`. Otherwise there
		 * may be optimizations in place that will not show the updated file contents in an editor for
		 * example.
		 */
		size: number;
		/**
		 * The permissions of the file, e.g. whether the file is readonly.
		 *
		 * *Note:* This value might be a bitmask, e.g. `FilePermission.Readonly | FilePermission.Other`.
		 */
		permissions?: FilePermission;
	}

	/**
	 * A type that filesystem providers should use to signal errors.
	 *
	 * This class has factory methods for common error-cases, like `FileNotFound` when
	 * a file or folder doesn't exist, use them like so: `throw vscode.FileSystemError.FileNotFound(someUri);`
	 */
	export class FileSystemError extends Error {

		/**
		 * Create an error to signal that a file or folder wasn't found.
		 * @param messageOrUri Message or uri.
		 */
		static FileNotFound(messageOrUri?: string | Uri): FileSystemError;

		/**
		 * Create an error to signal that a file or folder already exists, e.g. when
		 * creating but not overwriting a file.
		 * @param messageOrUri Message or uri.
		 */
		static FileExists(messageOrUri?: string | Uri): FileSystemError;

		/**
		 * Create an error to signal that a file is not a folder.
		 * @param messageOrUri Message or uri.
		 */
		static FileNotADirectory(messageOrUri?: string | Uri): FileSystemError;

		/**
		 * Create an error to signal that a file is a folder.
		 * @param messageOrUri Message or uri.
		 */
		static FileIsADirectory(messageOrUri?: string | Uri): FileSystemError;

		/**
		 * Create an error to signal that an operation lacks required permissions.
		 * @param messageOrUri Message or uri.
		 */
		static NoPermissions(messageOrUri?: string | Uri): FileSystemError;

		/**
		 * Create an error to signal that the file system is unavailable or too busy to
		 * complete a request.
		 * @param messageOrUri Message or uri.
		 */
		static Unavailable(messageOrUri?: string | Uri): FileSystemError;

		/**
		 * Creates a new filesystem error.
		 *
		 * @param messageOrUri Message or uri.
		 */
		constructor(messageOrUri?: string | Uri);

		/**
		 * A code that identifies this error.
		 *
		 * Possible values are names of errors, like {@linkcode FileSystemError.FileNotFound FileNotFound},
		 * or `Unknown` for unspecified errors.
		 */
		readonly code: string;
	}

	/**
	 * Enumeration of file change types.
	 */
	export enum FileChangeType {

		/**
		 * The contents or metadata of a file have changed.
		 */
		Changed = 1,

		/**
		 * A file has been created.
		 */
		Created = 2,

		/**
		 * A file has been deleted.
		 */
		Deleted = 3,
	}

	/**
	 * The event filesystem providers must use to signal a file change.
	 */
	export interface FileChangeEvent {

		/**
		 * The type of change.
		 */
		readonly type: FileChangeType;

		/**
		 * The uri of the file that has changed.
		 */
		readonly uri: Uri;
	}

	/**
	 * The filesystem provider defines what the editor needs to read, write, discover,
	 * and to manage files and folders. It allows extensions to serve files from remote places,
	 * like ftp-servers, and to seamlessly integrate those into the editor.
	 *
	 * * *Note 1:* The filesystem provider API works with {@link Uri uris} and assumes hierarchical
	 * paths, e.g. `foo:/my/path` is a child of `foo:/my/` and a parent of `foo:/my/path/deeper`.
	 * * *Note 2:* There is an activation event `onFileSystem:<scheme>` that fires when a file
	 * or folder is being accessed.
	 * * *Note 3:* The word 'file' is often used to denote all {@link FileType kinds} of files, e.g.
	 * folders, symbolic links, and regular files.
	 */
	export interface FileSystemProvider {

		/**
		 * An event to signal that a resource has been created, changed, or deleted. This
		 * event should fire for resources that are being {@link FileSystemProvider.watch watched}
		 * by clients of this provider.
		 *
		 * *Note:* It is important that the metadata of the file that changed provides an
		 * updated `mtime` that advanced from the previous value in the {@link FileStat stat} and a
		 * correct `size` value. Otherwise there may be optimizations in place that will not show
		 * the change in an editor for example.
		 */
		readonly onDidChangeFile: Event<FileChangeEvent[]>;

		/**
		 * Subscribes to file change events in the file or folder denoted by `uri`. For folders,
		 * the option `recursive` indicates whether subfolders, sub-subfolders, etc. should
		 * be watched for file changes as well. With `recursive: false`, only changes to the
		 * files that are direct children of the folder should trigger an event.
		 *
		 * The `excludes` array is used to indicate paths that should be excluded from file
		 * watching. It is typically derived from the `files.watcherExclude` setting that
		 * is configurable by the user. Each entry can be be:
		 * - the absolute path to exclude
		 * - a relative path to exclude (for example `build/output`)
		 * - a simple glob pattern (for example `**​/build`, `output/**`)
		 *
		 * It is the file system provider's job to call {@linkcode FileSystemProvider.onDidChangeFile onDidChangeFile}
		 * for every change given these rules. No event should be emitted for files that match any of the provided
		 * excludes.
		 *
		 * @param uri The uri of the file or folder to be watched.
		 * @param options Configures the watch.
		 * @returns A disposable that tells the provider to stop watching the `uri`.
		 */
		watch(uri: Uri, options: {
			/**
			 * When enabled also watch subfolders.
			 */
			readonly recursive: boolean;
			/**
			 * A list of paths and pattern to exclude from watching.
			 */
			readonly excludes: readonly string[];
		}): Disposable;

		/**
		 * Retrieve metadata about a file.
		 *
		 * Note that the metadata for symbolic links should be the metadata of the file they refer to.
		 * Still, the {@link FileType.SymbolicLink SymbolicLink}-type must be used in addition to the actual type, e.g.
		 * `FileType.SymbolicLink | FileType.Directory`.
		 *
		 * @param uri The uri of the file to retrieve metadata about.
		 * @returns The file metadata about the file.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when `uri` doesn't exist.
		 */
		stat(uri: Uri): FileStat | Thenable<FileStat>;

		/**
		 * Retrieve all entries of a {@link FileType.Directory directory}.
		 *
		 * @param uri The uri of the folder.
		 * @returns An array of name/type-tuples or a thenable that resolves to such.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when `uri` doesn't exist.
		 */
		readDirectory(uri: Uri): [string, FileType][] | Thenable<[string, FileType][]>;

		/**
		 * Create a new directory (Note, that new files are created via `write`-calls).
		 *
		 * @param uri The uri of the new folder.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when the parent of `uri` doesn't exist, e.g. no mkdirp-logic required.
		 * @throws {@linkcode FileSystemError.FileExists FileExists} when `uri` already exists.
		 * @throws {@linkcode FileSystemError.NoPermissions NoPermissions} when permissions aren't sufficient.
		 */
		createDirectory(uri: Uri): void | Thenable<void>;

		/**
		 * Read the entire contents of a file.
		 *
		 * @param uri The uri of the file.
		 * @returns An array of bytes or a thenable that resolves to such.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when `uri` doesn't exist.
		 */
		readFile(uri: Uri): Uint8Array | Thenable<Uint8Array>;

		/**
		 * Write data to a file, replacing its entire contents.
		 *
		 * @param uri The uri of the file.
		 * @param content The new content of the file.
		 * @param options Defines if missing files should or must be created.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when `uri` doesn't exist and `create` is not set.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when the parent of `uri` doesn't exist and `create` is set, e.g. no mkdirp-logic required.
		 * @throws {@linkcode FileSystemError.FileExists FileExists} when `uri` already exists, `create` is set but `overwrite` is not set.
		 * @throws {@linkcode FileSystemError.NoPermissions NoPermissions} when permissions aren't sufficient.
		 */
		writeFile(uri: Uri, content: Uint8Array, options: {
			/**
			 * Create the file if it does not exist already.
			 */
			readonly create: boolean;
			/**
			 * Overwrite the file if it does exist.
			 */
			readonly overwrite: boolean;
		}): void | Thenable<void>;

		/**
		 * Delete a file.
		 *
		 * @param uri The resource that is to be deleted.
		 * @param options Defines if deletion of folders is recursive.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when `uri` doesn't exist.
		 * @throws {@linkcode FileSystemError.NoPermissions NoPermissions} when permissions aren't sufficient.
		 */
		delete(uri: Uri, options: {
			/**
			 * Delete the content recursively if a folder is denoted.
			 */
			readonly recursive: boolean;
		}): void | Thenable<void>;

		/**
		 * Rename a file or folder.
		 *
		 * @param oldUri The existing file.
		 * @param newUri The new location.
		 * @param options Defines if existing files should be overwritten.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when `oldUri` doesn't exist.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when parent of `newUri` doesn't exist, e.g. no mkdirp-logic required.
		 * @throws {@linkcode FileSystemError.FileExists FileExists} when `newUri` exists and when the `overwrite` option is not `true`.
		 * @throws {@linkcode FileSystemError.NoPermissions NoPermissions} when permissions aren't sufficient.
		 */
		rename(oldUri: Uri, newUri: Uri, options: {
			/**
			 * Overwrite the file if it does exist.
			 */
			readonly overwrite: boolean;
		}): void | Thenable<void>;

		/**
		 * Copy files or folders. Implementing this function is optional but it will speedup
		 * the copy operation.
		 *
		 * @param source The existing file.
		 * @param destination The destination location.
		 * @param options Defines if existing files should be overwritten.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when `source` doesn't exist.
		 * @throws {@linkcode FileSystemError.FileNotFound FileNotFound} when parent of `destination` doesn't exist, e.g. no mkdirp-logic required.
		 * @throws {@linkcode FileSystemError.FileExists FileExists} when `destination` exists and when the `overwrite` option is not `true`.
		 * @throws {@linkcode FileSystemError.NoPermissions NoPermissions} when permissions aren't sufficient.
		 */
		copy?(source: Uri, destination: Uri, options: {
			/**
			 * Overwrite the file if it does exist.
			 */
			readonly overwrite: boolean;
		}): void | Thenable<void>;
	}

	/**
	 * The file system interface exposes the editor's built-in and contributed
	 * {@link FileSystemProvider file system providers}. It allows extensions to work
	 * with files from the local disk as well as files from remote places, like the
	 * remote extension host or ftp-servers.
	 *
	 * *Note* that an instance of this interface is available as {@linkcode workspace.fs}.
	 */
	export interface FileSystem {

		/**
		 * Retrieve metadata about a file.
		 *
		 * @param uri The uri of the file to retrieve metadata about.
		 * @returns The file metadata about the file.
		 */
		stat(uri: Uri): Thenable<FileStat>;

		/**
		 * Retrieve all entries of a {@link FileType.Directory directory}.
		 *
		 * @param uri The uri of the folder.
		 * @returns An array of name/type-tuples or a thenable that resolves to such.
		 */
		readDirectory(uri: Uri): Thenable<[string, FileType][]>;

		/**
		 * Create a new directory (Note, that new files are created via `write`-calls).
		 *
		 * *Note* that missing directories are created automatically, e.g this call has
		 * `mkdirp` semantics.
		 *
		 * @param uri The uri of the new folder.
		 */
		createDirectory(uri: Uri): Thenable<void>;

		/**
		 * Read the entire contents of a file.
		 *
		 * @param uri The uri of the file.
		 * @returns An array of bytes or a thenable that resolves to such.
		 */
		readFile(uri: Uri): Thenable<Uint8Array>;

		/**
		 * Write data to a file, replacing its entire contents.
		 *
		 * @param uri The uri of the file.
		 * @param content The new content of the file.
		 */
		writeFile(uri: Uri, content: Uint8Array): Thenable<void>;

		/**
		 * Delete a file.
		 *
		 * @param uri The resource that is to be deleted.
		 * @param options Defines if trash can should be used and if deletion of folders is recursive
		 */
		delete(uri: Uri, options?: {
			/**
			 * Delete the content recursively if a folder is denoted.
			 */
			recursive?: boolean;
			/**
			 * Use the os's trashcan instead of permanently deleting files whenever possible.
			 */
			useTrash?: boolean;
		}): Thenable<void>;

		/**
		 * Rename a file or folder.
		 *
		 * @param source The existing file.
		 * @param target The new location.
		 * @param options Defines if existing files should be overwritten.
		 */
		rename(source: Uri, target: Uri, options?: {
			/**
			 * Overwrite the file if it does exist.
			 */
			overwrite?: boolean;
		}): Thenable<void>;

		/**
		 * Copy files or folders.
		 *
		 * @param source The existing file.
		 * @param target The destination location.
		 * @param options Defines if existing files should be overwritten.
		 */
		copy(source: Uri, target: Uri, options?: {
			/**
			 * Overwrite the file if it does exist.
			 */
			overwrite?: boolean;
		}): Thenable<void>;

		/**
		 * Check if a given file system supports writing files.
		 *
		 * Keep in mind that just because a file system supports writing, that does
		 * not mean that writes will always succeed. There may be permissions issues
		 * or other errors that prevent writing a file.
		 *
		 * @param scheme The scheme of the filesystem, for example `file` or `git`.
		 *
		 * @returns `true` if the file system supports writing, `false` if it does not
		 * support writing (i.e. it is readonly), and `undefined` if the editor does not
		 * know about the filesystem.
		 */
		isWritableFileSystem(scheme: string): boolean | undefined;
	}

	/**
	 * Defines a port mapping used for localhost inside the webview.
	 */
	export interface WebviewPortMapping {
		/**
		 * Localhost port to remap inside the webview.
		 */
		readonly webviewPort: number;

		/**
		 * Destination port. The `webviewPort` is resolved to this port.
		 */
		readonly extensionHostPort: number;
	}

	/**
	 * Content settings for a webview.
	 */
	export interface WebviewOptions {
		/**
		 * Controls whether scripts are enabled in the webview content or not.
		 *
		 * Defaults to false (scripts-disabled).
		 */
		readonly enableScripts?: boolean;

		/**
		 * Controls whether forms are enabled in the webview content or not.
		 *
		 * Defaults to true if {@link WebviewOptions.enableScripts scripts are enabled}. Otherwise defaults to false.
		 * Explicitly setting this property to either true or false overrides the default.
		 */
		readonly enableForms?: boolean;

		/**
		 * Controls whether command uris are enabled in webview content or not.
		 *
		 * Defaults to `false` (command uris are disabled).
		 *
		 * If you pass in an array, only the commands in the array are allowed.
		 */
		readonly enableCommandUris?: boolean | readonly string[];

		/**
		 * Root paths from which the webview can load local (filesystem) resources using uris from `asWebviewUri`
		 *
		 * Default to the root folders of the current workspace plus the extension's install directory.
		 *
		 * Pass in an empty array to disallow access to any local resources.
		 */
		readonly localResourceRoots?: readonly Uri[];

		/**
		 * Mappings of localhost ports used inside the webview.
		 *
		 * Port mapping allow webviews to transparently define how localhost ports are resolved. This can be used
		 * to allow using a static localhost port inside the webview that is resolved to random port that a service is
		 * running on.
		 *
		 * If a webview accesses localhost content, we recommend that you specify port mappings even if
		 * the `webviewPort` and `extensionHostPort` ports are the same.
		 *
		 * *Note* that port mappings only work for `http` or `https` urls. Websocket urls (e.g. `ws://localhost:3000`)
		 * cannot be mapped to another port.
		 */
		readonly portMapping?: readonly WebviewPortMapping[];
	}

	/**
	 * Displays html content, similarly to an iframe.
	 */
	export interface Webview {
		/**
		 * Content settings for the webview.
		 */
		options: WebviewOptions;

		/**
		 * HTML contents of the webview.
		 *
		 * This should be a complete, valid html document. Changing this property causes the webview to be reloaded.
		 *
		 * Webviews are sandboxed from normal extension process, so all communication with the webview must use
		 * message passing. To send a message from the extension to the webview, use {@linkcode Webview.postMessage postMessage}.
		 * To send message from the webview back to an extension, use the `acquireVsCodeApi` function inside the webview
		 * to get a handle to the editor's api and then call `.postMessage()`:
		 *
		 * ```html
		 * <script>
		 *     const vscode = acquireVsCodeApi(); // acquireVsCodeApi can only be invoked once
		 *     vscode.postMessage({ message: 'hello!' });
		 * </script>
		 * ```
		 *
		 * To load a resources from the workspace inside a webview, use the {@linkcode Webview.asWebviewUri asWebviewUri} method
		 * and ensure the resource's directory is listed in {@linkcode WebviewOptions.localResourceRoots}.
		 *
		 * Keep in mind that even though webviews are sandboxed, they still allow running scripts and loading arbitrary content,
		 * so extensions must follow all standard web security best practices when working with webviews. This includes
		 * properly sanitizing all untrusted input (including content from the workspace) and
		 * setting a [content security policy](https://aka.ms/vscode-api-webview-csp).
		 */
		html: string;

		/**
		 * Fired when the webview content posts a message.
		 *
		 * Webview content can post strings or json serializable objects back to an extension. They cannot
		 * post `Blob`, `File`, `ImageData` and other DOM specific objects since the extension that receives the
		 * message does not run in a browser environment.
		 */
		readonly onDidReceiveMessage: Event<any>;

		/**
		 * Post a message to the webview content.
		 *
		 * Messages are only delivered if the webview is live (either visible or in the
		 * background with `retainContextWhenHidden`).
		 *
		 * @param message Body of the message. This must be a string or other json serializable object.
		 *
		 *   For older versions of vscode, if an `ArrayBuffer` is included in `message`,
		 *   it will not be serialized properly and will not be received by the webview.
		 *   Similarly any TypedArrays, such as a `Uint8Array`, will be very inefficiently
		 *   serialized and will also not be recreated as a typed array inside the webview.
		 *
		 *   However if your extension targets vscode 1.57+ in the `engines` field of its
		 *   `package.json`, any `ArrayBuffer` values that appear in `message` will be more
		 *   efficiently transferred to the webview and will also be correctly recreated inside
		 *   of the webview.
		 *
		 * @returns A promise that resolves when the message is posted to a webview or when it is
		 * dropped because the message was not deliverable.
		 *
		 *   Returns `true` if the message was posted to the webview. Messages can only be posted to
		 * live webviews (i.e. either visible webviews or hidden webviews that set `retainContextWhenHidden`).
		 *
		 *   A response of `true` does not mean that the message was actually received by the webview.
		 *   For example, no message listeners may be have been hooked up inside the webview or the webview may
		 *   have been destroyed after the message was posted but before it was received.
		 *
		 *   If you want confirm that a message as actually received, you can try having your webview posting a
		 *   confirmation message back to your extension.
		 */
		postMessage(message: any): Thenable<boolean>;

		/**
		 * Convert a uri for the local file system to one that can be used inside webviews.
		 *
		 * Webviews cannot directly load resources from the workspace or local file system using `file:` uris. The
		 * `asWebviewUri` function takes a local `file:` uri and converts it into a uri that can be used inside of
		 * a webview to load the same resource:
		 *
		 * ```ts
		 * webview.html = `<img src="${webview.asWebviewUri(vscode.Uri.file('/Users/codey/workspace/cat.gif'))}">`
		 * ```
		 */
		asWebviewUri(localResource: Uri): Uri;

		/**
		 * Content security policy source for webview resources.
		 *
		 * This is the origin that should be used in a content security policy rule:
		 *
		 * ```ts
		 * `img-src https: ${webview.cspSource} ...;`
		 * ```
		 */
		readonly cspSource: string;
	}

	/**
	 * Content settings for a webview panel.
	 */
	export interface WebviewPanelOptions {
		/**
		 * Controls if the find widget is enabled in the panel.
		 *
		 * Defaults to `false`.
		 */
		readonly enableFindWidget?: boolean;

		/**
		 * Controls if the webview panel's content (iframe) is kept around even when the panel
		 * is no longer visible.
		 *
		 * Normally the webview panel's html context is created when the panel becomes visible
		 * and destroyed when it is hidden. Extensions that have complex state
		 * or UI can set the `retainContextWhenHidden` to make the editor keep the webview
		 * context around, even when the webview moves to a background tab. When a webview using
		 * `retainContextWhenHidden` becomes hidden, its scripts and other dynamic content are suspended.
		 * When the panel becomes visible again, the context is automatically restored
		 * in the exact same state it was in originally. You cannot send messages to a
		 * hidden webview, even with `retainContextWhenHidden` enabled.
		 *
		 * `retainContextWhenHidden` has a high memory overhead and should only be used if
		 * your panel's context cannot be quickly saved and restored.
		 */
		readonly retainContextWhenHidden?: boolean;
	}

	/**
	 * A panel that contains a webview.
	 */
	export interface WebviewPanel {
		/**
		 * Identifies the type of the webview panel, such as `'markdown.preview'`.
		 */
		readonly viewType: string;

		/**
		 * Title of the panel shown in UI.
		 */
		title: string;

		/**
		 * Icon for the panel shown in UI.
		 */
		iconPath?: Uri | {
			/**
			 * The icon path for the light theme.
			 */
			readonly light: Uri;
			/**
			 * The icon path for the dark theme.
			 */
			readonly dark: Uri;
		};

		/**
		 * {@linkcode Webview} belonging to the panel.
		 */
		readonly webview: Webview;

		/**
		 * Content settings for the webview panel.
		 */
		readonly options: WebviewPanelOptions;

		/**
		 * Editor position of the panel. This property is only set if the webview is in
		 * one of the editor view columns.
		 */
		readonly viewColumn: ViewColumn | undefined;

		/**
		 * Whether the panel is active (focused by the user).
		 */
		readonly active: boolean;

		/**
		 * Whether the panel is visible.
		 */
		readonly visible: boolean;

		/**
		 * Fired when the panel's view state changes.
		 */
		readonly onDidChangeViewState: Event<WebviewPanelOnDidChangeViewStateEvent>;

		/**
		 * Fired when the panel is disposed.
		 *
		 * This may be because the user closed the panel or because `.dispose()` was
		 * called on it.
		 *
		 * Trying to use the panel after it has been disposed throws an exception.
		 */
		readonly onDidDispose: Event<void>;

		/**
		 * Show the webview panel in a given column.
		 *
		 * A webview panel may only show in a single column at a time. If it is already showing, this
		 * method moves it to a new column.
		 *
		 * @param viewColumn View column to show the panel in. Shows in the current `viewColumn` if undefined.
		 * @param preserveFocus When `true`, the webview will not take focus.
		 */
		reveal(viewColumn?: ViewColumn, preserveFocus?: boolean): void;

		/**
		 * Dispose of the webview panel.
		 *
		 * This closes the panel if it showing and disposes of the resources owned by the webview.
		 * Webview panels are also disposed when the user closes the webview panel. Both cases
		 * fire the `onDispose` event.
		 */
		dispose(): any;
	}

	/**
	 * Event fired when a webview panel's view state changes.
	 */
	export interface WebviewPanelOnDidChangeViewStateEvent {
		/**
		 * Webview panel whose view state changed.
		 */
		readonly webviewPanel: WebviewPanel;
	}

	/**
	 * Restore webview panels that have been persisted when vscode shuts down.
	 *
	 * There are two types of webview persistence:
	 *
	 * - Persistence within a session.
	 * - Persistence across sessions (across restarts of the editor).
	 *
	 * A `WebviewPanelSerializer` is only required for the second case: persisting a webview across sessions.
	 *
	 * Persistence within a session allows a webview to save its state when it becomes hidden
	 * and restore its content from this state when it becomes visible again. It is powered entirely
	 * by the webview content itself. To save off a persisted state, call `acquireVsCodeApi().setState()` with
	 * any json serializable object. To restore the state again, call `getState()`
	 *
	 * ```js
	 * // Within the webview
	 * const vscode = acquireVsCodeApi();
	 *
	 * // Get existing state
	 * const oldState = vscode.getState() || { value: 0 };
	 *
	 * // Update state
	 * setState({ value: oldState.value + 1 })
	 * ```
	 *
	 * A `WebviewPanelSerializer` extends this persistence across restarts of the editor. When the editor is shutdown,
	 * it will save off the state from `setState` of all webviews that have a serializer. When the
	 * webview first becomes visible after the restart, this state is passed to `deserializeWebviewPanel`.
	 * The extension can then restore the old `WebviewPanel` from this state.
	 *
	 * @param T Type of the webview's state.
	 */
	export interface WebviewPanelSerializer<T = unknown> {
		/**
		 * Restore a webview panel from its serialized `state`.
		 *
		 * Called when a serialized webview first becomes visible.
		 *
		 * @param webviewPanel Webview panel to restore. The serializer should take ownership of this panel. The
		 * serializer must restore the webview's `.html` and hook up all webview events.
		 * @param state Persisted state from the webview content.
		 *
		 * @returns Thenable indicating that the webview has been fully restored.
		 */
		deserializeWebviewPanel(webviewPanel: WebviewPanel, state: T): Thenable<void>;
	}

	/**
	 * A webview based view.
	 */
	export interface WebviewView {
		/**
		 * Identifies the type of the webview view, such as `'hexEditor.dataView'`.
		 */
		readonly viewType: string;

		/**
		 * The underlying webview for the view.
		 */
		readonly webview: Webview;

		/**
		 * View title displayed in the UI.
		 *
		 * The view title is initially taken from the extension `package.json` contribution.
		 */
		title?: string;

		/**
		 * Human-readable string which is rendered less prominently in the title.
		 */
		description?: string;

		/**
		 * The badge to display for this webview view.
		 * To remove the badge, set to undefined.
		 */
		badge?: ViewBadge | undefined;

		/**
		 * Event fired when the view is disposed.
		 *
		 * Views are disposed when they are explicitly hidden by a user (this happens when a user
		 * right clicks in a view and unchecks the webview view).
		 *
		 * Trying to use the view after it has been disposed throws an exception.
		 */
		readonly onDidDispose: Event<void>;

		/**
		 * Tracks if the webview is currently visible.
		 *
		 * Views are visible when they are on the screen and expanded.
		 */
		readonly visible: boolean;

		/**
		 * Event fired when the visibility of the view changes.
		 *
		 * Actions that trigger a visibility change:
		 *
		 * - The view is collapsed or expanded.
		 * - The user switches to a different view group in the sidebar or panel.
		 *
		 * Note that hiding a view using the context menu instead disposes of the view and fires `onDidDispose`.
		 */
		readonly onDidChangeVisibility: Event<void>;

		/**
		 * Reveal the view in the UI.
		 *
		 * If the view is collapsed, this will expand it.
		 *
		 * @param preserveFocus When `true` the view will not take focus.
		 */
		show(preserveFocus?: boolean): void;
	}

	/**
	 * Additional information the webview view being resolved.
	 *
	 * @param T Type of the webview's state.
	 */
	export interface WebviewViewResolveContext<T = unknown> {
		/**
		 * Persisted state from the webview content.
		 *
		 * To save resources, the editor normally deallocates webview documents (the iframe content) that are not visible.
		 * For example, when the user collapse a view or switches to another top level activity in the sidebar, the
		 * `WebviewView` itself is kept alive but the webview's underlying document is deallocated. It is recreated when
		 * the view becomes visible again.
		 *
		 * You can prevent this behavior by setting `retainContextWhenHidden` in the `WebviewOptions`. However this
		 * increases resource usage and should be avoided wherever possible. Instead, you can use persisted state to
		 * save off a webview's state so that it can be quickly recreated as needed.
		 *
		 * To save off a persisted state, inside the webview call `acquireVsCodeApi().setState()` with
		 * any json serializable object. To restore the state again, call `getState()`. For example:
		 *
		 * ```js
		 * // Within the webview
		 * const vscode = acquireVsCodeApi();
		 *
		 * // Get existing state
		 * const oldState = vscode.getState() || { value: 0 };
		 *
		 * // Update state
		 * setState({ value: oldState.value + 1 })
		 * ```
		 *
		 * The editor ensures that the persisted state is saved correctly when a webview is hidden and across
		 * editor restarts.
		 */
		readonly state: T | undefined;
	}

	/**
	 * Provider for creating `WebviewView` elements.
	 */
	export interface WebviewViewProvider {
		/**
		 * Resolves a webview view.
		 *
		 * `resolveWebviewView` is called when a view first becomes visible. This may happen when the view is
		 * first loaded or when the user hides and then shows a view again.
		 *
		 * @param webviewView Webview view to restore. The provider should take ownership of this view. The
		 *    provider must set the webview's `.html` and hook up all webview events it is interested in.
		 * @param context Additional metadata about the view being resolved.
		 * @param token Cancellation token indicating that the view being provided is no longer needed.
		 *
		 * @returns Optional thenable indicating that the view has been fully resolved.
		 */
		resolveWebviewView(webviewView: WebviewView, context: WebviewViewResolveContext, token: CancellationToken): Thenable<void> | void;
	}

	/**
	 * Provider for text based custom editors.
	 *
	 * Text based custom editors use a {@linkcode TextDocument} as their data model. This considerably simplifies
	 * implementing a custom editor as it allows the editor to handle many common operations such as
	 * undo and backup. The provider is responsible for synchronizing text changes between the webview and the `TextDocument`.
	 */
	export interface CustomTextEditorProvider {

		/**
		 * Resolve a custom editor for a given text resource.
		 *
		 * This is called when a user first opens a resource for a `CustomTextEditorProvider`, or if they reopen an
		 * existing editor using this `CustomTextEditorProvider`.
		 *
		 *
		 * @param document Document for the resource to resolve.
		 *
		 * @param webviewPanel The webview panel used to display the editor UI for this resource.
		 *
		 * During resolve, the provider must fill in the initial html for the content webview panel and hook up all
		 * the event listeners on it that it is interested in. The provider can also hold onto the `WebviewPanel` to
		 * use later for example in a command. See {@linkcode WebviewPanel} for additional details.
		 *
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @returns Thenable indicating that the custom editor has been resolved.
		 */
		resolveCustomTextEditor(document: TextDocument, webviewPanel: WebviewPanel, token: CancellationToken): Thenable<void> | void;
	}

	/**
	 * Represents a custom document used by a {@linkcode CustomEditorProvider}.
	 *
	 * Custom documents are only used within a given `CustomEditorProvider`. The lifecycle of a `CustomDocument` is
	 * managed by the editor. When no more references remain to a `CustomDocument`, it is disposed of.
	 */
	export interface CustomDocument {
		/**
		 * The associated uri for this document.
		 */
		readonly uri: Uri;

		/**
		 * Dispose of the custom document.
		 *
		 * This is invoked by the editor when there are no more references to a given `CustomDocument` (for example when
		 * all editors associated with the document have been closed.)
		 */
		dispose(): void;
	}

	/**
	 * Event triggered by extensions to signal to the editor that an edit has occurred on an {@linkcode CustomDocument}.
	 *
	 * @see {@linkcode CustomEditorProvider.onDidChangeCustomDocument}.
	 */
	export interface CustomDocumentEditEvent<T extends CustomDocument = CustomDocument> {

		/**
		 * The document that the edit is for.
		 */
		readonly document: T;

		/**
		 * Undo the edit operation.
		 *
		 * This is invoked by the editor when the user undoes this edit. To implement `undo`, your
		 * extension should restore the document and editor to the state they were in just before this
		 * edit was added to the editor's internal edit stack by `onDidChangeCustomDocument`.
		 */
		undo(): Thenable<void> | void;

		/**
		 * Redo the edit operation.
		 *
		 * This is invoked by the editor when the user redoes this edit. To implement `redo`, your
		 * extension should restore the document and editor to the state they were in just after this
		 * edit was added to the editor's internal edit stack by `onDidChangeCustomDocument`.
		 */
		redo(): Thenable<void> | void;

		/**
		 * Display name describing the edit.
		 *
		 * This will be shown to users in the UI for undo/redo operations.
		 */
		readonly label?: string;
	}

	/**
	 * Event triggered by extensions to signal to the editor that the content of a {@linkcode CustomDocument}
	 * has changed.
	 *
	 * @see {@linkcode CustomEditorProvider.onDidChangeCustomDocument}.
	 */
	export interface CustomDocumentContentChangeEvent<T extends CustomDocument = CustomDocument> {
		/**
		 * The document that the change is for.
		 */
		readonly document: T;
	}

	/**
	 * A backup for an {@linkcode CustomDocument}.
	 */
	export interface CustomDocumentBackup {
		/**
		 * Unique identifier for the backup.
		 *
		 * This id is passed back to your extension in `openCustomDocument` when opening a custom editor from a backup.
		 */
		readonly id: string;

		/**
		 * Delete the current backup.
		 *
		 * This is called by the editor when it is clear the current backup is no longer needed, such as when a new backup
		 * is made or when the file is saved.
		 */
		delete(): void;
	}

	/**
	 * Additional information used to implement {@linkcode CustomDocumentBackup}.
	 */
	export interface CustomDocumentBackupContext {
		/**
		 * Suggested file location to write the new backup.
		 *
		 * Note that your extension is free to ignore this and use its own strategy for backup.
		 *
		 * If the editor is for a resource from the current workspace, `destination` will point to a file inside
		 * `ExtensionContext.storagePath`. The parent folder of `destination` may not exist, so make sure to created it
		 * before writing the backup to this location.
		 */
		readonly destination: Uri;
	}

	/**
	 * Additional information about the opening custom document.
	 */
	export interface CustomDocumentOpenContext {
		/**
		 * The id of the backup to restore the document from or `undefined` if there is no backup.
		 *
		 * If this is provided, your extension should restore the editor from the backup instead of reading the file
		 * from the user's workspace.
		 */
		readonly backupId: string | undefined;

		/**
		 * If the URI is an untitled file, this will be populated with the byte data of that file
		 *
		 * If this is provided, your extension should utilize this byte data rather than executing fs APIs on the URI passed in
		 */
		readonly untitledDocumentData: Uint8Array | undefined;
	}

	/**
	 * Provider for readonly custom editors that use a custom document model.
	 *
	 * Custom editors use {@linkcode CustomDocument} as their document model instead of a {@linkcode TextDocument}.
	 *
	 * You should use this type of custom editor when dealing with binary files or more complex scenarios. For simple
	 * text based documents, use {@linkcode CustomTextEditorProvider} instead.
	 *
	 * @param T Type of the custom document returned by this provider.
	 */
	export interface CustomReadonlyEditorProvider<T extends CustomDocument = CustomDocument> {

		/**
		 * Create a new document for a given resource.
		 *
		 * `openCustomDocument` is called when the first time an editor for a given resource is opened. The opened
		 * document is then passed to `resolveCustomEditor` so that the editor can be shown to the user.
		 *
		 * Already opened `CustomDocument` are re-used if the user opened additional editors. When all editors for a
		 * given resource are closed, the `CustomDocument` is disposed of. Opening an editor at this point will
		 * trigger another call to `openCustomDocument`.
		 *
		 * @param uri Uri of the document to open.
		 * @param openContext Additional information about the opening custom document.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @returns The custom document.
		 */
		openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, token: CancellationToken): Thenable<T> | T;

		/**
		 * Resolve a custom editor for a given resource.
		 *
		 * This is called whenever the user opens a new editor for this `CustomEditorProvider`.
		 *
		 * @param document Document for the resource being resolved.
		 *
		 * @param webviewPanel The webview panel used to display the editor UI for this resource.
		 *
		 * During resolve, the provider must fill in the initial html for the content webview panel and hook up all
		 * the event listeners on it that it is interested in. The provider can also hold onto the `WebviewPanel` to
		 * use later for example in a command. See {@linkcode WebviewPanel} for additional details.
		 *
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @returns Optional thenable indicating that the custom editor has been resolved.
		 */
		resolveCustomEditor(document: T, webviewPanel: WebviewPanel, token: CancellationToken): Thenable<void> | void;
	}

	/**
	 * Provider for editable custom editors that use a custom document model.
	 *
	 * Custom editors use {@linkcode CustomDocument} as their document model instead of a {@linkcode TextDocument}.
	 * This gives extensions full control over actions such as edit, save, and backup.
	 *
	 * You should use this type of custom editor when dealing with binary files or more complex scenarios. For simple
	 * text based documents, use {@linkcode CustomTextEditorProvider} instead.
	 *
	 * @param T Type of the custom document returned by this provider.
	 */
	export interface CustomEditorProvider<T extends CustomDocument = CustomDocument> extends CustomReadonlyEditorProvider<T> {
		/**
		 * Signal that an edit has occurred inside a custom editor.
		 *
		 * This event must be fired by your extension whenever an edit happens in a custom editor. An edit can be
		 * anything from changing some text, to cropping an image, to reordering a list. Your extension is free to
		 * define what an edit is and what data is stored on each edit.
		 *
		 * Firing `onDidChange` causes the editors to be marked as being dirty. This is cleared when the user either
		 * saves or reverts the file.
		 *
		 * Editors that support undo/redo must fire a `CustomDocumentEditEvent` whenever an edit happens. This allows
		 * users to undo and redo the edit using the editor's standard keyboard shortcuts. The editor will also mark
		 * the editor as no longer being dirty if the user undoes all edits to the last saved state.
		 *
		 * Editors that support editing but cannot use the editor's standard undo/redo mechanism must fire a `CustomDocumentContentChangeEvent`.
		 * The only way for a user to clear the dirty state of an editor that does not support undo/redo is to either
		 * `save` or `revert` the file.
		 *
		 * An editor should only ever fire `CustomDocumentEditEvent` events, or only ever fire `CustomDocumentContentChangeEvent` events.
		 */
		readonly onDidChangeCustomDocument: Event<CustomDocumentEditEvent<T>> | Event<CustomDocumentContentChangeEvent<T>>;

		/**
		 * Save a custom document.
		 *
		 * This method is invoked by the editor when the user saves a custom editor. This can happen when the user
		 * triggers save while the custom editor is active, by commands such as `save all`, or by auto save if enabled.
		 *
		 * To implement `save`, the implementer must persist the custom editor. This usually means writing the
		 * file data for the custom document to disk. After `save` completes, any associated editor instances will
		 * no longer be marked as dirty.
		 *
		 * @param document Document to save.
		 * @param cancellation Token that signals the save is no longer required (for example, if another save was triggered).
		 *
		 * @returns Thenable signaling that saving has completed.
		 */
		saveCustomDocument(document: T, cancellation: CancellationToken): Thenable<void>;

		/**
		 * Save a custom document to a different location.
		 *
		 * This method is invoked by the editor when the user triggers 'save as' on a custom editor. The implementer must
		 * persist the custom editor to `destination`.
		 *
		 * When the user accepts save as, the current editor is be replaced by an non-dirty editor for the newly saved file.
		 *
		 * @param document Document to save.
		 * @param destination Location to save to.
		 * @param cancellation Token that signals the save is no longer required.
		 *
		 * @returns Thenable signaling that saving has completed.
		 */
		saveCustomDocumentAs(document: T, destination: Uri, cancellation: CancellationToken): Thenable<void>;

		/**
		 * Revert a custom document to its last saved state.
		 *
		 * This method is invoked by the editor when the user triggers `File: Revert File` in a custom editor. (Note that
		 * this is only used using the editor's `File: Revert File` command and not on a `git revert` of the file).
		 *
		 * To implement `revert`, the implementer must make sure all editor instances (webviews) for `document`
		 * are displaying the document in the same state is saved in. This usually means reloading the file from the
		 * workspace.
		 *
		 * @param document Document to revert.
		 * @param cancellation Token that signals the revert is no longer required.
		 *
		 * @returns Thenable signaling that the change has completed.
		 */
		revertCustomDocument(document: T, cancellation: CancellationToken): Thenable<void>;

		/**
		 * Back up a dirty custom document.
		 *
		 * Backups are used for hot exit and to prevent data loss. Your `backup` method should persist the resource in
		 * its current state, i.e. with the edits applied. Most commonly this means saving the resource to disk in
		 * the `ExtensionContext.storagePath`. When the editor reloads and your custom editor is opened for a resource,
		 * your extension should first check to see if any backups exist for the resource. If there is a backup, your
		 * extension should load the file contents from there instead of from the resource in the workspace.
		 *
		 * `backup` is triggered approximately one second after the user stops editing the document. If the user
		 * rapidly edits the document, `backup` will not be invoked until the editing stops.
		 *
		 * `backup` is not invoked when `auto save` is enabled (since auto save already persists the resource).
		 *
		 * @param document Document to backup.
		 * @param context Information that can be used to backup the document.
		 * @param cancellation Token that signals the current backup since a new backup is coming in. It is up to your
		 * extension to decided how to respond to cancellation. If for example your extension is backing up a large file
		 * in an operation that takes time to complete, your extension may decide to finish the ongoing backup rather
		 * than cancelling it to ensure that the editor has some valid backup.
		 */
		backupCustomDocument(document: T, context: CustomDocumentBackupContext, cancellation: CancellationToken): Thenable<CustomDocumentBackup>;
	}

	/**
	 * The clipboard provides read and write access to the system's clipboard.
	 */
	export interface Clipboard {

		/**
		 * Read the current clipboard contents as text.
		 * @returns A thenable that resolves to a string.
		 */
		readText(): Thenable<string>;

		/**
		 * Writes text into the clipboard.
		 * @returns A thenable that resolves when writing happened.
		 */
		writeText(value: string): Thenable<void>;
	}

	/**
	 * Possible kinds of UI that can use extensions.
	 */
	export enum UIKind {

		/**
		 * Extensions are accessed from a desktop application.
		 */
		Desktop = 1,

		/**
		 * Extensions are accessed from a web browser.
		 */
		Web = 2
	}

	/**
	 * Log levels
	 */
	export enum LogLevel {

		/**
		 * No messages are logged with this level.
		 */
		Off = 0,

		/**
		 * All messages are logged with this level.
		 */
		Trace = 1,

		/**
		 * Messages with debug and higher log level are logged with this level.
		 */
		Debug = 2,

		/**
		 * Messages with info and higher log level are logged with this level.
		 */
		Info = 3,

		/**
		 * Messages with warning and higher log level are logged with this level.
		 */
		Warning = 4,

		/**
		 * Only error messages are logged with this level.
		 */
		Error = 5
	}

	/**
	 * Namespace describing the environment the editor runs in.
	 */
	export namespace env {

		/**
		 * The application name of the editor, like 'VS Code'.
		 */
		export const appName: string;

		/**
		 * The application root folder from which the editor is running.
		 *
		 * *Note* that the value is the empty string when running in an
		 * environment that has no representation of an application root folder.
		 */
		export const appRoot: string;

		/**
		 * The hosted location of the application
		 * On desktop this is 'desktop'
		 * In the web this is the specified embedder i.e. 'github.dev', 'codespaces', or 'web' if the embedder
		 * does not provide that information
		 */
		export const appHost: string;

		/**
		 * The custom uri scheme the editor registers to in the operating system.
		 */
		export const uriScheme: string;

		/**
		 * Represents the preferred user-language, like `de-CH`, `fr`, or `en-US`.
		 */
		export const language: string;

		/**
		 * The system clipboard.
		 */
		export const clipboard: Clipboard;

		/**
		 * A unique identifier for the computer.
		 */
		export const machineId: string;

		/**
		 * A unique identifier for the current session.
		 * Changes each time the editor is started.
		 */
		export const sessionId: string;

		/**
		 * Indicates that this is a fresh install of the application.
		 * `true` if within the first day of installation otherwise `false`.
		 */
		export const isNewAppInstall: boolean;

		/**
		 * Indicates whether the users has telemetry enabled.
		 * Can be observed to determine if the extension should send telemetry.
		 */
		export const isTelemetryEnabled: boolean;

		/**
		 * An {@link Event} which fires when the user enabled or disables telemetry.
		 * `true` if the user has enabled telemetry or `false` if the user has disabled telemetry.
		 */
		export const onDidChangeTelemetryEnabled: Event<boolean>;

		/**
		 * An {@link Event} which fires when the default shell changes. This fires with the new
		 * shell path.
		 */
		export const onDidChangeShell: Event<string>;

		/**
		 * Creates a new {@link TelemetryLogger telemetry logger}.
		 *
		 * @param sender The telemetry sender that is used by the telemetry logger.
		 * @param options Options for the telemetry logger.
		 * @returns A new telemetry logger
		 */
		export function createTelemetryLogger(sender: TelemetrySender, options?: TelemetryLoggerOptions): TelemetryLogger;

		/**
		 * The name of a remote. Defined by extensions, popular samples are `wsl` for the Windows
		 * Subsystem for Linux or `ssh-remote` for remotes using a secure shell.
		 *
		 * *Note* that the value is `undefined` when there is no remote extension host but that the
		 * value is defined in all extension hosts (local and remote) in case a remote extension host
		 * exists. Use {@link Extension.extensionKind} to know if
		 * a specific extension runs remote or not.
		 */
		export const remoteName: string | undefined;

		/**
		 * The detected default shell for the extension host, this is overridden by the
		 * `terminal.integrated.defaultProfile` setting for the extension host's platform. Note that in
		 * environments that do not support a shell the value is the empty string.
		 */
		export const shell: string;

		/**
		 * The UI kind property indicates from which UI extensions
		 * are accessed from. For example, extensions could be accessed
		 * from a desktop application or a web browser.
		 */
		export const uiKind: UIKind;

		/**
		 * Opens a link externally using the default application. Depending on the
		 * used scheme this can be:
		 * * a browser (`http:`, `https:`)
		 * * a mail client (`mailto:`)
		 * * VSCode itself (`vscode:` from `vscode.env.uriScheme`)
		 *
		 * *Note* that {@linkcode window.showTextDocument showTextDocument} is the right
		 * way to open a text document inside the editor, not this function.
		 *
		 * @param target The uri that should be opened.
		 * @returns A promise indicating if open was successful.
		 */
		export function openExternal(target: Uri): Thenable<boolean>;

		/**
		 * Resolves a uri to a form that is accessible externally.
		 *
		 * #### `http:` or `https:` scheme
		 *
		 * Resolves an *external* uri, such as a `http:` or `https:` link, from where the extension is running to a
		 * uri to the same resource on the client machine.
		 *
		 * This is a no-op if the extension is running on the client machine.
		 *
		 * If the extension is running remotely, this function automatically establishes a port forwarding tunnel
		 * from the local machine to `target` on the remote and returns a local uri to the tunnel. The lifetime of
		 * the port forwarding tunnel is managed by the editor and the tunnel can be closed by the user.
		 *
		 * *Note* that uris passed through `openExternal` are automatically resolved and you should not call `asExternalUri` on them.
		 *
		 * #### `vscode.env.uriScheme`
		 *
		 * Creates a uri that - if opened in a browser (e.g. via `openExternal`) - will result in a registered {@link UriHandler}
		 * to trigger.
		 *
		 * Extensions should not make any assumptions about the resulting uri and should not alter it in any way.
		 * Rather, extensions can e.g. use this uri in an authentication flow, by adding the uri as callback query
		 * argument to the server to authenticate to.
		 *
		 * *Note* that if the server decides to add additional query parameters to the uri (e.g. a token or secret), it
		 * will appear in the uri that is passed to the {@link UriHandler}.
		 *
		 * **Example** of an authentication flow:
		 * ```typescript
		 * vscode.window.registerUriHandler({
		 *   handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
		 *     if (uri.path === '/did-authenticate') {
		 *       console.log(uri.toString());
		 *     }
		 *   }
		 * });
		 *
		 * const callableUri = await vscode.env.asExternalUri(vscode.Uri.parse(vscode.env.uriScheme + '://my.extension/did-authenticate'));
		 * await vscode.env.openExternal(callableUri);
		 * ```
		 *
		 * *Note* that extensions should not cache the result of `asExternalUri` as the resolved uri may become invalid due to
		 * a system or user action — for example, in remote cases, a user may close a port forwarding tunnel that was opened by
		 * `asExternalUri`.
		 *
		 * #### Any other scheme
		 *
		 * Any other scheme will be handled as if the provided URI is a workspace URI. In that case, the method will return
		 * a URI which, when handled, will make the editor open the workspace.
		 *
		 * @returns A uri that can be used on the client machine.
		 */
		export function asExternalUri(target: Uri): Thenable<Uri>;

		/**
		 * The current log level of the editor.
		 */
		export const logLevel: LogLevel;

		/**
		 * An {@link Event} which fires when the log level of the editor changes.
		 */
		export const onDidChangeLogLevel: Event<LogLevel>;
	}

	/**
	 * Namespace for dealing with commands. In short, a command is a function with a
	 * unique identifier. The function is sometimes also called _command handler_.
	 *
	 * Commands can be added to the editor using the {@link commands.registerCommand registerCommand}
	 * and {@link commands.registerTextEditorCommand registerTextEditorCommand} functions. Commands
	 * can be executed {@link commands.executeCommand manually} or from a UI gesture. Those are:
	 *
	 * * palette - Use the `commands`-section in `package.json` to make a command show in
	 * the [command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette).
	 * * keybinding - Use the `keybindings`-section in `package.json` to enable
	 * [keybindings](https://code.visualstudio.com/docs/getstarted/keybindings#_advanced-customization)
	 * for your extension.
	 *
	 * Commands from other extensions and from the editor itself are accessible to an extension. However,
	 * when invoking an editor command not all argument types are supported.
	 *
	 * This is a sample that registers a command handler and adds an entry for that command to the palette. First
	 * register a command handler with the identifier `extension.sayHello`.
	 * ```javascript
	 * commands.registerCommand('extension.sayHello', () => {
	 * 	window.showInformationMessage('Hello World!');
	 * });
	 * ```
	 * Second, bind the command identifier to a title under which it will show in the palette (`package.json`).
	 * ```json
	 * {
	 * 	"contributes": {
	 * 		"commands": [{
	 * 			"command": "extension.sayHello",
	 * 			"title": "Hello World"
	 * 		}]
	 * 	}
	 * }
	 * ```
	 */
	export namespace commands {

		/**
		 * Registers a command that can be invoked via a keyboard shortcut,
		 * a menu item, an action, or directly.
		 *
		 * Registering a command with an existing command identifier twice
		 * will cause an error.
		 *
		 * @param command A unique identifier for the command.
		 * @param callback A command handler function.
		 * @param thisArg The `this` context used when invoking the handler function.
		 * @returns Disposable which unregisters this command on disposal.
		 */
		export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable;

		/**
		 * Registers a text editor command that can be invoked via a keyboard shortcut,
		 * a menu item, an action, or directly.
		 *
		 * Text editor commands are different from ordinary {@link commands.registerCommand commands} as
		 * they only execute when there is an active editor when the command is called. Also, the
		 * command handler of an editor command has access to the active editor and to an
		 * {@link TextEditorEdit edit}-builder. Note that the edit-builder is only valid while the
		 * callback executes.
		 *
		 * @param command A unique identifier for the command.
		 * @param callback A command handler function with access to an {@link TextEditor editor} and an {@link TextEditorEdit edit}.
		 * @param thisArg The `this` context used when invoking the handler function.
		 * @returns Disposable which unregisters this command on disposal.
		 */
		export function registerTextEditorCommand(command: string, callback: (textEditor: TextEditor, edit: TextEditorEdit, ...args: any[]) => void, thisArg?: any): Disposable;

		/**
		 * Executes the command denoted by the given command identifier.
		 *
		 * * *Note 1:* When executing an editor command not all types are allowed to
		 * be passed as arguments. Allowed are the primitive types `string`, `boolean`,
		 * `number`, `undefined`, and `null`, as well as {@linkcode Position}, {@linkcode Range}, {@linkcode Uri} and {@linkcode Location}.
		 * * *Note 2:* There are no restrictions when executing commands that have been contributed
		 * by extensions.
		 *
		 * @param command Identifier of the command to execute.
		 * @param rest Parameters passed to the command function.
		 * @returns A thenable that resolves to the returned value of the given command. Returns `undefined` when
		 * the command handler function doesn't return anything.
		 */
		export function executeCommand<T = unknown>(command: string, ...rest: any[]): Thenable<T>;

		/**
		 * Retrieve the list of all available commands. Commands starting with an underscore are
		 * treated as internal commands.
		 *
		 * @param filterInternal Set `true` to not see internal commands (starting with an underscore)
		 * @returns Thenable that resolves to a list of command ids.
		 */
		export function getCommands(filterInternal?: boolean): Thenable<string[]>;
	}

	/**
	 * Represents the state of a window.
	 */
	export interface WindowState {

		/**
		 * Whether the current window is focused.
		 */
		readonly focused: boolean;

		/**
		 * Whether the window has been interacted with recently. This will change
		 * immediately on activity, or after a short time of user inactivity.
		 */
		readonly active: boolean;
	}

	/**
	 * A uri handler is responsible for handling system-wide {@link Uri uris}.
	 *
	 * @see {@link window.registerUriHandler}.
	 */
	export interface UriHandler {

		/**
		 * Handle the provided system-wide {@link Uri}.
		 *
		 * @see {@link window.registerUriHandler}.
		 */
		handleUri(uri: Uri): ProviderResult<void>;
	}

	/**
	 * Namespace for dealing with the current window of the editor. That is visible
	 * and active editors, as well as, UI elements to show messages, selections, and
	 * asking for user input.
	 */
	export namespace window {

		/**
		 * Represents the grid widget within the main editor area
		 */
		export const tabGroups: TabGroups;

		/**
		 * The currently active editor or `undefined`. The active editor is the one
		 * that currently has focus or, when none has focus, the one that has changed
		 * input most recently.
		 */
		export let activeTextEditor: TextEditor | undefined;

		/**
		 * The currently visible editors or an empty array.
		 */
		export let visibleTextEditors: readonly TextEditor[];

		/**
		 * An {@link Event} which fires when the {@link window.activeTextEditor active editor}
		 * has changed. *Note* that the event also fires when the active editor changes
		 * to `undefined`.
		 */
		export const onDidChangeActiveTextEditor: Event<TextEditor | undefined>;

		/**
		 * An {@link Event} which fires when the array of {@link window.visibleTextEditors visible editors}
		 * has changed.
		 */
		export const onDidChangeVisibleTextEditors: Event<readonly TextEditor[]>;

		/**
		 * An {@link Event} which fires when the selection in an editor has changed.
		 */
		export const onDidChangeTextEditorSelection: Event<TextEditorSelectionChangeEvent>;

		/**
		 * An {@link Event} which fires when the visible ranges of an editor has changed.
		 */
		export const onDidChangeTextEditorVisibleRanges: Event<TextEditorVisibleRangesChangeEvent>;

		/**
		 * An {@link Event} which fires when the options of an editor have changed.
		 */
		export const onDidChangeTextEditorOptions: Event<TextEditorOptionsChangeEvent>;

		/**
		 * An {@link Event} which fires when the view column of an editor has changed.
		 */
		export const onDidChangeTextEditorViewColumn: Event<TextEditorViewColumnChangeEvent>;

		/**
		 * The currently visible {@link NotebookEditor notebook editors} or an empty array.
		 */
		export const visibleNotebookEditors: readonly NotebookEditor[];

		/**
		 * An {@link Event} which fires when the {@link window.visibleNotebookEditors visible notebook editors}
		 * has changed.
		 */
		export const onDidChangeVisibleNotebookEditors: Event<readonly NotebookEditor[]>;

		/**
		 * The currently active {@link NotebookEditor notebook editor} or `undefined`. The active editor is the one
		 * that currently has focus or, when none has focus, the one that has changed
		 * input most recently.
		 */
		export const activeNotebookEditor: NotebookEditor | undefined;

		/**
		 * An {@link Event} which fires when the {@link window.activeNotebookEditor active notebook editor}
		 * has changed. *Note* that the event also fires when the active editor changes
		 * to `undefined`.
		 */
		export const onDidChangeActiveNotebookEditor: Event<NotebookEditor | undefined>;

		/**
		 * An {@link Event} which fires when the {@link NotebookEditor.selections notebook editor selections}
		 * have changed.
		 */
		export const onDidChangeNotebookEditorSelection: Event<NotebookEditorSelectionChangeEvent>;

		/**
		 * An {@link Event} which fires when the {@link NotebookEditor.visibleRanges notebook editor visible ranges}
		 * have changed.
		 */
		export const onDidChangeNotebookEditorVisibleRanges: Event<NotebookEditorVisibleRangesChangeEvent>;

		/**
		 * The currently opened terminals or an empty array.
		 */
		export const terminals: readonly Terminal[];

		/**
		 * The currently active terminal or `undefined`. The active terminal is the one that
		 * currently has focus or most recently had focus.
		 */
		export const activeTerminal: Terminal | undefined;

		/**
		 * An {@link Event} which fires when the {@link window.activeTerminal active terminal}
		 * has changed. *Note* that the event also fires when the active terminal changes
		 * to `undefined`.
		 */
		export const onDidChangeActiveTerminal: Event<Terminal | undefined>;

		/**
		 * An {@link Event} which fires when a terminal has been created, either through the
		 * {@link window.createTerminal createTerminal} API or commands.
		 */
		export const onDidOpenTerminal: Event<Terminal>;

		/**
		 * An {@link Event} which fires when a terminal is disposed.
		 */
		export const onDidCloseTerminal: Event<Terminal>;

		/**
		 * An {@link Event} which fires when a {@link Terminal.state terminal's state} has changed.
		 */
		export const onDidChangeTerminalState: Event<Terminal>;

		/**
		 * Fires when shell integration activates or one of its properties changes in a terminal.
		 */
		export const onDidChangeTerminalShellIntegration: Event<TerminalShellIntegrationChangeEvent>;

		/**
		 * This will be fired when a terminal command is started. This event will fire only when
		 * [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) is
		 * activated for the terminal.
		 */
		export const onDidStartTerminalShellExecution: Event<TerminalShellExecutionStartEvent>;

		/**
		 * This will be fired when a terminal command is ended. This event will fire only when
		 * [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) is
		 * activated for the terminal.
		 */
		export const onDidEndTerminalShellExecution: Event<TerminalShellExecutionEndEvent>;

		/**
		 * Represents the current window's state.
		 */
		export const state: WindowState;

		/**
		 * An {@link Event} which fires when the focus or activity state of the current window
		 * changes. The value of the event represents whether the window is focused.
		 */
		export const onDidChangeWindowState: Event<WindowState>;

		/**
		 * Show the given document in a text editor. A {@link ViewColumn column} can be provided
		 * to control where the editor is being shown. Might change the {@link window.activeTextEditor active editor}.
		 *
		 * @param document A text document to be shown.
		 * @param column A view column in which the {@link TextEditor editor} should be shown. The default is the {@link ViewColumn.Active active}.
		 * Columns that do not exist will be created as needed up to the maximum of {@linkcode ViewColumn.Nine}. Use {@linkcode ViewColumn.Beside}
		 * to open the editor to the side of the currently active one.
		 * @param preserveFocus When `true` the editor will not take focus.
		 * @returns A promise that resolves to an {@link TextEditor editor}.
		 */
		export function showTextDocument(document: TextDocument, column?: ViewColumn, preserveFocus?: boolean): Thenable<TextEditor>;

		/**
		 * Show the given document in a text editor. {@link TextDocumentShowOptions Options} can be provided
		 * to control options of the editor is being shown. Might change the {@link window.activeTextEditor active editor}.
		 *
		 * @param document A text document to be shown.
		 * @param options {@link TextDocumentShowOptions Editor options} to configure the behavior of showing the {@link TextEditor editor}.
		 * @returns A promise that resolves to an {@link TextEditor editor}.
		 */
		export function showTextDocument(document: TextDocument, options?: TextDocumentShowOptions): Thenable<TextEditor>;

		/**
		 * A short-hand for `openTextDocument(uri).then(document => showTextDocument(document, options))`.
		 *
		 * @see {@link workspace.openTextDocument}
		 *
		 * @param uri A resource identifier.
		 * @param options {@link TextDocumentShowOptions Editor options} to configure the behavior of showing the {@link TextEditor editor}.
		 * @returns A promise that resolves to an {@link TextEditor editor}.
		 */
		export function showTextDocument(uri: Uri, options?: TextDocumentShowOptions): Thenable<TextEditor>;

		/**
		 * Show the given {@link NotebookDocument} in a {@link NotebookEditor notebook editor}.
		 *
		 * @param document A text document to be shown.
		 * @param options {@link NotebookDocumentShowOptions Editor options} to configure the behavior of showing the {@link NotebookEditor notebook editor}.
		 *
		 * @returns A promise that resolves to an {@link NotebookEditor notebook editor}.
		 */
		export function showNotebookDocument(document: NotebookDocument, options?: NotebookDocumentShowOptions): Thenable<NotebookEditor>;

		/**
		 * Create a TextEditorDecorationType that can be used to add decorations to text editors.
		 *
		 * @param options Rendering options for the decoration type.
		 * @returns A new decoration type instance.
		 */
		export function createTextEditorDecorationType(options: DecorationRenderOptions): TextEditorDecorationType;

		/**
		 * Show an information message to users. Optionally provide an array of items which will be presented as
		 * clickable buttons.
		 *
		 * @param message The message to show.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showInformationMessage<T extends string>(message: string, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show an information message to users. Optionally provide an array of items which will be presented as
		 * clickable buttons.
		 *
		 * @param message The message to show.
		 * @param options Configures the behaviour of the message.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showInformationMessage<T extends string>(message: string, options: MessageOptions, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show an information message.
		 *
		 * @see {@link window.showInformationMessage showInformationMessage}
		 *
		 * @param message The message to show.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showInformationMessage<T extends MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show an information message.
		 *
		 * @see {@link window.showInformationMessage showInformationMessage}
		 *
		 * @param message The message to show.
		 * @param options Configures the behaviour of the message.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showInformationMessage<T extends MessageItem>(message: string, options: MessageOptions, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show a warning message.
		 *
		 * @see {@link window.showInformationMessage showInformationMessage}
		 *
		 * @param message The message to show.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showWarningMessage<T extends string>(message: string, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show a warning message.
		 *
		 * @see {@link window.showInformationMessage showInformationMessage}
		 *
		 * @param message The message to show.
		 * @param options Configures the behaviour of the message.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showWarningMessage<T extends string>(message: string, options: MessageOptions, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show a warning message.
		 *
		 * @see {@link window.showInformationMessage showInformationMessage}
		 *
		 * @param message The message to show.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showWarningMessage<T extends MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show a warning message.
		 *
		 * @see {@link window.showInformationMessage showInformationMessage}
		 *
		 * @param message The message to show.
		 * @param options Configures the behaviour of the message.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showWarningMessage<T extends MessageItem>(message: string, options: MessageOptions, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show an error message.
		 *
		 * @see {@link window.showInformationMessage showInformationMessage}
		 *
		 * @param message The message to show.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showErrorMessage<T extends string>(message: string, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show an error message.
		 *
		 * @see {@link window.showInformationMessage showInformationMessage}
		 *
		 * @param message The message to show.
		 * @param options Configures the behaviour of the message.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showErrorMessage<T extends string>(message: string, options: MessageOptions, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show an error message.
		 *
		 * @see {@link window.showInformationMessage showInformationMessage}
		 *
		 * @param message The message to show.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showErrorMessage<T extends MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Show an error message.
		 *
		 * @see {@link window.showInformationMessage showInformationMessage}
		 *
		 * @param message The message to show.
		 * @param options Configures the behaviour of the message.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		export function showErrorMessage<T extends MessageItem>(message: string, options: MessageOptions, ...items: T[]): Thenable<T | undefined>;

		/**
		 * Shows a selection list allowing multiple selections.
		 *
		 * @param items An array of strings, or a promise that resolves to an array of strings.
		 * @param options Configures the behavior of the selection list.
		 * @param token A token that can be used to signal cancellation.
		 * @returns A promise that resolves to the selected items or `undefined`.
		 */
		export function showQuickPick(items: readonly string[] | Thenable<readonly string[]>, options: QuickPickOptions & { /** literal-type defines return type */canPickMany: true }, token?: CancellationToken): Thenable<string[] | undefined>;

		/**
		 * Shows a selection list.
		 *
		 * @param items An array of strings, or a promise that resolves to an array of strings.
		 * @param options Configures the behavior of the selection list.
		 * @param token A token that can be used to signal cancellation.
		 * @returns A promise that resolves to the selection or `undefined`.
		 */
		export function showQuickPick(items: readonly string[] | Thenable<readonly string[]>, options?: QuickPickOptions, token?: CancellationToken): Thenable<string | undefined>;

		/**
		 * Shows a selection list allowing multiple selections.
		 *
		 * @param items An array of items, or a promise that resolves to an array of items.
		 * @param options Configures the behavior of the selection list.
		 * @param token A token that can be used to signal cancellation.
		 * @returns A promise that resolves to the selected items or `undefined`.
		 */
		export function showQuickPick<T extends QuickPickItem>(items: readonly T[] | Thenable<readonly T[]>, options: QuickPickOptions & { /** literal-type defines return type */ canPickMany: true }, token?: CancellationToken): Thenable<T[] | undefined>;

		/**
		 * Shows a selection list.
		 *
		 * @param items An array of items, or a promise that resolves to an array of items.
		 * @param options Configures the behavior of the selection list.
		 * @param token A token that can be used to signal cancellation.
		 * @returns A promise that resolves to the selected item or `undefined`.
		 */
		export function showQuickPick<T extends QuickPickItem>(items: readonly T[] | Thenable<readonly T[]>, options?: QuickPickOptions, token?: CancellationToken): Thenable<T | undefined>;

		/**
		 * Shows a selection list of {@link workspace.workspaceFolders workspace folders} to pick from.
		 * Returns `undefined` if no folder is open.
		 *
		 * @param options Configures the behavior of the workspace folder list.
		 * @returns A promise that resolves to the workspace folder or `undefined`.
		 */
		export function showWorkspaceFolderPick(options?: WorkspaceFolderPickOptions): Thenable<WorkspaceFolder | undefined>;

		/**
		 * Shows a file open dialog to the user which allows to select a file
		 * for opening-purposes.
		 *
		 * @param options Options that control the dialog.
		 * @returns A promise that resolves to the selected resources or `undefined`.
		 */
		export function showOpenDialog(options?: OpenDialogOptions): Thenable<Uri[] | undefined>;

		/**
		 * Shows a file save dialog to the user which allows to select a file
		 * for saving-purposes.
		 *
		 * @param options Options that control the dialog.
		 * @returns A promise that resolves to the selected resource or `undefined`.
		 */
		export function showSaveDialog(options?: SaveDialogOptions): Thenable<Uri | undefined>;

		/**
		 * Opens an input box to ask the user for input.
		 *
		 * The returned value will be `undefined` if the input box was canceled (e.g. pressing ESC). Otherwise the
		 * returned value will be the string typed by the user or an empty string if the user did not type
		 * anything but dismissed the input box with OK.
		 *
		 * @param options Configures the behavior of the input box.
		 * @param token A token that can be used to signal cancellation.
		 * @returns A promise that resolves to a string the user provided or to `undefined` in case of dismissal.
		 */
		export function showInputBox(options?: InputBoxOptions, token?: CancellationToken): Thenable<string | undefined>;

		/**
		 * Creates a {@link QuickPick} to let the user pick an item from a list
		 * of items of type T.
		 *
		 * Note that in many cases the more convenient {@link window.showQuickPick}
		 * is easier to use. {@link window.createQuickPick} should be used
		 * when {@link window.showQuickPick} does not offer the required flexibility.
		 *
		 * @returns A new {@link QuickPick}.
		 */
		export function createQuickPick<T extends QuickPickItem>(): QuickPick<T>;

		/**
		 * Creates a {@link InputBox} to let the user enter some text input.
		 *
		 * Note that in many cases the more convenient {@link window.showInputBox}
		 * is easier to use. {@link window.createInputBox} should be used
		 * when {@link window.showInputBox} does not offer the required flexibility.
		 *
		 * @returns A new {@link InputBox}.
		 */
		export function createInputBox(): InputBox;

		/**
		 * Creates a new {@link OutputChannel output channel} with the given name and language id
		 * If language id is not provided, then **Log** is used as default language id.
		 *
		 * You can access the visible or active output channel as a {@link TextDocument text document} from {@link window.visibleTextEditors visible editors} or {@link window.activeTextEditor active editor}
		 * and use the language id to contribute language features like syntax coloring, code lens etc.,
		 *
		 * @param name Human-readable string which will be used to represent the channel in the UI.
		 * @param languageId The identifier of the language associated with the channel.
		 * @returns A new output channel.
		 */
		export function createOutputChannel(name: string, languageId?: string): OutputChannel;

		/**
		 * Creates a new {@link LogOutputChannel log output channel} with the given name.
		 *
		 * @param name Human-readable string which will be used to represent the channel in the UI.
		 * @param options Options for the log output channel.
		 * @returns A new log output channel.
		 */
		export function createOutputChannel(name: string, options: { /** literal-type defines return type */log: true }): LogOutputChannel;

		/**
		 * Create and show a new webview panel.
		 *
		 * @param viewType Identifies the type of the webview panel.
		 * @param title Title of the panel.
		 * @param showOptions Where to show the webview in the editor. If preserveFocus is set, the new webview will not take focus.
		 * @param options Settings for the new panel.
		 *
		 * @returns New webview panel.
		 */
		export function createWebviewPanel(viewType: string, title: string, showOptions: ViewColumn | {
			/**
			 * The view column in which the {@link WebviewPanel} should be shown.
			 */
			readonly viewColumn: ViewColumn;
			/**
			 * An optional flag that when `true` will stop the panel from taking focus.
			 */
			readonly preserveFocus?: boolean;
		}, options?: WebviewPanelOptions & WebviewOptions): WebviewPanel;

		/**
		 * Set a message to the status bar. This is a short hand for the more powerful
		 * status bar {@link window.createStatusBarItem items}.
		 *
		 * @param text The message to show, supports icon substitution as in status bar {@link StatusBarItem.text items}.
		 * @param hideAfterTimeout Timeout in milliseconds after which the message will be disposed.
		 * @returns A disposable which hides the status bar message.
		 */
		export function setStatusBarMessage(text: string, hideAfterTimeout: number): Disposable;

		/**
		 * Set a message to the status bar. This is a short hand for the more powerful
		 * status bar {@link window.createStatusBarItem items}.
		 *
		 * @param text The message to show, supports icon substitution as in status bar {@link StatusBarItem.text items}.
		 * @param hideWhenDone Thenable on which completion (resolve or reject) the message will be disposed.
		 * @returns A disposable which hides the status bar message.
		 */
		export function setStatusBarMessage(text: string, hideWhenDone: Thenable<any>): Disposable;

		/**
		 * Set a message to the status bar. This is a short hand for the more powerful
		 * status bar {@link window.createStatusBarItem items}.
		 *
		 * *Note* that status bar messages stack and that they must be disposed when no
		 * longer used.
		 *
		 * @param text The message to show, supports icon substitution as in status bar {@link StatusBarItem.text items}.
		 * @returns A disposable which hides the status bar message.
		 */
		export function setStatusBarMessage(text: string): Disposable;

		/**
		 * Show progress in the Source Control viewlet while running the given callback and while
		 * its returned promise isn't resolve or rejected.
		 *
		 * @deprecated Use `withProgress` instead.
		 *
		 * @param task A callback returning a promise. Progress increments can be reported with
		 * the provided {@link Progress}-object.
		 * @returns The thenable the task did return.
		 */
		export function withScmProgress<R>(task: (progress: Progress<number>) => Thenable<R>): Thenable<R>;

		/**
		 * Show progress in the editor. Progress is shown while running the given callback
		 * and while the promise it returned isn't resolved nor rejected. The location at which
		 * progress should show (and other details) is defined via the passed {@linkcode ProgressOptions}.
		 *
		 * @param options A {@linkcode ProgressOptions}-object describing the options to use for showing progress, like its location
		 * @param task A callback returning a promise. Progress state can be reported with
		 * the provided {@link Progress}-object.
		 *
		 * To report discrete progress, use `increment` to indicate how much work has been completed. Each call with
		 * a `increment` value will be summed up and reflected as overall progress until 100% is reached (a value of
		 * e.g. `10` accounts for `10%` of work done).
		 * Note that currently only `ProgressLocation.Notification` is capable of showing discrete progress.
		 *
		 * To monitor if the operation has been cancelled by the user, use the provided {@linkcode CancellationToken}.
		 * Note that currently only `ProgressLocation.Notification` is supporting to show a cancel button to cancel the
		 * long running operation.
		 *
		 * @returns The thenable the task-callback returned.
		 */
		export function withProgress<R>(options: ProgressOptions, task: (progress: Progress<{
			/**
			 * A progress message that represents a chunk of work
			 */
			message?: string;
			/**
			 * An increment for discrete progress. Increments will be summed up until 100% is reached
			 */
			increment?: number;
		}>, token: CancellationToken) => Thenable<R>): Thenable<R>;

		/**
		 * Creates a status bar {@link StatusBarItem item}.
		 *
		 * @param id The identifier of the item. Must be unique within the extension.
		 * @param alignment The alignment of the item.
		 * @param priority The priority of the item. Higher values mean the item should be shown more to the left.
		 * @returns A new status bar item.
		 */
		export function createStatusBarItem(id: string, alignment?: StatusBarAlignment, priority?: number): StatusBarItem;

		/**
		 * Creates a status bar {@link StatusBarItem item}.
		 *
		 * @see {@link createStatusBarItem} for creating a status bar item with an identifier.
		 * @param alignment The alignment of the item.
		 * @param priority The priority of the item. Higher values mean the item should be shown more to the left.
		 * @returns A new status bar item.
		 */
		export function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;

		/**
		 * Creates a {@link Terminal} with a backing shell process. The cwd of the terminal will be the workspace
		 * directory if it exists.
		 *
		 * @param name Optional human-readable string which will be used to represent the terminal in the UI.
		 * @param shellPath Optional path to a custom shell executable to be used in the terminal.
		 * @param shellArgs Optional args for the custom shell executable. A string can be used on Windows only which
		 * allows specifying shell args in
		 * [command-line format](https://msdn.microsoft.com/en-au/08dfcab2-eb6e-49a4-80eb-87d4076c98c6).
		 * @returns A new Terminal.
		 * @throws When running in an environment where a new process cannot be started.
		 */
		export function createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): Terminal;

		/**
		 * Creates a {@link Terminal} with a backing shell process.
		 *
		 * @param options A TerminalOptions object describing the characteristics of the new terminal.
		 * @returns A new Terminal.
		 * @throws When running in an environment where a new process cannot be started.
		 */
		export function createTerminal(options: TerminalOptions): Terminal;

		/**
		 * Creates a {@link Terminal} where an extension controls its input and output.
		 *
		 * @param options An {@link ExtensionTerminalOptions} object describing
		 * the characteristics of the new terminal.
		 * @returns A new Terminal.
		 */
		export function createTerminal(options: ExtensionTerminalOptions): Terminal;

		/**
		 * Register a {@link TreeDataProvider} for the view contributed using the extension point `views`.
		 * This will allow you to contribute data to the {@link TreeView} and update if the data changes.
		 *
		 * **Note:** To get access to the {@link TreeView} and perform operations on it, use {@link window.createTreeView createTreeView}.
		 *
		 * @param viewId Id of the view contributed using the extension point `views`.
		 * @param treeDataProvider A {@link TreeDataProvider} that provides tree data for the view
		 * @returns A {@link Disposable disposable} that unregisters the {@link TreeDataProvider}.
		 */
		export function registerTreeDataProvider<T>(viewId: string, treeDataProvider: TreeDataProvider<T>): Disposable;

		/**
		 * Create a {@link TreeView} for the view contributed using the extension point `views`.
		 * @param viewId Id of the view contributed using the extension point `views`.
		 * @param options Options for creating the {@link TreeView}
		 * @returns a {@link TreeView}.
		 */
		export function createTreeView<T>(viewId: string, options: TreeViewOptions<T>): TreeView<T>;

		/**
		 * Registers a {@link UriHandler uri handler} capable of handling system-wide {@link Uri uris}.
		 * In case there are multiple windows open, the topmost window will handle the uri.
		 * A uri handler is scoped to the extension it is contributed from; it will only
		 * be able to handle uris which are directed to the extension itself. A uri must respect
		 * the following rules:
		 *
		 * - The uri-scheme must be `vscode.env.uriScheme`;
		 * - The uri-authority must be the extension id (e.g. `my.extension`);
		 * - The uri-path, -query and -fragment parts are arbitrary.
		 *
		 * For example, if the `my.extension` extension registers a uri handler, it will only
		 * be allowed to handle uris with the prefix `product-name://my.extension`.
		 *
		 * An extension can only register a single uri handler in its entire activation lifetime.
		 *
		 * * *Note:* There is an activation event `onUri` that fires when a uri directed for
		 * the current extension is about to be handled.
		 *
		 * @param handler The uri handler to register for this extension.
		 * @returns A {@link Disposable disposable} that unregisters the handler.
		 */
		export function registerUriHandler(handler: UriHandler): Disposable;

		/**
		 * Registers a webview panel serializer.
		 *
		 * Extensions that support reviving should have an `"onWebviewPanel:viewType"` activation event and
		 * make sure that `registerWebviewPanelSerializer` is called during activation.
		 *
		 * Only a single serializer may be registered at a time for a given `viewType`.
		 *
		 * @param viewType Type of the webview panel that can be serialized.
		 * @param serializer Webview serializer.
		 * @returns A {@link Disposable disposable} that unregisters the serializer.
		 */
		export function registerWebviewPanelSerializer(viewType: string, serializer: WebviewPanelSerializer): Disposable;

		/**
		 * Register a new provider for webview views.
		 *
		 * @param viewId Unique id of the view. This should match the `id` from the
		 *   `views` contribution in the package.json.
		 * @param provider Provider for the webview views.
		 *
		 * @returns Disposable that unregisters the provider.
		 */
		export function registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider, options?: {
			/**
			 * Content settings for the webview created for this view.
			 */
			readonly webviewOptions?: {
				/**
				 * Controls if the webview element itself (iframe) is kept around even when the view
				 * is no longer visible.
				 *
				 * Normally the webview's html context is created when the view becomes visible
				 * and destroyed when it is hidden. Extensions that have complex state
				 * or UI can set the `retainContextWhenHidden` to make the editor keep the webview
				 * context around, even when the webview moves to a background tab. When a webview using
				 * `retainContextWhenHidden` becomes hidden, its scripts and other dynamic content are suspended.
				 * When the view becomes visible again, the context is automatically restored
				 * in the exact same state it was in originally. You cannot send messages to a
				 * hidden webview, even with `retainContextWhenHidden` enabled.
				 *
				 * `retainContextWhenHidden` has a high memory overhead and should only be used if
				 * your view's context cannot be quickly saved and restored.
				 */
				readonly retainContextWhenHidden?: boolean;
			};
		}): Disposable;

		/**
		 * Register a provider for custom editors for the `viewType` contributed by the `customEditors` extension point.
		 *
		 * When a custom editor is opened, an `onCustomEditor:viewType` activation event is fired. Your extension
		 * must register a {@linkcode CustomTextEditorProvider}, {@linkcode CustomReadonlyEditorProvider},
		 * {@linkcode CustomEditorProvider}for `viewType` as part of activation.
		 *
		 * @param viewType Unique identifier for the custom editor provider. This should match the `viewType` from the
		 *   `customEditors` contribution point.
		 * @param provider Provider that resolves custom editors.
		 * @param options Options for the provider.
		 *
		 * @returns Disposable that unregisters the provider.
		 */
		export function registerCustomEditorProvider(viewType: string, provider: CustomTextEditorProvider | CustomReadonlyEditorProvider | CustomEditorProvider, options?: {
			/**
			 * Content settings for the webview panels created for this custom editor.
			 */
			readonly webviewOptions?: WebviewPanelOptions;

			/**
			 * Only applies to `CustomReadonlyEditorProvider | CustomEditorProvider`.
			 *
			 * Indicates that the provider allows multiple editor instances to be open at the same time for
			 * the same resource.
			 *
			 * By default, the editor only allows one editor instance to be open at a time for each resource. If the
			 * user tries to open a second editor instance for the resource, the first one is instead moved to where
			 * the second one was to be opened.
			 *
			 * When `supportsMultipleEditorsPerDocument` is enabled, users can split and create copies of the custom
			 * editor. In this case, the custom editor must make sure it can properly synchronize the states of all
			 * editor instances for a resource so that they are consistent.
			 */
			readonly supportsMultipleEditorsPerDocument?: boolean;
		}): Disposable;

		/**
		 * Register provider that enables the detection and handling of links within the terminal.
		 * @param provider The provider that provides the terminal links.
		 * @returns Disposable that unregisters the provider.
		 */
		export function registerTerminalLinkProvider(provider: TerminalLinkProvider): Disposable;

		/**
		 * Registers a provider for a contributed terminal profile.
		 *
		 * @param id The ID of the contributed terminal profile.
		 * @param provider The terminal profile provider.
		 * @returns A {@link Disposable disposable} that unregisters the provider.
		 */
		export function registerTerminalProfileProvider(id: string, provider: TerminalProfileProvider): Disposable;
		/**
		 * Register a file decoration provider.
		 *
		 * @param provider A {@link FileDecorationProvider}.
		 * @returns A {@link Disposable} that unregisters the provider.
		 */
		export function registerFileDecorationProvider(provider: FileDecorationProvider): Disposable;

		/**
		 * The currently active color theme as configured in the settings. The active
		 * theme can be changed via the `workbench.colorTheme` setting.
		 */
		export let activeColorTheme: ColorTheme;

		/**
		 * An {@link Event} which fires when the active color theme is changed or has changes.
		 */
		export const onDidChangeActiveColorTheme: Event<ColorTheme>;
	}

	/**
	 * Options for creating a {@link TreeView}
	 */
	export interface TreeViewOptions<T> {

		/**
		 * A data provider that provides tree data.
		 */
		treeDataProvider: TreeDataProvider<T>;

		/**
		 * Whether to show collapse all action or not.
		 */
		showCollapseAll?: boolean;

		/**
		 * Whether the tree supports multi-select. When the tree supports multi-select and a command is executed from the tree,
		 * the first argument to the command is the tree item that the command was executed on and the second argument is an
		 * array containing all selected tree items.
		 */
		canSelectMany?: boolean;

		/**
		 * An optional interface to implement drag and drop in the tree view.
		 */
		dragAndDropController?: TreeDragAndDropController<T>;

		/**
		 * By default, when the children of a tree item have already been fetched, child checkboxes are automatically managed based on the checked state of the parent tree item.
		 * If the tree item is collapsed by default (meaning that the children haven't yet been fetched) then child checkboxes will not be updated.
		 * To override this behavior and manage child and parent checkbox state in the extension, set this to `true`.
		 *
		 * Examples where {@link TreeViewOptions.manageCheckboxStateManually} is false, the default behavior:
		 *
		 * 1. A tree item is checked, then its children are fetched. The children will be checked.
		 *
		 * 2. A tree item's parent is checked. The tree item and all of it's siblings will be checked.
		 *   - [ ] Parent
		 *     - [ ] Child 1
		 *     - [ ] Child 2
		 *   When the user checks Parent, the tree will look like this:
		 *   - [x] Parent
		 *     - [x] Child 1
		 *     - [x] Child 2
		 *
		 * 3. A tree item and all of it's siblings are checked. The parent will be checked.
		 *   - [ ] Parent
		 *     - [ ] Child 1
		 *     - [ ] Child 2
		 *   When the user checks Child 1 and Child 2, the tree will look like this:
		 *   - [x] Parent
		 *     - [x] Child 1
		 *     - [x] Child 2
		 *
		 * 4. A tree item is unchecked. The parent will be unchecked.
		 *   - [x] Parent
		 *     - [x] Child 1
		 *     - [x] Child 2
		 *   When the user unchecks Child 1, the tree will look like this:
		 *   - [ ] Parent
		 *     - [ ] Child 1
		 *     - [x] Child 2
		 */
		manageCheckboxStateManually?: boolean;
	}

	/**
	 * The event that is fired when an element in the {@link TreeView} is expanded or collapsed
	 */
	export interface TreeViewExpansionEvent<T> {

		/**
		 * Element that is expanded or collapsed.
		 */
		readonly element: T;

	}

	/**
	 * The event that is fired when there is a change in {@link TreeView.selection tree view's selection}
	 */
	export interface TreeViewSelectionChangeEvent<T> {

		/**
		 * Selected elements.
		 */
		readonly selection: readonly T[];

	}

	/**
	 * The event that is fired when there is a change in {@link TreeView.visible tree view's visibility}
	 */
	export interface TreeViewVisibilityChangeEvent {

		/**
		 * `true` if the {@link TreeView tree view} is visible otherwise `false`.
		 */
		readonly visible: boolean;
	}

	/**
	 * A file associated with a {@linkcode DataTransferItem}.
	 *
	 * Instances of this type can only be created by the editor and not by extensions.
	 */
	export interface DataTransferFile {
		/**
		 * The name of the file.
		 */
		readonly name: string;

		/**
		 * The full file path of the file.
		 *
		 * May be `undefined` on web.
		 */
		readonly uri?: Uri;

		/**
		 * The full file contents of the file.
		 */
		data(): Thenable<Uint8Array>;
	}

	/**
	 * Encapsulates data transferred during drag and drop operations.
	 */
	export class DataTransferItem {
		/**
		 * Get a string representation of this item.
		 *
		 * If {@linkcode DataTransferItem.value} is an object, this returns the result of json stringifying {@linkcode DataTransferItem.value} value.
		 */
		asString(): Thenable<string>;

		/**
		 * Try getting the {@link DataTransferFile file} associated with this data transfer item.
		 *
		 * Note that the file object is only valid for the scope of the drag and drop operation.
		 *
		 * @returns The file for the data transfer or `undefined` if the item is either not a file or the
		 * file data cannot be accessed.
		 */
		asFile(): DataTransferFile | undefined;

		/**
		 * Custom data stored on this item.
		 *
		 * You can use `value` to share data across operations. The original object can be retrieved so long as the extension that
		 * created the `DataTransferItem` runs in the same extension host.
		 */
		readonly value: any;

		/**
		 * @param value Custom data stored on this item. Can be retrieved using {@linkcode DataTransferItem.value}.
		 */
		constructor(value: any);
	}

	/**
	 * A map containing a mapping of the mime type of the corresponding transferred data.
	 *
	 * Drag and drop controllers that implement {@link TreeDragAndDropController.handleDrag `handleDrag`} can add additional mime types to the
	 * data transfer. These additional mime types will only be included in the `handleDrop` when the drag was initiated from
	 * an element in the same drag and drop controller.
	 */
	export class DataTransfer implements Iterable<[mimeType: string, item: DataTransferItem]> {
		/**
		 * Retrieves the data transfer item for a given mime type.
		 *
		 * @param mimeType The mime type to get the data transfer item for, such as `text/plain` or `image/png`.
		 * Mimes type look ups are case-insensitive.
		 *
		 * Special mime types:
		 * - `text/uri-list` — A string with `toString()`ed Uris separated by `\r\n`. To specify a cursor position in the file,
		 * set the Uri's fragment to `L3,5`, where 3 is the line number and 5 is the column number.
		 */
		get(mimeType: string): DataTransferItem | undefined;

		/**
		 * Sets a mime type to data transfer item mapping.
		 *
		 * @param mimeType The mime type to set the data for. Mimes types stored in lower case, with case-insensitive looks up.
		 * @param value The data transfer item for the given mime type.
		 */
		set(mimeType: string, value: DataTransferItem): void;

		/**
		 * Allows iteration through the data transfer items.
		 *
		 * @param callbackfn Callback for iteration through the data transfer items.
		 * @param thisArg The `this` context used when invoking the handler function.
		 */
		forEach(callbackfn: (item: DataTransferItem, mimeType: string, dataTransfer: DataTransfer) => void, thisArg?: any): void;

		/**
		 * Get a new iterator with the `[mime, item]` pairs for each element in this data transfer.
		 */
		[Symbol.iterator](): IterableIterator<[mimeType: string, item: DataTransferItem]>;
	}

	/**
	 * Provides support for drag and drop in `TreeView`.
	 */
	export interface TreeDragAndDropController<T> {

		/**
		 * The mime types that the {@link TreeDragAndDropController.handleDrop `handleDrop`} method of this `DragAndDropController` supports.
		 * This could be well-defined, existing, mime types, and also mime types defined by the extension.
		 *
		 * To support drops from trees, you will need to add the mime type of that tree.
		 * This includes drops from within the same tree.
		 * The mime type of a tree is recommended to be of the format `application/vnd.code.tree.<treeidlowercase>`.
		 *
		 * Use the special `files` mime type to support all types of dropped files {@link DataTransferFile files}, regardless of the file's actual mime type.
		 *
		 * To learn the mime type of a dragged item:
		 * 1. Set up your `DragAndDropController`
		 * 2. Use the Developer: Set Log Level... command to set the level to "Debug"
		 * 3. Open the developer tools and drag the item with unknown mime type over your tree. The mime types will be logged to the developer console
		 *
		 * Note that mime types that cannot be sent to the extension will be omitted.
		 */
		readonly dropMimeTypes: readonly string[];

		/**
		 * The mime types that the {@link TreeDragAndDropController.handleDrag `handleDrag`} method of this `TreeDragAndDropController` may add to the tree data transfer.
		 * This could be well-defined, existing, mime types, and also mime types defined by the extension.
		 *
		 * The recommended mime type of the tree (`application/vnd.code.tree.<treeidlowercase>`) will be automatically added.
		 */
		readonly dragMimeTypes: readonly string[];

		/**
		 * When the user starts dragging items from this `DragAndDropController`, `handleDrag` will be called.
		 * Extensions can use `handleDrag` to add their {@link DataTransferItem `DataTransferItem`} items to the drag and drop.
		 *
		 * Mime types added in `handleDrag` won't be available outside the application.
		 *
		 * When the items are dropped on **another tree item** in **the same tree**, your `DataTransferItem` objects
		 * will be preserved. Use the recommended mime type for the tree (`application/vnd.code.tree.<treeidlowercase>`) to add
		 * tree objects in a data transfer. See the documentation for `DataTransferItem` for how best to take advantage of this.
		 *
		 * To add a data transfer item that can be dragged into the editor, use the application specific mime type "text/uri-list".
		 * The data for "text/uri-list" should be a string with `toString()`ed Uris separated by `\r\n`. To specify a cursor position in the file,
		 * set the Uri's fragment to `L3,5`, where 3 is the line number and 5 is the column number.
		 *
		 * @param source The source items for the drag and drop operation.
		 * @param dataTransfer The data transfer associated with this drag.
		 * @param token A cancellation token indicating that drag has been cancelled.
		 */
		handleDrag?(source: readonly T[], dataTransfer: DataTransfer, token: CancellationToken): Thenable<void> | void;

		/**
		 * Called when a drag and drop action results in a drop on the tree that this `DragAndDropController` belongs to.
		 *
		 * Extensions should fire {@link TreeDataProvider.onDidChangeTreeData onDidChangeTreeData} for any elements that need to be refreshed.
		 *
		 * @param target The target tree element that the drop is occurring on. When undefined, the target is the root.
		 * @param dataTransfer The data transfer items of the source of the drag.
		 * @param token A cancellation token indicating that the drop has been cancelled.
		 */
		handleDrop?(target: T | undefined, dataTransfer: DataTransfer, token: CancellationToken): Thenable<void> | void;
	}

	/**
	 * A badge presenting a value for a view
	 */
	export interface ViewBadge {

		/**
		 * A label to present in tooltip for the badge.
		 */
		readonly tooltip: string;

		/**
		 * The value to present in the badge.
		 */
		readonly value: number;
	}

	/**
	 * An event describing the change in a tree item's checkbox state.
	 */
	export interface TreeCheckboxChangeEvent<T> {
		/**
		 * The items that were checked or unchecked.
		 */
		readonly items: ReadonlyArray<[T, TreeItemCheckboxState]>;
	}

	/**
	 * Represents a Tree view
	 */
	export interface TreeView<T> extends Disposable {

		/**
		 * Event that is fired when an element is expanded
		 */
		readonly onDidExpandElement: Event<TreeViewExpansionEvent<T>>;

		/**
		 * Event that is fired when an element is collapsed
		 */
		readonly onDidCollapseElement: Event<TreeViewExpansionEvent<T>>;

		/**
		 * Currently selected elements.
		 */
		readonly selection: readonly T[];

		/**
		 * Event that is fired when the {@link TreeView.selection selection} has changed
		 */
		readonly onDidChangeSelection: Event<TreeViewSelectionChangeEvent<T>>;

		/**
		 * `true` if the {@link TreeView tree view} is visible otherwise `false`.
		 */
		readonly visible: boolean;

		/**
		 * Event that is fired when {@link TreeView.visible visibility} has changed
		 */
		readonly onDidChangeVisibility: Event<TreeViewVisibilityChangeEvent>;

		/**
		 * An event to signal that an element or root has either been checked or unchecked.
		 */
		readonly onDidChangeCheckboxState: Event<TreeCheckboxChangeEvent<T>>;

		/**
		 * An optional human-readable message that will be rendered in the view.
		 * Setting the message to null, undefined, or empty string will remove the message from the view.
		 */
		message?: string;

		/**
		 * The tree view title is initially taken from the extension package.json
		 * Changes to the title property will be properly reflected in the UI in the title of the view.
		 */
		title?: string;

		/**
		 * An optional human-readable description which is rendered less prominently in the title of the view.
		 * Setting the title description to null, undefined, or empty string will remove the description from the view.
		 */
		description?: string;

		/**
		 * The badge to display for this TreeView.
		 * To remove the badge, set to undefined.
		 */
		badge?: ViewBadge | undefined;

		/**
		 * Reveals the given element in the tree view.
		 * If the tree view is not visible then the tree view is shown and element is revealed.
		 *
		 * By default revealed element is selected.
		 * In order to not to select, set the option `select` to `false`.
		 * In order to focus, set the option `focus` to `true`.
		 * In order to expand the revealed element, set the option `expand` to `true`. To expand recursively set `expand` to the number of levels to expand.
		 *
		 * * *NOTE:* You can expand only to 3 levels maximum.
		 * * *NOTE:* The {@link TreeDataProvider} that the `TreeView` {@link window.createTreeView is registered with} with must implement {@link TreeDataProvider.getParent getParent} method to access this API.
		 */
		reveal(element: T, options?: {
			/**
			 * If true, then the element will be selected.
			 */
			readonly select?: boolean;
			/**
			 * If true, then the element will be focused.
			 */
			readonly focus?: boolean;
			/**
			 * If true, then the element will be expanded. If a number is passed, then up to that number of levels of children will be expanded
			 */
			readonly expand?: boolean | number;
		}): Thenable<void>;
	}

	/**
	 * A data provider that provides tree data
	 */
	export interface TreeDataProvider<T> {
		/**
		 * An optional event to signal that an element or root has changed.
		 * This will trigger the view to update the changed element/root and its children recursively (if shown).
		 * To signal that root has changed, do not pass any argument or pass `undefined` or `null`.
		 */
		onDidChangeTreeData?: Event<T | T[] | undefined | null | void>;

		/**
		 * Get {@link TreeItem} representation of the `element`
		 *
		 * @param element The element for which {@link TreeItem} representation is asked for.
		 * @returns TreeItem representation of the element.
		 */
		getTreeItem(element: T): TreeItem | Thenable<TreeItem>;

		/**
		 * Get the children of `element` or root if no element is passed.
		 *
		 * @param element The element from which the provider gets children. Can be `undefined`.
		 * @returns Children of `element` or root if no element is passed.
		 */
		getChildren(element?: T): ProviderResult<T[]>;

		/**
		 * Optional method to return the parent of `element`.
		 * Return `null` or `undefined` if `element` is a child of root.
		 *
		 * **NOTE:** This method should be implemented in order to access {@link TreeView.reveal reveal} API.
		 *
		 * @param element The element for which the parent has to be returned.
		 * @returns Parent of `element`.
		 */
		getParent?(element: T): ProviderResult<T>;

		/**
		 * Called on hover to resolve the {@link TreeItem.tooltip TreeItem} property if it is undefined.
		 * Called on tree item click/open to resolve the {@link TreeItem.command TreeItem} property if it is undefined.
		 * Only properties that were undefined can be resolved in `resolveTreeItem`.
		 * Functionality may be expanded later to include being called to resolve other missing
		 * properties on selection and/or on open.
		 *
		 * Will only ever be called once per TreeItem.
		 *
		 * onDidChangeTreeData should not be triggered from within resolveTreeItem.
		 *
		 * *Note* that this function is called when tree items are already showing in the UI.
		 * Because of that, no property that changes the presentation (label, description, etc.)
		 * can be changed.
		 *
		 * @param item Undefined properties of `item` should be set then `item` should be returned.
		 * @param element The object associated with the TreeItem.
		 * @param token A cancellation token.
		 * @returns The resolved tree item or a thenable that resolves to such. It is OK to return the given
		 * `item`. When no result is returned, the given `item` will be used.
		 */
		resolveTreeItem?(item: TreeItem, element: T, token: CancellationToken): ProviderResult<TreeItem>;
	}

	/**
	 * A tree item is an UI element of the tree. Tree items are created by the {@link TreeDataProvider data provider}.
	 */
	export class TreeItem {
		/**
		 * A human-readable string describing this item. When `falsy`, it is derived from {@link TreeItem.resourceUri resourceUri}.
		 */
		label?: string | TreeItemLabel;

		/**
		 * Optional id for the tree item that has to be unique across tree. The id is used to preserve the selection and expansion state of the tree item.
		 *
		 * If not provided, an id is generated using the tree item's label. **Note** that when labels change, ids will change and that selection and expansion state cannot be kept stable anymore.
		 */
		id?: string;

		/**
		 * The icon path or {@link ThemeIcon} for the tree item.
		 * When `falsy`, {@link ThemeIcon.Folder Folder Theme Icon} is assigned, if item is collapsible otherwise {@link ThemeIcon.File File Theme Icon}.
		 * When a file or folder {@link ThemeIcon} is specified, icon is derived from the current file icon theme for the specified theme icon using {@link TreeItem.resourceUri resourceUri} (if provided).
		 */
		iconPath?: string | IconPath;

		/**
		 * A human-readable string which is rendered less prominent.
		 * When `true`, it is derived from {@link TreeItem.resourceUri resourceUri} and when `falsy`, it is not shown.
		 */
		description?: string | boolean;

		/**
		 * The {@link Uri} of the resource representing this item.
		 *
		 * Will be used to derive the {@link TreeItem.label label}, when it is not provided.
		 * Will be used to derive the icon from current file icon theme, when {@link TreeItem.iconPath iconPath} has {@link ThemeIcon} value.
		 */
		resourceUri?: Uri;

		/**
		 * The tooltip text when you hover over this item.
		 */
		tooltip?: string | MarkdownString | undefined;

		/**
		 * The {@link Command} that should be executed when the tree item is selected.
		 *
		 * Please use `vscode.open` or `vscode.diff` as command IDs when the tree item is opening
		 * something in the editor. Using these commands ensures that the resulting editor will
		 * appear consistent with how other built-in trees open editors.
		 */
		command?: Command;

		/**
		 * {@link TreeItemCollapsibleState} of the tree item.
		 */
		collapsibleState?: TreeItemCollapsibleState;

		/**
		 * Context value of the tree item. This can be used to contribute item specific actions in the tree.
		 * For example, a tree item is given a context value as `folder`. When contributing actions to `view/item/context`
		 * using `menus` extension point, you can specify context value for key `viewItem` in `when` expression like `viewItem == folder`.
		 * ```json
		 * "contributes": {
		 *   "menus": {
		 *     "view/item/context": [
		 *       {
		 *         "command": "extension.deleteFolder",
		 *         "when": "viewItem == folder"
		 *       }
		 *     ]
		 *   }
		 * }
		 * ```
		 * This will show action `extension.deleteFolder` only for items with `contextValue` is `folder`.
		 */
		contextValue?: string;

		/**
		 * Accessibility information used when screen reader interacts with this tree item.
		 * Generally, a TreeItem has no need to set the `role` of the accessibilityInformation;
		 * however, there are cases where a TreeItem is not displayed in a tree-like way where setting the `role` may make sense.
		 */
		accessibilityInformation?: AccessibilityInformation;

		/**
		 * {@link TreeItemCheckboxState TreeItemCheckboxState} of the tree item.
		 * {@link TreeDataProvider.onDidChangeTreeData onDidChangeTreeData} should be fired when {@link TreeItem.checkboxState checkboxState} changes.
		 */
		checkboxState?: TreeItemCheckboxState | {
			/**
			 * The {@link TreeItemCheckboxState} of the tree item
			 */
			readonly state: TreeItemCheckboxState;
			/**
			 * A tooltip for the checkbox
			 */
			readonly tooltip?: string;
			/**
			 * Accessibility information used when screen readers interact with this checkbox
			 */
			readonly accessibilityInformation?: AccessibilityInformation;
		};

		/**
		 * @param label A human-readable string describing this item
		 * @param collapsibleState {@link TreeItemCollapsibleState} of the tree item. Default is {@link TreeItemCollapsibleState.None}
		 */
		constructor(label: string | TreeItemLabel, collapsibleState?: TreeItemCollapsibleState);

		/**
		 * @param resourceUri The {@link Uri} of the resource representing this item.
		 * @param collapsibleState {@link TreeItemCollapsibleState} of the tree item. Default is {@link TreeItemCollapsibleState.None}
		 */
		constructor(resourceUri: Uri, collapsibleState?: TreeItemCollapsibleState);
	}

	/**
	 * Collapsible state of the tree item
	 */
	export enum TreeItemCollapsibleState {
		/**
		 * Determines an item can be neither collapsed nor expanded. Implies it has no children.
		 */
		None = 0,
		/**
		 * Determines an item is collapsed
		 */
		Collapsed = 1,
		/**
		 * Determines an item is expanded
		 */
		Expanded = 2
	}

	/**
	 * Label describing the {@link TreeItem Tree item}
	 */
	export interface TreeItemLabel {

		/**
		 * A human-readable string describing the {@link TreeItem Tree item}.
		 */
		label: string;

		/**
		 * Ranges in the label to highlight. A range is defined as a tuple of two number where the
		 * first is the inclusive start index and the second the exclusive end index
		 */
		highlights?: [number, number][];
	}

	/**
	 * Checkbox state of the tree item
	 */
	export enum TreeItemCheckboxState {
		/**
		 * Determines an item is unchecked
		 */
		Unchecked = 0,
		/**
		 * Determines an item is checked
		 */
		Checked = 1
	}

	/**
	 * Value-object describing what options a terminal should use.
	 */
	export interface TerminalOptions {
		/**
		 * A human-readable string which will be used to represent the terminal in the UI.
		 */
		name?: string;

		/**
		 * A path to a custom shell executable to be used in the terminal.
		 */
		shellPath?: string;

		/**
		 * Args for the custom shell executable. A string can be used on Windows only which allows
		 * specifying shell args in [command-line format](https://msdn.microsoft.com/en-au/08dfcab2-eb6e-49a4-80eb-87d4076c98c6).
		 */
		shellArgs?: string[] | string;

		/**
		 * A path or Uri for the current working directory to be used for the terminal.
		 */
		cwd?: string | Uri;

		/**
		 * Object with environment variables that will be added to the editor process.
		 */
		env?: { [key: string]: string | null | undefined };

		/**
		 * Whether the terminal process environment should be exactly as provided in
		 * `TerminalOptions.env`. When this is false (default), the environment will be based on the
		 * window's environment and also apply configured platform settings like
		 * `terminal.integrated.env.windows` on top. When this is true, the complete environment
		 * must be provided as nothing will be inherited from the process or any configuration.
		 */
		strictEnv?: boolean;

		/**
		 * When enabled the terminal will run the process as normal but not be surfaced to the user
		 * until `Terminal.show` is called. The typical usage for this is when you need to run
		 * something that may need interactivity but only want to tell the user about it when
		 * interaction is needed. Note that the terminals will still be exposed to all extensions
		 * as normal. The hidden terminals will not be restored when the workspace is next opened.
		 */
		hideFromUser?: boolean;

		/**
		 * A message to write to the terminal on first launch, note that this is not sent to the
		 * process but, rather written directly to the terminal. This supports escape sequences such
		 * a setting text style.
		 */
		message?: string;

		/**
		 * The icon path or {@link ThemeIcon} for the terminal.
		 */
		iconPath?: IconPath;

		/**
		 * The icon {@link ThemeColor} for the terminal.
		 * The `terminal.ansi*` theme keys are
		 * recommended for the best contrast and consistency across themes.
		 */
		color?: ThemeColor;

		/**
		 * The {@link TerminalLocation} or {@link TerminalEditorLocationOptions} or {@link TerminalSplitLocationOptions} for the terminal.
		 */
		location?: TerminalLocation | TerminalEditorLocationOptions | TerminalSplitLocationOptions;

		/**
		 * Opt-out of the default terminal persistence on restart and reload.
		 * This will only take effect when `terminal.integrated.enablePersistentSessions` is enabled.
		 */
		isTransient?: boolean;

		/**
		 * The nonce to use to verify shell integration sequences are coming from a trusted source.
		 * An example impact of UX of this is if the command line is reported with a nonce, it will
		 * not need to verify with the user that the command line is correct before rerunning it
		 * via the [shell integration command decoration](https://code.visualstudio.com/docs/terminal/shell-integration#_command-decorations-and-the-overview-ruler).
		 *
		 * This should be used if the terminal includes [custom shell integration support](https://code.visualstudio.com/docs/terminal/shell-integration#_supported-escape-sequences).
		 * It should be set to a random GUID which will then set the `VSCODE_NONCE` environment
		 * variable. Inside the shell, this should then be removed from the environment so as to
		 * protect it from general access. Once that is done it can be passed through in the
		 * relevant sequences to make them trusted.
		 */
		shellIntegrationNonce?: string;
	}

	/**
	 * Value-object describing what options a virtual process terminal should use.
	 */
	export interface ExtensionTerminalOptions {
		/**
		 * A human-readable string which will be used to represent the terminal in the UI.
		 */
		name: string;

		/**
		 * An implementation of {@link Pseudoterminal} that allows an extension to
		 * control a terminal.
		 */
		pty: Pseudoterminal;

		/**
		 * The icon path or {@link ThemeIcon} for the terminal.
		 */
		iconPath?: IconPath;

		/**
		 * The icon {@link ThemeColor} for the terminal.
		 * The standard `terminal.ansi*` theme keys are
		 * recommended for the best contrast and consistency across themes.
		 */
		color?: ThemeColor;

		/**
		 * The {@link TerminalLocation} or {@link TerminalEditorLocationOptions} or {@link TerminalSplitLocationOptions} for the terminal.
		 */
		location?: TerminalLocation | TerminalEditorLocationOptions | TerminalSplitLocationOptions;

		/**
		 * Opt-out of the default terminal persistence on restart and reload.
		 * This will only take effect when `terminal.integrated.enablePersistentSessions` is enabled.
		 */
		isTransient?: boolean;

		/**
		 * The nonce to use to verify shell integration sequences are coming from a trusted source.
		 * An example impact of UX of this is if the command line is reported with a nonce, it will
		 * not need to verify with the user that the command line is correct before rerunning it
		 * via the [shell integration command decoration](https://code.visualstudio.com/docs/terminal/shell-integration#_command-decorations-and-the-overview-ruler).
		 *
		 * This should be used if the terminal includes [custom shell integration support](https://code.visualstudio.com/docs/terminal/shell-integration#_supported-escape-sequences).
		 * It should be set to a random GUID. Inside the {@link Pseudoterminal} implementation, this value
		 * can be passed through in the relevant sequences to make them trusted.
		 */
		shellIntegrationNonce?: string;
	}

	/**
	 * Defines the interface of a terminal pty, enabling extensions to control a terminal.
	 */
	export interface Pseudoterminal {
		/**
		 * An event that when fired will write data to the terminal. Unlike
		 * {@link Terminal.sendText} which sends text to the underlying child
		 * pseudo-device (the child), this will write the text to parent pseudo-device (the
		 * _terminal_ itself).
		 *
		 * Note writing `\n` will just move the cursor down 1 row, you need to write `\r` as well
		 * to move the cursor to the left-most cell.
		 *
		 * Events fired before {@link Pseudoterminal.open} is called will be be ignored.
		 *
		 * **Example:** Write red text to the terminal
		 * ```typescript
		 * const writeEmitter = new vscode.EventEmitter<string>();
		 * const pty: vscode.Pseudoterminal = {
		 *   onDidWrite: writeEmitter.event,
		 *   open: () => writeEmitter.fire('\x1b[31mHello world\x1b[0m'),
		 *   close: () => {}
		 * };
		 * vscode.window.createTerminal({ name: 'My terminal', pty });
		 * ```
		 *
		 * **Example:** Move the cursor to the 10th row and 20th column and write an asterisk
		 * ```typescript
		 * writeEmitter.fire('\x1b[10;20H*');
		 * ```
		 */
		onDidWrite: Event<string>;

		/**
		 * An event that when fired allows overriding the {@link Pseudoterminal.setDimensions dimensions} of the
		 * terminal. Note that when set, the overridden dimensions will only take effect when they
		 * are lower than the actual dimensions of the terminal (ie. there will never be a scroll
		 * bar). Set to `undefined` for the terminal to go back to the regular dimensions (fit to
		 * the size of the panel).
		 *
		 * Events fired before {@link Pseudoterminal.open} is called will be be ignored.
		 *
		 * **Example:** Override the dimensions of a terminal to 20 columns and 10 rows
		 * ```typescript
		 * const dimensionsEmitter = new vscode.EventEmitter<vscode.TerminalDimensions>();
		 * const pty: vscode.Pseudoterminal = {
		 *   onDidWrite: writeEmitter.event,
		 *   onDidOverrideDimensions: dimensionsEmitter.event,
		 *   open: () => {
		 *     dimensionsEmitter.fire({
		 *       columns: 20,
		 *       rows: 10
		 *     });
		 *   },
		 *   close: () => {}
		 * };
		 * vscode.window.createTerminal({ name: 'My terminal', pty });
		 * ```
		 */
		onDidOverrideDimensions?: Event<TerminalDimensions | undefined>;

		/**
		 * An event that when fired will signal that the pty is closed and dispose of the terminal.
		 *
		 * Events fired before {@link Pseudoterminal.open} is called will be be ignored.
		 *
		 * A number can be used to provide an exit code for the terminal. Exit codes must be
		 * positive and a non-zero exit codes signals failure which shows a notification for a
		 * regular terminal and allows dependent tasks to proceed when used with the
		 * `CustomExecution` API.
		 *
		 * **Example:** Exit the terminal when "y" is pressed, otherwise show a notification.
		 * ```typescript
		 * const writeEmitter = new vscode.EventEmitter<string>();
		 * const closeEmitter = new vscode.EventEmitter<void>();
		 * const pty: vscode.Pseudoterminal = {
		 *   onDidWrite: writeEmitter.event,
		 *   onDidClose: closeEmitter.event,
		 *   open: () => writeEmitter.fire('Press y to exit successfully'),
		 *   close: () => {},
		 *   handleInput: data => {
		 *     if (data !== 'y') {
		 *       vscode.window.showInformationMessage('Something went wrong');
		 *     }
		 *     closeEmitter.fire();
		 *   }
		 * };
		 * const terminal = vscode.window.createTerminal({ name: 'Exit example', pty });
		 * terminal.show(true);
		 * ```
		 */
		onDidClose?: Event<void | number>;

		/**
		 * An event that when fired allows changing the name of the terminal.
		 *
		 * Events fired before {@link Pseudoterminal.open} is called will be be ignored.
		 *
		 * **Example:** Change the terminal name to "My new terminal".
		 * ```typescript
		 * const writeEmitter = new vscode.EventEmitter<string>();
		 * const changeNameEmitter = new vscode.EventEmitter<string>();
		 * const pty: vscode.Pseudoterminal = {
		 *   onDidWrite: writeEmitter.event,
		 *   onDidChangeName: changeNameEmitter.event,
		 *   open: () => changeNameEmitter.fire('My new terminal'),
		 *   close: () => {}
		 * };
		 * vscode.window.createTerminal({ name: 'My terminal', pty });
		 * ```
		 */
		onDidChangeName?: Event<string>;

		/**
		 * Implement to handle when the pty is open and ready to start firing events.
		 *
		 * @param initialDimensions The dimensions of the terminal, this will be undefined if the
		 * terminal panel has not been opened before this is called.
		 */
		open(initialDimensions: TerminalDimensions | undefined): void;

		/**
		 * Implement to handle when the terminal is closed by an act of the user.
		 */
		close(): void;

		/**
		 * Implement to handle incoming keystrokes in the terminal or when an extension calls
		 * {@link Terminal.sendText}. `data` contains the keystrokes/text serialized into
		 * their corresponding VT sequence representation.
		 *
		 * @param data The incoming data.
		 *
		 * **Example:** Echo input in the terminal. The sequence for enter (`\r`) is translated to
		 * CRLF to go to a new line and move the cursor to the start of the line.
		 * ```typescript
		 * const writeEmitter = new vscode.EventEmitter<string>();
		 * const pty: vscode.Pseudoterminal = {
		 *   onDidWrite: writeEmitter.event,
		 *   open: () => {},
		 *   close: () => {},
		 *   handleInput: data => writeEmitter.fire(data === '\r' ? '\r\n' : data)
		 * };
		 * vscode.window.createTerminal({ name: 'Local echo', pty });
		 * ```
		 */
		handleInput?(data: string): void;

		/**
		 * Implement to handle when the number of rows and columns that fit into the terminal panel
		 * changes, for example when font size changes or when the panel is resized. The initial
		 * state of a terminal's dimensions should be treated as `undefined` until this is triggered
		 * as the size of a terminal isn't known until it shows up in the user interface.
		 *
		 * When dimensions are overridden by
		 * {@link Pseudoterminal.onDidOverrideDimensions onDidOverrideDimensions}, `setDimensions` will
		 * continue to be called with the regular panel dimensions, allowing the extension continue
		 * to react dimension changes.
		 *
		 * @param dimensions The new dimensions.
		 */
		setDimensions?(dimensions: TerminalDimensions): void;
	}

	/**
	 * Represents the dimensions of a terminal.
	 */
	export interface TerminalDimensions {
		/**
		 * The number of columns in the terminal.
		 */
		readonly columns: number;

		/**
		 * The number of rows in the terminal.
		 */
		readonly rows: number;
	}

	/**
	 * Represents how a terminal exited.
	 */
	export interface TerminalExitStatus {
		/**
		 * The exit code that a terminal exited with, it can have the following values:
		 * - Zero: the terminal process or custom execution succeeded.
		 * - Non-zero: the terminal process or custom execution failed.
		 * - `undefined`: the user forcibly closed the terminal or a custom execution exited
		 *   without providing an exit code.
		 */
		readonly code: number | undefined;

		/**
		 * The reason that triggered the exit of a terminal.
		 */
		readonly reason: TerminalExitReason;
	}

	/**
	 * Terminal exit reason kind.
	 */
	export enum TerminalExitReason {
		/**
		 * Unknown reason.
		 */
		Unknown = 0,

		/**
		 * The window closed/reloaded.
		 */
		Shutdown = 1,

		/**
		 * The shell process exited.
		 */
		Process = 2,

		/**
		 * The user closed the terminal.
		 */
		User = 3,

		/**
		 * An extension disposed the terminal.
		 */
		Extension = 4,
	}

	/**
	 * A type of mutation that can be applied to an environment variable.
	 */
	export enum EnvironmentVariableMutatorType {
		/**
		 * Replace the variable's existing value.
		 */
		Replace = 1,
		/**
		 * Append to the end of the variable's existing value.
		 */
		Append = 2,
		/**
		 * Prepend to the start of the variable's existing value.
		 */
		Prepend = 3
	}

	/**
	 * Options applied to the mutator.
	 */
	export interface EnvironmentVariableMutatorOptions {
		/**
		 * Apply to the environment just before the process is created. Defaults to false.
		 */
		applyAtProcessCreation?: boolean;

		/**
		 * Apply to the environment in the shell integration script. Note that this _will not_ apply
		 * the mutator if shell integration is disabled or not working for some reason. Defaults to
		 * false.
		 */
		applyAtShellIntegration?: boolean;
	}

	/**
	 * A type of mutation and its value to be applied to an environment variable.
	 */
	export interface EnvironmentVariableMutator {
		/**
		 * The type of mutation that will occur to the variable.
		 */
		readonly type: EnvironmentVariableMutatorType;

		/**
		 * The value to use for the variable.
		 */
		readonly value: string;

		/**
		 * Options applied to the mutator.
		 */
		readonly options: EnvironmentVariableMutatorOptions;
	}

	/**
	 * A collection of mutations that an extension can apply to a process environment.
	 */
	export interface EnvironmentVariableCollection extends Iterable<[variable: string, mutator: EnvironmentVariableMutator]> {
		/**
		 * Whether the collection should be cached for the workspace and applied to the terminal
		 * across window reloads. When true the collection will be active immediately such when the
		 * window reloads. Additionally, this API will return the cached version if it exists. The
		 * collection will be invalidated when the extension is uninstalled or when the collection
		 * is cleared. Defaults to true.
		 */
		persistent: boolean;

		/**
		 * A description for the environment variable collection, this will be used to describe the
		 * changes in the UI.
		 */
		description: string | MarkdownString | undefined;

		/**
		 * Replace an environment variable with a value.
		 *
		 * Note that an extension can only make a single change to any one variable, so this will
		 * overwrite any previous calls to replace, append or prepend.
		 *
		 * @param variable The variable to replace.
		 * @param value The value to replace the variable with.
		 * @param options Options applied to the mutator, when no options are provided this will
		 * default to `{ applyAtProcessCreation: true }`.
		 */
		replace(variable: string, value: string, options?: EnvironmentVariableMutatorOptions): void;

		/**
		 * Append a value to an environment variable.
		 *
		 * Note that an extension can only make a single change to any one variable, so this will
		 * overwrite any previous calls to replace, append or prepend.
		 *
		 * @param variable The variable to append to.
		 * @param value The value to append to the variable.
		 * @param options Options applied to the mutator, when no options are provided this will
		 * default to `{ applyAtProcessCreation: true }`.
		 */
		append(variable: string, value: string, options?: EnvironmentVariableMutatorOptions): void;

		/**
		 * Prepend a value to an environment variable.
		 *
		 * Note that an extension can only make a single change to any one variable, so this will
		 * overwrite any previous calls to replace, append or prepend.
		 *
		 * @param variable The variable to prepend.
		 * @param value The value to prepend to the variable.
		 * @param options Options applied to the mutator, when no options are provided this will
		 * default to `{ applyAtProcessCreation: true }`.
		 */
		prepend(variable: string, value: string, options?: EnvironmentVariableMutatorOptions): void;

		/**
		 * Gets the mutator that this collection applies to a variable, if any.
		 *
		 * @param variable The variable to get the mutator for.
		 */
		get(variable: string): EnvironmentVariableMutator | undefined;

		/**
		 * Iterate over each mutator in this collection.
		 *
		 * @param callback Function to execute for each entry.
		 * @param thisArg The `this` context used when invoking the handler function.
		 */
		forEach(callback: (variable: string, mutator: EnvironmentVariableMutator, collection: EnvironmentVariableCollection) => any, thisArg?: any): void;

		/**
		 * Deletes this collection's mutator for a variable.
		 *
		 * @param variable The variable to delete the mutator for.
		 */
		delete(variable: string): void;

		/**
		 * Clears all mutators from this collection.
		 */
		clear(): void;
	}

	/**
	 * A collection of mutations that an extension can apply to a process environment. Applies to all scopes.
	 */
	export interface GlobalEnvironmentVariableCollection extends EnvironmentVariableCollection {
		/**
		 * Gets scope-specific environment variable collection for the extension. This enables alterations to
		 * terminal environment variables solely within the designated scope, and is applied in addition to (and
		 * after) the global collection.
		 *
		 * Each object obtained through this method is isolated and does not impact objects for other scopes,
		 * including the global collection.
		 *
		 * @param scope The scope to which the environment variable collection applies to.
		 *
		 * If a scope parameter is omitted, collection applicable to all relevant scopes for that parameter is
		 * returned. For instance, if the 'workspaceFolder' parameter is not specified, the collection that applies
		 * across all workspace folders will be returned.
		 *
		 * @returns Environment variable collection for the passed in scope.
		 */
		getScoped(scope: EnvironmentVariableScope): EnvironmentVariableCollection;
	}

	/**
	 * The scope object to which the environment variable collection applies.
	 */
	export interface EnvironmentVariableScope {
		/**
		 * Any specific workspace folder to get collection for.
		 */
		workspaceFolder?: WorkspaceFolder;
	}

	/**
	 * A location in the editor at which progress information can be shown. It depends on the
	 * location how progress is visually represented.
	 */
	export enum ProgressLocation {

		/**
		 * Show progress for the source control viewlet, as overlay for the icon and as progress bar
		 * inside the viewlet (when visible). Neither supports cancellation nor discrete progress nor
		 * a label to describe the operation.
		 */
		SourceControl = 1,

		/**
		 * Show progress in the status bar of the editor. Neither supports cancellation nor discrete progress.
		 * Supports rendering of {@link ThemeIcon theme icons} via the `$(<name>)`-syntax in the progress label.
		 */
		Window = 10,

		/**
		 * Show progress as notification with an optional cancel button. Supports to show infinite and discrete
		 * progress but does not support rendering of icons.
		 */
		Notification = 15
	}

	/**
	 * Value-object describing where and how progress should show.
	 */
	export interface ProgressOptions {

		/**
		 * The location at which progress should show.
		 */
		location: ProgressLocation | {
			/**
			 * The identifier of a view for which progress should be shown.
			 */
			viewId: string;
		};

		/**
		 * A human-readable string which will be used to describe the
		 * operation.
		 */
		title?: string;

		/**
		 * Controls if a cancel button should show to allow the user to
		 * cancel the long running operation.  Note that currently only
		 * `ProgressLocation.Notification` is supporting to show a cancel
		 * button.
		 */
		cancellable?: boolean;
	}

	/**
	 * A light-weight user input UI that is initially not visible. After
	 * configuring it through its properties the extension can make it
	 * visible by calling {@link QuickInput.show}.
	 *
	 * There are several reasons why this UI might have to be hidden and
	 * the extension will be notified through {@link QuickInput.onDidHide}.
	 * (Examples include: an explicit call to {@link QuickInput.hide},
	 * the user pressing Esc, some other input UI opening, etc.)
	 *
	 * A user pressing Enter or some other gesture implying acceptance
	 * of the current state does not automatically hide this UI component.
	 * It is up to the extension to decide whether to accept the user's input
	 * and if the UI should indeed be hidden through a call to {@link QuickInput.hide}.
	 *
	 * When the extension no longer needs this input UI, it should
	 * {@link QuickInput.dispose} it to allow for freeing up
	 * any resources associated with it.
	 *
	 * See {@link QuickPick} and {@link InputBox} for concrete UIs.
	 */
	export interface QuickInput {

		/**
		 * An optional title.
		 */
		title: string | undefined;

		/**
		 * An optional current step count.
		 */
		step: number | undefined;

		/**
		 * An optional total step count.
		 */
		totalSteps: number | undefined;

		/**
		 * If the UI should allow for user input. Defaults to true.
		 *
		 * Change this to false, e.g., while validating user input or
		 * loading data for the next step in user input.
		 */
		enabled: boolean;

		/**
		 * If the UI should show a progress indicator. Defaults to false.
		 *
		 * Change this to true, e.g., while loading more data or validating
		 * user input.
		 */
		busy: boolean;

		/**
		 * If the UI should stay open even when loosing UI focus. Defaults to false.
		 * This setting is ignored on iPad and is always false.
		 */
		ignoreFocusOut: boolean;

		/**
		 * Makes the input UI visible in its current configuration. Any other input
		 * UI will first fire an {@link QuickInput.onDidHide} event.
		 */
		show(): void;

		/**
		 * Hides this input UI. This will also fire an {@link QuickInput.onDidHide}
		 * event.
		 */
		hide(): void;

		/**
		 * An event signaling when this input UI is hidden.
		 *
		 * There are several reasons why this UI might have to be hidden and
		 * the extension will be notified through {@link QuickInput.onDidHide}.
		 * (Examples include: an explicit call to {@link QuickInput.hide},
		 * the user pressing Esc, some other input UI opening, etc.)
		 */
		onDidHide: Event<void>;

		/**
		 * Dispose of this input UI and any associated resources. If it is still
		 * visible, it is first hidden. After this call the input UI is no longer
		 * functional and no additional methods or properties on it should be
		 * accessed. Instead a new input UI should be created.
		 */
		dispose(): void;
	}

	/**
	 * A concrete {@link QuickInput} to let the user pick an item from a
	 * list of items of type T. The items can be filtered through a filter text field and
	 * there is an option {@link QuickPick.canSelectMany canSelectMany} to allow for
	 * selecting multiple items.
	 *
	 * Note that in many cases the more convenient {@link window.showQuickPick}
	 * is easier to use. {@link window.createQuickPick} should be used
	 * when {@link window.showQuickPick} does not offer the required flexibility.
	 */
	export interface QuickPick<T extends QuickPickItem> extends QuickInput {

		/**
		 * Current value of the filter text.
		 */
		value: string;

		/**
		 * Optional placeholder shown in the filter textbox when no filter has been entered.
		 */
		placeholder: string | undefined;

		/**
		 * An event signaling when the value of the filter text has changed.
		 */
		readonly onDidChangeValue: Event<string>;

		/**
		 * An event signaling when the user indicated acceptance of the selected item(s).
		 */
		readonly onDidAccept: Event<void>;

		/**
		 * Buttons for actions in the UI.
		 */
		buttons: readonly QuickInputButton[];

		/**
		 * An event signaling when a top level button (buttons stored in {@link buttons}) was triggered.
		 * This event does not fire for buttons on a {@link QuickPickItem}.
		 */
		readonly onDidTriggerButton: Event<QuickInputButton>;

		/**
		 * An event signaling when a button in a particular {@link QuickPickItem} was triggered.
		 * This event does not fire for buttons in the title bar.
		 */
		readonly onDidTriggerItemButton: Event<QuickPickItemButtonEvent<T>>;

		/**
		 * Items to pick from. This can be read and updated by the extension.
		 */
		items: readonly T[];

		/**
		 * If multiple items can be selected at the same time. Defaults to false.
		 */
		canSelectMany: boolean;

		/**
		 * If the filter text should also be matched against the description of the items. Defaults to false.
		 */
		matchOnDescription: boolean;

		/**
		 * If the filter text should also be matched against the detail of the items. Defaults to false.
		 */
		matchOnDetail: boolean;

		/**
		 * An optional flag to maintain the scroll position of the quick pick when the quick pick items are updated. Defaults to false.
		 */
		keepScrollPosition?: boolean;

		/**
		 * Active items. This can be read and updated by the extension.
		 */
		activeItems: readonly T[];

		/**
		 * An event signaling when the active items have changed.
		 */
		readonly onDidChangeActive: Event<readonly T[]>;

		/**
		 * Selected items. This can be read and updated by the extension.
		 */
		selectedItems: readonly T[];

		/**
		 * An event signaling when the selected items have changed.
		 */
		readonly onDidChangeSelection: Event<readonly T[]>;
	}

	/**
	 * A concrete {@link QuickInput} to let the user input a text value.
	 *
	 * Note that in many cases the more convenient {@link window.showInputBox}
	 * is easier to use. {@link window.createInputBox} should be used
	 * when {@link window.showInputBox} does not offer the required flexibility.
	 */
	export interface InputBox extends QuickInput {

		/**
		 * Current input value.
		 */
		value: string;

		/**
		 * Selection range in the input value. Defined as tuple of two number where the
		 * first is the inclusive start index and the second the exclusive end index. When `undefined` the whole
		 * pre-filled value will be selected, when empty (start equals end) only the cursor will be set,
		 * otherwise the defined range will be selected.
		 *
		 * This property does not get updated when the user types or makes a selection,
		 * but it can be updated by the extension.
		 */
		valueSelection: readonly [number, number] | undefined;

		/**
		 * Optional placeholder shown when no value has been input.
		 */
		placeholder: string | undefined;

		/**
		 * If the input value should be hidden. Defaults to false.
		 */
		password: boolean;

		/**
		 * An event signaling when the value has changed.
		 */
		readonly onDidChangeValue: Event<string>;

		/**
		 * An event signaling when the user indicated acceptance of the input value.
		 */
		readonly onDidAccept: Event<void>;

		/**
		 * Buttons for actions in the UI.
		 */
		buttons: readonly QuickInputButton[];

		/**
		 * An event signaling when a button was triggered.
		 */
		readonly onDidTriggerButton: Event<QuickInputButton>;

		/**
		 * An optional prompt text providing some ask or explanation to the user.
		 */
		prompt: string | undefined;

		/**
		 * An optional validation message indicating a problem with the current input value.
		 * By returning a string, the InputBox will use a default {@link InputBoxValidationSeverity} of Error.
		 * Returning undefined clears the validation message.
		 */
		validationMessage: string | InputBoxValidationMessage | undefined;
	}

	/**
	 * Button for an action in a {@link QuickPick} or {@link InputBox}.
	 */
	export interface QuickInputButton {

		/**
		 * Icon for the button.
		 */
		readonly iconPath: IconPath;
		/**
		 * An optional tooltip.
		 */
		readonly tooltip?: string | undefined;
	}

	/**
	 * Predefined buttons for {@link QuickPick} and {@link InputBox}.
	 */
	export class QuickInputButtons {

		/**
		 * A back button for {@link QuickPick} and {@link InputBox}.
		 *
		 * When a navigation 'back' button is needed this one should be used for consistency.
		 * It comes with a predefined icon, tooltip and location.
		 */
		static readonly Back: QuickInputButton;

		/**
		 * @hidden
		 */
		private constructor();
	}

	/**
	 * An event signaling when a button in a particular {@link QuickPickItem} was triggered.
	 * This event does not fire for buttons in the title bar.
	 */
	export interface QuickPickItemButtonEvent<T extends QuickPickItem> {
		/**
		 * The button that was clicked.
		 */
		readonly button: QuickInputButton;
		/**
		 * The item that the button belongs to.
		 */
		readonly item: T;
	}

	/**
	 * An event describing an individual change in the text of a {@link TextDocument document}.
	 */
	export interface TextDocumentContentChangeEvent {
		/**
		 * The range that got replaced.
		 */
		readonly range: Range;
		/**
		 * The offset of the range that got replaced.
		 */
		readonly rangeOffset: number;
		/**
		 * The length of the range that got replaced.
		 */
		readonly rangeLength: number;
		/**
		 * The new text for the range.
		 */
		readonly text: string;
	}

	/**
	 * Reasons for why a text document has changed.
	 */
	export enum TextDocumentChangeReason {
		/** The text change is caused by an undo operation. */
		Undo = 1,

		/** The text change is caused by an redo operation. */
		Redo = 2,
	}

	/**
	 * An event describing a transactional {@link TextDocument document} change.
	 */
	export interface TextDocumentChangeEvent {

		/**
		 * The affected document.
		 */
		readonly document: TextDocument;

		/**
		 * An array of content changes.
		 */
		readonly contentChanges: readonly TextDocumentContentChangeEvent[];

		/**
		 * The reason why the document was changed.
		 * Is `undefined` if the reason is not known.
		 */
		readonly reason: TextDocumentChangeReason | undefined;
	}

	/**
	 * Represents reasons why a text document is saved.
	 */
	export enum TextDocumentSaveReason {

		/**
		 * Manually triggered, e.g. by the user pressing save, by starting debugging,
		 * or by an API call.
		 */
		Manual = 1,

		/**
		 * Automatic after a delay.
		 */
		AfterDelay = 2,

		/**
		 * When the editor lost focus.
		 */
		FocusOut = 3
	}

	/**
	 * An event that is fired when a {@link TextDocument document} will be saved.
	 *
	 * To make modifications to the document before it is being saved, call the
	 * {@linkcode TextDocumentWillSaveEvent.waitUntil waitUntil}-function with a thenable
	 * that resolves to an array of {@link TextEdit text edits}.
	 */
	export interface TextDocumentWillSaveEvent {

		/**
		 * The document that will be saved.
		 */
		readonly document: TextDocument;

		/**
		 * The reason why save was triggered.
		 */
		readonly reason: TextDocumentSaveReason;

		/**
		 * Allows to pause the event loop and to apply {@link TextEdit pre-save-edits}.
		 * Edits of subsequent calls to this function will be applied in order. The
		 * edits will be *ignored* if concurrent modifications of the document happened.
		 *
		 * *Note:* This function can only be called during event dispatch and not
		 * in an asynchronous manner:
		 *
		 * ```ts
		 * workspace.onWillSaveTextDocument(event => {
		 * 	// async, will *throw* an error
		 * 	setTimeout(() => event.waitUntil(promise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntil(promise);
		 * })
		 * ```
		 *
		 * @param thenable A thenable that resolves to {@link TextEdit pre-save-edits}.
		 */
		waitUntil(thenable: Thenable<readonly TextEdit[]>): void;

		/**
		 * Allows to pause the event loop until the provided thenable resolved.
		 *
		 * *Note:* This function can only be called during event dispatch.
		 *
		 * @param thenable A thenable that delays saving.
		 */
		waitUntil(thenable: Thenable<any>): void;
	}

	/**
	 * An event that is fired when files are going to be created.
	 *
	 * To make modifications to the workspace before the files are created,
	 * call the {@linkcode FileWillCreateEvent.waitUntil waitUntil}-function with a
	 * thenable that resolves to a {@link WorkspaceEdit workspace edit}.
	 */
	export interface FileWillCreateEvent {

		/**
		 * A cancellation token.
		 */
		readonly token: CancellationToken;

		/**
		 * The files that are going to be created.
		 */
		readonly files: readonly Uri[];

		/**
		 * Allows to pause the event and to apply a {@link WorkspaceEdit workspace edit}.
		 *
		 * *Note:* This function can only be called during event dispatch and not
		 * in an asynchronous manner:
		 *
		 * ```ts
		 * workspace.onWillCreateFiles(event => {
		 * 	// async, will *throw* an error
		 * 	setTimeout(() => event.waitUntil(promise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntil(promise);
		 * })
		 * ```
		 *
		 * @param thenable A thenable that delays saving.
		 */
		waitUntil(thenable: Thenable<WorkspaceEdit>): void;

		/**
		 * Allows to pause the event until the provided thenable resolves.
		 *
		 * *Note:* This function can only be called during event dispatch.
		 *
		 * @param thenable A thenable that delays saving.
		 */
		waitUntil(thenable: Thenable<any>): void;
	}

	/**
	 * An event that is fired after files are created.
	 */
	export interface FileCreateEvent {

		/**
		 * The files that got created.
		 */
		readonly files: readonly Uri[];
	}

	/**
	 * An event that is fired when files are going to be deleted.
	 *
	 * To make modifications to the workspace before the files are deleted,
	 * call the {@link FileWillCreateEvent.waitUntil `waitUntil`}-function with a
	 * thenable that resolves to a {@link WorkspaceEdit workspace edit}.
	 */
	export interface FileWillDeleteEvent {

		/**
		 * A cancellation token.
		 */
		readonly token: CancellationToken;

		/**
		 * The files that are going to be deleted.
		 */
		readonly files: readonly Uri[];

		/**
		 * Allows to pause the event and to apply a {@link WorkspaceEdit workspace edit}.
		 *
		 * *Note:* This function can only be called during event dispatch and not
		 * in an asynchronous manner:
		 *
		 * ```ts
		 * workspace.onWillCreateFiles(event => {
		 * 	// async, will *throw* an error
		 * 	setTimeout(() => event.waitUntil(promise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntil(promise);
		 * })
		 * ```
		 *
		 * @param thenable A thenable that delays saving.
		 */
		waitUntil(thenable: Thenable<WorkspaceEdit>): void;

		/**
		 * Allows to pause the event until the provided thenable resolves.
		 *
		 * *Note:* This function can only be called during event dispatch.
		 *
		 * @param thenable A thenable that delays saving.
		 */
		waitUntil(thenable: Thenable<any>): void;
	}

	/**
	 * An event that is fired after files are deleted.
	 */
	export interface FileDeleteEvent {

		/**
		 * The files that got deleted.
		 */
		readonly files: readonly Uri[];
	}

	/**
	 * An event that is fired when files are going to be renamed.
	 *
	 * To make modifications to the workspace before the files are renamed,
	 * call the {@link FileWillCreateEvent.waitUntil `waitUntil`}-function with a
	 * thenable that resolves to a {@link WorkspaceEdit workspace edit}.
	 */
	export interface FileWillRenameEvent {

		/**
		 * A cancellation token.
		 */
		readonly token: CancellationToken;

		/**
		 * The files that are going to be renamed.
		 */
		readonly files: ReadonlyArray<{
			/**
			 * The old uri of a file.
			 */
			readonly oldUri: Uri;
			/**
			 * The new uri of a file.
			 */
			readonly newUri: Uri;
		}>;

		/**
		 * Allows to pause the event and to apply a {@link WorkspaceEdit workspace edit}.
		 *
		 * *Note:* This function can only be called during event dispatch and not
		 * in an asynchronous manner:
		 *
		 * ```ts
		 * workspace.onWillCreateFiles(event => {
		 * 	// async, will *throw* an error
		 * 	setTimeout(() => event.waitUntil(promise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntil(promise);
		 * })
		 * ```
		 *
		 * @param thenable A thenable that delays saving.
		 */
		waitUntil(thenable: Thenable<WorkspaceEdit>): void;

		/**
		 * Allows to pause the event until the provided thenable resolves.
		 *
		 * *Note:* This function can only be called during event dispatch.
		 *
		 * @param thenable A thenable that delays saving.
		 */
		waitUntil(thenable: Thenable<any>): void;
	}

	/**
	 * An event that is fired after files are renamed.
	 */
	export interface FileRenameEvent {

		/**
		 * The files that got renamed.
		 */
		readonly files: ReadonlyArray<{
			/**
			 * The old uri of a file.
			 */
			readonly oldUri: Uri;
			/**
			 * The new uri of a file.
			 */
			readonly newUri: Uri;
		}>;
	}

	/**
	 * An event describing a change to the set of {@link workspace.workspaceFolders workspace folders}.
	 */
	export interface WorkspaceFoldersChangeEvent {
		/**
		 * Added workspace folders.
		 */
		readonly added: readonly WorkspaceFolder[];

		/**
		 * Removed workspace folders.
		 */
		readonly removed: readonly WorkspaceFolder[];
	}

	/**
	 * A workspace folder is one of potentially many roots opened by the editor. All workspace folders
	 * are equal which means there is no notion of an active or primary workspace folder.
	 */
	export interface WorkspaceFolder {

		/**
		 * The associated uri for this workspace folder.
		 *
		 * *Note:* The {@link Uri}-type was intentionally chosen such that future releases of the editor can support
		 * workspace folders that are not stored on the local disk, e.g. `ftp://server/workspaces/foo`.
		 */
		readonly uri: Uri;

		/**
		 * The name of this workspace folder. Defaults to
		 * the basename of its {@link Uri.path uri-path}
		 */
		readonly name: string;

		/**
		 * The ordinal number of this workspace folder.
		 */
		readonly index: number;
	}

	/**
	 * Namespace for dealing with the current workspace. A workspace is the collection of one
	 * or more folders that are opened in an editor window (instance).
	 *
	 * It is also possible to open an editor without a workspace. For example, when you open a
	 * new editor window by selecting a file from your platform's File menu, you will not be
	 * inside a workspace. In this mode, some of the editor's capabilities are reduced but you can
	 * still open text files and edit them.
	 *
	 * Refer to https://code.visualstudio.com/docs/editor/workspaces for more information on
	 * the concept of workspaces.
	 *
	 * The workspace offers support for {@link workspace.createFileSystemWatcher listening} to fs
	 * events and for {@link workspace.findFiles finding} files. Both perform well and run _outside_
	 * the editor-process so that they should be always used instead of nodejs-equivalents.
	 */
	export namespace workspace {

		/**
		 * A {@link FileSystem file system} instance that allows to interact with local and remote
		 * files, e.g. `vscode.workspace.fs.readDirectory(someUri)` allows to retrieve all entries
		 * of a directory or `vscode.workspace.fs.stat(anotherUri)` returns the meta data for a
		 * file.
		 */
		export const fs: FileSystem;

		/**
		 * The uri of the first entry of {@linkcode workspace.workspaceFolders workspaceFolders}
		 * as `string`. `undefined` if there is no first entry.
		 *
		 * Refer to https://code.visualstudio.com/docs/editor/workspaces for more information
		 * on workspaces.
		 *
		 * @deprecated Use {@linkcode workspace.workspaceFolders workspaceFolders} instead.
		 */
		export const rootPath: string | undefined;

		/**
		 * List of workspace folders (0-N) that are open in the editor. `undefined` when no workspace
		 * has been opened.
		 *
		 * Refer to https://code.visualstudio.com/docs/editor/workspaces for more information
		 * on workspaces.
		 */
		export const workspaceFolders: readonly WorkspaceFolder[] | undefined;

		/**
		 * The name of the workspace. `undefined` when no workspace
		 * has been opened.
		 *
		 * Refer to https://code.visualstudio.com/docs/editor/workspaces for more information on
		 * the concept of workspaces.
		 */
		export const name: string | undefined;

		/**
		 * The location of the workspace file, for example:
		 *
		 * `file:///Users/name/Development/myProject.code-workspace`
		 *
		 * or
		 *
		 * `untitled:1555503116870`
		 *
		 * for a workspace that is untitled and not yet saved.
		 *
		 * Depending on the workspace that is opened, the value will be:
		 *  * `undefined` when no workspace is opened
		 *  * the path of the workspace file as `Uri` otherwise. if the workspace
		 * is untitled, the returned URI will use the `untitled:` scheme
		 *
		 * The location can e.g. be used with the `vscode.openFolder` command to
		 * open the workspace again after it has been closed.
		 *
		 * **Example:**
		 * ```typescript
		 * vscode.commands.executeCommand('vscode.openFolder', uriOfWorkspace);
		 * ```
		 *
		 * Refer to https://code.visualstudio.com/docs/editor/workspaces for more information on
		 * the concept of workspaces.
		 *
		 * **Note:** it is not advised to use `workspace.workspaceFile` to write
		 * configuration data into the file. You can use `workspace.getConfiguration().update()`
		 * for that purpose which will work both when a single folder is opened as
		 * well as an untitled or saved workspace.
		 */
		export const workspaceFile: Uri | undefined;

		/**
		 * An event that is emitted when a workspace folder is added or removed.
		 *
		 * **Note:** this event will not fire if the first workspace folder is added, removed or changed,
		 * because in that case the currently executing extensions (including the one that listens to this
		 * event) will be terminated and restarted so that the (deprecated) `rootPath` property is updated
		 * to point to the first workspace folder.
		 */
		export const onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>;

		/**
		 * Returns the {@link WorkspaceFolder workspace folder} that contains a given uri.
		 * * returns `undefined` when the given uri doesn't match any workspace folder
		 * * returns the *input* when the given uri is a workspace folder itself
		 *
		 * @param uri An uri.
		 * @returns A workspace folder or `undefined`
		 */
		export function getWorkspaceFolder(uri: Uri): WorkspaceFolder | undefined;

		/**
		 * Returns a path that is relative to the workspace folder or folders.
		 *
		 * When there are no {@link workspace.workspaceFolders workspace folders} or when the path
		 * is not contained in them, the input is returned.
		 *
		 * @param pathOrUri A path or uri. When a uri is given its {@link Uri.fsPath fsPath} is used.
		 * @param includeWorkspaceFolder When `true` and when the given path is contained inside a
		 * workspace folder the name of the workspace is prepended. Defaults to `true` when there are
		 * multiple workspace folders and `false` otherwise.
		 * @returns A path relative to the root or the input.
		 */
		export function asRelativePath(pathOrUri: string | Uri, includeWorkspaceFolder?: boolean): string;

		/**
		 * This method replaces `deleteCount` {@link workspace.workspaceFolders workspace folders} starting at index `start`
		 * by an optional set of `workspaceFoldersToAdd` on the `vscode.workspace.workspaceFolders` array. This "splice"
		 * behavior can be used to add, remove and change workspace folders in a single operation.
		 *
		 * **Note:** in some cases calling this method may result in the currently executing extensions (including the
		 * one that called this method) to be terminated and restarted. For example when the first workspace folder is
		 * added, removed or changed the (deprecated) `rootPath` property is updated to point to the first workspace
		 * folder. Another case is when transitioning from an empty or single-folder workspace into a multi-folder
		 * workspace (see also: https://code.visualstudio.com/docs/editor/workspaces).
		 *
		 * Use the {@linkcode onDidChangeWorkspaceFolders onDidChangeWorkspaceFolders()} event to get notified when the
		 * workspace folders have been updated.
		 *
		 * **Example:** adding a new workspace folder at the end of workspace folders
		 * ```typescript
		 * workspace.updateWorkspaceFolders(workspace.workspaceFolders ? workspace.workspaceFolders.length : 0, null, { uri: ...});
		 * ```
		 *
		 * **Example:** removing the first workspace folder
		 * ```typescript
		 * workspace.updateWorkspaceFolders(0, 1);
		 * ```
		 *
		 * **Example:** replacing an existing workspace folder with a new one
		 * ```typescript
		 * workspace.updateWorkspaceFolders(0, 1, { uri: ...});
		 * ```
		 *
		 * It is valid to remove an existing workspace folder and add it again with a different name
		 * to rename that folder.
		 *
		 * **Note:** it is not valid to call {@link updateWorkspaceFolders updateWorkspaceFolders()} multiple times
		 * without waiting for the {@linkcode onDidChangeWorkspaceFolders onDidChangeWorkspaceFolders()} to fire.
		 *
		 * @param start the zero-based location in the list of currently opened {@link WorkspaceFolder workspace folders}
		 * from which to start deleting workspace folders.
		 * @param deleteCount the optional number of workspace folders to remove.
		 * @param workspaceFoldersToAdd the optional variable set of workspace folders to add in place of the deleted ones.
		 * Each workspace is identified with a mandatory URI and an optional name.
		 * @returns true if the operation was successfully started and false otherwise if arguments were used that would result
		 * in invalid workspace folder state (e.g. 2 folders with the same URI).
		 */
		export function updateWorkspaceFolders(start: number, deleteCount: number | undefined | null, ...workspaceFoldersToAdd: {
			/**
			 * The uri of a workspace folder that's to be added.
			 */
			readonly uri: Uri;
			/**
			 * The name of a workspace folder that's to be added.
			 */
			readonly name?: string;
		}[]): boolean;

		/**
		 * Creates a file system watcher that is notified on file events (create, change, delete)
		 * depending on the parameters provided.
		 *
		 * By default, all opened {@link workspace.workspaceFolders workspace folders} will be watched
		 * for file changes recursively.
		 *
		 * Additional paths can be added for file watching by providing a {@link RelativePattern} with
		 * a `base` path to watch. If the path is a folder and the `pattern` is complex (e.g. contains
		 * `**` or path segments), it will be watched recursively and otherwise will be watched
		 * non-recursively (i.e. only changes to the first level of the path will be reported).
		 *
		 * *Note* that paths that do not exist in the file system will be monitored with a delay until
		 * created and then watched depending on the parameters provided. If a watched path is deleted,
		 * the watcher will suspend and not report any events until the path is created again.
		 *
		 * If possible, keep the use of recursive watchers to a minimum because recursive file watching
		 * is quite resource intense.
		 *
		 * Providing a `string` as `globPattern` acts as convenience method for watching file events in
		 * all opened workspace folders. It cannot be used to add more folders for file watching, nor will
		 * it report any file events from folders that are not part of the opened workspace folders.
		 *
		 * Optionally, flags to ignore certain kinds of events can be provided.
		 *
		 * To stop listening to events the watcher must be disposed.
		 *
		 * *Note* that file events from recursive file watchers may be excluded based on user configuration.
		 * The setting `files.watcherExclude` helps to reduce the overhead of file events from folders
		 * that are known to produce many file changes at once (such as `.git` folders). As such,
		 * it is highly recommended to watch with simple patterns that do not require recursive watchers
		 * where the exclude settings are ignored and you have full control over the events.
		 *
		 * *Note* that symbolic links are not automatically followed for file watching unless the path to
		 * watch itself is a symbolic link.
		 *
		 * *Note* that the file paths that are reported for having changed may have a different path casing
		 * compared to the actual casing on disk on case-insensitive platforms (typically macOS and Windows
		 * but not Linux). We allow a user to open a workspace folder with any desired path casing and try
		 * to preserve that. This means:
		 * * if the path is within any of the workspace folders, the path will match the casing of the
		 *   workspace folder up to that portion of the path and match the casing on disk for children
		 * * if the path is outside of any of the workspace folders, the casing will match the case of the
		 *   path that was provided for watching
		 * In the same way, symbolic links are preserved, i.e. the file event will report the path of the
		 * symbolic link as it was provided for watching and not the target.
		 *
		 * *Note* that file events from deleting a folder may not include events for contained files. If possible
		 * events will be aggregated to reduce the overal number of emitted events.
		 *
		 * ### Examples
		 *
		 * The basic anatomy of a file watcher is as follows:
		 *
		 * ```ts
		 * const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(<folder>, <pattern>));
		 *
		 * watcher.onDidChange(uri => { ... }); // listen to files being changed
		 * watcher.onDidCreate(uri => { ... }); // listen to files/folders being created
		 * watcher.onDidDelete(uri => { ... }); // listen to files/folders getting deleted
		 *
		 * watcher.dispose(); // dispose after usage
		 * ```
		 *
		 * #### Workspace file watching
		 *
		 * If you only care about file events in a specific workspace folder:
		 *
		 * ```ts
		 * vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**​/*.js'));
		 * ```
		 *
		 * If you want to monitor file events across all opened workspace folders:
		 *
		 * ```ts
		 * vscode.workspace.createFileSystemWatcher('**​/*.js');
		 * ```
		 *
		 * *Note:* the array of workspace folders can be empty if no workspace is opened (empty window).
		 *
		 * #### Out of workspace file watching
		 *
		 * To watch a folder for changes to *.js files outside the workspace (non recursively), pass in a `Uri` to such
		 * a folder:
		 *
		 * ```ts
		 * vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(<path to folder outside workspace>), '*.js'));
		 * ```
		 *
		 * And use a complex glob pattern to watch recursively:
		 *
		 * ```ts
		 * vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(<path to folder outside workspace>), '**​/*.js'));
		 * ```
		 *
		 * Here is an example for watching the active editor for file changes:
		 *
		 * ```ts
		 * vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.window.activeTextEditor.document.uri, '*'));
		 * ```
		 *
		 * @param globPattern A {@link GlobPattern glob pattern} that controls which file events the watcher should report.
		 * @param ignoreCreateEvents Ignore when files have been created.
		 * @param ignoreChangeEvents Ignore when files have been changed.
		 * @param ignoreDeleteEvents Ignore when files have been deleted.
		 * @returns A new file system watcher instance. Must be disposed when no longer needed.
		 */
		export function createFileSystemWatcher(globPattern: GlobPattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): FileSystemWatcher;

		/**
		 * Find files across all {@link workspace.workspaceFolders workspace folders} in the workspace.
		 *
		 * @example
		 * findFiles('**​/*.js', '**​/node_modules/**', 10)
		 *
		 * @param include A {@link GlobPattern glob pattern} that defines the files to search for. The glob pattern
		 * will be matched against the file paths of resulting matches relative to their workspace. Use a {@link RelativePattern relative pattern}
		 * to restrict the search results to a {@link WorkspaceFolder workspace folder}.
		 * @param exclude  A {@link GlobPattern glob pattern} that defines files and folders to exclude. The glob pattern
		 * will be matched against the file paths of resulting matches relative to their workspace. When `undefined`, default file-excludes (e.g. the `files.exclude`-setting
		 * but not `search.exclude`) will apply. When `null`, no excludes will apply.
		 * @param maxResults An upper-bound for the result.
		 * @param token A token that can be used to signal cancellation to the underlying search engine.
		 * @returns A thenable that resolves to an array of resource identifiers. Will return no results if no
		 * {@link workspace.workspaceFolders workspace folders} are opened.
		 */
		export function findFiles(include: GlobPattern, exclude?: GlobPattern | null, maxResults?: number, token?: CancellationToken): Thenable<Uri[]>;

		/**
		 * Saves the editor identified by the given resource and returns the resulting resource or `undefined`
		 * if save was not successful or no editor with the given resource was found.
		 *
		 * **Note** that an editor with the provided resource must be opened in order to be saved.
		 *
		 * @param uri the associated uri for the opened editor to save.
		 * @returns A thenable that resolves when the save operation has finished.
		 */
		export function save(uri: Uri): Thenable<Uri | undefined>;

		/**
		 * Saves the editor identified by the given resource to a new file name as provided by the user and
		 * returns the resulting resource or `undefined` if save was not successful or cancelled or no editor
		 * with the given resource was found.
		 *
		 * **Note** that an editor with the provided resource must be opened in order to be saved as.
		 *
		 * @param uri the associated uri for the opened editor to save as.
		 * @returns A thenable that resolves when the save-as operation has finished.
		 */
		export function saveAs(uri: Uri): Thenable<Uri | undefined>;

		/**
		 * Save all dirty files.
		 *
		 * @param includeUntitled Also save files that have been created during this session.
		 * @returns A thenable that resolves when the files have been saved. Will return `false`
		 * for any file that failed to save.
		 */
		export function saveAll(includeUntitled?: boolean): Thenable<boolean>;

		/**
		 * Make changes to one or many resources or create, delete, and rename resources as defined by the given
		 * {@link WorkspaceEdit workspace edit}.
		 *
		 * All changes of a workspace edit are applied in the same order in which they have been added. If
		 * multiple textual inserts are made at the same position, these strings appear in the resulting text
		 * in the order the 'inserts' were made, unless that are interleaved with resource edits. Invalid sequences
		 * like 'delete file a' -> 'insert text in file a' cause failure of the operation.
		 *
		 * When applying a workspace edit that consists only of text edits an 'all-or-nothing'-strategy is used.
		 * A workspace edit with resource creations or deletions aborts the operation, e.g. consecutive edits will
		 * not be attempted, when a single edit fails.
		 *
		 * @param edit A workspace edit.
		 * @param metadata Optional {@link WorkspaceEditMetadata metadata} for the edit.
		 * @returns A thenable that resolves when the edit could be applied.
		 */
		export function applyEdit(edit: WorkspaceEdit, metadata?: WorkspaceEditMetadata): Thenable<boolean>;

		/**
		 * All text documents currently known to the editor.
		 */
		export const textDocuments: readonly TextDocument[];

		/**
		 * Opens a document. Will return early if this document is already open. Otherwise
		 * the document is loaded and the {@link workspace.onDidOpenTextDocument didOpen}-event fires.
		 *
		 * The document is denoted by an {@link Uri}. Depending on the {@link Uri.scheme scheme} the
		 * following rules apply:
		 * * `file`-scheme: Open a file on disk (`openTextDocument(Uri.file(path))`). Will be rejected if the file
		 * does not exist or cannot be loaded.
		 * * `untitled`-scheme: Open a blank untitled file with associated path (`openTextDocument(Uri.file(path).with({ scheme: 'untitled' }))`).
		 * The language will be derived from the file name.
		 * * For all other schemes contributed {@link TextDocumentContentProvider text document content providers} and
		 * {@link FileSystemProvider file system providers} are consulted.
		 *
		 * *Note* that the lifecycle of the returned document is owned by the editor and not by the extension. That means an
		 * {@linkcode workspace.onDidCloseTextDocument onDidClose}-event can occur at any time after opening it.
		 *
		 * @param uri Identifies the resource to open.
		 * @returns A promise that resolves to a {@link TextDocument document}.
		 */
		export function openTextDocument(uri: Uri, options?: {
			/**
			 * The {@link TextDocument.encoding encoding} of the document to use
			 * for decoding the underlying buffer to text. If omitted, the encoding
			 * will be guessed based on the file content and/or the editor settings
			 * unless the document is already opened.
			 *
			 * Opening a text document that was already opened with a different encoding
			 * has the potential of changing the text contents of the text document.
			 * Specifically, when the encoding results in a different set of characters
			 * than the previous encoding. As such, an error is thrown for dirty documents
			 * when the specified encoding is different from the encoding of the document.
			 *
			 * See {@link TextDocument.encoding} for more information about valid
			 * values for encoding. Using an unsupported encoding will fallback to the
			 * default encoding for the document.
			 *
			 * *Note* that if you open a document with an encoding that does not
			 * support decoding the underlying bytes, content may be replaced with
			 * substitution characters as appropriate.
			 */
			readonly encoding?: string;
		}): Thenable<TextDocument>;

		/**
		 * A short-hand for `openTextDocument(Uri.file(path))`.
		 *
		 * @see {@link workspace.openTextDocument}
		 * @param path A path of a file on disk.
		 * @returns A promise that resolves to a {@link TextDocument document}.
		 */
		export function openTextDocument(path: string, options?: {
			/**
			 * The {@link TextDocument.encoding encoding} of the document to use
			 * for decoding the underlying buffer to text. If omitted, the encoding
			 * will be guessed based on the file content and/or the editor settings
			 * unless the document is already opened.
			 *
			 * Opening a text document that was already opened with a different encoding
			 * has the potential of changing the text contents of the text document.
			 * Specifically, when the encoding results in a different set of characters
			 * than the previous encoding. As such, an error is thrown for dirty documents
			 * when the specified encoding is different from the encoding of the document.
			 *
			 * See {@link TextDocument.encoding} for more information about valid
			 * values for encoding. Using an unsupported encoding will fallback to the
			 * default encoding for the document.
			 *
			 * *Note* that if you open a document with an encoding that does not
			 * support decoding the underlying bytes, content may be replaced with
			 * substitution characters as appropriate.
			 */
			readonly encoding?: string;
		}): Thenable<TextDocument>;

		/**
		 * Opens an untitled text document. The editor will prompt the user for a file
		 * path when the document is to be saved. The `options` parameter allows to
		 * specify the *language* and/or the *content* of the document.
		 *
		 * @param options Options to control how the document will be created.
		 * @returns A promise that resolves to a {@link TextDocument document}.
		 */
		export function openTextDocument(options?: {
			/**
			 * The {@link TextDocument.languageId language} of the document.
			 */
			language?: string;
			/**
			 * The initial contents of the document.
			 */
			content?: string;
			/**
			 * The {@link TextDocument.encoding encoding} of the document.
			 *
			 * See {@link TextDocument.encoding} for more information about valid
			 * values for encoding. Using an unsupported encoding will fallback to the
			 * default encoding for the document.
			 */
			readonly encoding?: string;
		}): Thenable<TextDocument>;

		/**
		 * Register a text document content provider.
		 *
		 * Only one provider can be registered per scheme.
		 *
		 * @param scheme The uri-scheme to register for.
		 * @param provider A content provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerTextDocumentContentProvider(scheme: string, provider: TextDocumentContentProvider): Disposable;

		/**
		 * An event that is emitted when a {@link TextDocument text document} is opened or when the language id
		 * of a text document {@link languages.setTextDocumentLanguage has been changed}.
		 *
		 * To add an event listener when a visible text document is opened, use the {@link TextEditor} events in the
		 * {@link window} namespace. Note that:
		 *
		 * - The event is emitted before the {@link TextDocument document} is updated in the
		 * {@link window.activeTextEditor active text editor}
		 * - When a {@link TextDocument text document} is already open (e.g.: open in another {@link window.visibleTextEditors visible text editor}) this event is not emitted
		 *
		 */
		export const onDidOpenTextDocument: Event<TextDocument>;

		/**
		 * An event that is emitted when a {@link TextDocument text document} is disposed or when the language id
		 * of a text document {@link languages.setTextDocumentLanguage has been changed}.
		 *
		 * *Note 1:* There is no guarantee that this event fires when an editor tab is closed, use the
		 * {@linkcode window.onDidChangeVisibleTextEditors onDidChangeVisibleTextEditors}-event to know when editors change.
		 *
		 * *Note 2:* A document can be open but not shown in an editor which means this event can fire
		 * for a document that has not been shown in an editor.
		 */
		export const onDidCloseTextDocument: Event<TextDocument>;

		/**
		 * An event that is emitted when a {@link TextDocument text document} is changed. This usually happens
		 * when the {@link TextDocument.getText contents} changes but also when other things like the
		 * {@link TextDocument.isDirty dirty}-state changes.
		 */
		export const onDidChangeTextDocument: Event<TextDocumentChangeEvent>;

		/**
		 * An event that is emitted when a {@link TextDocument text document} will be saved to disk.
		 *
		 * *Note 1:* Subscribers can delay saving by registering asynchronous work. For the sake of data integrity the editor
		 * might save without firing this event. For instance when shutting down with dirty files.
		 *
		 * *Note 2:* Subscribers are called sequentially and they can {@link TextDocumentWillSaveEvent.waitUntil delay} saving
		 * by registering asynchronous work. Protection against misbehaving listeners is implemented as such:
		 *  * there is an overall time budget that all listeners share and if that is exhausted no further listener is called
		 *  * listeners that take a long time or produce errors frequently will not be called anymore
		 *
		 * The current thresholds are 1.5 seconds as overall time budget and a listener can misbehave 3 times before being ignored.
		 */
		export const onWillSaveTextDocument: Event<TextDocumentWillSaveEvent>;

		/**
		 * An event that is emitted when a {@link TextDocument text document} is saved to disk.
		 */
		export const onDidSaveTextDocument: Event<TextDocument>;

		/**
		 * All notebook documents currently known to the editor.
		 */
		export const notebookDocuments: readonly NotebookDocument[];

		/**
		 * Open a notebook. Will return early if this notebook is already {@link notebookDocuments loaded}. Otherwise
		 * the notebook is loaded and the {@linkcode onDidOpenNotebookDocument}-event fires.
		 *
		 * *Note* that the lifecycle of the returned notebook is owned by the editor and not by the extension. That means an
		 * {@linkcode onDidCloseNotebookDocument}-event can occur at any time after.
		 *
		 * *Note* that opening a notebook does not show a notebook editor. This function only returns a notebook document which
		 * can be shown in a notebook editor but it can also be used for other things.
		 *
		 * @param uri The resource to open.
		 * @returns A promise that resolves to a {@link NotebookDocument notebook}
		 */
		export function openNotebookDocument(uri: Uri): Thenable<NotebookDocument>;

		/**
		 * Open an untitled notebook. The editor will prompt the user for a file
		 * path when the document is to be saved.
		 *
		 * @see {@link workspace.openNotebookDocument}
		 * @param notebookType The notebook type that should be used.
		 * @param content The initial contents of the notebook.
		 * @returns A promise that resolves to a {@link NotebookDocument notebook}.
		 */
		export function openNotebookDocument(notebookType: string, content?: NotebookData): Thenable<NotebookDocument>;

		/**
		 * An event that is emitted when a {@link NotebookDocument notebook} has changed.
		 */
		export const onDidChangeNotebookDocument: Event<NotebookDocumentChangeEvent>;

		/**
		 * An event that is emitted when a {@link NotebookDocument notebook document} will be saved to disk.
		 *
		 * *Note 1:* Subscribers can delay saving by registering asynchronous work. For the sake of data integrity the editor
		 * might save without firing this event. For instance when shutting down with dirty files.
		 *
		 * *Note 2:* Subscribers are called sequentially and they can {@link NotebookDocumentWillSaveEvent.waitUntil delay} saving
		 * by registering asynchronous work. Protection against misbehaving listeners is implemented as such:
		 *  * there is an overall time budget that all listeners share and if that is exhausted no further listener is called
		 *  * listeners that take a long time or produce errors frequently will not be called anymore
		 *
		 * The current thresholds are 1.5 seconds as overall time budget and a listener can misbehave 3 times before being ignored.
		 */
		export const onWillSaveNotebookDocument: Event<NotebookDocumentWillSaveEvent>;

		/**
		 * An event that is emitted when a {@link NotebookDocument notebook} is saved.
		 */
		export const onDidSaveNotebookDocument: Event<NotebookDocument>;

		/**
		 * Register a {@link NotebookSerializer notebook serializer}.
		 *
		 * A notebook serializer must be contributed through the `notebooks` extension point. When opening a notebook file, the editor will send
		 * the `onNotebook:<notebookType>` activation event, and extensions must register their serializer in return.
		 *
		 * @param notebookType A notebook.
		 * @param serializer A notebook serializer.
		 * @param options Optional context options that define what parts of a notebook should be persisted
		 * @returns A {@link Disposable} that unregisters this serializer when being disposed.
		 */
		export function registerNotebookSerializer(notebookType: string, serializer: NotebookSerializer, options?: NotebookDocumentContentOptions): Disposable;

		/**
		 * An event that is emitted when a {@link NotebookDocument notebook} is opened.
		 */
		export const onDidOpenNotebookDocument: Event<NotebookDocument>;

		/**
		 * An event that is emitted when a {@link NotebookDocument notebook} is disposed.
		 *
		 * *Note 1:* There is no guarantee that this event fires when an editor tab is closed.
		 *
		 * *Note 2:* A notebook can be open but not shown in an editor which means this event can fire
		 * for a notebook that has not been shown in an editor.
		 */
		export const onDidCloseNotebookDocument: Event<NotebookDocument>;

		/**
		 * An event that is emitted when files are being created.
		 *
		 * *Note 1:* This event is triggered by user gestures, like creating a file from the
		 * explorer, or from the {@linkcode workspace.applyEdit}-api. This event is *not* fired when
		 * files change on disk, e.g triggered by another application, or when using the
		 * {@linkcode FileSystem workspace.fs}-api.
		 *
		 * *Note 2:* When this event is fired, edits to files that are are being created cannot be applied.
		 */
		export const onWillCreateFiles: Event<FileWillCreateEvent>;

		/**
		 * An event that is emitted when files have been created.
		 *
		 * *Note:* This event is triggered by user gestures, like creating a file from the
		 * explorer, or from the {@linkcode workspace.applyEdit}-api, but this event is *not* fired when
		 * files change on disk, e.g triggered by another application, or when using the
		 * {@linkcode FileSystem workspace.fs}-api.
		 */
		export const onDidCreateFiles: Event<FileCreateEvent>;

		/**
		 * An event that is emitted when files are being deleted.
		 *
		 * *Note 1:* This event is triggered by user gestures, like deleting a file from the
		 * explorer, or from the {@linkcode workspace.applyEdit}-api, but this event is *not* fired when
		 * files change on disk, e.g triggered by another application, or when using the
		 * {@linkcode FileSystem workspace.fs}-api.
		 *
		 * *Note 2:* When deleting a folder with children only one event is fired.
		 */
		export const onWillDeleteFiles: Event<FileWillDeleteEvent>;

		/**
		 * An event that is emitted when files have been deleted.
		 *
		 * *Note 1:* This event is triggered by user gestures, like deleting a file from the
		 * explorer, or from the {@linkcode workspace.applyEdit}-api, but this event is *not* fired when
		 * files change on disk, e.g triggered by another application, or when using the
		 * {@linkcode FileSystem workspace.fs}-api.
		 *
		 * *Note 2:* When deleting a folder with children only one event is fired.
		 */
		export const onDidDeleteFiles: Event<FileDeleteEvent>;

		/**
		 * An event that is emitted when files are being renamed.
		 *
		 * *Note 1:* This event is triggered by user gestures, like renaming a file from the
		 * explorer, and from the {@linkcode workspace.applyEdit}-api, but this event is *not* fired when
		 * files change on disk, e.g triggered by another application, or when using the
		 * {@linkcode FileSystem workspace.fs}-api.
		 *
		 * *Note 2:* When renaming a folder with children only one event is fired.
		 */
		export const onWillRenameFiles: Event<FileWillRenameEvent>;

		/**
		 * An event that is emitted when files have been renamed.
		 *
		 * *Note 1:* This event is triggered by user gestures, like renaming a file from the
		 * explorer, and from the {@linkcode workspace.applyEdit}-api, but this event is *not* fired when
		 * files change on disk, e.g triggered by another application, or when using the
		 * {@linkcode FileSystem workspace.fs}-api.
		 *
		 * *Note 2:* When renaming a folder with children only one event is fired.
		 */
		export const onDidRenameFiles: Event<FileRenameEvent>;

		/**
		 * Get a workspace configuration object.
		 *
		 * When a section-identifier is provided only that part of the configuration
		 * is returned. Dots in the section-identifier are interpreted as child-access,
		 * like `{ myExt: { setting: { doIt: true }}}` and `getConfiguration('myExt.setting').get('doIt') === true`.
		 *
		 * When a scope is provided configuration confined to that scope is returned. Scope can be a resource or a language identifier or both.
		 *
		 * @param section A dot-separated identifier.
		 * @param scope A scope for which the configuration is asked for.
		 * @returns The full configuration or a subset.
		 */
		export function getConfiguration(section?: string, scope?: ConfigurationScope | null): WorkspaceConfiguration;

		/**
		 * An event that is emitted when the {@link WorkspaceConfiguration configuration} changed.
		 */
		export const onDidChangeConfiguration: Event<ConfigurationChangeEvent>;

		/**
		 * Register a task provider.
		 *
		 * @deprecated Use the corresponding function on the `tasks` namespace instead
		 *
		 * @param type The task kind type this provider is registered for.
		 * @param provider A task provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerTaskProvider(type: string, provider: TaskProvider): Disposable;

		/**
		 * Register a filesystem provider for a given scheme, e.g. `ftp`.
		 *
		 * There can only be one provider per scheme and an error is being thrown when a scheme
		 * has been claimed by another provider or when it is reserved.
		 *
		 * @param scheme The uri-{@link Uri.scheme scheme} the provider registers for.
		 * @param provider The filesystem provider.
		 * @param options Immutable metadata about the provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerFileSystemProvider(scheme: string, provider: FileSystemProvider, options?: {
			/**
			 * Whether the file system provider use case sensitive compare for {@link Uri.path paths}
			 */
			readonly isCaseSensitive?: boolean;
			/**
			 * Whether the file system provider is readonly, no modifications like write, delete, create are possible.
			 * If a {@link MarkdownString} is given, it will be shown as the reason why the file system is readonly.
			 */
			readonly isReadonly?: boolean | MarkdownString;
		}): Disposable;

		/**
		 * When true, the user has explicitly trusted the contents of the workspace.
		 */
		export const isTrusted: boolean;

		/**
		 * Event that fires when the current workspace has been trusted.
		 */
		export const onDidGrantWorkspaceTrust: Event<void>;

		/**
		 * Decodes the content from a `Uint8Array` to a `string`. You MUST
		 * provide the entire content at once to ensure that the encoding
		 * can properly apply. Do not use this method to decode content
		 * in chunks, as that may lead to incorrect results.
		 *
		 * Will pick an encoding based on settings and the content of the
		 * buffer (for example byte order marks).
		 *
		 * *Note* that if you decode content that is unsupported by the
		 * encoding, the result may contain substitution characters as
		 * appropriate.
		 *
		 * @throws This method will throw an error when the content is binary.
		 *
		 * @param content The text content to decode as a `Uint8Array`.
		 * @returns A thenable that resolves to the decoded `string`.
		 */
		export function decode(content: Uint8Array): Thenable<string>;

		/**
		 * Decodes the content from a `Uint8Array` to a `string` using the
		 * provided encoding. You MUST provide the entire content at once
		 * to ensure that the encoding can properly apply. Do not use this
		 * method to decode content in chunks, as that may lead to incorrect
		 * results.
		 *
		 * *Note* that if you decode content that is unsupported by the
		 * encoding, the result may contain substitution characters as
		 * appropriate.
		 *
		 * @throws This method will throw an error when the content is binary.
		 *
		 * @param content The text content to decode as a `Uint8Array`.
		 * @param options Additional context for picking the encoding.
		 * @returns A thenable that resolves to the decoded `string`.
		 */
		export function decode(content: Uint8Array, options: {
			/**
			 * Allows to explicitly pick the encoding to use.
			 * See {@link TextDocument.encoding} for more information
			 * about valid values for encoding.
			 * Using an unsupported encoding will fallback to the
			 * default configured encoding.
			 */
			readonly encoding: string;
		}): Thenable<string>;

		/**
		 * Decodes the content from a `Uint8Array` to a `string`. You MUST
		 * provide the entire content at once to ensure that the encoding
		 * can properly apply. Do not use this method to decode content
		 * in chunks, as that may lead to incorrect results.
		 *
		 * The encoding is picked based on settings and the content
		 * of the buffer (for example byte order marks).
		 *
		 * *Note* that if you decode content that is unsupported by the
		 * encoding, the result may contain substitution characters as
		 * appropriate.
		 *
		 * @throws This method will throw an error when the content is binary.
		 *
		 * @param content The content to decode as a `Uint8Array`.
		 * @param options Additional context for picking the encoding.
		 * @returns A thenable that resolves to the decoded `string`.
		 */
		export function decode(content: Uint8Array, options: {
			/**
			 * The URI that represents the file if known. This information
			 * is used to figure out the encoding related configuration
			 * for the file if any.
			 */
			readonly uri: Uri;
		}): Thenable<string>;

		/**
		 * Encodes the content of a `string` to a `Uint8Array`.
		 *
		 * Will pick an encoding based on settings.
		 *
		 * @param content The content to decode as a `string`.
		 * @returns A thenable that resolves to the encoded `Uint8Array`.
		 */
		export function encode(content: string): Thenable<Uint8Array>;

		/**
		 * Encodes the content of a `string` to a `Uint8Array` using the
		 * provided encoding.
		 *
		 * @param content The content to decode as a `string`.
		 * @param options Additional context for picking the encoding.
		 * @returns A thenable that resolves to the encoded `Uint8Array`.
		 */
		export function encode(content: string, options: {
			/**
			 * Allows to explicitly pick the encoding to use.
			 * See {@link TextDocument.encoding} for more information
			 * about valid values for encoding.
			 * Using an unsupported encoding will fallback to the
			 * default configured encoding.
			 */
			readonly encoding: string;
		}): Thenable<Uint8Array>;

		/**
		 * Encodes the content of a `string` to a `Uint8Array`.
		 *
		 * The encoding is picked based on settings.
		 *
		 * @param content The content to decode as a `string`.
		 * @param options Additional context for picking the encoding.
		 * @returns A thenable that resolves to the encoded `Uint8Array`.
		 */
		export function encode(content: string, options: {
			/**
			 * The URI that represents the file if known. This information
			 * is used to figure out the encoding related configuration
			 * for the file if any.
			 */
			readonly uri: Uri;
		}): Thenable<Uint8Array>;
	}

	/**
	 * The configuration scope which can be:
	 * - a {@link Uri} representing a resource
	 * - a {@link TextDocument} representing an open text document
	 * - a {@link WorkspaceFolder} representing a workspace folder
	 * - an object containing:
	 *   - `uri`: an optional {@link Uri} of a text document
	 *   - `languageId`: the language identifier of a text document
	 */
	export type ConfigurationScope = Uri | TextDocument | WorkspaceFolder | {
		/**
		 * The uri of a {@link TextDocument text document}
		 */
		uri?: Uri;
		/**
		 * The language of a text document
		 */
		languageId: string;
	};

	/**
	 * An event describing the change in Configuration
	 */
	export interface ConfigurationChangeEvent {

		/**
		 * Checks if the given section has changed.
		 * If scope is provided, checks if the section has changed for resources under the given scope.
		 *
		 * @param section Configuration name, supports _dotted_ names.
		 * @param scope A scope in which to check.
		 * @returns `true` if the given section has changed.
		 */
		affectsConfiguration(section: string, scope?: ConfigurationScope): boolean;
	}

	/**
	 * Namespace for participating in language-specific editor [features](https://code.visualstudio.com/docs/editor/editingevolved),
	 * like IntelliSense, code actions, diagnostics etc.
	 *
	 * Many programming languages exist and there is huge variety in syntaxes, semantics, and paradigms. Despite that, features
	 * like automatic word-completion, code navigation, or code checking have become popular across different tools for different
	 * programming languages.
	 *
	 * The editor provides an API that makes it simple to provide such common features by having all UI and actions already in place and
	 * by allowing you to participate by providing data only. For instance, to contribute a hover all you have to do is provide a function
	 * that can be called with a {@link TextDocument} and a {@link Position} returning hover info. The rest, like tracking the
	 * mouse, positioning the hover, keeping the hover stable etc. is taken care of by the editor.
	 *
	 * ```javascript
	 * languages.registerHoverProvider('javascript', {
	 * 	provideHover(document, position, token) {
	 * 		return new Hover('I am a hover!');
	 * 	}
	 * });
	 * ```
	 *
	 * Registration is done using a {@link DocumentSelector document selector} which is either a language id, like `javascript` or
	 * a more complex {@link DocumentFilter filter} like `{ language: 'typescript', scheme: 'file' }`. Matching a document against such
	 * a selector will result in a {@link languages.match score} that is used to determine if and how a provider shall be used. When
	 * scores are equal the provider that came last wins. For features that allow full arity, like {@link languages.registerHoverProvider hover},
	 * the score is only checked to be `>0`, for other features, like {@link languages.registerCompletionItemProvider IntelliSense} the
	 * score is used for determining the order in which providers are asked to participate.
	 */
	export namespace languages {

		/**
		 * Return the identifiers of all known languages.
		 * @returns Promise resolving to an array of identifier strings.
		 */
		export function getLanguages(): Thenable<string[]>;

		/**
		 * Set (and change) the {@link TextDocument.languageId language} that is associated
		 * with the given document.
		 *
		 * *Note* that calling this function will trigger the {@linkcode workspace.onDidCloseTextDocument onDidCloseTextDocument} event
		 * followed by the {@linkcode workspace.onDidOpenTextDocument onDidOpenTextDocument} event.
		 *
		 * @param document The document which language is to be changed
		 * @param languageId The new language identifier.
		 * @returns A thenable that resolves with the updated document.
		 */
		export function setTextDocumentLanguage(document: TextDocument, languageId: string): Thenable<TextDocument>;

		/**
		 * Compute the match between a document {@link DocumentSelector selector} and a document. Values
		 * greater than zero mean the selector matches the document.
		 *
		 * A match is computed according to these rules:
		 * 1. When {@linkcode DocumentSelector} is an array, compute the match for each contained `DocumentFilter` or language identifier and take the maximum value.
		 * 2. A string will be desugared to become the `language`-part of a {@linkcode DocumentFilter}, so `"fooLang"` is like `{ language: "fooLang" }`.
		 * 3. A {@linkcode DocumentFilter} will be matched against the document by comparing its parts with the document. The following rules apply:
		 *    1. When the `DocumentFilter` is empty (`{}`) the result is `0`
		 *    2. When `scheme`, `language`, `pattern`, or `notebook` are defined but one doesn't match, the result is `0`
		 *    3. Matching against `*` gives a score of `5`, matching via equality or via a glob-pattern gives a score of `10`
		 *    4. The result is the maximum value of each match
		 *
		 * Samples:
		 * ```js
		 * // default document from disk (file-scheme)
		 * doc.uri; //'file:///my/file.js'
		 * doc.languageId; // 'javascript'
		 * match('javascript', doc); // 10;
		 * match({ language: 'javascript' }, doc); // 10;
		 * match({ language: 'javascript', scheme: 'file' }, doc); // 10;
		 * match('*', doc); // 5
		 * match('fooLang', doc); // 0
		 * match(['fooLang', '*'], doc); // 5
		 *
		 * // virtual document, e.g. from git-index
		 * doc.uri; // 'git:/my/file.js'
		 * doc.languageId; // 'javascript'
		 * match('javascript', doc); // 10;
		 * match({ language: 'javascript', scheme: 'git' }, doc); // 10;
		 * match('*', doc); // 5
		 *
		 * // notebook cell document
		 * doc.uri; // `vscode-notebook-cell:///my/notebook.ipynb#gl65s2pmha`;
		 * doc.languageId; // 'python'
		 * match({ notebookType: 'jupyter-notebook' }, doc) // 10
		 * match({ notebookType: 'fooNotebook', language: 'python' }, doc) // 0
		 * match({ language: 'python' }, doc) // 10
		 * match({ notebookType: '*' }, doc) // 5
		 * ```
		 *
		 * @param selector A document selector.
		 * @param document A text document.
		 * @returns A number `>0` when the selector matches and `0` when the selector does not match.
		 */
		export function match(selector: DocumentSelector, document: TextDocument): number;

		/**
		 * An {@link Event} which fires when the global set of diagnostics changes. This is
		 * newly added and removed diagnostics.
		 */
		export const onDidChangeDiagnostics: Event<DiagnosticChangeEvent>;

		/**
		 * Get all diagnostics for a given resource.
		 *
		 * @param resource A resource
		 * @returns An array of {@link Diagnostic diagnostics} objects or an empty array.
		 */
		export function getDiagnostics(resource: Uri): Diagnostic[];

		/**
		 * Get all diagnostics.
		 *
		 * @returns An array of uri-diagnostics tuples or an empty array.
		 */
		export function getDiagnostics(): [Uri, Diagnostic[]][];

		/**
		 * Create a diagnostics collection.
		 *
		 * @param name The {@link DiagnosticCollection.name name} of the collection.
		 * @returns A new diagnostic collection.
		 */
		export function createDiagnosticCollection(name?: string): DiagnosticCollection;

		/**
		 * Creates a new {@link LanguageStatusItem language status item}.
		 *
		 * @param id The identifier of the item.
		 * @param selector The document selector that defines for what editors the item shows.
		 * @returns A new language status item.
		 */
		export function createLanguageStatusItem(id: string, selector: DocumentSelector): LanguageStatusItem;

		/**
		 * Register a completion provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and groups of equal score are sequentially asked for
		 * completion items. The process stops when one or many providers of a group return a
		 * result. A failing provider (rejected promise or exception) will not fail the whole
		 * operation.
		 *
		 * A completion item provider can be associated with a set of `triggerCharacters`. When trigger
		 * characters are being typed, completions are requested but only from providers that registered
		 * the typed character. Because of that trigger characters should be different than {@link LanguageConfiguration.wordPattern word characters},
		 * a common trigger character is `.` to trigger member completions.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A completion provider.
		 * @param triggerCharacters Trigger completion when the user types one of the characters.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerCompletionItemProvider(selector: DocumentSelector, provider: CompletionItemProvider, ...triggerCharacters: string[]): Disposable;

		/**
		 * Registers an inline completion provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An inline completion provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerInlineCompletionItemProvider(selector: DocumentSelector, provider: InlineCompletionItemProvider): Disposable;

		/**
		 * Register a code action provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A code action provider.
		 * @param metadata Metadata about the kind of code actions the provider provides.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerCodeActionsProvider(selector: DocumentSelector, provider: CodeActionProvider, metadata?: CodeActionProviderMetadata): Disposable;

		/**
		 * Register a code lens provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A code lens provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerCodeLensProvider(selector: DocumentSelector, provider: CodeLensProvider): Disposable;

		/**
		 * Register a definition provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A definition provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerDefinitionProvider(selector: DocumentSelector, provider: DefinitionProvider): Disposable;

		/**
		 * Register an implementation provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An implementation provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerImplementationProvider(selector: DocumentSelector, provider: ImplementationProvider): Disposable;

		/**
		 * Register a type definition provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A type definition provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerTypeDefinitionProvider(selector: DocumentSelector, provider: TypeDefinitionProvider): Disposable;

		/**
		 * Register a declaration provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A declaration provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerDeclarationProvider(selector: DocumentSelector, provider: DeclarationProvider): Disposable;

		/**
		 * Register a hover provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A hover provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable;

		/**
		 * Register a provider that locates evaluatable expressions in text documents.
		 * The editor will evaluate the expression in the active debug session and will show the result in the debug hover.
		 *
		 * If multiple providers are registered for a language an arbitrary provider will be used.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An evaluatable expression provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerEvaluatableExpressionProvider(selector: DocumentSelector, provider: EvaluatableExpressionProvider): Disposable;

		/**
		 * Register a provider that returns data for the debugger's 'inline value' feature.
		 * Whenever the generic debugger has stopped in a source file, providers registered for the language of the file
		 * are called to return textual data that will be shown in the editor at the end of lines.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An inline values provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerInlineValuesProvider(selector: DocumentSelector, provider: InlineValuesProvider): Disposable;

		/**
		 * Register a document highlight provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and groups sequentially asked for document highlights.
		 * The process stops when a provider returns a `non-falsy` or `non-failure` result.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document highlight provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerDocumentHighlightProvider(selector: DocumentSelector, provider: DocumentHighlightProvider): Disposable;

		/**
		 * Register a document symbol provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document symbol provider.
		 * @param metaData metadata about the provider
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerDocumentSymbolProvider(selector: DocumentSelector, provider: DocumentSymbolProvider, metaData?: DocumentSymbolProviderMetadata): Disposable;

		/**
		 * Register a workspace symbol provider.
		 *
		 * Multiple providers can be registered. In that case providers are asked in parallel and
		 * the results are merged. A failing provider (rejected promise or exception) will not cause
		 * a failure of the whole operation.
		 *
		 * @param provider A workspace symbol provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerWorkspaceSymbolProvider(provider: WorkspaceSymbolProvider): Disposable;

		/**
		 * Register a reference provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A reference provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerReferenceProvider(selector: DocumentSelector, provider: ReferenceProvider): Disposable;

		/**
		 * Register a rename provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and asked in sequence. The first provider producing a result
		 * defines the result of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A rename provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerRenameProvider(selector: DocumentSelector, provider: RenameProvider): Disposable;

		/**
		 * Register a semantic tokens provider for a whole document.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and the best-matching provider is used. Failure
		 * of the selected provider will cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document semantic tokens provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerDocumentSemanticTokensProvider(selector: DocumentSelector, provider: DocumentSemanticTokensProvider, legend: SemanticTokensLegend): Disposable;

		/**
		 * Register a semantic tokens provider for a document range.
		 *
		 * *Note:* If a document has both a `DocumentSemanticTokensProvider` and a `DocumentRangeSemanticTokensProvider`,
		 * the range provider will be invoked only initially, for the time in which the full document provider takes
		 * to resolve the first request. Once the full document provider resolves the first request, the semantic tokens
		 * provided via the range provider will be discarded and from that point forward, only the document provider
		 * will be used.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and the best-matching provider is used. Failure
		 * of the selected provider will cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document range semantic tokens provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerDocumentRangeSemanticTokensProvider(selector: DocumentSelector, provider: DocumentRangeSemanticTokensProvider, legend: SemanticTokensLegend): Disposable;

		/**
		 * Register a formatting provider for a document.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and the best-matching provider is used. Failure
		 * of the selected provider will cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document formatting edit provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerDocumentFormattingEditProvider(selector: DocumentSelector, provider: DocumentFormattingEditProvider): Disposable;

		/**
		 * Register a formatting provider for a document range.
		 *
		 * *Note:* A document range provider is also a {@link DocumentFormattingEditProvider document formatter}
		 * which means there is no need to {@link languages.registerDocumentFormattingEditProvider register} a document
		 * formatter when also registering a range provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and the best-matching provider is used. Failure
		 * of the selected provider will cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document range formatting edit provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerDocumentRangeFormattingEditProvider(selector: DocumentSelector, provider: DocumentRangeFormattingEditProvider): Disposable;

		/**
		 * Register a formatting provider that works on type. The provider is active when the user enables the setting `editor.formatOnType`.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and the best-matching provider is used. Failure
		 * of the selected provider will cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An on type formatting edit provider.
		 * @param firstTriggerCharacter A character on which formatting should be triggered, like `}`.
		 * @param moreTriggerCharacter More trigger characters.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerOnTypeFormattingEditProvider(selector: DocumentSelector, provider: OnTypeFormattingEditProvider, firstTriggerCharacter: string, ...moreTriggerCharacter: string[]): Disposable;

		/**
		 * Register a signature help provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and called sequentially until a provider returns a
		 * valid result.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A signature help provider.
		 * @param triggerCharacters Trigger signature help when the user types one of the characters, like `,` or `(`.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerSignatureHelpProvider(selector: DocumentSelector, provider: SignatureHelpProvider, ...triggerCharacters: string[]): Disposable;

		/**
		 * @see {@link languages.registerSignatureHelpProvider}
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A signature help provider.
		 * @param metadata Information about the provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerSignatureHelpProvider(selector: DocumentSelector, provider: SignatureHelpProvider, metadata: SignatureHelpProviderMetadata): Disposable;

		/**
		 * Register a document link provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document link provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerDocumentLinkProvider(selector: DocumentSelector, provider: DocumentLinkProvider): Disposable;

		/**
		 * Register a color provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A color provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerColorProvider(selector: DocumentSelector, provider: DocumentColorProvider): Disposable;

		/**
		 * Register a inlay hints provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An inlay hints provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerInlayHintsProvider(selector: DocumentSelector, provider: InlayHintsProvider): Disposable;

		/**
		 * Register a folding range provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged.
		 * If multiple folding ranges start at the same position, only the range of the first registered provider is used.
		 * If a folding range overlaps with an other range that has a smaller position, it is also ignored.
		 *
		 * A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A folding range provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerFoldingRangeProvider(selector: DocumentSelector, provider: FoldingRangeProvider): Disposable;

		/**
		 * Register a selection range provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A selection range provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerSelectionRangeProvider(selector: DocumentSelector, provider: SelectionRangeProvider): Disposable;

		/**
		 * Register a call hierarchy provider.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A call hierarchy provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerCallHierarchyProvider(selector: DocumentSelector, provider: CallHierarchyProvider): Disposable;

		/**
		 * Register a type hierarchy provider.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A type hierarchy provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerTypeHierarchyProvider(selector: DocumentSelector, provider: TypeHierarchyProvider): Disposable;

		/**
		 * Register a linked editing range provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their {@link languages.match score} and the best-matching provider that has a result is used. Failure
		 * of the selected provider will cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A linked editing range provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerLinkedEditingRangeProvider(selector: DocumentSelector, provider: LinkedEditingRangeProvider): Disposable;

		/**
		 * Registers a new {@link DocumentDropEditProvider}.
		 *
		 * Multiple drop providers can be registered for a language. When dropping content into an editor, all
		 * registered providers for the editor's language will be invoked based on the mimetypes they handle
		 * as specified by their {@linkcode DocumentDropEditProviderMetadata}.
		 *
		 * Each provider can return one or more {@linkcode DocumentDropEdit DocumentDropEdits}. The edits are sorted
		 * using the {@linkcode DocumentDropEdit.yieldTo} property. By default the first edit will be applied. If there
		 * are any additional edits, these will be shown to the user as selectable drop options in the drop widget.
		 *
		 * @param selector A selector that defines the documents this provider applies to.
		 * @param provider A drop provider.
		 * @param metadata Additional metadata about the provider.
		 *
		 * @returns A {@linkcode Disposable} that unregisters this provider when disposed of.
		 */
		export function registerDocumentDropEditProvider(selector: DocumentSelector, provider: DocumentDropEditProvider, metadata?: DocumentDropEditProviderMetadata): Disposable;

		/**
		 * Registers a new {@linkcode DocumentPasteEditProvider}.
		 *
		 * Multiple providers can be registered for a language. All registered providers for a language will be invoked
		 * for copy and paste operations based on their handled mimetypes as specified by the {@linkcode DocumentPasteProviderMetadata}.
		 *
		 * For {@link DocumentPasteEditProvider.prepareDocumentPaste copy operations}, changes to the {@linkcode DataTransfer}
		 * made by each provider will be merged into a single {@linkcode DataTransfer} that is used to populate the clipboard.
		 *
		 * For {@link DocumentPasteEditProvider.providerDocumentPasteEdits paste operations}, each provider will be invoked
		 * and can return one or more {@linkcode DocumentPasteEdit DocumentPasteEdits}. The edits are sorted using
		 * the {@linkcode DocumentPasteEdit.yieldTo} property. By default the first edit will be applied
		 * and the rest of the edits will be shown to the user as selectable paste options in the paste widget.
		 *
		 * @param selector A selector that defines the documents this provider applies to.
		 * @param provider A paste editor provider.
		 * @param metadata Additional metadata about the provider.
		 *
		 * @returns A {@linkcode Disposable} that unregisters this provider when disposed of.
		 */
		export function registerDocumentPasteEditProvider(selector: DocumentSelector, provider: DocumentPasteEditProvider, metadata: DocumentPasteProviderMetadata): Disposable;


		/**
		 * Set a {@link LanguageConfiguration language configuration} for a language.
		 *
		 * @param language A language identifier like `typescript`.
		 * @param configuration Language configuration.
		 * @returns A {@link Disposable} that unsets this configuration.
		 */
		export function setLanguageConfiguration(language: string, configuration: LanguageConfiguration): Disposable;
	}

	/**
	 * Represents a notebook editor that is attached to a {@link NotebookDocument notebook}.
	 */
	export enum NotebookEditorRevealType {
		/**
		 * The range will be revealed with as little scrolling as possible.
		 */
		Default = 0,

		/**
		 * The range will always be revealed in the center of the viewport.
		 */
		InCenter = 1,

		/**
		 * If the range is outside the viewport, it will be revealed in the center of the viewport.
		 * Otherwise, it will be revealed with as little scrolling as possible.
		 */
		InCenterIfOutsideViewport = 2,

		/**
		 * The range will always be revealed at the top of the viewport.
		 */
		AtTop = 3
	}

	/**
	 * Represents a notebook editor that is attached to a {@link NotebookDocument notebook}.
	 * Additional properties of the NotebookEditor are available in the proposed
	 * API, which will be finalized later.
	 */
	export interface NotebookEditor {

		/**
		 * The {@link NotebookDocument notebook document} associated with this notebook editor.
		 */
		readonly notebook: NotebookDocument;

		/**
		 * The primary selection in this notebook editor.
		 */
		selection: NotebookRange;

		/**
		 * All selections in this notebook editor.
		 *
		 * The primary selection (or focused range) is `selections[0]`. When the document has no cells, the primary selection is empty `{ start: 0, end: 0 }`;
		 */
		selections: readonly NotebookRange[];

		/**
		 * The current visible ranges in the editor (vertically).
		 */
		readonly visibleRanges: readonly NotebookRange[];

		/**
		 * The column in which this editor shows.
		 */
		readonly viewColumn?: ViewColumn;

		/**
		 * Scroll as indicated by `revealType` in order to reveal the given range.
		 *
		 * @param range A range.
		 * @param revealType The scrolling strategy for revealing `range`.
		 */
		revealRange(range: NotebookRange, revealType?: NotebookEditorRevealType): void;
	}

	/**
	 * Renderer messaging is used to communicate with a single renderer. It's returned from {@link notebooks.createRendererMessaging}.
	 */
	export interface NotebookRendererMessaging {
		/**
		 * An event that fires when a message is received from a renderer.
		 */
		readonly onDidReceiveMessage: Event<{
			/**
			 * The {@link NotebookEditor editor} that sent the message.
			 */
			readonly editor: NotebookEditor;
			/**
			 * The actual message.
			 */
			readonly message: any;
		}>;

		/**
		 * Send a message to one or all renderer.
		 *
		 * @param message Message to send
		 * @param editor Editor to target with the message. If not provided, the
		 * message is sent to all renderers.
		 * @returns a boolean indicating whether the message was successfully
		 * delivered to any renderer.
		 */
		postMessage(message: any, editor?: NotebookEditor): Thenable<boolean>;
	}

	/**
	 * A notebook cell kind.
	 */
	export enum NotebookCellKind {

		/**
		 * A markup-cell is formatted source that is used for display.
		 */
		Markup = 1,

		/**
		 * A code-cell is source that can be {@link NotebookController executed} and that
		 * produces {@link NotebookCellOutput output}.
		 */
		Code = 2
	}

	/**
	 * Represents a cell of a {@link NotebookDocument notebook}, either a {@link NotebookCellKind.Code code}-cell
	 * or {@link NotebookCellKind.Markup markup}-cell.
	 *
	 * NotebookCell instances are immutable and are kept in sync for as long as they are part of their notebook.
	 */
	export interface NotebookCell {

		/**
		 * The index of this cell in its {@link NotebookDocument.cellAt containing notebook}. The
		 * index is updated when a cell is moved within its notebook. The index is `-1`
		 * when the cell has been removed from its notebook.
		 */
		readonly index: number;

		/**
		 * The {@link NotebookDocument notebook} that contains this cell.
		 */
		readonly notebook: NotebookDocument;

		/**
		 * The kind of this cell.
		 */
		readonly kind: NotebookCellKind;

		/**
		 * The {@link TextDocument text} of this cell, represented as text document.
		 */
		readonly document: TextDocument;

		/**
		 * The metadata of this cell. Can be anything but must be JSON-stringifyable.
		 */
		readonly metadata: { readonly [key: string]: any };

		/**
		 * The outputs of this cell.
		 */
		readonly outputs: readonly NotebookCellOutput[];

		/**
		 * The most recent {@link NotebookCellExecutionSummary execution summary} for this cell.
		 */
		readonly executionSummary: NotebookCellExecutionSummary | undefined;
	}

	/**
	 * Represents a notebook which itself is a sequence of {@link NotebookCell code or markup cells}. Notebook documents are
	 * created from {@link NotebookData notebook data}.
	 */
	export interface NotebookDocument {

		/**
		 * The associated uri for this notebook.
		 *
		 * *Note* that most notebooks use the `file`-scheme, which means they are files on disk. However, **not** all notebooks are
		 * saved on disk and therefore the `scheme` must be checked before trying to access the underlying file or siblings on disk.
		 *
		 * @see {@link FileSystemProvider}
		 */
		readonly uri: Uri;

		/**
		 * The type of notebook.
		 */
		readonly notebookType: string;

		/**
		 * The version number of this notebook (it will strictly increase after each
		 * change, including undo/redo).
		 */
		readonly version: number;

		/**
		 * `true` if there are unpersisted changes.
		 */
		readonly isDirty: boolean;

		/**
		 * Is this notebook representing an untitled file which has not been saved yet.
		 */
		readonly isUntitled: boolean;

		/**
		 * `true` if the notebook has been closed. A closed notebook isn't synchronized anymore
		 * and won't be re-used when the same resource is opened again.
		 */
		readonly isClosed: boolean;

		/**
		 * Arbitrary metadata for this notebook. Can be anything but must be JSON-stringifyable.
		 */
		readonly metadata: { [key: string]: any };

		/**
		 * The number of cells in the notebook.
		 */
		readonly cellCount: number;

		/**
		 * Return the cell at the specified index. The index will be adjusted to the notebook.
		 *
		 * @param index - The index of the cell to retrieve.
		 * @returns A {@link NotebookCell cell}.
		 */
		cellAt(index: number): NotebookCell;

		/**
		 * Get the cells of this notebook. A subset can be retrieved by providing
		 * a range. The range will be adjusted to the notebook.
		 *
		 * @param range A notebook range.
		 * @returns The cells contained by the range or all cells.
		 */
		getCells(range?: NotebookRange): NotebookCell[];

		/**
		 * Save the document. The saving will be handled by the corresponding {@link NotebookSerializer serializer}.
		 *
		 * @returns A promise that will resolve to true when the document
		 * has been saved. Will return false if the file was not dirty or when save failed.
		 */
		save(): Thenable<boolean>;
	}

	/**
	 * Describes a change to a notebook cell.
	 *
	 * @see {@link NotebookDocumentChangeEvent}
	 */
	export interface NotebookDocumentCellChange {

		/**
		 * The affected cell.
		 */
		readonly cell: NotebookCell;

		/**
		 * The document of the cell or `undefined` when it did not change.
		 *
		 * *Note* that you should use the {@link workspace.onDidChangeTextDocument onDidChangeTextDocument}-event
		 * for detailed change information, like what edits have been performed.
		 */
		readonly document: TextDocument | undefined;

		/**
		 * The new metadata of the cell or `undefined` when it did not change.
		 */
		readonly metadata: { [key: string]: any } | undefined;

		/**
		 * The new outputs of the cell or `undefined` when they did not change.
		 */
		readonly outputs: readonly NotebookCellOutput[] | undefined;

		/**
		 * The new execution summary of the cell or `undefined` when it did not change.
		 */
		readonly executionSummary: NotebookCellExecutionSummary | undefined;
	}

	/**
	 * Describes a structural change to a notebook document, e.g newly added and removed cells.
	 *
	 * @see {@link NotebookDocumentChangeEvent}
	 */
	export interface NotebookDocumentContentChange {

		/**
		 * The range at which cells have been either added or removed.
		 *
		 * Note that no cells have been {@link NotebookDocumentContentChange.removedCells removed}
		 * when this range is {@link NotebookRange.isEmpty empty}.
		 */
		readonly range: NotebookRange;

		/**
		 * Cells that have been added to the document.
		 */
		readonly addedCells: readonly NotebookCell[];

		/**
		 * Cells that have been removed from the document.
		 */
		readonly removedCells: readonly NotebookCell[];
	}

	/**
	 * An event describing a transactional {@link NotebookDocument notebook} change.
	 */
	export interface NotebookDocumentChangeEvent {

		/**
		 * The affected notebook.
		 */
		readonly notebook: NotebookDocument;

		/**
		 * The new metadata of the notebook or `undefined` when it did not change.
		 */
		readonly metadata: { [key: string]: any } | undefined;

		/**
		 * An array of content changes describing added or removed {@link NotebookCell cells}.
		 */
		readonly contentChanges: readonly NotebookDocumentContentChange[];

		/**
		 * An array of {@link NotebookDocumentCellChange cell changes}.
		 */
		readonly cellChanges: readonly NotebookDocumentCellChange[];
	}

	/**
	 * An event that is fired when a {@link NotebookDocument notebook document} will be saved.
	 *
	 * To make modifications to the document before it is being saved, call the
	 * {@linkcode NotebookDocumentWillSaveEvent.waitUntil waitUntil}-function with a thenable
	 * that resolves to a {@link WorkspaceEdit workspace edit}.
	 */
	export interface NotebookDocumentWillSaveEvent {
		/**
		 * A cancellation token.
		 */
		readonly token: CancellationToken;

		/**
		 * The {@link NotebookDocument notebook document} that will be saved.
		 */
		readonly notebook: NotebookDocument;

		/**
		 * The reason why save was triggered.
		 */
		readonly reason: TextDocumentSaveReason;

		/**
		 * Allows to pause the event loop and to apply {@link WorkspaceEdit workspace edit}.
		 * Edits of subsequent calls to this function will be applied in order. The
		 * edits will be *ignored* if concurrent modifications of the notebook document happened.
		 *
		 * *Note:* This function can only be called during event dispatch and not
		 * in an asynchronous manner:
		 *
		 * ```ts
		 * workspace.onWillSaveNotebookDocument(event => {
		 * 	// async, will *throw* an error
		 * 	setTimeout(() => event.waitUntil(promise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntil(promise);
		 * })
		 * ```
		 *
		 * @param thenable A thenable that resolves to {@link WorkspaceEdit workspace edit}.
		 */
		waitUntil(thenable: Thenable<WorkspaceEdit>): void;

		/**
		 * Allows to pause the event loop until the provided thenable resolved.
		 *
		 * *Note:* This function can only be called during event dispatch.
		 *
		 * @param thenable A thenable that delays saving.
		 */
		waitUntil(thenable: Thenable<any>): void;
	}

	/**
	 * The summary of a notebook cell execution.
	 */
	export interface NotebookCellExecutionSummary {

		/**
		 * The order in which the execution happened.
		 */
		readonly executionOrder?: number;

		/**
		 * If the execution finished successfully.
		 */
		readonly success?: boolean;

		/**
		 * The times at which execution started and ended, as unix timestamps
		 */
		readonly timing?: {
			/**
			 * Execution start time.
			 */
			readonly startTime: number;
			/**
			 * Execution end time.
			 */
			readonly endTime: number;
		};
	}

	/**
	 * A notebook range represents an ordered pair of two cell indices.
	 * It is guaranteed that start is less than or equal to end.
	 */
	export class NotebookRange {

		/**
		 * The zero-based start index of this range.
		 */
		readonly start: number;

		/**
		 * The exclusive end index of this range (zero-based).
		 */
		readonly end: number;

		/**
		 * `true` if `start` and `end` are equal.
		 */
		readonly isEmpty: boolean;

		/**
		 * Create a new notebook range. If `start` is not
		 * before or equal to `end`, the values will be swapped.
		 *
		 * @param start start index
		 * @param end end index.
		 */
		constructor(start: number, end: number);

		/**
		 * Derive a new range for this range.
		 *
		 * @param change An object that describes a change to this range.
		 * @returns A range that reflects the given change. Will return `this` range if the change
		 * is not changing anything.
		 */
		with(change: {
			/**
			 * New start index, defaults to `this.start`.
			 */
			start?: number;
			/**
			 * New end index, defaults to `this.end`.
			 */
			end?: number;
		}): NotebookRange;
	}

	/**
	 * One representation of a {@link NotebookCellOutput notebook output}, defined by MIME type and data.
	 */
	export class NotebookCellOutputItem {

		/**
		 * Factory function to create a `NotebookCellOutputItem` from a string.
		 *
		 * *Note* that an UTF-8 encoder is used to create bytes for the string.
		 *
		 * @param value A string.
		 * @param mime Optional MIME type, defaults to `text/plain`.
		 * @returns A new output item object.
		 */
		static text(value: string, mime?: string): NotebookCellOutputItem;

		/**
		 * Factory function to create a `NotebookCellOutputItem` from
		 * a JSON object.
		 *
		 * *Note* that this function is not expecting "stringified JSON" but
		 * an object that can be stringified. This function will throw an error
		 * when the passed value cannot be JSON-stringified.
		 *
		 * @param value A JSON-stringifyable value.
		 * @param mime Optional MIME type, defaults to `application/json`
		 * @returns A new output item object.
		 */
		static json(value: any, mime?: string): NotebookCellOutputItem;

		/**
		 * Factory function to create a `NotebookCellOutputItem` that uses
		 * uses the `application/vnd.code.notebook.stdout` mime type.
		 *
		 * @param value A string.
		 * @returns A new output item object.
		 */
		static stdout(value: string): NotebookCellOutputItem;

		/**
		 * Factory function to create a `NotebookCellOutputItem` that uses
		 * uses the `application/vnd.code.notebook.stderr` mime type.
		 *
		 * @param value A string.
		 * @returns A new output item object.
		 */
		static stderr(value: string): NotebookCellOutputItem;

		/**
		 * Factory function to create a `NotebookCellOutputItem` that uses
		 * uses the `application/vnd.code.notebook.error` mime type.
		 *
		 * @param value An error object.
		 * @returns A new output item object.
		 */
		static error(value: Error): NotebookCellOutputItem;

		/**
		 * The mime type which determines how the {@linkcode NotebookCellOutputItem.data data}-property
		 * is interpreted.
		 *
		 * Notebooks have built-in support for certain mime-types, extensions can add support for new
		 * types and override existing types.
		 */
		mime: string;

		/**
		 * The data of this output item. Must always be an array of unsigned 8-bit integers.
		 */
		data: Uint8Array;

		/**
		 * Create a new notebook cell output item.
		 *
		 * @param data The value of the output item.
		 * @param mime The mime type of the output item.
		 */
		constructor(data: Uint8Array, mime: string);
	}

	/**
	 * Notebook cell output represents a result of executing a cell. It is a container type for multiple
	 * {@link NotebookCellOutputItem output items} where contained items represent the same result but
	 * use different MIME types.
	 */
	export class NotebookCellOutput {

		/**
		 * The output items of this output. Each item must represent the same result. _Note_ that repeated
		 * MIME types per output is invalid and that the editor will just pick one of them.
		 *
		 * ```ts
		 * new vscode.NotebookCellOutput([
		 * 	vscode.NotebookCellOutputItem.text('Hello', 'text/plain'),
		 * 	vscode.NotebookCellOutputItem.text('<i>Hello</i>', 'text/html'),
		 * 	vscode.NotebookCellOutputItem.text('_Hello_', 'text/markdown'),
		 * 	vscode.NotebookCellOutputItem.text('Hey', 'text/plain'), // INVALID: repeated type, editor will pick just one
		 * ])
		 * ```
		 */
		items: NotebookCellOutputItem[];

		/**
		 * Arbitrary metadata for this cell output. Can be anything but must be JSON-stringifyable.
		 */
		metadata?: { [key: string]: any };

		/**
		 * Create new notebook output.
		 *
		 * @param items Notebook output items.
		 * @param metadata Optional metadata.
		 */
		constructor(items: NotebookCellOutputItem[], metadata?: { [key: string]: any });
	}

	/**
	 * NotebookCellData is the raw representation of notebook cells. Its is part of {@linkcode NotebookData}.
	 */
	export class NotebookCellData {

		/**
		 * The {@link NotebookCellKind kind} of this cell data.
		 */
		kind: NotebookCellKind;

		/**
		 * The source value of this cell data - either source code or formatted text.
		 */
		value: string;

		/**
		 * The language identifier of the source value of this cell data. Any value from
		 * {@linkcode languages.getLanguages getLanguages} is possible.
		 */
		languageId: string;

		/**
		 * The outputs of this cell data.
		 */
		outputs?: NotebookCellOutput[];

		/**
		 * Arbitrary metadata of this cell data. Can be anything but must be JSON-stringifyable.
		 */
		metadata?: { [key: string]: any };

		/**
		 * The execution summary of this cell data.
		 */
		executionSummary?: NotebookCellExecutionSummary;

		/**
		 * Create new cell data. Minimal cell data specifies its kind, its source value, and the
		 * language identifier of its source.
		 *
		 * @param kind The kind.
		 * @param value The source value.
		 * @param languageId The language identifier of the source value.
		 */
		constructor(kind: NotebookCellKind, value: string, languageId: string);
	}

	/**
	 * Raw representation of a notebook.
	 *
	 * Extensions are responsible for creating {@linkcode NotebookData} so that the editor
	 * can create a {@linkcode NotebookDocument}.
	 *
	 * @see {@link NotebookSerializer}
	 */
	export class NotebookData {
		/**
		 * The cell data of this notebook data.
		 */
		cells: NotebookCellData[];

		/**
		 * Arbitrary metadata of notebook data.
		 */
		metadata?: { [key: string]: any };

		/**
		 * Create new notebook data.
		 *
		 * @param cells An array of cell data.
		 */
		constructor(cells: NotebookCellData[]);
	}

	/**
	 * The notebook serializer enables the editor to open notebook files.
	 *
	 * At its core the editor only knows a {@link NotebookData notebook data structure} but not
	 * how that data structure is written to a file, nor how it is read from a file. The
	 * notebook serializer bridges this gap by deserializing bytes into notebook data and
	 * vice versa.
	 */
	export interface NotebookSerializer {

		/**
		 * Deserialize contents of a notebook file into the notebook data structure.
		 *
		 * @param content Contents of a notebook file.
		 * @param token A cancellation token.
		 * @returns Notebook data or a thenable that resolves to such.
		 */
		deserializeNotebook(content: Uint8Array, token: CancellationToken): NotebookData | Thenable<NotebookData>;

		/**
		 * Serialize notebook data into file contents.
		 *
		 * @param data A notebook data structure.
		 * @param token A cancellation token.
		 * @returns An array of bytes or a thenable that resolves to such.
		 */
		serializeNotebook(data: NotebookData, token: CancellationToken): Uint8Array | Thenable<Uint8Array>;
	}

	/**
	 * Notebook content options define what parts of a notebook are persisted. Note
	 *
	 * For instance, a notebook serializer can opt-out of saving outputs and in that case the editor doesn't mark a
	 * notebooks as {@link NotebookDocument.isDirty dirty} when its output has changed.
	 */
	export interface NotebookDocumentContentOptions {
		/**
		 * Controls if output change events will trigger notebook document content change events and
		 * if it will be used in the diff editor, defaults to false. If the content provider doesn't
		 * persist the outputs in the file document, this should be set to true.
		 */
		transientOutputs?: boolean;

		/**
		 * Controls if a cell metadata property change event will trigger notebook document content
		 * change events and if it will be used in the diff editor, defaults to false. If the
		 * content provider doesn't persist a metadata property in the file document, it should be
		 * set to true.
		 */
		transientCellMetadata?: { [key: string]: boolean | undefined };

		/**
		 * Controls if a document metadata property change event will trigger notebook document
		 * content change event and if it will be used in the diff editor, defaults to false. If the
		 * content provider doesn't persist a metadata property in the file document, it should be
		 * set to true.
		 */
		transientDocumentMetadata?: { [key: string]: boolean | undefined };
	}

	/**
	 * Notebook controller affinity for notebook documents.
	 *
	 * @see {@link NotebookController.updateNotebookAffinity}
	 */
	export enum NotebookControllerAffinity {
		/**
		 * Default affinity.
		 */
		Default = 1,
		/**
		 * A controller is preferred for a notebook.
		 */
		Preferred = 2
	}

	/**
	 * A notebook controller represents an entity that can execute notebook cells. This is often referred to as a kernel.
	 *
	 * There can be multiple controllers and the editor will let users choose which controller to use for a certain notebook. The
	 * {@linkcode NotebookController.notebookType notebookType}-property defines for what kind of notebooks a controller is for and
	 * the {@linkcode NotebookController.updateNotebookAffinity updateNotebookAffinity}-function allows controllers to set a preference
	 * for specific notebook documents. When a controller has been selected its
	 * {@link NotebookController.onDidChangeSelectedNotebooks onDidChangeSelectedNotebooks}-event fires.
	 *
	 * When a cell is being run the editor will invoke the {@linkcode NotebookController.executeHandler executeHandler} and a controller
	 * is expected to create and finalize a {@link NotebookCellExecution notebook cell execution}. However, controllers are also free
	 * to create executions by themselves.
	 */
	export interface NotebookController {

		/**
		 * The identifier of this notebook controller.
		 *
		 * _Note_ that controllers are remembered by their identifier and that extensions should use
		 * stable identifiers across sessions.
		 */
		readonly id: string;

		/**
		 * The notebook type this controller is for.
		 */
		readonly notebookType: string;

		/**
		 * An array of language identifiers that are supported by this
		 * controller. Any language identifier from {@linkcode languages.getLanguages getLanguages}
		 * is possible. When falsy all languages are supported.
		 *
		 * Samples:
		 * ```js
		 * // support JavaScript and TypeScript
		 * myController.supportedLanguages = ['javascript', 'typescript']
		 *
		 * // support all languages
		 * myController.supportedLanguages = undefined; // falsy
		 * myController.supportedLanguages = []; // falsy
		 * ```
		 */
		supportedLanguages?: string[];

		/**
		 * The human-readable label of this notebook controller.
		 */
		label: string;

		/**
		 * The human-readable description which is rendered less prominent.
		 */
		description?: string;

		/**
		 * The human-readable detail which is rendered less prominent.
		 */
		detail?: string;

		/**
		 * Whether this controller supports execution order so that the
		 * editor can render placeholders for them.
		 */
		supportsExecutionOrder?: boolean;

		/**
		 * Create a cell execution task.
		 *
		 * _Note_ that there can only be one execution per cell at a time and that an error is thrown if
		 * a cell execution is created while another is still active.
		 *
		 * This should be used in response to the {@link NotebookController.executeHandler execution handler}
		 * being called or when cell execution has been started else, e.g when a cell was already
		 * executing or when cell execution was triggered from another source.
		 *
		 * @param cell The notebook cell for which to create the execution.
		 * @returns A notebook cell execution.
		 */
		createNotebookCellExecution(cell: NotebookCell): NotebookCellExecution;

		/**
		 * The execute handler is invoked when the run gestures in the UI are selected, e.g Run Cell, Run All,
		 * Run Selection etc. The execute handler is responsible for creating and managing {@link NotebookCellExecution execution}-objects.
		 */
		executeHandler: (cells: NotebookCell[], notebook: NotebookDocument, controller: NotebookController) => void | Thenable<void>;

		/**
		 * Optional interrupt handler.
		 *
		 * By default cell execution is canceled via {@link NotebookCellExecution.token tokens}. Cancellation
		 * tokens require that a controller can keep track of its execution so that it can cancel a specific execution at a later
		 * point. Not all scenarios allow for that, eg. REPL-style controllers often work by interrupting whatever is currently
		 * running. For those cases the interrupt handler exists - it can be thought of as the equivalent of `SIGINT`
		 * or `Control+C` in terminals.
		 *
		 * _Note_ that supporting {@link NotebookCellExecution.token cancellation tokens} is preferred and that interrupt handlers should
		 * only be used when tokens cannot be supported.
		 */
		interruptHandler?: (notebook: NotebookDocument) => void | Thenable<void>;

		/**
		 * An event that fires whenever a controller has been selected or un-selected for a notebook document.
		 *
		 * There can be multiple controllers for a notebook and in that case a controllers needs to be _selected_. This is a user gesture
		 * and happens either explicitly or implicitly when interacting with a notebook for which a controller was _suggested_. When possible,
		 * the editor _suggests_ a controller that is most likely to be _selected_.
		 *
		 * _Note_ that controller selection is persisted (by the controllers {@link NotebookController.id id}) and restored as soon as a
		 * controller is re-created or as a notebook is {@link workspace.onDidOpenNotebookDocument opened}.
		 */
		readonly onDidChangeSelectedNotebooks: Event<{
			/**
			 * The notebook for which the controller has been selected or un-selected.
			 */
			readonly notebook: NotebookDocument;
			/**
			 * Whether the controller has been selected or un-selected.
			 */
			readonly selected: boolean;
		}>;

		/**
		 * A controller can set affinities for specific notebook documents. This allows a controller
		 * to be presented more prominent for some notebooks.
		 *
		 * @param notebook The notebook for which a priority is set.
		 * @param affinity A controller affinity
		 */
		updateNotebookAffinity(notebook: NotebookDocument, affinity: NotebookControllerAffinity): void;

		/**
		 * Dispose and free associated resources.
		 */
		dispose(): void;
	}

	/**
	 * A NotebookCellExecution is how {@link NotebookController notebook controller} modify a notebook cell as
	 * it is executing.
	 *
	 * When a cell execution object is created, the cell enters the {@linkcode NotebookCellExecutionState.Pending Pending} state.
	 * When {@linkcode NotebookCellExecution.start start(...)} is called on the execution task, it enters the {@linkcode NotebookCellExecutionState.Executing Executing} state. When
	 * {@linkcode NotebookCellExecution.end end(...)} is called, it enters the {@linkcode NotebookCellExecutionState.Idle Idle} state.
	 */
	export interface NotebookCellExecution {

		/**
		 * The {@link NotebookCell cell} for which this execution has been created.
		 */
		readonly cell: NotebookCell;

		/**
		 * A cancellation token which will be triggered when the cell execution is canceled
		 * from the UI.
		 *
		 * _Note_ that the cancellation token will not be triggered when the {@link NotebookController controller}
		 * that created this execution uses an {@link NotebookController.interruptHandler interrupt-handler}.
		 */
		readonly token: CancellationToken;

		/**
		 * Set and unset the order of this cell execution.
		 */
		executionOrder: number | undefined;

		/**
		 * Signal that the execution has begun.
		 *
		 * @param startTime The time that execution began, in milliseconds in the Unix epoch. Used to drive the clock
		 * that shows for how long a cell has been running. If not given, the clock won't be shown.
		 */
		start(startTime?: number): void;

		/**
		 * Signal that execution has ended.
		 *
		 * @param success If true, a green check is shown on the cell status bar.
		 * If false, a red X is shown.
		 * If undefined, no check or X icon is shown.
		 * @param endTime The time that execution finished, in milliseconds in the Unix epoch.
		 */
		end(success: boolean | undefined, endTime?: number): void;

		/**
		 * Clears the output of the cell that is executing or of another cell that is affected by this execution.
		 *
		 * @param cell Cell for which output is cleared. Defaults to the {@link NotebookCellExecution.cell cell} of
		 * this execution.
		 * @returns A thenable that resolves when the operation finished.
		 */
		clearOutput(cell?: NotebookCell): Thenable<void>;

		/**
		 * Replace the output of the cell that is executing or of another cell that is affected by this execution.
		 *
		 * @param out Output that replaces the current output.
		 * @param cell Cell for which output is cleared. Defaults to the {@link NotebookCellExecution.cell cell} of
		 * this execution.
		 * @returns A thenable that resolves when the operation finished.
		 */
		replaceOutput(out: NotebookCellOutput | readonly NotebookCellOutput[], cell?: NotebookCell): Thenable<void>;

		/**
		 * Append to the output of the cell that is executing or to another cell that is affected by this execution.
		 *
		 * @param out Output that is appended to the current output.
		 * @param cell Cell for which output is cleared. Defaults to the {@link NotebookCellExecution.cell cell} of
		 * this execution.
		 * @returns A thenable that resolves when the operation finished.
		 */
		appendOutput(out: NotebookCellOutput | readonly NotebookCellOutput[], cell?: NotebookCell): Thenable<void>;

		/**
		 * Replace all output items of existing cell output.
		 *
		 * @param items Output items that replace the items of existing output.
		 * @param output Output object that already exists.
		 * @returns A thenable that resolves when the operation finished.
		 */
		replaceOutputItems(items: NotebookCellOutputItem | readonly NotebookCellOutputItem[], output: NotebookCellOutput): Thenable<void>;

		/**
		 * Append output items to existing cell output.
		 *
		 * @param items Output items that are append to existing output.
		 * @param output Output object that already exists.
		 * @returns A thenable that resolves when the operation finished.
		 */
		appendOutputItems(items: NotebookCellOutputItem | readonly NotebookCellOutputItem[], output: NotebookCellOutput): Thenable<void>;
	}

	/**
	 * Represents the alignment of status bar items.
	 */
	export enum NotebookCellStatusBarAlignment {

		/**
		 * Aligned to the left side.
		 */
		Left = 1,

		/**
		 * Aligned to the right side.
		 */
		Right = 2
	}

	/**
	 * A contribution to a cell's status bar
	 */
	export class NotebookCellStatusBarItem {
		/**
		 * The text to show for the item.
		 */
		text: string;

		/**
		 * Whether the item is aligned to the left or right.
		 */
		alignment: NotebookCellStatusBarAlignment;

		/**
		 * An optional {@linkcode Command} or identifier of a command to run on click.
		 *
		 * The command must be {@link commands.getCommands known}.
		 *
		 * Note that if this is a {@linkcode Command} object, only the {@linkcode Command.command command} and {@linkcode Command.arguments arguments}
		 * are used by the editor.
		 */
		command?: string | Command;

		/**
		 * A tooltip to show when the item is hovered.
		 */
		tooltip?: string;

		/**
		 * The priority of the item. A higher value item will be shown more to the left.
		 */
		priority?: number;

		/**
		 * Accessibility information used when a screen reader interacts with this item.
		 */
		accessibilityInformation?: AccessibilityInformation;

		/**
		 * Creates a new NotebookCellStatusBarItem.
		 * @param text The text to show for the item.
		 * @param alignment Whether the item is aligned to the left or right.
		 */
		constructor(text: string, alignment: NotebookCellStatusBarAlignment);
	}

	/**
	 * A provider that can contribute items to the status bar that appears below a cell's editor.
	 */
	export interface NotebookCellStatusBarItemProvider {
		/**
		 * An optional event to signal that statusbar items have changed. The provide method will be called again.
		 */
		onDidChangeCellStatusBarItems?: Event<void>;

		/**
		 * The provider will be called when the cell scrolls into view, when its content, outputs, language, or metadata change, and when it changes execution state.
		 * @param cell The cell for which to return items.
		 * @param token A token triggered if this request should be cancelled.
		 * @returns One or more {@link NotebookCellStatusBarItem cell statusbar items}
		 */
		provideCellStatusBarItems(cell: NotebookCell, token: CancellationToken): ProviderResult<NotebookCellStatusBarItem | NotebookCellStatusBarItem[]>;
	}

	/**
	 * Namespace for notebooks.
	 *
	 * The notebooks functionality is composed of three loosely coupled components:
	 *
	 * 1. {@link NotebookSerializer} enable the editor to open, show, and save notebooks
	 * 2. {@link NotebookController} own the execution of notebooks, e.g they create output from code cells.
	 * 3. NotebookRenderer present notebook output in the editor. They run in a separate context.
	 */
	export namespace notebooks {

		/**
		 * Creates a new notebook controller.
		 *
		 * @param id Identifier of the controller. Must be unique per extension.
		 * @param notebookType A notebook type for which this controller is for.
		 * @param label The label of the controller.
		 * @param handler The execute-handler of the controller.
		 * @returns A new notebook controller.
		 */
		export function createNotebookController(id: string, notebookType: string, label: string, handler?: (cells: NotebookCell[], notebook: NotebookDocument, controller: NotebookController) => void | Thenable<void>): NotebookController;

		/**
		 * Register a {@link NotebookCellStatusBarItemProvider cell statusbar item provider} for the given notebook type.
		 *
		 * @param notebookType The notebook type to register for.
		 * @param provider A cell status bar provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerNotebookCellStatusBarItemProvider(notebookType: string, provider: NotebookCellStatusBarItemProvider): Disposable;

		/**
		 * Creates a new messaging instance used to communicate with a specific renderer.
		 *
		 * * *Note 1:* Extensions can only create renderer that they have defined in their `package.json`-file
		 * * *Note 2:* A renderer only has access to messaging if `requiresMessaging` is set to `always` or `optional` in
		 * its `notebookRenderer` contribution.
		 *
		 * @param rendererId The renderer ID to communicate with
		 * @returns A new notebook renderer messaging object.
		 */
		export function createRendererMessaging(rendererId: string): NotebookRendererMessaging;
	}

	/**
	 * Represents the input box in the Source Control viewlet.
	 */
	export interface SourceControlInputBox {

		/**
		 * Setter and getter for the contents of the input box.
		 */
		value: string;

		/**
		 * A string to show as placeholder in the input box to guide the user.
		 */
		placeholder: string;

		/**
		 * Controls whether the input box is enabled (default is `true`).
		 */
		enabled: boolean;

		/**
		 * Controls whether the input box is visible (default is `true`).
		 */
		visible: boolean;
	}

	/**
	 * A quick diff provider provides a {@link Uri uri} to the original state of a
	 * modified resource. The editor will use this information to render ad'hoc diffs
	 * within the text.
	 */
	export interface QuickDiffProvider {

		/**
		 * Provide a {@link Uri} to the original resource of any given resource uri.
		 *
		 * @param uri The uri of the resource open in a text editor.
		 * @param token A cancellation token.
		 * @returns A thenable that resolves to uri of the matching original resource.
		 */
		provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri>;
	}

	/**
	 * The theme-aware decorations for a
	 * {@link SourceControlResourceState source control resource state}.
	 */
	export interface SourceControlResourceThemableDecorations {

		/**
		 * The icon path for a specific
		 * {@link SourceControlResourceState source control resource state}.
		 */
		readonly iconPath?: string | Uri | ThemeIcon;
	}

	/**
	 * The decorations for a {@link SourceControlResourceState source control resource state}.
	 * Can be independently specified for light and dark themes.
	 */
	export interface SourceControlResourceDecorations extends SourceControlResourceThemableDecorations {

		/**
		 * Whether the {@link SourceControlResourceState source control resource state} should
		 * be striked-through in the UI.
		 */
		readonly strikeThrough?: boolean;

		/**
		 * Whether the {@link SourceControlResourceState source control resource state} should
		 * be faded in the UI.
		 */
		readonly faded?: boolean;

		/**
		 * The title for a specific
		 * {@link SourceControlResourceState source control resource state}.
		 */
		readonly tooltip?: string;

		/**
		 * The light theme decorations.
		 */
		readonly light?: SourceControlResourceThemableDecorations;

		/**
		 * The dark theme decorations.
		 */
		readonly dark?: SourceControlResourceThemableDecorations;
	}

	/**
	 * An source control resource state represents the state of an underlying workspace
	 * resource within a certain {@link SourceControlResourceGroup source control group}.
	 */
	export interface SourceControlResourceState {

		/**
		 * The {@link Uri} of the underlying resource inside the workspace.
		 */
		readonly resourceUri: Uri;

		/**
		 * The {@link Command} which should be run when the resource
		 * state is open in the Source Control viewlet.
		 */
		readonly command?: Command;

		/**
		 * The {@link SourceControlResourceDecorations decorations} for this source control
		 * resource state.
		 */
		readonly decorations?: SourceControlResourceDecorations;

		/**
		 * Context value of the resource state. This can be used to contribute resource specific actions.
		 * For example, if a resource is given a context value as `diffable`. When contributing actions to `scm/resourceState/context`
		 * using `menus` extension point, you can specify context value for key `scmResourceState` in `when` expressions, like `scmResourceState == diffable`.
		 * ```json
		 * "contributes": {
		 *   "menus": {
		 *     "scm/resourceState/context": [
		 *       {
		 *         "command": "extension.diff",
		 *         "when": "scmResourceState == diffable"
		 *       }
		 *     ]
		 *   }
		 * }
		 * ```
		 * This will show action `extension.diff` only for resources with `contextValue` is `diffable`.
		 */
		readonly contextValue?: string;
	}

	/**
	 * A source control resource group is a collection of
	 * {@link SourceControlResourceState source control resource states}.
	 */
	export interface SourceControlResourceGroup {

		/**
		 * The id of this source control resource group.
		 */
		readonly id: string;

		/**
		 * The label of this source control resource group.
		 */
		label: string;

		/**
		 * Whether this source control resource group is hidden when it contains
		 * no {@link SourceControlResourceState source control resource states}.
		 */
		hideWhenEmpty?: boolean;

		/**
		 * Context value of the resource group. This can be used to contribute resource group specific actions.
		 * For example, if a resource group is given a context value of `exportable`, when contributing actions to `scm/resourceGroup/context`
		 * using `menus` extension point, you can specify context value for key `scmResourceGroupState` in `when` expressions, like `scmResourceGroupState == exportable`.
		 * ```json
		 * "contributes": {
		 *   "menus": {
		 *     "scm/resourceGroup/context": [
		 *       {
		 *         "command": "extension.export",
		 *         "when": "scmResourceGroupState == exportable"
		 *       }
		 *     ]
		 *   }
		 * }
		 * ```
		 * This will show action `extension.export` only for resource groups with `contextValue` equal to `exportable`.
		 */
		contextValue?: string;

		/**
		 * This group's collection of
		 * {@link SourceControlResourceState source control resource states}.
		 */
		resourceStates: SourceControlResourceState[];

		/**
		 * Dispose this source control resource group.
		 */
		dispose(): void;
	}

	/**
	 * An source control is able to provide {@link SourceControlResourceState resource states}
	 * to the editor and interact with the editor in several source control related ways.
	 */
	export interface SourceControl {

		/**
		 * The id of this source control.
		 */
		readonly id: string;

		/**
		 * The human-readable label of this source control.
		 */
		readonly label: string;

		/**
		 * The (optional) Uri of the root of this source control.
		 */
		readonly rootUri: Uri | undefined;

		/**
		 * The {@link SourceControlInputBox input box} for this source control.
		 */
		readonly inputBox: SourceControlInputBox;

		/**
		 * The UI-visible count of {@link SourceControlResourceState resource states} of
		 * this source control.
		 *
		 * If undefined, this source control will
		 * - display its UI-visible count as zero, and
		 * - contribute the count of its {@link SourceControlResourceState resource states} to the UI-visible aggregated count for all source controls
		 */
		count?: number;

		/**
		 * An optional {@link QuickDiffProvider quick diff provider}.
		 */
		quickDiffProvider?: QuickDiffProvider;

		/**
		 * Optional commit template string.
		 *
		 * The Source Control viewlet will populate the Source Control
		 * input with this value when appropriate.
		 */
		commitTemplate?: string;

		/**
		 * Optional accept input command.
		 *
		 * This command will be invoked when the user accepts the value
		 * in the Source Control input.
		 */
		acceptInputCommand?: Command;

		/**
		 * Optional status bar commands.
		 *
		 * These commands will be displayed in the editor's status bar.
		 */
		statusBarCommands?: Command[];

		/**
		 * Create a new {@link SourceControlResourceGroup resource group}.
		 */
		createResourceGroup(id: string, label: string): SourceControlResourceGroup;

		/**
		 * Dispose this source control.
		 */
		dispose(): void;
	}

	/**
	 * Namespace for source control management.
	 */
	export namespace scm {

		/**
		 * The {@link SourceControlInputBox input box} for the last source control
		 * created by the extension.
		 *
		 * @deprecated Use SourceControl.inputBox instead
		 */
		export const inputBox: SourceControlInputBox;

		/**
		 * Creates a new {@link SourceControl source control} instance.
		 *
		 * @param id An `id` for the source control. Something short, e.g.: `git`.
		 * @param label A human-readable string for the source control. E.g.: `Git`.
		 * @param rootUri An optional Uri of the root of the source control. E.g.: `Uri.parse(workspaceRoot)`.
		 * @returns An instance of {@link SourceControl source control}.
		 */
		export function createSourceControl(id: string, label: string, rootUri?: Uri): SourceControl;
	}

	/**
	 * A DebugProtocolMessage is an opaque stand-in type for the [ProtocolMessage](https://microsoft.github.io/debug-adapter-protocol/specification#Base_Protocol_ProtocolMessage) type defined in the Debug Adapter Protocol.
	 */
	export interface DebugProtocolMessage {
		// Properties: see [ProtocolMessage details](https://microsoft.github.io/debug-adapter-protocol/specification#Base_Protocol_ProtocolMessage).
	}

	/**
	 * A DebugProtocolSource is an opaque stand-in type for the [Source](https://microsoft.github.io/debug-adapter-protocol/specification#Types_Source) type defined in the Debug Adapter Protocol.
	 */
	export interface DebugProtocolSource {
		// Properties: see [Source details](https://microsoft.github.io/debug-adapter-protocol/specification#Types_Source).
	}

	/**
	 * A DebugProtocolBreakpoint is an opaque stand-in type for the [Breakpoint](https://microsoft.github.io/debug-adapter-protocol/specification#Types_Breakpoint) type defined in the Debug Adapter Protocol.
	 */
	export interface DebugProtocolBreakpoint {
		// Properties: see [Breakpoint details](https://microsoft.github.io/debug-adapter-protocol/specification#Types_Breakpoint).
	}

	/**
	 * Configuration for a debug session.
	 */
	export interface DebugConfiguration {
		/**
		 * The type of the debug session.
		 */
		type: string;

		/**
		 * The name of the debug session.
		 */
		name: string;

		/**
		 * The request type of the debug session.
		 */
		request: string;

		/**
		 * Additional debug type specific properties.
		 */
		[key: string]: any;
	}

	/**
	 * A debug session.
	 */
	export interface DebugSession {

		/**
		 * The unique ID of this debug session.
		 */
		readonly id: string;

		/**
		 * The debug session's type from the {@link DebugConfiguration debug configuration}.
		 */
		readonly type: string;

		/**
		 * The parent session of this debug session, if it was created as a child.
		 * @see DebugSessionOptions.parentSession
		 */
		readonly parentSession?: DebugSession;

		/**
		 * The debug session's name is initially taken from the {@link DebugConfiguration debug configuration}.
		 * Any changes will be properly reflected in the UI.
		 */
		name: string;

		/**
		 * The workspace folder of this session or `undefined` for a folderless setup.
		 */
		readonly workspaceFolder: WorkspaceFolder | undefined;

		/**
		 * The "resolved" {@link DebugConfiguration debug configuration} of this session.
		 * "Resolved" means that
		 * - all variables have been substituted and
		 * - platform specific attribute sections have been "flattened" for the matching platform and removed for non-matching platforms.
		 */
		readonly configuration: DebugConfiguration;

		/**
		 * Send a custom request to the debug adapter.
		 */
		customRequest(command: string, args?: any): Thenable<any>;

		/**
		 * Maps a breakpoint in the editor to the corresponding Debug Adapter Protocol (DAP) breakpoint that is managed by the debug adapter of the debug session.
		 * If no DAP breakpoint exists (either because the editor breakpoint was not yet registered or because the debug adapter is not interested in the breakpoint), the value `undefined` is returned.
		 *
		 * @param breakpoint A {@link Breakpoint} in the editor.
		 * @returns A promise that resolves to the Debug Adapter Protocol breakpoint or `undefined`.
		 */
		getDebugProtocolBreakpoint(breakpoint: Breakpoint): Thenable<DebugProtocolBreakpoint | undefined>;
	}

	/**
	 * A custom Debug Adapter Protocol event received from a {@link DebugSession debug session}.
	 */
	export interface DebugSessionCustomEvent {
		/**
		 * The {@link DebugSession debug session} for which the custom event was received.
		 */
		readonly session: DebugSession;

		/**
		 * Type of event.
		 */
		readonly event: string;

		/**
		 * Event specific information.
		 */
		readonly body: any;
	}

	/**
	 * A debug configuration provider allows to add debug configurations to the debug service
	 * and to resolve launch configurations before they are used to start a debug session.
	 * A debug configuration provider is registered via {@link debug.registerDebugConfigurationProvider}.
	 */
	export interface DebugConfigurationProvider {
		/**
		 * Provides {@link DebugConfiguration debug configuration} to the debug service. If more than one debug configuration provider is
		 * registered for the same type, debug configurations are concatenated in arbitrary order.
		 *
		 * @param folder The workspace folder for which the configurations are used or `undefined` for a folderless setup.
		 * @param token A cancellation token.
		 * @returns An array of {@link DebugConfiguration debug configurations}.
		 */
		provideDebugConfigurations?(folder: WorkspaceFolder | undefined, token?: CancellationToken): ProviderResult<DebugConfiguration[]>;

		/**
		 * Resolves a {@link DebugConfiguration debug configuration} by filling in missing values or by adding/changing/removing attributes.
		 * If more than one debug configuration provider is registered for the same type, the resolveDebugConfiguration calls are chained
		 * in arbitrary order and the initial debug configuration is piped through the chain.
		 * Returning the value 'undefined' prevents the debug session from starting.
		 * Returning the value 'null' prevents the debug session from starting and opens the underlying debug configuration instead.
		 *
		 * @param folder The workspace folder from which the configuration originates from or `undefined` for a folderless setup.
		 * @param debugConfiguration The {@link DebugConfiguration debug configuration} to resolve.
		 * @param token A cancellation token.
		 * @returns The resolved debug configuration or undefined or null.
		 */
		resolveDebugConfiguration?(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration>;

		/**
		 * This hook is directly called after 'resolveDebugConfiguration' but with all variables substituted.
		 * It can be used to resolve or verify a {@link DebugConfiguration debug configuration} by filling in missing values or by adding/changing/removing attributes.
		 * If more than one debug configuration provider is registered for the same type, the 'resolveDebugConfigurationWithSubstitutedVariables' calls are chained
		 * in arbitrary order and the initial debug configuration is piped through the chain.
		 * Returning the value 'undefined' prevents the debug session from starting.
		 * Returning the value 'null' prevents the debug session from starting and opens the underlying debug configuration instead.
		 *
		 * @param folder The workspace folder from which the configuration originates from or `undefined` for a folderless setup.
		 * @param debugConfiguration The {@link DebugConfiguration debug configuration} to resolve.
		 * @param token A cancellation token.
		 * @returns The resolved debug configuration or undefined or null.
		 */
		resolveDebugConfigurationWithSubstitutedVariables?(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration>;
	}

	/**
	 * Represents a debug adapter executable and optional arguments and runtime options passed to it.
	 */
	export class DebugAdapterExecutable {

		/**
		 * Creates a description for a debug adapter based on an executable program.
		 *
		 * @param command The command or executable path that implements the debug adapter.
		 * @param args Optional arguments to be passed to the command or executable.
		 * @param options Optional options to be used when starting the command or executable.
		 */
		constructor(command: string, args?: string[], options?: DebugAdapterExecutableOptions);

		/**
		 * The command or path of the debug adapter executable.
		 * A command must be either an absolute path of an executable or the name of an command to be looked up via the PATH environment variable.
		 * The special value 'node' will be mapped to the editor's built-in Node.js runtime.
		 */
		readonly command: string;

		/**
		 * The arguments passed to the debug adapter executable. Defaults to an empty array.
		 */
		readonly args: string[];

		/**
		 * Optional options to be used when the debug adapter is started.
		 * Defaults to undefined.
		 */
		readonly options?: DebugAdapterExecutableOptions;
	}

	/**
	 * Options for a debug adapter executable.
	 */
	export interface DebugAdapterExecutableOptions {

		/**
		 * The additional environment of the executed program or shell. If omitted
		 * the parent process' environment is used. If provided it is merged with
		 * the parent process' environment.
		 */
		env?: { [key: string]: string };

		/**
		 * The current working directory for the executed debug adapter.
		 */
		cwd?: string;
	}

	/**
	 * Represents a debug adapter running as a socket based server.
	 */
	export class DebugAdapterServer {

		/**
		 * The port.
		 */
		readonly port: number;

		/**
		 * The host.
		 */
		readonly host?: string | undefined;

		/**
		 * Create a description for a debug adapter running as a socket based server.
		 */
		constructor(port: number, host?: string);
	}

	/**
	 * Represents a debug adapter running as a Named Pipe (on Windows)/UNIX Domain Socket (on non-Windows) based server.
	 */
	export class DebugAdapterNamedPipeServer {
		/**
		 * The path to the NamedPipe/UNIX Domain Socket.
		 */
		readonly path: string;

		/**
		 * Create a description for a debug adapter running as a Named Pipe (on Windows)/UNIX Domain Socket (on non-Windows) based server.
		 */
		constructor(path: string);
	}

	/**
	 * A debug adapter that implements the Debug Adapter Protocol can be registered with the editor if it implements the DebugAdapter interface.
	 */
	export interface DebugAdapter extends Disposable {

		/**
		 * An event which fires after the debug adapter has sent a Debug Adapter Protocol message to the editor.
		 * Messages can be requests, responses, or events.
		 */
		readonly onDidSendMessage: Event<DebugProtocolMessage>;

		/**
		 * Handle a Debug Adapter Protocol message.
		 * Messages can be requests, responses, or events.
		 * Results or errors are returned via onSendMessage events.
		 * @param message A Debug Adapter Protocol message
		 */
		handleMessage(message: DebugProtocolMessage): void;
	}

	/**
	 * A debug adapter descriptor for an inline implementation.
	 */
	export class DebugAdapterInlineImplementation {

		/**
		 * Create a descriptor for an inline implementation of a debug adapter.
		 */
		constructor(implementation: DebugAdapter);
	}

	/**
	 * Represents the different types of debug adapters
	 */
	export type DebugAdapterDescriptor = DebugAdapterExecutable | DebugAdapterServer | DebugAdapterNamedPipeServer | DebugAdapterInlineImplementation;

	/**
	 * A debug adapter factory that creates {@link DebugAdapterDescriptor debug adapter descriptors}.
	 */
	export interface DebugAdapterDescriptorFactory {
		/**
		 * 'createDebugAdapterDescriptor' is called at the start of a debug session to provide details about the debug adapter to use.
		 * These details must be returned as objects of type {@link DebugAdapterDescriptor}.
		 * Currently two types of debug adapters are supported:
		 * - a debug adapter executable is specified as a command path and arguments (see {@link DebugAdapterExecutable}),
		 * - a debug adapter server reachable via a communication port (see {@link DebugAdapterServer}).
		 * If the method is not implemented the default behavior is this:
		 *   createDebugAdapter(session: DebugSession, executable: DebugAdapterExecutable) {
		 *      if (typeof session.configuration.debugServer === 'number') {
		 *         return new DebugAdapterServer(session.configuration.debugServer);
		 *      }
		 *      return executable;
		 *   }
		 * @param session The {@link DebugSession debug session} for which the debug adapter will be used.
		 * @param executable The debug adapter's executable information as specified in the package.json (or undefined if no such information exists).
		 * @returns a {@link DebugAdapterDescriptor debug adapter descriptor} or undefined.
		 */
		createDebugAdapterDescriptor(session: DebugSession, executable: DebugAdapterExecutable | undefined): ProviderResult<DebugAdapterDescriptor>;
	}

	/**
	 * A Debug Adapter Tracker is a means to track the communication between the editor and a Debug Adapter.
	 */
	export interface DebugAdapterTracker {
		/**
		 * A session with the debug adapter is about to be started.
		 */
		onWillStartSession?(): void;
		/**
		 * The debug adapter is about to receive a Debug Adapter Protocol message from the editor.
		 */
		onWillReceiveMessage?(message: any): void;
		/**
		 * The debug adapter has sent a Debug Adapter Protocol message to the editor.
		 */
		onDidSendMessage?(message: any): void;
		/**
		 * The debug adapter session is about to be stopped.
		 */
		onWillStopSession?(): void;
		/**
		 * An error with the debug adapter has occurred.
		 */
		onError?(error: Error): void;
		/**
		 * The debug adapter has exited with the given exit code or signal.
		 */
		onExit?(code: number | undefined, signal: string | undefined): void;
	}

	/**
	 * A debug adapter factory that creates {@link DebugAdapterTracker debug adapter trackers}.
	 */
	export interface DebugAdapterTrackerFactory {
		/**
		 * The method 'createDebugAdapterTracker' is called at the start of a debug session in order
		 * to return a "tracker" object that provides read-access to the communication between the editor and a debug adapter.
		 *
		 * @param session The {@link DebugSession debug session} for which the debug adapter tracker will be used.
		 * @returns A {@link DebugAdapterTracker debug adapter tracker} or undefined.
		 */
		createDebugAdapterTracker(session: DebugSession): ProviderResult<DebugAdapterTracker>;
	}

	/**
	 * Represents the debug console.
	 */
	export interface DebugConsole {
		/**
		 * Append the given value to the debug console.
		 *
		 * @param value A string, falsy values will not be printed.
		 */
		append(value: string): void;

		/**
		 * Append the given value and a line feed character
		 * to the debug console.
		 *
		 * @param value A string, falsy values will be printed.
		 */
		appendLine(value: string): void;
	}

	/**
	 * An event describing the changes to the set of {@link Breakpoint breakpoints}.
	 */
	export interface BreakpointsChangeEvent {
		/**
		 * Added breakpoints.
		 */
		readonly added: readonly Breakpoint[];

		/**
		 * Removed breakpoints.
		 */
		readonly removed: readonly Breakpoint[];

		/**
		 * Changed breakpoints.
		 */
		readonly changed: readonly Breakpoint[];
	}

	/**
	 * The base class of all breakpoint types.
	 */
	export class Breakpoint {
		/**
		 * The unique ID of the breakpoint.
		 */
		readonly id: string;
		/**
		 * Is breakpoint enabled.
		 */
		readonly enabled: boolean;
		/**
		 * An optional expression for conditional breakpoints.
		 */
		readonly condition?: string | undefined;
		/**
		 * An optional expression that controls how many hits of the breakpoint are ignored.
		 */
		readonly hitCondition?: string | undefined;
		/**
		 * An optional message that gets logged when this breakpoint is hit. Embedded expressions within {} are interpolated by the debug adapter.
		 */
		readonly logMessage?: string | undefined;

		/**
		 * Creates a new breakpoint
		 *
		 * @param enabled Is breakpoint enabled.
		 * @param condition Expression for conditional breakpoints
		 * @param hitCondition Expression that controls how many hits of the breakpoint are ignored
		 * @param logMessage Log message to display when breakpoint is hit
		 */
		protected constructor(enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string);
	}

	/**
	 * A breakpoint specified by a source location.
	 */
	export class SourceBreakpoint extends Breakpoint {
		/**
		 * The source and line position of this breakpoint.
		 */
		readonly location: Location;

		/**
		 * Create a new breakpoint for a source location.
		 */
		constructor(location: Location, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string);
	}

	/**
	 * A breakpoint specified by a function name.
	 */
	export class FunctionBreakpoint extends Breakpoint {
		/**
		 * The name of the function to which this breakpoint is attached.
		 */
		readonly functionName: string;

		/**
		 * Create a new function breakpoint.
		 */
		constructor(functionName: string, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string);
	}

	/**
	 * Debug console mode used by debug session, see {@link DebugSessionOptions options}.
	 */
	export enum DebugConsoleMode {
		/**
		 * Debug session should have a separate debug console.
		 */
		Separate = 0,

		/**
		 * Debug session should share debug console with its parent session.
		 * This value has no effect for sessions which do not have a parent session.
		 */
		MergeWithParent = 1
	}

	/**
	 * Options for {@link debug.startDebugging starting a debug session}.
	 */
	export interface DebugSessionOptions {

		/**
		 * When specified the newly created debug session is registered as a "child" session of this
		 * "parent" debug session.
		 */
		parentSession?: DebugSession;

		/**
		 * Controls whether lifecycle requests like 'restart' are sent to the newly created session or its parent session.
		 * By default (if the property is false or missing), lifecycle requests are sent to the new session.
		 * This property is ignored if the session has no parent session.
		 */
		lifecycleManagedByParent?: boolean;

		/**
		 * Controls whether this session should have a separate debug console or share it
		 * with the parent session. Has no effect for sessions which do not have a parent session.
		 * Defaults to Separate.
		 */
		consoleMode?: DebugConsoleMode;

		/**
		 * Controls whether this session should run without debugging, thus ignoring breakpoints.
		 * When this property is not specified, the value from the parent session (if there is one) is used.
		 */
		noDebug?: boolean;

		/**
		 * Controls if the debug session's parent session is shown in the CALL STACK view even if it has only a single child.
		 * By default, the debug session will never hide its parent.
		 * If compact is true, debug sessions with a single child are hidden in the CALL STACK view to make the tree more compact.
		 */
		compact?: boolean;

		/**
		 * When true, a save will not be triggered for open editors when starting a debug session, regardless of the value of the `debug.saveBeforeStart` setting.
		 */
		suppressSaveBeforeStart?: boolean;

		/**
		 * When true, the debug toolbar will not be shown for this session.
		 */
		suppressDebugToolbar?: boolean;

		/**
		 * When true, the window statusbar color will not be changed for this session.
		 */
		suppressDebugStatusbar?: boolean;

		/**
		 * When true, the debug viewlet will not be automatically revealed for this session.
		 */
		suppressDebugView?: boolean;

		/**
		 * Signals to the editor that the debug session was started from a test run
		 * request. This is used to link the lifecycle of the debug session and
		 * test run in UI actions.
		 */
		testRun?: TestRun;
	}

	/**
	 * A DebugConfigurationProviderTriggerKind specifies when the `provideDebugConfigurations` method of a `DebugConfigurationProvider` is triggered.
	 * Currently there are two situations: to provide the initial debug configurations for a newly created launch.json or
	 * to provide dynamically generated debug configurations when the user asks for them through the UI (e.g. via the "Select and Start Debugging" command).
	 * A trigger kind is used when registering a `DebugConfigurationProvider` with {@link debug.registerDebugConfigurationProvider}.
	 */
	export enum DebugConfigurationProviderTriggerKind {
		/**
		 *	`DebugConfigurationProvider.provideDebugConfigurations` is called to provide the initial debug configurations for a newly created launch.json.
		 */
		Initial = 1,
		/**
		 * `DebugConfigurationProvider.provideDebugConfigurations` is called to provide dynamically generated debug configurations when the user asks for them through the UI (e.g. via the "Select and Start Debugging" command).
		 */
		Dynamic = 2
	}

	/**
	 * Represents a thread in a debug session.
	 */
	export class DebugThread {
		/**
		 * Debug session for thread.
		 */
		readonly session: DebugSession;

		/**
		 * ID of the associated thread in the debug protocol.
		 */
		readonly threadId: number;

		/**
		 * @hidden
		 */
		private constructor(session: DebugSession, threadId: number);
	}

	/**
	 * Represents a stack frame in a debug session.
	 */
	export class DebugStackFrame {
		/**
		 * Debug session for thread.
		 */
		readonly session: DebugSession;

		/**
		 * ID of the associated thread in the debug protocol.
		 */
		readonly threadId: number;
		/**
		 * ID of the stack frame in the debug protocol.
		 */
		readonly frameId: number;

		/**
		 * @hidden
		 */
		private constructor(session: DebugSession, threadId: number, frameId: number);
	}

	/**
	 * Namespace for debug functionality.
	 */
	export namespace debug {

		/**
		 * The currently active {@link DebugSession debug session} or `undefined`. The active debug session is the one
		 * represented by the debug action floating window or the one currently shown in the drop down menu of the debug action floating window.
		 * If no debug session is active, the value is `undefined`.
		 */
		export let activeDebugSession: DebugSession | undefined;

		/**
		 * The currently active {@link DebugConsole debug console}.
		 * If no debug session is active, output sent to the debug console is not shown.
		 */
		export let activeDebugConsole: DebugConsole;

		/**
		 * List of breakpoints.
		 */
		export let breakpoints: readonly Breakpoint[];

		/**
		 * An {@link Event} which fires when the {@link debug.activeDebugSession active debug session}
		 * has changed. *Note* that the event also fires when the active debug session changes
		 * to `undefined`.
		 */
		export const onDidChangeActiveDebugSession: Event<DebugSession | undefined>;

		/**
		 * An {@link Event} which fires when a new {@link DebugSession debug session} has been started.
		 */
		export const onDidStartDebugSession: Event<DebugSession>;

		/**
		 * An {@link Event} which fires when a custom DAP event is received from the {@link DebugSession debug session}.
		 */
		export const onDidReceiveDebugSessionCustomEvent: Event<DebugSessionCustomEvent>;

		/**
		 * An {@link Event} which fires when a {@link DebugSession debug session} has terminated.
		 */
		export const onDidTerminateDebugSession: Event<DebugSession>;

		/**
		 * An {@link Event} that is emitted when the set of breakpoints is added, removed, or changed.
		 */
		export const onDidChangeBreakpoints: Event<BreakpointsChangeEvent>;

		/**
		 * The currently focused thread or stack frame, or `undefined` if no
		 * thread or stack is focused. A thread can be focused any time there is
		 * an active debug session, while a stack frame can only be focused when
		 * a session is paused and the call stack has been retrieved.
		 */
		export const activeStackItem: DebugThread | DebugStackFrame | undefined;

		/**
		 * An event which fires when the {@link debug.activeStackItem} has changed.
		 */
		export const onDidChangeActiveStackItem: Event<DebugThread | DebugStackFrame | undefined>;

		/**
		 * Register a {@link DebugConfigurationProvider debug configuration provider} for a specific debug type.
		 * The optional {@link DebugConfigurationProviderTriggerKind triggerKind} can be used to specify when the `provideDebugConfigurations` method of the provider is triggered.
		 * Currently two trigger kinds are possible: with the value `Initial` (or if no trigger kind argument is given) the `provideDebugConfigurations` method is used to provide the initial debug configurations to be copied into a newly created launch.json.
		 * With the trigger kind `Dynamic` the `provideDebugConfigurations` method is used to dynamically determine debug configurations to be presented to the user (in addition to the static configurations from the launch.json).
		 * Please note that the `triggerKind` argument only applies to the `provideDebugConfigurations` method: so the `resolveDebugConfiguration` methods are not affected at all.
		 * Registering a single provider with resolve methods for different trigger kinds, results in the same resolve methods called multiple times.
		 * More than one provider can be registered for the same type.
		 *
		 * @param debugType The debug type for which the provider is registered.
		 * @param provider The {@link DebugConfigurationProvider debug configuration provider} to register.
		 * @param triggerKind The {@link DebugConfigurationProviderTriggerKind trigger} for which the 'provideDebugConfiguration' method of the provider is registered. If `triggerKind` is missing, the value `DebugConfigurationProviderTriggerKind.Initial` is assumed.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerDebugConfigurationProvider(debugType: string, provider: DebugConfigurationProvider, triggerKind?: DebugConfigurationProviderTriggerKind): Disposable;

		/**
		 * Register a {@link DebugAdapterDescriptorFactory debug adapter descriptor factory} for a specific debug type.
		 * An extension is only allowed to register a DebugAdapterDescriptorFactory for the debug type(s) defined by the extension. Otherwise an error is thrown.
		 * Registering more than one DebugAdapterDescriptorFactory for a debug type results in an error.
		 *
		 * @param debugType The debug type for which the factory is registered.
		 * @param factory The {@link DebugAdapterDescriptorFactory debug adapter descriptor factory} to register.
		 * @returns A {@link Disposable} that unregisters this factory when being disposed.
		 */
		export function registerDebugAdapterDescriptorFactory(debugType: string, factory: DebugAdapterDescriptorFactory): Disposable;

		/**
		 * Register a debug adapter tracker factory for the given debug type.
		 *
		 * @param debugType The debug type for which the factory is registered or '*' for matching all debug types.
		 * @param factory The {@link DebugAdapterTrackerFactory debug adapter tracker factory} to register.
		 * @returns A {@link Disposable} that unregisters this factory when being disposed.
		 */
		export function registerDebugAdapterTrackerFactory(debugType: string, factory: DebugAdapterTrackerFactory): Disposable;

		/**
		 * Start debugging by using either a named launch or named compound configuration,
		 * or by directly passing a {@link DebugConfiguration}.
		 * The named configurations are looked up in '.vscode/launch.json' found in the given folder.
		 * Before debugging starts, all unsaved files are saved and the launch configurations are brought up-to-date.
		 * Folder specific variables used in the configuration (e.g. '${workspaceFolder}') are resolved against the given folder.
		 * @param folder The {@link WorkspaceFolder workspace folder} for looking up named configurations and resolving variables or `undefined` for a non-folder setup.
		 * @param nameOrConfiguration Either the name of a debug or compound configuration or a {@link DebugConfiguration} object.
		 * @param parentSessionOrOptions Debug session options. When passed a parent {@link DebugSession debug session}, assumes options with just this parent session.
		 * @returns A thenable that resolves when debugging could be successfully started.
		 */
		export function startDebugging(folder: WorkspaceFolder | undefined, nameOrConfiguration: string | DebugConfiguration, parentSessionOrOptions?: DebugSession | DebugSessionOptions): Thenable<boolean>;

		/**
		 * Stop the given debug session or stop all debug sessions if session is omitted.
		 *
		 * @param session The {@link DebugSession debug session} to stop; if omitted all sessions are stopped.
		 * @returns A thenable that resolves when the session(s) have been stopped.
		 */
		export function stopDebugging(session?: DebugSession): Thenable<void>;

		/**
		 * Add breakpoints.
		 * @param breakpoints The breakpoints to add.
		 */
		export function addBreakpoints(breakpoints: readonly Breakpoint[]): void;

		/**
		 * Remove breakpoints.
		 * @param breakpoints The breakpoints to remove.
		 */
		export function removeBreakpoints(breakpoints: readonly Breakpoint[]): void;

		/**
		 * Converts a "Source" descriptor object received via the Debug Adapter Protocol into a Uri that can be used to load its contents.
		 * If the source descriptor is based on a path, a file Uri is returned.
		 * If the source descriptor uses a reference number, a specific debug Uri (scheme 'debug') is constructed that requires a corresponding ContentProvider and a running debug session
		 *
		 * If the "Source" descriptor has insufficient information for creating the Uri, an error is thrown.
		 *
		 * @param source An object conforming to the [Source](https://microsoft.github.io/debug-adapter-protocol/specification#Types_Source) type defined in the Debug Adapter Protocol.
		 * @param session An optional debug session that will be used when the source descriptor uses a reference number to load the contents from an active debug session.
		 * @returns A uri that can be used to load the contents of the source.
		 */
		export function asDebugSourceUri(source: DebugProtocolSource, session?: DebugSession): Uri;
	}

	/**
	 * Namespace for dealing with installed extensions. Extensions are represented
	 * by an {@link Extension}-interface which enables reflection on them.
	 *
	 * Extension writers can provide APIs to other extensions by returning their API public
	 * surface from the `activate`-call.
	 *
	 * ```javascript
	 * export function activate(context: vscode.ExtensionContext) {
	 * 	let api = {
	 * 		sum(a, b) {
	 * 			return a + b;
	 * 		},
	 * 		mul(a, b) {
	 * 			return a * b;
	 * 		}
	 * 	};
	 * 	// 'export' public api-surface
	 * 	return api;
	 * }
	 * ```
	 * When depending on the API of another extension add an `extensionDependencies`-entry
	 * to `package.json`, and use the {@link extensions.getExtension getExtension}-function
	 * and the {@link Extension.exports exports}-property, like below:
	 *
	 * ```javascript
	 * let mathExt = extensions.getExtension('genius.math');
	 * let importedApi = mathExt.exports;
	 *
	 * console.log(importedApi.mul(42, 1));
	 * ```
	 */
	export namespace extensions {

		/**
		 * Get an extension by its full identifier in the form of: `publisher.name`.
		 *
		 * @param extensionId An extension identifier.
		 * @returns An extension or `undefined`.
		 */
		export function getExtension<T = any>(extensionId: string): Extension<T> | undefined;

		/**
		 * All extensions currently known to the system.
		 */
		export const all: readonly Extension<any>[];

		/**
		 * An event which fires when `extensions.all` changes. This can happen when extensions are
		 * installed, uninstalled, enabled or disabled.
		 */
		export const onDidChange: Event<void>;
	}

	/**
	 * Collapsible state of a {@link CommentThread comment thread}
	 */
	export enum CommentThreadCollapsibleState {
		/**
		 * Determines an item is collapsed
		 */
		Collapsed = 0,

		/**
		 * Determines an item is expanded
		 */
		Expanded = 1
	}

	/**
	 * Comment mode of a {@link Comment}
	 */
	export enum CommentMode {
		/**
		 * Displays the comment editor
		 */
		Editing = 0,

		/**
		 * Displays the preview of the comment
		 */
		Preview = 1
	}

	/**
	 * The state of a comment thread.
	 */
	export enum CommentThreadState {
		/**
		 * Unresolved thread state
		 */
		Unresolved = 0,
		/**
		 * Resolved thread state
		 */
		Resolved = 1
	}

	/**
	 * A collection of {@link Comment comments} representing a conversation at a particular range in a document.
	 */
	export interface CommentThread {
		/**
		 * The uri of the document the thread has been created on.
		 */
		readonly uri: Uri;

		/**
		 * The range the comment thread is located within the document. The thread icon will be shown
		 * at the last line of the range. When set to undefined, the comment will be associated with the
		 * file, and not a specific range.
		 */
		range: Range | undefined;

		/**
		 * The ordered comments of the thread.
		 */
		comments: readonly Comment[];

		/**
		 * Whether the thread should be collapsed or expanded when opening the document.
		 * Defaults to Collapsed.
		 */
		collapsibleState: CommentThreadCollapsibleState;

		/**
		 * Whether the thread supports reply.
		 * Defaults to true.
		 */
		canReply: boolean | CommentAuthorInformation;

		/**
		 * Context value of the comment thread. This can be used to contribute thread specific actions.
		 * For example, a comment thread is given a context value as `editable`. When contributing actions to `comments/commentThread/title`
		 * using `menus` extension point, you can specify context value for key `commentThread` in `when` expression like `commentThread == editable`.
		 * ```json
		 * "contributes": {
		 *   "menus": {
		 *     "comments/commentThread/title": [
		 *       {
		 *         "command": "extension.deleteCommentThread",
		 *         "when": "commentThread == editable"
		 *       }
		 *     ]
		 *   }
		 * }
		 * ```
		 * This will show action `extension.deleteCommentThread` only for comment threads with `contextValue` is `editable`.
		 */
		contextValue?: string;

		/**
		 * The optional human-readable label describing the {@link CommentThread Comment Thread}
		 */
		label?: string;

		/**
		 * The optional state of a comment thread, which may affect how the comment is displayed.
		 */
		state?: CommentThreadState;

		/**
		 * Dispose this comment thread.
		 *
		 * Once disposed, this comment thread will be removed from visible editors and Comment Panel when appropriate.
		 */
		dispose(): void;
	}

	/**
	 * Author information of a {@link Comment}
	 */
	export interface CommentAuthorInformation {
		/**
		 * The display name of the author of the comment
		 */
		name: string;

		/**
		 * The optional icon path for the author
		 */
		iconPath?: Uri;
	}

	/**
	 * Reactions of a {@link Comment}
	 */
	export interface CommentReaction {
		/**
		 * The human-readable label for the reaction
		 */
		readonly label: string;

		/**
		 * Icon for the reaction shown in UI.
		 */
		readonly iconPath: string | Uri;

		/**
		 * The number of users who have reacted to this reaction
		 */
		readonly count: number;

		/**
		 * Whether the {@link CommentAuthorInformation author} of the comment has reacted to this reaction
		 */
		readonly authorHasReacted: boolean;
	}

	/**
	 * A comment is displayed within the editor or the Comments Panel, depending on how it is provided.
	 */
	export interface Comment {
		/**
		 * The human-readable comment body
		 */
		body: string | MarkdownString;

		/**
		 * {@link CommentMode Comment mode} of the comment
		 */
		mode: CommentMode;

		/**
		 * The {@link CommentAuthorInformation author information} of the comment
		 */
		author: CommentAuthorInformation;

		/**
		 * Context value of the comment. This can be used to contribute comment specific actions.
		 * For example, a comment is given a context value as `editable`. When contributing actions to `comments/comment/title`
		 * using `menus` extension point, you can specify context value for key `comment` in `when` expression like `comment == editable`.
		 * ```json
		 *	"contributes": {
		 *		"menus": {
		 *			"comments/comment/title": [
		 *				{
		 *					"command": "extension.deleteComment",
		 *					"when": "comment == editable"
		 *				}
		 *			]
		 *		}
		 *	}
		 * ```
		 * This will show action `extension.deleteComment` only for comments with `contextValue` is `editable`.
		 */
		contextValue?: string;

		/**
		 * Optional reactions of the {@link Comment}
		 */
		reactions?: CommentReaction[];

		/**
		 * Optional label describing the {@link Comment}
		 * Label will be rendered next to authorName if exists.
		 */
		label?: string;

		/**
		 * Optional timestamp that will be displayed in comments.
		 * The date will be formatted according to the user's locale and settings.
		 */
		timestamp?: Date;
	}

	/**
	 * Command argument for actions registered in `comments/commentThread/context`.
	 */
	export interface CommentReply {
		/**
		 * The active {@link CommentThread comment thread}
		 */
		thread: CommentThread;

		/**
		 * The value in the comment editor
		 */
		text: string;
	}

	/**
	 * The ranges a CommentingRangeProvider enables commenting on.
	 */
	export interface CommentingRanges {
		/**
		 * Enables comments to be added to a file without a specific range.
		 */
		enableFileComments: boolean;

		/**
		 * The ranges which allow new comment threads creation.
		 */
		ranges?: Range[];
	}

	/**
	 * Commenting range provider for a {@link CommentController comment controller}.
	 */
	export interface CommentingRangeProvider {
		/**
		 * Provide a list of ranges which allow new comment threads creation or null for a given document
		 */
		provideCommentingRanges(document: TextDocument, token: CancellationToken): ProviderResult<Range[] | CommentingRanges>;
	}

	/**
	 * Represents a {@link CommentController comment controller}'s {@link CommentController.options options}.
	 */
	export interface CommentOptions {
		/**
		 * An optional string to show on the comment input box when it's collapsed.
		 */
		prompt?: string;

		/**
		 * An optional string to show as placeholder in the comment input box when it's focused.
		 */
		placeHolder?: string;
	}

	/**
	 * A comment controller is able to provide {@link CommentThread comments} support to the editor and
	 * provide users various ways to interact with comments.
	 */
	export interface CommentController {
		/**
		 * The id of this comment controller.
		 */
		readonly id: string;

		/**
		 * The human-readable label of this comment controller.
		 */
		readonly label: string;

		/**
		 * Comment controller options
		 */
		options?: CommentOptions;

		/**
		 * Optional commenting range provider. Provide a list {@link Range ranges} which support commenting to any given resource uri.
		 *
		 * If not provided, users cannot leave any comments.
		 */
		commentingRangeProvider?: CommentingRangeProvider;

		/**
		 * Create a {@link CommentThread comment thread}. The comment thread will be displayed in visible text editors (if the resource matches)
		 * and Comments Panel once created.
		 *
		 * @param uri The uri of the document the thread has been created on.
		 * @param range The range the comment thread is located within the document.
		 * @param comments The ordered comments of the thread.
		 */
		createCommentThread(uri: Uri, range: Range, comments: readonly Comment[]): CommentThread;

		/**
		 * Optional reaction handler for creating and deleting reactions on a {@link Comment}.
		 */
		reactionHandler?: (comment: Comment, reaction: CommentReaction) => Thenable<void>;

		/**
		 * Dispose this comment controller.
		 *
		 * Once disposed, all {@link CommentThread comment threads} created by this comment controller will also be removed from the editor
		 * and Comments Panel.
		 */
		dispose(): void;
	}

	namespace comments {
		/**
		 * Creates a new {@link CommentController comment controller} instance.
		 *
		 * @param id An `id` for the comment controller.
		 * @param label A human-readable string for the comment controller.
		 * @returns An instance of {@link CommentController comment controller}.
		 */
		export function createCommentController(id: string, label: string): CommentController;
	}

	/**
	 * Represents a session of a currently logged in user.
	 */
	export interface AuthenticationSession {
		/**
		 * The identifier of the authentication session.
		 */
		readonly id: string;

		/**
		 * The access token.
		 */
		readonly accessToken: string;

		/**
		 * The account associated with the session.
		 */
		readonly account: AuthenticationSessionAccountInformation;

		/**
		 * The permissions granted by the session's access token. Available scopes
		 * are defined by the {@link AuthenticationProvider}.
		 */
		readonly scopes: readonly string[];
	}

	/**
	 * The information of an account associated with an {@link AuthenticationSession}.
	 */
	export interface AuthenticationSessionAccountInformation {
		/**
		 * The unique identifier of the account.
		 */
		readonly id: string;

		/**
		 * The human-readable name of the account.
		 */
		readonly label: string;
	}

	/**
	 * Optional options to be used when calling {@link authentication.getSession} with interactive options `forceNewSession` & `createIfNone`.
	 */
	export interface AuthenticationGetSessionPresentationOptions {
		/**
		 * An optional message that will be displayed to the user when we ask to re-authenticate. Providing additional context
		 * as to why you are asking a user to re-authenticate can help increase the odds that they will accept.
		 */
		detail?: string;
	}

	/**
	 * Optional options to be used when calling {@link authentication.getSession} with the flag `forceNewSession`.
	 * @deprecated Use {@link AuthenticationGetSessionPresentationOptions} instead.
	 */
	export type AuthenticationForceNewSessionOptions = AuthenticationGetSessionPresentationOptions;

	/**
	 * Options to be used when getting an {@link AuthenticationSession} from an {@link AuthenticationProvider}.
	 */
	export interface AuthenticationGetSessionOptions {
		/**
		 * Whether the existing session preference should be cleared.
		 *
		 * For authentication providers that support being signed into multiple accounts at once, the user will be
		 * prompted to select an account to use when {@link authentication.getSession getSession} is called. This preference
		 * is remembered until {@link authentication.getSession getSession} is called with this flag.
		 *
		 * Note:
		 * The preference is extension specific. So if one extension calls {@link authentication.getSession getSession}, it will not
		 * affect the session preference for another extension calling {@link authentication.getSession getSession}. Additionally,
		 * the preference is set for the current workspace and also globally. This means that new workspaces will use the "global"
		 * value at first and then when this flag is provided, a new value can be set for that workspace. This also means
		 * that pre-existing workspaces will not lose their preference if a new workspace sets this flag.
		 *
		 * Defaults to false.
		 */
		clearSessionPreference?: boolean;

		/**
		 * Whether login should be performed if there is no matching session.
		 *
		 * If true, a modal dialog will be shown asking the user to sign in. If false, a numbered badge will be shown
		 * on the accounts activity bar icon. An entry for the extension will be added under the menu to sign in. This
		 * allows quietly prompting the user to sign in.
		 *
		 * If you provide options, you will also see the dialog but with the additional context provided.
		 *
		 * If there is a matching session but the extension has not been granted access to it, setting this to true
		 * will also result in an immediate modal dialog, and false will add a numbered badge to the accounts icon.
		 *
		 * Defaults to false.
		 *
		 * Note: you cannot use this option with {@link AuthenticationGetSessionOptions.silent silent}.
		 */
		createIfNone?: boolean | AuthenticationGetSessionPresentationOptions;

		/**
		 * Whether we should attempt to reauthenticate even if there is already a session available.
		 *
		 * If true, a modal dialog will be shown asking the user to sign in again. This is mostly used for scenarios
		 * where the token needs to be re minted because it has lost some authorization.
		 *
		 * If you provide options, you will also see the dialog but with the additional context provided.
		 *
		 * If there are no existing sessions and forceNewSession is true, it will behave identically to
		 * {@link AuthenticationGetSessionOptions.createIfNone createIfNone}.
		 *
		 * This defaults to false.
		 */
		forceNewSession?: boolean | AuthenticationGetSessionPresentationOptions | AuthenticationForceNewSessionOptions;

		/**
		 * Whether we should show the indication to sign in in the Accounts menu.
		 *
		 * If false, the user will be shown a badge on the Accounts menu with an option to sign in for the extension.
		 * If true, no indication will be shown.
		 *
		 * Defaults to false.
		 *
		 * Note: you cannot use this option with any other options that prompt the user like {@link AuthenticationGetSessionOptions.createIfNone createIfNone}.
		 */
		silent?: boolean;

		/**
		 * The account that you would like to get a session for. This is passed down to the Authentication Provider to be used for creating the correct session.
		 */
		account?: AuthenticationSessionAccountInformation;
	}

	/**
	 * Basic information about an {@link AuthenticationProvider}
	 */
	export interface AuthenticationProviderInformation {
		/**
		 * The unique identifier of the authentication provider.
		 */
		readonly id: string;

		/**
		 * The human-readable name of the authentication provider.
		 */
		readonly label: string;
	}

	/**
	 * An {@link Event} which fires when an {@link AuthenticationSession} is added, removed, or changed.
	 */
	export interface AuthenticationSessionsChangeEvent {
		/**
		 * The {@link AuthenticationProvider} that has had its sessions change.
		 */
		readonly provider: AuthenticationProviderInformation;
	}

	/**
	 * Options for creating an {@link AuthenticationProvider}.
	 */
	export interface AuthenticationProviderOptions {
		/**
		 * Whether it is possible to be signed into multiple accounts at once with this provider.
		 * If not specified, will default to false.
		 */
		readonly supportsMultipleAccounts?: boolean;
	}

	/**
	 * An {@link Event} which fires when an {@link AuthenticationSession} is added, removed, or changed.
	 */
	export interface AuthenticationProviderAuthenticationSessionsChangeEvent {
		/**
		 * The {@link AuthenticationSession AuthenticationSessions} of the {@link AuthenticationProvider} that have been added.
		 */
		readonly added: readonly AuthenticationSession[] | undefined;

		/**
		 * The {@link AuthenticationSession AuthenticationSessions} of the {@link AuthenticationProvider} that have been removed.
		 */
		readonly removed: readonly AuthenticationSession[] | undefined;

		/**
		 * The {@link AuthenticationSession AuthenticationSessions} of the {@link AuthenticationProvider} that have been changed.
		 * A session changes when its data excluding the id are updated. An example of this is a session refresh that results in a new
		 * access token being set for the session.
		 */
		readonly changed: readonly AuthenticationSession[] | undefined;
	}

	/**
	 * The options passed in to the {@link AuthenticationProvider.getSessions} and
	 * {@link AuthenticationProvider.createSession} call.
	 */
	export interface AuthenticationProviderSessionOptions {
		/**
		 * The account that is being asked about. If this is passed in, the provider should
		 * attempt to return the sessions that are only related to this account.
		 */
		account?: AuthenticationSessionAccountInformation;
	}

	/**
	 * A provider for performing authentication to a service.
	 */
	export interface AuthenticationProvider {
		/**
		 * An {@link Event} which fires when the array of sessions has changed, or data
		 * within a session has changed.
		 */
		readonly onDidChangeSessions: Event<AuthenticationProviderAuthenticationSessionsChangeEvent>;

		/**
		 * Get a list of sessions.
		 * @param scopes An optional list of scopes. If provided, the sessions returned should match
		 * these permissions, otherwise all sessions should be returned.
		 * @param options Additional options for getting sessions.
		 * @returns A promise that resolves to an array of authentication sessions.
		 */
		getSessions(scopes: readonly string[] | undefined, options: AuthenticationProviderSessionOptions): Thenable<AuthenticationSession[]>;

		/**
		 * Prompts a user to login.
		 *
		 * If login is successful, the onDidChangeSessions event should be fired.
		 *
		 * If login fails, a rejected promise should be returned.
		 *
		 * If the provider has specified that it does not support multiple accounts,
		 * then this should never be called if there is already an existing session matching these
		 * scopes.
		 * @param scopes A list of scopes, permissions, that the new session should be created with.
		 * @param options Additional options for creating a session.
		 * @returns A promise that resolves to an authentication session.
		 */
		createSession(scopes: readonly string[], options: AuthenticationProviderSessionOptions): Thenable<AuthenticationSession>;

		/**
		 * Removes the session corresponding to session id.
		 *
		 * If the removal is successful, the onDidChangeSessions event should be fired.
		 *
		 * If a session cannot be removed, the provider should reject with an error message.
		 * @param sessionId The id of the session to remove.
		 */
		removeSession(sessionId: string): Thenable<void>;
	}


	/**
	 * Namespace for authentication.
	 */
	export namespace authentication {
		/**
		 * Get an authentication session matching the desired scopes. Rejects if a provider with providerId is not
		 * registered, or if the user does not consent to sharing authentication information with
		 * the extension. If there are multiple sessions with the same scopes, the user will be shown a
		 * quickpick to select which account they would like to use.
		 *
		 * Currently, there are only two authentication providers that are contributed from built in extensions
		 * to the editor that implement GitHub and Microsoft authentication: their providerId's are 'github' and 'microsoft'.
		 * @param providerId The id of the provider to use
		 * @param scopes A list of scopes representing the permissions requested. These are dependent on the authentication provider
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session
		 */
		export function getSession(providerId: string, scopes: readonly string[], options: AuthenticationGetSessionOptions & { /** */createIfNone: true | AuthenticationGetSessionPresentationOptions }): Thenable<AuthenticationSession>;

		/**
		 * Get an authentication session matching the desired scopes. Rejects if a provider with providerId is not
		 * registered, or if the user does not consent to sharing authentication information with
		 * the extension. If there are multiple sessions with the same scopes, the user will be shown a
		 * quickpick to select which account they would like to use.
		 *
		 * Currently, there are only two authentication providers that are contributed from built in extensions
		 * to the editor that implement GitHub and Microsoft authentication: their providerId's are 'github' and 'microsoft'.
		 * @param providerId The id of the provider to use
		 * @param scopes A list of scopes representing the permissions requested. These are dependent on the authentication provider
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session
		 */
		export function getSession(providerId: string, scopes: readonly string[], options: AuthenticationGetSessionOptions & { /** literal-type defines return type */forceNewSession: true | AuthenticationGetSessionPresentationOptions | AuthenticationForceNewSessionOptions }): Thenable<AuthenticationSession>;

		/**
		 * Get an authentication session matching the desired scopes. Rejects if a provider with providerId is not
		 * registered, or if the user does not consent to sharing authentication information with
		 * the extension. If there are multiple sessions with the same scopes, the user will be shown a
		 * quickpick to select which account they would like to use.
		 *
		 * Currently, there are only two authentication providers that are contributed from built in extensions
		 * to the editor that implement GitHub and Microsoft authentication: their providerId's are 'github' and 'microsoft'.
		 * @param providerId The id of the provider to use
		 * @param scopes A list of scopes representing the permissions requested. These are dependent on the authentication provider
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session if available, or undefined if there are no sessions
		 */
		export function getSession(providerId: string, scopes: readonly string[], options?: AuthenticationGetSessionOptions): Thenable<AuthenticationSession | undefined>;

		/**
		 * Get all accounts that the user is logged in to for the specified provider.
		 * Use this paired with {@link getSession} in order to get an authentication session for a specific account.
		 *
		 * Currently, there are only two authentication providers that are contributed from built in extensions
		 * to the editor that implement GitHub and Microsoft authentication: their providerId's are 'github' and 'microsoft'.
		 *
		 * Note: Getting accounts does not imply that your extension has access to that account or its authentication sessions. You can verify access to the account by calling {@link getSession}.
		 *
		 * @param providerId The id of the provider to use
		 * @returns A thenable that resolves to a readonly array of authentication accounts.
		 */
		export function getAccounts(providerId: string): Thenable<readonly AuthenticationSessionAccountInformation[]>;

		/**
		 * An {@link Event} which fires when the authentication sessions of an authentication provider have
		 * been added, removed, or changed.
		 */
		export const onDidChangeSessions: Event<AuthenticationSessionsChangeEvent>;

		/**
		 * Register an authentication provider.
		 *
		 * There can only be one provider per id and an error is being thrown when an id
		 * has already been used by another provider. Ids are case-sensitive.
		 *
		 * @param id The unique identifier of the provider.
		 * @param label The human-readable name of the provider.
		 * @param provider The authentication provider provider.
		 * @param options Additional options for the provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerAuthenticationProvider(id: string, label: string, provider: AuthenticationProvider, options?: AuthenticationProviderOptions): Disposable;
	}

	/**
	 * Namespace for localization-related functionality in the extension API. To use this properly,
	 * you must have `l10n` defined in your extension manifest and have bundle.l10n.<language>.json files.
	 * For more information on how to generate bundle.l10n.<language>.json files, check out the
	 * [vscode-l10n repo](https://github.com/microsoft/vscode-l10n).
	 *
	 * Note: Built-in extensions (for example, Git, TypeScript Language Features, GitHub Authentication)
	 * are excluded from the `l10n` property requirement. In other words, they do not need to specify
	 * a `l10n` in the extension manifest because their translated strings come from Language Packs.
	 */
	export namespace l10n {
		/**
		 * Marks a string for localization. If a localized bundle is available for the language specified by
		 * {@link env.language} and the bundle has a localized value for this message, then that localized
		 * value will be returned (with injected {@link args} values for any templated values).
		 *
		 * @param message - The message to localize. Supports index templating where strings like `{0}` and `{1}` are
		 * replaced by the item at that index in the {@link args} array.
		 * @param args - The arguments to be used in the localized string. The index of the argument is used to
		 * match the template placeholder in the localized string.
		 * @returns localized string with injected arguments.
		 *
		 * @example
		 * l10n.t('Hello {0}!', 'World');
		 */
		export function t(message: string, ...args: Array<string | number | boolean>): string;

		/**
		 * Marks a string for localization. If a localized bundle is available for the language specified by
		 * {@link env.language} and the bundle has a localized value for this message, then that localized
		 * value will be returned (with injected {@link args} values for any templated values).
		 *
		 * @param message The message to localize. Supports named templating where strings like `{foo}` and `{bar}` are
		 * replaced by the value in the Record for that key (foo, bar, etc).
		 * @param args The arguments to be used in the localized string. The name of the key in the record is used to
		 * match the template placeholder in the localized string.
		 * @returns localized string with injected arguments.
		 *
		 * @example
		 * l10n.t('Hello {name}', { name: 'Erich' });
		 */
		export function t(message: string, args: Record<string, any>): string;
		/**
		 * Marks a string for localization. If a localized bundle is available for the language specified by
		 * {@link env.language} and the bundle has a localized value for this message, then that localized
		 * value will be returned (with injected args values for any templated values).
		 *
		 * @param options The options to use when localizing the message.
		 * @returns localized string with injected arguments.
		 */
		export function t(options: {
			/**
			 * The message to localize. If {@link options.args args} is an array, this message supports index templating where strings like
			 * `{0}` and `{1}` are replaced by the item at that index in the {@link options.args args} array. If `args` is a `Record<string, any>`,
			 * this supports named templating where strings like `{foo}` and `{bar}` are replaced by the value in
			 * the Record for that key (foo, bar, etc).
			 */
			message: string;
			/**
			 * The arguments to be used in the localized string. As an array, the index of the argument is used to
			 * match the template placeholder in the localized string. As a Record, the key is used to match the template
			 * placeholder in the localized string.
			 */
			args?: Array<string | number | boolean> | Record<string, any>;
			/**
			 * A comment to help translators understand the context of the message.
			 */
			comment: string | string[];
		}): string;
		/**
		 * The bundle of localized strings that have been loaded for the extension.
		 * It's undefined if no bundle has been loaded. The bundle is typically not loaded if
		 * there was no bundle found or when we are running with the default language.
		 */
		export const bundle: { [key: string]: string } | undefined;
		/**
		 * The URI of the localization bundle that has been loaded for the extension.
		 * It's undefined if no bundle has been loaded. The bundle is typically not loaded if
		 * there was no bundle found or when we are running with the default language.
		 */
		export const uri: Uri | undefined;
	}

	/**
	 * Namespace for testing functionality. Tests are published by registering
	 * {@link TestController} instances, then adding {@link TestItem TestItems}.
	 * Controllers may also describe how to run tests by creating one or more
	 * {@link TestRunProfile} instances.
	 */
	export namespace tests {
		/**
		 * Creates a new test controller.
		 *
		 * @param id Identifier for the controller, must be globally unique.
		 * @param label A human-readable label for the controller.
		 * @returns An instance of the {@link TestController}.
		 */
		export function createTestController(id: string, label: string): TestController;
	}

	/**
	 * The kind of executions that {@link TestRunProfile TestRunProfiles} control.
	 */
	export enum TestRunProfileKind {
		/**
		 * The `Run` test profile kind.
		 */
		Run = 1,
		/**
		 * The `Debug` test profile kind.
		 */
		Debug = 2,
		/**
		 * The `Coverage` test profile kind.
		 */
		Coverage = 3,
	}

	/**
	 * Tags can be associated with {@link TestItem TestItems} and
	 * {@link TestRunProfile TestRunProfiles}. A profile with a tag can only
	 * execute tests that include that tag in their {@link TestItem.tags} array.
	 */
	export class TestTag {
		/**
		 * ID of the test tag. `TestTag` instances with the same ID are considered
		 * to be identical.
		 */
		readonly id: string;

		/**
		 * Creates a new TestTag instance.
		 * @param id ID of the test tag.
		 */
		constructor(id: string);
	}

	/**
	 * A TestRunProfile describes one way to execute tests in a {@link TestController}.
	 */
	export interface TestRunProfile {
		/**
		 * Label shown to the user in the UI.
		 *
		 * Note that the label has some significance if the user requests that
		 * tests be re-run in a certain way. For example, if tests were run
		 * normally and the user requests to re-run them in debug mode, the editor
		 * will attempt use a configuration with the same label of the `Debug`
		 * kind. If there is no such configuration, the default will be used.
		 */
		label: string;

		/**
		 * Configures what kind of execution this profile controls. If there
		 * are no profiles for a kind, it will not be available in the UI.
		 */
		readonly kind: TestRunProfileKind;

		/**
		 * Controls whether this profile is the default action that will
		 * be taken when its kind is actioned. For example, if the user clicks
		 * the generic "run all" button, then the default profile for
		 * {@link TestRunProfileKind.Run} will be executed, although the
		 * user can configure this.
		 *
		 * Changes the user makes in their default profiles will be reflected
		 * in this property after a {@link onDidChangeDefault} event.
		 */
		isDefault: boolean;

		/**
		 * Fired when a user has changed whether this is a default profile. The
		 * event contains the new value of {@link isDefault}
		 */
		onDidChangeDefault: Event<boolean>;

		/**
		 * Whether this profile supports continuous running of requests. If so,
		 * then {@link TestRunRequest.continuous} may be set to `true`. Defaults
		 * to false.
		 */
		supportsContinuousRun: boolean;

		/**
		 * Associated tag for the profile. If this is set, only {@link TestItem}
		 * instances with the same tag will be eligible to execute in this profile.
		 */
		tag: TestTag | undefined;

		/**
		 * If this method is present, a configuration gear will be present in the
		 * UI, and this method will be invoked when it's clicked. When called,
		 * you can take other editor actions, such as showing a quick pick or
		 * opening a configuration file.
		 */
		configureHandler: (() => void) | undefined;

		/**
		 * Handler called to start a test run. When invoked, the function should call
		 * {@link TestController.createTestRun} at least once, and all test runs
		 * associated with the request should be created before the function returns
		 * or the returned promise is resolved.
		 *
		 * If {@link supportsContinuousRun} is set, then {@link TestRunRequest.continuous}
		 * may be `true`. In this case, the profile should observe changes to
		 * source code and create new test runs by calling {@link TestController.createTestRun},
		 * until the cancellation is requested on the `token`.
		 *
		 * @param request Request information for the test run.
		 * @param cancellationToken Token that signals the used asked to abort the
		 * test run. If cancellation is requested on this token, all {@link TestRun}
		 * instances associated with the request will be
		 * automatically cancelled as well.
		 */
		runHandler: (request: TestRunRequest, token: CancellationToken) => Thenable<void> | void;

		/**
		 * An extension-provided function that provides detailed statement and
		 * function-level coverage for a file. The editor will call this when more
		 * detail is needed for a file, such as when it's opened in an editor or
		 * expanded in the **Test Coverage** view.
		 *
		 * The {@link FileCoverage} object passed to this function is the same instance
		 * emitted on {@link TestRun.addCoverage} calls associated with this profile.
		 */
		loadDetailedCoverage?: (testRun: TestRun, fileCoverage: FileCoverage, token: CancellationToken) => Thenable<FileCoverageDetail[]>;

		/**
		 * An extension-provided function that provides detailed statement and
		 * function-level coverage for a single test in a file. This is the per-test
		 * sibling of {@link TestRunProfile.loadDetailedCoverage}, called only if
		 * a test item is provided in {@link FileCoverage.includesTests} and only
		 * for files where such data is reported.
		 *
		 * Often {@link TestRunProfile.loadDetailedCoverage} will be called first
		 * when a user opens a file, and then this method will be called if they
		 * drill down into specific per-test coverage information. This method
		 * should then return coverage data only for statements and declarations
		 * executed by the specific test during the run.
		 *
		 * The {@link FileCoverage} object passed to this function is the same
		 * instance emitted on {@link TestRun.addCoverage} calls associated with this profile.
		 *
		 * @param testRun The test run that generated the coverage data.
		 * @param fileCoverage The file coverage object to load detailed coverage for.
		 * @param fromTestItem The test item to request coverage information for.
		 * @param token A cancellation token that indicates the operation should be cancelled.
		 */
		loadDetailedCoverageForTest?: (testRun: TestRun, fileCoverage: FileCoverage, fromTestItem: TestItem, token: CancellationToken) => Thenable<FileCoverageDetail[]>;

		/**
		 * Deletes the run profile.
		 */
		dispose(): void;
	}

	/**
	 * Entry point to discover and execute tests. It contains {@link TestController.items} which
	 * are used to populate the editor UI, and is associated with
	 * {@link TestController.createRunProfile run profiles} to allow
	 * for tests to be executed.
	 */
	export interface TestController {
		/**
		 * The id of the controller passed in {@link tests.createTestController}.
		 * This must be globally unique.
		 */
		readonly id: string;

		/**
		 * Human-readable label for the test controller.
		 */
		label: string;

		/**
		 * A collection of "top-level" {@link TestItem} instances, which can in
		 * turn have their own {@link TestItem.children children} to form the
		 * "test tree."
		 *
		 * The extension controls when to add tests. For example, extensions should
		 * add tests for a file when {@link workspace.onDidOpenTextDocument}
		 * fires in order for decorations for tests within a file to be visible.
		 *
		 * However, the editor may sometimes explicitly request children using the
		 * {@link resolveHandler} See the documentation on that method for more details.
		 */
		readonly items: TestItemCollection;

		/**
		 * Creates a profile used for running tests. Extensions must create
		 * at least one profile in order for tests to be run.
		 * @param label A human-readable label for this profile.
		 * @param kind Configures what kind of execution this profile manages.
		 * @param runHandler Function called to start a test run.
		 * @param isDefault Whether this is the default action for its kind.
		 * @param tag Profile test tag.
		 * @param supportsContinuousRun Whether the profile supports continuous running.
		 * @returns An instance of a {@link TestRunProfile}, which is automatically
		 * associated with this controller.
		 */
		createRunProfile(label: string, kind: TestRunProfileKind, runHandler: (request: TestRunRequest, token: CancellationToken) => Thenable<void> | void, isDefault?: boolean, tag?: TestTag, supportsContinuousRun?: boolean): TestRunProfile;

		/**
		 * A function provided by the extension that the editor may call to request
		 * children of a test item, if the {@link TestItem.canResolveChildren} is
		 * `true`. When called, the item should discover children and call
		 * {@link TestController.createTestItem} as children are discovered.
		 *
		 * Generally the extension manages the lifecycle of test items, but under
		 * certain conditions the editor may request the children of a specific
		 * item to be loaded. For example, if the user requests to re-run tests
		 * after reloading the editor, the editor may need to call this method
		 * to resolve the previously-run tests.
		 *
		 * The item in the explorer will automatically be marked as "busy" until
		 * the function returns or the returned thenable resolves.
		 *
		 * @param item An unresolved test item for which children are being
		 * requested, or `undefined` to resolve the controller's initial {@link TestController.items items}.
		 */
		resolveHandler?: (item: TestItem | undefined) => Thenable<void> | void;

		/**
		 * If this method is present, a refresh button will be present in the
		 * UI, and this method will be invoked when it's clicked. When called,
		 * the extension should scan the workspace for any new, changed, or
		 * removed tests.
		 *
		 * It's recommended that extensions try to update tests in realtime, using
		 * a {@link FileSystemWatcher} for example, and use this method as a fallback.
		 *
		 * @returns A thenable that resolves when tests have been refreshed.
		 */
		refreshHandler: ((token: CancellationToken) => Thenable<void> | void) | undefined;

		/**
		 * Creates a {@link TestRun}. This should be called by the
		 * {@link TestRunProfile} when a request is made to execute tests, and may
		 * also be called if a test run is detected externally. Once created, tests
		 * that are included in the request will be moved into the queued state.
		 *
		 * All runs created using the same `request` instance will be grouped
		 * together. This is useful if, for example, a single suite of tests is
		 * run on multiple platforms.
		 *
		 * @param request Test run request. Only tests inside the `include` may be
		 * modified, and tests in its `exclude` are ignored.
		 * @param name The human-readable name of the run. This can be used to
		 * disambiguate multiple sets of results in a test run. It is useful if
		 * tests are run across multiple platforms, for example.
		 * @param persist Whether the results created by the run should be
		 * persisted in the editor. This may be false if the results are coming from
		 * a file already saved externally, such as a coverage information file.
		 * @returns An instance of the {@link TestRun}. It will be considered "running"
		 * from the moment this method is invoked until {@link TestRun.end} is called.
		 */
		createTestRun(request: TestRunRequest, name?: string, persist?: boolean): TestRun;

		/**
		 * Creates a new managed {@link TestItem} instance. It can be added into
		 * the {@link TestItem.children} of an existing item, or into the
		 * {@link TestController.items}.
		 *
		 * @param id Identifier for the TestItem. The test item's ID must be unique
		 * in the {@link TestItemCollection} it's added to.
		 * @param label Human-readable label of the test item.
		 * @param uri URI this TestItem is associated with. May be a file or directory.
		 */
		createTestItem(id: string, label: string, uri?: Uri): TestItem;

		/**
		 * Marks an item's results as being outdated. This is commonly called when
		 * code or configuration changes and previous results should no longer
		 * be considered relevant. The same logic used to mark results as outdated
		 * may be used to drive {@link TestRunRequest.continuous continuous test runs}.
		 *
		 * If an item is passed to this method, test results for the item and all of
		 * its children will be marked as outdated. If no item is passed, then all
		 * test owned by the TestController will be marked as outdated.
		 *
		 * Any test runs started before the moment this method is called, including
		 * runs which may still be ongoing, will be marked as outdated and deprioritized
		 * in the editor's UI.
		 *
		 * @param items Item to mark as outdated. If undefined, all the controller's items are marked outdated.
		 */
		invalidateTestResults(items?: TestItem | readonly TestItem[]): void;

		/**
		 * Unregisters the test controller, disposing of its associated tests
		 * and unpersisted results.
		 */
		dispose(): void;
	}

	/**
	 * A TestRunRequest is a precursor to a {@link TestRun}, which in turn is
	 * created by passing a request to {@link TestController.createTestRun}. The
	 * TestRunRequest contains information about which tests should be run, which
	 * should not be run, and how they are run (via the {@link TestRunRequest.profile profile}).
	 *
	 * In general, TestRunRequests are created by the editor and pass to
	 * {@link TestRunProfile.runHandler}, however you can also create test
	 * requests and runs outside of the `runHandler`.
	 */
	export class TestRunRequest {
		/**
		 * A filter for specific tests to run. If given, the extension should run
		 * all of the included tests and all their children, excluding any tests
		 * that appear in {@link TestRunRequest.exclude}. If this property is
		 * undefined, then the extension should simply run all tests.
		 *
		 * The process of running tests should resolve the children of any test
		 * items who have not yet been resolved.
		 */
		readonly include: readonly TestItem[] | undefined;

		/**
		 * An array of tests the user has marked as excluded from the test included
		 * in this run; exclusions should apply after inclusions.
		 *
		 * May be omitted if no exclusions were requested. Test controllers should
		 * not run excluded tests or any children of excluded tests.
		 */
		readonly exclude: readonly TestItem[] | undefined;

		/**
		 * The profile used for this request. This will always be defined
		 * for requests issued from the editor UI, though extensions may
		 * programmatically create requests not associated with any profile.
		 */
		readonly profile: TestRunProfile | undefined;

		/**
		 * Whether the profile should run continuously as source code changes. Only
		 * relevant for profiles that set {@link TestRunProfile.supportsContinuousRun}.
		 */
		readonly continuous?: boolean;

		/**
		 * Controls how test Test Results view is focused.  If true, the editor
		 * will keep the maintain the user's focus. If false, the editor will
		 * prefer to move focus into the Test Results view, although
		 * this may be configured by users.
		 */
		readonly preserveFocus: boolean;

		/**
		 * @param include Array of specific tests to run, or undefined to run all tests
		 * @param exclude An array of tests to exclude from the run.
		 * @param profile The run profile used for this request.
		 * @param continuous Whether to run tests continuously as source changes.
		 * @param preserveFocus Whether to preserve the user's focus when the run is started
		 */
		constructor(include?: readonly TestItem[], exclude?: readonly TestItem[], profile?: TestRunProfile, continuous?: boolean, preserveFocus?: boolean);
	}

	/**
	 * A TestRun represents an in-progress or completed test run and
	 * provides methods to report the state of individual tests in the run.
	 */
	export interface TestRun {
		/**
		 * The human-readable name of the run. This can be used to
		 * disambiguate multiple sets of results in a test run. It is useful if
		 * tests are run across multiple platforms, for example.
		 */
		readonly name: string | undefined;

		/**
		 * A cancellation token which will be triggered when the test run is
		 * canceled from the UI.
		 */
		readonly token: CancellationToken;

		/**
		 * Whether the test run will be persisted across reloads by the editor.
		 */
		readonly isPersisted: boolean;

		/**
		 * Indicates a test is queued for later execution.
		 * @param test Test item to update.
		 */
		enqueued(test: TestItem): void;

		/**
		 * Indicates a test has started running.
		 * @param test Test item to update.
		 */
		started(test: TestItem): void;

		/**
		 * Indicates a test has been skipped.
		 * @param test Test item to update.
		 */
		skipped(test: TestItem): void;

		/**
		 * Indicates a test has failed. You should pass one or more
		 * {@link TestMessage TestMessages} to describe the failure.
		 * @param test Test item to update.
		 * @param message Messages associated with the test failure.
		 * @param duration How long the test took to execute, in milliseconds.
		 */
		failed(test: TestItem, message: TestMessage | readonly TestMessage[], duration?: number): void;

		/**
		 * Indicates a test has errored. You should pass one or more
		 * {@link TestMessage TestMessages} to describe the failure. This differs
		 * from the "failed" state in that it indicates a test that couldn't be
		 * executed at all, from a compilation error for example.
		 * @param test Test item to update.
		 * @param message Messages associated with the test failure.
		 * @param duration How long the test took to execute, in milliseconds.
		 */
		errored(test: TestItem, message: TestMessage | readonly TestMessage[], duration?: number): void;

		/**
		 * Indicates a test has passed.
		 * @param test Test item to update.
		 * @param duration How long the test took to execute, in milliseconds.
		 */
		passed(test: TestItem, duration?: number): void;

		/**
		 * Appends raw output from the test runner. On the user's request, the
		 * output will be displayed in a terminal. ANSI escape sequences,
		 * such as colors and text styles, are supported. New lines must be given
		 * as CRLF (`\r\n`) rather than LF (`\n`).
		 *
		 * @param output Output text to append.
		 * @param location Indicate that the output was logged at the given
		 * location.
		 * @param test Test item to associate the output with.
		 */
		appendOutput(output: string, location?: Location, test?: TestItem): void;

		/**
		 * Adds coverage for a file in the run.
		 */
		addCoverage(fileCoverage: FileCoverage): void;

		/**
		 * Signals the end of the test run. Any tests included in the run whose
		 * states have not been updated will have their state reset.
		 */
		end(): void;

		/**
		 * An event fired when the editor is no longer interested in data
		 * associated with the test run.
		 */
		onDidDispose: Event<void>;
	}

	/**
	 * Collection of test items, found in {@link TestItem.children} and
	 * {@link TestController.items}.
	 */
	export interface TestItemCollection extends Iterable<[id: string, testItem: TestItem]> {
		/**
		 * Gets the number of items in the collection.
		 */
		readonly size: number;

		/**
		 * Replaces the items stored by the collection.
		 * @param items Items to store.
		 */
		replace(items: readonly TestItem[]): void;

		/**
		 * Iterate over each entry in this collection.
		 *
		 * @param callback Function to execute for each entry.
		 * @param thisArg The `this` context used when invoking the handler function.
		 */
		forEach(callback: (item: TestItem, collection: TestItemCollection) => unknown, thisArg?: any): void;

		/**
		 * Adds the test item to the children. If an item with the same ID already
		 * exists, it'll be replaced.
		 * @param item Item to add.
		 */
		add(item: TestItem): void;

		/**
		 * Removes a single test item from the collection.
		 * @param itemId Item ID to delete.
		 */
		delete(itemId: string): void;

		/**
		 * Efficiently gets a test item by ID, if it exists, in the children.
		 * @param itemId Item ID to get.
		 * @returns The found item or undefined if it does not exist.
		 */
		get(itemId: string): TestItem | undefined;
	}

	/**
	 * An item shown in the "test explorer" view.
	 *
	 * A `TestItem` can represent either a test suite or a test itself, since
	 * they both have similar capabilities.
	 */
	export interface TestItem {
		/**
		 * Identifier for the `TestItem`. This is used to correlate
		 * test results and tests in the document with those in the workspace
		 * (test explorer). This cannot change for the lifetime of the `TestItem`,
		 * and must be unique among its parent's direct children.
		 */
		readonly id: string;

		/**
		 * URI this `TestItem` is associated with. May be a file or directory.
		 */
		readonly uri: Uri | undefined;

		/**
		 * The children of this test item. For a test suite, this may contain the
		 * individual test cases or nested suites.
		 */
		readonly children: TestItemCollection;

		/**
		 * The parent of this item. It's set automatically, and is undefined
		 * top-level items in the {@link TestController.items} and for items that
		 * aren't yet included in another item's {@link TestItem.children children}.
		 */
		readonly parent: TestItem | undefined;

		/**
		 * Tags associated with this test item. May be used in combination with
		 * {@link TestRunProfile.tag tags}, or simply as an organizational feature.
		 */
		tags: readonly TestTag[];

		/**
		 * Indicates whether this test item may have children discovered by resolving.
		 *
		 * If true, this item is shown as expandable in the Test Explorer view and
		 * expanding the item will cause {@link TestController.resolveHandler}
		 * to be invoked with the item.
		 *
		 * Default to `false`.
		 */
		canResolveChildren: boolean;

		/**
		 * Controls whether the item is shown as "busy" in the Test Explorer view.
		 * This is useful for showing status while discovering children.
		 *
		 * Defaults to `false`.
		 */
		busy: boolean;

		/**
		 * Display name describing the test case.
		 */
		label: string;

		/**
		 * Optional description that appears next to the label.
		 */
		description?: string;

		/**
		 * A string that should be used when comparing this item
		 * with other items. When `falsy` the {@link TestItem.label label}
		 * is used.
		 */
		sortText?: string | undefined;

		/**
		 * Location of the test item in its {@link TestItem.uri uri}.
		 *
		 * This is only meaningful if the `uri` points to a file.
		 */
		range: Range | undefined;

		/**
		 * Optional error encountered while loading the test.
		 *
		 * Note that this is not a test result and should only be used to represent errors in
		 * test discovery, such as syntax errors.
		 */
		error: string | MarkdownString | undefined;
	}

	/**
	 * A stack frame found in the {@link TestMessage.stackTrace}.
	 */
	export class TestMessageStackFrame {
		/**
		 * The location of this stack frame. This should be provided as a URI if the
		 * location of the call frame can be accessed by the editor.
		 */
		uri?: Uri;

		/**
		 * Position of the stack frame within the file.
		 */
		position?: Position;

		/**
		 * The name of the stack frame, typically a method or function name.
		 */
		label: string;

		/**
		 * @param label The name of the stack frame
		 * @param file The file URI of the stack frame
		 * @param position The position of the stack frame within the file
		 */
		constructor(label: string, uri?: Uri, position?: Position);
	}

	/**
	 * Message associated with the test state. Can be linked to a specific
	 * source range -- useful for assertion failures, for example.
	 */
	export class TestMessage {
		/**
		 * Human-readable message text to display.
		 */
		message: string | MarkdownString;

		/**
		 * Expected test output. If given with {@link TestMessage.actualOutput actualOutput }, a diff view will be shown.
		 */
		expectedOutput?: string;

		/**
		 * Actual test output. If given with {@link TestMessage.expectedOutput expectedOutput }, a diff view will be shown.
		 */
		actualOutput?: string;

		/**
		 * Associated file location.
		 */
		location?: Location;

		/**
		 * Context value of the test item. This can be used to contribute message-
		 * specific actions to the test peek view. The value set here can be found
		 * in the `testMessage` property of the following `menus` contribution points:
		 *
		 * - `testing/message/context` - context menu for the message in the results tree
		 * - `testing/message/content` - a prominent button overlaying editor content where
		 *    the message is displayed.
		 *
		 * For example:
		 *
		 * ```json
		 * "contributes": {
		 *   "menus": {
		 *     "testing/message/content": [
		 *       {
		 *         "command": "extension.deleteCommentThread",
		 *         "when": "testMessage == canApplyRichDiff"
		 *       }
		 *     ]
		 *   }
		 * }
		 * ```
		 *
		 * The command will be called with an object containing:
		 * - `test`: the {@link TestItem} the message is associated with, *if* it
		 *    is still present in the {@link TestController.items} collection.
		 * - `message`: the {@link TestMessage} instance.
		 */
		contextValue?: string;

		/**
		 * The stack trace associated with the message or failure.
		 */
		stackTrace?: TestMessageStackFrame[];

		/**
		 * Creates a new TestMessage that will present as a diff in the editor.
		 * @param message Message to display to the user.
		 * @param expected Expected output.
		 * @param actual Actual output.
		 */
		static diff(message: string | MarkdownString, expected: string, actual: string): TestMessage;

		/**
		 * Creates a new TestMessage instance.
		 * @param message The message to show to the user.
		 */
		constructor(message: string | MarkdownString);
	}

	/**
	 * A class that contains information about a covered resource. A count can
	 * be give for lines, branches, and declarations in a file.
	 */
	export class TestCoverageCount {
		/**
		 * Number of items covered in the file.
		 */
		covered: number;
		/**
		 * Total number of covered items in the file.
		 */
		total: number;

		/**
		 * @param covered Value for {@link TestCoverageCount.covered}
		 * @param total Value for {@link TestCoverageCount.total}
		 */
		constructor(covered: number, total: number);
	}

	/**
	 * Contains coverage metadata for a file.
	 */
	export class FileCoverage {
		/**
		 * File URI.
		 */
		readonly uri: Uri;

		/**
		 * Statement coverage information. If the reporter does not provide statement
		 * coverage information, this can instead be used to represent line coverage.
		 */
		statementCoverage: TestCoverageCount;

		/**
		 * Branch coverage information.
		 */
		branchCoverage?: TestCoverageCount;

		/**
		 * Declaration coverage information. Depending on the reporter and
		 * language, this may be types such as functions, methods, or namespaces.
		 */
		declarationCoverage?: TestCoverageCount;

		/**
		 * A list of {@link TestItem test cases} that generated coverage in this
		 * file. If set, then {@link TestRunProfile.loadDetailedCoverageForTest}
		 * should also be defined in order to retrieve detailed coverage information.
		 */
		includesTests?: TestItem[];

		/**
		 * Creates a {@link FileCoverage} instance with counts filled in from
		 * the coverage details.
		 * @param uri Covered file URI
		 * @param details Detailed coverage information
		 */
		static fromDetails(uri: Uri, details: readonly FileCoverageDetail[]): FileCoverage;

		/**
		 * @param uri Covered file URI
		 * @param statementCoverage Statement coverage information. If the reporter
		 * does not provide statement coverage information, this can instead be
		 * used to represent line coverage.
		 * @param branchCoverage Branch coverage information
		 * @param declarationCoverage Declaration coverage information
		 * @param includesTests Test cases included in this coverage report, see {@link FileCoverage.includesTests}
		 */
		constructor(
			uri: Uri,
			statementCoverage: TestCoverageCount,
			branchCoverage?: TestCoverageCount,
			declarationCoverage?: TestCoverageCount,
			includesTests?: TestItem[],
		);
	}

	/**
	 * Contains coverage information for a single statement or line.
	 */
	export class StatementCoverage {
		/**
		 * The number of times this statement was executed, or a boolean indicating
		 * whether it was executed if the exact count is unknown. If zero or false,
		 * the statement will be marked as un-covered.
		 */
		executed: number | boolean;

		/**
		 * Statement location.
		 */
		location: Position | Range;

		/**
		 * Coverage from branches of this line or statement. If it's not a
		 * conditional, this will be empty.
		 */
		branches: BranchCoverage[];

		/**
		 * @param location The statement position.
		 * @param executed The number of times this statement was executed, or a
		 * boolean indicating  whether it was executed if the exact count is
		 * unknown. If zero or false, the statement will be marked as un-covered.
		 * @param branches Coverage from branches of this line.  If it's not a
		 * conditional, this should be omitted.
		 */
		constructor(executed: number | boolean, location: Position | Range, branches?: BranchCoverage[]);
	}

	/**
	 * Contains coverage information for a branch of a {@link StatementCoverage}.
	 */
	export class BranchCoverage {
		/**
		 * The number of times this branch was executed, or a boolean indicating
		 * whether it was executed if the exact count is unknown. If zero or false,
		 * the branch will be marked as un-covered.
		 */
		executed: number | boolean;

		/**
		 * Branch location.
		 */
		location?: Position | Range;

		/**
		 * Label for the branch, used in the context of "the ${label} branch was
		 * not taken," for example.
		 */
		label?: string;

		/**
		 * @param executed The number of times this branch was executed, or a
		 * boolean indicating  whether it was executed if the exact count is
		 * unknown. If zero or false, the branch will be marked as un-covered.
		 * @param location The branch position.
		 */
		constructor(executed: number | boolean, location?: Position | Range, label?: string);
	}

	/**
	 * Contains coverage information for a declaration. Depending on the reporter
	 * and language, this may be types such as functions, methods, or namespaces.
	 */
	export class DeclarationCoverage {
		/**
		 * Name of the declaration.
		 */
		name: string;

		/**
		 * The number of times this declaration was executed, or a boolean
		 * indicating whether it was executed if the exact count is unknown. If
		 * zero or false, the declaration will be marked as un-covered.
		 */
		executed: number | boolean;

		/**
		 * Declaration location.
		 */
		location: Position | Range;

		/**
		 * @param executed The number of times this declaration was executed, or a
		 * boolean indicating  whether it was executed if the exact count is
		 * unknown. If zero or false, the declaration will be marked as un-covered.
		 * @param location The declaration position.
		 */
		constructor(name: string, executed: number | boolean, location: Position | Range);
	}

	/**
	 * Coverage details returned from {@link TestRunProfile.loadDetailedCoverage}.
	 */
	export type FileCoverageDetail = StatementCoverage | DeclarationCoverage;

	/**
	 * The tab represents a single text based resource.
	 */
	export class TabInputText {
		/**
		 * The uri represented by the tab.
		 */
		readonly uri: Uri;
		/**
		 * Constructs a text tab input with the given URI.
		 * @param uri The URI of the tab.
		 */
		constructor(uri: Uri);
	}

	/**
	 * The tab represents two text based resources
	 * being rendered as a diff.
	 */
	export class TabInputTextDiff {
		/**
		 * The uri of the original text resource.
		 */
		readonly original: Uri;
		/**
		 * The uri of the modified text resource.
		 */
		readonly modified: Uri;
		/**
		 * Constructs a new text diff tab input with the given URIs.
		 * @param original The uri of the original text resource.
		 * @param modified The uri of the modified text resource.
		 */
		constructor(original: Uri, modified: Uri);
	}

	/**
	 * The tab represents a custom editor.
	 */
	export class TabInputCustom {
		/**
		 * The uri that the tab is representing.
		 */
		readonly uri: Uri;
		/**
		 * The type of custom editor.
		 */
		readonly viewType: string;
		/**
		 * Constructs a custom editor tab input.
		 * @param uri The uri of the tab.
		 * @param viewType The viewtype of the custom editor.
		 */
		constructor(uri: Uri, viewType: string);
	}

	/**
	 * The tab represents a webview.
	 */
	export class TabInputWebview {
		/**
		 * The type of webview. Maps to {@linkcode WebviewPanel.viewType WebviewPanel's viewType}
		 */
		readonly viewType: string;
		/**
		 * Constructs a webview tab input with the given view type.
		 * @param viewType The type of webview. Maps to {@linkcode WebviewPanel.viewType WebviewPanel's viewType}
		 */
		constructor(viewType: string);
	}

	/**
	 * The tab represents a notebook.
	 */
	export class TabInputNotebook {
		/**
		 * The uri that the tab is representing.
		 */
		readonly uri: Uri;
		/**
		 * The type of notebook. Maps to {@linkcode NotebookDocument.notebookType NotebookDocuments's notebookType}
		 */
		readonly notebookType: string;
		/**
		 * Constructs a new tab input for a notebook.
		 * @param uri The uri of the notebook.
		 * @param notebookType The type of notebook. Maps to {@linkcode NotebookDocument.notebookType NotebookDocuments's notebookType}
		 */
		constructor(uri: Uri, notebookType: string);
	}

	/**
	 * The tabs represents two notebooks in a diff configuration.
	 */
	export class TabInputNotebookDiff {
		/**
		 * The uri of the original notebook.
		 */
		readonly original: Uri;
		/**
		 * The uri of the modified notebook.
		 */
		readonly modified: Uri;
		/**
		 * The type of notebook. Maps to {@linkcode NotebookDocument.notebookType NotebookDocuments's notebookType}
		 */
		readonly notebookType: string;
		/**
		 * Constructs a notebook diff tab input.
		 * @param original The uri of the original unmodified notebook.
		 * @param modified The uri of the modified notebook.
		 * @param notebookType The type of notebook. Maps to {@linkcode NotebookDocument.notebookType NotebookDocuments's notebookType}
		 */
		constructor(original: Uri, modified: Uri, notebookType: string);
	}

	/**
	 * The tab represents a terminal in the editor area.
	 */
	export class TabInputTerminal {
		/**
		 * Constructs a terminal tab input.
		 */
		constructor();
	}

	/**
	 * Represents a tab within a {@link TabGroup group of tabs}.
	 * Tabs are merely the graphical representation within the editor area.
	 * A backing editor is not a guarantee.
	 */
	export interface Tab {

		/**
		 * The text displayed on the tab.
		 */
		readonly label: string;

		/**
		 * The group which the tab belongs to.
		 */
		readonly group: TabGroup;

		/**
		 * Defines the structure of the tab i.e. text, notebook, custom, etc.
		 * Resource and other useful properties are defined on the tab kind.
		 */
		readonly input: TabInputText | TabInputTextDiff | TabInputCustom | TabInputWebview | TabInputNotebook | TabInputNotebookDiff | TabInputTerminal | unknown;

		/**
		 * Whether or not the tab is currently active.
		 * This is dictated by being the selected tab in the group.
		 */
		readonly isActive: boolean;

		/**
		 * Whether or not the dirty indicator is present on the tab.
		 */
		readonly isDirty: boolean;

		/**
		 * Whether or not the tab is pinned (pin icon is present).
		 */
		readonly isPinned: boolean;

		/**
		 * Whether or not the tab is in preview mode.
		 */
		readonly isPreview: boolean;
	}

	/**
	 * An event describing change to tabs.
	 */
	export interface TabChangeEvent {
		/**
		 * The tabs that have been opened.
		 */
		readonly opened: readonly Tab[];
		/**
		 * The tabs that have been closed.
		 */
		readonly closed: readonly Tab[];
		/**
		 * Tabs that have changed, e.g have changed
		 * their {@link Tab.isActive active} state.
		 */
		readonly changed: readonly Tab[];
	}

	/**
	 * An event describing changes to tab groups.
	 */
	export interface TabGroupChangeEvent {
		/**
		 * Tab groups that have been opened.
		 */
		readonly opened: readonly TabGroup[];
		/**
		 * Tab groups that have been closed.
		 */
		readonly closed: readonly TabGroup[];
		/**
		 * Tab groups that have changed, e.g have changed
		 * their {@link TabGroup.isActive active} state.
		 */
		readonly changed: readonly TabGroup[];
	}

	/**
	 * Represents a group of tabs. A tab group itself consists of multiple tabs.
	 */
	export interface TabGroup {
		/**
		 * Whether or not the group is currently active.
		 *
		 * *Note* that only one tab group is active at a time, but that multiple tab
		 * groups can have an {@link activeTab active tab}.
		 *
		 * @see {@link Tab.isActive}
		 */
		readonly isActive: boolean;

		/**
		 * The view column of the group.
		 */
		readonly viewColumn: ViewColumn;

		/**
		 * The active {@link Tab tab} in the group. This is the tab whose contents are currently
		 * being rendered.
		 *
		 * *Note* that there can be one active tab per group but there can only be one {@link TabGroups.activeTabGroup active group}.
		 */
		readonly activeTab: Tab | undefined;

		/**
		 * The list of tabs contained within the group.
		 * This can be empty if the group has no tabs open.
		 */
		readonly tabs: readonly Tab[];
	}

	/**
	 * Represents the main editor area which consists of multiple groups which contain tabs.
	 */
	export interface TabGroups {
		/**
		 * All the groups within the group container.
		 */
		readonly all: readonly TabGroup[];

		/**
		 * The currently active group.
		 */
		readonly activeTabGroup: TabGroup;

		/**
		 * An {@link Event event} which fires when {@link TabGroup tab groups} have changed.
		 */
		readonly onDidChangeTabGroups: Event<TabGroupChangeEvent>;

		/**
		 * An {@link Event event} which fires when {@link Tab tabs} have changed.
		 */
		readonly onDidChangeTabs: Event<TabChangeEvent>;

		/**
		 * Closes the tab. This makes the tab object invalid and the tab
		 * should no longer be used for further actions.
		 * Note: In the case of a dirty tab, a confirmation dialog will be shown which may be cancelled. If cancelled the tab is still valid
		 *
		 * @param tab The tab to close.
		 * @param preserveFocus When `true` focus will remain in its current position. If `false` it will jump to the next tab.
		 * @returns A promise that resolves to `true` when all tabs have been closed.
		 */
		close(tab: Tab | readonly Tab[], preserveFocus?: boolean): Thenable<boolean>;

		/**
		 * Closes the tab group. This makes the tab group object invalid and the tab group
		 * should no longer be used for further actions.
		 * @param tabGroup The tab group to close.
		 * @param preserveFocus When `true` focus will remain in its current position.
		 * @returns A promise that resolves to `true` when all tab groups have been closed.
		 */
		close(tabGroup: TabGroup | readonly TabGroup[], preserveFocus?: boolean): Thenable<boolean>;
	}

	/**
	 * A special value wrapper denoting a value that is safe to not clean.
	 * This is to be used when you can guarantee no identifiable information is contained in the value and the cleaning is improperly redacting it.
	 */
	export class TelemetryTrustedValue<T = any> {

		/**
		 * The value that is trusted to not contain PII.
		 */
		readonly value: T;

		/**
		 * Creates a new telemetry trusted value.
		 *
		 * @param value A value to trust
		 */
		constructor(value: T);
	}

	/**
	 * A telemetry logger which can be used by extensions to log usage and error telemetry.
	 *
	 * A logger wraps around an {@link TelemetrySender sender} but it guarantees that
	 * - user settings to disable or tweak telemetry are respected, and that
	 * - potential sensitive data is removed
	 *
	 * It also enables an "echo UI" that prints whatever data is send and it allows the editor
	 * to forward unhandled errors to the respective extensions.
	 *
	 * To get an instance of a `TelemetryLogger`, use
	 * {@link env.createTelemetryLogger `createTelemetryLogger`}.
	 */
	export interface TelemetryLogger {

		/**
		 * An {@link Event} which fires when the enablement state of usage or error telemetry changes.
		 */
		readonly onDidChangeEnableStates: Event<TelemetryLogger>;

		/**
		 * Whether or not usage telemetry is enabled for this logger.
		 */
		readonly isUsageEnabled: boolean;

		/**
		 * Whether or not error telemetry is enabled for this logger.
		 */
		readonly isErrorsEnabled: boolean;

		/**
		 * Log a usage event.
		 *
		 * After completing cleaning, telemetry setting checks, and data mix-in calls `TelemetrySender.sendEventData` to log the event.
		 * Automatically supports echoing to extension telemetry output channel.
		 * @param eventName The event name to log
		 * @param data The data to log
		 */
		logUsage(eventName: string, data?: Record<string, any | TelemetryTrustedValue>): void;

		/**
		 * Log an error event.
		 *
		 * After completing cleaning, telemetry setting checks, and data mix-in calls `TelemetrySender.sendEventData` to log the event. Differs from `logUsage` in that it will log the event if the telemetry setting is Error+.
		 * Automatically supports echoing to extension telemetry output channel.
		 * @param eventName The event name to log
		 * @param data The data to log
		 */
		logError(eventName: string, data?: Record<string, any | TelemetryTrustedValue>): void;

		/**
		 * Log an error event.
		 *
		 * Calls `TelemetrySender.sendErrorData`. Does cleaning, telemetry checks, and data mix-in.
		 * Automatically supports echoing to extension telemetry output channel.
		 * Will also automatically log any exceptions thrown within the extension host process.
		 * @param error The error object which contains the stack trace cleaned of PII
		 * @param data Additional data to log alongside the stack trace
		 */
		logError(error: Error, data?: Record<string, any | TelemetryTrustedValue>): void;

		/**
		 * Dispose this object and free resources.
		 */
		dispose(): void;
	}

	/**
	 * The telemetry sender is the contract between a telemetry logger and some telemetry service. **Note** that extensions must NOT
	 * call the methods of their sender directly as the logger provides extra guards and cleaning.
	 *
	 * ```js
	 * const sender: vscode.TelemetrySender = {...};
	 * const logger = vscode.env.createTelemetryLogger(sender);
	 *
	 * // GOOD - uses the logger
	 * logger.logUsage('myEvent', { myData: 'myValue' });
	 *
	 * // BAD - uses the sender directly: no data cleansing, ignores user settings, no echoing to the telemetry output channel etc
	 * sender.logEvent('myEvent', { myData: 'myValue' });
	 * ```
	 */
	export interface TelemetrySender {
		/**
		 * Function to send event data without a stacktrace. Used within a {@link TelemetryLogger}
		 *
		 * @param eventName The name of the event which you are logging
		 * @param data A serializable key value pair that is being logged
		 */
		sendEventData(eventName: string, data?: Record<string, any>): void;

		/**
		 * Function to send an error. Used within a {@link TelemetryLogger}
		 *
		 * @param error The error being logged
		 * @param data Any additional data to be collected with the exception
		 */
		sendErrorData(error: Error, data?: Record<string, any>): void;

		/**
		 * Optional flush function which will give this sender a chance to send any remaining events
		 * as its {@link TelemetryLogger} is being disposed
		 */
		flush?(): void | Thenable<void>;
	}

	/**
	 * Options for creating a {@link TelemetryLogger}
	 */
	export interface TelemetryLoggerOptions {
		/**
		 * Whether or not you want to avoid having the built-in common properties such as os, extension name, etc injected into the data object.
		 * Defaults to `false` if not defined.
		 */
		readonly ignoreBuiltInCommonProperties?: boolean;

		/**
		 * Whether or not unhandled errors on the extension host caused by your extension should be logged to your sender.
		 * Defaults to `false` if not defined.
		 */
		readonly ignoreUnhandledErrors?: boolean;

		/**
		 * Any additional common properties which should be injected into the data object.
		 */
		readonly additionalCommonProperties?: Record<string, any>;
	}

	/**
	 * Represents a user request in chat history.
	 */
	export class ChatRequestTurn {
		/**
		 * The prompt as entered by the user.
		 *
		 * Information about references used in this request is stored in {@link ChatRequestTurn.references}.
		 *
		 * *Note* that the {@link ChatParticipant.name name} of the participant and the {@link ChatCommand.name command}
		 * are not part of the prompt.
		 */
		readonly prompt: string;

		/**
		 * The id of the chat participant to which this request was directed.
		 */
		readonly participant: string;

		/**
		 * The name of the {@link ChatCommand command} that was selected for this request.
		 */
		readonly command?: string;

		/**
		 * The references that were used in this message.
		 */
		readonly references: ChatPromptReference[];

		/**
		 * The list of tools were attached to this request.
		 */
		readonly toolReferences: readonly ChatLanguageModelToolReference[];

		/**
		 * @hidden
		 */
		private constructor(prompt: string, command: string | undefined, references: ChatPromptReference[], participant: string, toolReferences: ChatLanguageModelToolReference[]);
	}

	/**
	 * Represents a chat participant's response in chat history.
	 */
	export class ChatResponseTurn {
		/**
		 * The content that was received from the chat participant. Only the stream parts that represent actual content (not metadata) are represented.
		 */
		readonly response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart>;

		/**
		 * The result that was received from the chat participant.
		 */
		readonly result: ChatResult;

		/**
		 * The id of the chat participant that this response came from.
		 */
		readonly participant: string;

		/**
		 * The name of the command that this response came from.
		 */
		readonly command?: string;

		/**
		 * @hidden
		 */
		private constructor(response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart>, result: ChatResult, participant: string);
	}

	/**
	 * Extra context passed to a participant.
	 */
	export interface ChatContext {
		/**
		 * All of the chat messages so far in the current chat session. Currently, only chat messages for the current participant are included.
		 */
		readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn>;
	}

	/**
	 * Represents an error result from a chat request.
	 */
	export interface ChatErrorDetails {
		/**
		 * An error message that is shown to the user.
		 */
		message: string;

		/**
		 * If set to true, the response will be partly blurred out.
		 */
		responseIsFiltered?: boolean;
	}

	/**
	 * The result of a chat request.
	 */
	export interface ChatResult {
		/**
		 * If the request resulted in an error, this property defines the error details.
		 */
		errorDetails?: ChatErrorDetails;

		/**
		 * Arbitrary metadata for this result. Can be anything, but must be JSON-stringifyable.
		 */
		readonly metadata?: { readonly [key: string]: any };
	}

	/**
	 * Represents the type of user feedback received.
	 */
	export enum ChatResultFeedbackKind {
		/**
		 * The user marked the result as unhelpful.
		 */
		Unhelpful = 0,

		/**
		 * The user marked the result as helpful.
		 */
		Helpful = 1,
	}

	/**
	 * Represents user feedback for a result.
	 */
	export interface ChatResultFeedback {
		/**
		 * The ChatResult for which the user is providing feedback.
		 * This object has the same properties as the result returned from the participant callback, including `metadata`, but is not the same instance.
		 */
		readonly result: ChatResult;

		/**
		 * The kind of feedback that was received.
		 */
		readonly kind: ChatResultFeedbackKind;
	}

	/**
	 * A followup question suggested by the participant.
	 */
	export interface ChatFollowup {
		/**
		 * The message to send to the chat.
		 */
		prompt: string;

		/**
		 * A title to show the user. The prompt will be shown by default, when this is unspecified.
		 */
		label?: string;

		/**
		 * By default, the followup goes to the same participant/command. But this property can be set to invoke a different participant by ID.
		 * Followups can only invoke a participant that was contributed by the same extension.
		 */
		participant?: string;

		/**
		 * By default, the followup goes to the same participant/command. But this property can be set to invoke a different command.
		 */
		command?: string;
	}

	/**
	 * Will be invoked once after each request to get suggested followup questions to show the user. The user can click the followup to send it to the chat.
	 */
	export interface ChatFollowupProvider {
		/**
		 * Provide followups for the given result.
		 *
		 * @param result This object has the same properties as the result returned from the participant callback, including `metadata`, but is not the same instance.
		 * @param context Extra context passed to a participant.
		 * @param token A cancellation token.
		 */
		provideFollowups(result: ChatResult, context: ChatContext, token: CancellationToken): ProviderResult<ChatFollowup[]>;
	}

	/**
	 * A chat request handler is a callback that will be invoked when a request is made to a chat participant.
	 */
	export type ChatRequestHandler = (request: ChatRequest, context: ChatContext, response: ChatResponseStream, token: CancellationToken) => ProviderResult<ChatResult | void>;

	/**
	 * A chat participant can be invoked by the user in a chat session, using the `@` prefix. When it is invoked, it handles the chat request and is solely
	 * responsible for providing a response to the user. A ChatParticipant is created using {@link chat.createChatParticipant}.
	 */
	export interface ChatParticipant {
		/**
		 * A unique ID for this participant.
		 */
		readonly id: string;

		/**
		 * An icon for the participant shown in UI.
		 */
		iconPath?: IconPath;

		/**
		 * The handler for requests to this participant.
		 */
		requestHandler: ChatRequestHandler;

		/**
		 * This provider will be called once after each request to retrieve suggested followup questions.
		 */
		followupProvider?: ChatFollowupProvider;

		/**
		 * An event that fires whenever feedback for a result is received, e.g. when a user up- or down-votes
		 * a result.
		 *
		 * The passed {@link ChatResultFeedback.result result} is guaranteed to have the same properties as the result that was
		 * previously returned from this chat participant's handler.
		 */
		onDidReceiveFeedback: Event<ChatResultFeedback>;

		/**
		 * Dispose this participant and free resources.
		 */
		dispose(): void;
	}

	/**
	 * A reference to a value that the user added to their chat request.
	 */
	export interface ChatPromptReference {
		/**
		 * A unique identifier for this kind of reference.
		 */
		readonly id: string;

		/**
		 * The start and end index of the reference in the {@link ChatRequest.prompt prompt}. When undefined, the reference was not part of the prompt text.
		 *
		 * *Note* that the indices take the leading `#`-character into account which means they can
		 * used to modify the prompt as-is.
		 */
		readonly range?: [start: number, end: number];

		/**
		 * A description of this value that could be used in an LLM prompt.
		 */
		readonly modelDescription?: string;

		/**
		 * The value of this reference. The `string | Uri | Location` types are used today, but this could expand in the future.
		 */
		readonly value: string | Uri | Location | unknown;
	}

	/**
	 * A request to a chat participant.
	 */
	export interface ChatRequest {
		/**
		 * The prompt as entered by the user.
		 *
		 * Information about references used in this request is stored in {@link ChatRequest.references}.
		 *
		 * *Note* that the {@link ChatParticipant.name name} of the participant and the {@link ChatCommand.name command}
		 * are not part of the prompt.
		 */
		readonly prompt: string;

		/**
		 * The name of the {@link ChatCommand command} that was selected for this request.
		 */
		readonly command: string | undefined;

		/**
		 * The list of references and their values that are referenced in the prompt.
		 *
		 * *Note* that the prompt contains references as authored and that it is up to the participant
		 * to further modify the prompt, for instance by inlining reference values or creating links to
		 * headings which contain the resolved values. References are sorted in reverse by their range
		 * in the prompt. That means the last reference in the prompt is the first in this list. This simplifies
		 * string-manipulation of the prompt.
		 */
		readonly references: readonly ChatPromptReference[];

		/**
		 * The list of tools that the user attached to their request.
		 *
		 * When a tool reference is present, the chat participant should make a chat request using
		 * {@link LanguageModelChatToolMode.Required} to force the language model to generate input for the tool. Then, the
		 * participant can use {@link lm.invokeTool} to use the tool attach the result to its request for the user's prompt. The
		 * tool may contribute useful extra context for the user's request.
		 */
		readonly toolReferences: readonly ChatLanguageModelToolReference[];

		/**
		 * A token that can be passed to {@link lm.invokeTool} when invoking a tool inside the context of handling a chat request.
		 * This associates the tool invocation to a chat session.
		 */
		readonly toolInvocationToken: ChatParticipantToolToken;

		/**
		 * This is the model that is currently selected in the UI. Extensions can use this or use {@link lm.selectChatModels} to
		 * pick another model. Don't hold onto this past the lifetime of the request.
		 */
		readonly model: LanguageModelChat;
	}

	/**
	 * The ChatResponseStream is how a participant is able to return content to the chat view. It provides several methods for streaming different types of content
	 * which will be rendered in an appropriate way in the chat view. A participant can use the helper method for the type of content it wants to return, or it
	 * can instantiate a {@link ChatResponsePart} and use the generic {@link ChatResponseStream.push} method to return it.
	 */
	export interface ChatResponseStream {
		/**
		 * Push a markdown part to this stream. Short-hand for
		 * `push(new ChatResponseMarkdownPart(value))`.
		 *
		 * @see {@link ChatResponseStream.push}
		 * @param value A markdown string or a string that should be interpreted as markdown. The boolean form of {@link MarkdownString.isTrusted} is NOT supported.
		 */
		markdown(value: string | MarkdownString): void;

		/**
		 * Push an anchor part to this stream. Short-hand for
		 * `push(new ChatResponseAnchorPart(value, title))`.
		 * An anchor is an inline reference to some type of resource.
		 *
		 * @param value A uri or location.
		 * @param title An optional title that is rendered with value.
		 */
		anchor(value: Uri | Location, title?: string): void;

		/**
		 * Push a command button part to this stream. Short-hand for
		 * `push(new ChatResponseCommandButtonPart(value, title))`.
		 *
		 * @param command A Command that will be executed when the button is clicked.
		 */
		button(command: Command): void;

		/**
		 * Push a filetree part to this stream. Short-hand for
		 * `push(new ChatResponseFileTreePart(value))`.
		 *
		 * @param value File tree data.
		 * @param baseUri The base uri to which this file tree is relative.
		 */
		filetree(value: ChatResponseFileTree[], baseUri: Uri): void;

		/**
		 * Push a progress part to this stream. Short-hand for
		 * `push(new ChatResponseProgressPart(value))`.
		 *
		 * @param value A progress message
		 */
		progress(value: string): void;

		/**
		 * Push a reference to this stream. Short-hand for
		 * `push(new ChatResponseReferencePart(value))`.
		 *
		 * *Note* that the reference is not rendered inline with the response.
		 *
		 * @param value A uri or location
		 * @param iconPath Icon for the reference shown in UI
		 */
		reference(value: Uri | Location, iconPath?: IconPath): void;

		/**
		 * Pushes a part to this stream.
		 *
		 * @param part A response part, rendered or metadata
		 */
		push(part: ChatResponsePart): void;
	}

	/**
	 * Represents a part of a chat response that is formatted as Markdown.
	 */
	export class ChatResponseMarkdownPart {
		/**
		 * A markdown string or a string that should be interpreted as markdown.
		 */
		value: MarkdownString;

		/**
		 * Create a new ChatResponseMarkdownPart.
		 *
		 * @param value A markdown string or a string that should be interpreted as markdown. The boolean form of {@link MarkdownString.isTrusted} is NOT supported.
		 */
		constructor(value: string | MarkdownString);
	}

	/**
	 * Represents a file tree structure in a chat response.
	 */
	export interface ChatResponseFileTree {
		/**
		 * The name of the file or directory.
		 */
		name: string;

		/**
		 * An array of child file trees, if the current file tree is a directory.
		 */
		children?: ChatResponseFileTree[];
	}

	/**
	 * Represents a part of a chat response that is a file tree.
	 */
	export class ChatResponseFileTreePart {
		/**
		 * File tree data.
		 */
		value: ChatResponseFileTree[];

		/**
		 * The base uri to which this file tree is relative
		 */
		baseUri: Uri;

		/**
		 * Create a new ChatResponseFileTreePart.
		 * @param value File tree data.
		 * @param baseUri The base uri to which this file tree is relative.
		 */
		constructor(value: ChatResponseFileTree[], baseUri: Uri);
	}

	/**
	 * Represents a part of a chat response that is an anchor, that is rendered as a link to a target.
	 */
	export class ChatResponseAnchorPart {
		/**
		 * The target of this anchor.
		 */
		value: Uri | Location;

		/**
		 * An optional title that is rendered with value.
		 */
		title?: string;

		/**
		 * Create a new ChatResponseAnchorPart.
		 * @param value A uri or location.
		 * @param title An optional title that is rendered with value.
		 */
		constructor(value: Uri | Location, title?: string);
	}

	/**
	 * Represents a part of a chat response that is a progress message.
	 */
	export class ChatResponseProgressPart {
		/**
		 * The progress message
		 */
		value: string;

		/**
		 * Create a new ChatResponseProgressPart.
		 * @param value A progress message
		 */
		constructor(value: string);
	}

	/**
	 * Represents a part of a chat response that is a reference, rendered separately from the content.
	 */
	export class ChatResponseReferencePart {
		/**
		 * The reference target.
		 */
		value: Uri | Location;

		/**
		 * The icon for the reference.
		 */
		iconPath?: IconPath;

		/**
		 * Create a new ChatResponseReferencePart.
		 * @param value A uri or location
		 * @param iconPath Icon for the reference shown in UI
		 */
		constructor(value: Uri | Location, iconPath?: IconPath);
	}

	/**
	 * Represents a part of a chat response that is a button that executes a command.
	 */
	export class ChatResponseCommandButtonPart {
		/**
		 * The command that will be executed when the button is clicked.
		 */
		value: Command;

		/**
		 * Create a new ChatResponseCommandButtonPart.
		 * @param value A Command that will be executed when the button is clicked.
		 */
		constructor(value: Command);
	}

	/**
	 * Represents the different chat response types.
	 */
	export type ChatResponsePart = ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart
		| ChatResponseProgressPart | ChatResponseReferencePart | ChatResponseCommandButtonPart;


	/**
	 * Namespace for chat functionality. Users interact with chat participants by sending messages
	 * to them in the chat view. Chat participants can respond with markdown or other types of content
	 * via the {@link ChatResponseStream}.
	 */
	export namespace chat {
		/**
		 * Create a new {@link ChatParticipant chat participant} instance.
		 *
		 * @param id A unique identifier for the participant.
		 * @param handler A request handler for the participant.
		 * @returns A new chat participant
		 */
		export function createChatParticipant(id: string, handler: ChatRequestHandler): ChatParticipant;
	}

	/**
	 * Represents the role of a chat message. This is either the user or the assistant.
	 */
	export enum LanguageModelChatMessageRole {
		/**
		 * The user role, e.g the human interacting with a language model.
		 */
		User = 1,

		/**
		 * The assistant role, e.g. the language model generating responses.
		 */
		Assistant = 2
	}

	/**
	 * Represents a message in a chat. Can assume different roles, like user or assistant.
	 */
	export class LanguageModelChatMessage {

		/**
		 * Utility to create a new user message.
		 *
		 * @param content The content of the message.
		 * @param name The optional name of a user for the message.
		 */
		static User(content: string | Array<LanguageModelTextPart | LanguageModelToolResultPart>, name?: string): LanguageModelChatMessage;

		/**
		 * Utility to create a new assistant message.
		 *
		 * @param content The content of the message.
		 * @param name The optional name of a user for the message.
		 */
		static Assistant(content: string | Array<LanguageModelTextPart | LanguageModelToolCallPart>, name?: string): LanguageModelChatMessage;

		/**
		 * The role of this message.
		 */
		role: LanguageModelChatMessageRole;

		/**
		 * A string or heterogeneous array of things that a message can contain as content. Some parts may be message-type
		 * specific for some models.
		 */
		content: Array<LanguageModelInputPart>;

		/**
		 * The optional name of a user for this message.
		 */
		name: string | undefined;

		/**
		 * Create a new user message.
		 *
		 * @param role The role of the message.
		 * @param content The content of the message.
		 * @param name The optional name of a user for the message.
		 */
		constructor(role: LanguageModelChatMessageRole, content: string | Array<LanguageModelInputPart>, name?: string);
	}

	/**
	 * Represents a language model response.
	 *
	 * @see {@link ChatRequest}
	 */
	export interface LanguageModelChatResponse {

		/**
		 * An async iterable that is a stream of text and tool-call parts forming the overall response. A
		 * {@link LanguageModelTextPart} is part of the assistant's response to be shown to the user. A
		 * {@link LanguageModelToolCallPart} is a request from the language model to call a tool. The latter will
		 * only be returned if tools were passed in the request via {@link LanguageModelChatRequestOptions.tools}. The
		 * `unknown`-type is used as a placeholder for future parts, like image data parts.
		 *
		 * *Note* that this stream will error when during data receiving an error occurs. Consumers of the stream should handle
		 * the errors accordingly.
		 *
		 * To cancel the stream, the consumer can {@link CancellationTokenSource.cancel cancel} the token that was used to make
		 * the request or break from the for-loop.
		 *
		 * @example
		 * ```ts
		 * try {
		 *   // consume stream
		 *   for await (const chunk of response.stream) {
		 *      if (chunk instanceof LanguageModelTextPart) {
		 *        console.log("TEXT", chunk);
		 *      } else if (chunk instanceof LanguageModelToolCallPart) {
		 *        console.log("TOOL CALL", chunk);
		 *      }
		 *   }
		 *
		 * } catch(e) {
		 *   // stream ended with an error
		 *   console.error(e);
		 * }
		 * ```
		 */
		stream: AsyncIterable<LanguageModelTextPart | LanguageModelToolCallPart | unknown>;

		/**
		 * This is equivalent to filtering everything except for text parts from a {@link LanguageModelChatResponse.stream}.
		 *
		 * @see {@link LanguageModelChatResponse.stream}
		 */
		text: AsyncIterable<string>;
	}

	/**
	 * Represents a language model for making chat requests.
	 *
	 * @see {@link lm.selectChatModels}
	 */
	export interface LanguageModelChat {

		/**
		 * Human-readable name of the language model.
		 */
		readonly name: string;

		/**
		 * Opaque identifier of the language model.
		 */
		readonly id: string;

		/**
		 * A well-known identifier of the vendor of the language model. An example is `copilot`, but
		 * values are defined by extensions contributing chat models and need to be looked up with them.
		 */
		readonly vendor: string;

		/**
		 * Opaque family-name of the language model. Values might be `gpt-3.5-turbo`, `gpt4`, `phi2`, or `llama`
		 * but they are defined by extensions contributing languages and subject to change.
		 */
		readonly family: string;

		/**
		 * Opaque version string of the model. This is defined by the extension contributing the language model
		 * and subject to change.
		 */
		readonly version: string;

		/**
		 * The maximum number of tokens that can be sent to the model in a single request.
		 */
		readonly maxInputTokens: number;

		/**
		 * Make a chat request using a language model.
		 *
		 * *Note* that language model use may be subject to access restrictions and user consent. Calling this function
		 * for the first time (for an extension) will show a consent dialog to the user and because of that this function
		 * must _only be called in response to a user action!_ Extensions can use {@link LanguageModelAccessInformation.canSendRequest}
		 * to check if they have the necessary permissions to make a request.
		 *
		 * This function will return a rejected promise if making a request to the language model is not
		 * possible. Reasons for this can be:
		 *
		 * - user consent not given, see {@link LanguageModelError.NoPermissions `NoPermissions`}
		 * - model does not exist anymore, see {@link LanguageModelError.NotFound `NotFound`}
		 * - quota limits exceeded, see {@link LanguageModelError.Blocked `Blocked`}
		 * - other issues in which case extension must check {@link LanguageModelError.cause `LanguageModelError.cause`}
		 *
		 * An extension can make use of language model tool calling by passing a set of tools to
		 * {@link LanguageModelChatRequestOptions.tools}. The language model will return a {@link LanguageModelToolCallPart} and
		 * the extension can invoke the tool and make another request with the result.
		 *
		 * @param messages An array of message instances.
		 * @param options Options that control the request.
		 * @param token A cancellation token which controls the request. See {@link CancellationTokenSource} for how to create one.
		 * @returns A thenable that resolves to a {@link LanguageModelChatResponse}. The promise will reject when the request couldn't be made.
		 */
		sendRequest(messages: LanguageModelChatMessage[], options?: LanguageModelChatRequestOptions, token?: CancellationToken): Thenable<LanguageModelChatResponse>;

		/**
		 * Count the number of tokens in a message using the model specific tokenizer-logic.

		 * @param text A string or a message instance.
		 * @param token Optional cancellation token.  See {@link CancellationTokenSource} for how to create one.
		 * @returns A thenable that resolves to the number of tokens.
		 */
		countTokens(text: string | LanguageModelChatMessage, token?: CancellationToken): Thenable<number>;
	}

	/**
	 * Describes how to select language models for chat requests.
	 *
	 * @see {@link lm.selectChatModels}
	 */
	export interface LanguageModelChatSelector {

		/**
		 * A vendor of language models.
		 * @see {@link LanguageModelChat.vendor}
		 */
		vendor?: string;

		/**
		 * A family of language models.
		 * @see {@link LanguageModelChat.family}
		 */
		family?: string;

		/**
		 * The version of a language model.
		 * @see {@link LanguageModelChat.version}
		 */
		version?: string;

		/**
		 * The identifier of a language model.
		 * @see {@link LanguageModelChat.id}
		 */
		id?: string;
	}

	/**
	 * An error type for language model specific errors.
	 *
	 * Consumers of language models should check the code property to determine specific
	 * failure causes, like `if(someError.code === vscode.LanguageModelError.NotFound.name) {...}`
	 * for the case of referring to an unknown language model. For unspecified errors the `cause`-property
	 * will contain the actual error.
	 */
	export class LanguageModelError extends Error {

		/**
		 * The requestor does not have permissions to use this
		 * language model
		 */
		static NoPermissions(message?: string): LanguageModelError;

		/**
		 * The requestor is blocked from using this language model.
		 */
		static Blocked(message?: string): LanguageModelError;

		/**
		 * The language model does not exist.
		 */
		static NotFound(message?: string): LanguageModelError;

		/**
		 * A code that identifies this error.
		 *
		 * Possible values are names of errors, like {@linkcode LanguageModelError.NotFound NotFound},
		 * or `Unknown` for unspecified errors from the language model itself. In the latter case the
		 * `cause`-property will contain the actual error.
		 */
		readonly code: string;
	}

	/**
	 * Options for making a chat request using a language model.
	 *
	 * @see {@link LanguageModelChat.sendRequest}
	 */
	export interface LanguageModelChatRequestOptions {

		/**
		 * A human-readable message that explains why access to a language model is needed and what feature is enabled by it.
		 */
		justification?: string;

		/**
		 * A set of options that control the behavior of the language model. These options are specific to the language model
		 * and need to be looked up in the respective documentation.
		 */
		modelOptions?: { [name: string]: any };

		/**
		 * An optional list of tools that are available to the language model. These could be registered tools available via
		 * {@link lm.tools}, or private tools that are just implemented within the calling extension.
		 *
		 * If the LLM requests to call one of these tools, it will return a {@link LanguageModelToolCallPart} in
		 * {@link LanguageModelChatResponse.stream}. It's the caller's responsibility to invoke the tool. If it's a tool
		 * registered in {@link lm.tools}, that means calling {@link lm.invokeTool}.
		 *
		 * Then, the tool result can be provided to the LLM by creating an Assistant-type {@link LanguageModelChatMessage} with a
		 * {@link LanguageModelToolCallPart}, followed by a User-type message with a {@link LanguageModelToolResultPart}.
		 */
		tools?: LanguageModelChatTool[];

		/**
		 * 	The tool-selecting mode to use. {@link LanguageModelChatToolMode.Auto} by default.
		 */
		toolMode?: LanguageModelChatToolMode;
	}

	/**
	 * McpStdioServerDefinition represents an MCP server available by running
	 * a local process and operating on its stdin and stdout streams. The process
	 * will be spawned as a child process of the extension host and by default
	 * will not run in a shell environment.
	 */
	export class McpStdioServerDefinition {
		/**
		 * The human-readable name of the server.
		 */
		readonly label: string;

		/**
		 * The working directory used to start the server.
		 */
		cwd?: Uri;

		/**
		 * The command used to start the server. Node.js-based servers may use
		 * `process.execPath` to use the editor's version of Node.js to run the script.
		 */
		command: string;

		/**
		 * Additional command-line arguments passed to the server.
		 */
		args: string[];

		/**
		 * Optional additional environment information for the server. Variables
		 * in this environment will overwrite or remove (if null) the default
		 * environment variables of the editor's extension host.
		 */
		env: Record<string, string | number | null>;

		/**
		 * Optional version identification for the server. If this changes, the
		 * editor will indicate that tools have changed and prompt to refresh them.
		 */
		version?: string;

		/**
		 * @param label The human-readable name of the server.
		 * @param command The command used to start the server.
		 * @param args Additional command-line arguments passed to the server.
		 * @param env Optional additional environment information for the server.
		 * @param version Optional version identification for the server.
		 */
		constructor(label: string, command: string, args?: string[], env?: Record<string, string | number | null>, version?: string);
	}

	/**
	 * McpHttpServerDefinition represents an MCP server available using the
	 * Streamable HTTP transport.
	 */
	export class McpHttpServerDefinition {
		/**
		 * The human-readable name of the server.
		 */
		readonly label: string;

		/**
		 * The URI of the server. The editor will make a POST request to this URI
		 * to begin each session.
		 */
		uri: Uri;

		/**
		 * Optional additional heads included with each request to the server.
		 */
		headers: Record<string, string>;

		/**
		 * Optional version identification for the server. If this changes, the
		 * editor will indicate that tools have changed and prompt to refresh them.
		 */
		version?: string;

		/**
		 * @param label The human-readable name of the server.
		 * @param uri The URI of the server.
		 * @param headers Optional additional heads included with each request to the server.
		 */
		constructor(label: string, uri: Uri, headers?: Record<string, string>, version?: string);
	}

	/**
	 * Definitions that describe different types of Model Context Protocol servers,
	 * which can be returned from the {@link McpServerDefinitionProvider}.
	 */
	export type McpServerDefinition = McpStdioServerDefinition | McpHttpServerDefinition;

	/**
	 * A type that can provide Model Context Protocol server definitions. This
	 * should be registered using {@link lm.registerMcpServerDefinitionProvider}
	 * during extension activation.
	 */
	export interface McpServerDefinitionProvider<T extends McpServerDefinition = McpServerDefinition> {
		/**
		 * Optional event fired to signal that the set of available servers has changed.
		 */
		readonly onDidChangeMcpServerDefinitions?: Event<void>;

		/**
		 * Provides available MCP servers. The editor will call this method eagerly
		 * to ensure the availability of servers for the language model, and so
		 * extensions should not take actions which would require user
		 * interaction, such as authentication.
		 *
		 * @param token A cancellation token.
		 * @returns An array of MCP available MCP servers
		 */
		provideMcpServerDefinitions(token: CancellationToken): ProviderResult<T[]>;

		/**
		 * This function will be called when the editor needs to start a MCP server.
		 * At this point, the extension may take any actions which may require user
		 * interaction, such as authentication. Any non-`readonly` property of the
		 * server may be modified, and the extension should return the resolved server.
		 *
		 * The extension may return undefined to indicate that the server
		 * should not be started, or throw an error. If there is a pending tool
		 * call, the editor will cancel it and return an error message to the
		 * language model.
		 *
		 * @param server The MCP server to resolve
		 * @param token A cancellation token.
		 * @returns The resolved server or thenable that resolves to such. This may
		 * be the given `server` definition with non-readonly properties filled in.
		 */
		resolveMcpServerDefinition?(server: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * The provider version of {@linkcode LanguageModelChatRequestOptions}
	 */
	export interface LanguageModelChatRequestHandleOptions {
		/**
		 * A set of options that control the behavior of the language model. These options are specific to the language model
		 * and need to be looked up in the respective documentation.
		 */
		readonly modelOptions?: { readonly [name: string]: any };

		/**
		 * An optional list of tools that are available to the language model. These could be registered tools available via
		 * {@link lm.tools}, or private tools that are just implemented within the calling extension.
		 *
		 * If the LLM requests to call one of these tools, it will return a {@link LanguageModelToolCallPart} in
		 * {@link LanguageModelChatResponse.stream}. It's the caller's responsibility to invoke the tool. If it's a tool
		 * registered in {@link lm.tools}, that means calling {@link lm.invokeTool}.
		 *
		 * Then, the tool result can be provided to the LLM by creating an Assistant-type {@link LanguageModelChatMessage} with a
		 * {@link LanguageModelToolCallPart}, followed by a User-type message with a {@link LanguageModelToolResultPart}.
		 */
		readonly tools?: readonly LanguageModelChatTool[];

		/**
		 * 	The tool-selecting mode to use. {@link LanguageModelChatToolMode.Auto} by default.
		 */
		readonly toolMode?: LanguageModelChatToolMode;
	}

	/**
	 * All the information representing a single language model contributed by a {@linkcode LanguageModelChatProvider}.
	 */
	export interface LanguageModelChatInformation {

		/**
		 * Unique identifier for the language model. Must be unique per provider, but not required to be globally unique.
		 */
		readonly id: string;

		/**
		 * Human-readable name of the language model.
		 */
		readonly name: string;

		/**
		 * Opaque family-name of the language model. Values might be `gpt-3.5-turbo`, `gpt4`, `phi2`, or `llama`
		 * but they are defined by extensions contributing languages and subject to change.
		 */
		readonly family: string;

		/**
		 * The tooltip to render when hovering the model
		 */
		readonly tooltip?: string;

		/**
		 * An optional, human-readable string which will be rendered alongside the model.
		 */
		readonly detail?: string;

		/**
		 * Opaque version string of the model. This is defined by the extension contributing the language model
		 * and subject to change while the identifier is stable.
		 * This is used as a lookup value in {@linkcode LanguageModelChatSelector.version}
		 * An example is how GPT 4o has multiple versions like 2024-11-20 and 2024-08-06
		 */
		readonly version: string;

		/**
		 * The maximum number of tokens the model can accept as input.
		 */
		readonly maxInputTokens: number;

		/**
		 * The maximum number of tokens the model is capable of producing.
		 */
		readonly maxOutputTokens: number;

		/**
		 * Various features that the model supports such as tool calling or image input.
		 */
		readonly capabilities: {

			/**
			 * Whether image input is supported by the model.
			 * Common supported images are jpg and png, but each model will vary in supported mimetypes.
			 */
			readonly imageInput?: boolean;

			/**
			 * Whether tool calling is supported by the model.
			 * If a number is provided, that is the maximum number of tools a model can call.
			 */
			readonly toolCalling?: boolean | number;
		};
	}

	/**
	 * The provider version of {@linkcode LanguageModelChatMessage}.
	 */
	export interface LanguageModelChatRequestMessage {
		/**
		 * The role of this message.
		 */
		readonly role: LanguageModelChatMessageRole;

		/**
		 * A string or heterogeneous array of things that a message can contain as content. Some parts may be message-type
		 * specific for some models.
		 */
		readonly content: ReadonlyArray<LanguageModelInputPart | unknown>;

		/**
		 * The optional name of a user for this message.
		 */
		readonly name: string | undefined;
	}

	/**
	 * The various message types which a {@linkcode LanguageModelChatProvider} can emit in the chat response stream
	 */
	export type LanguageModelResponsePart = LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart;

	/**
	 * The various message types which can be sent via {@linkcode LanguageModelChat.sendRequest } and processed by a {@linkcode LanguageModelChatProvider}
	 */
	export type LanguageModelInputPart = LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart;

	/**
	 * Represents a Language model chat provider. This provider provides multiple models in a 1 provider to many model relationship
	 * An example of this would be how an OpenAI provider would provide models like gpt-5, o3, etc.
	 */
	export interface LanguageModelChatProvider<T extends LanguageModelChatInformation = LanguageModelChatInformation> {

		/**
		 * Signals a change from the provider to the editor so that {@linkcode prepareLanguageModelChatInformation} is called again
		 */
		readonly onDidChangeLanguageModelInformation?: Event<void>;

		/**
		 * Get the list of available language models contributed by this provider
		 * @param options Options which specify the calling context of this function
		 * @param token A cancellation token which signals if the user cancelled the request or not
		 * @returns A promise that resolves to the list of available language models
		 */
		prepareLanguageModelChatInformation(options: PrepareLanguageModelChatModelOptions, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Returns the response for a chat request, passing the results to the progress callback.
		 * The {@linkcode LanguageModelChatProvider} must emit the response parts to the progress callback as they are received from the language model.
		 * @param model The language model to use
		 * @param messages The messages to include in the request
		 * @param options Options for the request
		 * @param progress The progress to emit the streamed response chunks to
		 * @param token A cancellation token for the request
		 * @returns A promise that resolves when the response is complete. Results are actually passed to the progress callback.
		 */
		provideLanguageModelChatResponse(model: T, messages: readonly LanguageModelChatRequestMessage[], options: LanguageModelChatRequestHandleOptions, progress: Progress<LanguageModelResponsePart>, token: CancellationToken): Thenable<void>;

		/**
		 * Returns the number of tokens for a given text using the model specific tokenizer logic
		 * @param model The language model to use
		 * @param text The text to count tokens for
		 * @param token A cancellation token for the request
		 * @returns A promise that resolves to the number of tokens
		 */
		provideTokenCount(model: T, text: string | LanguageModelChatRequestMessage, token: CancellationToken): Thenable<number>;
	}

	/**
	 * The list of options passed into {@linkcode LanguageModelChatProvider.prepareLanguageModelChatInformation}
	 */
	export interface PrepareLanguageModelChatModelOptions {
		/**
		 * Whether or not the user should be prompted via some UI flow, or if models should be attempted to be resolved silently.
		 * If silent is true, all models may not be resolved due to lack of info such as API keys.
		 */
		readonly silent: boolean;
	}

	/**
	 * Namespace for language model related functionality.
	 */
	export namespace lm {

		/**
		 * An event that is fired when the set of available chat models changes.
		 */
		export const onDidChangeChatModels: Event<void>;

		/**
		 * Select chat models by a {@link LanguageModelChatSelector selector}. This can yield multiple or no chat models and
		 * extensions must handle these cases, esp. when no chat model exists, gracefully.
		 *
		 * ```ts
		 * const models = await vscode.lm.selectChatModels({ family: 'gpt-3.5-turbo' });
		 * if (models.length > 0) {
		 * 	const [first] = models;
		 * 	const response = await first.sendRequest(...)
		 * 	// ...
		 * } else {
		 * 	// NO chat models available
		 * }
		 * ```
		 *
		 * A selector can be written to broadly match all models of a given vendor or family, or it can narrowly select one model by ID.
		 * Keep in mind that the available set of models will change over time, but also that prompts may perform differently in
		 * different models.
		 *
		 * *Note* that extensions can hold on to the results returned by this function and use them later. However, when the
		 * {@link onDidChangeChatModels}-event is fired the list of chat models might have changed and extensions should re-query.
		 *
		 * @param selector A chat model selector. When omitted all chat models are returned.
		 * @returns An array of chat models, can be empty!
		 */
		export function selectChatModels(selector?: LanguageModelChatSelector): Thenable<LanguageModelChat[]>;

		/**
		 * Register a LanguageModelTool. The tool must also be registered in the package.json `languageModelTools` contribution
		 * point. A registered tool is available in the {@link lm.tools} list for any extension to see. But in order for it to
		 * be seen by a language model, it must be passed in the list of available tools in {@link LanguageModelChatRequestOptions.tools}.
		 * @returns A {@link Disposable} that unregisters the tool when disposed.
		 */
		export function registerTool<T>(name: string, tool: LanguageModelTool<T>): Disposable;

		/**
		 * A list of all available tools that were registered by all extensions using {@link lm.registerTool}. They can be called
		 * with {@link lm.invokeTool} with input that match their declared `inputSchema`.
		 */
		export const tools: readonly LanguageModelToolInformation[];

		/**
		 * Invoke a tool listed in {@link lm.tools} by name with the given input. The input will be validated against
		 * the schema declared by the tool
		 *
		 * A tool can be invoked by a chat participant, in the context of handling a chat request, or globally by any extension in
		 * any custom flow.
		 *
		 * In the former case, the caller shall pass the
		 * {@link LanguageModelToolInvocationOptions.toolInvocationToken toolInvocationToken}, which comes from a
		 * {@link ChatRequest.toolInvocationToken chat request}. This makes sure the chat UI shows the tool invocation for the
		 * correct conversation.
		 *
		 * A tool {@link LanguageModelToolResult result} is an array of {@link LanguageModelTextPart text-} and
		 * {@link LanguageModelPromptTsxPart prompt-tsx}-parts. If the tool caller is using `@vscode/prompt-tsx`, it can
		 * incorporate the response parts into its prompt using a `ToolResult`. If not, the parts can be passed along to the
		 * {@link LanguageModelChat} via a user message with a {@link LanguageModelToolResultPart}.
		 *
		 * If a chat participant wants to preserve tool results for requests across multiple turns, it can store tool results in
		 * the {@link ChatResult.metadata} returned from the handler and retrieve them on the next turn from
		 * {@link ChatResponseTurn.result}.
		 *
		 * @param name The name of the tool to call.
		 * @param options The options to use when invoking the tool.
		 * @param token A cancellation token. See {@link CancellationTokenSource} for how to create one.
		 * @returns The result of the tool invocation.
		 */
		export function invokeTool(name: string, options: LanguageModelToolInvocationOptions<object>, token?: CancellationToken): Thenable<LanguageModelToolResult>;

		/**
		 * Registers a provider that publishes Model Context Protocol servers for the editor to
		 * consume. This allows MCP servers to be dynamically provided to the editor in
		 * addition to those the user creates in their configuration files.
		 *
		 * Before calling this method, extensions must register the `contributes.mcpServerDefinitionProviders`
		 * extension point with the corresponding {@link id}, for example:
		 *
		 * ```js
		 * 	"contributes": {
		 * 		"mcpServerDefinitionProviders": [
		 * 			{
		 * 				"id": "cool-cloud-registry.mcp-servers",
		 * 				"label": "Cool Cloud Registry",
		 * 			}
		 * 		]
		 * 	}
		 * ```
		 *
		 * When a new McpServerDefinitionProvider is available, the editor will present a 'refresh'
		 * action to the user to discover new servers. To enable this flow, extensions should
		 * call `registerMcpServerDefinitionProvider` during activation.
		 * @param id The ID of the provider, which is unique to the extension.
		 * @param provider The provider to register
		 * @returns A disposable that unregisters the provider when disposed.
		 */
		export function registerMcpServerDefinitionProvider(id: string, provider: McpServerDefinitionProvider): Disposable;

		/**
		 * Registers a {@linkcode LanguageModelChatProvider}
		 * Note: You must also define the language model chat provider via the `languageModelChatProviders` contribution point in package.json
		 * @param vendor The vendor for this provider. Must be globally unique. An example is `copilot` or `openai`.
		 * @param provider The provider to register
		 * @returns A disposable that unregisters the provider when disposed
		*/
		export function registerLanguageModelChatProvider(vendor: string, provider: LanguageModelChatProvider): Disposable;
	}

	/**
	 * Represents extension specific information about the access to language models.
	 */
	export interface LanguageModelAccessInformation {

		/**
		 * An event that fires when access information changes.
		 */
		onDidChange: Event<void>;

		/**
		 * Checks if a request can be made to a language model.
		 *
		 * *Note* that calling this function will not trigger a consent UI but just checks for a persisted state.
		 *
		 * @param chat A language model chat object.
		 * @return `true` if a request can be made, `false` if not, `undefined` if the language
		 * model does not exist or consent hasn't been asked for.
		 */
		canSendRequest(chat: LanguageModelChat): boolean | undefined;
	}

	/**
	 * A tool that is available to the language model via {@link LanguageModelChatRequestOptions}. A language model uses all the
	 * properties of this interface to decide which tool to call, and how to call it.
	 */
	export interface LanguageModelChatTool {
		/**
		 * The name of the tool.
		 */
		name: string;

		/**
		 * The description of the tool.
		 */
		description: string;

		/**
		 * A JSON schema for the input this tool accepts.
		 */
		inputSchema?: object | undefined;
	}

	/**
	 * A tool-calling mode for the language model to use.
	 */
	export enum LanguageModelChatToolMode {
		/**
		 * The language model can choose to call a tool or generate a message. Is the default.
		 */
		Auto = 1,

		/**
		 * The language model must call one of the provided tools. Note- some models only support a single tool when using this
		 * mode.
		 */
		Required = 2
	}

	/**
	 * A language model response part indicating a tool call, returned from a {@link LanguageModelChatResponse}, and also can be
	 * included as a content part on a {@link LanguageModelChatMessage}, to represent a previous tool call in a chat request.
	 */
	export class LanguageModelToolCallPart {
		/**
		 * The ID of the tool call. This is a unique identifier for the tool call within the chat request.
		 */
		callId: string;

		/**
		 * The name of the tool to call.
		 */
		name: string;

		/**
		 * The input with which to call the tool.
		 */
		input: object;

		/**
		 * Create a new LanguageModelToolCallPart.
		 *
		 * @param callId The ID of the tool call.
		 * @param name The name of the tool to call.
		 * @param input The input with which to call the tool.
		 */
		constructor(callId: string, name: string, input: object);
	}

	/**
	 * The result of a tool call. This is the counterpart of a {@link LanguageModelToolCallPart tool call} and
	 * it can only be included in the content of a User message
	 */
	export class LanguageModelToolResultPart {
		/**
		 * The ID of the tool call.
		 *
		 * *Note* that this should match the {@link LanguageModelToolCallPart.callId callId} of a tool call part.
		 */
		callId: string;

		/**
		 * The value of the tool result.
		 */
		content: Array<LanguageModelTextPart | LanguageModelPromptTsxPart | unknown>;

		/**
		 * @param callId The ID of the tool call.
		 * @param content The content of the tool result.
		 */
		constructor(callId: string, content: Array<LanguageModelTextPart | LanguageModelPromptTsxPart | unknown>);
	}

	/**
	 * A language model response part containing a piece of text, returned from a {@link LanguageModelChatResponse}.
	 */
	export class LanguageModelTextPart {
		/**
		 * The text content of the part.
		 */
		value: string;

		/**
		 * Construct a text part with the given content.
		 * @param value The text content of the part.
		 */
		constructor(value: string);
	}

	/**
	 * A language model response part containing a PromptElementJSON from `@vscode/prompt-tsx`.
	 * @see {@link LanguageModelToolResult}
	 */
	export class LanguageModelPromptTsxPart {
		/**
		 * The value of the part.
		 */
		value: unknown;

		/**
		 * Construct a prompt-tsx part with the given content.
		 * @param value The value of the part, the result of `renderElementJSON` from `@vscode/prompt-tsx`.
		 */
		constructor(value: unknown);
	}

	/**
	 * A result returned from a tool invocation. If using `@vscode/prompt-tsx`, this result may be rendered using a `ToolResult`.
	 */
	export class LanguageModelToolResult {
		/**
		 * A list of tool result content parts. Includes `unknown` because this list may be extended with new content types in
		 * the future.
		 * @see {@link lm.invokeTool}.
		 */
		content: Array<LanguageModelTextPart | LanguageModelPromptTsxPart | unknown>;

		/**
		 * Create a LanguageModelToolResult
		 * @param content A list of tool result content parts
		 */
		constructor(content: Array<LanguageModelTextPart | LanguageModelPromptTsxPart>);
	}

	/**
	 * A token that can be passed to {@link lm.invokeTool} when invoking a tool inside the context of handling a chat request.
	 */
	export type ChatParticipantToolToken = never;

	/**
	 * Options provided for tool invocation.
	 */
	export interface LanguageModelToolInvocationOptions<T> {
		/**
		 * An opaque object that ties a tool invocation to a chat request from a {@link ChatParticipant chat participant}.
		 *
		 * The _only_ way to get a valid tool invocation token is using the provided {@link ChatRequest.toolInvocationToken toolInvocationToken}
		 * from a chat request. In that case, a progress bar will be automatically shown for the tool invocation in the chat response view, and if
		 * the tool requires user confirmation, it will show up inline in the chat view.
		 *
		 * If the tool is being invoked outside of a chat request, `undefined` should be passed instead, and no special UI except for
		 * confirmations will be shown.
		 *
		 * *Note* that a tool that invokes another tool during its invocation, can pass along the `toolInvocationToken` that it received.
		 */
		toolInvocationToken: ChatParticipantToolToken | undefined;

		/**
		 * The input with which to invoke the tool. The input must match the schema defined in
		 * {@link LanguageModelToolInformation.inputSchema}
		 */
		input: T;

		/**
		 * Options to hint at how many tokens the tool should return in its response, and enable the tool to count tokens
		 * accurately.
		 */
		tokenizationOptions?: LanguageModelToolTokenizationOptions;
	}

	/**
	 * Options related to tokenization for a tool invocation.
	 */
	export interface LanguageModelToolTokenizationOptions {
		/**
		 * If known, the maximum number of tokens the tool should emit in its result.
		 */
		tokenBudget: number;

		/**
		 * Count the number of tokens in a message using the model specific tokenizer-logic.
		 * @param text A string.
		 * @param token Optional cancellation token.  See {@link CancellationTokenSource} for how to create one.
		 * @returns A thenable that resolves to the number of tokens.
		 */
		countTokens(text: string, token?: CancellationToken): Thenable<number>;
	}

	/**
	 * Information about a registered tool available in {@link lm.tools}.
	 */
	export interface LanguageModelToolInformation {
		/**
		 * A unique name for the tool.
		 */
		readonly name: string;

		/**
		 * A description of this tool that may be passed to a language model.
		 */
		readonly description: string;

		/**
		 * A JSON schema for the input this tool accepts.
		 */
		readonly inputSchema: object | undefined;

		/**
		 * A set of tags, declared by the tool, that roughly describe the tool's capabilities. A tool user may use these to filter
		 * the set of tools to just ones that are relevant for the task at hand.
		 */
		readonly tags: readonly string[];
	}

	/**
	 * Options for {@link LanguageModelTool.prepareInvocation}.
	 */
	export interface LanguageModelToolInvocationPrepareOptions<T> {
		/**
		 * The input that the tool is being invoked with.
		 */
		input: T;
	}

	/**
	 * A tool that can be invoked by a call to a {@link LanguageModelChat}.
	 */
	export interface LanguageModelTool<T> {
		/**
		 * Invoke the tool with the given input and return a result.
		 *
		 * The provided {@link LanguageModelToolInvocationOptions.input} has been validated against the declared schema.
		 */
		invoke(options: LanguageModelToolInvocationOptions<T>, token: CancellationToken): ProviderResult<LanguageModelToolResult>;

		/**
		 * Called once before a tool is invoked. It's recommended to implement this to customize the progress message that appears
		 * while the tool is running, and to provide a more useful message with context from the invocation input. Can also
		 * signal that a tool needs user confirmation before running, if appropriate.
		 *
		 * * *Note 1:* Must be free of side-effects.
		 * * *Note 2:* A call to `prepareInvocation` is not necessarily followed by a call to `invoke`.
		 */
		prepareInvocation?(options: LanguageModelToolInvocationPrepareOptions<T>, token: CancellationToken): ProviderResult<PreparedToolInvocation>;
	}

	/**
	 * When this is returned in {@link PreparedToolInvocation}, the user will be asked to confirm before running the tool. These
	 * messages will be shown with buttons that say "Continue" and "Cancel".
	 */
	export interface LanguageModelToolConfirmationMessages {
		/**
		 * The title of the confirmation message.
		 */
		title: string;

		/**
		 * The body of the confirmation message.
		 */
		message: string | MarkdownString;
	}

	/**
	 * The result of a call to {@link LanguageModelTool.prepareInvocation}.
	 */
	export interface PreparedToolInvocation {
		/**
		 * A customized progress message to show while the tool runs.
		 */
		invocationMessage?: string | MarkdownString;

		/**
		 * The presence of this property indicates that the user should be asked to confirm before running the tool. The user
		 * should be asked for confirmation for any tool that has a side-effect or may potentially be dangerous.
		 */
		confirmationMessages?: LanguageModelToolConfirmationMessages;
	}

	/**
	 * A reference to a tool that the user manually attached to their request, either using the `#`-syntax inline, or as an
	 * attachment via the paperclip button.
	 */
	export interface ChatLanguageModelToolReference {
		/**
		 * The tool name. Refers to a tool listed in {@link lm.tools}.
		 */
		readonly name: string;

		/**
		 * The start and end index of the reference in the {@link ChatRequest.prompt prompt}. When undefined, the reference was
		 * not part of the prompt text.
		 *
		 * *Note* that the indices take the leading `#`-character into account which means they can be used to modify the prompt
		 * as-is.
		 */
		readonly range?: [start: number, end: number];
	}
}

/**
 * Thenable is a common denominator between ES6 promises, Q, jquery.Deferred, WinJS.Promise,
 * and others. This API makes no assumption about what promise library is being used which
 * enables reusing existing code without migrating to a specific promise implementation. Still,
 * we recommend the use of native promises which are available in this editor.
 */
interface Thenable<T> extends PromiseLike<T> { }
