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
	 * Depending on the runtime context:
	 * - browser: the `locale` value of the https://www.vscode-unpkg.net/nls/ call
	 * - native: the `userLocale` as configured in `argv.json` or `app.getLocale()`
	 */
	var _VSCODE_NLS_LOCALE: string | undefined;
}

// fake export to make global work
export { }
