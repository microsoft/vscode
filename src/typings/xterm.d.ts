/**
 * @license MIT
 *
 * This contains the type declarations for the xterm.js library. Note that
 * some interfaces differ between this file and the actual implementation in
 * src/, that's because this file declares the *public* API which is intended
 * to be stable and consumed by external programs.
 */

/// <reference lib="dom"/>

declare module 'xterm' {
	/**
	 * A string representing text font weight.
	 */
	export type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

	/**
	 * A string representing log level.
	 */
	export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'off';

	/**
	 * A string representing a renderer type.
	 */
	export type RendererType = 'dom' | 'canvas';

	/**
	 * An object containing start up options for the terminal.
	 */
	export interface ITerminalOptions {
		/**
		 * Whether background should support non-opaque color. It must be set before
		 * executing the `Terminal.open()` method and can't be changed later without
		 * executing it again. Note that enabling this can negatively impact
		 * performance.
		 */
		allowTransparency?: boolean;

		/**
		 * A data uri of the sound to use for the bell when `bellStyle = 'sound'`.
		 */
		bellSound?: string;

		/**
		 * The type of the bell notification the terminal will use.
		 */
		bellStyle?: 'none' /*| 'visual'*/ | 'sound' /*| 'both'*/;

		/**
		 * When enabled the cursor will be set to the beginning of the next line
		 * with every new line. This equivalent to sending '\r\n' for each '\n'.
		 * Normally the termios settings of the underlying PTY deals with the
		 * translation of '\n' to '\r\n' and this setting should not be used. If you
		 * deal with data from a non-PTY related source, this settings might be
		 * useful.
		 */
		convertEol?: boolean;

		/**
		 * The number of columns in the terminal.
		 */
		cols?: number;

		/**
		 * Whether the cursor blinks.
		 */
		cursorBlink?: boolean;

		/**
		 * The style of the cursor.
		 */
		cursorStyle?: 'block' | 'underline' | 'bar';

		/**
		 * Whether input should be disabled.
		 */
		disableStdin?: boolean;

		/**
		 * Whether to draw bold text in bright colors. The default is true.
		 */
		drawBoldTextInBrightColors?: boolean;

		/**
		 * The font size used to render text.
		 */
		fontSize?: number;

		/**
		 * The font family used to render text.
		 */
		fontFamily?: string;

		/**
		 * The font weight used to render non-bold text.
		 */
		fontWeight?: FontWeight;

		/**
		 * The font weight used to render bold text.
		 */
		fontWeightBold?: FontWeight;

		/**
		 * The spacing in whole pixels between characters..
		 */
		letterSpacing?: number;

		/**
		 * The line height used to render text.
		 */
		lineHeight?: number;

		/**
		 * What log level to use, this will log for all levels below and including
		 * what is set:
		 *
		 * 1. debug
		 * 2. info (default)
		 * 3. warn
		 * 4. error
		 * 5. off
		 */
		logLevel?: LogLevel;

		/**
		 * Whether to treat option as the meta key.
		 */
		macOptionIsMeta?: boolean;

		/**
		 * Whether holding a modifier key will force normal selection behavior,
		 * regardless of whether the terminal is in mouse events mode. This will
		 * also prevent mouse events from being emitted by the terminal. For
		 * example, this allows you to use xterm.js' regular selection inside tmux
		 * with mouse mode enabled.
		 */
		macOptionClickForcesSelection?: boolean;

		/**
		 * The type of renderer to use, this allows using the fallback DOM renderer
		 * when canvas is too slow for the environment. The following features do
		 * not work when the DOM renderer is used:
		 *
		 * - Letter spacing
		 * - Cursor blink
		 */
		rendererType?: RendererType;

		/**
		 * Whether to select the word under the cursor on right click, this is
		 * standard behavior in a lot of macOS applications.
		 */
		rightClickSelectsWord?: boolean;

		/**
		 * The number of rows in the terminal.
		 */
		rows?: number;

		/**
		 * Whether screen reader support is enabled. When on this will expose
		 * supporting elements in the DOM to support NVDA on Windows and VoiceOver
		 * on macOS.
		 */
		screenReaderMode?: boolean;

