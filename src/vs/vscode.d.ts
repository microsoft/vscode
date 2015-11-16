/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
	This is the Type Definition file for VSCode version 0.10.1
*/

/*
	- comments are marked like this '<<< comment >>>'

	some global comments:
	- I'm missing some structure/grouping in this file:
		- it is just a big soup of definitions
		- entrypoints seem to be at the end so you have to read backwards
		- the interface 'Extension' is on line 1384! (neither at the beginning, nor at the end)
	- it would be much easier to grasp the gist of the API if:
		- entrypoints would be at the beginning: start with namespaces and functions and 'Extension' because that is what devs are interested in.
		- then continue with the different extensible areas, workspace first, then editors, commands etc.
		- group the areas by some big separating comment that works like a section header with section overview.
		- in the section header explain the fundamental concepts of that section in a few sentences with forward links to the types and interfaces.
		- move auxiliary types/interfaces that are only used in the section towards the end of the section. So Range and Position would be at the end of the text section.
		- move fundamental (shared) types (e.g. CancellationToken etc.) to the end of the d.ts (but again group related items and use separator comments in between).
	- it would be helpful if the class or interface comment would explain how the class is used, i.e. how instances are created:
			the FileSystemWatcher is a good example:
				"To get an instance of a {{FileSystemWatcher}} use {{workspace.createFileSystemWatcher}}."
	- lots of class or method comments are still missing. If we cannot create all of them in time, we should focus on comments for non-obvious cases.
		I have added a "non-obvious" comment.

	- label, names, descriptions: would be great to indicate if they show up in the user interface and therefore must be human readable.
*/


declare namespace vscode {

	/**
	 * Visual Studio Code's version.
	 */
	export var version: string;

	/**
	 * Represents a reference to a command. Provides a title which
	 * will be used to represent a command in the UI and, optionally,
	 * an array of arguments which will be passed to command handler
	 * function when invoked.
	 */
	export interface Command {
		/**
		 * Title of the command, like __save__.
		 */
		title: string;

		/**
		 * The identifier of the actual command handler.
		 * @see [[#commands.registerCommand]].
		 */
		command: string;

		/**
		 * Arguments that the command-handler should be
		 * invoked with.
		 */
		arguments?: any[];
	}

	/**
	 * Represents a line of text such as a line of source code.
	 *
	 * TextLine objects are __immutable__. When a [document](#TextDocument) changes,
	 * previsouly retrieved lines will not represent the latest state.
	 */
	export interface TextLine {

		/**
		 * The zero-based line number.
		 *
		 * @readonly
		 */
		lineNumber: number;

		/**
		 * The text of this line without the line separator characters.
		 *
		 * @readonly
		 */
		text: string;

		/**
		 * The range this line covers without the line separator characters.
		 *
		 * @readonly
		 */
		range: Range;

		/**
		 * The range this line covers with the line separator characters.
		 *
		 * @readonly
		 */
		rangeIncludingLineBreak: Range;

		/**
		 * The offset of the first character which is not a whitespace character as defined
		 * by `/\s/`.
		 *
		 * @readonly
		 */
		firstNonWhitespaceCharacterIndex: number;

		/**
		 * Whether this line is whitespace only, shorthand
		 * for [[#TextLine.firstNonWhitespaceCharacterIndex]] === [[#TextLine.text.length]]
		 *
		 * @readonly
		 */
		isEmptyOrWhitespace: boolean;
	}

	/**
	 * Represents a text document, such as a source file. Text documents have
	 * [lines](#TextLine) and knowledge about an underlying resource like a file.
	 */
	export interface TextDocument {

		/**
		 * The associated URI for this document. Most documents have the __file__-scheme, indicating that they
		 * represent files on disk. However, some documents may have other schemes indicating that they are not
		 * available on disk.
		 *
		 * @readonly
		 */
		uri: Uri;

		/**
		 * The file system path of the associated resource. Shorthand
		 * notation for [[#TextDocument.uri.fsPath]]. Independent of the uri scheme.
		 *
		 * @readonly
		 */
		fileName: string;

		/**
		 * Is this document representing an untitled file.
		 *
		 * @readonly
		 */
		isUntitled: boolean;

		/**
		 * The identifier of the language associated with this document.
		 *
		 * @readonly
		 */
		languageId: string;

		/**
		 * The version number of this document (it will strictly increase after each
		 * change, including undo/redo).
		 *
		 * @readonly
		 */
		version: number;

		/**
		 * true if there are unpersisted changes
		 *
		 * @readonly
		 */
		isDirty: boolean;

		/**
		 * Save the underlying file.
		 *
		 * @return A promise that will resolve to true when the file
		 *  has been saved.
		 */
		save(): Thenable<boolean>;

		/**
		 * The number of lines in this document.
		 *
		 * @readonly
		 */
		lineCount: number;

		/**
		 * Returns a text line denoted by the line number. Note
		 * that the returned object is *not* live and changes to the
		 * document are not reflected.
		 *
		 * @param line A line number in [0, lineCount).
		 * @return A [line](#TextLine).
		 */
		lineAt(line: number): TextLine;

		/**
		 * Returns a text line denoted by the position. Note
		 * that the returned object is *not* live and changes to the
		 * document are not reflected.
		 *
		 * The position will be [adjusted](#TextDocument.validatePosition).
		 *
		 * @see [[#TextDocument.lineAt]]
		 * @param position A position.
		 * @return A [line](#TextLine).
		 */
		lineAt(position: Position): TextLine;

		/**
		 * Converts the position to a zero-based offset.
		 *
		 * The position will be [adjusted](#TextDocument.validatePosition).
		 *
		 * @param position A position.
		 * @return A valid zero-based offset.
		 */
		offsetAt(position: Position): number;

		/**
		 * Converts a zero-based offset to a position.
		 *
		 * @param offset A zero-based offset.
		 * @return A valid [position](#Position).
		 */
		positionAt(offset: number): Position;

		/**
		 * Get the text of this document. A substring can be retrieved by providing
		 * a range. The range will be [adjusted](#TextDocument.validateRange).
		 *
		 * @param range Include only the text included by the range.
		 * @return The text inside the provided range or the entire text.
		 */
		getText(range?: Range): string;

		/**
		 * Get a word-range at the given position. By default words are defined by
		 * common separators, like space, -, _, etc. In addition, per languge custom
		 * [word definitions](#LanguageConfiguration.wordPattern) can be defined.
		 *
		 * The position will be [adjusted](#TextDocument.validatePosition).
		 *
		 * @param position A position.
		 * @return A range spanning a word, or `undefined`.
		 */
		getWordRangeAtPosition(position: Position): Range;

		/**
		 * Ensure a range is completely contained in this document.
		 *
		 * @param range A range.
		 * @return The given range or a new, adjusted range.
		 */
		validateRange(range: Range): Range;

		/**
		 * Ensure a position is completely contained in this document.
		 *
		 * @param position A position.
		 * @return The given position or a new, adjusted position.
		 */
		validatePosition(position: Position): Position;
	}

	/**
	 * Represents a line and character position, such as
	 * the position of the cursor.
	 *
	 * Position objects are __immutable__. Use the [with](#Position.with) or
	 * [translate](#Position.translate) methods to derive new positions
	 * from an existing position.
	 */
	export class Position {

		/**
		 * The zero-based line value.
		 * @readonly
		 */
		line: number;

		/**
		 * The zero-based character value.
		 * @readonly
		 */
		character: number;

		/**
		 * @param line A zero-based line value.
		 * @param character A zero-based character value.
		 */
		constructor(line: number, character: number);

		/**
		 * Check if `other` is before this position.
		 *
		 * @param other A position.
		 * @return `true` if position is on a smaller line
		 * or on the same line on a smaller character.
		 */
		isBefore(other: Position): boolean;

		/**
		 * Check if `other` is before or equal to this position.
		 *
		 * @param other A position.
		 * @return `true` if position is on a smaller line
		 * or on the same line on a smaller or equal character.
		 */
		isBeforeOrEqual(other: Position): boolean;

		/**
		 * Check if `other` is after this position.
		 *
		 * @param other A position.
		 * @return `true` if position is on a greater line
		 * or on the same line on a greater character.
		 */
		isAfter(other: Position): boolean;

		/**
		 * Check if `other` is after or equal to this position.
		 *
		 * @param other A position.
		 * @return `true` if position is on a greater line
		 * or on the same line on a greater or equal character.
		 */
		isAfterOrEqual(other: Position): boolean;

		/**
		 * Check if `other` equals this position.
		 *
		 * @param other A position.
		 * @return `true` if the line and character of the given position are equal to
		 * the line and character of this position.
		 */
		isEqual(other: Position): boolean;

		/**
		 * Compare this to `other`.
		 *
		 * @param other A position.
		 * @return A number smaller than zero if this position is before the given position,
		 * a number greater than zero if this position is after the given position, or zero when
		 * this and the given position are equal.
		 */
		compareTo(other: Position): number;

