/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IFileEditorInput, IUntypedEditorInput, IUntypedFileEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';

export const ITextEditorService = createDecorator<ITextEditorService>('textEditorService');

export interface ITextEditorService {

	readonly _serviceBrand: undefined;

	/**
	 * A way to create text editor inputs from an untyped editor input. Depending
	 * on the passed in input this will be:
	 * - a `IFileEditorInput` for file resources
	 * - a `UntitledEditorInput` for untitled resources
	 * - a `TextResourceEditorInput` for virtual resources
	 *
	 * @param input the untyped editor input to create a typed input from
	 */
	createTextEditor(input: IUntypedEditorInput): EditorInput;
	createTextEditor(input: IUntypedFileEditorInput): IFileEditorInput;
}
