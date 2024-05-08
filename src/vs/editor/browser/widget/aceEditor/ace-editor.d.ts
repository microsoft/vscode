
export namespace Ace {
	export type NewLineMode = 'auto' | 'unix' | 'windows';

	export interface Anchor extends EventEmitter {
		getPosition(): Position;

		getDocument(): Document;

		setPosition(row: number, column: number, noClip?: boolean): void;

		detach(): void;

		attach(doc: Document): void;
	}

	export interface Document extends EventEmitter {
		setValue(text: string): void;

		getValue(): string;

		createAnchor(row: number, column: number): Anchor;

		getNewLineCharacter(): string;

		setNewLineMode(newLineMode: NewLineMode): void;

		getNewLineMode(): NewLineMode;

		isNewLine(text: string): boolean;

		getLine(row: number): string;

		getLines(firstRow: number, lastRow: number): string[];

		getAllLines(): string[];

		getLength(): number;

		getTextRange(range: Range): string;

		getLinesForRange(range: Range): string[];

		insert(position: Position, text: string): Position;

		insert(position: { row: number, column: number }, text: string): Position;

		insertInLine(position: Position, text: string): Position;

		insertNewLine(position: Point): Point;

		clippedPos(row: number, column: number): Point;

		clonePos(pos: Point): Point;

		pos(row: number, column: number): Point;

		insertFullLines(row: number, lines: string[]): void;

		insertMergedLines(position: Position, lines: string[]): Point;

		remove(range: Range): Position;

		removeInLine(row: number, startColumn: number, endColumn: number): Position;

		removeFullLines(firstRow: number, lastRow: number): string[];

		removeNewLine(row: number): void;

		replace(range: Range, text: string): Position;

		applyDeltas(deltas: Delta[]): void;

		revertDeltas(deltas: Delta[]): void;

		applyDelta(delta: Delta, doNotValidate?: boolean): void;

		revertDelta(delta: Delta): void;

		indexToPosition(index: number, startRow: number): Position;

		positionToIndex(pos: Position, startRow?: number): number;
	}

	export interface FoldLine {
		folds: Fold[];
		range: Range;
		start: Point;
		end: Point;

		shiftRow(shift: number): void;

		addFold(fold: Fold): void;

		containsRow(row: number): boolean;

		walk(callback: Function, endRow?: number, endColumn?: number): void;

		getNextFoldTo(row: number, column: number): null | { fold: Fold, kind: string };

		addRemoveChars(row: number, column: number, len: number): void;

		split(row: number, column: number): FoldLine;

		merge(foldLineNext: FoldLine): void;

		idxToPosition(idx: number): Point;
	}

	export interface Fold {
		range: Range;
		start: Point;
		end: Point;
		foldLine?: FoldLine;
		sameRow: boolean;
		subFolds: Fold[];

		setFoldLine(foldLine: FoldLine): void;

		clone(): Fold;

		addSubFold(fold: Fold): Fold;

		restoreRange(range: Range): void;
	}

	interface Folding {
		getFoldAt(row: number, column: number, side: number): Fold;

		getFoldsInRange(range: Range): Fold[];

		getFoldsInRangeList(ranges: Range[]): Fold[];

		getAllFolds(): Fold[];

		getFoldStringAt(row: number,
						column: number,
						trim?: number,
						foldLine?: FoldLine): string | null;

		getFoldLine(docRow: number, startFoldLine?: FoldLine): FoldLine | null;

		getNextFoldLine(docRow: number, startFoldLine?: FoldLine): FoldLine | null;

		getFoldedRowCount(first: number, last: number): number;

		addFold(placeholder: string | Fold, range?: Range): Fold;

		addFolds(folds: Fold[]): void;

		removeFold(fold: Fold): void;

		removeFolds(folds: Fold[]): void;

		expandFold(fold: Fold): void;

		expandFolds(folds: Fold[]): void;

		unfold(location: null | number | Point | Range,
			   expandInner?: boolean): Fold[] | undefined;

		isRowFolded(docRow: number, startFoldRow?: FoldLine): boolean;

		getFoldRowEnd(docRow: number, startFoldRow?: FoldLine): number;

		getFoldRowStart(docRow: number, startFoldRow?: FoldLine): number;

		getFoldDisplayLine(foldLine: FoldLine,
						   endRow: number | null,
						   endColumn: number | null,
						   startRow: number | null,
						   startColumn: number | null): string;

		getDisplayLine(row: number,
					   endColumn: number | null,
					   startRow: number | null,
					   startColumn: number | null): string;

		toggleFold(tryToUnfold?: boolean): void;

		getCommentFoldRange(row: number,
							column: number,
							dir: number): Range | undefined;

		foldAll(startRow?: number, endRow?: number, depth?: number): void;

		setFoldStyle(style: string): void;

		getParentFoldRangeData(row: number, ignoreCurrent?: boolean): {
			range?: Range,
			firstRange: Range
		};

		toggleFoldWidget(toggleParent?: boolean): void;

		updateFoldWidgets(delta: Delta): void;
	}

	export interface Range {
		start: Point;
		end: Point;

		isEqual(range: Range): boolean;

		toString(): string;

		contains(row: number, column: number): boolean;

		compareRange(range: Range): number;

		comparePoint(p: Point): number;

		containsRange(range: Range): boolean;

		intersects(range: Range): boolean;

		isEnd(row: number, column: number): boolean;

		isStart(row: number, column: number): boolean;

