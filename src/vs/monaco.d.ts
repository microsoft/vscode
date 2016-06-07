declare module monaco {

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

    export interface IDisposable {
        dispose(): void;
    }

    export interface IEvent<T> {
        (listener: (e: T) => any, thisArg?: any): IDisposable;
    }

    export class Emitter<T> {
        constructor();
        event: IEvent<T>;
        fire(event?: T): void;
        dispose(): void;
    }

    export enum Severity {
        Ignore = 0,
        Info = 1,
        Warning = 2,
        Error = 3,
    }



    // --- Generic promise
    export interface TValueCallback<T> {
        (value: T): void;
    }


    export interface ProgressCallback {
        (progress: any): any;
    }


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

        public static as<ValueType>(value: ValueType): Promise<ValueType>;
        public static is(value: any): value is Promise<any>;
        public static timeout(delay: number): Promise<void>;
        public static join<ValueType>(promises: Promise<ValueType>[]): Promise<ValueType[]>;
        public static join<ValueType>(promises: Thenable<ValueType>[]): Thenable<ValueType[]>;
        public static join<ValueType>(promises: { [n: string]: Promise<ValueType> }): Promise<{ [n: string]: ValueType }>;
        public static any<ValueType>(promises: Promise<ValueType>[]): Promise<{ key: string; value: Promise<ValueType>; }>;
        public static wrapError<ValueType>(error: any): Promise<ValueType>;
    }

    export class CancellationTokenSource {
        token: CancellationToken;
        cancel(): void;
        dispose(): void;
    }

    export interface CancellationToken {
        isCancellationRequested: boolean;
        onCancellationRequested: IEvent<any>;
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
        constructor();
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
         * Returns a string representing the corresponding file system path of this Uri.
         * Will handle UNC paths and normalize windows drive letters to lower-case. Also
         * uses the platform specific path separator. Will *not* validate the path for
         * invalid characters and semantics. Will *not* look at the scheme of this Uri.
         */
        fsPath: string;
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
         */
        MAX_VALUE = 109,
    }

    export class KeyMod {
        static CtrlCmd: number;
        static Shift: number;
        static Alt: number;
        static WinCtrl: number;
        static chord(firstPart: number, secondPart: number): number;
    }
    export interface IHTMLContentElementCode {
        language: string;
        value: string;
    }

    export interface IHTMLContentElement {
        /**
         * supports **bold**, __italics__, and [[actions]]
         */
        formattedText?: string;
        text?: string;
        className?: string;
        style?: string;
        customStyle?: any;
        tagName?: string;
        children?: IHTMLContentElement[];
        isText?: boolean;
        role?: string;
        markdown?: string;
        code?: IHTMLContentElementCode;
    }

    export interface IKeyboardEvent {
        browserEvent: Event;
        target: HTMLElement;
        ctrlKey: boolean;
        shiftKey: boolean;
        altKey: boolean;
        metaKey: boolean;
        keyCode: KeyCode;
        clone(): IKeyboardEvent;
        asKeybinding(): number;
        equals(keybinding: number): boolean;
        preventDefault(): void;
        stopPropagation(): void;
    }
    export interface IMouseEvent {
        browserEvent: MouseEvent;
        leftButton: boolean;
        middleButton: boolean;
        rightButton: boolean;
        target: HTMLElement;
        detail: number;
        posx: number;
        posy: number;
        ctrlKey: boolean;
        shiftKey: boolean;
        altKey: boolean;
        metaKey: boolean;
        timestamp: number;
        preventDefault(): void;
        stopPropagation(): void;
    }

    export interface IScrollEvent {
        scrollTop: number;
        scrollLeft: number;
        scrollWidth: number;
        scrollHeight: number;
        scrollTopChanged: boolean;
        scrollLeftChanged: boolean;
        scrollWidthChanged: boolean;
        scrollHeightChanged: boolean;
    }

    /**
     * A position in the editor. This interface is suitable for serialization.
     */
    export interface IPosition {
        /**
         * line number (starts at 1)
         */
        lineNumber: number;
        /**
         * column (the first character in a line is between column 1 and column 2)
         */
        column: number;
    }

    /**
     * A range in the editor. This interface is suitable for serialization.
     */
    export interface IRange {
        /**
         * Line number on which the range starts (starts at 1).
         */
        startLineNumber: number;
        /**
         * Column on which the range starts in line `startLineNumber` (starts at 1).
         */
        startColumn: number;
        /**
         * Line number on which the range ends.
         */
        endLineNumber: number;
        /**
         * Column on which the range ends in line `endLineNumber`.
         */
        endColumn: number;
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

    /**
     * A selection in the editor.
     * The selection is a range that has an orientation.
     */
    export interface ISelection {
        /**
         * The line number on which the selection has started.
         */
        selectionStartLineNumber: number;
        /**
         * The column on `selectionStartLineNumber` where the selection has started.
         */
        selectionStartColumn: number;
        /**
         * The line number on which the selection has ended.
         */
        positionLineNumber: number;
        /**
         * The column on `positionLineNumber` where the selection has ended.
         */
        positionColumn: number;
    }

    /**
     * A position in the editor.
     */
    export class Position {
        lineNumber: number;
        column: number;
        constructor(lineNumber: number, column: number);
        /**
         * Test if this position equals other position
         */
        equals(other: IPosition): boolean;
        static equals(a: IPosition, b: IPosition): boolean;
        /**
         * Test if this position is before other position. If the two positions are equal, the result will be false.
         */
        isBefore(other: IPosition): boolean;
        static isBefore(a: IPosition, b: IPosition): boolean;
        /**
         * Test if this position is before other position. If the two positions are equal, the result will be true.
         */
        isBeforeOrEqual(other: IPosition): boolean;
        static isBeforeOrEqual(a: IPosition, b: IPosition): boolean;
        /**
         * Clone this position.
         */
        clone(): Position;
        toString(): string;
        static lift(pos: IPosition): Position;
        static isIPosition(obj: any): obj is IPosition;
        static asEmptyRange(position: IPosition): IRange;
        static startPosition(range: IRange): IPosition;
        static endPosition(range: IRange): IPosition;
    }

    /**
     * A range in the editor.
     */
    export class Range {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
        constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number);
        /**
         * Test if this range is empty.
         */
        isEmpty(): boolean;
        /**
         * Test if position is in this range. If the position is at the edges, will return true.
         */
        containsPosition(position: IPosition): boolean;
        /**
         * Test if range is in this range. If the range is equal to this range, will return true.
         */
        containsRange(range: IRange): boolean;
        /**
         * A reunion of the two ranges. The smallest position will be used as the start point, and the largest one as the end point.
         */
        plusRange(range: IRange): Range;
        /**
         * A intersection of the two ranges.
         */
        intersectRanges(range: IRange): Range;
        /**
         * Test if this range equals other.
         */
        equalsRange(other: IRange): boolean;
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
        collapseToStart(): Range;
        static lift(range: IRange): Range;
        static isIRange(obj: any): obj is IRange;
        static isEmpty(range: IRange): boolean;
        static containsPosition(range: IRange, position: IPosition): boolean;
        static containsRange(range: IRange, otherRange: IRange): boolean;
        static areIntersectingOrTouching(a: IRange, b: IRange): boolean;
        static intersectRanges(a: IRange, b: IRange): Range;
        static plusRange(a: IRange, b: IRange): Range;
        static equalsRange(a: IRange, b: IRange): boolean;
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
        static spansMultipleLines(range: IRange): boolean;
        static collapseToStart(range: IRange): IRange;
    }

    /**
     * A selection in the editor.
     */
    export class Selection extends Range {
        selectionStartLineNumber: number;
        selectionStartColumn: number;
        positionLineNumber: number;
        positionColumn: number;
        constructor(selectionStartLineNumber: number, selectionStartColumn: number, positionLineNumber: number, positionColumn: number);
        /**
         * Clone this selection.
         */
        clone(): Selection;
        toString(): string;
        /**
         * Test if equals other selection.
         */
        equalsSelection(other: ISelection): boolean;
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
        static createSelection(selectionStartLineNumber: number, selectionStartColumn: number, positionLineNumber: number, positionColumn: number): Selection;
        static liftSelection(sel: ISelection): Selection;
        static selectionsEqual(a: ISelection, b: ISelection): boolean;
        static selectionsArrEqual(a: ISelection[], b: ISelection[]): boolean;
        static isISelection(obj: any): boolean;
        static createWithDirection(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, direction: SelectionDirection): Selection;
    }
}

