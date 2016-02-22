/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import {ServiceIdentifier, createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {ICommonCodeEditor, IDecorationRenderOptions, IModelDecorationOptions} from 'vs/editor/common/editorCommon';

export var ID_CODE_EDITOR_SERVICE = 'codeEditorService';
export var ICodeEditorService = createDecorator<ICodeEditorService>(ID_CODE_EDITOR_SERVICE);

export interface ICodeEditorService {
	serviceId: ServiceIdentifier<any>;

	addCodeEditor(editor: ICommonCodeEditor): void;

	onCodeEditorAdd: Event<ICommonCodeEditor>;

	removeCodeEditor(editor: ICommonCodeEditor): void;

	onCodeEditorRemove: Event<ICommonCodeEditor>;

	getCodeEditor(editorId: string): ICommonCodeEditor;

	listCodeEditors(): ICommonCodeEditor[];

	registerDecorationType(key:string, options: IDecorationRenderOptions): void;
	removeDecorationType(key:string): void;
	resolveDecorationType(key:string): IModelDecorationOptions;
}