		setStart(row: number, column: number): void;

		setEnd(row: number, column: number): void;

		inside(row: number, column: number): boolean;

		insideStart(row: number, column: number): boolean;

		insideEnd(row: number, column: number): boolean;

		compare(row: number, column: number): number;

		compareStart(row: number, column: number): number;

		compareEnd(row: number, column: number): number;

		compareInside(row: number, column: number): number;

		clipRows(firstRow: number, lastRow: number): Range;

		extend(row: number, column: number): Range;

		isEmpty(): boolean;

		isMultiLine(): boolean;

		clone(): Range;

		collapseRows(): Range;

		toScreenRange(session: EditSession): Range;

		moveBy(row: number, column: number): void;
	}

	export interface IRange {
		start: Point;
		end: Point;
	}

	export interface EditSessionOptions {
		wrap: "off" | "free" | "printmargin" | boolean | number;
		wrapMethod: 'code' | 'text' | 'auto';
		indentedSoftWrap: boolean;
		firstLineNumber: number;
		useWorker: boolean;
		useSoftTabs: boolean;
		tabSize: number;
		navigateWithinSoftTabs: boolean;
		foldStyle: 'markbegin' | 'markbeginend' | 'manual';
		overwrite: boolean;
		newLineMode: NewLineMode;
		mode: string;
	}

	export interface VirtualRendererOptions {
		animatedScroll: boolean;
		showInvisibles: boolean;
		showPrintMargin: boolean;
		printMarginColumn: number;
		printMargin: boolean | number;
		showGutter: boolean;
		fadeFoldWidgets: boolean;
		showFoldWidgets: boolean;
		showLineNumbers: boolean;
		displayIndentGuides: boolean;
		highlightIndentGuides: boolean;
		highlightGutterLine: boolean;
		hScrollBarAlwaysVisible: boolean;
		vScrollBarAlwaysVisible: boolean;
		fontSize: number;
		fontFamily: string;
		maxLines: number;
		minLines: number;
		scrollPastEnd: number;
		fixedWidthGutter: boolean;
		customScrollbar: boolean;
		theme: string;
		hasCssTransforms: boolean;
		maxPixelHeight: number;
		useSvgGutterIcons: boolean;
		showFoldedAnnotations: boolean;
	}

	export interface MouseHandlerOptions {
		scrollSpeed: number;
		dragDelay: number;
		dragEnabled: boolean;
		focusTimeout: number;
		tooltipFollowsMouse: boolean;
	}

	export interface EditorOptions extends EditSessionOptions,
		MouseHandlerOptions,
		VirtualRendererOptions {
		selectionStyle: string;
		highlightActiveLine: boolean;
		highlightSelectedWord: boolean;
		readOnly: boolean;
		copyWithEmptySelection: boolean;
		cursorStyle: 'ace' | 'slim' | 'smooth' | 'wide';
		mergeUndoDeltas: true | false | 'always';
		behavioursEnabled: boolean;
		wrapBehavioursEnabled: boolean;
		enableAutoIndent: boolean;
		enableBasicAutocompletion: boolean | Completer[];
		enableLiveAutocompletion: boolean | Completer[];
		liveAutocompletionDelay: number;
		liveAutocompletionThreshold: number;
		enableSnippets: boolean;
		autoScrollEditorIntoView: boolean;
		keyboardHandler: string | null;
		placeholder: string;
		value: string;
		session: EditSession;
		relativeLineNumbers: boolean;
		enableMultiselect: boolean;
		enableKeyboardAccessibility: boolean;
	}

	export interface SearchOptions {
		needle: string | RegExp;
		preventScroll: boolean;
		backwards: boolean;
		start: Range;
		skipCurrent: boolean;
		range: Range;
		preserveCase: boolean;
		regExp: boolean;
		wholeWord: boolean;
		caseSensitive: boolean;
		wrap: boolean;
	}

	export interface EventEmitter {
		once(name: string, callback: Function): void;

		setDefaultHandler(name: string, callback: Function): void;

		removeDefaultHandler(name: string, callback: Function): void;

		on(name: string, callback: Function, capturing?: boolean): void;

		addEventListener(name: string, callback: Function, capturing?: boolean): void;

		off(name: string, callback: Function): void;

		removeListener(name: string, callback: Function): void;

		removeEventListener(name: string, callback: Function): void;

		removeAllListeners(name?: string): void;
	}

	export interface Point {
		row: number;
		column: number;
	}

	export interface Delta {
		action: 'insert' | 'remove';
		start: Point;
		end: Point;
		lines: string[];
	}

	export interface Annotation {
		row?: number;
		column?: number;
		text: string;
		type: string;
	}

	export interface MarkerGroupItem {
		range: Range;
		className: string;
	}

	export class MarkerGroup {
		constructor(session: EditSession);

		setMarkers(markers: MarkerGroupItem[]): void;

		getMarkerAtPosition(pos: Position): MarkerGroupItem;
	}


	export interface Command {
		name?: string;
		bindKey?: string | { mac?: string, win?: string };
		readOnly?: boolean;
		exec: (editor: Editor, args?: any) => void;
	}

	export type CommandLike = Command | ((editor: Editor) => void);

	export interface KeyboardHandler {
		handleKeyboard: Function;
	}

	export interface MarkerLike {
		range?: Range;
		type: string;
		renderer?: MarkerRenderer;
		clazz: string;
		inFront: boolean;
		id: number;
		update?: (html: string[],
				  // TODO maybe define Marker class
				  marker: any,
				  session: EditSession,
				  config: any) => void;
	}