declare module monaco.editor {


    export function create(domElement: HTMLElement, options: IEditorConstructionOptions, services: IEditorOverrideServices): ICodeEditor;

    export function createDiffEditor(domElement: HTMLElement, options: IDiffEditorConstructionOptions, services: IEditorOverrideServices): IDiffEditor;

    export function createModel(value: string, language?: string, uri?: Uri): IModel;

    export function setModelLanguage(model: IModel, language: string): void;

    export function setModelMarkers(model: IModel, owner: string, markers: IMarkerData[]): void;

    export function getModel(uri: Uri): IModel;

    export function getModels(): IModel[];

    export function onDidCreateModel(listener: (model: IModel) => void): IDisposable;

    export function onWillDisposeModel(listener: (model: IModel) => void): IDisposable;

    export function onDidChangeModelLanguage(listener: (e: {
        model: IModel;
        oldLanguage: string;
    }) => void): IDisposable;

    export class MonacoWebWorker<T> {
        dispose(): void;
        getProxy(): Promise<T>;
        withSyncedResources(resources: Uri[]): Promise<void>;
    }

    export interface IWebWorkerOptions {
        moduleId: string;
    }

    export function createWebWorker<T>(opts: IWebWorkerOptions): MonacoWebWorker<T>;

    export function colorizeElement(domNode: HTMLElement, options: IColorizerElementOptions): Promise<void>;

    export function colorize(text: string, modeId: string, options: IColorizerOptions): Promise<string>;

    export function colorizeModelLine(model: IModel, lineNumber: number, tabSize?: number): string;

    export interface IEditorConstructionOptions extends ICodeEditorWidgetCreationOptions {
        value?: string;
        language?: string;
    }

    export interface IDiffEditorConstructionOptions extends IDiffEditorOptions {
    }

    export interface IEditorOverrideServices {
    }

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

    export interface IAction extends IDisposable {
        id: string;
        label: string;
        tooltip: string;
        class: string;
        enabled: boolean;
        checked: boolean;
        run(event?: any): Promise<any>;
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
         * Defaults to false.
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
        verticalSliderSize?: number;
        horizontalSliderSize?: number;
    }

    export enum WrappingIndent {
        None = 0,
        Same = 1,
        Indent = 2,
    }

    /**
     * Configuration options for the editor.
     */
    export interface IEditorOptions {
        experimentalScreenReader?: boolean;
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
        lineNumbers?: any;
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
         * Defaults to false.
         */
        glyphMargin?: boolean;
        /**
         * The width reserved for line decorations (in px).
         * Line decorations are placed between line numbers and the editor content.
         * Defaults to 10.
         */
        lineDecorationsWidth?: number;
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
         * Theme to be used for rendering. Consists of two parts, the UI theme and the syntax theme,
         * separated by a space.
         * The current available UI themes are: 'vs' (default), 'vs-dark', 'hc-black'
         * The syntax themes are contributed. The default is 'default-theme'
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
         * The number of vertical lanes the overview ruler should render.
         * Defaults to 2.
         */
        overviewRulerLanes?: number;
        /**
         * Control the cursor blinking animation.
         * Defaults to 'blink'.
         */
        cursorBlinking?: string;
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
         * Control indentation of wrapped lines. Can be: 'none', 'same' or 'indent'.
         * Defaults to 'none'.
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
         * Control what pressing Tab does.
         * If it is false, pressing Tab or Shift-Tab will be handled by the editor.
         * If it is true, pressing Tab or Shift-Tab will move the browser focus.
         * Defaults to false.
         */
        tabFocusMode?: boolean;
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
         * Enable quick suggestions (shaddow suggestions)
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
         * Enable selection highlight.
         * Defaults to true.
         */
        selectionHighlight?: boolean;
        /**
         * Show lines before classes and methods (based on outline info).
         * Defaults to false.
         */
        outlineMarkers?: boolean;
        /**
         * Show reference infos (a.k.a. code lenses) for modes that support it
         * Defaults to true.
         */
        referenceInfos?: boolean;
        /**
         * Enable code folding
         * Defaults to true.
         */
        folding?: boolean;
        /**
         * Enable rendering of leading whitespace.
         * Defaults to false.
         */
        renderWhitespace?: boolean;
        /**
         * Enable rendering of indent guides.
         * Defaults to true.
         */
        indentGuides?: boolean;
        /**
         * Inserting and deleting whitespace follows tab stops.
         */
        useTabStops?: boolean;
        /**
         * The font family
         */
        fontFamily?: string;
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
         * Original model should be editable?
         * Defaults to false.
         */
        originalEditable?: boolean;
    }