		/**
		 * The amount of scrollback in the terminal. Scrollback is the amount of
		 * rows that are retained when lines are scrolled beyond the initial
		 * viewport.
		 */
		scrollback?: number;

		/**
		 * The size of tab stops in the terminal.
		 */
		tabStopWidth?: number;

		/**
		 * The color theme of the terminal.
		 */
		theme?: ITheme;

		/**
		 * Whether "Windows mode" is enabled. Because Windows backends winpty and
		 * conpty operate by doing line wrapping on their side, xterm.js does not
		 * have access to wrapped lines. When Windows mode is enabled the following
		 * changes will be in effect:
		 *
		 * - Reflow is disabled.
		 * - Lines are assumed to be wrapped if the last character of the line is
		 *   not whitespace.
		 */
		windowsMode?: boolean;

		/**
		 * A string containing all characters that are considered word separated by the
		 * double click to select work logic.
		*/
		wordSeparator?: string;
	}

	/**
	 * Contains colors to theme the terminal with.
	 */
	export interface ITheme {
		/** The default foreground color */
		foreground?: string;
		/** The default background color */
		background?: string;
		/** The cursor color */
		cursor?: string;
		/** The accent color of the cursor (fg color for a block cursor) */
		cursorAccent?: string;
		/** The selection background color (can be transparent) */
		selection?: string;
		/** ANSI black (eg. `\x1b[30m`) */
		black?: string;
		/** ANSI red (eg. `\x1b[31m`) */
		red?: string;
		/** ANSI green (eg. `\x1b[32m`) */
		green?: string;
		/** ANSI yellow (eg. `\x1b[33m`) */
		yellow?: string;
		/** ANSI blue (eg. `\x1b[34m`) */
		blue?: string;
		/** ANSI magenta (eg. `\x1b[35m`) */
		magenta?: string;
		/** ANSI cyan (eg. `\x1b[36m`) */
		cyan?: string;
		/** ANSI white (eg. `\x1b[37m`) */
		white?: string;
		/** ANSI bright black (eg. `\x1b[1;30m`) */
		brightBlack?: string;
		/** ANSI bright red (eg. `\x1b[1;31m`) */
		brightRed?: string;
		/** ANSI bright green (eg. `\x1b[1;32m`) */
		brightGreen?: string;
		/** ANSI bright yellow (eg. `\x1b[1;33m`) */
		brightYellow?: string;
		/** ANSI bright blue (eg. `\x1b[1;34m`) */
		brightBlue?: string;
		/** ANSI bright magenta (eg. `\x1b[1;35m`) */
		brightMagenta?: string;
		/** ANSI bright cyan (eg. `\x1b[1;36m`) */
		brightCyan?: string;
		/** ANSI bright white (eg. `\x1b[1;37m`) */
		brightWhite?: string;
	}

	/**
	 * An object containing options for a link matcher.
	 */
	export interface ILinkMatcherOptions {
		/**
		 * The index of the link from the regex.match(text) call. This defaults to 0
		 * (for regular expressions without capture groups).
		 */
		matchIndex?: number;

		/**
		 * A callback that validates whether to create an individual link, pass
		 * whether the link is valid to the callback.
		 */
		validationCallback?: (uri: string, callback: (isValid: boolean) => void) => void;

		/**
		 * A callback that fires when the mouse hovers over a link for a moment.
		 */
		tooltipCallback?: (event: MouseEvent, uri: string) => boolean | void;

		/**
		 * A callback that fires when the mouse leaves a link. Note that this can
		 * happen even when tooltipCallback hasn't fired for the link yet.
		 */
		leaveCallback?: () => void;

		/**
		 * The priority of the link matcher, this defines the order in which the
		 * link matcher is evaluated relative to others, from highest to lowest. The
		 * default value is 0.
		 */
		priority?: number;

