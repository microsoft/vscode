/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

// HACK: gulp-tsb doesn't play nice with importing from typings
// import { Terminal, ITerminalAddon } from 'xterm';

declare module 'xterm-addon-search' {
	/**
	 * Options for a search.
	 */
	export interface ISearchOptions {
		/**
		 * Whether the search term is a regex.
		 */
		regex?: boolean;

		/**
		 * Whether to search for a whole word, the result is only valid if it's
		 * suppounded in "non-word" characters such as `_`, `(`, `)` or space.
		 */
		wholeWord?: boolean;

		/**
		 * Whether the search is case sensitive.
		 */
		caseSensitive?: boolean;

		/**
		 * Whether to do an indcremental search, this will expand the selection if it
		 * still matches the term the user typed. Note that this only affects
		 * `findNext`, not `findPrevious`.
		 */
		incremental?: boolean;
	}

	/**
	 * An xterm.js addon that provides search functionality.
	 */
	export class SearchAddon {
		/**
		 * Activates the addon
		 * @param terminal The terminal the addon is being loaded in.
		 */
		public activate(terminal: any): void;

		/**
		 * Disposes the addon.
		 */
		public dispose(): void;

		/**
		 * Search forwards for the next result that matches the search term and
		 * options.
		 * @param term The search term.
		 * @param searchOptions The options for the search.
		 */
		public findNext(term: string, searchOptions?: ISearchOptions): boolean;

		/**
		 * Search backwards for the previous result that matches the search term and
		 * options.
		 * @param term The search term.
		 * @param searchOptions The options for the search.
		 */
		public findPrevious(term: string, searchOptions?: ISearchOptions): boolean;
	}
}