    export class InternalEditorScrollbarOptions {
        _internalEditorScrollbarOptionsBrand: void;
        arrowSize: number;
        vertical: ScrollbarVisibility;
        horizontal: ScrollbarVisibility;
        useShadows: boolean;
        verticalHasArrows: boolean;
        horizontalHasArrows: boolean;
        handleMouseWheel: boolean;
        horizontalScrollbarSize: number;
        horizontalSliderSize: number;
        verticalScrollbarSize: number;
        verticalSliderSize: number;
        mouseWheelScrollSensitivity: number;
    }

    export class EditorWrappingInfo {
        _editorWrappingInfoBrand: void;
        isViewportWrapping: boolean;
        wrappingColumn: number;
        wrappingIndent: WrappingIndent;
        wordWrapBreakBeforeCharacters: string;
        wordWrapBreakAfterCharacters: string;
        wordWrapBreakObtrusiveCharacters: string;
    }

    export class InternalEditorViewOptions {
        _internalEditorViewOptionsBrand: void;
        theme: string;
        canUseTranslate3d: boolean;
        experimentalScreenReader: boolean;
        rulers: number[];
        ariaLabel: string;
        lineNumbers: any;
        selectOnLineNumbers: boolean;
        glyphMargin: boolean;
        revealHorizontalRightPadding: number;
        roundedSelection: boolean;
        overviewRulerLanes: number;
        cursorBlinking: string;
        cursorStyle: TextEditorCursorStyle;
        hideCursorInOverviewRuler: boolean;
        scrollBeyondLastLine: boolean;
        editorClassName: string;
        stopRenderingLineAfter: number;
        renderWhitespace: boolean;
        indentGuides: boolean;
        scrollbar: InternalEditorScrollbarOptions;
    }

    export interface IViewConfigurationChangedEvent {
        theme: boolean;
        canUseTranslate3d: boolean;
        experimentalScreenReader: boolean;
        rulers: boolean;
        ariaLabel: boolean;
        lineNumbers: boolean;
        selectOnLineNumbers: boolean;
        glyphMargin: boolean;
        revealHorizontalRightPadding: boolean;
        roundedSelection: boolean;
        overviewRulerLanes: boolean;
        cursorBlinking: boolean;
        cursorStyle: boolean;
        hideCursorInOverviewRuler: boolean;
        scrollBeyondLastLine: boolean;
        editorClassName: boolean;
        stopRenderingLineAfter: boolean;
        renderWhitespace: boolean;
        indentGuides: boolean;
        scrollbar: boolean;
    }

    export class EditorContribOptions {
        selectionClipboard: boolean;
        hover: boolean;
        contextmenu: boolean;
        quickSuggestions: boolean;
        quickSuggestionsDelay: number;
        parameterHints: boolean;
        iconsInSuggestions: boolean;
        formatOnType: boolean;
        suggestOnTriggerCharacters: boolean;
        acceptSuggestionOnEnter: boolean;
        selectionHighlight: boolean;
        outlineMarkers: boolean;
        referenceInfos: boolean;
        folding: boolean;
    }

    /**
     * Internal configuration options (transformed or computed) for the editor.
     */
    export class InternalEditorOptions {
        _internalEditorOptionsBrand: void;
        lineHeight: number;
        readOnly: boolean;
        wordSeparators: string;
        autoClosingBrackets: boolean;
        useTabStops: boolean;
        tabFocusMode: boolean;
        layoutInfo: EditorLayoutInfo;
        fontInfo: FontInfo;
        viewInfo: InternalEditorViewOptions;
        wrappingInfo: EditorWrappingInfo;
        contribInfo: EditorContribOptions;
    }

    /**
     * An event describing that the configuration of the editor has changed.
     */
    export interface IConfigurationChangedEvent {
        lineHeight: boolean;
        readOnly: boolean;
        wordSeparators: boolean;
        autoClosingBrackets: boolean;
        useTabStops: boolean;
        tabFocusMode: boolean;
        layoutInfo: boolean;
        fontInfo: boolean;
        viewInfo: IViewConfigurationChangedEvent;
        wrappingInfo: boolean;
        contribInfo: boolean;
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
         * Message to be rendered when hovering over the decoration.
         */
        hoverMessage?: string;
        /**
         * Array of IHTMLContentElements to render as the decoration message.
         */
        htmlMessage?: IHTMLContentElement[];
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
         * If set, the decoration will be rendered inline with the text with this CSS class name.
         * Please use this only for CSS rules that must impact the text. For example, use `className`
         * to have a background color decoration.
         */
        inlineClassName?: string;
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
        id: string;
        /**
         * Identifier for a decoration's owener.
         */
        ownerId: number;
        /**
         * Range that this decoration covers.
         */
        range: Range;
        /**
         * Options associated with this decoration.
         */
        options: IModelDecorationOptions;
    }

    /**
     * Word inside a model.
     */
    export interface IWordAtPosition {
        /**
         * The word.
         */
        word: string;
        /**
         * The column where the word starts.
         */
        startColumn: number;
        /**
         * The column where the word ends.
         */
        endColumn: number;
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
     * And identifier for a single edit operation.
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

    export interface ITextModelResolvedOptions {
        tabSize: number;
        insertSpaces: boolean;
        defaultEOL: DefaultEndOfLine;
        trimAutoWhitespace: boolean;
    }

