declare module monaco {

    interface Thenable<T> {
        /**
         * Attaches callbacks for the resolution and/or rejection of the Promise.
         * @param onfulfilled The callback to execute when the Promise is resolved.
         * @param onrejected The callback to execute when the Promise is rejected.
         * @returns A Promise for the completion of which ever callback is executed.
         */
        then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Thenable<TResult>;
        then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Thenable<TResult>;
    }

    export interface IDisposable {
        dispose(): void;
    }

    export interface IEvent<T> {
        (listener: (e: T) => any, thisArg?: any): IDisposable;
    }

    /**
     * A helper that allows to emit and listen to typed events
     */
    export class Emitter<T> {
        constructor();
        readonly event: IEvent<T>;
        fire(event?: T): void;
        dispose(): void;
    }

    export enum Severity {
        Ignore = 0,
        Info = 1,
        Warning = 2,
        Error = 3,
    }



    /**
     * The value callback to complete a promise
     */
    export interface TValueCallback<T> {
        (value: T): void;
    }


    export interface ProgressCallback {
        (progress: any): any;
    }


    /**
     * A Promise implementation that supports progress and cancelation.
     */
    export class Promise<V> {

        constructor(init: (complete: TValueCallback<V>, error: (err: any) => void, progress: ProgressCallback) => void, oncancel?: any);

        public then<U>(success?: (value: V) => Promise<U>, error?: (err: any) => Promise<U>, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => Promise<U>, error?: (err: any) => Promise<U> | U, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => Promise<U>, error?: (err: any) => U, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => Promise<U>, error?: (err: any) => void, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => Promise<U> | U, error?: (err: any) => Promise<U>, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => Promise<U> | U, error?: (err: any) => Promise<U> | U, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => Promise<U> | U, error?: (err: any) => U, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => Promise<U> | U, error?: (err: any) => void, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => U, error?: (err: any) => Promise<U>, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => U, error?: (err: any) => Promise<U> | U, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => U, error?: (err: any) => U, progress?: ProgressCallback): Promise<U>;
        public then<U>(success?: (value: V) => U, error?: (err: any) => void, progress?: ProgressCallback): Promise<U>;

        public done(success?: (value: V) => void, error?: (err: any) => any, progress?: ProgressCallback): void;
        public cancel(): void;

        public static as(value: null): Promise<null>;
        public static as(value: undefined): Promise<undefined>;
        public static as<ValueType>(value: Promise<ValueType>): Promise<ValueType>;
        public static as<ValueType>(value: Thenable<ValueType>): Thenable<ValueType>;
        public static as<ValueType>(value: ValueType): Promise<ValueType>;

        public static is(value: any): value is Thenable<any>;
        public static timeout(delay: number): Promise<void>;
        public static join<ValueType>(promises: Promise<ValueType>[]): Promise<ValueType[]>;
        public static join<ValueType>(promises: Thenable<ValueType>[]): Thenable<ValueType[]>;
        public static join<ValueType>(promises: { [n: string]: Promise<ValueType> }): Promise<{ [n: string]: ValueType }>;
        public static any<ValueType>(promises: Promise<ValueType>[]): Promise<{ key: string; value: Promise<ValueType>; }>;

        public static wrap<ValueType>(value: Thenable<ValueType>): Promise<ValueType>;
        public static wrap<ValueType>(value: ValueType): Promise<ValueType>;

        public static wrapError<ValueType>(error: any): Promise<ValueType>;
    }

    export class CancellationTokenSource {
        readonly token: CancellationToken;
        cancel(): void;
        dispose(): void;
    }

    export interface CancellationToken {
        readonly isCancellationRequested: boolean;
        /**
         * An event emitted when cancellation is requested
         * @event
         */
        readonly onCancellationRequested: IEvent<any>;
    }
    /**
     * Uniform Resource Identifier (Uri) http://tools.ietf.org/html/rfc3986.
     * This class is a simple parser which creates the basic component paths
     * (http://tools.ietf.org/html/rfc3986#section-3) with minimal validation
     * and encoding.
     *
     *       foo://example.com:8042/over/there?name=ferret#nose
     *       \_/   \______________/\_________/ \_________/ \__/
     *        |           |            |            |        |
     *     scheme     authority       path        query   fragment
     *        |   _____________________|__
     *       / \ /                        \
     *       urn:example:animal:ferret:nose
     *
     *
     */
    export class Uri {
        static isUri(thing: any): thing is Uri;
        protected constructor();
        /**
         * scheme is the 'http' part of 'http://www.msft.com/some/path?query#fragment'.
         * The part before the first colon.
         */
        readonly scheme: string;
        /**
         * authority is the 'www.msft.com' part of 'http://www.msft.com/some/path?query#fragment'.
         * The part between the first double slashes and the next slash.
         */
        readonly authority: string;
        /**
         * path is the '/some/path' part of 'http://www.msft.com/some/path?query#fragment'.
         */
        readonly path: string;
        /**
         * query is the 'query' part of 'http://www.msft.com/some/path?query#fragment'.
         */
        readonly query: string;
        /**
         * fragment is the 'fragment' part of 'http://www.msft.com/some/path?query#fragment'.
         */
        readonly fragment: string;
        /**
         * Returns a string representing the corresponding file system path of this Uri.
         * Will handle UNC paths and normalize windows drive letters to lower-case. Also
         * uses the platform specific path separator. Will *not* validate the path for
         * invalid characters and semantics. Will *not* look at the scheme of this Uri.
         */
        readonly fsPath: string;
        with(change: {
            scheme?: string;
            authority?: string;
            path?: string;
            query?: string;
            fragment?: string;
        }): Uri;
        static parse(value: string): Uri;
        static file(path: string): Uri;
        static from(components: {
            scheme?: string;
            authority?: string;
            path?: string;
            query?: string;
            fragment?: string;
        }): Uri;
        /**
         *
         * @param skipEncoding Do not encode the result, default is `false`
         */
        toString(skipEncoding?: boolean): string;
        toJSON(): any;
        static revive(data: any): Uri;
    }

    /**
     * Virtual Key Codes, the value does not hold any inherent meaning.
     * Inspired somewhat from https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
     * But these are "more general", as they should work across browsers & OS`s.
     */
    export enum KeyCode {
        /**
         * Placed first to cover the 0 value of the enum.
         */
        Unknown = 0,
        Backspace = 1,
        Tab = 2,
        Enter = 3,
        Shift = 4,
        Ctrl = 5,
        Alt = 6,
        PauseBreak = 7,
        CapsLock = 8,
        Escape = 9,
        Space = 10,
        PageUp = 11,
        PageDown = 12,
        End = 13,
        Home = 14,
        LeftArrow = 15,
        UpArrow = 16,
        RightArrow = 17,
        DownArrow = 18,
        Insert = 19,
        Delete = 20,
        KEY_0 = 21,
        KEY_1 = 22,
        KEY_2 = 23,
        KEY_3 = 24,
        KEY_4 = 25,
        KEY_5 = 26,
        KEY_6 = 27,
        KEY_7 = 28,
        KEY_8 = 29,
        KEY_9 = 30,
        KEY_A = 31,
        KEY_B = 32,
        KEY_C = 33,
        KEY_D = 34,
        KEY_E = 35,
        KEY_F = 36,
        KEY_G = 37,
        KEY_H = 38,
        KEY_I = 39,
        KEY_J = 40,
        KEY_K = 41,
        KEY_L = 42,
        KEY_M = 43,
        KEY_N = 44,
        KEY_O = 45,
        KEY_P = 46,
        KEY_Q = 47,
        KEY_R = 48,
        KEY_S = 49,
        KEY_T = 50,
        KEY_U = 51,
        KEY_V = 52,
        KEY_W = 53,
        KEY_X = 54,
        KEY_Y = 55,
        KEY_Z = 56,
        Meta = 57,
        ContextMenu = 58,
        F1 = 59,
        F2 = 60,
        F3 = 61,
        F4 = 62,
        F5 = 63,
        F6 = 64,
        F7 = 65,
        F8 = 66,
        F9 = 67,
        F10 = 68,
        F11 = 69,
        F12 = 70,
        F13 = 71,
        F14 = 72,
        F15 = 73,
        F16 = 74,
        F17 = 75,
        F18 = 76,
        F19 = 77,
        NumLock = 78,
        ScrollLock = 79,
        /**
         * Used for miscellaneous characters; it can vary by keyboard.
         * For the US standard keyboard, the ';:' key
         */
        US_SEMICOLON = 80,
        /**
         * For any country/region, the '+' key
         * For the US standard keyboard, the '=+' key
         */
        US_EQUAL = 81,
        /**
         * For any country/region, the ',' key
         * For the US standard keyboard, the ',<' key
         */
        US_COMMA = 82,
        /**
         * For any country/region, the '-' key
         * For the US standard keyboard, the '-_' key
         */
        US_MINUS = 83,
        /**
         * For any country/region, the '.' key
         * For the US standard keyboard, the '.>' key
         */
        US_DOT = 84,
        /**
         * Used for miscellaneous characters; it can vary by keyboard.
         * For the US standard keyboard, the '/?' key
         */
        US_SLASH = 85,
        /**
         * Used for miscellaneous characters; it can vary by keyboard.
         * For the US standard keyboard, the '`~' key
         */
        US_BACKTICK = 86,
        /**
         * Used for miscellaneous characters; it can vary by keyboard.
         * For the US standard keyboard, the '[{' key
         */
        US_OPEN_SQUARE_BRACKET = 87,
        /**
         * Used for miscellaneous characters; it can vary by keyboard.
         * For the US standard keyboard, the '\|' key
         */
        US_BACKSLASH = 88,
        /**
         * Used for miscellaneous characters; it can vary by keyboard.
         * For the US standard keyboard, the ']}' key
         */
        US_CLOSE_SQUARE_BRACKET = 89,
        /**
         * Used for miscellaneous characters; it can vary by keyboard.
         * For the US standard keyboard, the ''"' key
         */
        US_QUOTE = 90,
        /**
         * Used for miscellaneous characters; it can vary by keyboard.
         */
        OEM_8 = 91,
        /**
         * Either the angle bracket key or the backslash key on the RT 102-key keyboard.
         */
        OEM_102 = 92,
        NUMPAD_0 = 93,
        NUMPAD_1 = 94,
        NUMPAD_2 = 95,
        NUMPAD_3 = 96,
        NUMPAD_4 = 97,
        NUMPAD_5 = 98,
        NUMPAD_6 = 99,
        NUMPAD_7 = 100,
        NUMPAD_8 = 101,
        NUMPAD_9 = 102,
        NUMPAD_MULTIPLY = 103,
        NUMPAD_ADD = 104,
        NUMPAD_SEPARATOR = 105,
        NUMPAD_SUBTRACT = 106,
        NUMPAD_DECIMAL = 107,
        NUMPAD_DIVIDE = 108,
        /**
         * Placed last to cover the length of the enum.
         * Please do not depend on this value!
         */
        MAX_VALUE = 109,
    }

    export class KeyMod {
        static readonly CtrlCmd: number;
        static readonly Shift: number;
        static readonly Alt: number;
        static readonly WinCtrl: number;
        static chord(firstPart: number, secondPart: number): number;
    }

    export class Keybinding {
        value: number;
        constructor(keybinding: number);
        equals(other: Keybinding): boolean;
        hasCtrlCmd(): boolean;
        hasShift(): boolean;
        hasAlt(): boolean;
        hasWinCtrl(): boolean;
        isModifierKey(): boolean;
        getKeyCode(): KeyCode;
    }
    /**
     * MarkedString can be used to render human readable text. It is either a markdown string
     * or a code-block that provides a language and a code snippet. Note that
     * markdown strings will be sanitized - that means html will be escaped.
     */
    export type MarkedString = string | {
        readonly language: string;
        readonly value: string;
    };

    export interface IKeyboardEvent {
        readonly browserEvent: KeyboardEvent;
        readonly target: HTMLElement;
        readonly ctrlKey: boolean;
        readonly shiftKey: boolean;
        readonly altKey: boolean;
        readonly metaKey: boolean;
        readonly keyCode: KeyCode;
        toKeybinding(): Keybinding;
        equals(keybinding: number): boolean;
        preventDefault(): void;
        stopPropagation(): void;
    }
    export interface IMouseEvent {
        readonly browserEvent: MouseEvent;
        readonly leftButton: boolean;
        readonly middleButton: boolean;
        readonly rightButton: boolean;
        readonly target: HTMLElement;
        readonly detail: number;
        readonly posx: number;
        readonly posy: number;
        readonly ctrlKey: boolean;
        readonly shiftKey: boolean;
        readonly altKey: boolean;
        readonly metaKey: boolean;
        readonly timestamp: number;
        preventDefault(): void;
        stopPropagation(): void;
    }

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

