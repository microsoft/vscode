/**
 * @license MIT
 *
 * This contains the type declarations for the xterm.js library. Note that
 * some interfaces differ between this file and the actual implementation in
 * src/, that's because this file declares the *public* API which is intended
 * to be stable and consumed by external programs.
 */

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
		 * (EXPERIMENTAL) Defines which implementation to use for buffer lines.
		 *
		 * - 'JsArray': The default/stable implementation.
		 * - 'TypedArray': The new experimental implementation based on TypedArrays that is expected to
		 *   significantly boost performance and memory consumption. Use at your own risk.
		 *
		 * This option will be removed in the future.
		 */
		experimentalBufferLineImpl?: 'JsArray' | 'TypedArray';
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
		 * (EXPERIMENTAL) The type of renderer to use, this allows using the
		 * fallback DOM renderer when canvas is too slow for the environment. The
		 * following features do not work when the DOM renderer is used:
		 *
		 * - Links
		 * - Line height
		 * - Letter spacing
		 * - Cursor blink
		 * - Cursor style
		 *
		 * This option is marked as experiemental because it will eventually be
		 * moved to an addon. You can only set this option in the constructor (not
		 * setOption).
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
		leaveCallback?: (event: MouseEvent, uri: string) => boolean | void;

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
		element: HTMLElement;

		/**
		 * The textarea that accepts input for the terminal.
		 */
		textarea: HTMLTextAreaElement;

		/**
		 * The number of rows in the terminal's viewport.
		 */
		rows: number;

		/**
		 * The number of columns in the terminal's viewport.
		 */
		cols: number;

		/**
		 * (EXPERIMENTAL) Get all markers registered against the buffer. If the alt
		 * buffer is active this will always return [].
		 */
		markers: IMarker[];

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
		 */
		on(type: 'blur' | 'focus' | 'linefeed' | 'selection', listener: () => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 */
		on(type: 'data', listener: (...args: any[]) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 */
		on(type: 'key', listener: (key: string, event: KeyboardEvent) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 */
		on(type: 'keypress' | 'keydown', listener: (event: KeyboardEvent) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 */
		on(type: 'refresh', listener: (data: {start: number, end: number}) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 */
		on(type: 'resize', listener: (data: {cols: number, rows: number}) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 */
		on(type: 'scroll', listener: (ydisp: number) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 */
		on(type: 'title', listener: (title: string) => void): void;
		/**
		 * Registers an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 */
		on(type: string, listener: (...args: any[]) => void): void;

		/**
		 * Deregisters an event listener.
		 * @param type The type of the event.
		 * @param listener The listener.
		 */
		off(type: 'blur' | 'focus' | 'linefeed' | 'selection' | 'data' | 'key' | 'keypress' | 'keydown' | 'refresh' | 'resize' | 'scroll' | 'title' | string, listener: (...args: any[]) => void): void;

		emit(type: string, data?: any): void;

		addDisposableListener(type: string, handler: (...args: any[]) => void): IDisposable;

		/**
		 * Resizes the terminal.
		 * @param x The number of columns to resize to.
		 * @param y The number of rows to resize to.
		 */
		resize(columns: number, rows: number): void;

		/**
		 * Writes text to the terminal, followed by a break line character (\n).
		 * @param data The text to write to the terminal.
		 */
		writeln(data: string): void;

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
		 * propogation and/or prevent the default action. The function returns
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
		 * Clears the current terminal selection.
		 */
		clearSelection(): void;

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
		 * Retrieves an option's value from the terminal.
		 * @param key The option key.
		 */
		getOption(key: 'bellSound' | 'bellStyle' | 'cursorStyle' | 'fontFamily' | 'fontWeight' | 'fontWeightBold' | 'rendererType' | 'termName'): string;
		/**
		 * Retrieves an option's value from the terminal.
		 * @param key The option key.
		 */
		getOption(key: 'allowTransparency' | 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'debug' | 'disableStdin' | 'enableBold' | 'macOptionIsMeta' | 'rightClickSelectsWord' | 'popOnBell' | 'screenKeys' | 'useFlowControl' | 'visualBell'): boolean;
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
		setOption(key: 'allowTransparency' | 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'debug' | 'disableStdin' | 'enableBold' | 'macOptionIsMeta' | 'popOnBell' | 'rightClickSelectsWord' | 'screenKeys' | 'useFlowControl' | 'visualBell', value: boolean): void;
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
		 */
		static applyAddon(addon: any): void;
	}
}

// Modifications to official .d.ts below
declare module 'vscode-xterm' {
	interface TerminalCore {
		debug: boolean;

		buffer: {
			y: number;
			ybase: number;
			ydisp: number;
			x: number;
			lines: any[];

			translateBufferLineToString(lineIndex: number, trimRight: boolean): string;
		};

		handler(text: string): void;

		/**
		 * Emit an event on the terminal.
		 */
		emit(type: string, data: any): void;

		charMeasure?: { height: number, width: number };

		renderer: {
			_renderLayers: any[];
			onIntersectionChange: any;
		};
	}

	interface ISearchOptions  {
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
		winptyCompatInit(): void;

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