    export interface ITextModelUpdateOptions {
        tabSize?: number;
        insertSpaces?: boolean;
        trimAutoWhitespace?: boolean;
    }

    export interface IModelOptionsChangedEvent {
        tabSize: boolean;
        insertSpaces: boolean;
        trimAutoWhitespace: boolean;
    }

    /**
     * A textual read-only model.
     */
    export interface ITextModel {
        getOptions(): ITextModelResolvedOptions;
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
         */
        setValueFromRawText(newValue: IRawText): void;
        /**
         * Get the text stored in this model.
         * @param eol The end of line character preference. Defaults to `EndOfLinePreference.TextDefined`.
         * @param preserverBOM Preserve a BOM character if it was detected when the model was constructed.
         * @return The text.
         */
        getValue(eol?: EndOfLinePreference, preserveBOM?: boolean): string;
        getValueLength(eol?: EndOfLinePreference, preserveBOM?: boolean): number;
        toRawText(): IRawText;
        equals(other: IRawText): boolean;
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
         * Get the end of line character predominantly used in the text buffer.
         * @return EOL char sequence (e.g.: '\n' or '\r\n').
         */
        getEOL(): string;
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
    }

    export interface IReadOnlyModel extends ITextModel {
        /**
         * Gets the resource associated with this editor model.
         */
        uri: Uri;
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
         * Get the current language mode associated with the model.
         */
        getMode(): languages.IMode;
        /**
         * Set the current language mode associated with the model.
         */
        setMode(newMode: languages.IMode | Promise<languages.IMode>): void;
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

    export enum TrackedRangeStickiness {
        AlwaysGrowsWhenTypingAtEdges = 0,
        NeverGrowsWhenTypingAtEdges = 1,
        GrowsOnlyWhenTypingBefore = 2,
        GrowsOnlyWhenTypingAfter = 3,
    }

    /**
     * A model that can track ranges.
     */
    export interface ITextModelWithTrackedRanges extends ITextModel {
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
        normalizeIndentation(str: string): string;
        getOneIndent(): string;
        updateOptions(newOpts: ITextModelUpdateOptions): void;
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
    export interface IModel extends IReadOnlyModel, IEditableTextModel, ITextModelWithMarkers, ITokenizedModel, ITextModelWithTrackedRanges, ITextModelWithDecorations, IEditorModel {
        onDidChangeRawContent(listener: (e: IModelContentChangedEvent) => void): IDisposable;
        onDidChangeContent(listener: (e: IModelContentChangedEvent2) => void): IDisposable;
        onDidChangeDecorations(listener: (e: IModelDecorationsChangedEvent) => void): IDisposable;
        onDidChangeOptions(listener: (e: IModelOptionsChangedEvent) => void): IDisposable;
        onDidChangeMode(listener: (e: IModelModeChangedEvent) => void): IDisposable;
        onWillDispose(listener: () => void): IDisposable;
        /**
         * A unique identifier associated with this model.
         */
        id: string;
        /**
         * Destroy this model. This will unbind the model from the mode
         * and make all necessary clean-up to release this object to the GC.
         */
        dispose(): void;
        /**
         * Search the model.
         * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
         * @param searchOnlyEditableRange Limit the searching to only search inside the editable range of the model.
         * @param isRegex Used to indicate that `searchString` is a regular expression.
         * @param matchCase Force the matching to match lower/upper case exactly.
         * @param wholeWord Force the matching to match entire words only.
         * @param limitResultCount Limit the number of results
         * @return The ranges where the matches are. It is empty if not matches have been found.
         */
        findMatches(searchString: string, searchOnlyEditableRange: boolean, isRegex: boolean, matchCase: boolean, wholeWord: boolean, limitResultCount?: number): Range[];
        /**
         * Search the model.
         * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
         * @param searchScope Limit the searching to only search inside this range.
         * @param isRegex Used to indicate that `searchString` is a regular expression.
         * @param matchCase Force the matching to match lower/upper case exactly.
         * @param wholeWord Force the matching to match entire words only.
         * @param limitResultCount Limit the number of results
         * @return The ranges where the matches are. It is empty if no matches have been found.
         */
        findMatches(searchString: string, searchScope: IRange, isRegex: boolean, matchCase: boolean, wholeWord: boolean, limitResultCount?: number): Range[];
        /**
         * Search the model for the next match. Loops to the beginning of the model if needed.
         * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
         * @param searchStart Start the searching at the specified position.
         * @param isRegex Used to indicate that `searchString` is a regular expression.
         * @param matchCase Force the matching to match lower/upper case exactly.
         * @param wholeWord Force the matching to match entire words only.
         * @return The range where the next match is. It is null if no next match has been found.
         */
        findNextMatch(searchString: string, searchStart: IPosition, isRegex: boolean, matchCase: boolean, wholeWord: boolean): Range;
        /**
         * Search the model for the previous match. Loops to the end of the model if needed.
         * @param searchString The string used to search. If it is a regular expression, set `isRegex` to true.
         * @param searchStart Start the searching at the specified position.
         * @param isRegex Used to indicate that `searchString` is a regular expression.
         * @param matchCase Force the matching to match lower/upper case exactly.
         * @param wholeWord Force the matching to match entire words only.
         * @return The range where the previous match is. It is null if no previous match has been found.
         */
        findPreviousMatch(searchString: string, searchStart: IPosition, isRegex: boolean, matchCase: boolean, wholeWord: boolean): Range;
    }

    /**
     * An event describing that the current mode associated with a model has changed.
     */
    export interface IModelModeChangedEvent {
        /**
         * Previous mode
         */
        oldMode: languages.IMode;
        /**
         * New mode
         */
        newMode: languages.IMode;
    }

    /**
     * An event describing a change in the text of a model.
     */
    export interface IModelContentChangedEvent2 {
        /**
         * The range that got replaced.
         */
        range: IRange;
        /**
         * The length of the range that got replaced.
         */
        rangeLength: number;
        /**
         * The new text for the range.
         */
        text: string;
        /**
         * The (new) end-of-line character.
         */
        eol: string;
        /**
         * The new version id the model has transitioned to.
         */
        versionId: number;
        /**
         * Flag that indicates that this event was generated while undoing.
         */
        isUndoing: boolean;
        /**
         * Flag that indicates that this event was generated while redoing.
         */
        isRedoing: boolean;
    }