    /**
     * A position in the editor. This interface is suitable for serialization.
     */
    export interface IPosition {
        /**
         * line number (starts at 1)
         */
        readonly lineNumber: number;
        /**
         * column (the first character in a line is between column 1 and column 2)
         */
        readonly column: number;
    }

    /**
     * A range in the editor. This interface is suitable for serialization.
     */
    export interface IRange {
        /**
         * Line number on which the range starts (starts at 1).
         */
        readonly startLineNumber: number;
        /**
         * Column on which the range starts in line `startLineNumber` (starts at 1).
         */
        readonly startColumn: number;
        /**
         * Line number on which the range ends.
         */
        readonly endLineNumber: number;
        /**
         * Column on which the range ends in line `endLineNumber`.
         */
        readonly endColumn: number;
    }

    /**
     * A selection in the editor.
     * The selection is a range that has an orientation.
     */
    export interface ISelection {
        /**
         * The line number on which the selection has started.
         */
        readonly selectionStartLineNumber: number;
        /**
         * The column on `selectionStartLineNumber` where the selection has started.
         */
        readonly selectionStartColumn: number;
        /**
         * The line number on which the selection has ended.
         */
        readonly positionLineNumber: number;
        /**
         * The column on `positionLineNumber` where the selection has ended.
         */
        readonly positionColumn: number;
    }

    /**
     * A position in the editor.
     */
    export class Position {
        /**
         * line number (starts at 1)
         */
        readonly lineNumber: number;
        /**
         * column (the first character in a line is between column 1 and column 2)
         */
        readonly column: number;
        constructor(lineNumber: number, column: number);
        /**
         * Test if this position equals other position
         */
        equals(other: IPosition): boolean;
        /**
         * Test if position `a` equals position `b`
         */
        static equals(a: IPosition, b: IPosition): boolean;
        /**
         * Test if this position is before other position.
         * If the two positions are equal, the result will be false.
         */
        isBefore(other: IPosition): boolean;
        /**
         * Test if position `a` is before position `b`.
         * If the two positions are equal, the result will be false.
         */
        static isBefore(a: IPosition, b: IPosition): boolean;
        /**
         * Test if this position is before other position.
         * If the two positions are equal, the result will be true.
         */
        isBeforeOrEqual(other: IPosition): boolean;
        /**
         * Test if position `a` is before position `b`.
         * If the two positions are equal, the result will be true.
         */
        static isBeforeOrEqual(a: IPosition, b: IPosition): boolean;
        /**
         * A function that compares positions, useful for sorting
         */
        static compare(a: IPosition, b: IPosition): number;
        /**
         * Clone this position.
         */
        clone(): Position;
        /**
         * Convert to a human-readable representation.
         */
        toString(): string;
        /**
         * Create a `Position` from an `IPosition`.
         */
        static lift(pos: IPosition): Position;
        /**
         * Test if `obj` is an `IPosition`.
         */
        static isIPosition(obj: any): obj is IPosition;
    }

    /**
     * A range in the editor. (startLineNumber,startColumn) is <= (endLineNumber,endColumn)
     */
    export class Range {
        /**
         * Line number on which the range starts (starts at 1).
         */
        readonly startLineNumber: number;
        /**
         * Column on which the range starts in line `startLineNumber` (starts at 1).
         */
        readonly startColumn: number;
        /**
         * Line number on which the range ends.
         */
        readonly endLineNumber: number;
        /**
         * Column on which the range ends in line `endLineNumber`.
         */
        readonly endColumn: number;
        constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number);
        /**
         * Test if this range is empty.
         */
        isEmpty(): boolean;
        /**
         * Test if `range` is empty.
         */
        static isEmpty(range: IRange): boolean;
        /**
         * Test if position is in this range. If the position is at the edges, will return true.
         */
        containsPosition(position: IPosition): boolean;
        /**
         * Test if `position` is in `range`. If the position is at the edges, will return true.
         */
        static containsPosition(range: IRange, position: IPosition): boolean;
        /**
         * Test if range is in this range. If the range is equal to this range, will return true.
         */
        containsRange(range: IRange): boolean;
        /**
         * Test if `otherRange` is in `range`. If the ranges are equal, will return true.
         */
        static containsRange(range: IRange, otherRange: IRange): boolean;
        /**
         * A reunion of the two ranges.
         * The smallest position will be used as the start point, and the largest one as the end point.
         */
        plusRange(range: IRange): Range;
        /**
         * A reunion of the two ranges.
         * The smallest position will be used as the start point, and the largest one as the end point.
         */
        static plusRange(a: IRange, b: IRange): Range;
        /**
         * A intersection of the two ranges.
         */
        intersectRanges(range: IRange): Range;
        /**
         * A intersection of the two ranges.
         */
        static intersectRanges(a: IRange, b: IRange): Range;
        /**
         * Test if this range equals other.
         */
        equalsRange(other: IRange): boolean;
        /**
         * Test if range `a` equals `b`.
         */
        static equalsRange(a: IRange, b: IRange): boolean;
        /**
         * Return the end position (which will be after or equal to the start position)
         */
        getEndPosition(): Position;
        /**
         * Return the start position (which will be before or equal to the end position)
         */
        getStartPosition(): Position;
        /**
         * Clone this range.
         */
        cloneRange(): Range;
        /**
         * Transform to a user presentable string representation.
         */
        toString(): string;
        /**
         * Create a new range using this range's start position, and using endLineNumber and endColumn as the end position.
         */
        setEndPosition(endLineNumber: number, endColumn: number): Range;
        /**
         * Create a new range using this range's end position, and using startLineNumber and startColumn as the start position.
         */
        setStartPosition(startLineNumber: number, startColumn: number): Range;
        /**
         * Create a new empty range using this range's start position.
         */
        collapseToStart(): Range;
        /**
         * Create a new empty range using this range's start position.
         */
        static collapseToStart(range: IRange): Range;
        /**
         * Create a `Range` from an `IRange`.
         */
        static lift(range: IRange): Range;
        /**
         * Test if `obj` is an `IRange`.
         */
        static isIRange(obj: any): obj is IRange;
        /**
         * Test if the two ranges are touching in any way.
         */
        static areIntersectingOrTouching(a: IRange, b: IRange): boolean;
        /**
         * A function that compares ranges, useful for sorting ranges
         * It will first compare ranges on the startPosition and then on the endPosition
         */
        static compareRangesUsingStarts(a: IRange, b: IRange): number;
        /**
         * A function that compares ranges, useful for sorting ranges
         * It will first compare ranges on the endPosition and then on the startPosition
         */
        static compareRangesUsingEnds(a: IRange, b: IRange): number;
        /**
         * Test if the range spans multiple lines.
         */
        static spansMultipleLines(range: IRange): boolean;
    }

    /**
     * A selection in the editor.
     * The selection is a range that has an orientation.
     */
    export class Selection extends Range {
        /**
         * The line number on which the selection has started.
         */
        readonly selectionStartLineNumber: number;
        /**
         * The column on `selectionStartLineNumber` where the selection has started.
         */
        readonly selectionStartColumn: number;
        /**
         * The line number on which the selection has ended.
         */
        readonly positionLineNumber: number;
        /**
         * The column on `positionLineNumber` where the selection has ended.
         */
        readonly positionColumn: number;
        constructor(selectionStartLineNumber: number, selectionStartColumn: number, positionLineNumber: number, positionColumn: number);
        /**
         * Clone this selection.
         */
        clone(): Selection;
        /**
         * Transform to a human-readable representation.
         */
        toString(): string;
        /**
         * Test if equals other selection.
         */
        equalsSelection(other: ISelection): boolean;
        /**
         * Test if the two selections are equal.
         */
        static selectionsEqual(a: ISelection, b: ISelection): boolean;
        /**
         * Get directions (LTR or RTL).
         */
        getDirection(): SelectionDirection;
        /**
         * Create a new selection with a different `positionLineNumber` and `positionColumn`.
         */
        setEndPosition(endLineNumber: number, endColumn: number): Selection;
        /**
         * Create a new selection with a different `selectionStartLineNumber` and `selectionStartColumn`.
         */
        setStartPosition(startLineNumber: number, startColumn: number): Selection;
        /**
         * Create a `Selection` from an `ISelection`.
         */
        static liftSelection(sel: ISelection): Selection;
        /**
         * `a` equals `b`.
         */
        static selectionsArrEqual(a: ISelection[], b: ISelection[]): boolean;
        /**
         * Test if `obj` is an `ISelection`.
         */
        static isISelection(obj: any): obj is ISelection;
        /**
         * Create with a direction.
         */
        static createWithDirection(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, direction: SelectionDirection): Selection;
    }

    /**
     * The direction of a selection.
     */
    export enum SelectionDirection {
        /**
         * The selection starts above where it ends.
         */
        LTR = 0,
        /**
         * The selection starts below where it ends.
         */
        RTL = 1,
    }

    export class Token {
        _tokenBrand: void;
        readonly offset: number;
        readonly type: string;
        readonly language: string;
        constructor(offset: number, type: string, language: string);
        toString(): string;
    }
}

declare module monaco.editor {


    /**
     * Create a new editor under `domElement`.
     * `domElement` should be empty (not contain other dom nodes).
     * The editor will read the size of `domElement`.
     */
    export function create(domElement: HTMLElement, options?: IEditorConstructionOptions, override?: IEditorOverrideServices): IStandaloneCodeEditor;

    /**
     * Emitted when an editor is created.
     * Creating a diff editor might cause this listener to be invoked with the two editors.
     * @event
     */
    export function onDidCreateEditor(listener: (codeEditor: ICodeEditor) => void): IDisposable;

    /**
     * Create a new diff editor under `domElement`.
     * `domElement` should be empty (not contain other dom nodes).
     * The editor will read the size of `domElement`.
     */
    export function createDiffEditor(domElement: HTMLElement, options?: IDiffEditorConstructionOptions, override?: IEditorOverrideServices): IStandaloneDiffEditor;

    export interface IDiffNavigator {
        canNavigate(): boolean;
        next(): void;
        previous(): void;
        dispose(): void;
    }

    export interface IDiffNavigatorOptions {
        readonly followsCaret?: boolean;
        readonly ignoreCharChanges?: boolean;
        readonly alwaysRevealFirst?: boolean;
    }

    export function createDiffNavigator(diffEditor: IStandaloneDiffEditor, opts?: IDiffNavigatorOptions): IDiffNavigator;

    /**
     * Create a new editor model.
     * You can specify the language that should be set for this model or let the language be inferred from the `uri`.
     */
    export function createModel(value: string, language?: string, uri?: Uri): IModel;

    /**
     * Change the language for a model.
     */
    export function setModelLanguage(model: IModel, language: string): void;

    /**
     * Set the markers for a model.
     */
    export function setModelMarkers(model: IModel, owner: string, markers: IMarkerData[]): void;

    /**
     * Get the model that has `uri` if it exists.
     */
    export function getModel(uri: Uri): IModel;

    /**
     * Get all the created models.
     */
    export function getModels(): IModel[];

    /**
     * Emitted when a model is created.
     * @event
     */
    export function onDidCreateModel(listener: (model: IModel) => void): IDisposable;

    /**
     * Emitted right before a model is disposed.
     * @event
     */
    export function onWillDisposeModel(listener: (model: IModel) => void): IDisposable;

    /**
     * Emitted when a different language is set to a model.
     * @event
     */
    export function onDidChangeModelLanguage(listener: (e: {
        readonly model: IModel;
        readonly oldLanguage: string;
    }) => void): IDisposable;

    /**
     * Create a new web worker that has model syncing capabilities built in.
     * Specify an AMD module to load that will `create` an object that will be proxied.
     */
    export function createWebWorker<T>(opts: IWebWorkerOptions): MonacoWebWorker<T>;

    /**
     * Colorize the contents of `domNode` using attribute `data-lang`.
     */
    export function colorizeElement(domNode: HTMLElement, options: IColorizerElementOptions): Promise<void>;

    /**
     * Colorize `text` using language `languageId`.
     */
    export function colorize(text: string, languageId: string, options: IColorizerOptions): Promise<string>;

    /**
     * Colorize a line in a model.
     */
    export function colorizeModelLine(model: IModel, lineNumber: number, tabSize?: number): string;

    /**
     * Tokenize `text` using language `languageId`
     */
    export function tokenize(text: string, languageId: string): Token[][];

    /**
     * Define a new theme.
     */
    export function defineTheme(themeName: string, themeData: ITheme): void;

    export type BuiltinTheme = 'vs' | 'vs-dark' | 'hc-black';

    export interface ITheme {
        base: BuiltinTheme;
        inherit: boolean;
        rules: IThemeRule[];
    }

    export interface IThemeRule {
        token: string;
        foreground?: string;
        background?: string;
        fontStyle?: string;
    }

