/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from '../../../../base/common/objects';
import { ICodeEditor } from '../../editorBrowser';
import { ICodeEditorService } from '../../services/codeEditorService';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from './codeEditorWidget';
import { ConfigurationChangedEvent, IEditorOptions } from '../../../common/config/editorOptions';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility';
import { ICommandService } from '../../../../platform/commands/common/commands';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { INotificationService } from '../../../../platform/notification/common/notification';
import { IThemeService } from '../../../../platform/theme/common/themeService';

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
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService
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