    /**
     * An event describing a change in the text of a model.
     */
    export interface IModelContentChangedEvent {
        /**
         * The event type. It can be used to detect the actual event type:
         * 		EditorCommon.EventType.ModelContentChangedFlush => IModelContentChangedFlushEvent
         * 		EditorCommon.EventType.ModelContentChangedLinesDeleted => IModelContentChangedLineChangedEvent
         * 		EditorCommon.EventType.ModelContentChangedLinesInserted => IModelContentChangedLinesDeletedEvent
         * 		EditorCommon.EventType.ModelContentChangedLineChanged => IModelContentChangedLinesInsertedEvent
         */
        changeType: string;
        /**
         * The new version id the model has transitioned to.
         */
        versionId: number;
        /**
         * Flag that indicates that this event was generated while undoing.
         */
        isUndoing: boolean;
        /**
         * Flag that indicates that this event was generated while redoing.
         */
        isRedoing: boolean;
    }

    export interface IRawText {
        length: number;
        lines: string[];
        BOM: string;
        EOL: string;
        options: ITextModelResolvedOptions;
    }

    /**
     * An event describing that a model has been reset to a new value.
     */
    export interface IModelContentChangedFlushEvent extends IModelContentChangedEvent {
        /**
         * The new text content of the model.
         */
        detail: IRawText;
    }

    /**
     * An event describing that a line has changed in a model.
     */
    export interface IModelContentChangedLineChangedEvent extends IModelContentChangedEvent {
        /**
         * The line that has changed.
         */
        lineNumber: number;
        /**
         * The new value of the line.
         */
        detail: string;
    }

    /**
     * An event describing that line(s) have been deleted in a model.
     */
    export interface IModelContentChangedLinesDeletedEvent extends IModelContentChangedEvent {
        /**
         * At what line the deletion began (inclusive).
         */
        fromLineNumber: number;
        /**
         * At what line the deletion stopped (inclusive).
         */
        toLineNumber: number;
    }

    /**
     * An event describing that line(s) have been inserted in a model.
     */
    export interface IModelContentChangedLinesInsertedEvent extends IModelContentChangedEvent {
        /**
         * Before what line did the insertion begin
         */
        fromLineNumber: number;
        /**
         * `toLineNumber` - `fromLineNumber` + 1 denotes the number of lines that were inserted
         */
        toLineNumber: number;
        /**
         * The text that was inserted
         */
        detail: string;
    }

    /**
     * Decoration data associated with a model decorations changed event.
     */
    export interface IModelDecorationsChangedEventDecorationData {
        id: string;
        ownerId: number;
        range: IRange;
        isForValidation: boolean;
        options: IModelDecorationOptions;
    }

    /**
     * An event describing that model decorations have changed.
     */
    export interface IModelDecorationsChangedEvent {
        /**
         * A summary with ids of decorations that have changed.
         */
        ids: string[];
        /**
         * Lists of details
         */
        addedOrChangedDecorations: IModelDecorationsChangedEventDecorationData[];
        removedDecorations: string[];
        oldOptions: {
            [decorationId: string]: IModelDecorationOptions;
        };
        oldRanges: {
            [decorationId: string]: IRange;
        };
    }

    /**
     * An event describing that a range of lines has been tokenized
     */
    export interface IModelTokensChangedEvent {
        /**
         * The start of the range (inclusive)
         */
        fromLineNumber: number;
        /**
         * The end of the range (inclusive)
         */
        toLineNumber: number;
    }

    export enum CursorChangeReason {
        NotSet = 0,
        ContentFlush = 1,
        RecoverFromMarkers = 2,
        Explicit = 3,
        Paste = 4,
        Undo = 5,
        Redo = 6,
    }

    /**
     * An event describing that the cursor position has changed.
     */
    export interface ICursorPositionChangedEvent {
        /**
         * Primary cursor's position.
         */
        position: Position;
        /**
         * Primary cursor's view position
         */
        viewPosition: Position;
        /**
         * Secondary cursors' position.
         */
        secondaryPositions: Position[];
        /**
         * Secondary cursors' view position.
         */
        secondaryViewPositions: Position[];
        /**
         * Reason.
         */
        reason: CursorChangeReason;
        /**
         * Source of the call that caused the event.
         */
        source: string;
        /**
         * Is the primary cursor in the editable range?
         */
        isInEditableRange: boolean;
    }

    /**
     * An event describing that the cursor selection has changed.
     */
    export interface ICursorSelectionChangedEvent {
        /**
         * The primary selection.
         */
        selection: Selection;
        /**
         * The primary selection in view coordinates.
         */
        viewSelection: Selection;
        /**
         * The secondary selections.
         */
        secondarySelections: Selection[];
        /**
         * The secondary selections in view coordinates.
         */
        secondaryViewSelections: Selection[];
        /**
         * Source of the call that caused the event.
         */
        source: string;
        /**
         * Reason.
         */
        reason: CursorChangeReason;
    }

    export interface IModelChangedEvent {
        oldModelUrl: string;
        newModelUrl: string;
    }

    /**
     * A description for the overview ruler position.
     */
    export class OverviewRulerPosition {
        _overviewRulerPositionBrand: void;
        /**
         * Width of the overview ruler
         */
        width: number;
        /**
         * Height of the overview ruler
         */
        height: number;
        /**
         * Top position for the overview ruler
         */
        top: number;
        /**
         * Right position for the overview ruler
         */
        right: number;
    }

