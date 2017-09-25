/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as objects from 'vs/base/common/objects';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { IConfigurationChangedEvent, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class EmbeddedCodeEditorWidget extends CodeEditor {

	private _parentEditor: ICodeEditor;
	private _overwriteOptions: IEditorOptions;

	constructor(
		domElement: HTMLElement,
		options: IEditorOptions,
		parentEditor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService
	) {
		super(domElement, parentEditor.getRawConfiguration(), instantiationService, codeEditorService, commandService, contextKeyService, themeService);

		this._parentEditor = parentEditor;
		this._overwriteOptions = options;

		// Overwrite parent's options
		super.updateOptions(this._overwriteOptions);

		this._register(parentEditor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => this._onParentConfigurationChanged(e)));
	}

	public getParentEditor(): ICodeEditor {
		return this._parentEditor;
	}

	private _onParentConfigurationChanged(e: IConfigurationChangedEvent): void {
		super.updateOptions(this._parentEditor.getRawConfiguration());
		super.updateOptions(this._overwriteOptions);
	}

	public updateOptions(newOptions: IEditorOptions): void {
		objects.mixin(this._overwriteOptions, newOptions, true);
		super.updateOptions(this._overwriteOptions);
	}
}