		/**
		 * A callback that fires when the mousedown and click events occur that
		 * determines whether a link will be activated upon click. This enables
		 * only activating a link when a certain modifier is held down, if not the
		 * mouse event will continue propagation (eg. double click to select word).
		 */
		willLinkActivate?: (event: MouseEvent, uri: string) => boolean;
	}

	/**
	 * An object that can be disposed via a dispose function.
	 */
	export interface IDisposable {
		dispose(): void;
	}

	/**
	 * An event that can be listened to.
	 * @returns an `IDisposable` to stop listening.
	 */
	export interface IEvent<T> {
		(listener: (e: T) => any): IDisposable;
	}

	/**
	 * Represents a specific line in the terminal that is tracked when scrollback
	 * is trimmed and lines are added or removed.
	 */
	export interface IMarker extends IDisposable {
		/**
		 * A unique identifier for this marker.
		 */
		readonly id: number;

		/**
		 * Whether this marker is disposed.
		 */
		readonly isDisposed: boolean;

		/**
		 * The actual line index in the buffer at this point in time.
		 */
		readonly line: number;
	}

	/**
	 * The set of localizable strings.
	 */
	export interface ILocalizableStrings {
		/**
		 * The aria label for the underlying input textarea for the terminal.
		 */
		promptLabel: string;

		/**
		 * Announcement for when line reading is suppressed due to too many lines
		 * being printed to the terminal when `screenReaderMode` is enabled.
		 */
		tooMuchOutput: string;
	}

	/**
	 * The class that represents an xterm.js terminal.
	 */
	export class Terminal implements IDisposable {
		/**
		 * The element containing the terminal.
		 */
		readonly element: HTMLElement;

		/**
		 * The textarea that accepts input for the terminal.
		 */
		readonly textarea: HTMLTextAreaElement;

		/**
		 * The number of rows in the terminal's viewport. Use
		 * `ITerminalOptions.rows` to set this in the constructor and
		 * `Terminal.resize` for when the terminal exists.
		 */
		readonly rows: number;

		/**
		 * The number of columns in the terminal's viewport. Use
		 * `ITerminalOptions.cols` to set this in the constructor and
		 * `Terminal.resize` for when the terminal exists.
		 */
		readonly cols: number;

		/**
		 * (EXPERIMENTAL) The terminal's current buffer, this might be either the
		 * normal buffer or the alt buffer depending on what's running in the
		 * terminal.
		 */
		readonly buffer: IBuffer;

		/**
		 * (EXPERIMENTAL) Get all markers registered against the buffer. If the alt
		 * buffer is active this will always return [].
		 */
		readonly markers: ReadonlyArray<IMarker>;

		/**
		 * (EXPERIMENTAL) Get the parser interface to register
		 * custom escape sequence handlers.
		 */
		readonly parser: IParser;

		/**
		 * Natural language strings that can be localized.
		 */
		static strings: ILocalizableStrings;

		/**
		 * Creates a new `Terminal` object.
		 *
		 * @param options An object containing a set of options.
		 */
		constructor(options?: ITerminalOptions);

		/**
		 * Adds an event listener for the cursor moves.
		 * @returns an `IDisposable` to stop listening.
		 */
		onCursorMove: IEvent<void>;

		/**
		 * Adds an event listener for when a data event fires. This happens for
		 * example when the user types or pastes into the terminal. The event value
		 * is whatever `string` results, in a typical setup, this should be passed
		 * on to the backing pty.
		 * @returns an `IDisposable` to stop listening.
		 */
		onData: IEvent<string>;

		/**
		 * Adds an event listener for a key is pressed. The event value contains the
		 * string that will be sent in the data event as well as the DOM event that
		 * triggered it.
		 * @returns an `IDisposable` to stop listening.
		 */
		onKey: IEvent<{ key: string, domEvent: KeyboardEvent }>;

		/**
		 * Adds an event listener for when a line feed is added.
		 * @returns an `IDisposable` to stop listening.
		 */
		onLineFeed: IEvent<void>;

		/**
		 * Adds an event listener for when a scroll occurs. The  event value is the
		 * new position of the viewport.
		 * @returns an `IDisposable` to stop listening.
		 */
		onScroll: IEvent<number>;