    /**
     * The internal layout details of the editor.
     */
    export class EditorLayoutInfo {
        _editorLayoutInfoBrand: void;
        /**
         * Full editor width.
         */
        width: number;
        /**
         * Full editor height.
         */
        height: number;
        /**
         * Left position for the glyph margin.
         */
        glyphMarginLeft: number;
        /**
         * The width of the glyph margin.
         */
        glyphMarginWidth: number;
        /**
         * The height of the glyph margin.
         */
        glyphMarginHeight: number;
        /**
         * Left position for the line numbers.
         */
        lineNumbersLeft: number;
        /**
         * The width of the line numbers.
         */
        lineNumbersWidth: number;
        /**
         * The height of the line numbers.
         */
        lineNumbersHeight: number;
        /**
         * Left position for the line decorations.
         */
        decorationsLeft: number;
        /**
         * The width of the line decorations.
         */
        decorationsWidth: number;
        /**
         * The height of the line decorations.
         */
        decorationsHeight: number;
        /**
         * Left position for the content (actual text)
         */
        contentLeft: number;
        /**
         * The width of the content (actual text)
         */
        contentWidth: number;
        /**
         * The height of the content (actual height)
         */
        contentHeight: number;
        /**
         * The width of the vertical scrollbar.
         */
        verticalScrollbarWidth: number;
        /**
         * The height of the horizontal scrollbar.
         */
        horizontalScrollbarHeight: number;
        /**
         * The position of the overview ruler.
         */
        overviewRuler: OverviewRulerPosition;
    }

    /**
     * Options for creating the editor.
     */
    export interface ICodeEditorWidgetCreationOptions extends IEditorOptions {
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
     * Conditions describing action enablement
     */
    export interface IActionEnablement {
        /**
         * The action is enabled only if text in the editor is focused (e.g. blinking cursor).
         * Warning: This condition will be disabled if the action is marked to be displayed in the context menu
         * Defaults to false.
         */
        textFocus?: boolean;
        /**
         * The action is enabled only if the editor or its widgets have focus (e.g. focus is in find widget).
         * Defaults to false.
         */
        widgetFocus?: boolean;
        /**
         * The action is enabled only if the editor is not in read only mode.
         * Defaults to false.
         */
        writeableEditor?: boolean;
        /**
         * The action is enabled only if the cursor position is over tokens of a certain kind.
         * Defaults to no tokens required.
         */
        tokensAtPosition?: string[];
        /**
         * The action is enabled only if the cursor position is over a word (i.e. not whitespace).
         * Defaults to false.
         */
        wordAtPosition?: boolean;
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
        originalStartLineNumber: number;
        originalEndLineNumber: number;
        modifiedStartLineNumber: number;
        modifiedEndLineNumber: number;
    }

    /**
     * A character level change.
     */
    export interface ICharChange extends IChange {
        originalStartColumn: number;
        originalEndColumn: number;
        modifiedStartColumn: number;
        modifiedEndColumn: number;
    }

    /**
     * A line change
     */
    export interface ILineChange extends IChange {
        charChanges: ICharChange[];
    }

    export const KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS: string;

    export const KEYBINDING_CONTEXT_EDITOR_FOCUS: string;

    export const KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS: string;

    export const KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION: string;

    export const KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID: string;

    export class BareFontInfo {
        _bareFontInfoBrand: void;
        fontFamily: string;
        fontSize: number;
        lineHeight: number;
    }

    export class FontInfo extends BareFontInfo {
        _editorStylingBrand: void;
        typicalHalfwidthCharacterWidth: number;
        typicalFullwidthCharacterWidth: number;
        spaceWidth: number;
        maxDigitWidth: number;
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
         * An array of keybindings for the action.
         */
        keybindings?: number[];
        keybindingContext?: string;
        /**
         * A set of enablement conditions.
         */
        enablement?: IActionEnablement;
        /**
         * Control if the action should show up in the context menu and where.
         * Built-in groups:
         *   1_goto/* => e.g. 1_goto/1_peekDefinition
         *   2_change/* => e.g. 2_change/2_format
         *   3_edit/* => e.g. 3_edit/1_copy
         *   4_tools/* => e.g. 4_tools/1_commands
         * You can also create your own group.
         * Defaults to null (don't show in context menu).
         */
        contextMenuGroupId?: string;
        /**
         * Method that will be executed when the action is triggered.
         * @param editor The editor instance is passed in as a convinience
         */
        run: (editor: ICommonCodeEditor) => Promise<void>;
    }

    /**
     * An editor.
     */
    export interface IEditor {
        onDidChangeModelRawContent(listener: (e: IModelContentChangedEvent) => void): IDisposable;
        onDidChangeModelContent(listener: (e: IModelContentChangedEvent2) => void): IDisposable;
        onDidChangeModelMode(listener: (e: IModelModeChangedEvent) => void): IDisposable;
        onDidChangeModelOptions(listener: (e: IModelOptionsChangedEvent) => void): IDisposable;
        onDidChangeConfiguration(listener: (e: IConfigurationChangedEvent) => void): IDisposable;
        onDidChangeCursorPosition(listener: (e: ICursorPositionChangedEvent) => void): IDisposable;
        onDidChangeCursorSelection(listener: (e: ICursorSelectionChangedEvent) => void): IDisposable;
        onDidDispose(listener: () => void): IDisposable;
        dispose(): void;
        getId(): string;
        /**
         * Get the editor type. Current supported types:
         * 			EditorCommon.EditorType.ICodeEditor => ICodeEditor;
         * 			EditorCommon.EditorType.IDiffEditor => IDiffEditor;
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
         * Add a new action to this editor.
         */
        addAction(descriptor: IActionDescriptor): void;
        /**
         * Returns all actions associated with this editor.
         */
        getActions(): IAction[];
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
        setSelection(selection: Range): void;
        setSelection(selection: ISelection): void;
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
        onDidChangeModel(listener: (e: IModelChangedEvent) => void): IDisposable;
        onDidChangeModelDecorations(listener: (e: IModelDecorationsChangedEvent) => void): IDisposable;
        onDidFocusEditorText(listener: () => void): IDisposable;
        onDidBlurEditorText(listener: () => void): IDisposable;
        onDidFocusEditor(listener: () => void): IDisposable;
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
        getContribution(id: string): IEditorContribution;
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
        getAction(id: string): IAction;
        /**
         * Execute a command on the editor.
         * @param source The source of the call.
         * @param command The command to execute
         */
        executeCommand(source: string, command: ICommand): void;
        /**
         * Execute a command on the editor.
         * @param source The source of the call.
         * @param command The command to execute
         */
        executeEdits(source: string, edits: IIdentifiedSingleEditOperation[]): boolean;
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
        onDidUpdateDiff(listener: () => void): IDisposable;
        /**
         * Type the getModel() of IEditor.
         */
        getModel(): IDiffEditorModel;
        getOriginalEditor(): ICommonCodeEditor;
        getModifiedEditor(): ICommonCodeEditor;
        getLineChanges(): ILineChange[];
        /**
         * @see ICodeEditor.getValue
         */
        getValue(options?: {
            preserveBOM: boolean;
            lineEnding: string;
        }): string;
    }