		/**
		 * Create a new position relative to this position.
		 *
		 * @param lineDelta Delta value for the line value, default is `0`.
		 * @param characterDelta Delta value for the character value, default is `0`.
		 * @return A position which line and character is the sum of the current line and
		 * character and the corresponding deltas.
		 */
		translate(lineDelta?: number, characterDelta?: number): Position;

		/**
		 * Create a new position derived from this position.
		 *
		 * @param line Value that should be used as line value, default is the [existing value](#Position.line)
		 * @param character Value that should be used as character value, default is the [existing value](#Position.character)
		 * @return A position where line and character are replaced by the given values.
		 */
		with(line?: number, character?: number): Position;
	}

	/**
	 * A range represents an ordered pair of two positions.
	 * It is guaranteed that [start](#Range.start).isBeforeOrEqual([end](#Range.end))
	 *
	 * Range objects are __immutable__. Use the [with](#Range.with),
	 * [intersection](#Range.intersection), or [union](#Range.union) methods
	 * to derive new ranges from an existing range.
	 */
	export class Range {

		/**
		 * The start position. It is before or equal to [end](#Range.end).
		 * @readonly
		 */
		start: Position;

		/**
		 * The end position. it is after or equal to [start](#Range.start).
		 * @readonly
		 */
		end: Position;

		/**
		 * Create a new range from two position. If `start` is not
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
		 * `true` iff `start` and `end` are equal.
		 */
		isEmpty: boolean;

		/**
		 * `true` iff `start.line` and `end.line` are equal.
		 */
		isSingleLine: boolean;

		/**
		 * Check if a position or a range is contained in this range.
		 *
		 * @param positionOrRange A position or a range.
		 * @return `true` iff the position or range is inside or equal
		 * to this range.
		 */
		contains(positionOrRange: Position | Range): boolean;

		/**
		 * Check if `other` equals this range.
		 *
		 * @param other A range.
		 * @return `true` when start and end are [equal](#Position.isEqual) to
		 * start and end of this range
		 */
		isEqual(other: Range): boolean;

		/**
		 * Intersect `range` with this range and returns a new range or `undefined`
		 * if the ranges have no overlap.
		 *
		 * @param range A range.
		 * @return A range of the greater start and smaller end positions. Will
		 * return undefined when there is no overlap.
		 */
		intersection(range: Range): Range;

		/**
		 * Compute the union of `other` with this range.
		 *
		 * @param other A range.
		 * @return A range of smaller start position and the greater end position.
		 */
		union(other: Range): Range;

		/**
		 * Create a new range derived from this range.
		 *
		 * @param start A position that should be used as start. The default value is the [current start](#Range.start).
		 * @param end A position that should be used as end. The default value is the [current end](#Range.end).
		 * @return A range derived from this range with the given start and end position.
		 * If start and end are not different this range will be returned.
		 */
		with(start?: Position, end?: Position): Range;
	}

	/**
	 * Represents a text selection in an editor.
	 */
	export class Selection extends Range {

		/**
		 * The position at which the selection starts.
		 * This position might be before or after [active](#Selection.active)
		 */
		anchor: Position;

		/**
		 * The position of the cursor.
		 * This position might be before or after [anchor](#Selection.anchor)
		 */
		active: Position;

		/**
		 * Create a selection from two postions.
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
		 * A selection is reversed if [active](#Selection.active).isBefore([anchor](#Selection.anchor))
		 */
		isReversed: boolean;
	}

	/**
	 * Represents an event describing the change in a [text editor's selections](#TextEditor.selections).
	 */
	export interface TextEditorSelectionChangeEvent {
		/**
		 * The [text editor](#TextEditor) for which the selections have changed.
		 */
		textEditor: TextEditor;
		/**
		 * The new value for the [text editor's selections](#TextEditor.selections).
		 */
		selections: Selection[];
	}

	/**
	 * Represents an event describing the change in a [text editor's options](#TextEditor.options).
	 */
	export interface TextEditorOptionsChangeEvent {
		/**
		 * The [text editor](#TextEditor) for which the options have changed.
		 */
		textEditor: TextEditor;
		/**
		 * The new value for the [text editor's options](#TextEditor.options).
		 */
		options: TextEditorOptions;
	}

	/**
	 * Represents a [text editor](#TextEditor)'s [options](#TextEditor.options).
	 */
	export interface TextEditorOptions {

		/**
		 * The size in spaces a tab takes. This is used for two purposes:
		 *  - the rendering width of a tab character;
		 *  - the number of spaces to insert when [insertSpaces](#TextEditorOptions.insertSpaces) is true.
		 */
		tabSize: number;

		/**
		 * When pressing Tab insert [n](#TextEditorOptions.tabSize) spaces.
		 */
		insertSpaces: boolean;
	}

	/**
	 * Represents a handle to a set of decorations
	 * sharing the same [styling options](#DecorationRenderOptions) in a [text editor](#TextEditor).
	 *
	 * To get an instance of a `TextEditorDecorationType` use
	 * [createTextEditorDecorationType](#window.createTextEditorDecorationType).
	 */
	export interface TextEditorDecorationType {

		/**
		 * Internal representation of the handle.
		 * @readonly
		 */
		key: string;

		/**
		 * Remove this decoration type and all decorations on all text editors using it.
		 */
		dispose(): void;
	}

	/**
	 * Represents different [reveal](#TextEditor.revealRange) strategies in a text editor.
	 */
	export enum TextEditorRevealType {
		/**
		 * The range will be revealed with as little scrolling as possible.
		 */
		Default,
		/**
		 * The range will always be revealed in the center of the viewport.
		 */
		InCenter,
		/**
		 * If the range is outside the viewport, it will be revealed in the center of the viewport.
		 * Otherwise, it will be revealed with as little scrolling as possible.
		 */
		InCenterIfOutsideViewport
	}

	/**
	 * Represents different positions for rendering a decoration in an (overview ruler)[#DecorationRenderOptions.overviewRulerLane].
	 * The overview ruler supports three lanes.
	 */
	export enum OverviewRulerLane {
		Left = 1,
		Center = 2,
		Right = 4,
		Full = 7
	}

	/**
	 * Represents theme specific rendering styles for a [text editor decoration](#TextEditorDecorationType).
	 */
	export interface ThemableDecorationRenderOptions {
		/**
		 * Background color of the decoration. Use rgba() and define transparent background colors to play well with other decorations.
		 */
		backgroundColor?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		outlineColor?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		outlineStyle?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		outlineWidth?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		borderColor?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		borderRadius?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		borderSpacing?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		borderStyle?: string;

		/**
		 * CSS styling property that will be applied to text enclosed by a decoration.
		 */
		borderWidth?: string;

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
		color?: string;

		/**
		 * An **absolute path** to an image to be rendered in the gutterIconPath.
		 */
		gutterIconPath?: string;

		/**
		 * The color of the decoration in the overview ruler. Use rgba() and define transparent colors to play well with other decorations.
		 */
		overviewRulerColor?: string;
	}

