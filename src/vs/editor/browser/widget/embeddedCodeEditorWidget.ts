/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import { ICodeEditor, IDiffEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffEditorWidget, IDiffCodeEditorWidgetOptions } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { ConfigurationChangedEvent, IDiffEditorOptions, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class EmbeddedCodeEditorWidget extends CodeEditorWidget {

	private readonly _parentEditor: ICodeEditor;
	private readonly _overwriteOptions: IEditorOptions;

	constructor(
		domElement: HTMLElement,
		options: IEditorOptions,
		codeEditorWidgetOptions: ICodeEditorWidgetOptions,
		parentEditor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@INotificationService notificationService: INotificationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super(domElement, { ...parentEditor.getRawOptions(), overflowWidgetsDomNode: parentEditor.getOverflowWidgetsDomNode() }, codeEditorWidgetOptions, instantiationService, codeEditorService, commandService, contextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService);

		this._parentEditor = parentEditor;
		this._overwriteOptions = options;

		// Overwrite parent's options
		super.updateOptions(this._overwriteOptions);

		this._register(parentEditor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => this._onParentConfigurationChanged(e)));
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
		@IAudioCueService audioCueService: IAudioCueService,
		@IEditorProgressService editorProgressService: IEditorProgressService,
	) {
		super(domElement, parentEditor.getRawOptions(), codeEditorWidgetOptions, contextKeyService, instantiationService, codeEditorService, audioCueService, editorProgressService);

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