    export var EditorType: {
        ICodeEditor: string;
        IDiffEditor: string;
    };

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
        AddCursorDown: string;
        AddCursorUp: string;
        CursorUndo: string;
        MoveTo: string;
        MoveToSelect: string;
        ColumnSelect: string;
        CreateCursor: string;
        LastCursorMoveToSelect: string;
        JumpToBracket: string;
        Type: string;
        ReplacePreviousChar: string;
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
        DeleteAllLeft: string;
        DeleteAllRight: string;
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
        ScrollLineUp: string;
        ScrollLineDown: string;
        ScrollPageUp: string;
        ScrollPageDown: string;
    };

    export enum TextEditorCursorStyle {
        Line = 1,
        Block = 2,
        Underline = 3,
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
        element: Element;
        /**
         * The target type
         */
        type: MouseTargetType;
        /**
         * The 'approximate' editor position
         */
        position: Position;
        /**
         * Desired mouse column (e.g. when position.column gets clamped to text length -- clicking after text on a line).
         */
        mouseColumn: number;
        /**
         * The 'approximate' editor range
         */
        range: Range;
        /**
         * Some extra detail.
         */
        detail: any;
    }

    /**
     * A mouse event originating from the editor.
     */
    export interface IEditorMouseEvent {
        event: IMouseEvent;
        target: IMouseTarget;
    }

    /**
     * A rich code editor.
     */
    export interface ICodeEditor extends ICommonCodeEditor {
        onMouseUp(listener: (e: IEditorMouseEvent) => void): IDisposable;
        onMouseDown(listener: (e: IEditorMouseEvent) => void): IDisposable;
        onContextMenu(listener: (e: IEditorMouseEvent) => void): IDisposable;
        onMouseMove(listener: (e: IEditorMouseEvent) => void): IDisposable;
        onMouseLeave(listener: (e: IEditorMouseEvent) => void): IDisposable;
        onKeyUp(listener: (e: IKeyboardEvent) => void): IDisposable;
        onKeyDown(listener: (e: IKeyboardEvent) => void): IDisposable;
        onDidLayoutChange(listener: (e: EditorLayoutInfo) => void): IDisposable;
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
}

declare module monaco.languages {


    export function register(language: ILanguageExtensionPoint): void;

    export function getLanguages(): ILanguageExtensionPoint[];

    export function onLanguage(languageId: string, callback: () => void): IDisposable;

    export function setLanguageConfiguration(languageId: string, configuration: IRichLanguageConfiguration): IDisposable;

    export function setTokensProvider(languageId: string, support: TokensProvider): IDisposable;

    export function setMonarchTokensProvider(languageId: string, languageDef: IMonarchLanguage): IDisposable;

    export function registerReferenceProvider(languageId: string, support: ReferenceProvider): IDisposable;

    export function registerRenameProvider(languageId: string, support: RenameProvider): IDisposable;

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
    }

    export interface CompletionItem {
        label: string;
        kind: CompletionItemKind;
        detail?: string;
        documentation?: string;
        sortText?: string;
        filterText?: string;
        insertText?: string;
        textEdit?: editor.ISingleEditOperation;
    }

    export interface CompletionList {
        isIncomplete?: boolean;
        items: CompletionItem[];
    }

    export interface CompletionItemProvider {
        triggerCharacters?: string[];
        provideCompletionItems(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): CompletionItem[] | Thenable<CompletionItem[]> | CompletionList | Thenable<CompletionList>;
        resolveCompletionItem?(item: CompletionItem, token: CancellationToken): CompletionItem | Thenable<CompletionItem>;
    }

    export function registerCompletionItemProvider(languageId: string, provider: CompletionItemProvider): IDisposable;

    export function registerSignatureHelpProvider(languageId: string, support: SignatureHelpProvider): IDisposable;

    export function registerHoverProvider(languageId: string, support: HoverProvider): IDisposable;

    export function registerDocumentSymbolProvider(languageId: string, support: DocumentSymbolProvider): IDisposable;

    export function registerDocumentHighlightProvider(languageId: string, support: DocumentHighlightProvider): IDisposable;

    export function registerDefinitionProvider(languageId: string, support: DefinitionProvider): IDisposable;

    export function registerCodeLensProvider(languageId: string, support: CodeLensProvider): IDisposable;

    export function registerCodeActionProvider(languageId: string, support: CodeActionProvider): IDisposable;

    export function registerDocumentFormattingEditProvider(languageId: string, support: DocumentFormattingEditProvider): IDisposable;

    export function registerDocumentRangeFormattingEditProvider(languageId: string, support: DocumentRangeFormattingEditProvider): IDisposable;

    export function registerOnTypeFormattingEditProvider(languageId: string, support: OnTypeFormattingEditProvider): IDisposable;

    export function registerLinkProvider(languageId: string, support: LinkProvider): IDisposable;

    export interface CommentRule {
        lineComment?: string;
        blockComment?: CharacterPair;
    }

    export interface IRichLanguageConfiguration {
        comments?: CommentRule;
        brackets?: CharacterPair[];
        wordPattern?: RegExp;
        indentationRules?: IIndentationRules;
        onEnterRules?: IOnEnterRegExpRules[];
        autoClosingPairs?: IAutoClosingPairConditional[];
        surroundingPairs?: IAutoClosingPair[];
        __electricCharacterSupport?: IBracketElectricCharacterContribution;
    }

