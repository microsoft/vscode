/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AMD2ESM migration relevant

declare global {

	/**
	 * Holds the file root for resources.
	 */
	var _VSCODE_FILE_ROOT: string;

	/**
	 * CSS loader that's available during development time.
	 * DO NOT call directly, instead just import css modules, like `import 'some.css'`
	 */
	var _VSCODE_CSS_LOAD: (module: string) => void;

	/**
	 * @deprecated You MUST use `IProductService` whenever possible.
	 */
	var _VSCODE_PRODUCT_JSON: Record<string, any>;
	/**
	 * @deprecated You MUST use `IProductService` whenever possible.
	 */
	var _VSCODE_PACKAGE_JSON: Record<string, any>;

	/**
	 * Used to disable CSS import map loading during development. Needed
	 * when a bundler is used that loads the css directly.
	 * @deprecated Avoid using this variable.
	*/
	var _VSCODE_DISABLE_CSS_IMPORT_MAP: boolean | undefined;

	/**
	 * If this variable is set, and the source code references another module
	 * via import, the (relative) module should be referenced (instead of the
	 * JS module in the out folder).
	 * @deprecated Avoid using this variable.
	*/
	var _VSCODE_USE_RELATIVE_IMPORTS: boolean | undefined;
}

// fake export to make global work
export { }