    /**
     * A web worker that can provide a proxy to an arbitrary file.
     */
    export interface MonacoWebWorker<T> {
        /**
         * Terminate the web worker, thus invalidating the returned proxy.
         */
        dispose(): void;
        /**
         * Get a proxy to the arbitrary loaded code.
         */
        getProxy(): Promise<T>;
        /**
         * Synchronize (send) the models at `resources` to the web worker,
         * making them available in the monaco.worker.getMirrorModels().
         */
        withSyncedResources(resources: Uri[]): Promise<T>;
    }

    export interface IWebWorkerOptions {
        /**
         * The AMD moduleId to load.
         * It should export a function `create` that should return the exported proxy.
         */
        moduleId: string;
        /**
         * The data to send over when calling create on the module.
         */
        createData?: any;
        /**
         * A label to be used to identify the web worker for debugging purposes.
         */
        label?: string;
    }

    /**
     * The options to create an editor.
     */
    export interface IEditorConstructionOptions extends ICodeEditorWidgetCreationOptions {
        /**
         * The initial value of the auto created model in the editor.
         * To not create automatically a model, use `model: null`.
         */
        value?: string;
        /**
         * The initial language of the auto created model in the editor.
         * To not create automatically a model, use `model: null`.
         */
        language?: string;
    }

    /**
     * The options to create a diff editor.
     */
    export interface IDiffEditorConstructionOptions extends IDiffEditorOptions {
    }

    export interface IStandaloneCodeEditor extends ICodeEditor {
        addCommand(keybinding: number, handler: ICommandHandler, context: string): string;
        createContextKey<T>(key: string, defaultValue: T): IContextKey<T>;
        addAction(descriptor: IActionDescriptor): IDisposable;
    }

    export interface IStandaloneDiffEditor extends IDiffEditor {
        addCommand(keybinding: number, handler: ICommandHandler, context: string): string;
        createContextKey<T>(key: string, defaultValue: T): IContextKey<T>;
        addAction(descriptor: IActionDescriptor): IDisposable;
    }
    export interface ICommandHandler {
        (...args: any[]): void;
    }

    export interface IContextKey<T> {
        set(value: T): void;
        reset(): void;
        get(): T;
    }

    export interface IEditorOverrideServices {
    }

    /**
     * A structure defining a problem/warning/etc.
     */
    export interface IMarkerData {
        code?: string;
        severity: Severity;
        message: string;
        source?: string;
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
    }

    export interface IColorizerOptions {
        tabSize?: number;
    }

    export interface IColorizerElementOptions extends IColorizerOptions {
        theme?: string;
        mimeType?: string;
    }

    export enum ScrollbarVisibility {
        Auto = 1,
        Hidden = 2,
        Visible = 3,
    }

    /**
     * Configuration options for editor scrollbars
     */
    export interface IEditorScrollbarOptions {
        /**
         * The size of arrows (if displayed).
         * Defaults to 11.
         */
        arrowSize?: number;
        /**
         * Render vertical scrollbar.
         * Accepted values: 'auto', 'visible', 'hidden'.
         * Defaults to 'auto'.
         */
        vertical?: string;
        /**
         * Render horizontal scrollbar.
         * Accepted values: 'auto', 'visible', 'hidden'.
         * Defaults to 'auto'.
         */
        horizontal?: string;
        /**
         * Cast horizontal and vertical shadows when the content is scrolled.
         * Defaults to true.
         */
        useShadows?: boolean;
        /**
         * Render arrows at the top and bottom of the vertical scrollbar.
         * Defaults to false.
         */
        verticalHasArrows?: boolean;
        /**
         * Render arrows at the left and right of the horizontal scrollbar.
         * Defaults to false.
         */
        horizontalHasArrows?: boolean;
        /**
         * Listen to mouse wheel events and react to them by scrolling.
         * Defaults to true.
         */
        handleMouseWheel?: boolean;
        /**
         * Height in pixels for the horizontal scrollbar.
         * Defaults to 10 (px).
         */
        horizontalScrollbarSize?: number;
        /**
         * Width in pixels for the vertical scrollbar.
         * Defaults to 10 (px).
         */
        verticalScrollbarSize?: number;
        /**
         * Width in pixels for the vertical slider.
         * Defaults to `verticalScrollbarSize`.
         */
        verticalSliderSize?: number;
        /**
         * Height in pixels for the horizontal slider.
         * Defaults to `horizontalScrollbarSize`.
         */
        horizontalSliderSize?: number;
    }

    /**
     * Describes how to indent wrapped lines.
     */
    export enum WrappingIndent {
        /**
         * No indentation => wrapped lines begin at column 1.
         */
        None = 0,
        /**
         * Same => wrapped lines get the same indentation as the parent.
         */
        Same = 1,
        /**
         * Indent => wrapped lines get +1 indentation as the parent.
         */
        Indent = 2,
    }

    export type LineNumbersOption = 'on' | 'off' | 'relative' | ((lineNumber: number) => string);

    /**
     * Configuration options for the editor.
     */
    export interface IEditorOptions {
        /**
         * Enable experimental screen reader support.
         * Defaults to `true`.
         */
        experimentalScreenReader?: boolean;
        /**
         * The aria label for the editor's textarea (when it is focused).
         */
        ariaLabel?: string;
        /**
         * Render vertical lines at the specified columns.
         * Defaults to empty array.
         */
        rulers?: number[];
        /**
         * A string containing the word separators used when doing word navigation.
         * Defaults to `~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?
         */
        wordSeparators?: string;
        /**
         * Enable Linux primary clipboard.
         * Defaults to true.
         */
        selectionClipboard?: boolean;
        /**
         * Control the rendering of line numbers.
         * If it is a function, it will be invoked when rendering a line number and the return value will be rendered.
         * Otherwise, if it is a truey, line numbers will be rendered normally (equivalent of using an identity function).
         * Otherwise, line numbers will not be rendered.
         * Defaults to true.
         */
        lineNumbers?: LineNumbersOption;
        /**
         * Should the corresponding line be selected when clicking on the line number?
         * Defaults to true.
         */
        selectOnLineNumbers?: boolean;
        /**
         * Control the width of line numbers, by reserving horizontal space for rendering at least an amount of digits.
         * Defaults to 5.
         */
        lineNumbersMinChars?: number;
        /**
         * Enable the rendering of the glyph margin.
         * Defaults to true in vscode and to false in monaco-editor.
         */
        glyphMargin?: boolean;
        /**
         * The width reserved for line decorations (in px).
         * Line decorations are placed between line numbers and the editor content.
         * You can pass in a string in the format floating point followed by "ch". e.g. 1.3ch.
         * Defaults to 10.
         */
        lineDecorationsWidth?: number | string;
        /**
         * When revealing the cursor, a virtual padding (px) is added to the cursor, turning it into a rectangle.
         * This virtual padding ensures that the cursor gets revealed before hitting the edge of the viewport.
         * Defaults to 30 (px).
         */
        revealHorizontalRightPadding?: number;
        /**
         * Render the editor selection with rounded borders.
         * Defaults to true.
         */
        roundedSelection?: boolean;
        /**
         * Theme to be used for rendering.
         * The current out-of-the-box available themes are: 'vs' (default), 'vs-dark', 'hc-black'.
         * You can create custom themes via `monaco.editor.defineTheme`.
         */
        theme?: string;
        /**
         * Should the editor be read only.
         * Defaults to false.
         */
        readOnly?: boolean;
        /**
         * Control the behavior and rendering of the scrollbars.
         */
        scrollbar?: IEditorScrollbarOptions;
        /**
         * Display overflow widgets as `fixed`.
         * Defaults to `false`.
         */
        fixedOverflowWidgets?: boolean;
        /**
         * The number of vertical lanes the overview ruler should render.
         * Defaults to 2.
         */
        overviewRulerLanes?: number;
        /**
         * Control the cursor animation style, possible values are 'blink', 'smooth', 'phase', 'expand' and 'solid'.
         * Defaults to 'blink'.
         */
        cursorBlinking?: string;
        /**
         * Zoom the font in the editor when using the mouse wheel in combination with holding Ctrl.
         * Defaults to false.
         */
        mouseWheelZoom?: boolean;
        /**
         * Control the cursor style, either 'block' or 'line'.
         * Defaults to 'line'.
         */
        cursorStyle?: string;
        /**
         * Enable font ligatures.
         * Defaults to false.
         */
        fontLigatures?: boolean;
        /**
         * Disable the use of `translate3d`.
         * Defaults to false.
         */
        disableTranslate3d?: boolean;
        /**
         * Disable the optimizations for monospace fonts.
         * Defaults to false.
         */
        disableMonospaceOptimizations?: boolean;
        /**
         * Should the cursor be hidden in the overview ruler.
         * Defaults to false.
         */
        hideCursorInOverviewRuler?: boolean;
        /**
         * Enable that scrolling can go one screen size after the last line.
         * Defaults to true.
         */
        scrollBeyondLastLine?: boolean;
        /**
         * Enable that the editor will install an interval to check if its container dom node size has changed.
         * Enabling this might have a severe performance impact.
         * Defaults to false.
         */
        automaticLayout?: boolean;
        /**
         * Control the wrapping strategy of the editor.
         * Using -1 means no wrapping whatsoever.
         * Using 0 means viewport width wrapping (ajusts with the resizing of the editor).
         * Using a positive number means wrapping after a fixed number of characters.
         * Defaults to 300.
         */
        wrappingColumn?: number;
        /**
         * Control the alternate style of viewport wrapping.
         * When set to true viewport wrapping is used only when the window width is less than the number of columns specified in the wrappingColumn property. Has no effect if wrappingColumn is not a positive number.
         * Defaults to false.
         */
        wordWrap?: boolean;
        /**
         * Control indentation of wrapped lines. Can be: 'none', 'same' or 'indent'.
         * Defaults to 'same' in vscode and to 'none' in monaco-editor.
         */
        wrappingIndent?: string;
        /**
         * Configure word wrapping characters. A break will be introduced before these characters.
         * Defaults to '{([+'.
         */
        wordWrapBreakBeforeCharacters?: string;
        /**
         * Configure word wrapping characters. A break will be introduced after these characters.
         * Defaults to ' \t})]?|&,;'.
         */
        wordWrapBreakAfterCharacters?: string;
        /**
         * Configure word wrapping characters. A break will be introduced after these characters only if no `wordWrapBreakBeforeCharacters` or `wordWrapBreakAfterCharacters` were found.
         * Defaults to '.'.
         */
        wordWrapBreakObtrusiveCharacters?: string;
        /**
         * Performance guard: Stop rendering a line after x characters.
         * Defaults to 10000 if wrappingColumn is -1. Defaults to -1 if wrappingColumn is >= 0.
         * Use -1 to never stop rendering
         */
        stopRenderingLineAfter?: number;
        /**
         * Enable hover.
         * Defaults to true.
         */
        hover?: boolean;
        /**
         * Enable custom contextmenu.
         * Defaults to true.
         */
        contextmenu?: boolean;
        /**
         * A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.
         * Defaults to 1.
         */
        mouseWheelScrollSensitivity?: number;
        /**
         * Enable quick suggestions (shadow suggestions)
         * Defaults to true.
         */
        quickSuggestions?: boolean;
        /**
         * Quick suggestions show delay (in ms)
         * Defaults to 500 (ms)
         */
        quickSuggestionsDelay?: number;
        /**
         * Enables parameter hints
         */
        parameterHints?: boolean;
        /**
         * Render icons in suggestions box.
         * Defaults to true.
         */
        iconsInSuggestions?: boolean;
        /**
         * Enable auto closing brackets.
         * Defaults to true.
         */
        autoClosingBrackets?: boolean;
        /**
         * Enable format on type.
         * Defaults to false.
         */
        formatOnType?: boolean;
        /**
         * Enable format on paste.
         * Defaults to false.
         */
        formatOnPaste?: boolean;
        /**
         * Enable the suggestion box to pop-up on trigger characters.
         * Defaults to true.
         */
        suggestOnTriggerCharacters?: boolean;
        /**
         * Accept suggestions on ENTER.
         * Defaults to true.
         */
        acceptSuggestionOnEnter?: boolean;
        /**
         * Accept suggestions on provider defined characters.
         * Defaults to true.
         */
        acceptSuggestionOnCommitCharacter?: boolean;
        /**
         * Enable snippet suggestions. Default to 'true'.
         */
        snippetSuggestions?: 'top' | 'bottom' | 'inline' | 'none';
        /**
         * Copying without a selection copies the current line.
         */
        emptySelectionClipboard?: boolean;
        /**
         * Enable tab completion. Defaults to 'false'
         */
        tabCompletion?: boolean;
        /**
         * Enable word based suggestions. Defaults to 'true'
         */
        wordBasedSuggestions?: boolean;
        /**
         * The font size for the suggest widget.
         * Defaults to the editor font size.
         */
        suggestFontSize?: number;
        /**
         * The line height for the suggest widget.
         * Defaults to the editor line height.
         */
        suggestLineHeight?: number;
        /**
         * Enable selection highlight.
         * Defaults to true.
         */
        selectionHighlight?: boolean;
        /**
         * Show code lens
         * Defaults to true.
         */
        codeLens?: boolean;
        /**
         * Enable code folding
         * Defaults to true in vscode and to false in monaco-editor.
         */
        folding?: boolean;
        /**
         * Enable rendering of whitespace.
         * Defaults to none.
         */
        renderWhitespace?: 'none' | 'boundary' | 'all';
        /**
         * Enable rendering of control characters.
         * Defaults to false.
         */
        renderControlCharacters?: boolean;
        /**
         * Enable rendering of indent guides.
         * Defaults to false.
         */
        renderIndentGuides?: boolean;
        /**
         * Enable rendering of current line highlight.
         * Defaults to all.
         */
        renderLineHighlight?: 'none' | 'gutter' | 'line' | 'all';
        /**
         * Inserting and deleting whitespace follows tab stops.
         */
        useTabStops?: boolean;
        /**
         * The font family
         */
        fontFamily?: string;
        /**
         * The font weight
         */
        fontWeight?: 'normal' | 'bold' | 'bolder' | 'lighter' | 'initial' | 'inherit' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
        /**
         * The font size
         */
        fontSize?: number;
        /**
         * The line height
         */
        lineHeight?: number;
    }

