/**
 * @license MIT
 *
 * This contains the type declarations for the xterm.js library. Note that
 * some interfaces differ between this file and the actual implementation in
 * src/, that's because this file declares the *public* API which is intended
 * to be stable and consumed by external programs.
 */

/**
 * An object containing start up options for the terminal.
 */
interface ITerminalOptions {
	/**
	 * A data uri of the sound to use for the bell (needs bellStyle = 'sound').
	 */
	bellSound?: string;

	/**
	 * The type of the bell notification the terminal will use.
	 */
	bellStyle?: 'none' | 'visual' | 'sound' | 'both';

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
	 * The number of rows in the terminal.
	 */
	rows?: number;

	/**
	 * The amount of scrollback in the terminal. Scrollback is the amount of rows
	 * that are retained when lines are scrolled beyond the initial viewport.
	 */
	scrollback?: number;

	/**
	 * The size of tab stops in the terminal.
	 */
	tabStopWidth?: number;
  }

  /**
   * An object containing options for a link matcher.
   */
  interface ILinkMatcherOptions {
	/**
	 * The index of the link from the regex.match(text) call. This defaults to 0
	 * (for regular expressions without capture groups).
	 */
	matchIndex?: number;

	/**
	 * A callback that validates an individual link, returning true if valid and
	 * false if invalid.
	 */
	validationCallback?: (uri: string, element: HTMLElement, callback: (isValid: boolean) => void) => void;

	/**
	 * The priority of the link matcher, this defines the order in which the link
	 * matcher is evaluated relative to others, from highest to lowest. The
	 * default value is 0.
	 */
	priority?: number;
  }

  declare module 'xterm' {
	/**
	 * The class that represents an xterm.js terminal.
	 */
	export class Terminal {
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
	  on(type: 'blur' | 'focus' | 'lineFeed', listener: () => void): void;
	  /**
	   * Registers an event listener.
	   * @param type The type of the event.
	   * @param listener The listener.
	   */
	  on(type: 'data', listener: (data?: string) => void): void;
	  /**
	   * Registers an event listener.
	   * @param type The type of the event.
	   * @param listener The listener.
	   */
	  on(type: 'key', listener: (key?: string, event?: KeyboardEvent) => void): void;
	  /**
	   * Registers an event listener.
	   * @param type The type of the event.
	   * @param listener The listener.
	   */
	  on(type: 'keypress' | 'keydown', listener: (event?: KeyboardEvent) => void): void;
	  /**
	   * Registers an event listener.
	   * @param type The type of the event.
	   * @param listener The listener.
	   */
	  on(type: 'refresh', listener: (data?: {start: number, end: number}) => void): void;
	  /**
	   * Registers an event listener.
	   * @param type The type of the event.
	   * @param listener The listener.
	   */
	  on(type: 'resize', listener: (data?: {cols: number, rows: number}) => void): void;
	  /**
	   * Registers an event listener.
	   * @param type The type of the event.
	   * @param listener The listener.
	   */
	  on(type: 'scroll', listener: (ydisp?: number) => void): void;
	  /**
	   * Registers an event listener.
	   * @param type The type of the event.
	   * @param listener The listener.
	   */
	  on(type: 'title', listener: (title?: string) => void): void;
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
	  off(type: 'blur' | 'focus' | 'lineFeed' | 'data' | 'key' | 'keypress' | 'keydown' | 'refresh' | 'resize' | 'scroll' | 'title' | string, listener: (...args: any[]) => void): void;

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
	   * @param parent The element to create the terminal within.
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
	  registerLinkMatcher(regex: RegExp, handler: (event: MouseEvent, uri: string) => boolean | void , options?: ILinkMatcherOptions): number;

	  /**
	   * (EXPERIMENTAL) Deregisters a link matcher if it has been registered.
	   * @param matcherId The link matcher's ID (returned after register)
	   */
	  deregisterLinkMatcher(matcherId: number): void;

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

	  // /**
	  //  * Find the next instance of the term, then scroll to and select it. If it
	  //  * doesn't exist, do nothing.
	  //  * @param term Tne search term.
	  //  * @return Whether a result was found.
	  //  */
	  // findNext(term: string): boolean;

	  // /**
	  //  * Find the previous instance of the term, then scroll to and select it. If it
	  //  * doesn't exist, do nothing.
	  //  * @param term Tne search term.
	  //  * @return Whether a result was found.
	  //  */
	  // findPrevious(term: string): boolean;

	  /**
	   * Destroys the terminal and detaches it from the DOM.
	   */
	  destroy(): void;

	  /**
	   * Scroll the display of the terminal
	   * @param amount The number of lines to scroll down (negative scroll up).
	   */
	  scrollDisp(amount: number): void;

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
	  getOption(key: 'bellSound' | 'bellStyle' | 'cursorStyle' | 'termName'): string;
	  /**
	   * Retrieves an option's value from the terminal.
	   * @param key The option key.
	   */
	  getOption(key: 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'debug' | 'disableStdin' | 'popOnBell' | 'screenKeys' | 'useFlowControl' | 'visualBell'): boolean;
	  /**
	   * Retrieves an option's value from the terminal.
	   * @param key The option key.
	   */
	  getOption(key: 'colors'): string[];
	  /**
	   * Retrieves an option's value from the terminal.
	   * @param key The option key.
	   */
	  getOption(key: 'cols' | 'rows' | 'tabStopWidth' | 'scrollback'): number;
	  /**
	   * Retrieves an option's value from the terminal.
	   * @param key The option key.
	   */
	  getOption(key: 'geometry'): [number, number];
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
	  setOption(key: 'termName' | 'bellSound', value: string): void;
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
	  setOption(key: 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'debug' | 'disableStdin' | 'popOnBell' | 'screenKeys' | 'useFlowControl' | 'visualBell', value: boolean): void;
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
	  setOption(key: 'cols' | 'rows' | 'tabStopWidth' | 'scrollback', value: number): void;
	  /**
	   * Sets an option on the terminal.
	   * @param key The option key.
	   * @param value The option value.
	   */
	  setOption(key: 'geometry', value: [number, number]): void;
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
	   * Loads an addon, attaching it to the Terminal prototype and making it
	   * available to all newly created Terminals.
	   * @param addon The addon to load.
	   */
	  static loadAddon(addon: 'attach' | 'fit' | 'fullscreen' | 'search' | 'terminado'): void;





	  // Moficiations to official .d.ts below

	   buffer: {
		/**
		 * The viewport position.
		 */
		ydisp: number;
	  };

	  /**
	   * Emit an event on the terminal.
	   */
	  emit(type: string, data: any): void;

	  /**
	   * Find the next instance of the term, then scroll to and select it. If it
	   * doesn't exist, do nothing.
	   * @param term Tne search term.
	   * @return Whether a result was found.
	   */
	  findNext(term: string): boolean;

	  /**
	   * Find the previous instance of the term, then scroll to and select it. If it
	   * doesn't exist, do nothing.
	   * @param term Tne search term.
	   * @return Whether a result was found.
	   */
	  findPrevious(term: string): boolean;
	}
  }
