/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AMD2ESM mirgation relevant

/**
 * NLS Globals:
 *
 * Every entry point (electron-main, electron-sandbox, node.js,
 * workers, monaco editor, utility process) that uses `localize`
 * or `localize2` must include bootstrap code to fill in below
 * globals before executing. That is because during build time
 * we strip out all english strings from the resulting JS code
 * and replace it with a <number> that is then looked up from
 * the `_VSCODE_NLS_MESSAGES` array.
 */
declare global {

	/**
	 * All NLS messages produced by `localize` and `localize2` calls
	 * under `src/vs` translated to the language as indicated by
	 * `_VSCODE_NLS_LANGUAGE`.
	 */
	var _VSCODE_NLS_MESSAGES: string[];
	/**
	 * The actual language of the NLS messages (e.g. 'en', de' or 'pt-br').
	 */
	var _VSCODE_NLS_LANGUAGE: string | undefined;
}

// fake export to make global work
export { }