    /**
     * Configuration options for the diff editor.
     */
    export interface IDiffEditorOptions extends IEditorOptions {
        /**
         * Allow the user to resize the diff editor split view.
         * Defaults to true.
         */
        enableSplitViewResizing?: boolean;
        /**
         * Render the differences in two side-by-side editors.
         * Defaults to true.
         */
        renderSideBySide?: boolean;
        /**
         * Compute the diff by ignoring leading/trailing whitespace
         * Defaults to true.
         */
        ignoreTrimWhitespace?: boolean;
        /**
         * Render +/- indicators for added/deleted changes.
         * Defaults to true.
         */
        renderIndicators?: boolean;
        /**
         * Original model should be editable?
         * Defaults to false.
         */
        originalEditable?: boolean;
    }

    export class InternalEditorScrollbarOptions {
        readonly _internalEditorScrollbarOptionsBrand: void;
        readonly arrowSize: number;
        readonly vertical: ScrollbarVisibility;
        readonly horizontal: ScrollbarVisibility;
        readonly useShadows: boolean;
        readonly verticalHasArrows: boolean;
        readonly horizontalHasArrows: boolean;
        readonly handleMouseWheel: boolean;
        readonly horizontalScrollbarSize: number;
        readonly horizontalSliderSize: number;
        readonly verticalScrollbarSize: number;
        readonly verticalSliderSize: number;
        readonly mouseWheelScrollSensitivity: number;
    }

    export class EditorWrappingInfo {
        readonly _editorWrappingInfoBrand: void;
        readonly isViewportWrapping: boolean;
        readonly wrappingColumn: number;
        readonly wrappingIndent: WrappingIndent;
        readonly wordWrapBreakBeforeCharacters: string;
        readonly wordWrapBreakAfterCharacters: string;
        readonly wordWrapBreakObtrusiveCharacters: string;
    }

    export class InternalEditorViewOptions {
        readonly _internalEditorViewOptionsBrand: void;
        readonly theme: string;
        readonly canUseTranslate3d: boolean;
        readonly disableMonospaceOptimizations: boolean;
        readonly experimentalScreenReader: boolean;
        readonly rulers: number[];
        readonly ariaLabel: string;
        readonly renderLineNumbers: boolean;
        readonly renderCustomLineNumbers: (lineNumber: number) => string;
        readonly renderRelativeLineNumbers: boolean;
        readonly selectOnLineNumbers: boolean;
        readonly glyphMargin: boolean;
        readonly revealHorizontalRightPadding: number;
        readonly roundedSelection: boolean;
        readonly overviewRulerLanes: number;
        readonly cursorBlinking: TextEditorCursorBlinkingStyle;
        readonly mouseWheelZoom: boolean;
        readonly cursorStyle: TextEditorCursorStyle;
        readonly hideCursorInOverviewRuler: boolean;
        readonly scrollBeyondLastLine: boolean;
        readonly editorClassName: string;
        readonly stopRenderingLineAfter: number;
        readonly renderWhitespace: 'none' | 'boundary' | 'all';
        readonly renderControlCharacters: boolean;
        readonly renderIndentGuides: boolean;
        readonly renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
        readonly scrollbar: InternalEditorScrollbarOptions;
        readonly fixedOverflowWidgets: boolean;
    }

    export interface IViewConfigurationChangedEvent {
        readonly theme: boolean;
        readonly canUseTranslate3d: boolean;
        readonly disableMonospaceOptimizations: boolean;
        readonly experimentalScreenReader: boolean;
        readonly rulers: boolean;
        readonly ariaLabel: boolean;
        readonly renderLineNumbers: boolean;
        readonly renderCustomLineNumbers: boolean;
        readonly renderRelativeLineNumbers: boolean;
        readonly selectOnLineNumbers: boolean;
        readonly glyphMargin: boolean;
        readonly revealHorizontalRightPadding: boolean;
        readonly roundedSelection: boolean;
        readonly overviewRulerLanes: boolean;
        readonly cursorBlinking: boolean;
        readonly mouseWheelZoom: boolean;
        readonly cursorStyle: boolean;
        readonly hideCursorInOverviewRuler: boolean;
        readonly scrollBeyondLastLine: boolean;
        readonly editorClassName: boolean;
        readonly stopRenderingLineAfter: boolean;
        readonly renderWhitespace: boolean;
        readonly renderControlCharacters: boolean;
        readonly renderIndentGuides: boolean;
        readonly renderLineHighlight: boolean;
        readonly scrollbar: boolean;
        readonly fixedOverflowWidgets: boolean;
    }

    export class EditorContribOptions {
        readonly selectionClipboard: boolean;
        readonly hover: boolean;
        readonly contextmenu: boolean;
        readonly quickSuggestions: boolean;
        readonly quickSuggestionsDelay: number;
        readonly parameterHints: boolean;
        readonly iconsInSuggestions: boolean;
        readonly formatOnType: boolean;
        readonly formatOnPaste: boolean;
        readonly suggestOnTriggerCharacters: boolean;
        readonly acceptSuggestionOnEnter: boolean;
        readonly acceptSuggestionOnCommitCharacter: boolean;
        readonly snippetSuggestions: 'top' | 'bottom' | 'inline' | 'none';
        readonly emptySelectionClipboard: boolean;
        readonly tabCompletion: boolean;
        readonly wordBasedSuggestions: boolean;
        readonly suggestFontSize: number;
        readonly suggestLineHeight: number;
        readonly selectionHighlight: boolean;
        readonly codeLens: boolean;
        readonly folding: boolean;
    }

    /**
     * Internal configuration options (transformed or computed) for the editor.
     */
    export class InternalEditorOptions {
        readonly _internalEditorOptionsBrand: void;
        readonly lineHeight: number;
        readonly readOnly: boolean;
        readonly wordSeparators: string;
        readonly autoClosingBrackets: boolean;
        readonly useTabStops: boolean;
        readonly tabFocusMode: boolean;
        readonly layoutInfo: EditorLayoutInfo;
        readonly fontInfo: FontInfo;
        readonly viewInfo: InternalEditorViewOptions;
        readonly wrappingInfo: EditorWrappingInfo;
        readonly contribInfo: EditorContribOptions;
    }

    /**
     * An event describing that the configuration of the editor has changed.
     */
    export interface IConfigurationChangedEvent {
        readonly lineHeight: boolean;
        readonly readOnly: boolean;
        readonly wordSeparators: boolean;
        readonly autoClosingBrackets: boolean;
        readonly useTabStops: boolean;
        readonly tabFocusMode: boolean;
        readonly layoutInfo: boolean;
        readonly fontInfo: boolean;
        readonly viewInfo: IViewConfigurationChangedEvent;
        readonly wrappingInfo: boolean;
        readonly contribInfo: boolean;
    }

    /**
     * Vertical Lane in the overview ruler of the editor.
     */
    export enum OverviewRulerLane {
        Left = 1,
        Center = 2,
        Right = 4,
        Full = 7,
    }

    /**
     * Options for rendering a model decoration in the overview ruler.
     */
    export interface IModelDecorationOverviewRulerOptions {
        /**
         * CSS color to render in the overview ruler.
         * e.g.: rgba(100, 100, 100, 0.5)
         */
        color: string;
        /**
         * CSS color to render in the overview ruler.
         * e.g.: rgba(100, 100, 100, 0.5)
         */
        darkColor: string;
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
         * Customize the growing behaviour of the decoration when typing at the edges of the decoration.
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
        glyphMarginHoverMessage?: MarkedString | MarkedString[];
        /**
         * Array of MarkedString to render as the decoration message.
         */
        hoverMessage?: MarkedString | MarkedString[];
        /**
         * Should the decoration expand to encompass a whole line.
         */
        isWholeLine?: boolean;
        /**
         * @deprecated : Use `overviewRuler` instead
         */
        showInOverviewRuler?: string;
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
        CRLF = 2,
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
        CRLF = 2,
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
        CRLF = 1,
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
    }

    export interface ITextModelUpdateOptions {
        tabSize?: number;
        insertSpaces?: boolean;
        trimAutoWhitespace?: boolean;
    }

    export interface IModelOptionsChangedEvent {
        readonly tabSize: boolean;
        readonly insertSpaces: boolean;
        readonly trimAutoWhitespace: boolean;
    }

    /**
     * A textual read-only model.
     */
    export interface ITextModel {
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
         * Get the number of lines in the model.
         */
        getLineCount(): number;
        /**
         * Get the text for a certain line.
         */
        getLineContent(lineNumber: number): string;
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
         * Returns iff the model was disposed or not.
         */
        isDisposed(): boolean;
        /**
         * Search the model.
         * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
         * @param searchOnlyEditableRange Limit the searching to only search inside the editable range of the model.
         * @param isRegex Used to indicate that `searchString` is a regular expression.
         * @param matchCase Force the matching to match lower/upper case exactly.
         * @param wholeWord Force the matching to match entire words only.
         * @param captureMatches The result will contain the captured groups.
         * @param limitResultCount Limit the number of results
         * @return The ranges where the matches are. It is empty if not matches have been found.
         */
        findMatches(searchString: string, searchOnlyEditableRange: boolean, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean, limitResultCount?: number): FindMatch[];
        /**
         * Search the model.
         * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
         * @param searchScope Limit the searching to only search inside this range.
         * @param isRegex Used to indicate that `searchString` is a regular expression.
         * @param matchCase Force the matching to match lower/upper case exactly.
         * @param wholeWord Force the matching to match entire words only.
         * @param captureMatches The result will contain the captured groups.
         * @param limitResultCount Limit the number of results
         * @return The ranges where the matches are. It is empty if no matches have been found.
         */
        findMatches(searchString: string, searchScope: IRange, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean, limitResultCount?: number): FindMatch[];
        /**
         * Search the model for the next match. Loops to the beginning of the model if needed.
         * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
         * @param searchStart Start the searching at the specified position.
         * @param isRegex Used to indicate that `searchString` is a regular expression.
         * @param matchCase Force the matching to match lower/upper case exactly.
         * @param wholeWord Force the matching to match entire words only.
         * @param captureMatches The result will contain the captured groups.
         * @return The range where the next match is. It is null if no next match has been found.
         */
        findNextMatch(searchString: string, searchStart: IPosition, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean): FindMatch;
        /**
         * Search the model for the previous match. Loops to the end of the model if needed.
         * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
         * @param searchStart Start the searching at the specified position.
         * @param isRegex Used to indicate that `searchString` is a regular expression.
         * @param matchCase Force the matching to match lower/upper case exactly.
         * @param wholeWord Force the matching to match entire words only.
         * @param captureMatches The result will contain the captured groups.
         * @return The range where the previous match is. It is null if no previous match has been found.
         */
        findPreviousMatch(searchString: string, searchStart: IPosition, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean): FindMatch;
    }

    export class FindMatch {
        _findMatchBrand: void;
        readonly range: Range;
        readonly matches: string[];
    }

    export interface IReadOnlyModel extends ITextModel {
        /**
         * Gets the resource associated with this editor model.
         */
        readonly uri: Uri;
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
     * A model that is tokenized.
     */
    export interface ITokenizedModel extends ITextModel {
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
     * A model that can track markers.
     */
    export interface ITextModelWithMarkers extends ITextModel {
    }

