/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';

export const ICustomTabLabelService = createDecorator<ICustomTabLabelService>('customTabLabelService');

export interface ICustomTabLabelService {
	readonly _serviceBrand: undefined;

	/**
	 * Set custom tab label for editor
	 * @param editor The editor input that represents tab
	 * @param groupId The id of the group
	 * @param input Tab `name` and `description`
	 */
	setCustomTabLabelForEditor(editor: EditorInput, groupId: number, input: TabLabelInput | undefined): void;

	/**
	 * Retrieve custom tab label for editor
	 * @param editor The editor input that represents tab
	 * @param groupId The id of the group
	 * @returns Tab `name` and `description` or `undefined` in case custom label wasn't set
	 */
	getCustomTabLabelForEditor(editor: EditorInput, groupId: number): TabLabelInput | undefined;
}

export interface TabLabelInput {
	name: string;
	description: string;
}