    export interface IIndentationRules {
        decreaseIndentPattern: RegExp;
        increaseIndentPattern: RegExp;
        indentNextLinePattern?: RegExp;
        unIndentedLinePattern?: RegExp;
    }

    export interface IOnEnterRegExpRules {
        beforeText: RegExp;
        afterText?: RegExp;
        action: IEnterAction;
    }

    export interface IBracketElectricCharacterContribution {
        docComment?: IDocComment;
        embeddedElectricCharacters?: string[];
    }

    /**
     * Definition of documentation comments (e.g. Javadoc/JSdoc)
     */
    export interface IDocComment {
        scope: string;
        open: string;
        lineStart: string;
        close?: string;
    }

    export interface IMode {
        getId(): string;
    }

    export interface IToken {
        startIndex: number;
        scopes: string | string[];
    }

    export interface ILineTokens {
        tokens: IToken[];
        endState: IState;
        retokenize?: Promise<void>;
    }

    export interface IState {
        clone(): IState;
        equals(other: IState): boolean;
    }

    export interface TokensProvider {
        getInitialState(): IState;
        tokenize(line: string, state: IState): ILineTokens;
    }

    /**
     * A hover represents additional information for a symbol or word. Hovers are
     * rendered in a tooltip-like widget.
     */
    export interface Hover {
        /**
         * The contents of this hover.
         */
        htmlContent: IHTMLContentElement[];
        /**
         * The range to which this hover applies. When missing, the
         * editor will use the range at the current position or the
         * current position itself.
         */
        range: IRange;
    }

    export interface HoverProvider {
        provideHover(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): Hover | Thenable<Hover>;
    }

    /**
     * Interface used to quick fix typing errors while accesing member fields.
     */
    export interface IQuickFix {
        command: ICommand;
        score: number;
    }

    export interface CodeActionProvider {
        provideCodeActions(model: editor.IReadOnlyModel, range: Range, token: CancellationToken): IQuickFix[] | Thenable<IQuickFix[]>;
    }

    export interface ParameterInformation {
        label: string;
        documentation: string;
    }

    export interface SignatureInformation {
        label: string;
        documentation: string;
        parameters: ParameterInformation[];
    }

    export interface SignatureHelp {
        signatures: SignatureInformation[];
        activeSignature: number;
        activeParameter: number;
    }

    export interface SignatureHelpProvider {
        signatureHelpTriggerCharacters: string[];
        provideSignatureHelp(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): SignatureHelp | Thenable<SignatureHelp>;
    }

    export enum DocumentHighlightKind {
        Text = 0,
        Read = 1,
        Write = 2,
    }

    export interface DocumentHighlight {
        range: IRange;
        kind: DocumentHighlightKind;
    }

    export interface DocumentHighlightProvider {
        provideDocumentHighlights(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): DocumentHighlight[] | Thenable<DocumentHighlight[]>;
    }

    export interface ReferenceContext {
        includeDeclaration: boolean;
    }

    export interface ReferenceProvider {
        provideReferences(model: editor.IReadOnlyModel, position: Position, context: ReferenceContext, token: CancellationToken): Location[] | Thenable<Location[]>;
    }

    export interface Location {
        uri: Uri;
        range: IRange;
    }

    export type Definition = Location | Location[];

    export interface DefinitionProvider {
        provideDefinition(model: editor.IReadOnlyModel, position: Position, token: CancellationToken): Definition | Thenable<Definition>;
    }

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

    export interface SymbolInformation {
        name: string;
        containerName?: string;
        kind: SymbolKind;
        location: Location;
    }

    export interface DocumentSymbolProvider {
        provideDocumentSymbols(model: editor.IReadOnlyModel, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]>;
    }

    /**
     * Interface used to format a model
     */
    export interface IFormattingOptions {
        tabSize: number;
        insertSpaces: boolean;
    }

    export interface DocumentFormattingEditProvider {
        provideDocumentFormattingEdits(model: editor.IReadOnlyModel, options: IFormattingOptions, token: CancellationToken): editor.ISingleEditOperation[] | Thenable<editor.ISingleEditOperation[]>;
    }

    export interface DocumentRangeFormattingEditProvider {
        provideDocumentRangeFormattingEdits(model: editor.IReadOnlyModel, range: Range, options: IFormattingOptions, token: CancellationToken): editor.ISingleEditOperation[] | Thenable<editor.ISingleEditOperation[]>;
    }

    export interface OnTypeFormattingEditProvider {
        autoFormatTriggerCharacters: string[];
        provideOnTypeFormattingEdits(model: editor.IReadOnlyModel, position: Position, ch: string, options: IFormattingOptions, token: CancellationToken): editor.ISingleEditOperation[] | Thenable<editor.ISingleEditOperation[]>;
    }

    export interface ILink {
        range: IRange;
        url: string;
    }

    export interface LinkProvider {
        provideLinks(model: editor.IReadOnlyModel, token: CancellationToken): ILink[] | Thenable<ILink[]>;
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

    export interface ICommand {
        id: string;
        title: string;
        arguments?: any[];
    }

    export interface ICodeLensSymbol {
        range: IRange;
        id?: string;
        command?: ICommand;
    }

    export interface CodeLensProvider {
        provideCodeLenses(model: editor.IReadOnlyModel, token: CancellationToken): ICodeLensSymbol[] | Thenable<ICodeLensSymbol[]>;
        resolveCodeLens?(model: editor.IReadOnlyModel, codeLens: ICodeLensSymbol, token: CancellationToken): ICodeLensSymbol | Thenable<ICodeLensSymbol>;
    }

    export type CharacterPair = [string, string];

    export interface IAutoClosingPairConditional extends IAutoClosingPair {
        notIn?: string[];
    }

    export enum IndentAction {
        None = 0,
        Indent = 1,
        IndentOutdent = 2,
        Outdent = 3,
    }

    /**
     * An action the editor executes when 'enter' is being pressed
     */
    export interface IEnterAction {
        indentAction: IndentAction;
        appendText?: string;
        removeText?: number;
    }

    export interface IAutoClosingPair {
        open: string;
        close: string;
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
        uri: Uri;
        version: number;
        getText(): string;
    }

    export var mirrorModels: IMirrorModel[];

}