    /**
     * Describes the behaviour of decorations when typing/editing near their edges.
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
    }

    /**
     * A model.
     */
    export interface IModel extends IReadOnlyModel, IEditableTextModel, ITextModelWithMarkers, ITokenizedModel, ITextModelWithDecorations, IEditorModel {
        /**
         * An event emitted when the contents of the model have changed.
         * @event
         */
        onDidChangeContent(listener: (e: IModelContentChangedEvent2) => void): IDisposable;
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
         * A unique identifier associated with this model.
         */
        readonly id: string;
        /**
         * Destroy this model. This will unbind the model from the mode
         * and make all necessary clean-up to release this object to the GC.
         */
        dispose(): void;
    }

    /**
     * An event describing that the current mode associated with a model has changed.
     */
    export interface IModelLanguageChangedEvent {
        /**
         * Previous language
         */
        readonly oldLanguage: string;
        /**
         * New language
         */
        readonly newLanguage: string;
    }

    /**
     * An event describing a change in the text of a model.
     */
    export interface IModelContentChangedEvent2 {
        /**
         * The range that got replaced.
         */
        readonly range: IRange;
        /**
         * The length of the range that got replaced.
         */
        readonly rangeLength: number;
        /**
         * The new text for the range.
         */
        readonly text: string;
        /**
         * The (new) end-of-line character.
         */
        readonly eol: string;
        /**
         * The new version id the model has transitioned to.
         */
        versionId: number;
        /**
         * Flag that indicates that this event was generated while undoing.
         */
        readonly isUndoing: boolean;
        /**
         * Flag that indicates that this event was generated while redoing.
         */
        readonly isRedoing: boolean;
    }

    /**
     * An event describing that model decorations have changed.
     */
    export interface IModelDecorationsChangedEvent {
        /**
         * Lists of ids for added decorations.
         */
        readonly addedDecorations: string[];
        /**
         * Lists of ids for changed decorations.
         */
        readonly changedDecorations: string[];
        /**
         * List of ids for removed decorations.
         */
        readonly removedDecorations: string[];
    }

    /**
     * An event describing that some ranges of lines have been tokenized (their tokens have changed).
     */
    export interface IModelTokensChangedEvent {
        readonly ranges: {
            /**
             * The start of the range (inclusive)
             */
            readonly fromLineNumber: number;
            /**
             * The end of the range (inclusive)
             */
            readonly toLineNumber: number;
        }[];
    }

    /**
     * Describes the reason the cursor has changed its position.
     */
    export enum CursorChangeReason {
        /**
         * Unknown or not set.
         */
        NotSet = 0,
        /**
         * A `model.setValue()` was called.
         */
        ContentFlush = 1,
        /**
         * The `model` has been changed outside of this cursor and the cursor recovers its position from associated markers.
         */
        RecoverFromMarkers = 2,
        /**
         * There was an explicit user gesture.
         */
        Explicit = 3,
        /**
         * There was a Paste.
         */
        Paste = 4,
        /**
         * There was an Undo.
         */
        Undo = 5,
        /**
         * There was a Redo.
         */
        Redo = 6,
    }

    /**
     * An event describing that the cursor position has changed.
     */
    export interface ICursorPositionChangedEvent {
        /**
         * Primary cursor's position.
         */
        readonly position: Position;
        /**
         * Primary cursor's view position
         */
        readonly viewPosition: Position;
        /**
         * Secondary cursors' position.
         */
        readonly secondaryPositions: Position[];
        /**
         * Secondary cursors' view position.
         */
        readonly secondaryViewPositions: Position[];
        /**
         * Reason.
         */
        readonly reason: CursorChangeReason;
        /**
         * Source of the call that caused the event.
         */
        readonly source: string;
        /**
         * Is the primary cursor in the editable range?
         */
        readonly isInEditableRange: boolean;
    }

    /**
     * An event describing that the cursor selection has changed.
     */
    export interface ICursorSelectionChangedEvent {
        /**
         * The primary selection.
         */
        readonly selection: Selection;
        /**
         * The primary selection in view coordinates.
         */
        readonly viewSelection: Selection;
        /**
         * The secondary selections.
         */
        readonly secondarySelections: Selection[];
        /**
         * The secondary selections in view coordinates.
         */
        readonly secondaryViewSelections: Selection[];
        /**
         * Source of the call that caused the event.
         */
        readonly source: string;
        /**
         * Reason.
         */
        readonly reason: CursorChangeReason;
    }

    /**
     * An event describing that an editor has had its model reset (i.e. `editor.setModel()`).
     */
    export interface IModelChangedEvent {
        /**
         * The `uri` of the previous model or null.
         */
        readonly oldModelUrl: Uri;
        /**
         * The `uri` of the new model or null.
         */
        readonly newModelUrl: Uri;
    }

    /**
     * A description for the overview ruler position.
     */
    export class OverviewRulerPosition {
        readonly _overviewRulerPositionBrand: void;
        /**
         * Width of the overview ruler
         */
        readonly width: number;
        /**
         * Height of the overview ruler
         */
        readonly height: number;
        /**
         * Top position for the overview ruler
         */
        readonly top: number;
        /**
         * Right position for the overview ruler
         */
        readonly right: number;
    }

    /**
     * The internal layout details of the editor.
     */
    export class EditorLayoutInfo {
        readonly _editorLayoutInfoBrand: void;
        /**
         * Full editor width.
         */
        readonly width: number;
        /**
         * Full editor height.
         */
        readonly height: number;
        /**
         * Left position for the glyph margin.
         */
        readonly glyphMarginLeft: number;
        /**
         * The width of the glyph margin.
         */
        readonly glyphMarginWidth: number;
        /**
         * The height of the glyph margin.
         */
        readonly glyphMarginHeight: number;
        /**
         * Left position for the line numbers.
         */
        readonly lineNumbersLeft: number;
        /**
         * The width of the line numbers.
         */
        readonly lineNumbersWidth: number;
        /**
         * The height of the line numbers.
         */
        readonly lineNumbersHeight: number;
        /**
         * Left position for the line decorations.
         */
        readonly decorationsLeft: number;
        /**
         * The width of the line decorations.
         */
        readonly decorationsWidth: number;
        /**
         * The height of the line decorations.
         */
        readonly decorationsHeight: number;
        /**
         * Left position for the content (actual text)
         */
        readonly contentLeft: number;
        /**
         * The width of the content (actual text)
         */
        readonly contentWidth: number;
        /**
         * The height of the content (actual height)
         */
        readonly contentHeight: number;
        /**
         * The width of the vertical scrollbar.
         */
        readonly verticalScrollbarWidth: number;
        /**
         * The height of the horizontal scrollbar.
         */
        readonly horizontalScrollbarHeight: number;
        /**
         * The position of the overview ruler.
         */
        readonly overviewRuler: OverviewRulerPosition;
    }

    /**
     * Options for creating the editor.
     */
    export interface ICodeEditorWidgetCreationOptions extends IEditorOptions {
        /**
         * The initial model associated with this code editor.
         */
        model?: IModel;
    }

    /**
     * An editor model.
     */
    export interface IEditorModel {
    }

    /**
     * An editor view state.
     */
    export interface IEditorViewState {
    }

    export interface IDimension {
        width: number;
        height: number;
    }

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
    export interface ICodeEditorViewState extends IEditorViewState {
        cursorState: ICursorState[];
        viewState: IViewState;
        contributionsState: {
            [id: string]: any;
        };
    }

    /**
     * Type of hit element with the mouse in the editor.
     */
    export enum MouseTargetType {
        /**
         * Mouse is on top of an unknown element.
         */
        UNKNOWN = 0,
        /**
         * Mouse is on top of the textarea used for input.
         */
        TEXTAREA = 1,
        /**
         * Mouse is on top of the glyph margin
         */
        GUTTER_GLYPH_MARGIN = 2,
        /**
         * Mouse is on top of the line numbers
         */
        GUTTER_LINE_NUMBERS = 3,
        /**
         * Mouse is on top of the line decorations
         */
        GUTTER_LINE_DECORATIONS = 4,
        /**
         * Mouse is on top of the whitespace left in the gutter by a view zone.
         */
        GUTTER_VIEW_ZONE = 5,
        /**
         * Mouse is on top of text in the content.
         */
        CONTENT_TEXT = 6,
        /**
         * Mouse is on top of empty space in the content (e.g. after line text or below last line)
         */
        CONTENT_EMPTY = 7,
        /**
         * Mouse is on top of a view zone in the content.
         */
        CONTENT_VIEW_ZONE = 8,
        /**
         * Mouse is on top of a content widget.
         */
        CONTENT_WIDGET = 9,
        /**
         * Mouse is on top of the decorations overview ruler.
         */
        OVERVIEW_RULER = 10,
        /**
         * Mouse is on top of a scrollbar.
         */
        SCROLLBAR = 11,
        /**
         * Mouse is on top of an overlay widget.
         */
        OVERLAY_WIDGET = 12,
    }

    /**
     * A model for the diff editor.
     */
    export interface IDiffEditorModel extends IEditorModel {
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
     * (Serializable) View state for the diff editor.
     */
    export interface IDiffEditorViewState extends IEditorViewState {
        original: ICodeEditorViewState;
        modified: ICodeEditorViewState;
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
        run(editor: ICommonCodeEditor): void | Promise<void>;
    }

    export interface IEditorAction {
        readonly id: string;
        readonly label: string;
        readonly alias: string;
        isSupported(): boolean;
        run(): Promise<void>;
    }

    /**
     * An editor.
     */
    export interface IEditor {
        /**
         * An event emitted when the content of the current model has changed.
         * @event
         */
        onDidChangeModelContent(listener: (e: IModelContentChangedEvent2) => void): IDisposable;
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
        onDidChangeConfiguration(listener: (e: IConfigurationChangedEvent) => void): IDisposable;
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
         * Update the editor's options after the editor has been created.
         */
        updateOptions(newOptions: IEditorOptions): void;
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
        revealLine(lineNumber: number): void;
        /**
         * Scroll vertically as necessary and reveal a line centered vertically.
         */
        revealLineInCenter(lineNumber: number): void;
        /**
         * Scroll vertically as necessary and reveal a line centered vertically only if it lies outside the viewport.
         */
        revealLineInCenterIfOutsideViewport(lineNumber: number): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a position.
         */
        revealPosition(position: IPosition): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a position centered vertically.
         */
        revealPositionInCenter(position: IPosition): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a position centered vertically only if it lies outside the viewport.
         */
        revealPositionInCenterIfOutsideViewport(position: IPosition): void;
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
        revealLines(startLineNumber: number, endLineNumber: number): void;
        /**
         * Scroll vertically as necessary and reveal lines centered vertically.
         */
        revealLinesInCenter(lineNumber: number, endLineNumber: number): void;
        /**
         * Scroll vertically as necessary and reveal lines centered vertically only if it lies outside the viewport.
         */
        revealLinesInCenterIfOutsideViewport(lineNumber: number, endLineNumber: number): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a range.
         */
        revealRange(range: IRange): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a range centered vertically.
         */
        revealRangeInCenter(range: IRange): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a range at the top of the viewport.
         */
        revealRangeAtTop(range: IRange): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a range centered vertically only if it lies outside the viewport.
         */
        revealRangeInCenterIfOutsideViewport(range: IRange): void;
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

    export interface ICommonCodeEditor extends IEditor {
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
         * Type the getModel() of IEditor.
         */
        getModel(): IModel;
        /**
         * Returns the current editor's configuration
         */
        getConfiguration(): InternalEditorOptions;
        /**
         * Get value of the current model attached to this editor.
         * @see IModel.getValue
         */
        getValue(options?: {
            preserveBOM: boolean;
            lineEnding: string;
        }): string;
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
         * Get all the decorations on a line (filtering out decorations from other editors).
         */
        getLineDecorations(lineNumber: number): IModelDecoration[];
        /**
         * All decorations added through this call will get the ownerId of this editor.
         * @see IModel.deltaDecorations
         */
        deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];
        /**
         * Get the layout info for the editor.
         */
        getLayoutInfo(): EditorLayoutInfo;
    }

    export interface ICommonDiffEditor extends IEditor {
        /**
         * An event emitted when the diff information computed by this diff editor has been updated.
         * @event
         */
        onDidUpdateDiff(listener: () => void): IDisposable;
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
         * @see ICodeEditor.getValue
         */
        getValue(options?: {
            preserveBOM: boolean;
            lineEnding: string;
        }): string;
    }

    /**
     * The type of the `IEditor`.
     */
    export var EditorType: {
        ICodeEditor: string;
        IDiffEditor: string;
    };

    /**
     * Positions in the view for cursor move command.
     */
    export const CursorMovePosition: {
        Left: string;
        Right: string;
        Up: string;
        Down: string;
        WrappedLineStart: string;
        WrappedLineFirstNonWhitespaceCharacter: string;
        WrappedLineColumnCenter: string;
        WrappedLineEnd: string;
        WrappedLineLastNonWhitespaceCharacter: string;
        ViewPortTop: string;
        ViewPortCenter: string;
        ViewPortBottom: string;
        ViewPortIfOutside: string;
    };

