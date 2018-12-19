/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import { IModelDecorationOptions, ITextModel } from 'vs/editor/common/model';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ICodeEditorService = createDecorator<ICodeEditorService>('codeEditorService');

export interface ICodeEditorService {
	_serviceBrand: any;

	readonly onCodeEditorAdd: Event<ICodeEditor>;
	readonly onCodeEditorRemove: Event<ICodeEditor>;

	readonly onDiffEditorAdd: Event<IDiffEditor>;
	readonly onDiffEditorRemove: Event<IDiffEditor>;

	readonly onDidChangeTransientModelProperty: Event<ITextModel>;


	addCodeEditor(editor: ICodeEditor): void;
	removeCodeEditor(editor: ICodeEditor): void;
	listCodeEditors(): ICodeEditor[];

	addDiffEditor(editor: IDiffEditor): void;
	removeDiffEditor(editor: IDiffEditor): void;
	listDiffEditors(): IDiffEditor[];

	/**
	 * Returns the current focused code editor (if the focus is in the editor or in an editor widget) or null.
	 */
	getFocusedCodeEditor(): ICodeEditor | null;

	registerDecorationType(key: string, options: IDecorationRenderOptions, parentTypeKey?: string): void;
	removeDecorationType(key: string): void;
	resolveDecorationOptions(typeKey: string, writable: boolean): IModelDecorationOptions;

	setTransientModelProperty(model: ITextModel, key: string, value: any): void;
	getTransientModelProperty(model: ITextModel, key: string): any;

	getActiveCodeEditor(): ICodeEditor | null;
	openCodeEditor(input: IResourceInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null>;
}