		/**
		 * Adds an event listener for when a selection change occurs.
		 * @returns an `IDisposable` to stop listening.
		 */
		onSelectionChange: IEvent<void>;

		/**
		 * Adds an event listener for when rows are rendered. The event value
		 * contains the start row and end rows of the rendered area (ranges from `0`
		 * to `Terminal.rows - 1`).
		 * @returns an `IDisposable` to stop listening.
		 */
		onRender: IEvent<{ start: number, end: number }>;

		/**
		 * Adds an event listener for when the terminal is resized. The event value
		 * contains the new size.
		 * @returns an `IDisposable` to stop listening.
		 */
		onResize: IEvent<{ cols: number, rows: number }>;

		/**
		 * Adds an event listener for when an OSC 0 or OSC 2 title change occurs.
		 * The event value is the new title.
		 * @returns an `IDisposable` to stop listening.
		 */
		onTitleChange: IEvent<string>;

		/**
		 * Unfocus the terminal.
		 */
		blur(): void;

		/**
		 * Focus the terminal.
		 */
		focus(): void;

		/**
		 * Resizes the terminal. It's best practice to debounce calls to resize,
		 * this will help ensure that the pty can respond to the resize event
		 * before another one occurs.
		 * @param x The number of columns to resize to.
		 * @param y The number of rows to resize to.
		 */
		resize(columns: number, rows: number): void;

		/**
		 * Opens the terminal within an element.
		 * @param parent The element to create the terminal within. This element
		 * must be visible (have dimensions) when `open` is called as several DOM-
		 * based measurements need to be performed when this function is called.
		 */
		open(parent: HTMLElement): void;

		/**
		 * Attaches a custom key event handler which is run before keys are
		 * processed, giving consumers of xterm.js ultimate control as to what keys
		 * should be processed by the terminal and what keys should not.
		 * @param customKeyEventHandler The custom KeyboardEvent handler to attach.
		 * This is a function that takes a KeyboardEvent, allowing consumers to stop
		 * propagation and/or prevent the default action. The function returns
		 * whether the event should be processed by xterm.js.
		 */
		attachCustomKeyEventHandler(customKeyEventHandler: (event: KeyboardEvent) => boolean): void;

		/**
		 * (EXPERIMENTAL) Registers a link matcher, allowing custom link patterns to
		 * be matched and handled.
		 * @param regex The regular expression to search for, specifically this
		 * searches the textContent of the rows. You will want to use \s to match a
		 * space ' ' character for example.
		 * @param handler The callback when the link is called.
		 * @param options Options for the link matcher.
		 * @return The ID of the new matcher, this can be used to deregister.
		 */
		registerLinkMatcher(regex: RegExp, handler: (event: MouseEvent, uri: string) => void, options?: ILinkMatcherOptions): number;

		/**
		 * (EXPERIMENTAL) Deregisters a link matcher if it has been registered.
		 * @param matcherId The link matcher's ID (returned after register)
		 */
		deregisterLinkMatcher(matcherId: number): void;

		/**
		 * (EXPERIMENTAL) Registers a character joiner, allowing custom sequences of
		 * characters to be rendered as a single unit. This is useful in particular
		 * for rendering ligatures and graphemes, among other things.
		 *
		 * Each registered character joiner is called with a string of text
		 * representing a portion of a line in the terminal that can be rendered as
		 * a single unit. The joiner must return a sorted array, where each entry is
		 * itself an array of length two, containing the start (inclusive) and end
		 * (exclusive) index of a substring of the input that should be rendered as
		 * a single unit. When multiple joiners are provided, the results of each
		 * are collected. If there are any overlapping substrings between them, they
		 * are combined into one larger unit that is drawn together.
		 *
		 * All character joiners that are registered get called every time a line is
		 * rendered in the terminal, so it is essential for the handler function to
		 * run as quickly as possible to avoid slowdowns when rendering. Similarly,
		 * joiners should strive to return the smallest possible substrings to
		 * render together, since they aren't drawn as optimally as individual
		 * characters.
		 *
		 * NOTE: character joiners are only used by the canvas renderer.
		 *
		 * @param handler The function that determines character joins. It is called
		 * with a string of text that is eligible for joining and returns an array
		 * where each entry is an array containing the start (inclusive) and end
		 * (exclusive) indexes of ranges that should be rendered as a single unit.
		 * @return The ID of the new joiner, this can be used to deregister
		 */
		registerCharacterJoiner(handler: (text: string) => [number, number][]): number;