	export type MarkerRenderer = (html: string[],
								  range: Range,
								  left: number,
								  top: number,
								  config: any) => void;

	export interface Token {
		type: string;
		value: string;
		index?: number;
		start?: number;
	}

	interface BaseCompletion {
		score?: number;
		meta?: string;
		caption?: string;
		docHTML?: string;
		docText?: string;
		completerId?: string;
	}

	export interface SnippetCompletion extends BaseCompletion {
		snippet: string;
	}

	export interface ValueCompletion extends BaseCompletion {
		value: string;
	}

	export type Completion = SnippetCompletion | ValueCompletion

	export interface Tokenizer {
		removeCapturingGroups(src: string): string;

		createSplitterRegexp(src: string, flag?: string): RegExp;

		getLineTokens(line: string, startState: string | string[]): Token[];
	}

	interface TokenIterator {
		getCurrentToken(): Token;

		getCurrentTokenColumn(): number;

		getCurrentTokenRow(): number;

		getCurrentTokenPosition(): Point;

		getCurrentTokenRange(): Range;

		stepBackward(): Token;

		stepForward(): Token;
	}

	export type HighlightRule = { defaultToken: string } | { include: string } | { todo: string } | {
		token: string | string[] | ((value: string) => string);
		regex: string | RegExp;
		next?: string;
		push?: string;
		comment?: string;
		caseInsensitive?: boolean;
	}

	export type HighlightRulesMap = Record<string, HighlightRule[]>;

	export type KeywordMapper = (keyword: string) => string;

	export interface HighlightRules {
		addRules(rules: HighlightRulesMap, prefix?: string): void;

		getRules(): HighlightRulesMap;

		embedRules(rules: (new () => HighlightRules) | HighlightRulesMap, prefix: string, escapeRules?: boolean, append?: boolean): void;

		getEmbeds(): string[];

		normalizeRules(): void;

		createKeywordMapper(map: Record<string, string>, defaultToken?: string, ignoreCase?: boolean, splitChar?: string): KeywordMapper;
	}

	export interface FoldMode {
		foldingStartMarker: RegExp;
		foldingStopMarker?: RegExp;

		getFoldWidget(session: EditSession, foldStyle: string, row: number): string;

		getFoldWidgetRange(session: EditSession, foldStyle: string, row: number, forceMultiline?: boolean): Range | undefined;

		indentationBlock(session: EditSession, row: number, column?: number): Range | undefined;

		openingBracketBlock(session: EditSession, bracket: string, row: number, column: number, typeRe?: RegExp): Range | undefined;

		closingBracketBlock(session: EditSession, bracket: string, row: number, column: number, typeRe?: RegExp): Range | undefined;
	}

	type BehaviorAction = (state: string, action: string, editor: Editor, session: EditSession, text: string) => {
		text: string,
		selection: number[]
	} | Range | undefined;
	type BehaviorMap = Record<string, Record<string, BehaviorAction>>;

	export interface Behaviour {
		add(name: string, action: string, callback: BehaviorAction): void;

		addBehaviours(behaviours: BehaviorMap): void;

		remove(name: string): void;

		inherit(mode: SyntaxMode | (new () => SyntaxMode), filter: string[]): void;

		getBehaviours(filter: string[]): BehaviorMap;
	}

	export interface Outdent {
		checkOutdent(line: string, input: string): boolean;

		autoOutdent(doc: Document, row: number): number | undefined;
	}

	export interface SyntaxMode {
		HighlightRules: new () => HighlightRules;
		foldingRules?: FoldMode;
		$behaviour?: Behaviour;
		$defaultBehaviour?: Behaviour;
		lineCommentStart?: string;

		getTokenizer(): Tokenizer;

		toggleCommentLines(state: any,
						   session: EditSession,
						   startRow: number,
						   endRow: number): void;

		toggleBlockComment(state: any,
						   session: EditSession,
						   range: Range,
						   cursor: Point): void;

		getNextLineIndent(state: any, line: string, tab: string): string;

		checkOutdent(state: any, line: string, input: string): boolean;

		autoOutdent(state: any, doc: Document, row: number): void;

		// TODO implement WorkerClient types
		createWorker(session: EditSession): any;

		createModeDelegates(mapping: { [key: string]: string }): void;

		transformAction: BehaviorAction;

		getKeywords(append?: boolean): Array<string | RegExp>;

		getCompletions(state: string,
					   session: EditSession,
					   pos: Point,
					   prefix: string): Completion[];
	}

	type AfterLoadCallback = (err: Error | null, module: unknown) => void;
	type LoaderFunction = (moduleName: string, afterLoad: AfterLoadCallback) => void;

	export interface Config {
		get(key: string): any;

		set(key: string, value: any): void;

		all(): { [key: string]: any };

		moduleUrl(name: string, component?: string): string;

		setModuleUrl(name: string, subst: string): string;

		setLoader(cb: LoaderFunction): void;

		setModuleLoader(name: string, onLoad: Function): void;

		loadModule(moduleName: string | [string, string],
				   onLoad?: (module: any) => void): void;

		init(packaged: any): any;

		defineOptions(obj: any, path: string, options: { [key: string]: any }): Config;

		resetOptions(obj: any): void;

		setDefaultValue(path: string, name: string, value: any): void;

