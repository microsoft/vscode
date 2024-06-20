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
	var _VSCODE_NLS: string[];
	/**
	 * Whether the running instance should use a pseudo-locale.
	 */
	var _VSCODE_NLS_PSEUDO: true | undefined;
	/**
	 * The locale the NLS messages are translated to.
	 */
	var _VSCODE_NLS_LOCALE: string | undefined;
}

// fake export to make global work
export { }