		/**
		 * (EXPERIMENTAL) Deregisters the character joiner if one was registered.
		 * NOTE: character joiners are only used by the canvas renderer.
		 * @param joinerId The character joiner's ID (returned after register)
		 */
		deregisterCharacterJoiner(joinerId: number): void;

		/**
		 * (EXPERIMENTAL) Adds a marker to the normal buffer and returns it. If the
		 * alt buffer is active, undefined is returned.
		 * @param cursorYOffset The y position offset of the marker from the cursor.
		 */
		addMarker(cursorYOffset: number): IMarker;

		/**
		 * Gets whether the terminal has an active selection.
		 */
		hasSelection(): boolean;

		/**
		 * Gets the terminal's current selection, this is useful for implementing
		 * copy behavior outside of xterm.js.
		 */
		getSelection(): string;

		/**
		 * Gets the selection position or undefined if there is no selection.
		 */
		getSelectionPosition(): ISelectionPosition | undefined;

		/**
		 * Clears the current terminal selection.
		 */
		clearSelection(): void;

		/**
		 * Selects text within the terminal.
		 * @param column The column the selection starts at..
		 * @param row The row the selection starts at.
		 * @param length The length of the selection.
		 */
		select(column: number, row: number, length: number): void;

		/**
		 * Selects all text within the terminal.
		 */
		selectAll(): void;

		/**
		 * Selects text in the buffer between 2 lines.
		 * @param start The 0-based line index to select from (inclusive).
		 * @param end The 0-based line index to select to (inclusive).
		 */
		selectLines(start: number, end: number): void;

		/*
		 * Disposes of the terminal, detaching it from the DOM and removing any
		 * active listeners.
		 */
		dispose(): void;

		/**
		 * Scroll the display of the terminal
		 * @param amount The number of lines to scroll down (negative scroll up).
		 */
		scrollLines(amount: number): void;

		/**
		 * Scroll the display of the terminal by a number of pages.
		 * @param pageCount The number of pages to scroll (negative scrolls up).
		 */
		scrollPages(pageCount: number): void;

		/**
		 * Scrolls the display of the terminal to the top.
		 */
		scrollToTop(): void;

		/**
		 * Scrolls the display of the terminal to the bottom.
		 */
		scrollToBottom(): void;

		/**
		 * Scrolls to a line within the buffer.
		 * @param line The 0-based line index to scroll to.
		 */
		scrollToLine(line: number): void;

		/**
		 * Clear the entire buffer, making the prompt line the new first line.
		 */
		clear(): void;

		/**
		 * Writes text to the terminal.
		 * @param data The text to write to the terminal.
		 */
		write(data: string): void;

		/**
		 * Writes text to the terminal, followed by a break line character (\n).
		 * @param data The text to write to the terminal.
		 */
		writeln(data: string): void;

		/**
		 * Writes UTF8 data to the terminal. This has a slight performance advantage
		 * over the string based write method due to lesser data conversions needed
		 * on the way from the pty to xterm.js.
		 * @param data The data to write to the terminal.
		 */
		writeUtf8(data: Uint8Array): void;

		/**
		 * Writes text to the terminal, performing the necessary transformations for pasted text.
		 * @param data The text to write to the terminal.
		 */
		paste(data: string): void;