		setDefaultValues(path: string, optionHash: { [key: string]: any }): void;
	}

	export interface OptionsProvider {
		setOptions(optList: { [key: string]: any }): void;

		getOptions(optionNames?: string[] | { [key: string]: any }): { [key: string]: any };

		setOption(name: string, value: any): void;

		getOption(name: string): any;
	}

	export interface UndoManager {
		addSession(session: EditSession): void;

		add(delta: Delta, allowMerge: boolean, session: EditSession): void;

		addSelection(selection: string, rev?: number): void;

		startNewGroup(): void;

		markIgnored(from: number, to?: number): void;

		getSelection(rev: number, after?: boolean): { value: string, rev: number };

		getRevision(): number;

		getDeltas(from: number, to?: number): Delta[];

		undo(session: EditSession, dontSelect?: boolean): void;

		redo(session: EditSession, dontSelect?: boolean): void;

		reset(): void;

		canUndo(): boolean;

		canRedo(): boolean;

		bookmark(rev?: number): void;

		isAtBookmark(): boolean;

		hasUndo(): boolean;

		hasRedo(): boolean;

		isClean(): boolean;

		markClean(rev?: number): void;

		toJSON(): object;

		fromJSON(json: object): void;
	}

	export interface Position {
		row: number,
		column: number
	}

	export interface EditSession extends EventEmitter, OptionsProvider, Folding {
		selection: Selection;

		// TODO: define BackgroundTokenizer

		on(name: 'changeFold',
		   callback: (obj: { data: Fold, action: string }) => void): Function;

		on(name: 'changeScrollLeft', callback: (scrollLeft: number) => void): Function;

		on(name: 'changeScrollTop', callback: (scrollTop: number) => void): Function;

		on(name: 'tokenizerUpdate',
		   callback: (obj: { data: { first: number, last: number } }) => void): Function;

		on(name: 'change', callback: () => void): Function;

		on(name: 'changeTabSize', callback: () => void): Function;


		setOption<T extends keyof EditSessionOptions>(name: T, value: EditSessionOptions[T]): void;

		getOption<T extends keyof EditSessionOptions>(name: T): EditSessionOptions[T];

		readonly doc: Document;

		setDocument(doc: Document): void;

		getDocument(): Document;

		resetCaches(): void;

		setValue(text: string): void;

		getValue(): string;

		getSelection(): Selection;

		getState(row: number): string;

		getTokens(row: number): Token[];

		getTokenAt(row: number, column: number): Token | null;

		setUndoManager(undoManager: UndoManager): void;

		markUndoGroup(): void;

		getUndoManager(): UndoManager;

		getTabString(): string;

		setUseSoftTabs(val: boolean): void;

		getUseSoftTabs(): boolean;

		setTabSize(tabSize: number): void;

		getTabSize(): number;

		isTabStop(position: Position): boolean;

		setNavigateWithinSoftTabs(navigateWithinSoftTabs: boolean): void;

		getNavigateWithinSoftTabs(): boolean;

		setOverwrite(overwrite: boolean): void;

		getOverwrite(): boolean;

		toggleOverwrite(): void;

		addGutterDecoration(row: number, className: string): void;

		removeGutterDecoration(row: number, className: string): void;

		getBreakpoints(): string[];

		setBreakpoints(rows: number[]): void;

		clearBreakpoints(): void;

		setBreakpoint(row: number, className: string): void;

		clearBreakpoint(row: number): void;

		addMarker(range: Range,
				  className: string,
				  type: "fullLine" | "screenLine" | "text" | MarkerRenderer,
				  inFront?: boolean): number;

		addDynamicMarker(marker: MarkerLike, inFront: boolean): MarkerLike;

		removeMarker(markerId: number): void;

		getMarkers(inFront?: boolean): { [id: number]: MarkerLike };

		highlight(re: RegExp): void;

		highlightLines(startRow: number,
					   endRow: number,
					   className: string,
					   inFront?: boolean): Range;

		setAnnotations(annotations: Annotation[]): void;

		getAnnotations(): Annotation[];

		clearAnnotations(): void;

		getWordRange(row: number, column: number): Range;

		getAWordRange(row: number, column: number): Range;

		setNewLineMode(newLineMode: NewLineMode): void;

		getNewLineMode(): NewLineMode;

		setUseWorker(useWorker: boolean): void;

		getUseWorker(): boolean;

		setMode(mode: string | SyntaxMode, callback?: () => void): void;

		getMode(): SyntaxMode;

		setScrollTop(scrollTop: number): void;

		getScrollTop(): number;

		setScrollLeft(scrollLeft: number): void;

		getScrollLeft(): number;

		getScreenWidth(): number;

		getLineWidgetMaxWidth(): number;

		getLine(row: number): string;

		getLines(firstRow: number, lastRow: number): string[];

		getLength(): number;

		getTextRange(range: Range): string;

		insert(position: Position, text: string): void;

		remove(range: Range): void;

		removeFullLines(firstRow: number, lastRow: number): void;

		undoChanges(deltas: Delta[], dontSelect?: boolean): void;

		redoChanges(deltas: Delta[], dontSelect?: boolean): void;

		setUndoSelect(enable: boolean): void;

		replace(range: Range, text: string): void;

		moveText(fromRange: Range, toPosition: Position, copy?: boolean): void;

		indentRows(startRow: number, endRow: number, indentString: string): void;

		outdentRows(range: Range): void;

		moveLinesUp(firstRow: number, lastRow: number): void;

