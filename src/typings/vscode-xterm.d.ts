/**
 * @license MIT
 *
 * This contains the type declarations for the xterm.js library. Note that
 * some interfaces differ between this file and the actual implementation in
 * src/, that's because this file declares the *public* API which is intended
 * to be stable and consumed by external programs.
 */

/// <reference lib="dom"/>

declare module 'vscode-xterm' {
	/**
	 * A string representing text font weight.
	 */
	export type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

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
		 * executing open() method and can't be changed later without excuting it again.
		 * Warning: Enabling this option can reduce performances somewhat.
		 */
		allowTransparency?: boolean;

		/**
		 * A data uri of the sound to use for the bell (needs bellStyle = 'sound').
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
		 * Whether to enable the rendering of bold text.
		 *
		 * @deprecated Use fontWeight and fontWeightBold instead.
		 */
		enableBold?: boolean;

		/**
		 * What character atlas implementation to use. The character atlas caches drawn characters,
		 * speeding up rendering significantly. However, it can introduce some minor rendering
		 * artifacts.
		 *
		 * - 'none': Don't use an atlas.
		 * - 'static': Generate an atlas when the terminal starts or is reconfigured. This atlas will
		 *   only contain ASCII characters in 16 colors.
		 * - 'dynamic': Generate an atlas using a LRU cache as characters are requested. Limited to
		 *   ASCII characters (for now), but supports 256 colors. For characters covered by the static
		 *   cache, it's slightly slower in comparison, since there's more overhead involved in
		 *   managing the cache.
		 *
		 * Currently defaults to 'static'. This option may be removed in the future. If it is, passed
		 * parameters will be ignored.
		 */
		experimentalCharAtlas?: 'none' | 'static' | 'dynamic';

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
		 * Whether to treat option as the meta key.
		 */
		macOptionIsMeta?: boolean;

		/**
		 * Whether holding a modifier key will force normal selection behavior,
		 * regardless of whether the terminal is in mouse events mode. This will
		 * also prevent mouse events from being emitted by the terminal. For example,
		 * this allows you to use xterm.js' regular selection inside tmux with
		 * mouse mode enabled.
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
		 * The amount of scrollback in the terminal. Scrollback is the amount of rows
		 * that are retained when lines are scrolled beyond the initial viewport.
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
	}

	/**
	 * Contains colors to theme the terminal with.
	 */
	export interface ITheme {
		/** The default foreground color */
		foreground?: string,
		/** The default background color */
		background?: string,
		/** The cursor color */
		cursor?: string,
		/** The accent color of the cursor (used as the foreground color for a block cursor) */
		cursorAccent?: string,
		/** The selection color (can be transparent) */
		selection?: string,
		/** ANSI black (eg. `\x1b[30m`) */
		black?: string,
		/** ANSI red (eg. `\x1b[31m`) */
		red?: string,
		/** ANSI green (eg. `\x1b[32m`) */
		green?: string,
		/** ANSI yellow (eg. `\x1b[33m`) */
		yellow?: string,
		/** ANSI blue (eg. `\x1b[34m`) */
		blue?: string,
		/** ANSI magenta (eg. `\x1b[35m`) */
		magenta?: string,
		/** ANSI cyan (eg. `\x1b[36m`) */
		cyan?: string,
		/** ANSI white (eg. `\x1b[37m`) */
		white?: string,
		/** ANSI bright black (eg. `\x1b[1;30m`) */
		brightBlack?: string,
		/** ANSI bright red (eg. `\x1b[1;31m`) */
		brightRed?: string,
		/** ANSI bright green (eg. `\x1b[1;32m`) */
		brightGreen?: string,
		/** ANSI bright yellow (eg. `\x1b[1;33m`) */
		brightYellow?: string,
		/** ANSI bright blue (eg. `\x1b[1;34m`) */
		brightBlue?: string,
		/** ANSI bright magenta (eg. `\x1b[1;35m`) */
		brightMagenta?: string,
		/** ANSI bright cyan (eg. `\x1b[1;36m`) */
		brightCyan?: string,
		/** ANSI bright white (eg. `\x1b[1;37m`) */
		brightWhite?: string
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
		 * The priority of the link matcher, this defines the order in which the link
		 * matcher is evaluated relative to others, from highest to lowest. The
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

	export interface IEventEmitter {
		on(type: string, listener: (...args: any[]) => void): void;
		off(type: string, listener: (...args: any[]) => void): void;
		emit(type: string, data?: any): void;
		addDisposableListener(type: string, handler: (...args: any[]) => void): IDisposable;
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