		/**
		 * Retrieves an option's value from the terminal.
		 * @param key The option key.
		 */
		getOption(key: 'bellSound' | 'bellStyle' | 'cursorStyle' | 'fontFamily' | 'fontWeight' | 'fontWeightBold' | 'logLevel' | 'rendererType' | 'termName' | 'wordSeparator'): string;
		/**
		 * Retrieves an option's value from the terminal.
		 * @param key The option key.
		 */
		getOption(key: 'allowTransparency' | 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'disableStdin' | 'macOptionIsMeta' | 'rightClickSelectsWord' | 'popOnBell' | 'screenKeys' | 'useFlowControl' | 'visualBell' | 'windowsMode'): boolean;
		/**
		 * Retrieves an option's value from the terminal.
		 * @param key The option key.
		 */
		getOption(key: 'colors'): string[];
		/**
		 * Retrieves an option's value from the terminal.
		 * @param key The option key.
		 */
		getOption(key: 'cols' | 'fontSize' | 'letterSpacing' | 'lineHeight' | 'rows' | 'tabStopWidth' | 'scrollback'): number;
		/**
		 * Retrieves an option's value from the terminal.
		 * @param key The option key.
		 */
		getOption(key: 'handler'): (data: string) => void;
		/**
		 * Retrieves an option's value from the terminal.
		 * @param key The option key.
		 */
		getOption(key: string): any;

		/**
		 * Sets an option on the terminal.
		 * @param key The option key.
		 * @param value The option value.
		 */
		setOption(key: 'fontFamily' | 'termName' | 'bellSound' | 'wordSeparator', value: string): void;
		/**
		* Sets an option on the terminal.
		* @param key The option key.
		* @param value The option value.
		*/
		setOption(key: 'fontWeight' | 'fontWeightBold', value: null | 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'): void;
		/**
		* Sets an option on the terminal.
		* @param key The option key.
		* @param value The option value.
		*/
		setOption(key: 'logLevel', value: LogLevel): void;
		/**
		 * Sets an option on the terminal.
		 * @param key The option key.
		 * @param value The option value.
		 */
		setOption(key: 'bellStyle', value: null | 'none' | 'visual' | 'sound' | 'both'): void;
		/**
		 * Sets an option on the terminal.
		 * @param key The option key.
		 * @param value The option value.
		 */
		setOption(key: 'cursorStyle', value: null | 'block' | 'underline' | 'bar'): void;
		/**
		 * Sets an option on the terminal.
		 * @param key The option key.
		 * @param value The option value.
		 */
		setOption(key: 'allowTransparency' | 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'disableStdin' | 'macOptionIsMeta' | 'popOnBell' | 'rightClickSelectsWord' | 'screenKeys' | 'useFlowControl' | 'visualBell' | 'windowsMode', value: boolean): void;
		/**
		 * Sets an option on the terminal.
		 * @param key The option key.
		 * @param value The option value.
		 */
		setOption(key: 'colors', value: string[]): void;
		/**
		 * Sets an option on the terminal.
		 * @param key The option key.
		 * @param value The option value.
		 */
		setOption(key: 'fontSize' | 'letterSpacing' | 'lineHeight' | 'tabStopWidth' | 'scrollback', value: number): void;
		/**
		 * Sets an option on the terminal.
		 * @param key The option key.
		 * @param value The option value.
		 */
		setOption(key: 'handler', value: (data: string) => void): void;
		/**
		 * Sets an option on the terminal.
		 * @param key The option key.
		 * @param value The option value.
		 */
		setOption(key: 'theme', value: ITheme): void;
		/**
		 * Sets an option on the terminal.
		 * @param key The option key.
		 * @param value The option value.
		 */
		setOption(key: 'cols' | 'rows', value: number): void;
		/**
		 * Sets an option on the terminal.
		 * @param key The option key.
		 * @param value The option value.
		 */
		setOption(key: string, value: any): void;

		/**
		 * Tells the renderer to refresh terminal content between two rows
		 * (inclusive) at the next opportunity.
		 * @param start The row to start from (between 0 and this.rows - 1).
		 * @param end The row to end at (between start and this.rows - 1).
		 */
		refresh(start: number, end: number): void;

		/**
		 * Perform a full reset (RIS, aka '\x1bc').
		 */
		reset(): void;

		/**
		 * Loads an addon into this instance of xterm.js.
		 * @param addon The addon to load.
		 */
		loadAddon(addon: ITerminalAddon): void;
	}