		moveLinesDown(firstRow: number, lastRow: number): void;

		duplicateLines(firstRow: number, lastRow: number): void;

		setUseWrapMode(useWrapMode: boolean): void;

		getUseWrapMode(): boolean;

		setWrapLimitRange(min: number, max: number): void;

		adjustWrapLimit(desiredLimit: number): boolean;

		getWrapLimit(): number;

		setWrapLimit(limit: number): void;

		getWrapLimitRange(): { min: number, max: number };

		getRowLineCount(row: number): number;

		getRowWrapIndent(screenRow: number): number;

		getScreenLastRowColumn(screenRow: number): number;

		getDocumentLastRowColumn(docRow: number, docColumn: number): number;

		getdocumentLastRowColumnPosition(docRow: number, docColumn: number): Position;

		getRowSplitData(row: number): string | undefined;

		getScreenTabSize(screenColumn: number): number;

		screenToDocumentRow(screenRow: number, screenColumn: number): number;

		screenToDocumentColumn(screenRow: number, screenColumn: number): number;

		screenToDocumentPosition(screenRow: number,
								 screenColumn: number,
								 offsetX?: number): Position;

		documentToScreenPosition(docRow: number, docColumn: number): Position;

		documentToScreenPosition(position: Position): Position;

		documentToScreenColumn(row: number, docColumn: number): number;

		documentToScreenRow(docRow: number, docColumn: number): number;

		getScreenLength(): number;

		getPrecedingCharacter(): string;

		toJSON(): Object;

		destroy(): void;
	}

	export interface KeyBinding {
		setDefaultHandler(handler: KeyboardHandler): void;

		setKeyboardHandler(handler: KeyboardHandler): void;

		addKeyboardHandler(handler: KeyboardHandler, pos?: number): void;

		removeKeyboardHandler(handler: KeyboardHandler): boolean;

		getKeyboardHandler(): KeyboardHandler;

		getStatusText(): string;

		onCommandKey(e: any, hashId: number, keyCode: number): boolean;

		onTextInput(text: string): boolean;
	}

	interface CommandMap {
		[name: string]: Command;
	}

	type execEventHandler = (obj: {
		editor: Editor,
		command: Command,
		args: any[]
	}) => void;

	export interface CommandManager extends EventEmitter {
		byName: CommandMap,
		commands: CommandMap,

		on(name: 'exec', callback: execEventHandler): Function;

		on(name: 'afterExec', callback: execEventHandler): Function;

		once(name: string, callback: Function): void;

		setDefaultHandler(name: string, callback: Function): void;

		removeDefaultHandler(name: string, callback: Function): void;

		on(name: string, callback: Function, capturing?: boolean): void;

		addEventListener(name: string, callback: Function, capturing?: boolean): void;

		off(name: string, callback: Function): void;

		removeListener(name: string, callback: Function): void;

		removeEventListener(name: string, callback: Function): void;

		exec(command: string, editor: Editor, args: any): boolean;

		toggleRecording(editor: Editor): void;

		replay(editor: Editor): void;

		addCommand(command: Command): void;

		addCommands(command: Command[]): void;

		removeCommand(command: Command | string, keepCommand?: boolean): void;

		removeCommands(command: Command[]): void;

		bindKey(key: string | { mac?: string, win?: string },
				command: CommandLike,
				position?: number): void;

		bindKeys(keys: { [s: string]: Function }): void;

		parseKeys(keyPart: string): { key: string, hashId: number };

		findKeyCommand(hashId: number, keyString: string): string | undefined;

		handleKeyboard(data: {}, hashId: number, keyString: string, keyCode: string | number): void | {
			command: string
		};

		getStatusText(editor: Editor, data: {}): string;
	}

	export interface VirtualRenderer extends OptionsProvider, EventEmitter {
		readonly container: HTMLElement;
		readonly scroller: HTMLElement;
		readonly content: HTMLElement;
		readonly characterWidth: number;
		readonly lineHeight: number;
		readonly scrollLeft: number;
		readonly scrollTop: number;
		readonly $padding: number;

		setOption<T extends keyof VirtualRendererOptions>(name: T, value: VirtualRendererOptions[T]): void;

		getOption<T extends keyof VirtualRendererOptions>(name: T): VirtualRendererOptions[T];

		setSession(session: EditSession): void;

		updateLines(firstRow: number, lastRow: number, force?: boolean): void;

		updateText(): void;

		updateFull(force?: boolean): void;

		updateFontSize(): void;

		adjustWrapLimit(): boolean;

		setAnimatedScroll(shouldAnimate: boolean): void;

		getAnimatedScroll(): boolean;

		setShowInvisibles(showInvisibles: boolean): void;

		getShowInvisibles(): boolean;

		setDisplayIndentGuides(display: boolean): void;

		getDisplayIndentGuides(): boolean;

		setShowPrintMargin(showPrintMargin: boolean): void;

		getShowPrintMargin(): boolean;

		setPrintMarginColumn(showPrintMargin: boolean): void;

		getPrintMarginColumn(): boolean;

		setShowGutter(show: boolean): void;

		getShowGutter(): boolean;

		setFadeFoldWidgets(show: boolean): void;

		getFadeFoldWidgets(): boolean;

		setHighlightGutterLine(shouldHighlight: boolean): void;

		getHighlightGutterLine(): boolean;

		getContainerElement(): HTMLElement;

		getMouseEventTarget(): HTMLElement;