	export interface IMarker extends IDisposable {
		readonly id: number;
		readonly isDisposed: boolean;
		readonly line: number;
	}

	export interface ILocalizableStrings {
		blankLine: string;
		promptLabel: string;
		tooMuchOutput: string;
	}

	/**
	 * The class that represents an xterm.js terminal.
	 */
	export class Terminal implements IEventEmitter, IDisposable {
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
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 * @deprecated use `Terminal.onEvent(listener)` instead.
		 */
		on(type: 'blur' | 'focus' | 'linefeed' | 'selection', listener: () => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 * @deprecated use `Terminal.onEvent(listener)` instead.
		 */
		on(type: 'data', listener: (...args: any[]) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 * @deprecated use `Terminal.onEvent(listener)` instead.
		 */
		on(type: 'key', listener: (key: string, event: KeyboardEvent) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 * @deprecated use `Terminal.onEvent(listener)` instead.
		 */
		on(type: 'keypress' | 'keydown', listener: (event: KeyboardEvent) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 * @deprecated use `Terminal.onEvent(listener)` instead.
		 */
		on(type: 'refresh', listener: (data: { start: number, end: number }) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 * @deprecated use `Terminal.onEvent(listener)` instead.
		 */
		on(type: 'resize', listener: (data: { cols: number, rows: number }) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 * @deprecated use `Terminal.onEvent(listener)` instead.
		 */
		on(type: 'scroll', listener: (ydisp: number) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 * @deprecated use `Terminal.onEvent(listener)` instead.
		 */
		on(type: 'title', listener: (title: string) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 * @deprecated use `Terminal.onEvent(listener)` instead.
		 */
		on(type: string, listener: (...args: any[]) => void): void;

		/**
		 * Deregisters an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 * @deprecated use `Terminal.onEvent(listener).dispose()` instead.
		 */
		off(type: 'blur' | 'focus' | 'linefeed' | 'selection' | 'data' | 'key' | 'keypress' | 'keydown' | 'refresh' | 'resize' | 'scroll' | 'title' | string, listener: (...args: any[]) => void): void;

		/**
		 * Emits an event on the terminal.
		 * @param type The type of event
		 * @param data data associated with the event.
		 * @deprecated This is being removed from the API with no replacement, see
		 * issue #1505.
		 */
		emit(type: string, data?: any): void;

		/**
		 * Adds an event listener to the Terminal, returning an IDisposable that can
		 * be used to conveniently remove the event listener.
		 * @param type The type of event.
		 * @param handler The event handler.
		 * @deprecated use `Terminal.onEvent(listener)` instead.
		 */
		addDisposableListener(type: string, handler: (...args: any[]) => void): IDisposable;

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
		 * (EXPERIMENTAL) Adds a handler for CSI escape sequences.
		 * @param flag The flag should be one-character string, which specifies the
		 * final character (e.g "m" for SGR) of the CSI sequence.
		 * @param callback The function to handle the escape sequence. The callback
		 * is called with the numerical params, as well as the special characters
		 * (e.g. "$" for DECSCPP). Return true if the sequence was handled; false if
		 * we should try a previous handler (set by addCsiHandler or setCsiHandler).
		 * The most recently-added handler is tried first.
		 * @return An IDisposable you can call to remove this handler.
		 */
		addCsiHandler(flag: string, callback: (params: number[], collect: string) => boolean): IDisposable;

		/**
		 * (EXPERIMENTAL) Adds a handler for OSC escape sequences.
		 * @param ident The number (first parameter) of the sequence.
		 * @param callback The function to handle the escape sequence. The callback
		 * is called with OSC data string. Return true if the sequence was handled;
		 * false if we should try a previous handler (set by addOscHandler or
		 * setOscHandler). The most recently-added handler is tried first.
		 * @return An IDisposable you can call to remove this handler.
		 */
		addOscHandler(ident: number, callback: (data: string) => boolean): IDisposable;

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
		 * Destroys the terminal and detaches it from the DOM.
		 *
		 * @deprecated Use dispose() instead.
		 */
		destroy(): void;

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
		 * Writes UTF8 data to the terminal.
		 * This has a slight performance advantage over the string based write method
		 * due to lesser data conversions needed on the way from the pty to xterm.js.
		 * @param data The data to write to the terminal.
		 */
		writeUtf8(data: Uint8Array): void;

		/**
		 * Retrieves an option's value from the terminal.
		 * @param key The option key.
		 */
		getOption(key: 'bellSound' | 'bellStyle' | 'cursorStyle' | 'fontFamily' | 'fontWeight' | 'fontWeightBold' | 'rendererType' | 'termName'): string;
		/**
		 * Retrieves an option's value from the terminal.
		 * @param key The option key.
		 */
		getOption(key: 'allowTransparency' | 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'debug' | 'disableStdin' | 'enableBold' | 'macOptionIsMeta' | 'rightClickSelectsWord' | 'popOnBell' | 'screenKeys' | 'useFlowControl' | 'visualBell' | 'windowsMode'): boolean;
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
		setOption(key: 'fontFamily' | 'termName' | 'bellSound', value: string): void;
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
		setOption(key: 'allowTransparency' | 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'debug' | 'disableStdin' | 'enableBold' | 'macOptionIsMeta' | 'popOnBell' | 'rightClickSelectsWord' | 'screenKeys' | 'useFlowControl' | 'visualBell' | 'windowsMode', value: boolean): void;
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
		reset(): void

		/**
		 * Applies an addon to the Terminal prototype, making it available to all
		 * newly created Terminals.
		 * @param addon The addon to apply.
		 * @deprecated Use the new loadAddon API/addon format.
		 */
		static applyAddon(addon: any): void;

		/**
		 * (EXPERIMENTAL) Loads an addon into this instance of xterm.js.
		 * @param addon The addon to load.
		 */
		loadAddon(addon: ITerminalAddon): void;
	}

	/**
	 * An addon that can provide additional functionality to the terminal.
	 */
	export interface ITerminalAddon extends IDisposable {
		/**
		 * (EXPERIMENTAL) This is called when the addon is activated within xterm.js.
		 */
		activate(terminal: Terminal): void;
	}

	/**
	 * An object representing a selecrtion within the terminal.
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
		 * Gets a line from the buffer, or undefined if the line index does not exist.
		 *
		 * Note that the result of this function should be used immediately after calling as when the
		 * terminal updates it could lead to unexpected behavior.
		 *
		 * @param y The line index to get.
		 */
		getLine(y: number): IBufferLine | undefined;
	}

	interface IBufferLine {
		/**
		 * Whether the line is wrapped from the previous line.
		 */
		readonly isWrapped: boolean;

		/**
		 * Gets a cell from the line, or undefined if the line index does not exist.
		 *
		 * Note that the result of this function should be used immediately after calling as when the
		 * terminal updates it could lead to unexpected behavior.
		 *
		 * @param x The character index to get.
		 */
		getCell(x: number): IBufferCell;

		/**
		 * Gets the line as a string. Note that this is gets only the string for the line, not taking
		 * isWrapped into account.
		 *
		 * @param trimRight Whether to trim any whitespace at the right of the line.
		 * @param startColumn The column to start from (inclusive).
		 * @param endColumn The column to end at (exclusive).
		 */
		translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
	}

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
}


// Modifications to official .d.ts below
declare module 'vscode-xterm' {
	interface TerminalCore {
		debug: boolean;

		handler(text: string): void;

		_onScroll: IEventEmitter2<number>;
		_onKey: IEventEmitter2<{ key: string }>;

		charMeasure?: { height: number, width: number };

		_renderCoordinator: {
			_renderer: {
				_renderLayers: any[];
			};
			_onIntersectionChange: any;
		};
	}

	interface IEventEmitter2<T> {
		fire(e: T): void;
	}

	interface ISearchOptions {
		/**
		 * Whether the find should be done as a regex.
		 */
		regex?: boolean;
		/**
		 * Whether only whole words should match.
		 */
		wholeWord?: boolean;
		/**
		 * Whether find should pay attention to case.
		 */
		caseSensitive?: boolean;
	}

	interface Terminal {
		_core: TerminalCore;

		webLinksInit(handler?: (event: MouseEvent, uri: string) => void, options?: ILinkMatcherOptions): void;

		/**
		 * Find the next instance of the term, then scroll to and select it. If it
		 * doesn't exist, do nothing.
		 * @param term The search term.
		 * @param findOptions Regex, whole word, and case sensitive options.
		 * @return Whether a result was found.
		 */
		findNext(term: string, findOptions: ISearchOptions): boolean;

		/**
		 * Find the previous instance of the term, then scroll to and select it. If it
		 * doesn't exist, do nothing.
		 * @param term The search term.
		 * @param findOptions Regex, whole word, and case sensitive options.
		 * @return Whether a result was found.
		 */
		findPrevious(term: string, findOptions: ISearchOptions): boolean;
	}
}