	/**
	 * An addon that can provide additional functionality to the terminal.
	 */
	export interface ITerminalAddon extends IDisposable {
		/**
		 * (EXPERIMENTAL) This is called when the addon is activated.
		 */
		activate(terminal: Terminal): void;
	}

	/**
	 * An object representing a selection within the terminal.
	 */
	interface ISelectionPosition {
		/**
		 * The start column of the selection.
		 */
		startColumn: number;

		/**
		 * The start row of the selection.
		 */
		startRow: number;

		/**
		 * The end column of the selection.
		 */
		endColumn: number;

		/**
		 * The end row of the selection.
		 */
		endRow: number;
	}

	/**
	 * Represents a terminal buffer.
	 */
	interface IBuffer {
		/**
		 * The y position of the cursor. This ranges between `0` (when the
		 * cursor is at baseY) and `Terminal.rows - 1` (when the cursor is on the
		 * last row).
		 */
		readonly cursorY: number;

		/**
		 * The x position of the cursor. This ranges between `0` (left side) and
		 * `Terminal.cols - 1` (right side).
		 */
		readonly cursorX: number;

		/**
		 * The line within the buffer where the top of the viewport is.
		 */
		readonly viewportY: number;

		/**
		 * The line within the buffer where the top of the bottom page is (when
		 * fully scrolled down);
		 */
		readonly baseY: number;

		/**
		 * The amount of lines in the buffer.
		 */
		readonly length: number;

		/**
		 * Gets a line from the buffer, or undefined if the line index does not
		 * exist.
		 *
		 * Note that the result of this function should be used immediately after
		 * calling as when the terminal updates it could lead to unexpected
		 * behavior.
		 *
		 * @param y The line index to get.
		 */
		getLine(y: number): IBufferLine | undefined;
	}

	/**
	 * Represents a line in the terminal's buffer.
	 */
	interface IBufferLine {
		/**
		 * Whether the line is wrapped from the previous line.
		 */
		readonly isWrapped: boolean;

		/**
		 * Gets a cell from the line, or undefined if the line index does not exist.
		 *
		 * Note that the result of this function should be used immediately after
		 * calling as when the terminal updates it could lead to unexpected
		 * behavior.
		 *
		 * @param x The character index to get.
		 */
		getCell(x: number): IBufferCell | undefined;

		/**
		 * Gets the line as a string. Note that this is gets only the string for the
		 * line, not taking isWrapped into account.
		 *
		 * @param trimRight Whether to trim any whitespace at the right of the line.
		 * @param startColumn The column to start from (inclusive).
		 * @param endColumn The column to end at (exclusive).
		 */
		translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
	}

	/**
	 * Represents a single cell in the terminal's buffer.
	 */
	interface IBufferCell {
		/**
		 * The character within the cell.
		 */
		readonly char: string;

		/**
		 * The width of the character. Some examples:
		 *
		 * - This is `1` for most cells.
		 * - This is `2` for wide character like CJK glyphs.
		 * - This is `0` for cells immediately following cells with a width of `2`.
		 */
		readonly width: number;
	}

	/**
	 * (EXPERIMENTAL) Data type to register a CSI, DCS or ESC callback in the parser
	 * in the form:
	 *    ESC I..I F
	 *    CSI Prefix P..P I..I F
	 *    DCS Prefix P..P I..I F data_bytes ST
	 *
	 * with these rules/restrictions:
	 * - prefix can only be used with CSI and DCS
	 * - only one leading prefix byte is recognized by the parser
	 *   before any other parameter bytes (P..P)
	 * - intermediate bytes are recognized up to 2
	 *
	 * For custom sequences make sure to read ECMA-48 and the resources at
	 * vt100.net to not clash with existing sequences or reserved address space.
	 * General recommendations:
	 * - use private address space (see ECMA-48)
	 * - use max one intermediate byte (technically not limited by the spec,
	 *   in practice there are no sequences with more than one intermediate byte,
	 *   thus parsers might get confused with more intermediates)
	 * - test against other common emulators to check whether they escape/ignore
	 *   the sequence correctly
	 *
	 * Notes: OSC command registration is handled differently (see addOscHandler)
	 *        APC, PM or SOS is currently not supported.
	 */
	export interface IFunctionIdentifier {
		/**
		 * Optional prefix byte, must be in range \x3c .. \x3f.
		 * Usable in CSI and DCS.
		 */
		prefix?: string;
		/**
		 * Optional intermediate bytes, must be in range \x20 .. \x2f.
		 * Usable in CSI, DCS and ESC.
		 */
		intermediates?: string;
		/**
		 * Final byte, must be in range \x40 .. \x7e for CSI and DCS,
		 * \x30 .. \x7e for ESC.
		 */
		final: string;
	}