		getTextAreaContainer(): HTMLElement;

		getFirstVisibleRow(): number;

		getFirstFullyVisibleRow(): number;

		getLastFullyVisibleRow(): number;

		getLastVisibleRow(): number;

		setPadding(padding: number): void;

		setScrollMargin(top: number,
						bottom: number,
						left: number,
						right: number): void;

		setHScrollBarAlwaysVisible(alwaysVisible: boolean): void;

		getHScrollBarAlwaysVisible(): boolean;

		setVScrollBarAlwaysVisible(alwaysVisible: boolean): void;

		getVScrollBarAlwaysVisible(): boolean;

		freeze(): void;

		unfreeze(): void;

		updateFrontMarkers(): void;

		updateBackMarkers(): void;

		updateBreakpoints(): void;

		setAnnotations(annotations: Annotation[]): void;

		updateCursor(): void;

		hideCursor(): void;

		showCursor(): void;

		scrollSelectionIntoView(anchor: Position,
								lead: Position,
								offset?: number): void;

		scrollCursorIntoView(cursor: Position, offset?: number): void;

		getScrollTop(): number;

		getScrollLeft(): number;

		getScrollTopRow(): number;

		getScrollBottomRow(): number;

		scrollToRow(row: number): void;

		alignCursor(cursor: Position | number, alignment: number): number;

		scrollToLine(line: number,
					 center: boolean,
					 animate: boolean,
					 callback: () => void): void;

		animateScrolling(fromValue: number, callback: () => void): void;

		scrollToY(scrollTop: number): void;

		scrollToX(scrollLeft: number): void;

		scrollTo(x: number, y: number): void;

		scrollBy(deltaX: number, deltaY: number): void;

		isScrollableBy(deltaX: number, deltaY: number): boolean;

		textToScreenCoordinates(row: number, column: number): { pageX: number, pageY: number };

		pixelToScreenCoordinates(x: number, y: number): { row: number, column: number, side: 1 | -1, offsetX: number };

		visualizeFocus(): void;

		visualizeBlur(): void;

		showComposition(position: number): void;

		setCompositionText(text: string): void;

		hideComposition(): void;

		setGhostText(text: string, position: Point): void;

		removeGhostText(): void;

		setTheme(theme: string, callback?: () => void): void;

		getTheme(): string;

		setStyle(style: string, include?: boolean): void;

		unsetStyle(style: string): void;

		setCursorStyle(style: string): void;

		setMouseCursor(cursorStyle: string): void;

		attachToShadowRoot(): void;

		destroy(): void;
	}


	export interface Selection extends EventEmitter {
		moveCursorWordLeft(): void;

		moveCursorWordRight(): void;

		fromOrientedRange(range: Range): void;

		setSelectionRange(match: any): void;

		getAllRanges(): Range[];

		addRange(range: Range): void;

		isEmpty(): boolean;

		isMultiLine(): boolean;

		setCursor(row: number, column: number): void;

		setAnchor(row: number, column: number): void;

		getAnchor(): Position;

		getCursor(): Position;

		isBackwards(): boolean;

		getRange(): Range;

		clearSelection(): void;

		selectAll(): void;

		setRange(range: Range, reverse?: boolean): void;

		selectTo(row: number, column: number): void;

		selectToPosition(pos: any): void;

		selectUp(): void;

		selectDown(): void;

		selectRight(): void;

		selectLeft(): void;

		selectLineStart(): void;

		selectLineEnd(): void;

		selectFileEnd(): void;

		selectFileStart(): void;

		selectWordRight(): void;

		selectWordLeft(): void;

		getWordRange(): void;

		selectWord(): void;

		selectAWord(): void;

		selectLine(): void;

		moveCursorUp(): void;

		moveCursorDown(): void;

		moveCursorLeft(): void;

		moveCursorRight(): void;

		moveCursorLineStart(): void;

		moveCursorLineEnd(): void;

		moveCursorFileEnd(): void;

		moveCursorFileStart(): void;

		moveCursorLongWordRight(): void;

		moveCursorLongWordLeft(): void;

		moveCursorBy(rows: number, chars: number): void;

		moveCursorToPosition(position: any): void;

		moveCursorTo(row: number, column: number, keepDesiredColumn?: boolean): void;

		moveCursorToScreen(row: number, column: number, keepDesiredColumn: boolean): void;

		toJSON(): SavedSelection | SavedSelection[];

		fromJSON(selection: SavedSelection | SavedSelection[]): void;
	}

	interface SavedSelection {
		start: Point;
		end: Point;
		isBackwards: boolean;
	}

	var Selection: {
		new(session: EditSession): Selection;
	}

	export interface TextInput {
		resetSelection(): void;

		setAriaOption(activeDescendant: string, role: string): void;
	}

	export interface Editor extends OptionsProvider, EventEmitter {
		container: HTMLElement;
		renderer: VirtualRenderer;
		id: string;
		commands: CommandManager;
		keyBinding: KeyBinding;
		session: EditSession;
		selection: Selection;
		textInput: TextInput;

		on(name: 'blur', callback: (e: Event) => void): void;

		on(name: 'input', callback: () => void): void;

		on(name: 'change', callback: (delta: Delta) => void): void;

		on(name: 'changeSelectionStyle', callback: (obj: { data: string }) => void): void;

		on(name: 'changeSession',
		   callback: (obj: { session: EditSession, oldSession: EditSession }) => void): void;

