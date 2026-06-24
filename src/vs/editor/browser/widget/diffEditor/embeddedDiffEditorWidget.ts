/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from '../../../../base/common/objects.js';
import { ICodeEditor, IDiffEditorConstructionOptions } from '../../editorBrowser.js';
import { ICodeEditorService } from '../../services/codeEditorService.js';
import { DiffEditorWidget, IDiffCodeEditorWidgetOptions } from './diffEditorWidget.js';
import { ConfigurationChangedEvent, IDiffEditorOptions, IEditorOptions } from '../../../common/config/editorOptions.js';
import { IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
export class EmbeddedDiffEditorWidget extends DiffEditorWidget {

	private readonly _parentEditor: ICodeEditor;
	private readonly _overwriteOptions: IDiffEditorOptions;

	constructor(
		domElement: HTMLElement,
		options: Readonly<IDiffEditorConstructionOptions>,
		codeEditorWidgetOptions: IDiffCodeEditorWidgetOptions,
		parentEditor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IAccessibilitySignalService accessibilitySignalService: IAccessibilitySignalService,
		@IEditorProgressService editorProgressService: IEditorProgressService
	) {
		super(domElement, parentEditor.getRawOptions(), codeEditorWidgetOptions, contextKeyService, instantiationService, codeEditorService, accessibilitySignalService, editorProgressService);

		this._parentEditor = parentEditor;
		this._overwriteOptions = options;

		// Overwrite parent's options
		super.updateOptions(this._overwriteOptions);

		this._register(parentEditor.onDidChangeConfiguration(e => this._onParentConfigurationChanged(e)));
	}

	getParentEditor(): ICodeEditor {
		return this._parentEditor;
	}

	private _onParentConfigurationChanged(e: ConfigurationChangedEvent): void {
		super.updateOptions(this._parentEditor.getRawOptions());
		super.updateOptions(this._overwriteOptions);
	}

	override updateOptions(newOptions: IEditorOptions): void {
		objects.mixin(this._overwriteOptions, newOptions, true);
		super.updateOptions(this._overwriteOptions);
	}
}