    /**
     * Units for Cursor move 'by' argument
     */
    export const CursorMoveByUnit: {
        Line: string;
        WrappedLine: string;
        Character: string;
        HalfLine: string;
    };

    /**
     * Arguments for Cursor move command
     */
    export interface CursorMoveArguments {
        to: string;
        select?: boolean;
        by?: string;
        value?: number;
    }

    /**
     * Directions in the view for editor scroll command.
     */
    export const EditorScrollDirection: {
        Up: string;
        Down: string;
    };

    /**
     * Units for editor scroll 'by' argument
     */
    export const EditorScrollByUnit: {
        Line: string;
        WrappedLine: string;
        Page: string;
        HalfPage: string;
    };

    /**
     * Arguments for editor scroll command
     */
    export interface EditorScrollArguments {
        to: string;
        by?: string;
        value?: number;
        revealCursor?: boolean;
    }

    /**
     * Arguments for reveal line command
     */
    export interface RevealLineArguments {
        lineNumber?: number;
        at?: string;
    }

    /**
     * Values for reveal line 'at' argument
     */
    export const RevealLineAtArgument: {
        Top: string;
        Center: string;
        Bottom: string;
    };

    /**
     * Built-in commands.
     */
    export var Handler: {
        ExecuteCommand: string;
        ExecuteCommands: string;
        CursorLeft: string;
        CursorLeftSelect: string;
        CursorWordLeft: string;
        CursorWordStartLeft: string;
        CursorWordEndLeft: string;
        CursorWordLeftSelect: string;
        CursorWordStartLeftSelect: string;
        CursorWordEndLeftSelect: string;
        CursorRight: string;
        CursorRightSelect: string;
        CursorWordRight: string;
        CursorWordStartRight: string;
        CursorWordEndRight: string;
        CursorWordRightSelect: string;
        CursorWordStartRightSelect: string;
        CursorWordEndRightSelect: string;
        CursorUp: string;
        CursorUpSelect: string;
        CursorDown: string;
        CursorDownSelect: string;
        CursorPageUp: string;
        CursorPageUpSelect: string;
        CursorPageDown: string;
        CursorPageDownSelect: string;
        CursorHome: string;
        CursorHomeSelect: string;
        CursorEnd: string;
        CursorEndSelect: string;
        ExpandLineSelection: string;
        CursorTop: string;
        CursorTopSelect: string;
        CursorBottom: string;
        CursorBottomSelect: string;
        CursorColumnSelectLeft: string;
        CursorColumnSelectRight: string;
        CursorColumnSelectUp: string;
        CursorColumnSelectPageUp: string;
        CursorColumnSelectDown: string;
        CursorColumnSelectPageDown: string;
        CursorMove: string;
        AddCursorDown: string;
        AddCursorUp: string;
        CursorUndo: string;
        MoveTo: string;
        MoveToSelect: string;
        ColumnSelect: string;
        CreateCursor: string;
        LastCursorMoveToSelect: string;
        Type: string;
        ReplacePreviousChar: string;
        CompositionStart: string;
        CompositionEnd: string;
        Paste: string;
        Tab: string;
        Indent: string;
        Outdent: string;
        DeleteLeft: string;
        DeleteRight: string;
        DeleteWordLeft: string;
        DeleteWordStartLeft: string;
        DeleteWordEndLeft: string;
        DeleteWordRight: string;
        DeleteWordStartRight: string;
        DeleteWordEndRight: string;
        RemoveSecondaryCursors: string;
        CancelSelection: string;
        Cut: string;
        Undo: string;
        Redo: string;
        WordSelect: string;
        WordSelectDrag: string;
        LastCursorWordSelect: string;
        LineSelect: string;
        LineSelectDrag: string;
        LastCursorLineSelect: string;
        LastCursorLineSelectDrag: string;
        LineInsertBefore: string;
        LineInsertAfter: string;
        LineBreakInsert: string;
        SelectAll: string;
        EditorScroll: string;
        ScrollLineUp: string;
        ScrollLineDown: string;
        ScrollPageUp: string;
        ScrollPageDown: string;
        RevealLine: string;
    };

    /**
     * The style in which the editor's cursor should be rendered.
     */
    export enum TextEditorCursorStyle {
        /**
         * As a vertical line (sitting between two characters).
         */
        Line = 1,
        /**
         * As a block (sitting on top of a character).
         */
        Block = 2,
        /**
         * As a horizontal line (sitting under a character).
         */
        Underline = 3,
    }

    /**
     * The kind of animation in which the editor's cursor should be rendered.
     */
    export enum TextEditorCursorBlinkingStyle {
        /**
         * Hidden
         */
        Hidden = 0,
        /**
         * Blinking
         */
        Blink = 1,
        /**
         * Blinking with smooth fading
         */
        Smooth = 2,
        /**
         * Blinking with prolonged filled state and smooth fading
         */
        Phase = 3,
        /**
         * Expand collapse animation on the y axis
         */
        Expand = 4,
        /**
         * No-Blinking
         */
        Solid = 5,
    }

    /**
     * A view zone is a full horizontal rectangle that 'pushes' text down.
     * The editor reserves space for view zones when rendering.
     */
    export interface IViewZone {
        /**
         * The line number after which this zone should appear.
         * Use 0 to place a view zone before the first line number.
         */
        afterLineNumber: number;
        /**
         * The column after which this zone should appear.
         * If not set, the maxLineColumn of `afterLineNumber` will be used.
         */
        afterColumn?: number;
        /**
         * Suppress mouse down events.
         * If set, the editor will attach a mouse down listener to the view zone and .preventDefault on it.
         * Defaults to false
         */
        suppressMouseDown?: boolean;
        /**
         * The height in lines of the view zone.
         * If specified, `heightInPx` will be used instead of this.
         * If neither `heightInPx` nor `heightInLines` is specified, a default of `heightInLines` = 1 will be chosen.
         */
        heightInLines?: number;
        /**
         * The height in px of the view zone.
         * If this is set, the editor will give preference to it rather than `heightInLines` above.
         * If neither `heightInPx` nor `heightInLines` is specified, a default of `heightInLines` = 1 will be chosen.
         */
        heightInPx?: number;
        /**
         * The dom node of the view zone
         */
        domNode: HTMLElement;
        /**
         * An optional dom node for the view zone that will be placed in the margin area.
         */
        marginDomNode?: HTMLElement;
        /**
         * Callback which gives the relative top of the view zone as it appears (taking scrolling into account).
         */
        onDomNodeTop?: (top: number) => void;
        /**
         * Callback which gives the height in pixels of the view zone.
         */
        onComputedHeight?: (height: number) => void;
    }

    /**
     * An accessor that allows for zones to be added or removed.
     */
    export interface IViewZoneChangeAccessor {
        /**
         * Create a new view zone.
         * @param zone Zone to create
         * @return A unique identifier to the view zone.
         */
        addZone(zone: IViewZone): number;
        /**
         * Remove a zone
         * @param id A unique identifier to the view zone, as returned by the `addZone` call.
         */
        removeZone(id: number): void;
        /**
         * Change a zone's position.
         * The editor will rescan the `afterLineNumber` and `afterColumn` properties of a view zone.
         */
        layoutZone(id: number): void;
    }

    /**
     * A positioning preference for rendering content widgets.
     */
    export enum ContentWidgetPositionPreference {
        /**
         * Place the content widget exactly at a position
         */
        EXACT = 0,
        /**
         * Place the content widget above a position
         */
        ABOVE = 1,
        /**
         * Place the content widget below a position
         */
        BELOW = 2,
    }

    /**
     * A position for rendering content widgets.
     */
    export interface IContentWidgetPosition {
        /**
         * Desired position for the content widget.
         * `preference` will also affect the placement.
         */
        position: IPosition;
        /**
         * Placement preference for position, in order of preference.
         */
        preference: ContentWidgetPositionPreference[];
    }

    /**
     * A content widget renders inline with the text and can be easily placed 'near' an editor position.
     */
    export interface IContentWidget {
        /**
         * Render this content widget in a location where it could overflow the editor's view dom node.
         */
        allowEditorOverflow?: boolean;
        suppressMouseDown?: boolean;
        /**
         * Get a unique identifier of the content widget.
         */
        getId(): string;
        /**
         * Get the dom node of the content widget.
         */
        getDomNode(): HTMLElement;
        /**
         * Get the placement of the content widget.
         * If null is returned, the content widget will be placed off screen.
         */
        getPosition(): IContentWidgetPosition;
    }

    /**
     * A positioning preference for rendering overlay widgets.
     */
    export enum OverlayWidgetPositionPreference {
        /**
         * Position the overlay widget in the top right corner
         */
        TOP_RIGHT_CORNER = 0,
        /**
         * Position the overlay widget in the bottom right corner
         */
        BOTTOM_RIGHT_CORNER = 1,
        /**
         * Position the overlay widget in the top center
         */
        TOP_CENTER = 2,
    }

    /**
     * A position for rendering overlay widgets.
     */
    export interface IOverlayWidgetPosition {
        /**
         * The position preference for the overlay widget.
         */
        preference: OverlayWidgetPositionPreference;
    }

    /**
     * An overlay widgets renders on top of the text.
     */
    export interface IOverlayWidget {
        /**
         * Get a unique identifier of the overlay widget.
         */
        getId(): string;
        /**
         * Get the dom node of the overlay widget.
         */
        getDomNode(): HTMLElement;
        /**
         * Get the placement of the overlay widget.
         * If null is returned, the overlay widget is responsible to place itself.
         */
        getPosition(): IOverlayWidgetPosition;
    }

    /**
     * Target hit with the mouse in the editor.
     */
    export interface IMouseTarget {
        /**
         * The target element
         */
        readonly element: Element;
        /**
         * The target type
         */
        readonly type: MouseTargetType;
        /**
         * The 'approximate' editor position
         */
        readonly position: Position;
        /**
         * Desired mouse column (e.g. when position.column gets clamped to text length -- clicking after text on a line).
         */
        readonly mouseColumn: number;
        /**
         * The 'approximate' editor range
         */
        readonly range: Range;
        /**
         * Some extra detail.
         */
        readonly detail: any;
    }

    /**
     * A mouse event originating from the editor.
     */
    export interface IEditorMouseEvent {
        readonly event: IMouseEvent;
        readonly target: IMouseTarget;
    }

    /**
     * A rich code editor.
     */
    export interface ICodeEditor extends ICommonCodeEditor {
        /**
         * An event emitted on a "mouseup".
         * @event
         */
        onMouseUp(listener: (e: IEditorMouseEvent) => void): IDisposable;
        /**
         * An event emitted on a "mousedown".
         * @event
         */
        onMouseDown(listener: (e: IEditorMouseEvent) => void): IDisposable;
        /**
         * An event emitted on a "contextmenu".
         * @event
         */
        onContextMenu(listener: (e: IEditorMouseEvent) => void): IDisposable;
        /**
         * An event emitted on a "mousemove".
         * @event
         */
        onMouseMove(listener: (e: IEditorMouseEvent) => void): IDisposable;
        /**
         * An event emitted on a "mouseleave".
         * @event
         */
        onMouseLeave(listener: (e: IEditorMouseEvent) => void): IDisposable;
        /**
         * An event emitted on a "keyup".
         * @event
         */
        onKeyUp(listener: (e: IKeyboardEvent) => void): IDisposable;
        /**
         * An event emitted on a "keydown".
         * @event
         */
        onKeyDown(listener: (e: IKeyboardEvent) => void): IDisposable;
        /**
         * An event emitted when the layout of the editor has changed.
         * @event
         */
        onDidLayoutChange(listener: (e: EditorLayoutInfo) => void): IDisposable;
        /**
         * An event emitted when the scroll in the editor has changed.
         * @event
         */
        onDidScrollChange(listener: (e: IScrollEvent) => void): IDisposable;
        /**
         * Returns the editor's dom node
         */
        getDomNode(): HTMLElement;
        /**
         * Add a content widget. Widgets must have unique ids, otherwise they will be overwritten.
         */
        addContentWidget(widget: IContentWidget): void;
        /**
         * Layout/Reposition a content widget. This is a ping to the editor to call widget.getPosition()
         * and update appropiately.
         */
        layoutContentWidget(widget: IContentWidget): void;
        /**
         * Remove a content widget.
         */
        removeContentWidget(widget: IContentWidget): void;
        /**
         * Add an overlay widget. Widgets must have unique ids, otherwise they will be overwritten.
         */
        addOverlayWidget(widget: IOverlayWidget): void;
        /**
         * Layout/Reposition an overlay widget. This is a ping to the editor to call widget.getPosition()
         * and update appropiately.
         */
        layoutOverlayWidget(widget: IOverlayWidget): void;
        /**
         * Remove an overlay widget.
         */
        removeOverlayWidget(widget: IOverlayWidget): void;
        /**
         * Change the view zones. View zones are lost when a new model is attached to the editor.
         */
        changeViewZones(callback: (accessor: IViewZoneChangeAccessor) => void): void;
        /**
         * Returns the range that is currently centered in the view port.
         */
        getCenteredRangeInViewport(): Range;
        /**
         * Get the horizontal position (left offset) for the column w.r.t to the beginning of the line.
         * This method works only if the line `lineNumber` is currently rendered (in the editor's viewport).
         * Use this method with caution.
         */
        getOffsetForColumn(lineNumber: number, column: number): number;
        /**
         * Force an editor render now.
         */
        render(): void;
        /**
         * Get the vertical position (top offset) for the line w.r.t. to the first line.
         */
        getTopForLineNumber(lineNumber: number): number;
        /**
         * Get the vertical position (top offset) for the position w.r.t. to the first line.
         */
        getTopForPosition(lineNumber: number, column: number): number;
        /**
         * Get the hit test target at coordinates `clientX` and `clientY`.
         * The coordinates are relative to the top-left of the viewport.
         *
         * @returns Hit test target or null if the coordinates fall outside the editor or the editor has no model.
         */
        getTargetAtClientPoint(clientX: number, clientY: number): IMouseTarget;
        /**
         * Get the visible position for `position`.
         * The result position takes scrolling into account and is relative to the top left corner of the editor.
         * Explanation 1: the results of this method will change for the same `position` if the user scrolls the editor.
         * Explanation 2: the results of this method will not change if the container of the editor gets repositioned.
         * Warning: the results of this method are innacurate for positions that are outside the current editor viewport.
         */
        getScrolledVisiblePosition(position: IPosition): {
            top: number;
            left: number;
            height: number;
        };
        /**
         * Apply the same font settings as the editor to `target`.
         */
        applyFontInfo(target: HTMLElement): void;
    }

