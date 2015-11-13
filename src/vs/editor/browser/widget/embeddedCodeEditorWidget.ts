/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import CodeEditorWidget = require('vs/editor/browser/widget/codeEditorWidget');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Objects = require('vs/base/common/objects');
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';

export class EmbeddedCodeEditorWidget extends CodeEditorWidget.CodeEditorWidget {

	private _parentEditor: EditorBrowser.ICodeEditor;
	private _overwriteOptions: EditorCommon.ICodeEditorWidgetCreationOptions;

	constructor(
		domElement:HTMLElement,
		options:EditorCommon.ICodeEditorWidgetCreationOptions,
		parentEditor:EditorBrowser.ICodeEditor,
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

		this._lifetimeListeners.push(parentEditor.addListener(EditorCommon.EventType.ConfigurationChanged, (e:EditorCommon.IConfigurationChangedEvent) => this._onParentConfigurationChanged(e)));
	}

	private _onParentConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): void {
		super.updateOptions(this._parentEditor.getRawConfiguration());
		super.updateOptions(this._overwriteOptions);
	}

	public updateOptions(newOptions:EditorCommon.IEditorOptions): void {
		Objects.mixin(this._overwriteOptions, newOptions, true);
		super.updateOptions(this._overwriteOptions);
	}
}