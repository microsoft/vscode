/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IResourceInput } from 'vs/platform/editor/common/editor';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditor } from 'vs/editor/common/editorCommon';

export const ITextEditorService = createDecorator<ITextEditorService>('textEditorService');

export interface ITextEditorService {

	_serviceBrand: ServiceIdentifier<ITextEditorService>;

	/**
	 * The currently active text editor or `null` if none.
	 */
	readonly activeTextEditorControl: IEditor;

	/**
	 * Open a text editor.
	 */
	openTextEditor(editor: IResourceInput, sideBySide?: boolean): Thenable<ICodeEditor>;
}