/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Selection, TextEditor } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const IScopeSelector = createServiceIdentifier<IScopeSelector>('IScopeSelector');
/**
 * Represents a scope selector that provides methods for selecting enclosing symbol ranges.
 */
export interface IScopeSelector {
	_serviceBrand: undefined;
	/**
	 * Selects the range of the enclosing symbol in the given editor.
	 * @param editor The text editor in which to select the enclosing symbol range.
	 * @param options An optional object that can be used to provide additional options for the selection.
	 * @param options.reason An optional string that can be used to customize the placeholder shown for the scope selector.
	 * @param options.includeBlocks Whether to include for/if/while etc. block statements as scope options. Defaults to `false`.
	 * @returns A promise that resolves to the selected range, or undefined if no range could be selected.
	 */
	selectEnclosingScope(editor: TextEditor, options?: { reason?: string; includeBlocks?: boolean }): Promise<Selection | undefined>;
}