	/**
	 * Represents rendering styles for a [text editor decoration](#TextEditorDecorationType).
	 */
	export interface DecorationRenderOptions extends ThemableDecorationRenderOptions {
		/**
		 * Should the decoration be rendered also on the whitespace after the line text.
		 * Defaults to `false`.
		 */
		isWholeLine?: boolean;

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
	 * Represents options for a specific decoration in a [decoration set](#TextEditorDecorationType).
	 */
	export interface DecorationOptions {

		/**
		 * Range to which this decoration is applied.
		 */
		range: Range;

		/**
		 * A message that should be rendered when hovering over the decoration.
		 */
		hoverMessage: MarkedString | MarkedString[];
	}

	/**
	 * Represents an editor that is attached to a [document](#TextDocument).
	 */
	export interface TextEditor {

		/**
		 * The document associated with this text editor. The document will be the same for the entire lifetime of this text editor.
		 */
		document: TextDocument;

		/**
		 * The primary selection on this text editor. Shorthand for `TextEditor.selections[0]`.
		 */
		selection: Selection;

		/**
		 * The selections in this text editor. The primary selection is always at index 0.
		 */
		selections: Selection[];

		/**
		 * Text editor options.
		 */
		options: TextEditorOptions;

		/**
		 * Perform an edit on the document associated with this text editor.
		 *
		 * The given callback-function is invoked with an [edit-builder](#TextEditorEdit) which must
		 * be used to make edits. Note that the the edit-builder is only valid while the
		 * callback executes.
		 *
		 * @param callback A function which can make edits using an [edit-builder](#TextEditorEdit).
		 * @return A promise that resolves with a value indicating if the edits could be applied.
		 */
		edit(callback: (editBuilder: TextEditorEdit) => void): Thenable<boolean>;

		/**
		 * Adds a set of decorations to the text editor. If a set of decorations already exists with
		 * the given [decoration type](#TextEditorDecorationType), they will be replaced.
		 *
		 * See [createTextEditorDecorationType](#window.createTextEditorDecorationType).
		 *
		 * @param decorationType A decoration type.
		 * @param rangesOrOptions Either [ranges](#Range) or more detailed [options](#DecorationOptions).
		 */
		setDecorations(decorationType: TextEditorDecorationType, rangesOrOptions: Range[] | DecorationOptions[]): void;

		/**
		 * Scroll as indicated by `revealType` in order to reveal the given range.
		 *
		 * @param range A range.
		 * @param revealType The scrolling strategy for revealing `range`.
		 */
		revealRange(range: Range, revealType?: TextEditorRevealType): void;

		/**
		 * **This method is deprecated.** Use [window.showTextDocument](#window.showTextDocument)
		 * instead. This method shows unexpected bahviour and will be removed in the next major update.
		 *
		 * @deprecated
		 * Show the text editor.
		 */
		show(column?: ViewColumn): void;

		/**
		 * **This method is deprecated.** Use the command 'workbench.action.closeActiveEditor' instead.
		 * This method shows unexpected bahviour and will be removed in the next major update.
		 *
		 * @deprecated
		 *
		 * Hide the text editor.
		 */
		hide(): void;
	}

	/**
	 * A complex edit that will be applied in one transaction on a TextEditor.
	 * This holds a description of the edits and if the edits are valid (i.e. no overlapping regions, document was not changed in the meantime, etc.)
	 * they can be applied on a [document](#Document) associated with a [text editor](#TextEditor).
	 *
	 */
	export interface TextEditorEdit {
		/**
		 * Replace a certain text region with a new value.
		 * You can use \r\n or \n in `value` and they will be normalized to the current [document](#Document).
		 *
		 * @param location The range this operation should remove.
		 * @param value The new text this operation should insert after removing `location`.
		 */
		replace(location: Position | Range | Selection, value: string): void;

		/**
		 * Insert text at a location.
		 * You can use \r\n or \n in `value` and they will be normalized to the current [document](#Document).
		 * Although the equivalent text edit can be made with [replace](#TextEditorEdit.replace), `insert` will produce a different resulting selection (it will get moved).
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
	}

	/**
	 * A universal resource identifier representing either a file on disk on
	 * or another resource, like untitled resources.
	 */
	export class Uri {

		/**
		 * Create an URI from a file system path. The [scheme](#Uri.scheme)
		 * will be `file`.
		 *
		 * @param path A file system or UNC path.
		 * @return A new Uri instance.
		 */
		static file(path: string): Uri;

		/**
		 * Create an URI from a string. Will throw if the given value is not
		 * valid.
		 *
		 * @param The string value of an Uri.
		 * @return A new Uri instance.
		 */
		static parse(value: string): Uri;

		/**
		 * scheme is the 'http' part of 'http://www.msft.com/some/path?query#fragment'.
		 * The part before the first colon.
		 */
		scheme: string;

		/**
		 * authority is the 'www.msft.com' part of 'http://www.msft.com/some/path?query#fragment'.
		 * The part between the first double slashes and the next slash.
		 */
		authority: string;

		/**
		 * path is the '/some/path' part of 'http://www.msft.com/some/path?query#fragment'.
		 */
		path: string;

		/**
		 * query is the 'query' part of 'http://www.msft.com/some/path?query#fragment'.
		 */
		query: string;

		/**
		 * fragment is the 'fragment' part of 'http://www.msft.com/some/path?query#fragment'.
		 */
		fragment: string;

		/**
		 * Retuns a string representing the corresponding file system path of this URI.
		 * Will handle UNC paths and normalize windows drive letters to lower-case. Also
		 * uses the platform specific path separator. Will *not* validate the path for
		 * invalid characters and semantics. Will *not* look at the scheme of this URI.
		 */
		fsPath: string;

		/**
		 * Returns a canonical representation of this URI. The representation and normalization
		 * of a URI depends on the scheme.
		 */
		toString(): string;

		toJSON(): any;
	}

	/**
	 * A cancellation token is passed to asynchronous or long running
	 * operation to request cancellation, like cancelling a request
	 * for completion items because the user continued to type.
	 */
	export interface CancellationToken {

		/**
		 * Is `true` when the token has been cancelled, `false` otherwise.
		 */
		isCancellationRequested: boolean;

		/**
		 * An [event](#Event) which fires upon cancellation.
		 */
		onCancellationRequested: Event<any>;
	}

	/**
	 * A cancellation source creates and controls a [cancellation token](#CancellationToken).
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
		 * Dispose object and free resources. Will call [cancel](#CancellationTokenSource.cancel).
		 */
		dispose(): void;
	}

	/**
	 * Represents a type which can release resources, such
	 * as event listening or a timer.
	 */
	export class Disposable {

		/**
		 * Combine many disposable-likes into one. Use this method
		 * when having objects with a dispose function which are not
		 * instances of Disposable.
		 *
		 * @return Returns a new disposable which, upon dispose, will
		 * dispose all provided disposables.
		 */
		static from(...disposableLikes: { dispose: () => any }[]): Disposable;

		/**
		 * Creates a new Disposable calling the provided function
		 * on dispose.
		 * @param callOnDispose Function that disposes something
		 */
		constructor(callOnDispose: Function);

		/**
		 * Dispose this object.
		 */
		dispose(): any;
	}

	/**
	 * Represents a typed event.
	 * <<< an example for how to use? >>>
	 */
	export interface Event<T> {

		/**
		 *
		 * @param listener The listener function will be called when the event happens.
		 * @param thisArgs The `this`-argument which will be used when calling the event listener.
		 * @param disposables An array to which a [disposeable](#Disposable) will be added.
		 * @return A disposable which unsubscribes the event listener
		 */
		(listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
	}

	/**
	 * A file system watcher notifies about changes to files and folders
	 * on disk. To get an instance of a `FileSystemWatcher` use
	 * [createFileSystemWatcher](#workspace.createFileSystemWatcher).
	 */
	export interface FileSystemWatcher extends Disposable {

		/**
		 * true if this file system watcher has been created such that
		 * it ignores creation file system events.
		 */
		ignoreCreateEvents: boolean;

		/**
		 * true if this file system watcher has been created such that
		 * it ignores change file system events.
		 */
		ignoreChangeEvents: boolean;

		/**
		 * true if this file system watcher has been created such that
		 * it ignores delete file system events.
		 */
		ignoreDeleteEvents: boolean

		/**
		 * An event which fires on file/folder creation.
		 */
		onDidCreate: Event<Uri>;

		/**
		 * An event which fires on file/folder change.
		 */
		onDidChange: Event<Uri>;

		/**
		 * An event which fires on file/folder deletion.
		 */
		onDidDelete: Event<Uri>;
	}

	/**
	 * Represents an item that can be selected from
	 * a list of items
	 */
	export interface QuickPickItem {

		/**
		 * A label. Will be rendered prominent.
		 */
		label: string;

		/**
		 * A description. Will be rendered less prominent.
		 */
		description: string;
	}

	/**
	 *
	 */
	export interface QuickPickOptions {
		/**
		* an optional flag to include the description when filtering the picks
		*/
		matchOnDescription?: boolean;

		/**
		* an optional string to show as place holder in the input box to guide the user what she picks on
		*/
		placeHolder?: string;
	}

	/**
	 * Represents an action that is shown with an information, warning, or
	 * error message
	 *
	 * @see #window.showInformationMessage
	 * @see #window.showWarningMessage
	 * @see #window.showErrorMessage
	 */
	export interface MessageItem {

		/**
		 * A short title like 'Retry', 'Open Log' etc
		 */
		title: string;
	}

	/**
	 *
	 */
	export interface InputBoxOptions {

		/**
		* The value to prefill in the input box.
		*/
		value?: string;

		/**
		* The text to display underneath the input box.
		*/
		prompt?: string;

		/**
		* An optional string to show as place holder in the input box to guide the user what to type.
		*/
		placeHolder?: string;

		/**
		* Set to true to show a password prompt that will not show the typed value.
		*/
		password?: boolean;
	}

	/**
	 * A document filter denotes a document by different properties like
	 * the [language](#TextDocument.languageId), the [scheme](#Uri.scheme) of
	 * it's resource, or a glob-pattern that is applied to the [path](#TextDocument.fileName)
	 *
	 * @sample A language filter that applies to typescript files on disk: `{ language: 'typescript', scheme: 'file' }`
	 * @sample A language filter that applies to all package.json paths: `{ language: 'json', pattern: '**\project.json' }`
	 */
	export interface DocumentFilter {

		/**
		 * A language id, like `typescript`.
		 */
		language?: string;

		/**
		 * A Uri [scheme](#Uri.scheme), like `file` or `untitled`.
		 */
		scheme?: string;

		/**
		 * A glob pattern, like `*.{ts,js}`.
		 */
		pattern?: string;
	}

	/**
	 * A language selector is the combination of one or many language identifiers
	 * and [language filters](#LanguageFilter).
	 *
	 * @sample `let sel:DocumentSelector = 'typescript'`;
	 * @sample `let sel:DocumentSelector = ['typescript', { language: 'json', pattern: '**\tsconfig.json' }]`;
	 */
	export type DocumentSelector = string | DocumentFilter | (string | DocumentFilter)[];

	/**
	 * Contains additional diagnostic information about the context in which
	 * a [code action](#CodeActionProvider.provideCodeActions) is run.
	 */
	export interface CodeActionContext {

		/**
		 * An array of diagnostics.
		 */
		diagnostics: Diagnostic[];
	}

	/**
	 * The code action interface defines the contract between extensions and
	 * the [light bulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action) feature.
	 *
	 * A code action can be any command that is [known](#commands.getCommands) to the system.
	 */
	export interface CodeActionProvider {

		/**
		 * Provide commands for the given document and range.
		 *
		 * @param document The document in which the command was invoked.
		 * @param range The range for which the command was invoked.
		 * @param context
		 * @return An array of commands or a thenable of such. The lack of a result can be
		 * signaled by returing `undefined`, `null`, or an empty array.
		 */
		provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken): Command[] | Thenable<Command[]>;
	}

	/**
	 * A code lens represents a [command](#Command) that should be shown along with
	 * source text, like the number of references, a way to run tests, etc.
	 *
	 * A code lens is _unresolved_ when no command is associated to it. For performance
	 * reasons the creation of a code lens and resolving should be done to two stages.
	 * @see [[#CodeLensProvider.provideCodeLenses]]
	 * @see [[#CodeLensProvider.resolveCodeLens]]
	 */
	export class CodeLens {

		/**
		 * The range in which this code lens is valid. Should only span a single line.
		 */
		range: Range;

		/**
		 * The command this code lens represents.
		 */
		command: Command;

		/**
		 * `true` when there is a command associated.
		 */
		isResolved: boolean;

		/**
		 * Creates a new code lens object.
		 *
		 * @param range The range to which this code lens applies.
		 * @param command The command associated to this code lens.
		 */
		constructor(range: Range, command?: Command);
	}

	/**
	 * A code lens provider adds [commands](#Command) to source text. The commands will be shown
	 * as dedicated horizontal lines in between the source text.
	 */
	export interface CodeLensProvider {

		/**
		 * Compute a list of [lenses](#CodeLens). This call should return as fast as possible and if
		 * computing the command is expensive implementors should only return CodeLens-objects with the
		 * range set and implement [resolve](#CodeLensProvider.resolveCodeLens).
		 */
		provideCodeLenses(document: TextDocument, token: CancellationToken): CodeLens[] | Thenable<CodeLens[]>;

		/**
		 * This function will be called for each visible code lens, usually when scrolling and after
		 * calls to [compute](#CodeLensProvider.provideCodeLenses)-lenses.
		 */
		resolveCodeLens?(codeLens: CodeLens, token: CancellationToken): CodeLens | Thenable<CodeLens>;
	}

	/**
	 * The definition of a symbol represented as one or many [locations](#Location).
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
		 * @return An definition or a thenable that resolves to such. The lack of a result can be
		 * signaled by returing `undefined` or `null`.
		 */
		provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Definition | Thenable<Definition>;
	}

