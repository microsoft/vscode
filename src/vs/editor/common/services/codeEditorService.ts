/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {ICommonCodeEditor, IDecorationRenderOptions, IModelDecorationOptions} from 'vs/editor/common/editorCommon';

export var ID_CODE_EDITOR_SERVICE = 'codeEditorService';
export var ICodeEditorService = createDecorator<ICodeEditorService>(ID_CODE_EDITOR_SERVICE);

export interface ICodeEditorService {
	_serviceBrand: any;

	addCodeEditor(editor: ICommonCodeEditor): void;
	onCodeEditorAdd: Event<ICommonCodeEditor>;

	removeCodeEditor(editor: ICommonCodeEditor): void;
	onCodeEditorRemove: Event<ICommonCodeEditor>;

	getCodeEditor(editorId: string): ICommonCodeEditor;

	listCodeEditors(): ICommonCodeEditor[];

	/**
	 * Returns the current focused code editor (if the focus is in the editor or in an editor widget) or null.
	 */
	getFocusedCodeEditor(): ICommonCodeEditor;

	registerDecorationType(key:string, options: IDecorationRenderOptions, parentTypeKey?: string): void;
	removeDecorationType(key:string): void;
	resolveDecorationOptions(typeKey:string, writable: boolean): IModelDecorationOptions;
}