    /**
     * A rich diff editor.
     */
    export interface IDiffEditor extends ICommonDiffEditor {
        /**
         * @see ICodeEditor.getDomNode
         */
        getDomNode(): HTMLElement;
    }

    export class FontInfo extends BareFontInfo {
        readonly _editorStylingBrand: void;
        readonly isMonospace: boolean;
        readonly typicalHalfwidthCharacterWidth: number;
        readonly typicalFullwidthCharacterWidth: number;
        readonly spaceWidth: number;
        readonly maxDigitWidth: number;
    }
    export class BareFontInfo {
        readonly _bareFontInfoBrand: void;
        readonly fontFamily: string;
        readonly fontWeight: string;
        readonly fontSize: number;
        readonly lineHeight: number;
    }
}

declare module monaco.languages {


    /**
     * Register information about a new language.
     */
    export function register(language: ILanguageExtensionPoint): void;

    /**
     * Get the information of all the registered languages.
     */
    export function getLanguages(): ILanguageExtensionPoint[];

    /**
     * An event emitted when a language is first time needed (e.g. a model has it set).
     * @event
     */
    export function onLanguage(languageId: string, callback: () => void): IDisposable;

    /**
     * Set the editing configuration for a language.
     */
    export function setLanguageConfiguration(languageId: string, configuration: LanguageConfiguration): IDisposable;

    /**
     * A token.
     */
    export interface IToken {
        startIndex: number;
        scopes: string;
    }

    /**
     * The result of a line tokenization.
     */
    export interface ILineTokens {
        /**
         * The list of tokens on the line.
         */
        tokens: IToken[];
        /**
         * The tokenization end state.
         * A pointer will be held to this and the object should not be modified by the tokenizer after the pointer is returned.
         */
        endState: IState;
    }

    /**
     * A "manual" provider of tokens.
     */
    export interface TokensProvider {
        /**
         * The initial state of a language. Will be the state passed in to tokenize the first line.
         */
        getInitialState(): IState;
        /**
         * Tokenize a line given the state at the beginning of the line.
         */
        tokenize(line: string, state: IState): ILineTokens;
    }

    /**
     * Set the tokens provider for a language (manual implementation).
     */
    export function setTokensProvider(languageId: string, provider: TokensProvider): IDisposable;

    /**
     * Set the tokens provider for a language (monarch implementation).
     */
    export function setMonarchTokensProvider(languageId: string, languageDef: IMonarchLanguage): IDisposable;

    /**
     * Register a reference provider (used by e.g. reference search).
     */
    export function registerReferenceProvider(languageId: string, provider: ReferenceProvider): IDisposable;

    /**
     * Register a rename provider (used by e.g. rename symbol).
     */
    export function registerRenameProvider(languageId: string, provider: RenameProvider): IDisposable;

    /**
     * Register a signature help provider (used by e.g. paremeter hints).
     */
    export function registerSignatureHelpProvider(languageId: string, provider: SignatureHelpProvider): IDisposable;

    /**
     * Register a hover provider (used by e.g. editor hover).
     */
    export function registerHoverProvider(languageId: string, provider: HoverProvider): IDisposable;

    /**
     * Register a document symbol provider (used by e.g. outline).
     */
    export function registerDocumentSymbolProvider(languageId: string, provider: DocumentSymbolProvider): IDisposable;

    /**
     * Register a document highlight provider (used by e.g. highlight occurences).
     */
    export function registerDocumentHighlightProvider(languageId: string, provider: DocumentHighlightProvider): IDisposable;

    /**
     * Register a definition provider (used by e.g. go to definition).
     */
    export function registerDefinitionProvider(languageId: string, provider: DefinitionProvider): IDisposable;

    /**
     * Register a implementation provider (used by e.g. go to implementation).
     */
    export function registerImplementationProvider(languageId: string, provider: ImplementationProvider): IDisposable;

    /**
     * Register a type definition provider (used by e.g. go to type definition).
     */
    export function registerTypeDefinitionProvider(languageId: string, provider: TypeDefinitionProvider): IDisposable;

    /**
     * Register a code lens provider (used by e.g. inline code lenses).
     */
    export function registerCodeLensProvider(languageId: string, provider: CodeLensProvider): IDisposable;

    /**
     * Register a code action provider (used by e.g. quick fix).
     */
    export function registerCodeActionProvider(languageId: string, provider: CodeActionProvider): IDisposable;

    /**
     * Register a formatter that can handle only entire models.
     */
    export function registerDocumentFormattingEditProvider(languageId: string, provider: DocumentFormattingEditProvider): IDisposable;

    /**
     * Register a formatter that can handle a range inside a model.
     */
    export function registerDocumentRangeFormattingEditProvider(languageId: string, provider: DocumentRangeFormattingEditProvider): IDisposable;

    /**
     * Register a formatter than can do formatting as the user types.
     */
    export function registerOnTypeFormattingEditProvider(languageId: string, provider: OnTypeFormattingEditProvider): IDisposable;

    /**
     * Register a link provider that can find links in text.
     */
    export function registerLinkProvider(languageId: string, provider: LinkProvider): IDisposable;

    /**
     * Register a completion item provider (use by e.g. suggestions).
     */
    export function registerCompletionItemProvider(languageId: string, provider: CompletionItemProvider): IDisposable;

    /**
     * Contains additional diagnostic information about the context in which
     * a [code action](#CodeActionProvider.provideCodeActions) is run.
     */
    export interface CodeActionContext {
        /**
         * An array of diagnostics.
         *
         * @readonly
         */
        readonly markers: editor.IMarkerData[];
    }

    /**
     * The code action interface defines the contract between extensions and
     * the [light bulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action) feature.
     */
    export interface CodeActionProvider {
        /**
         * Provide commands for the given document and range.
         */
        provideCodeActions(model: editor.IReadOnlyModel, range: Range, context: CodeActionContext, token: CancellationToken): CodeAction[] | Thenable<CodeAction[]>;
    }

    /**
     * Completion item kinds.
     */
    export enum CompletionItemKind {
        Text = 0,
        Method = 1,
        Function = 2,
        Constructor = 3,
        Field = 4,
        Variable = 5,
        Class = 6,
        Interface = 7,
        Module = 8,
        Property = 9,
        Unit = 10,
        Value = 11,
        Enum = 12,
        Keyword = 13,
        Snippet = 14,
        Color = 15,
        File = 16,
        Reference = 17,
        Folder = 18,
    }

    /**
     * A snippet string is a template which allows to insert text
     * and to control the editor cursor when insertion happens.
     *
     * A snippet can define tab stops and placeholders with `$1`, `$2`
     * and `${3:foo}`. `$0` defines the final tab stop, it defaults to
     * the end of the snippet. Variables are defined with `$name` and
     * `${name:default value}`. The full snippet syntax is documented
     * [here](http://code.visualstudio.com/docs/customization/userdefinedsnippets#_creating-your-own-snippets).
     */
    export interface SnippetString {
        /**
         * The snippet string.
         */
        value: string;
    }

    /**
     * A completion item represents a text snippet that is
     * proposed to complete text that is being typed.
     */
    export interface CompletionItem {
        /**
         * The label of this completion item. By default
         * this is also the text that is inserted when selecting
         * this completion.
         */
        label: string;
        /**
         * The kind of this completion item. Based on the kind
         * an icon is chosen by the editor.
         */
        kind: CompletionItemKind;
        /**
         * A human-readable string with additional information
         * about this item, like type or symbol information.
         */
        detail?: string;
        /**
         * A human-readable string that represents a doc-comment.
         */
        documentation?: string;
        /**
         * A string that should be used when comparing this item
         * with other items. When `falsy` the [label](#CompletionItem.label)
         * is used.
         */
        sortText?: string;
        /**
         * A string that should be used when filtering a set of
         * completion items. When `falsy` the [label](#CompletionItem.label)
         * is used.
         */
        filterText?: string;
        /**
         * A string or snippet that should be inserted in a document when selecting
         * this completion. When `falsy` the [label](#CompletionItem.label)
         * is used.
         */
        insertText?: string | SnippetString;
        /**
         * A range of text that should be replaced by this completion item.
         *
         * Defaults to a range from the start of the [current word](#TextDocument.getWordRangeAtPosition) to the
         * current position.
         *
         * *Note:* The range must be a [single line](#Range.isSingleLine) and it must
         * [contain](#Range.contains) the position at which completion has been [requested](#CompletionItemProvider.provideCompletionItems).
         */
        range?: Range;
        /**
         * @deprecated **Deprecated** in favor of `CompletionItem.insertText` and `CompletionItem.range`.
         *
         * ~~An [edit](#TextEdit) which is applied to a document when selecting
         * this completion. When an edit is provided the value of
         * [insertText](#CompletionItem.insertText) is ignored.~~
         *
         * ~~The [range](#Range) of the edit must be single-line and on the same
         * line completions were [requested](#CompletionItemProvider.provideCompletionItems) at.~~
         */
        textEdit?: editor.ISingleEditOperation;
    }

    /**
     * Represents a collection of [completion items](#CompletionItem) to be presented
     * in the editor.
     */
    export interface CompletionList {
        /**
         * This list it not complete. Further typing should result in recomputing
         * this list.
         */
        isIncomplete?: boolean;
        /**
         * The completion items.
         */
        items: CompletionItem[];
    }

    /**
     * The completion item provider interface defines the contract between extensions and
     * the [IntelliSense](https://code.visualstudio.com/docs/editor/editingevolved#_intellisense).
     *
     * When computing *complete* completion items is expensive, providers can optionally implement
     * the `resolveCompletionItem`-function. In that case it is enough to return completion
     * items with a [label](#CompletionItem.label) from the
     * [provideCompletionItems](#CompletionItemProvider.provideCompletionItems)-function. Subsequently,
     * when a completion item is shown in the UI and gains focus this provider is asked to resolve
     * the item, like adding [doc-comment](#CompletionItem.documentation) or [details](#CompletionItem.detail).
     */
    export interface CompletionItemProvider {
        triggerCharacters?: string[];
        /**
         * Provide completion items for the given position and document.
         */
        provideCompletionItems(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): CompletionItem[] | Thenable<CompletionItem[]> | CompletionList | Thenable<CompletionList>;
        /**
         * Given a completion item fill in more data, like [doc-comment](#CompletionItem.documentation)
         * or [details](#CompletionItem.detail).
         *
         * The editor will only resolve a completion item once.
         */
        resolveCompletionItem?(item: CompletionItem, token: CancellationToken): CompletionItem | Thenable<CompletionItem>;
    }

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
     * The language configuration interface defines the contract between extensions and
     * various editor features, like automatic bracket insertion, automatic indentation etc.
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
         *   /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
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
         * The language's auto closing pairs. The 'close' character is automatically inserted with the
         * 'open' character is typed. If not set, the configured brackets will be used.
         */
        autoClosingPairs?: IAutoClosingPairConditional[];
        /**
         * The language's surrounding pairs. When the 'open' character is typed on a selection, the
         * selected string is surrounded by the open and close characters. If not set, the autoclosing pairs
         * settings will be used.
         */
        surroundingPairs?: IAutoClosingPair[];
        /**
         * **Deprecated** Do not use.
         *
         * @deprecated Will be replaced by a better API soon.
         */
        __electricCharacterSupport?: IBracketElectricCharacterContribution;
    }

