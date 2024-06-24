/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AMD2ESM mirgation relevant

declare global {

	/**
	 * All NLS messages produced by `localize` and `localize2` calls
	 * under `src/vs`.
	 */
	var _VSCODE_NLS_MESSAGES: string[];
	/**
	 * The actual language of the NLS messages (e.g. 'en', de' or 'pt-br').
	 */
	var _VSCODE_NLS_LANGUAGE: string | undefined;
}

// fake export to make global work
export { }
