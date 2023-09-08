/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/179213

	export class CodeActionKind2 {

		/**
		 * Base kind for all code actions applying to the enitre notebook's scope. CodeActionKinds using
		 * this should always begin with `notebook.`
		 *
		 * This can be appended to the beginning of existing kinds, or have new kinds created for it by
		 * extensions contributing CodeActionProviders
		 *
		 * Example Kinds/Actions:
		 * - `notebook.source.organizeImports` (might move all imports to a new top cell)
		 * - `notebook.normalizeVariableNames` (might rename all variables to a standardized casing format)
		 */
		static readonly Notebook: CodeActionKind;

		constructor(value: string);
	}
}