    /**
     * Describes indentation rules for a language.
     */
    export interface IndentationRule {
        /**
         * If a line matches this pattern, then all the lines after it should be unindendented once (until another rule matches).
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
         * The action to execute.
         */
        action: EnterAction;
    }

    export interface IBracketElectricCharacterContribution {
        docComment?: IDocComment;
    }

    /**
     * Definition of documentation comments (e.g. Javadoc/JSdoc)
     */
    export interface IDocComment {
        /**
         * The string that starts a doc comment (e.g. '/**')
         */
        open: string;
        /**
         * The string that appears on the last line and closes the doc comment (e.g. ' * /').
         */
        close: string;
    }

    /**
     * A tuple of two characters, like a pair of
     * opening and closing brackets.
     */
    export type CharacterPair = [string, string];

    export interface IAutoClosingPair {
        open: string;
        close: string;
    }

    export interface IAutoClosingPairConditional extends IAutoClosingPair {
        notIn?: string[];
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
        Outdent = 3,
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
         * Describe whether to outdent current line.
         */
        outdentCurrentLine?: boolean;
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
     * The state of the tokenizer between two lines.
     * It is useful to store flags such as in multiline comment, etc.
     * The model will clone the previous line's state and pass it in to tokenize the next line.
     */
    export interface IState {
        clone(): IState;
        equals(other: IState): boolean;
    }

    /**
     * A hover represents additional information for a symbol or word. Hovers are
     * rendered in a tooltip-like widget.
     */
    export interface Hover {
        /**
         * The contents of this hover.
         */
        contents: MarkedString[];
        /**
         * The range to which this hover applies. When missing, the
         * editor will use the range at the current position or the
         * current position itself.
         */
        range: IRange;
    }

    /**
     * The hover provider interface defines the contract between extensions and
     * the [hover](https://code.visualstudio.com/docs/editor/editingevolved#_hover)-feature.
     */
    export interface HoverProvider {
        /**
         * Provide a hover for the given position and document. Multiple hovers at the same
         * position will be merged by the editor. A hover can have a range which defaults
         * to the word range at the position when omitted.
         */
        provideHover(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): Hover | Thenable<Hover>;
    }

    /**
     * Interface used to quick fix typing errors while accesing member fields.
     */
    export interface CodeAction {
        command: Command;
        score: number;
    }

    /**
     * Represents a parameter of a callable-signature. A parameter can
     * have a label and a doc-comment.
     */
    export interface ParameterInformation {
        /**
         * The label of this signature. Will be shown in
         * the UI.
         */
        label: string;
        /**
         * The human-readable doc-comment of this signature. Will be shown
         * in the UI but can be omitted.
         */
        documentation?: string;
    }

    /**
     * Represents the signature of something callable. A signature
     * can have a label, like a function-name, a doc-comment, and
     * a set of parameters.
     */
    export interface SignatureInformation {
        /**
         * The label of this signature. Will be shown in
         * the UI.
         */
        label: string;
        /**
         * The human-readable doc-comment of this signature. Will be shown
         * in the UI but can be omitted.
         */
        documentation?: string;
        /**
         * The parameters of this signature.
         */
        parameters: ParameterInformation[];
    }

    /**
     * Signature help represents the signature of something
     * callable. There can be multiple signatures but only one
     * active and only one active parameter.
     */
    export interface SignatureHelp {
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
     * The signature help provider interface defines the contract between extensions and
     * the [parameter hints](https://code.visualstudio.com/docs/editor/editingevolved#_parameter-hints)-feature.
     */
    export interface SignatureHelpProvider {
        signatureHelpTriggerCharacters: string[];
        /**
         * Provide help for the signature at the given position and document.
         */
        provideSignatureHelp(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): SignatureHelp | Thenable<SignatureHelp>;
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
        Write = 2,
    }

    /**
     * A document highlight is a range inside a text document which deserves
     * special attention. Usually a document highlight is visualized by changing
     * the background color of its range.
     */
    export interface DocumentHighlight {
        /**
         * The range this highlight applies to.
         */
        range: IRange;
        /**
         * The highlight kind, default is [text](#DocumentHighlightKind.Text).
         */
        kind: DocumentHighlightKind;
    }

    /**
     * The document highlight provider interface defines the contract between extensions and
     * the word-highlight-feature.
     */
    export interface DocumentHighlightProvider {
        /**
         * Provide a set of document highlights, like all occurrences of a variable or
         * all exit-points of a function.
         */
        provideDocumentHighlights(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): DocumentHighlight[] | Thenable<DocumentHighlight[]>;
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
         */
        provideReferences(model: editor.IReadOnlyModel, position: Position, context: ReferenceContext, token: CancellationToken): Location[] | Thenable<Location[]>;
    }

    /**
     * Represents a location inside a resource, such as a line
     * inside a text file.
     */
    export interface Location {
        /**
         * The resource identifier of this location.
         */
        uri: Uri;
        /**
         * The document range of this locations.
         */
        range: IRange;
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
         */
        provideDefinition(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): Definition | Thenable<Definition>;
    }

    /**
     * The implementation provider interface defines the contract between extensions and
     * the go to implementation feature.
     */
    export interface ImplementationProvider {
        /**
         * Provide the implementation of the symbol at the given position and document.
         */
        provideImplementation(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): Definition | Thenable<Definition>;
    }

    /**
     * The type definition provider interface defines the contract between extensions and
     * the go to type definition feature.
     */
    export interface TypeDefinitionProvider {
        /**
         * Provide the type definition of the symbol at the given position and document.
         */
        provideTypeDefinition(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): Definition | Thenable<Definition>;
    }

    /**
     * A symbol kind.
     */
    export enum SymbolKind {
        File = 0,
        Module = 1,
        Namespace = 2,
        Package = 3,
        Class = 4,
        Method = 5,
        Property = 6,
        Field = 7,
        Constructor = 8,
        Enum = 9,
        Interface = 10,
        Function = 11,
        Variable = 12,
        Constant = 13,
        String = 14,
        Number = 15,
        Boolean = 16,
        Array = 17,
        Object = 18,
        Key = 19,
        Null = 20,
    }

    /**
     * Represents information about programming constructs like variables, classes,
     * interfaces etc.
     */
    export interface SymbolInformation {
        /**
         * The name of this symbol.
         */
        name: string;
        /**
         * The name of the symbol containing this symbol.
         */
        containerName?: string;
        /**
         * The kind of this symbol.
         */
        kind: SymbolKind;
        /**
         * The location of this symbol.
         */
        location: Location;
    }

    /**
     * The document symbol provider interface defines the contract between extensions and
     * the [go to symbol](https://code.visualstudio.com/docs/editor/editingevolved#_goto-symbol)-feature.
     */
    export interface DocumentSymbolProvider {
        /**
         * Provide symbol information for the given document.
         */
        provideDocumentSymbols(model: editor.IReadOnlyModel, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]>;
    }

    /**
     * Interface used to format a model
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
    }

    /**
     * The document formatting provider interface defines the contract between extensions and
     * the formatting-feature.
     */
    export interface DocumentFormattingEditProvider {
        /**
         * Provide formatting edits for a whole document.
         */
        provideDocumentFormattingEdits(model: editor.IReadOnlyModel, options: FormattingOptions, token: CancellationToken): editor.ISingleEditOperation[] | Thenable<editor.ISingleEditOperation[]>;
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
         */
        provideDocumentRangeFormattingEdits(model: editor.IReadOnlyModel, range: Range, options: FormattingOptions, token: CancellationToken): editor.ISingleEditOperation[] | Thenable<editor.ISingleEditOperation[]>;
    }

    /**
     * The document formatting provider interface defines the contract between extensions and
     * the formatting-feature.
     */
    export interface OnTypeFormattingEditProvider {
        autoFormatTriggerCharacters: string[];
        /**
         * Provide formatting edits after a character has been typed.
         *
         * The given position and character should hint to the provider
         * what range the position to expand to, like find the matching `{`
         * when `}` has been entered.
         */
        provideOnTypeFormattingEdits(model: editor.IReadOnlyModel, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): editor.ISingleEditOperation[] | Thenable<editor.ISingleEditOperation[]>;
    }

    /**
     * A link inside the editor.
     */
    export interface ILink {
        range: IRange;
        url: string;
    }

    /**
     * A provider of links.
     */
    export interface LinkProvider {
        provideLinks(model: editor.IReadOnlyModel, token: CancellationToken): ILink[] | Thenable<ILink[]>;
        resolveLink?: (link: ILink, token: CancellationToken) => ILink | Thenable<ILink>;
    }

    export interface IResourceEdit {
        resource: Uri;
        range: IRange;
        newText: string;
    }

    export interface WorkspaceEdit {
        edits: IResourceEdit[];
        rejectReason?: string;
    }

    export interface RenameProvider {
        provideRenameEdits(model: editor.IReadOnlyModel, position: Position, newName: string, token: CancellationToken): WorkspaceEdit | Thenable<WorkspaceEdit>;
    }

    export interface Command {
        id: string;
        title: string;
        arguments?: any[];
    }

    export interface ICodeLensSymbol {
        range: IRange;
        id?: string;
        command?: Command;
    }

    export interface CodeLensProvider {
        onDidChange?: IEvent<this>;
        provideCodeLenses(model: editor.IReadOnlyModel, token: CancellationToken): ICodeLensSymbol[] | Thenable<ICodeLensSymbol[]>;
        resolveCodeLens?(model: editor.IReadOnlyModel, codeLens: ICodeLensSymbol, token: CancellationToken): ICodeLensSymbol | Thenable<ICodeLensSymbol>;
    }

    export interface ILanguageExtensionPoint {
        id: string;
        extensions?: string[];
        filenames?: string[];
        filenamePatterns?: string[];
        firstLine?: string;
        aliases?: string[];
        mimetypes?: string[];
        configuration?: string;
    }
    /**
     * A Monarch language definition
     */
    export interface IMonarchLanguage {
        /**
         * map from string to ILanguageRule[]
         */
        tokenizer: {
            [name: string]: IMonarchLanguageRule[];
        };
        /**
         * is the language case insensitive?
         */
        ignoreCase?: boolean;
        /**
         * if no match in the tokenizer assign this token class (default 'source')
         */
        defaultToken?: string;
        /**
         * for example [['{','}','delimiter.curly']]
         */
        brackets?: IMonarchLanguageBracket[];
        /**
         * start symbol in the tokenizer (by default the first entry is used)
         */
        start?: string;
        /**
         * attach this to every token class (by default '.' + name)
         */
        tokenPostfix: string;
    }

    /**
     * A rule is either a regular expression and an action
     * 		shorthands: [reg,act] == { regex: reg, action: act}
     *		and       : [reg,act,nxt] == { regex: reg, action: act{ next: nxt }}
     */
    export interface IMonarchLanguageRule {
        /**
         * match tokens
         */
        regex?: string | RegExp;
        /**
         * action to take on match
         */
        action?: IMonarchLanguageAction;
        /**
         * or an include rule. include all rules from the included state
         */
        include?: string;
    }

    /**
     * An action is either an array of actions...
     * ... or a case statement with guards...
     * ... or a basic action with a token value.
     */
    export interface IMonarchLanguageAction {
        /**
         * array of actions for each parenthesized match group
         */
        group?: IMonarchLanguageAction[];
        /**
         * map from string to ILanguageAction
         */
        cases?: Object;
        /**
         * token class (ie. css class) (or "@brackets" or "@rematch")
         */
        token?: string;
        /**
         * the next state to push, or "@push", "@pop", "@popall"
         */
        next?: string;
        /**
         * switch to this state
         */
        switchTo?: string;
        /**
         * go back n characters in the stream
         */
        goBack?: number;
        /**
         * @open or @close
         */
        bracket?: string;
        /**
         * switch to embedded language (useing the mimetype) or get out using "@pop"
         */
        nextEmbedded?: string;
        /**
         * log a message to the browser console window
         */
        log?: string;
    }

    /**
     * This interface can be shortened as an array, ie. ['{','}','delimiter.curly']
     */
    export interface IMonarchLanguageBracket {
        /**
         * open bracket
         */
        open: string;
        /**
         * closeing bracket
         */
        close: string;
        /**
         * token class
         */
        token: string;
    }

}

declare module monaco.worker {


    export interface IMirrorModel {
        readonly uri: Uri;
        readonly version: number;
        getValue(): string;
    }

    export interface IWorkerContext {
        /**
         * Get all available mirror models in this worker.
         */
        getMirrorModels(): IMirrorModel[];
    }

}