/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AMD2ESM mirgation relevant

declare global {

	/**
	 * @deprecated You MUST use `IProductService` whenever possible.
	 */
	var _VSCODE_PRODUCT_JSON: Record<string, any>;
	/**
	 * @deprecated You MUST use `IProductService` whenever possible.
	 */
	var _VSCODE_PACKAGE_JSON: Record<string, any>;
	/**
	 * All NLS messages produced by `localize` and `localize2` calls
	 * under `src/vs`.
	 */
	var _VSCODE_NLS: string[];
	/**
	 * Whether the running instance should use a pseudo-locale.
	 */
	var _VSCODE_NLS_PSEUDO: true | undefined;
}

// fake export to make global work
export { }