		on(name: 'copy', callback: (obj: { text: string }) => void): void;

		on(name: 'focus', callback: (e: Event) => void): void;

		on(name: 'paste', callback: (obj: { text: string }) => void): void;

		on(name: 'mousemove', callback: (e: any) => void): void;

		on(name: 'mouseup', callback: (e: any) => void): void;

		on(name: 'mousewheel', callback: (e: any) => void): void;

		on(name: 'click', callback: (e: any) => void): void;

		on(name: 'guttermousedown', callback: (e: any) => void): void;

		on(name: 'gutterkeydown', callback: (e: any) => void): void;

		onPaste(text: string, event: any): void;

		setOption<T extends keyof EditorOptions>(name: T, value: EditorOptions[T]): void;

		getOption<T extends keyof EditorOptions>(name: T): EditorOptions[T];

		setKeyboardHandler(keyboardHandler: string, callback?: () => void): void;

		setKeyboardHandler(keyboardHandler: KeyboardHandler | null): void;

		getKeyboardHandler(): string;

		setSession(session: EditSession | undefined): void;

		getSession(): EditSession;

		setValue(val: string, cursorPos?: number): string;

		getValue(): string;

		getSelection(): Selection;

		resize(force?: boolean): void;

		setTheme(theme: string, callback?: () => void): void;

		getTheme(): string;

		setStyle(style: string): void;

		unsetStyle(style: string): void;

		getFontSize(): string;

		setFontSize(size: number | string): void;

		focus(): void;

		isFocused(): boolean;

		blur(): void;

		getSelectedText(): string;

		getCopyText(): string;

		execCommand(command: string | string[], args?: any): boolean;

		insert(text: string, pasted?: boolean): void;

		setOverwrite(overwrite: boolean): void;

		getOverwrite(): boolean;

		toggleOverwrite(): void;

		setScrollSpeed(speed: number): void;

		getScrollSpeed(): number;

		setDragDelay(dragDelay: number): void;

		getDragDelay(): number;

		setSelectionStyle(val: string): void;

		getSelectionStyle(): string;

		setHighlightActiveLine(shouldHighlight: boolean): void;

		getHighlightActiveLine(): boolean;

		setHighlightGutterLine(shouldHighlight: boolean): void;

		getHighlightGutterLine(): boolean;

		setHighlightSelectedWord(shouldHighlight: boolean): void;

		getHighlightSelectedWord(): boolean;

		setAnimatedScroll(shouldAnimate: boolean): void;

		getAnimatedScroll(): boolean;

		setShowInvisibles(showInvisibles: boolean): void;

		getShowInvisibles(): boolean;

		setDisplayIndentGuides(display: boolean): void;

		getDisplayIndentGuides(): boolean;

		setShowPrintMargin(showPrintMargin: boolean): void;

		getShowPrintMargin(): boolean;

		setPrintMarginColumn(showPrintMargin: number): void;

		getPrintMarginColumn(): number;

		setReadOnly(readOnly: boolean): void;

		getReadOnly(): boolean;

		setBehavioursEnabled(enabled: boolean): void;

		getBehavioursEnabled(): boolean;

		setWrapBehavioursEnabled(enabled: boolean): void;

		getWrapBehavioursEnabled(): boolean;

		setShowFoldWidgets(show: boolean): void;

		getShowFoldWidgets(): boolean;

		setFadeFoldWidgets(fade: boolean): void;

		getFadeFoldWidgets(): boolean;

		remove(dir?: 'left' | 'right'): void;

		removeWordRight(): void;

		removeWordLeft(): void;

		removeLineToEnd(): void;

		splitLine(): void;

		setGhostText(text: string, position: Point): void;

		removeGhostText(): void;

		transposeLetters(): void;

		toLowerCase(): void;

		toUpperCase(): void;

		indent(): void;

		blockIndent(): void;

		blockOutdent(): void;

		sortLines(): void;

		toggleCommentLines(): void;

		toggleBlockComment(): void;

		modifyNumber(amount: number): void;

		removeLines(): void;

		duplicateSelection(): void;

		moveLinesDown(): void;

		moveLinesUp(): void;

		moveText(range: Range, toPosition: Point, copy?: boolean): Range;

		copyLinesUp(): void;

		copyLinesDown(): void;

		getFirstVisibleRow(): number;

		getLastVisibleRow(): number;

		isRowVisible(row: number): boolean;

		isRowFullyVisible(row: number): boolean;

		selectPageDown(): void;

		selectPageUp(): void;

		gotoPageDown(): void;

		gotoPageUp(): void;

		scrollPageDown(): void;

		scrollPageUp(): void;

		scrollToRow(row: number): void;

		scrollToLine(line: number, center: boolean, animate: boolean, callback: () => void): void;

		centerSelection(): void;

		getCursorPosition(): Point;

		getCursorPositionScreen(): Point;

		getSelectionRange(): Range;

		selectAll(): void;

		clearSelection(): void;

		moveCursorTo(row: number, column: number): void;

		moveCursorToPosition(pos: Point): void;

		jumpToMatching(select: boolean, expand: boolean): void;

		gotoLine(lineNumber: number, column: number, animate: boolean): void;

		navigateTo(row: number, column: number): void;

		navigateUp(times?: number): void;

		navigateDown(times?: number): void;

		navigateLeft(times?: number): void;

		navigateRight(times?: number): void;

		navigateLineStart(): void;

		navigateLineEnd(): void;