	/**
	 * FormattedString can be used to render text with a tiny subset of markdown. FormattedString
	 * is either a string that supports **bold** and __italic__ or a code-block that
	 * provides a language and a code Snippet.
	 */
	export type MarkedString = string | { language: string; value: string };

	/**
	 * A hover represents additional information for a symbol or word. Hovers are
	 * rendered in a tooltip-like widget.
	 */
	export class Hover {

		/**
		 * The contents of this hover.
		 */
		contents: MarkedString[];

		/**
		 * The range to which this hover appiles. When missing, the
		 * editor will use the range at the current position or the
		 * current position.
		 */
		range: Range;

		/**
		 * Creates a new hover object.
		 *
		 * @param contents The contents of the hover.
		 * @param range The range to which the hover appiles.
		 */
		constructor(contents: MarkedString | MarkedString[], range?: Range);
	}

	/**
	 * The hover provider interface defines the contract between extensions and
	 * the [hover](https://code.visualstudio.com/docs/editor/editingevolved#_hover)-feature.
	 */
	export interface HoverProvider {

		/**
		 * Provide a hover for the given position and document. Multiple hovers at the same
		 * position will be merged by the editor. A hover can have a range to which defaults
		 * to the word range at the position.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @return A hover or a thenable that resolves to such. The lack of a result can be
		 * signaled by returing `undefined` or `null`.
		 */
		provideHover(document: TextDocument, position: Position, token: CancellationToken): Hover | Thenable<Hover>;
	}

	/**
	 * A document highlight kind.
	 */
	export enum DocumentHighlightKind {

		/**
		 * A textual occurrance.
		 */
		Text,

		/**
		 * Read-access of a symbol, like reading a variable.
		 */
		Read,

		/**
		 * Write-access of a symbol, like writing to a variable.
		 */
		Write
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
		 * The highlight kind, default is [text](#DocumentHighlightKind.Text).
		 */
		kind: DocumentHighlightKind;

		/**
		 * Creates a new document highlight object.
		 *
		 * @param range The range the highlight applies to.
		 * @param kind The highlight kind, default is [text](#DocumentHighlightKind.Text).
		 */
		constructor(range: Range, kind?: DocumentHighlightKind);
	}

	/**
	 * The document highlight provider interface defines the contract between extensions and
	 * the word-highlight-feature.
	 */
	export interface DocumentHighlightProvider {

		/**
		 * Provide a set of document highligts, like all occurrences of a variable or
		 * all exit-points of a function.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @return An array of document highlights or a thenable that resolves to such. The lack of a result can be
		 * signaled by returing `undefined`, `null`, or an empty array.
		 */
		provideDocumentHighlights(document: TextDocument, position: Position, token: CancellationToken): DocumentHighlight[] | Thenable<DocumentHighlight[]>;
	}

	/**
	 * A symbol kind.
	 */
	export enum SymbolKind {
		File,
		Module,
		Namespace,
		Package,
		Class,
		Method,
		Property,
		Field,
		Constructor,
		Enum,
		Interface,
		Function,
		Variable,
		Constant,
		String,
		Number,
		Boolean,
		Array
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
		 * The location of this symbol.
		 */
		location: Location;

		/**
		 * Creates a new symbol information object.
		 *
		 * @param name The name of the symbol.
		 * @param kind The kind of the symbol.
		 * @param range The range of the location of the symbol.
		 * @param uri The resource of the location of symbol, defaults to the current document.
		 * @param containerName The name of the symbol containg the symbol.
		 */
		constructor(name: string, kind: SymbolKind, range: Range, uri?: Uri, containerName?: string);
	}

	/**
	 * The document symbol provider interface defines the contract between extensions and
	 * the [go to symbol](https://code.visualstudio.com/docs/editor/editingevolved#_goto-symbol)-feature.
	 */
	export interface DocumentSymbolProvider {

		/**
		 * Provide symbol information for the given document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param token A cancellation token.
		 * @return An array of document highlights or a thenable that resolves to such. The lack of a result can be
		 * signaled by returing `undefined`, `null`, or an empty array.
		 */
		provideDocumentSymbols(document: TextDocument, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]>;
	}

	/**
	 * The workspace symbol provider interface defines the contract between extensions and
	 * the [symbol search](https://code.visualstudio.com/docs/editor/editingevolved#_open-symbol-by-name)-feature.
	 */
	export interface WorkspaceSymbolProvider {

		/**
		 * Project-wide search for a symbol matching the given query string. It is up to the provider
		 * how to search given the query string, like substring, indexOf etc.
		 *
		 * @param query A non-empty query string.
		 * @param token A cancellation token.
		 * @return An array of document highlights or a thenable that resolves to such. The lack of a result can be
		 * signaled by returing `undefined`, `null`, or an empty array.
		 */
		provideWorkspaceSymbols(query: string, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]>;
	}

	/**
	 * Value-object that contains additional information when
	 * requesting references.
	 */
	export interface ReferenceContext {

		/**
		 * Include the declaration of the current symbol.
		 */
		includeDeclaration: boolean;
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
		 * @param context
		 * @param token A cancellation token.
		 * @return An array of locations or a thenable that resolves to such. The lack of a result can be
		 * signaled by returing `undefined`, `null`, or an empty array.
		 */
		provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): Location[] | Thenable<Location[]>;
	}

	/**
	 *
	 */
	export class TextEdit {
		static replace(range: Range, newText: string): TextEdit;
		static insert(position: Position, newText: string): TextEdit;
		static delete(range: Range): TextEdit;
		constructor(range: Range, newText: string);
		range: Range;
		newText: string;
	}

	/**
	 * A workspace edit represents textual changes for many documents.
	 */
	export class WorkspaceEdit {

		/**
		 * The number of affected resources.
		 *
		 * @readonly
		 */
		size: number;

		/**
		 * Replace the given range with given text for the given resource.
		 *
		 * @param uri A resource identifier.
		 * @param range A range.
		 * @param newText A string.
		 */
		replace(uri: Uri, range: Range, newText: string): void;

