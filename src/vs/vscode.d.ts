/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
	- comments are marked like this '<<< comment >>>'
	- I've fixed typos directly without comments

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
	- unclear when we have functions in a namespace and when we have resolve function and a sub namespace / interface. Examples are:
		o workspace.openTextDocument() => return ITextDocument which opens a separate namespace
		o vscode.language.register* functions. Could have been workspace.getLanguage(selector) => ILangauge
		In general I think that having separate namespaces will help with scalibility. Results in smaller proposals in code complete.
		window.activeTextEditor.###, window.statusBar.###, window.quickPick.###

	- async programming style, Promise return and method naming
		o we should make a statement how the async programming style works. What happens if I call a method and the actual operation can not be executed
		  in the main thread since the editor / model changed.
		o would be good to have a naming theme that makes our model clear. We could for example use:
		  setXXX/applyXXX => Thenable. The operation is either done or rejected. An example is applying edits which get rejected if the model version doesn't exist anymore.
		  updateXXX => void. The operation is done but the result might never be observable. It could even be that the operation got dropped. Or we want to ensure the operation
		  is not observable. Example updateSelection. Otherwise people might think updateSelection(xxx).then(() => selction is at position xxx which might not be the case).
	- label, names, descriptions: would be great to indicate if they show up in the user interface and therefore must be human readable.
	- usage of option bags. Most functions flatten all parameters other only take an option bag. We should be consistent here. If option bags they must be optional
	- param: T | Thenable<T>: (e.g. showQuickPick). IMO we shouldn't pass Thenable as a param. It should be resolved outside> Otherwise we need to handle the error case
	  inside and even need to communicate that back to the outside.
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
		 * Title of the command, like __save__
		 */
		title: string;

		/**
		 * The identifier of the actual command handler
		 * @see commands.registerCommand
		 */
		command: string;

		/**
		 * Arguments that the command-handler should be
		 * invoked with
		 */
		arguments?: any[];
	}

	/**
	 * Represents a line of text such as a line of source code
	 * <<< Is a textLine live. E.g. when updating the document will a text line update as well. If not
	 *     I would suggest to remove TextLine and add the methods to text document. Otherwise the object might
	 *     be misleading.
	 * >>>
	 */
	export interface TextLine {

		/**
		 * The zero-offset line number   <<<better: 'zero-based' see https://en.wikipedia.org/wiki/Zero-based_numbering >>>
		 *
		 * @readonly
		 */
		lineNumber: number;

		/**
		 * The text of this line without the
		 * newline character <<< what's about CR/LF on Windows? better: 'line separator characters' >>>
		 *
		 * @readonly
		 */
		text: string;

		/**
		 * The range this line covers without the
		 * newline character <<< what's about CR/LF on Windows? better: 'line separator characters' >>>
		 *
		 * @readonly
		 */
		range: Range;

		/**
		 * The range this line covers with the
		 * newline character <<< dito >>>
		 *
		 * @readonly
		 */
		rangeIncludingLineBreak: Range;

		/**
		 * The offset of the first character which
		 * isn't a whitespace character as defined
		 * by a `\s`-RegExp
		 *
		 * @readonly
		 */
		firstNonWhitespaceCharacterIndex: number;

		/**
		 * Whether this line is whitespace only, shorthand
		 * for `#firstNonWhitespaceCharacterIndex === #text.length`
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
		 * Get the associated URI for this document. Most documents have the file://-scheme, indicating that they represent files on disk.
		 * However, some documents may have other schemes indicating that they are not available on disk.
		 *
		 * @readonly
		 */
		uri: Uri;

		/**
		 * Returns the file system path of the file associated with this document. Shorthand
		 * notation for `#uri.fsPath` <<< what if uri is not a file? >>>
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
		 * The language identifier associated with this document.
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
		 * @param line A line number in (0, lineCount[
		 * @return A line.
		 */
		lineAt(line: number): TextLine;

		/**
		 * Returns a text line denoted by the position. Note
		 * that the returned object is *not* live and changes to the
		 * document are not reflected.
		 *
		 * @see ()[#lineAt]
		 * @param position A position which line is in (0, lineCount[
		 * @return A line.
		 */
		lineAt(position: Position): TextLine;

		/**
		 * Converts the position to a zero-based offset.
		 */
		offsetAt(position: Position): number;

		/**
		 * Converts a zero-based offset to a position.
		 */
		positionAt(offset: number): Position;

		/**
		 * Get the text in this document. If a range is provided the text contained
		 * by the range is returned. <<< if the range is larger than the TextDocument only the intersection is ... >>>
		 */
		getText(range?: Range): string;

		/**
		 * Get the word under a certain position. May return null if position is at whitespace, on empty line, etc.
		 * <<< what is a 'word'? >>>
		 */
		getWordRangeAtPosition(position: Position): Range;

		/**
		 * Ensure a range sticks to the text.
		 * <<< 'sticks'? better: ensure a range is completely contained in the TextDocument. >>>
		 */
		validateRange(range: Range): Range;

		/**
		 * Ensure a position sticks to the text.	// <<< dito >>>
		 */
		validatePosition(position: Position): Position;
	}

	/**
	 * Represents a line and character position, such as
	 * the position of the caret.
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
		 * @param line
		 * @param character
		 */
		constructor(line: number, character: number);

		/**
		 * @return `true` if position is on a smaller line
		 * or smaller character.
		 */
		isBefore(other: Position): boolean;

		/**
		 * @return `true` if position is on a smaller or equal line
		 * or smaller or equal character.
		 */
		isBeforeOrEqual(other: Position): boolean;

		/**
		 * @return `true` if position is on a greater line
		 * or greater character.
		 */
		isAfter(other: Position): boolean;

		/**
		 * @return `true` if position is on a greater or equal line
		 * or greater or equal character.
		 */
		isAfterOrEqual(other: Position): boolean;

		/**
		 * @return `true` if the line and character of the given position are equal to
		 * the line and character of this position.
		 */
		isEqual(other: Position): boolean;

		/**
		 * @return A number smaller zero if this position is before the given position,
		 * a number greater zero if this position is after the given position, or zero when
		 * this and the given position are equal.
		 */
		compareTo(other: Position): number;

		/**
		 *
		 * @param lineDelta Delta value for the line value, default is `0`.
		 * @param characterDelta Delta value for the character value, default is `0`.
		 * @return A position which line and character is the sum of the current line and
		 * character and the corresponding deltas.
		 */
		translate(lineDelta?: number, characterDelta?: number): Position;

		/**
		 * @param line Value that should be used as line value, default is the [existing value](#Position.line)
		 * @param character Value that should be used as character value, default is the [existing value](#Position.character)
		 * @return A position which line and character are replaced by the given values.
		 */
		with(line?: number, character?: number): Position;
	}

	/**
	 * A range represents an ordered pair of two positions.
	 *
	 * Range objects are __immutable__. Use the [with](#Range.with),
	 * [intersection](#Range.intersection), or [union](#Range.union) methods
	 * to derive new ranges from an existing range.
	 */
	export class Range {

		/**
		 * The start position is before or equal to end.
		 * @readonly
		 */
		start: Position;

		/**
		 * The end position which is after or equal to start.
		 * @readonly
		 */
		end: Position;

		/**
		 * Create a new range from two position. If `start` is not
		 * before or equal to `end` the values will be swapped.
		 *
		 * @param start
		 * @param end
		 */
		constructor(start: Position, end: Position);

		/**
		 * Create a new range from two (line,character)-pairs. The parameters
		 * might be swapped so that start is before or equal to end.
		 */
		constructor(startLine: number, startColumn: number, endLine: number, endColumn: number);  // <<< use 'character' instead of 'column' >>>

		/**
		 * `true` iff `start` and `end` are equal.
		 */
		isEmpty: boolean;

		/**
		 * `true` iff `start` and `end` are on the same line.
		 */
		isSingleLine: boolean;

		/**
		 * @return `true` iff the position or range is inside or equal
		 * to this range.
		 */
		contains(positionOrRange: Position | Range): boolean;

		/**
		 * @return `true` when start and end are [equal](#Position.isEqual) to
		 * start and end of this range
		 */
		isEqual(other: Range): boolean;

		/**
		 * @return A range of the greater start and smaller end positions. Will
		 * return undefined when there is no overlap.
		 */
		intersection(range: Range): Range;

		/**
		 * @return A range of smaller start position and the greater end position.
		 */
		union(other: Range): Range;

		/**
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
		 */
		anchor: Position;	// <<< is anchor always start or end of the underlying range? if yes, why not just use a boolean 'reversed'? >>>

		/**
		 * The position of the cursor.
		 */
		active: Position;	//<<< why is the cursor position called 'active' and not 'cursor'? the comment should explain this >>>

		/**
		 * Create a selection from two postions.
		 */
		constructor(anchor: Position, active: Position);

		/**
		 * Create a selection from four points.
		 */
		constructor(anchorLine: number, anchorColumn: number, activeLine: number, activeColumn: number);  // <<< 'column' -> 'character' >>>
		/**
		 * A selection is reversed if the [anchor](#Selection.anchor)
		 * is equal to [start](#Selection.start) and if [active](#Selection.active)
		 * is equal to [end](#Selection.end)
		 */
		isReversed: boolean;
	}

	/**
	 *
	 */
	export interface TextEditorOptions {

		/**
		 * The size in spaces a tab takes
		 */
		tabSize: number;

		/**
		 * When pressing Tab insert [n](#TextEditorOptions.tabSize) spaces.
		 */
		insertSpaces: boolean;
	}

	// <<< non-obvious >>>
	export interface TextEditorDecorationType {

		/**
		 * @readonly
		 */
		key: string;

		dispose(): void;
	}

	export enum TextEditorRevealType {
		Default,	// <<< what is 'Default'? suggest to make 'Default' an alias for a self-describing value >>>
		InCenter,
		InCenterIfOutsideViewport
	}

	export enum OverviewRulerLane {
		Left = 1,
		Center = 2,
		Right = 4,
		Full = 7
	}

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
		 * A path to an image to be rendered in the gutterIconPath.
		 */
		gutterIconPath?: string;

		/**
		 * The color of the decoration in the overview ruler. Use rgba() and define transparent colors to play well with other decorations.
		 */
		overviewRulerColor?: string;
	}

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

	export interface TextEditor {

		/**
		 * The document associated with this text editor. The document will be the same for the entire lifetime of this text editor.
		 */
		document: TextDocument;

		/**
		 * The primary selection on this text editor. In case the text editor has multiple selections this is the first selection as
		 * in `TextEditor.selections[0]`.  <<< and in the single selection case this is not true? This should always be true! >>>
		 * @see [updateSelection](#updateSelection)
		 */
		selection: Selection;

		/**
		 * The selections in this text editor.
		 * @see [updateSelection](#updateSelection)
		 */
		selections: Selection[];

		/**
		 * Text editor options.
		 */
		options: TextEditorOptions;

		/**
		 * Perform an edit on the document associated with this text editor.
		 * The passed in {{editBuilder}} is available only for the duration of the callback.
		 * <<< waht does 'available' mean? better: 'valid' >>>
		 */
		edit(callback: (editBuilder: TextEditorEdit) => void): Thenable<boolean>;

		/**
		 * Adds a set of decorations to the text editor.
		 * You must first create a `TextEditorDecorationType`. <<< to create another object is probably true for 95% of all APIs; nuke this sentence! >>>
		 * If a set of decorations already exists with the given type, they will be overwritten.
		 */
		setDecorations(decorationType: TextEditorDecorationType, ranges: Range[] | DecorationOptions[]): void;

		/**
		 * Scroll as necessary in order to reveal the given range.
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
		 *
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
	 * Denotes a column in the VS Code window. Columns used to show editors
	 * side by side.
	 * <<< another reason not to use the term 'column' for 'character' within a line >>>
	 * <<< this definition seems to be misplaced: it is not TextEditor related >>>
	 */
	export enum ViewColumn {
		One = 1,
		Two = 2,
		Three = 3
	}

	/**
	 * A complex edit that will be applied on a TextEditor.
	 * This holds a description of the edits and if the edits are valid (i.e. no overlapping regions, etc.) they can be applied on a Document associated with a TextEditor.
	 *
	 * <<< for transactionality would be great of the text editor edit would allow to set the selection at the end of the operation >>>
	 */
	export interface TextEditorEdit {
		/**
		 * Replace a certain text region with a new value.	<<< what's about line separators in the replacement string? do I have to care? >>>
		 */
		replace(location: Position | Range | Selection, value: string): void;

		/**
		 * Insert text at a location	<<< what's about line separators in the replacement string? do I have to care? >>>
		 */
		insert(location: Position, value: string): void;

		/**
		 * Delete a certain text region.
		 */
		delete(location: Range | Selection): void;

	}

	/**
	 * A universal resource identifier representing either a file on disk on
	 * or another resource, e.g untitled.
	 */
	export class Uri {

		/**
		 * Create URI for a file system path
		 */
		static file(path: string): Uri;

		/**
		 *
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
	 *
	 * A cancallation token can only cancel once. That means it
	 * signaled cancellation it will do so forever   <<< don't understand this >>>
	 */
	export interface CancellationToken {

		/**
		 * `true` when the token has been cancelled.
		 */
		isCancellationRequested: boolean;

		/**
		 * An [event](#Event) which fires upon cancellation
		 */
		onCancellationRequested: Event<any>;
	}

	/**
	 * A cancellation source creates [cancellation tokens](#CancellationToken).
	 */
	export class CancellationTokenSource {

		/**
		 * The current token
		 */
		token: CancellationToken;

		/**
		 * Signal cancellation on the token.
		 */
		cancel(): void;

		/**
		 * Signal cancellation and free resources   <<< so this is like 'cancel()'? then the name is a bit harmless (or misleading) ... >>>
		 */
		dispose(): void;
	}

	// <<< Should we have an IDispose interface people can implement by themselves and then push into a subscriptions
	//     instead of always creating an extra object and a function >>>

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
		 * @param thisArgs The 'this' which will be used when calling the event listener.
		 * @param disposables An array to which a {{IDisposable}} will be added. The
		 * @return
		 */
		(listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
	}

	/**
	 * A file system watcher notifies about changes to files and folders
	 * on disk. To get an instance of a {{FileSystemWatcher}} use
	 * {{workspace.createFileSystemWatcher}}.
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
		 * The main label of this item   <<< is there another 'non-main' label? >>>
		 */
		label: string;

		/**
		 * A description <<< for what is this used? >>>
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
	 * Represents an actional item that is shown with an information, warning, or  <<< what is an 'actional' item? >>>
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
		* the value to prefill in the input box
		*/
		value?: string;

		/**
		* The text to display underneath the input box.
		*/
		prompt?: string;

		/**
		* an optional string to show as place holder in the input box to guide the user what to type
		*/
		placeHolder?: string;

		/**
		* set to true to show a password prompt that will not show the typed value
		*/
		password?: boolean;
	}

	/**
	 * A document filter denotes a document by different properties like
	 * the [language](#TextDocument.languageId), the (scheme)[#Uri.scheme] of
	 * it's resource, or a glob-pattern that is applied to the (path)[#TextDocument.fileName]
	 *
	 * A language filter that applies to typescript files on disk would be this:
	 * ```
	 * { language: 'typescript', scheme: 'file' }
	 * ```
	 * a language filter that applies to all package.json files would be this:
	 * ```
	 * { language: 'json', pattern: '**\project.json' }
	 * ```
	 */
	export interface DocumentFilter {

		/**
		 * A language id, like `typescript`.
		 */
		language?: string;

		/**
		 * A Uri scheme, like `file` or `untitled`
		 */
		scheme?: string;

		/**
		 * A glob pattern, like `*.{ts,js}`
		 */
		pattern?: string;
	}

	/**
	 * A language selector is the combination of one or many language identifiers
	 * and (language filters)[#LanguageFilter]. Samples are
	 * `let sel:DocumentSelector = 'typescript`, or
	 * `let sel:DocumentSelector = ['typescript', { language: 'json', pattern: '**\tsconfig.json' }]`
	 */
	export type DocumentSelector = string | DocumentFilter | (string | DocumentFilter)[];

	/**
	 * Contains additional diagnostic information about the context in which
	 * a [code action](#CodeActionProvider.provideCodeActions) is run
	 */
	export interface CodeActionContext {
		diagnostics: Diagnostic[];
	}

	/**
	 * A code action provider can add [commands](#Command) to a piece of code. The availability of
	 * commands will be shown as a 'light bulb'.
	 */
	export interface CodeActionProvider {

		/**
		 * Provide commands for the given document and range.
		 *
		 * @return An array of commands or a thenable of such. It is OK to return undefined or null.
		 */
		provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken): Command[] | Thenable<Command[]>;
	}

	/**
	 * A code lens represents a [command](#Command) that should be shown along with
	 * source text, like the number of references, a way to run tests, etc.
	 */
	export class CodeLens {

		/**
		 * The range in which this code lens is valid. Should only span a single line.
		 */
		range: Range;

		/**
		 * The command this code lens represents
		 */
		command: Command;

		constructor(range: Range, command?: Command);

		/**
		 * `true` when there is a command associated
		 */
		isResolved: boolean;
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
	 * The definition of a symbol is one or many [locations](#Location)
	 * <<< I don't understand. What is a 'Definition'? Example? >>>
	 */
	export type Definition = Location | Location[];

	export interface DefinitionProvider {
		provideDefinition(document: TextDocument, where: Position, token: CancellationToken): Definition | Thenable<Definition>;
	}

	/**
	 * FormattedString can be used to render text with a tiny subset of markdown. FormattedString
	 * is either a string that supports **bold** and __italic__ or a code-block that
	 * provides a language and a code Snippet.
	 */
	export type MarkedString = string | { language: string; value: string };

	export class Hover {

		contents: MarkedString[];

		range: Range;

		constructor(contents: MarkedString | MarkedString[], range?: Range);
	}

	export interface HoverProvider {
		provideHover(document: TextDocument, position: Position, token: CancellationToken): Hover | Thenable<Hover>;
	}

	export enum DocumentHighlightKind {
		Text,
		Read,
		Write
	}

	export class DocumentHighlight {
		constructor(range: Range, kind?: DocumentHighlightKind);
		range: Range;
		kind: DocumentHighlightKind;
	}

	export interface DocumentHighlightProvider {
		provideDocumentHighlights(document: TextDocument, position: Position, token: CancellationToken): DocumentHighlight[] | Thenable<DocumentHighlight[]>;
	}

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
		Array,
	}

	export class SymbolInformation {
		constructor(name: string, kind: SymbolKind, range: Range, uri?: Uri, containerName?: string);
		name: string;
		containerName: string;
		kind: SymbolKind;
		location: Location;
	}

	export interface DocumentSymbolProvider {
		provideDocumentSymbols(document: TextDocument, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]>;
	}

	export interface WorkspaceSymbolProvider {
		provideWorkspaceSymbols(query: string, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]>;
	}

	export interface ReferenceProvider {
		provideReferences(document: TextDocument, position: Position, options: { includeDeclaration: boolean; }, token: CancellationToken): Location[] | Thenable<Location[]>;
	}

	// <<< why is TextEdit miles away from TextEditorEdit? >>>
	export class TextEdit {
		static replace(range: Range, newText: string): TextEdit;
		static insert(position: Position, newText: string): TextEdit;
		static delete(range: Range): TextEdit;
		constructor(range: Range, newText: string);
		range: Range;
		newText: string;
	}

	/**
	 * A workspace edit represents text changes for many documents.
	 * <<< How do we ensure that a WorkspaceEdit applied to a text document is still valid. Is this something the
	 *     workspace edit does by first resolving the document based on the URI ? >>>
	 */
	export class WorkspaceEdit {

		/**
		 * The number of affected resources.
		 *
		 * @readonly
		 */
		size: number;

		replace(resource: Uri, range: Range, newText: string): void;

		insert(resource: Uri, range: Position, newText: string): void;

		delete(resource: Uri, range: Range): void;

		has(uri: Uri): boolean;

		set(uri: Uri, edits: TextEdit[]): void;

		get(uri: Uri): TextEdit[];

		entries(): [Uri, TextEdit[]][];
	}

	/**
	 *
	 */
	export interface RenameProvider {
		provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): WorkspaceEdit | Thenable<WorkspaceEdit>;
	}

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

	export class CompletionItem {
		label: string;
		kind: CompletionItemKind;
		detail: string;			// <<< non-obvious >>>
		documentation: string;	// <<< non-obvious: what is the supported format? >>>
		sortText: string;		// <<< non-obvious: is this the 'sort key'? >>>
		filterText: string;		// <<< non-obvious: is this the 'filter key'? >>>
		insertText: string;
		textEdit: TextEdit;		// <<< non-obvious: what is the relation between insertText and textEdit? >>>
		constructor(label: string);
	}

	export interface CompletionItemProvider {
		provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): CompletionItem[] | Thenable<CompletionItem[]>;
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
		 * Deprecated
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
		 * Deprecated
		 */
		__characterPairSupport?: {
			autoClosingPairs: {
				open: string;
				close: string;
				notIn?: string[];
			}[];
		};
	}

	export interface WorkspaceConfiguration {

		/**
		 * @param section configuration name, supports _dotted_ names
		 * @return the value `section` denotes or the default
		 */
		get<T>(section: string, defaultValue?: T): T;

		/**
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
	 * Represents the severity of diagnostics.
	 */
	export enum DiagnosticSeverity {
		Hint = 3,
		Information = 2,
		Warning = 1,
		Error = 0
	}

	/**
	 * Represents a location inside a resource, such as a line
	 * inside a text file.
	 */
	export class Location {
		constructor(uri: Uri, range: Range | Position);
		uri: Uri;
		range: Range;
	}

	export interface DiagnosticCollection {

		/**
		 * <<< non-obvious: for what is the name used? >>>
		 */
		name: string;

		/**
		 * Assign diagnostics for given resource. Will replace
		 * existing diagnostics
		 */
		set(uri: Uri, diagnostics: Diagnostic[]): void;

		/**
		 * Remove all diagnostics from this collection that belong
		 * to the provided `uri`. The same as `#set(uri, undefined)`
		 */
		delete(uri: Uri): void;

		/**
		 * Replace all entries
		 */
		set(entries: [Uri, Diagnostic[]][]): void;

		/**
		 * Remove all diagnostics from this collection. The same
		 * as calling `#set(undefined)`;
		 */
		clear(): void;

		dispose(): void;
	}

	/**
	 * Represents a diagnostic, such as a compiler error or warning, along with the location
	 * in which they occurred.
	 */
	export class Diagnostic {

		range: Range;

		message: string;

		severity: DiagnosticSeverity;

		code: string | number;		// <<< is this an ID? It does not appear in the constructor. >>>

		/**
		 * Creates a new diagnostic object
		 *
		 * @param range To what range this diagnostic relates
		 * @param message Message to show the user
		 * @param severity Diagnostic severity, by default [error](#DiagnosticSeverity.Error)
		 */
		constructor(range: Range, message: string, severity?: DiagnosticSeverity);
	}

	export interface OutputChannel {

		/**
		 *
		 * @readonly
		 */
		name: string;

		append(value: string): void;

		appendLine(value: string): void;

		clear(): void;

		show(column?: ViewColumn): void;

		hide(): void;

		dispose(): void;
	}

	/**
	 * Represents the alignment of status bar items,
	 * either `Left` or `Right`
	 */
	export enum StatusBarAlignment {
		Left,
		Right
	}

	/**
	 * A status bar item is a status bar contribution that can
	 * show text and icons and run a command on click.
	 */
	export interface StatusBarItem {

		/**
		 * The alignment of this item, either left or right		// <<< no need to mention left or right here because a specific enum exists. >>>
		 * @readonly
		 */
		alignment: StatusBarAlignment;

		/**
		 * The priority of this item. It defined the sorting
		 * when multi items share the same [alignment](#alignment)		// <<< I don't get this ? >>>
		 * @readonly
		 */
		priority: number;

		/**
		* The text to show for the entry. You can embed icons in the text by leveraging the syntax:
		*
		* `My text $(icon name) contains icons like $(icon name) this one.`
		*
		* Where the icon name is taken from the octicon icon set (https://octicons.github.com/), e.g.
		* light-bulb, thumbsup or zap.
		*/
		text: string;

		/**
		* An optional tooltip text to show when you hover over the entry
		*/
		tooltip: string;

		/**
		* An optional color to use for the entry
		*/
		color: string;

		/**
		* An optional id of a command that is known to the workbench to execute on click. This can either
		* be a built in workbench or editor command or a command contributed by an extension.
		*/
		command: string;

		/**
		 * Shows the entry in the status bar.
		 */
		show(): void;

		/**
		 * Removes the entry from the status bar.
		 */
		hide(): void;

		/**
		 * Disposes the status bar entry from the status bar
		 */
		dispose(): void;
	}

	export interface TextEditorSelectionChangeEvent {
		textEditor: TextEditor;
		selections: Selection[];
	}

	export interface TextEditorOptionsChangeEvent {
		textEditor: TextEditor;
		options: TextEditorOptions;
	}

	export interface Extension<T> {
		/**
		 * The canonical extension identifier.
		 * Computed via `publisher.name`
		 */
		id: string;

		/**
		 * The absolute OS path to the directory containing the extension.
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
		 * The public API exported by this extension.
		 * Accessing this field before the extension is activated will throw!
		 */
		exports: T;

		/**
		 * Activates this extension and returns its public API.
		 */
		activate(): Thenable<T>;
	}

	export interface ExtensionContext {

		/**
		 * An array to which disposables can be added. When this
		 * extension is deactivated the disposables will be invoked.
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
		 * The absolute OS path to the directory containing the extension.
		 */
		extensionPath: string;

		/**
		 * Get the absolute path of a resource contained inside the extension.
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
		 * @param command - The unique identifier of this command
		 * @param callback - The command callback
		 * @param thisArgs - (optional) The this context used when invoking {{callback}}
		 * @return Disposable which unregisters this command on disposal
		 */
		export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable;

		/**
		 * Register a text editor command that will make edits.
		 * It can be invoked via a keyboard shortcut, a menu item, an action, or directly.
		 *
		 * @param command - The unique identifier of this command
		 * @param callback - The command callback. The {{textEditor}} and {{edit}} passed in are available only for the duration of the callback.
		 * @param thisArgs - (optional) The `this` context used when invoking {{callback}}
		 * @return Disposable which unregisters this command on disposal
		 */
		export function registerTextEditorCommand(command: string, callback: (textEditor: TextEditor, edit: TextEditorEdit) => void, thisArg?: any): Disposable;

		/**
		 * Executes a command
		 *
		 * @param command - Identifier of the command to execute
		 * @param ...rest - Parameter passed to the command function
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
		 * Create a `TextEditorDecorationType` that can be used to add decorations to text editors.
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
		 * @param items an array of strings to pick from.
		 * @param options configures the behavior of the selection list
		 * @return a promise that resolves to the selected string or undefined.
		 *
		 * <<< why can items be a Thenable<T>. We should either support this always (for example showErrorMessage)
		 *     or never. IMO there is no value gain in this. Devs can Promise.all(items => showQuickPick)
		 *     What happens if a Theable is rejected. Does the whole showQuickPick gets rejected.
		 * >>>
		 */
		export function showQuickPick(items: string[] | Thenable<string[]>, options?: QuickPickOptions): Thenable<string>;

		/**
		 * Shows a selection list.
		 *
		 * @param items an array of items to pick from.
		 * @param options configures the behavior of the selection list
		 * @return a promise that resolves to the selected item or undefined.
		 *
		 * <<< same as above >>>
		 */
		export function showQuickPick<T extends QuickPickItem>(items: T[] | Thenable<T[]>, options?: QuickPickOptions): Thenable<T>;

		/**
		 * Opens an input box to ask the user for input.
		 *
		 * The returned value will be undefined if the input box was canceled (e.g. pressing ESC) and otherwise will
		 * have the user typed string or an empty string if the user did not type anything but dismissed the input
		 * box with OK.
		 *
		 * <<< why is this an option bag and not parameters. We don't use options bags frequently >>>
		 */
		export function showInputBox(options?: InputBoxOptions): Thenable<string>;

		/**
		 * Returns a new [output channel](#OutputChannel) with the given name.
		 */
		export function createOutputChannel(name: string): OutputChannel;

		/**
		 * Set a message to the status bar. This is a short hand for the more power full
		 * status bar [items](#window.createStatusBarItem).
		 * @param text The message to show, support icons subtitution as in status bar [items](#StatusBarItem.text).
		 */
		export function setStatusBarMessage(text: string): Disposable;

		/**
		 * @see [[#window.setStatusBarMessage]]
		 * @param hideAfterTimeout Timeout in milliseconds after which the message will be disposed.
		 */
		export function setStatusBarMessage(text: string, hideAfterTimeout: number): Disposable;

		/**
		 * @see [[#window.setStatusBarMessage]]
		 * @param hideWhenDone Thenable on which completion (resolve or reject) the message will be disposed.
		 */
		export function setStatusBarMessage(text: string, hideWhenDone: Thenable<any>): Disposable;


		/**
		* Add a status bar entry. Can be left or right aligned, expresses ordering
		* via priority.
		*
		* @param position either Left or Right
		* @param priority the higher the number, the more the entry moves to the left of the status bar
		*/
		export function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;
	}

	/**
	 * An event describing a change in the text of a model.
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
	 * An event describing a document change event.
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
		 * Creates a file system watcher. A glob pattern that filters the
		 * file events must be provided. Optionally, flags to ignore certain
		 * kind of events can be provided.
		 *
		 * @param globPattern - A glob pattern that is applied to the names of created, changed, and deleted files.
		 * @param ignoreCreateEvents - Ignore when files have been created.
		 * @param ignoreChangeEvents - Ignore when files have been changed.
		 * @param ignoreDeleteEvents - Ignore when files have been deleted.
		 */
		export function createFileSystemWatcher(globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): FileSystemWatcher;

		/**
		 * The folder that is open in VS Code if applicable
		 */
		export let rootPath: string;

		/**
		 * @return a path relative to the [root](#rootPath) of the workspace.
		 */
		export function asRelativePath(pathOrUri: string | Uri): string;

		// TODO@api - justify this being here
		export function findFiles(include: string, exclude: string, maxResults?: number): Thenable<Uri[]>;

		/**
		 * Save all dirty files
		 */
		export function saveAll(includeUntitled?: boolean): Thenable<boolean>;

		/**
		 * Apply the provided (workspace edit)[#WorkspaceEdit].
		 */
		export function applyEdit(edit: WorkspaceEdit): Thenable<boolean>;

		/**
		 * All text documents currently known to the system.
		 */
		export let textDocuments: TextDocument[];

		/**
		 * Opens the denoted document from disk. Will return early if the
		 * document is already open, otherwise the document is loaded and the
		 * [open document](#workspace.onDidOpenTextDocument)-event fires.
		 *
		 * The document to open is denoted by the [uri](#Uri). Two schemes are supported:
		 * * **file** a file on disk, will be rejected if the file does not exist or cannot be loaded, e.g. 'file:///Users/frodo/r.ini'.
		 * * **untitled** a new file that should be saved on disk, e.g. 'untitled:/Users/frodo/new.js'. The language will be derived from the file name.
		 * Uris with other schemes will make this method returned a rejected promise.
		 *
		 * @param uri Identifies the resource to open.
		 * @return A promise that resolves to a [document](#TextDocument).
		 */
		export function openTextDocument(uri: Uri): Thenable<TextDocument>;

		/**
		 * Like `openTextDocument(Uri.file(fileName))`
		 */
		export function openTextDocument(fileName: string): Thenable<TextDocument>;

		export const onDidOpenTextDocument: Event<TextDocument>;

		export const onDidCloseTextDocument: Event<TextDocument>;

		export const onDidChangeTextDocument: Event<TextDocumentChangeEvent>;

		export const onDidSaveTextDocument: Event<TextDocument>;

		/**
		 *
		 */
		export function getConfiguration(section?: string): WorkspaceConfiguration;

		// TODO: send out the new config?
		export const onDidChangeConfiguration: Event<void>;
	}

	export namespace languages {

		/**
		 * Return the identifiers of all known languages.
		 * @return Promise resolving to an array of identifier strings.
		 */
		export function getLanguages(): Thenable<string[]>;

		/**
		 * Compute the match between a document selector and a document. Values
		 * greater zero mean the selector matches the document.
		 */
		export function match(selector: DocumentSelector, document: TextDocument): number;

		/**
		 *
		 */
		export function createDiagnosticCollection(name?: string): DiagnosticCollection;

		/**
		 *
		 */
		export function registerCodeActionsProvider(language: DocumentSelector, provider: CodeActionProvider): Disposable;

		/**
		 *
		 */
		export function registerCodeLensProvider(language: DocumentSelector, provider: CodeLensProvider): Disposable;

		/**
		 *
		 */
		export function registerDefinitionProvider(selector: DocumentSelector, provider: DefinitionProvider): Disposable;

		/**
		 *
		 */
		export function registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable;

		/**
		 *
		 */
		export function registerDocumentHighlightProvider(selector: DocumentSelector, provider: DocumentHighlightProvider): Disposable;

		/**
		 *
		 */
		export function registerDocumentSymbolProvider(selector: DocumentSelector, provider: DocumentSymbolProvider): Disposable;

		/**
		 *
		 */
		export function registerWorkspaceSymbolProvider(provider: WorkspaceSymbolProvider): Disposable;

		/**
		 *
		 */
		export function registerReferenceProvider(selector: DocumentSelector, provider: ReferenceProvider): Disposable;

		/**
		 *
		 */
		export function registerRenameProvider(selector: DocumentSelector, provider: RenameProvider): Disposable;

		/**
		 *
		 */
		export function registerDocumentFormattingEditProvider(selector: DocumentSelector, provider: DocumentFormattingEditProvider): Disposable;

		/**
		 *
		 */
		export function registerDocumentRangeFormattingEditProvider(selector: DocumentSelector, provider: DocumentRangeFormattingEditProvider): Disposable;

		/**
		 *
		 */
		export function registerOnTypeFormattingEditProvider(selector: DocumentSelector, provider: OnTypeFormattingEditProvider, firstTriggerCharacter: string, ...moreTriggerCharacter: string[]): Disposable;

		/**
		 *
		 */
		export function registerSignatureHelpProvider(selector: DocumentSelector, provider: SignatureHelpProvider, ...triggerCharacters: string[]): Disposable;

		/**
		 *
		 */
		export function registerCompletionItemProvider(selector: DocumentSelector, provider: CompletionItemProvider, ...triggerCharacters: string[]): Disposable;

		/**
		 *
		 */
		export function setLanguageConfiguration(language: string, configuration: LanguageConfiguration): Disposable;
	}

	export namespace extensions {

		export function getExtension(extensionId: string): Extension<any>;

		export function getExtension<T>(extensionId: string): Extension<T>;

		/**
		 * All extensions currently known to the system.
		 */
		export let all: Extension<any>[];
	}
}

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

// TS 1.6 & node_module
// export = vscode;

declare module 'vscode' {
	export = vscode;
}
