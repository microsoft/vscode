/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextEditor } from 'vscode';

/**
 * The API provided by the Copilot extension.
 */
export interface CopilotExtensionApi {
	/**
	 *
	 * @param editor - The optional text editor to select the scope in. If not provided, the active text editor will be used.
	 * @param options - Additional options for selecting the scope.
	 * @param options.reason - The reason for selecting the scope. Will be used in the placeholder hint.
	 * @returns A promise that resolves to the selected scope as a `Selection` object, or `undefined` if no scope was selected.
	 */
	selectScope: (editor?: TextEditor, options?: { reason?: string }) => Promise<Selection | undefined>;
}