		/**
		 * Insert the given text at the given position.
		 *
		 * @param uri A resource identifier.
		 * @param position A position.
		 * @param newText A string.
		 */
		insert(uri: Uri, position: Position, newText: string): void;

		/**
		 * Delete the text at the give range.
		 */
		delete(uri: Uri, range: Range): void;

		/**
		 * Check if this edit affects the given resource.
		 * @param uri A resource identifier.
		 * @return `true` if the given resource will be touched by this edit
		 */
		has(uri: Uri): boolean;

		/**
		 * Set (and replace) text edits for a resource.
		 *
		 * @param uri A resource identifier.
		 * @param edits An array of text edits.
		 */
		set(uri: Uri, edits: TextEdit[]): void;

		/**
		 * Get the text edits for a resource.
		 *
		 * @param uri A resource identifier.
		 * @return An array of text edits.
		 */
		get(uri: Uri): TextEdit[];

		/**
		 * Get all text edits grouped by resource.
		 *
		 * @return An array of `[Uri, TextEdit[]]`-tuples.
		 */
		entries(): [Uri, TextEdit[]][];
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
		 * @return A workspace edit or a thenable that resolves to such. The lack of a result can be
		 * signaled by returing `undefined` or `null`.
		 */
		provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): WorkspaceEdit | Thenable<WorkspaceEdit>;
	}

	/**
	 * Value-object describing what options formatting should use.
	 */
	export interface FormattingOptions {
		tabSize: number;
		insertSpaces: boolean;
		[key: string]: boolean | number | string;	// <<< non-obvious >>>
	}

