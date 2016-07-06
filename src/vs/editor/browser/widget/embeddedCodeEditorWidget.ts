/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as objects from 'vs/base/common/objects';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {ICodeEditorWidgetCreationOptions, IConfigurationChangedEvent, IEditorOptions} from 'vs/editor/common/editorCommon';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {CodeEditorWidget} from 'vs/editor/browser/widget/codeEditorWidget';

export class EmbeddedCodeEditorWidget extends CodeEditorWidget {

	private _parentEditor: ICodeEditor;
	private _overwriteOptions: ICodeEditorWidgetCreationOptions;

	constructor(
		domElement:HTMLElement,
		options:ICodeEditorWidgetCreationOptions,
		parentEditor:ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(domElement, parentEditor.getRawConfiguration(), instantiationService, codeEditorService, keybindingService, telemetryService);

		this._parentEditor = parentEditor;
		this._overwriteOptions = options;

		// Overwrite parent's options
		super.updateOptions(this._overwriteOptions);

		this._lifetimeDispose.push(parentEditor.onDidChangeConfiguration((e:IConfigurationChangedEvent) => this._onParentConfigurationChanged(e)));
	}

	public getParentEditor(): ICodeEditor {
		return this._parentEditor;
	}

	private _onParentConfigurationChanged(e:IConfigurationChangedEvent): void {
		super.updateOptions(this._parentEditor.getRawConfiguration());
		super.updateOptions(this._overwriteOptions);
	}

	public updateOptions(newOptions:IEditorOptions): void {
		objects.mixin(this._overwriteOptions, newOptions, true);
		super.updateOptions(this._overwriteOptions);
	}
}