	/**
	 * (EXPERIMENTAL) Parser interface.
	 */
	export interface IParser {
		/**
		 * Adds a handler for CSI escape sequences.
		 * @param id Specifies the function identifier under which the callback
		 * gets registered, e.g. {final: 'm'} for SGR.
		 * @param callback The function to handle the sequence. The callback is
		 * called with the numerical params. If the sequence has subparams the
		 * array will contain subarrays with their numercial values.
		 * Return true if the sequence was handled; false if we should try
		 * a previous handler (set by addCsiHandler or setCsiHandler).
		 * The most recently-added handler is tried first.
		 * @return An IDisposable you can call to remove this handler.
		 */
		addCsiHandler(id: IFunctionIdentifier, callback: (params: (number | number[])[]) => boolean): IDisposable;

		/**
		 * Adds a handler for DCS escape sequences.
		 * @param id Specifies the function identifier under which the callback
		 * gets registered, e.g. {intermediates: '$' final: 'q'} for DECRQSS.
		 * @param callback The function to handle the sequence. Note that the
		 * function will only be called once if the sequence finished sucessfully.
		 * There is currently no way to intercept smaller data chunks, data chunks
		 * will be stored up until the sequence is finished. Since DCS sequences
		 * are not limited by the amount of data this might impose a problem for
		 * big payloads. Currently xterm.js limits DCS payload to 10 MB
		 * which should give enough room for most use cases.
		 * The function gets the payload and numerical parameters as arguments.
		 * Return true if the sequence was handled; false if we should try
		 * a previous handler (set by addDcsHandler or setDcsHandler).
		 * The most recently-added handler is tried first.
		 * @return An IDisposable you can call to remove this handler.
		 */
		addDcsHandler(id: IFunctionIdentifier, callback: (data: string, param: (number | number[])[]) => boolean): IDisposable;

		/**
		 * Adds a handler for ESC escape sequences.
		 * @param id Specifies the function identifier under which the callback
		 * gets registered, e.g. {intermediates: '%' final: 'G'} for
		 * default charset selection.
		 * @param callback The function to handle the sequence.
		 * Return true if the sequence was handled; false if we should try
		 * a previous handler (set by addEscHandler or setEscHandler).
		 * The most recently-added handler is tried first.
		 * @return An IDisposable you can call to remove this handler.
		 */
		addEscHandler(id: IFunctionIdentifier, handler: () => boolean): IDisposable;

		/**
		 * Adds a handler for OSC escape sequences.
		 * @param ident The number (first parameter) of the sequence.
		 * @param callback The function to handle the sequence. Note that the
		 * function will only be called once if the sequence finished sucessfully.
		 * There is currently no way to intercept smaller data chunks, data chunks
		 * will be stored up until the sequence is finished. Since OSC sequences
		 * are not limited by the amount of data this might impose a problem for
		 * big payloads. Currently xterm.js limits OSC payload to 10 MB
		 * which should give enough room for most use cases.
		 * The callback is called with OSC data string.
		 * Return true if the sequence was handled; false if we should try
		 * a previous handler (set by addOscHandler or setOscHandler).
		 * The most recently-added handler is tried first.
		 * @return An IDisposable you can call to remove this handler.
		 */
		addOscHandler(ident: number, callback: (data: string) => boolean): IDisposable;
	}
}