	/**
	 *
	 */
	export interface DocumentFormattingEditProvider {
		provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions, token: CancellationToken): TextEdit[] | Thenable<TextEdit[]>;
	}

	/**
	 *
	 */
	export interface DocumentRangeFormattingEditProvider {
		provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions, token: CancellationToken): TextEdit[] | Thenable<TextEdit[]>;
	}

	/**
	 *
	 */
	export interface OnTypeFormattingEditProvider {
		provideOnTypeFormattingEdits(document: TextDocument, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): TextEdit[] | Thenable<TextEdit[]>;
	}

	export class ParameterInformation {
		label: string;
		documentation: string;		// <<< non-obvious: what is the supported format? >>>
		constructor(label: string, documentation?: string);
	}

	export class SignatureInformation {
		label: string;
		documentation: string;		// <<< non-obvious: what is the supported format? >>>
		parameters: ParameterInformation[];
		constructor(label: string, documentation?: string);
	}

	export class SignatureHelp {
		signatures: SignatureInformation[];
		activeSignature: number;
		activeParameter: number;
	}

	export interface SignatureHelpProvider {
		provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): SignatureHelp | Thenable<SignatureHelp>;
	}

	export enum CompletionItemKind {
		Text,
		Method,
		Function,
		Constructor,
		Field,
		Variable,
		Class,
		Interface,
		Module,
		Property,
		Unit,
		Value,
		Enum,
		Keyword,
		Snippet,
		Color,
		File,
		Reference
	}

	/**
	 * A completion item represents a text snippet that is
	 * proposed to complete text that is being typed.
	 */
	export class CompletionItem {

		/**
		 * The label of this completion item. By default
		 * also the text that is inserted when selecting
		 * this completion.
		 */
		label: string;

		/**
		 * The kind of this completion item. Based of the kind
		 * an icon is chosen by the editor.
		 */
		kind: CompletionItemKind;

		/**
		 * A human-readable string with additional information
		 * about this item, like type or symbol information.
		 */
		detail: string;

		/**
		 * A human-readable string that represents a doc-comment.
		 */
		documentation: string;

		/**
		 * A string that shoud be used when comparing this item
		 * with other items. When `falsy` the [label](#CompletionItem.label)
		 * is used.
		 */
		sortText: string;

		/**
		 * A string that should be used when filtering a set of
		 * completion items. When `falsy` the [label](#CompletionItem.label)
		 * is used.
		 */
		filterText: string;

		/**
		 * A string that should be inserted a document when selecting
		 * this completion. When `falsy` the [label](#CompletionItem.label)
		 * is used.
		 */
		insertText: string;

		/**
		 * An [edit](#TextEdit) which is applied to a document when selecting
		 * this completion. When an edit is provided the value of
		 * [insertText](#CompletionItem.insertText) is ignored.
		 */
		textEdit: TextEdit;

		/**
		 * Creates a new completion item.
		 *
		 * Completion items must have at least a [label](#CompletionItem.label) which then
		 * will be used as insert text as well as for sorting and filtering.
		 *
		 * @param label The label of the completion.
		 */
		constructor(label: string);
	}

	/**
	 * The completion item provider interface defines the contract between extensions and
	 * the [IntelliSense](https://code.visualstudio.com/docs/editor/editingevolved#_intellisense).
	 */
	export interface CompletionItemProvider {

		/**
		 * 
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @return An array of completions or a thenable that resolves to such. The lack of a result can be
		 * signaled by returing `undefined`, `null`, an empty array.
		 */
		provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): CompletionItem[] | Thenable<CompletionItem[]>;

		/**
		 *
		 */
		resolveCompletionItem?(item: CompletionItem, token: CancellationToken): CompletionItem | Thenable<CompletionItem>;
	}

	export type CharacterPair = [string, string];

	export interface CommentRule {
		lineComment?: string;
		blockComment?: CharacterPair;	// <<< non-obvious: is this the start/end characters of the comment?
	}

	export interface IndentationRule {
		decreaseIndentPattern: RegExp;
		increaseIndentPattern: RegExp;
		indentNextLinePattern?: RegExp;
		unIndentedLinePattern?: RegExp;
	}

	// <<< this is not an 'action' but an 'indent type'
	export enum IndentAction {
		None,
		Indent,
		IndentOutdent,
		Outdent
	}

	export interface EnterAction {
		indentAction: IndentAction;		// <<< confusing: another reason not to use the name 'IndentAction' >>>
		appendText?: string;
		removeText?: number;		// <<< non-obvious: the number of characters to remove? >>>
	}

	export interface OnEnterRule {
		beforeText: RegExp;
		afterText?: RegExp;
		action: EnterAction;
	}

	export interface LanguageConfiguration {
		comments?: CommentRule;
		brackets?: CharacterPair[];
		wordPattern?: RegExp;
		indentationRules?: IndentationRule;
		onEnterRules?: OnEnterRule[];

		/**
		 * **Deprecated**.
		 * @deprecated
		 */
		__electricCharacterSupport?: {
			brackets: {
				tokenType: string;
				open: string;
				close: string;
				isElectric: boolean;
			}[];
			docComment?: {
				scope: string; // What tokens should be used to detect a doc comment (e.g. 'comment.documentation').
				open: string; // The string that starts a doc comment (e.g. '/**')
				lineStart: string; // The string that appears at the start of each line, except the first and last (e.g. ' * ').
				close?: string; // The string that appears on the last line and closes the doc comment (e.g. ' */').
			};
		};

		/**
		 * **Deprecated**.
		 * @deprecated
		 */
		__characterPairSupport?: {
			autoClosingPairs: {
				open: string;
				close: string;
				notIn?: string[];
			}[];
		};
	}

	/**
	 * Represents the workspace configuration. The workspace configuration
	 * is always a merged view of the configuration of the current [workspace](#workspace.rootPath)
	 * and the installation-wide configuration.
	 */
	export interface WorkspaceConfiguration {

		/**
		 * Return a value from this configuration.
		 *
		 * @param section Configuration name, supports _dotted_ names.
		 * @return The value `section` denotes or the default.
		 */
		get<T>(section: string, defaultValue?: T): T;

		/**
		 * Check if this configuration has a certain value.
		 *
		 * @param section configuration name, supports _dotted_ names
		 * @return `true` iff the section doesn't resolve to `undefined`
		 */
		has(section: string): boolean;

		/**
		 * Readable dictionary that backs this configuration.
		 * @readonly
		 */
		[key: string]: any;
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
		 * The document range of this locations.
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
	 * Represents the severity of diagnostics.
	 */
	export enum DiagnosticSeverity {

		/**
		 * Something not allowed by the rules of a languages or other means.
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
		 * Something to hint to a better way of doing something, like proposing
		 * a refactoring.
		 */
		Hint = 3
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
		 * The severity, default is [error](#DiagnosticSeverity.Error).
		 */
		severity: DiagnosticSeverity;

		/**
		 * A code or identifier for this diagnostics. Will not surfaced
		 * to the user, but should be used for later processing, e.g when
		 * providing [code actions](#CodeActionContext).
		 */
		code: string | number;

		/**
		 * Creates a new diagnostic object
		 *
		 * @param range The range to which this diagnostic applies.
		 * @param message The human-readable message.
		 * @param severity The severity, default is [error](#DiagnosticSeverity.Error)
		 */
		constructor(range: Range, message: string, severity?: DiagnosticSeverity);
	}

	/**
	 * A diagnostics collection is a container that manages a set of
	 * [diagnostics](#Diagnostic). Diagnostics are always scopes to a
	 * a diagnostics collection and a resource.
	 *
	 * To get an instance of a `DiagnosticCollection` use
	 * [createDiagnosticCollection](#languages.createDiagnosticCollection).
	 */
	export interface DiagnosticCollection {

		/**
		 * The name of this diagnostic collection, for instance `typescript`. Every diagnostic
		 * from this collection will be associated with this name. Also, the task framework uses this
		 * name when defining [problem matchers](https://code.visualstudio.com/docs/editor/tasks#_defining-a-problem-matcher).
		 */
		name: string;

		/**
		 * Assign diagnostics for given resource. Will replace
		 * existing diagnostics for that resource.
		 *
		 * @param uri A resource identifier.
		 * @param diagnostics Array of diagnostics or `undefined`
		 */
		set(uri: Uri, diagnostics: Diagnostic[]): void;

		/**
		 * Remove all diagnostics from this collection that belong
		 * to the provided `uri`. The same as `#set(uri, undefined)`.
		 *
		 * @param uri A resource identifier.
		 */
		delete(uri: Uri): void;

		/**
		 * Replace all entries in this collection
		 *
		 * @param entries An array of tuples, like [[file1, [d1, d2]], [file2, [d3, d4, d5]]], or `undefined`
		 */
		set(entries: [Uri, Diagnostic[]][]): void;

		/**
		 * Remove all diagnostics from this collection. The same
		 * as calling `#set(undefined)`;
		 */
		clear(): void;

		/**
		 * Dispose and free associated resources. Calls
		 * [clear](#DiagnosticCollection.clear).
		 */
		dispose(): void;
	}

	/**
	 * Denotes a column in the VS Code window. Columns used to show editors
	 * side by side.
	 */
	export enum ViewColumn {
		One = 1,
		Two = 2,
		Three = 3
	}

	/**
	 * An output channel is a container for readonly textual information.
	 *
	 * To get an instance of an `OutputChannel` use
	 * [createOutputChannel](#window.createOutputChannel).
	 */
	export interface OutputChannel {

		/**
		 * The human-readable name of this output channel.
		 * @readonly
		 */
		name: string;

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
		 * Removes all output from the channel.
		 */
		clear(): void;

		/**
		 * Reveal this channel in the UI.
		 *
		 * @param column The column in which to show the channel, default in [one](#ViewColumn.One).
		 */
		show(column?: ViewColumn): void;

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
	 * Represents the alignment of status bar items.
	 */
	export enum StatusBarAlignment {

		/**
		 * Aligned to the left side.
		 */
		Left,

		/**
		 * Aligned to the right side.
		 */
		Right
	}

	/**
	 * A status bar item is a status bar contribution that can
	 * show text and icons and run a command on click.
	 */
	export interface StatusBarItem {

		/**
		 * The alignment of this item.
		 *
		 * @readonly
		 */
		alignment: StatusBarAlignment;

		/**
		 * The priority of this item. Higher value means the item should
		 * be shown more to the left.
		 *
		 * @readonly
		 */
		priority: number;

		/**
		 * The text to show for the entry. You can embed icons in the text by leveraging the syntax:
		 *
		 * `My text $(icon name) contains icons like $(icon name) this one.`
		 *
		 * Where the icon name is taken from the (octicon)[https://octicons.github.com/] icon set, e.g.
		 * light-bulb, thumbsup, zap etc.
		 */
		text: string;

		/**
		 * The tooltip text when you hover over this entry.
		 */
		tooltip: string;

		/**
		 * The foreground color for this entry.
		 */
		color: string;

		/**
		 * The identifier of a command to run on click. The command must be
		 * [known](#commands.getCommands).
		 */
		command: string;

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
		 * [hide](#StatusBarItem.hide).
		 */
		dispose(): void;
	}

	/**
	 * Represents an extension.
	 *
	 * To get an instance of an `Extension` use [getExtension](#extensions.getExtension).
	 */
	export interface Extension<T> {

		/**
		 * The canonical extension identifier in the form of: `publisher.name`.
		 */
		id: string;

		/**
		 * The absolute file path of the directory containing this extension.
		 */
		extensionPath: string;

		/**
		 * Returns if the extension has been activated.
		 */
		isActive: boolean;

		/**
		 * The parsed contents of the extension's package.json.
		 */
		packageJSON: any;

		/**
		 * The public API exported by this extension. It is an invalid action
		 * to access this field before this extension has been activated.
		 */
		exports: T;

		/**
		 * Activates this extension and returns its public API.
		 *
		 * @return A promise that resolve when this extension has been activated.
		 */
		activate(): Thenable<T>;
	}

	/**
	 * An extension context is a collection utilities private to an
	 * extensions.
	 *
	 * An instance of an `ExtensionContext` is provided as first
	 * parameter to the `activate`-call of an extension.
	 */
	export interface ExtensionContext {

		/**
		 * An array to which disposables can be added. When this
		 * extension is deactivated the disposables will be disposed.
		 */
		subscriptions: { dispose(): any }[];

		/**
		 * A memento object that stores state in the context
		 * of the currently opened [workspace](#workspace.path).
		 */
		workspaceState: Memento;

		/**
		 * A memento object that stores state independent
		 * of the current opened [workspace](#workspace.path)
		 */
		globalState: Memento;

		/**
		 * The absolute file path of the directory containing the extension.
		 */
		extensionPath: string;

		/**
		 * Get the absolute path of a resource contained in the extension.
		 *
		 * @param relativePath A relative path to a resource contained in the extension.
		 * @return The absolute path of the resource.
		 */
		asAbsolutePath(relativePath: string): string;
	}

	/**
	 * A memento represents a storage utility. It can store and retrieve
	 * values.
	 */
	export interface Memento {

		/**
		 * Return value
		 * @return The store value or undefined or the defaultValue
		 */
		get<T>(key: string, defaultValue?: T): T;

		/**
		 * Store a value. The value must be JSON-stringfyable.
		 */
		update(key: string, value: any): Thenable<void>;
	}

	/**
	 * Namespace for commanding
	 */
	export namespace commands {

		/**
		 * Registers a command that can be invoked via a keyboard shortcut,
		 * an menu item, an action, or directly.
		 *
		 * Registering a command with an existing command identifier twice
		 * will cause an error.
		 *
		 * @param command A unique identifier for the command.
		 * @param callback A command handler function.
		 * @param thisArgs The `this` context used when invoking handler function.
		 * @return Disposable which unregisters this command on disposal.
		 */
		export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable;

		/**
		 * Registers a text editor command that can be invoked via a keyboard shortcut,
		 * an menu item, an action, or directly.
		 *
		 * Text editor commands are different from ordinary [commands](#commands.registerCommand) as
		 * they only execute when there was an active editor when the command was called. Also, the
		 * command handler of an editor command has access to the active editor and to an
		 * [edit](#TextEditorEdit)-builder.
		 *
		 * @param command A unique identifier for the command.
		 * @param callback A command handler function with access to an [editor](#TextEditor) and an [edit](#TextEditorEdit).
		 * @param thisArgs The `this` context used when invoking handler function.
		 * @return Disposable which unregisters this command on disposal.
		 */
		export function registerTextEditorCommand(command: string, callback: (textEditor: TextEditor, edit: TextEditorEdit) => void, thisArg?: any): Disposable;

		/**
		 * Executes the command denoted by the given command identifier.
		 *
		 * When executing an editor command not all types are allowed to
		 * be passed as arguments. Allows are the primitive types `string`, `boolean`,
		 * `number`, `undefined`, and `null`, as well as classes defined in this API.
		 * There are no restriction when executing commands that have been contributed
		 * by extensions.
		 *
		 * @param command Identifier of the command to execute.
		 * @param ...rest Parameter passed to the command function.
		 * @return
		 */
		export function executeCommand<T>(command: string, ...rest: any[]): Thenable<T>;

		/**
		 * Retrieve the list of all available commands.
		 *
		 * @return Thenable that resolves to a list of command ids.
		 */
		export function getCommands(): Thenable<string[]>;
	}

	/**
	 * The window namespace contains all functions to interact with
	 * the visual window of VS Code.
	 */
	export namespace window {

		/**
		 * The currently active editor or undefined. The active editor is the one
		 * that currenty has focus or, when none has focus, the one that has changed
		 * input most recently.
		 */
		export let activeTextEditor: TextEditor;

		/**
		 * The currently visible editors or empty array.
		 */
		export let visibleTextEditors: TextEditor[];

		/**
		 * An [event](#Event) which fires when the [active](#window.activeTextEditor)
		 * has changed.
		 */
		export const onDidChangeActiveTextEditor: Event<TextEditor>;

		/**
		 *  An [event](#Event) which fires when the selection in an editor has changed.
		 */
		export const onDidChangeTextEditorSelection: Event<TextEditorSelectionChangeEvent>;

		/**
		 * An [event](#Event) which fires when the options of an editor have changed.
		 */
		export const onDidChangeTextEditorOptions: Event<TextEditorOptionsChangeEvent>;

		/**
		 * Show the given document in a text editor. A [column](#ViewColumn) can be provided
		 * to control where the editor is being shown. Might change the [active editor](#window.activeTextEditor).
		 *
		 * @param document A text document to be shown.
		 * @param column A view column in which the editor should be shown. The default is the [one](#ViewColumn.One), other values
		 * are adjusted to be __Min(column, columnCount + 1)__.
		 * @return A promise that resolves to an [editor](#TextEditor).
		 */
		export function showTextDocument(document: TextDocument, column?: ViewColumn): Thenable<TextEditor>;

		/**
		 * Create a TextEditorDecorationType that can be used to add decorations to text editors.
		 *
		 * @param options Rendering options for the decoration type.
		 * @return A new decoration type instance.
		 */
		export function createTextEditorDecorationType(options: DecorationRenderOptions): TextEditorDecorationType;

		/**
		 * Show an information message to users. Optionally provide an array of items which will be presented as
		 * clickable buttons.
		 *
		 * @return a Promise that resolves when the message has been disposed. Returns the user-selected item if applicable.
		 */
		export function showInformationMessage(message: string, ...items: string[]): Thenable<string>;

		/**
		 * @see [showInformationMessage](#window.showInformationMessage)
		 */
		export function showInformationMessage<T extends MessageItem>(message: string, ...items: T[]): Thenable<T>;

		/**
		 * @see [showInformationMessage](#window.showInformationMessage)
		 */
		export function showWarningMessage(message: string, ...items: string[]): Thenable<string>;

		/**
		 * @see [showInformationMessage](#window.showInformationMessage)
		 */
		export function showWarningMessage<T extends MessageItem>(message: string, ...items: T[]): Thenable<T>;

		/**
		 * @see [showInformationMessage](#window.showInformationMessage)
		 */
		export function showErrorMessage(message: string, ...items: string[]): Thenable<string>;

		/**
		 * @see [showInformationMessage](#window.showInformationMessage)
		 */
		export function showErrorMessage<T extends MessageItem>(message: string, ...items: T[]): Thenable<T>;

		/**
		 * Shows a selection list.
		 *
		 * @param items An array of strings, or a promise that resolves to an array of strings.
		 * @param options Configures the behavior of the selection list.
		 * @return A promise that resolves to the selection or undefined.
		 */
		export function showQuickPick(items: string[] | Thenable<string[]>, options?: QuickPickOptions): Thenable<string>;

		/**
		 * Shows a selection list.
		 *
		 * @param items An array of items, or a promise that resolves to an array of items.
		 * @param options Configures the behavior of the selection list.
		 * @return A promise that resolves to the selected item or undefined.
		 */
		export function showQuickPick<T extends QuickPickItem>(items: T[] | Thenable<T[]>, options?: QuickPickOptions): Thenable<T>;

		/**
		 * Opens an input box to ask the user for input.
		 *
		 * The returned value will be undefined if the input box was canceled (e.g. pressing ESC) and otherwise will
		 * have the user typed string or an empty string if the user did not type anything but dismissed the input
		 * box with OK.
		 *
		 * @param options Configures the behavior of the input box.
		 * @return A promise that resolves to a string the user provided or to `undefined` in case of dismissal.
		 */
		export function showInputBox(options?: InputBoxOptions): Thenable<string>;

		/**
		 * Create a new [output channel](#OutputChannel) with the given name.
		 *
		 * @param name Human-readable string which we will used to represent the channel in the UI.
		 */
		export function createOutputChannel(name: string): OutputChannel;

		/**
		 * Set a message to the status bar. This is a short hand for the more powerfull
		 * status bar [items](#window.createStatusBarItem).
		 *
		 * @param text The message to show, support icons subtitution as in status bar [items](#StatusBarItem.text).
		 * @return A disposable which hides the status bar message.
		 */
		export function setStatusBarMessage(text: string): Disposable;

		/**
		 * @see [window.setStatusBarMessage](#window.setStatusBarMessage)
		 *
		 * @param hideAfterTimeout Timeout in milliseconds after which the message will be disposed.
		 * @return A disposable which hides the status bar message.
		 */
		export function setStatusBarMessage(text: string, hideAfterTimeout: number): Disposable;

		/**
		 * @see [window.setStatusBarMessage](#window.setStatusBarMessage)
		 *
		 * @param hideWhenDone Thenable on which completion (resolve or reject) the message will be disposed.
		 * @return A disposable which hides the status bar message.
		 */
		export function setStatusBarMessage(text: string, hideWhenDone: Thenable<any>): Disposable;

		/**
		 * Creates a status bar [item](#StatusBarItem).
		 *
		 * @param position The alignment of the item.
		 * @param priority The priority of the item. Higher values mean the item should be shown more to the left.
		 * @return A new status bar item.
		 */
		export function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;
	}

	/**
	 * An event describing an individual change in the text of a [document](#TextDocument).
	 */
	export interface TextDocumentContentChangeEvent {
		/**
		 * The range that got replaced.
		 */
		range: Range;
		/**
		 * The length of the range that got replaced.
		 */
		rangeLength: number;
		/**
		 * The new text for the range.
		 */
		text: string;
	}

	/**
	 * An event describing a transactional [document](#TextDocument) change.
	 */
	export interface TextDocumentChangeEvent {

		/**
		 * The affected document.
		 */
		document: TextDocument;

		/**
		 * An array of content changes.
		 */
		contentChanges: TextDocumentContentChangeEvent[];
	}

	/**
	 * The workspace namespace contains functions that operate on the currently opened
	 * folder.
	 */
	export namespace workspace {

		/**
		 * Creates a file system watcher.
		 *
		 * A glob pattern that filters the file events must be provided. Optionally, flags to ignore certain
		 * kind of events can be provided. To stop listening to events the watcher must be disposed.
		 *
		 * @param globPattern  A glob pattern that is applied to the names of created, changed, and deleted files.
		 * @param ignoreCreateEvents Ignore when files have been created.
		 * @param ignoreChangeEvents Ignore when files have been changed.
		 * @param ignoreDeleteEvents Ignore when files have been deleted.
		 * @return A new file system watcher instance.
		 */
		export function createFileSystemWatcher(globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): FileSystemWatcher;

		/**
		 * The folder that is open in VS Code. `undefined` when no folder
		 * has been opened.
		 */
		export let rootPath: string;

		/**
		 * Returns a path that is relative to the workspace root.
		 *
		 * When there is no [workspace root](#workspace.rootPath) or when the path
		 * is not a child of that folder, the input is returned.
		 *
		 * @param pathOrUri A path or uri. When a uri is given its [fsPath](#Uri.fsPath) is used.
		 * @return A path relative to the root or the input.
		 */
		export function asRelativePath(pathOrUri: string | Uri): string;

		/**
		 * Find files in the workspace.
		 *
		 * @sample findFiles('**\*.js', '**\node_modules\**', 10)
		 * @param include A glob pattern that defines the files to search for.
		 * @param exclude A glob pattern that defined files and folders to exclude.
		 * @param maxResults An upper-bound for the result.
		 * @return A thenable that resolves to an array of resource identifiers.
		 */
		export function findFiles(include: string, exclude: string, maxResults?: number): Thenable<Uri[]>;

		/**
		 * Save all dirty files
		 */
		export function saveAll(includeUntitled?: boolean): Thenable<boolean>;

		/**
		 * Make changes to one or many resources as defined by the given
		 * [workspace edit](#WorkspaceEdit).
		 *
		 * When applying a workspace edit, the editor implements a 'all-or-nothing'-strategy,
		 * that means failure to load one document or make changes to one document will make
		 * the edit be rejected.
		 *
		 * @param edit A workspace edit.
		 * @return A thenable that resolves when the edit could be applied.
		 */
		export function applyEdit(edit: WorkspaceEdit): Thenable<boolean>;

		/**
		 * All text documents currently known to the system.
		 *
		 * @readonly
		 */
		export let textDocuments: TextDocument[];

		/**
		 * Opens the denoted document from disk. Will return early if the
		 * document is already open, otherwise the document is loaded and the
		 * [open document](#workspace.onDidOpenTextDocument)-event fires.
		 *
		 * The document to open is denoted by the [uri](#Uri). Two schemes are supported:
		 * | Scheme | Description
		 * | :----- | :----
		 * | file | A file on disk, will be rejected if the file does not exist or cannot be loaded, e.g. 'file:///Users/frodo/r.ini'.
		 * | untitled | A new file that should be saved on disk, e.g. 'untitled:/Users/frodo/new.js'. The language will be derived from the file name.
		 *
		 * Uris with other schemes will make this method returned a rejected promise.
		 *
		 * @param uri Identifies the resource to open.
		 * @return A promise that resolves to a [document](#TextDocument).
		 */
		export function openTextDocument(uri: Uri): Thenable<TextDocument>;

		/**
		 * A short-hand for `openTextDocument(Uri.file(fileName))`.
		 *
		 * @see [openTextDocument](#openTextDocument)
		 * @param fileName A name of a file on disk
		 * @return A promise that resolves to a [document](#TextDocument)
		 */
		export function openTextDocument(fileName: string): Thenable<TextDocument>;

		/**
		 * An event that is emitted when a [text document](#TextDocument) is opened.
		 */
		export const onDidOpenTextDocument: Event<TextDocument>;

		/**
		 * An event that is emitted when a [text document](#TextDocument) is disposed.
		 */
		export const onDidCloseTextDocument: Event<TextDocument>;

		/**
		 * An event that is emitted when a [text document](#TextDocument) is changed.
		 */
		export const onDidChangeTextDocument: Event<TextDocumentChangeEvent>;

		/**
		 * An event that is emitted when a [text document](#TextDocument) is saved to disk.
		 */
		export const onDidSaveTextDocument: Event<TextDocument>;

		/**
		 * Get a configuration object.
		 *
		 * When a section-identifier is provided only that part of the configuration
		 * is returned. Dots in the section-identifiers are interpreted as child-access,
		 * like `{ myExt: { setting: { doIt: true }}}` and `getConfiguration('myExt.setting.doIt') === true`.
		 *
		 *
		 * @param section A dot-separated identifier.
		 * @return The full workspace configuration or a subset.
		 */
		export function getConfiguration(section?: string): WorkspaceConfiguration;

		/**
		 * An event that is emitted when the [configuration](#WorkspaceConfiguration) changed.
		 */
		export const onDidChangeConfiguration: Event<void>;
	}

	/**
	 * The languages namespace contains function to participate in language service features,
	 * like IntelliSense or diagnostics.
	 */
	export namespace languages {

		/**
		 * Return the identifiers of all known languages.
		 * @return Promise resolving to an array of identifier strings.
		 */
		export function getLanguages(): Thenable<string[]>;

		/**
		 * Compute the match between a document [selector](#DocumentSelector) and a document. Values
		 * greater zero mean the selector matches the document.
		 *
		 * @param selector A document selector.
		 * @param document A text document.
		 * @return A number `>0` when the selector matches and `0` when the selector does not match.
		 */
		export function match(selector: DocumentSelector, document: TextDocument): number;

		/**
		 * Create a diagnostics collections.
		 *
		 * @param name The [name](#DiagnosticCollection.name) of the collection.
		 * @return A new diagnostic collection.
		 */
		export function createDiagnosticCollection(name?: string): DiagnosticCollection;

		/**
		 * Register a completion provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their [score](#languages.match) and groups of equal score are sequentially asked for
		 * completion items. The process stops when one or many providers of a group return a
		 * result.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A completion provider.
		 * @param triggerCharacters Trigger completion when the user types one of the characters, like `.` or `:`.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerCompletionItemProvider(selector: DocumentSelector, provider: CompletionItemProvider, ...triggerCharacters: string[]): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * param provider A code action provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerCodeActionsProvider(language: DocumentSelector, provider: CodeActionProvider): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A code lens provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerCodeLensProvider(language: DocumentSelector, provider: CodeLensProvider): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A definition provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerDefinitionProvider(selector: DocumentSelector, provider: DefinitionProvider): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A hover provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document highlight provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerDocumentHighlightProvider(selector: DocumentSelector, provider: DocumentHighlightProvider): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document symbol provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerDocumentSymbolProvider(selector: DocumentSelector, provider: DocumentSymbolProvider): Disposable;

		/**
		 *
		 * @param provider A workspace symbol provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerWorkspaceSymbolProvider(provider: WorkspaceSymbolProvider): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A reference provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerReferenceProvider(selector: DocumentSelector, provider: ReferenceProvider): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A rename provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerRenameProvider(selector: DocumentSelector, provider: RenameProvider): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document formatting edit provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerDocumentFormattingEditProvider(selector: DocumentSelector, provider: DocumentFormattingEditProvider): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document range formatting edit provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerDocumentRangeFormattingEditProvider(selector: DocumentSelector, provider: DocumentRangeFormattingEditProvider): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An on type formatting edit provider.
		 * @param firstTriggerCharacter A character on which formatting should be triggered, like `}`.
		 * param moreTriggerCharacter More trigger characters.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerOnTypeFormattingEditProvider(selector: DocumentSelector, provider: OnTypeFormattingEditProvider, firstTriggerCharacter: string, ...moreTriggerCharacter: string[]): Disposable;

		/**
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A signature help provider.
		 * @param triggerCharacters Trigger signature help when the user types one of the characters, like `,` or `(`.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerSignatureHelpProvider(selector: DocumentSelector, provider: SignatureHelpProvider, ...triggerCharacters: string[]): Disposable;

		/**
		 *
		 */
		export function setLanguageConfiguration(language: string, configuration: LanguageConfiguration): Disposable;
	}

	/**
	 * Namespace to retrieve installed extensions.
	 */
	export namespace extensions {

		/**
		 * Get an extension by id.
		 *
		 * @param extensionId An extension identifier in the form of: `publisher.name`.
		 * @return An extension or `undefined`.
		 */
		export function getExtension(extensionId: string): Extension<any>;

		/**
		 * @see [[extensions.getExtension]]
		 */
		export function getExtension<T>(extensionId: string): Extension<T>;

		/**
		 * All extensions currently known to the system.
		 */
		export let all: Extension<any>[];
	}
}

// TS 1.6 & node_module
export = vscode;

// when used for JS*
// declare module 'vscode' {
// 	export = vscode;
// }

/**
 * Thenable is a common denominator between ES6 promises, Q, jquery.Deferred, WinJS.Promise,
 * and others. This API makes no assumption about what promise libary is being used which
 * enables reusing existing code without migrating to a specific promise implementation. Still,
 * we recommand the use of native promises which are available in VS Code.
 */
interface Thenable<R> {
	/**
	* Attaches callbacks for the resolution and/or rejection of the Promise.
	* @param onfulfilled The callback to execute when the Promise is resolved.
	* @param onrejected The callback to execute when the Promise is rejected.
	* @returns A Promise for the completion of which ever callback is executed.
	*/
	then<TResult>(onfulfilled?: (value: R) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Thenable<TResult>;
	then<TResult>(onfulfilled?: (value: R) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Thenable<TResult>;
}

// ---- ES6 promise ------------------------------------------------------

/**
 * Represents the completion of an asynchronous operation
 */
interface Promise<T> extends Thenable<T> {
	/**
	* Attaches callbacks for the resolution and/or rejection of the Promise.
	* @param onfulfilled The callback to execute when the Promise is resolved.
	* @param onrejected The callback to execute when the Promise is rejected.
	* @returns A Promise for the completion of which ever callback is executed.
	*/
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Promise<TResult>;
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Promise<TResult>;

	/**
	 * Attaches a callback for only the rejection of the Promise.
	 * @param onrejected The callback to execute when the Promise is rejected.
	 * @returns A Promise for the completion of the callback.
	 */
	catch(onrejected?: (reason: any) => T | Thenable<T>): Promise<T>;

	// [Symbol.toStringTag]: string;
}

interface PromiseConstructor {
	// /**
	//   * A reference to the prototype.
	//   */
	// prototype: Promise<any>;

	/**
	 * Creates a new Promise.
	 * @param executor A callback used to initialize the promise. This callback is passed two arguments:
	 * a resolve callback used resolve the promise with a value or the result of another promise,
	 * and a reject callback used to reject the promise with a provided reason or error.
	 */
	new <T>(executor: (resolve: (value?: T | Thenable<T>) => void, reject: (reason?: any) => void) => void): Promise<T>;

	/**
	 * Creates a Promise that is resolved with an array of results when all of the provided Promises
	 * resolve, or rejected when any Promise is rejected.
	 * @param values An array of Promises.
	 * @returns A new Promise.
	 */
	all<T>(values: Array<T | Thenable<T>>): Promise<T[]>;

	/**
	 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
	 * or rejected.
	 * @param values An array of Promises.
	 * @returns A new Promise.
	 */
	race<T>(values: Array<T | Thenable<T>>): Promise<T>;

	/**
	 * Creates a new rejected promise for the provided reason.
	 * @param reason The reason the promise was rejected.
	 * @returns A new rejected Promise.
	 */
	reject(reason: any): Promise<void>;

	/**
	 * Creates a new rejected promise for the provided reason.
	 * @param reason The reason the promise was rejected.
	 * @returns A new rejected Promise.
	 */
	reject<T>(reason: any): Promise<T>;

	/**
	  * Creates a new resolved promise for the provided value.
	  * @param value A promise.
	  * @returns A promise whose internal state matches the provided promise.
	  */
	resolve<T>(value: T | Thenable<T>): Promise<T>;

	/**
	 * Creates a new resolved promise .
	 * @returns A resolved promise.
	 */
	resolve(): Promise<void>;

	// [Symbol.species]: Function;
}

declare var Promise: PromiseConstructor;