		navigateFileEnd(): void;

		navigateFileStart(): void;

		navigateWordRight(): void;

		navigateWordLeft(): void;

		replace(replacement: string, options?: Partial<SearchOptions>): number;

		replaceAll(replacement: string, options?: Partial<SearchOptions>): number;

		getLastSearchOptions(): Partial<SearchOptions>;

		find(needle: string | RegExp, options?: Partial<SearchOptions>, animate?: boolean): Ace.Range | undefined;

		findNext(options?: Partial<SearchOptions>, animate?: boolean): void;

		findPrevious(options?: Partial<SearchOptions>, animate?: boolean): void;

		findAll(needle: string | RegExp, options?: Partial<SearchOptions>, additive?: boolean): number;

		undo(): void;

		redo(): void;

		destroy(): void;

		setAutoScrollEditorIntoView(enable: boolean): void;

		completers: Completer[];
	}

	type CompleterCallback = (error: any, completions: Completion[]) => void;

	interface Completer {
		identifierRegexps?: Array<RegExp>,

		getCompletions(editor: Editor,
					   session: EditSession,
					   position: Point,
					   prefix: string,
					   callback: CompleterCallback): void;

		getDocTooltip?(item: Completion): undefined | string | Completion;

		onSeen?: (editor: Ace.Editor, completion: Completion) => void;
		onInsert?: (editor: Ace.Editor, completion: Completion) => void;

		cancel?(): void;

		id?: string;
		triggerCharacters?: string[];
		hideInlinePreview?: boolean;
	}

	export class AceInline {
		show(editor: Editor, completion: Completion, prefix: string): void;

		isOpen(): void;

		hide(): void;

		destroy(): void;
	}

	interface CompletionOptions {
		matches?: Completion[];
	}

	type CompletionProviderOptions = {
		exactMatch?: boolean;
		ignoreCaption?: boolean;
	}

	type CompletionRecord = {
		all: Completion[];
		filtered: Completion[];
		filterText: string;
	} | CompletionProviderOptions

	type GatherCompletionRecord = {
		prefix: string;
		matches: Completion[];
		finished: boolean;
	}

	type CompletionCallbackFunction = (err: Error | undefined, data: GatherCompletionRecord) => void;
	type CompletionProviderCallback = (err: Error | undefined, completions: CompletionRecord, finished: boolean) => void;

	export class CompletionProvider {
		insertByIndex(editor: Editor, index: number, options: CompletionProviderOptions): boolean;

		insertMatch(editor: Editor, data: Completion, options: CompletionProviderOptions): boolean;

		completions: CompletionRecord;

		gatherCompletions(editor: Editor, callback: CompletionCallbackFunction): boolean;

		provideCompletions(editor: Editor, options: CompletionProviderOptions, callback: CompletionProviderCallback): void;

		detach(): void;
	}

	export class Autocomplete {
		constructor();

		autoInsert?: boolean;
		autoSelect?: boolean;
		autoShown?: boolean;
		exactMatch?: boolean;
		inlineEnabled?: boolean;
		parentNode?: HTMLElement;
		setSelectOnHover?: Boolean;
		stickySelectionDelay?: Number;
		ignoreCaption?: Boolean;
		showLoadingState?: Boolean;

		emptyMessage?(prefix: String): String;

		getPopup(): AcePopup;

		showPopup(editor: Editor, options: CompletionOptions): void;

		detach(): void;

		destroy(): void;
	}

	type AcePopupNavigation = "up" | "down" | "start" | "end";

	export class AcePopup {
		constructor(parentNode: HTMLElement);

		setData(list: Completion[], filterText: string): void;

		getData(row: number): Completion;

		getRow(): number;
		getRow(line: number): void;

		hide(): void;

		show(pos: Point, lineHeight: number, topdownOnly: boolean): void;

		tryShow(pos: Point, lineHeight: number, anchor: "top" | "bottom" | undefined, forceShow?: boolean): boolean;

		goTo(where: AcePopupNavigation): void;
	}
}


export const version: string;
export const config: Ace.Config;

export function require(name: string): any;

export function edit(el: Element | string, options?: Partial<Ace.EditorOptions>): Ace.Editor;

export function createEditSession(text: Ace.Document | string, mode: Ace.SyntaxMode): Ace.EditSession;

export const VirtualRenderer: {
	new(container: HTMLElement, theme?: string): Ace.VirtualRenderer;
};
export const EditSession: {
	new(text: string | Ace.Document, mode?: Ace.SyntaxMode): Ace.EditSession;
};
export const UndoManager: {
	new(): Ace.UndoManager;
};
export const Editor: {
	new(renderer: Ace.VirtualRenderer, session?: Ace.EditSession, options?: Partial<Ace.EditorOptions>): Ace.Editor;
};
export const Range: {
	new(startRow: number, startColumn: number, endRow: number, endColumn: number): Ace.Range;
	fromPoints(start: Ace.Point, end: Ace.Point): Ace.Range;
	comparePoints(p1: Ace.Point, p2: Ace.Point): number;
};


type InlineAutocompleteAction = "prev" | "next" | "first" | "last";

type TooltipCommandFunction<T> = (editor: Ace.Editor) => T;

interface TooltipCommand extends Ace.Command {
	enabled: TooltipCommandFunction<boolean> | boolean,
	getValue?: TooltipCommandFunction<any>,
	type: "button" | "text" | "checkbox"
	iconCssClass: string,
	cssClass: string
}
