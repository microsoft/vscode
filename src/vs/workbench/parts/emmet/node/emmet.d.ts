/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'emmet' {

	export interface Range {
		start: number;
		end: number;
	}

	export interface Preferences {
		reset();
	}

	export interface Profiles {
		reset();
	}

	export interface Editor {
		/**
		 * Returns character indexes of selected text: object with <code>start</code>
		 * and <code>end</code> properties. If there's no selection, should return
		 * object with <code>start</code> and <code>end</code> properties referring
		 * to current caret position
		 * @return {Object}
		 * @example
		 * var selection = editor.getSelectionRange();
		 * alert(selection.start + ', ' + selection.end);
		 */
		getSelectionRange(): Range;

		/**
		 * Creates selection from <code>start</code> to <code>end</code> character
		 * indexes. If <code>end</code> is omitted, this method should place caret
		 * and <code>start</code> index
		 * @param {Number} start
		 * @param {Number} [end]
		 * @example
		 * editor.createSelection(10, 40);
		 *
		 * //move caret to 15th character
		 * editor.createSelection(15);
		 */
		createSelection(start: number, end?: number): void;

		/**
		 * Returns current line's start and end indexes as object with <code>start</code>
		 * and <code>end</code> properties
		 * @return {Object}
		 * @example
		 * var range = editor.getCurrentLineRange();
		 * alert(range.start + ', ' + range.end);
		 */
		getCurrentLineRange(): Range;

		/**
		 * Returns current caret position
		 * @return {Number|null}
		 */
		getCaretPos(): number;

		/**
		 * Set new caret position
		 * @param {Number} pos Caret position
		 */
		setCaretPos(pos: number): void;

		/**
		 * Returns content of current line
		 * @return {String}
		 */
		getCurrentLine(): string;

		/**
		 * Replace editor's content or it's part (from <code>start</code> to
		 * <code>end</code> index). If <code>value</code> contains
		 * <code>caret_placeholder</code>, the editor will put caret into
		 * this position. If you skip <code>start</code> and <code>end</code>
		 * arguments, the whole target's content will be replaced with
		 * <code>value</code>.
		 *
		 * If you pass <code>start</code> argument only,
		 * the <code>value</code> will be placed at <code>start</code> string
		 * index of current content.
		 *
		 * If you pass <code>start</code> and <code>end</code> arguments,
		 * the corresponding substring of current target's content will be
		 * replaced with <code>value</code>.
		 * @param {String} value Content you want to paste
		 * @param {Number} [start] Start index of editor's content
		 * @param {Number} [end] End index of editor's content
		 * @param {Boolean} [no_indent] Do not auto indent <code>value</code>
		 */
		replaceContent(value: string, start: number, end: number, no_indent: boolean): void;

		/**
		 * Returns editor's content
		 * @return {String}
		 */
		getContent(): string;

		/**
		 * Returns current editor's syntax mode
		 * @return {String}
		 */
		getSyntax(): string;

		/**
		 * Returns current output profile name (see profile module).
		 * In most cases, this method should return <code>null</code> and let
		 * Emmet guess best profile name for current syntax and user data.
		 * In case you’re using advanced editor with access to syntax scopes
		 * (like Sublime Text 2), you can return syntax name for current scope.
		 * For example, you may return `line` profile when editor caret is inside
		 * string of programming language.
		 *
		 * @return {String}
		 */
		getProfileName(): string;

		/**
		 * Ask user to enter something
		 * @param {String} title Dialog title
		 * @return {String} Entered data
		 */
		prompt(title: string): string;

		getSelection(): string;

		/**
		 * Returns current editor's file path
		 * @return {String}
		 */
		getFilePath(): string;
	}

	/**
	 * Runs given action
	 * @param  {String} name Action name
	 * @param  {IEmmetEditor} editor Editor instance
	 * @return {Boolean} Returns true if action was performed successfully
	 */
	export function run(action: string, editor: Editor, arg?: string): boolean;

	export const preferences: Preferences;

	export const profile: Profiles;

	/**
	 * Loads preferences from JSON object
	 */
	export function loadPreferences(preferences: any): void;

	/**
	 * Loads named profiles from JSON object
	 */
	export function loadProfiles(profiles: any): void;

	/**
	 * Loads user snippets and abbreviations.
	 */
	export function loadSnippets(snippets: any): void;

	/**
	 * Resets all user-defined data: preferences, profiles and snippets
	 */
	export function resetUserData(): void;
}
