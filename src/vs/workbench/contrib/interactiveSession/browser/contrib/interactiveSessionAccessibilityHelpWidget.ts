/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyCode } from 'vs/base/common/keyCodes';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IModelService } from 'vs/editor/common/services/model';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';

export class InteractiveAccessibilityHelpWidget extends CodeEditorWidget {
	constructor(
		domElement: HTMLElement,
		_options: Readonly<IEditorConstructionOptions>,
		codeEditorWidgetOptions: ICodeEditorWidgetOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@INotificationService notificationService: INotificationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IModelService private readonly _modelService: IModelService,
		@IInteractiveSessionWidgetService private readonly _widgetService: IInteractiveSessionWidgetService
	) {
		super(domElement, _options, codeEditorWidgetOptions, instantiationService, codeEditorService, commandService, contextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService);
		this._register(this.onKeyDown((e) => {
			switch (e.keyCode) {
				case KeyCode.Escape:
					// On escape, hide the accessible buffer and force focus onto the terminal
					this.hide();
					break;
				case KeyCode.Tab:
					// On tab or shift+tab, hide the accessible buffer and perform the default tab
					// behavior
					this.hide();
					break;
			}
		}));
		this.getDomNode()?.classList.add('interactive-session-accessibility-help-widget');
	}
	async getTextModel(): Promise<ITextModel> {
		const existing = this._modelService.getModel(URI.from({ scheme: 'interactiveSession', path: 'interactiveSession' }));
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(`testing\\n1\\2n\\3n
		\\4n\\
		5n\\nlfsjdkfjsdlkfjsldkj`, null, URI.from({ scheme: 'interactiveSession', path: 'interactiveSession' }), false);
	}
	async show(): Promise<void> {
		let model = this.getModel();
		if (model) {
			model.setValue(`testing\\n1\\2n\\3n
			\\4n\\
			5n\\nlfsjdkfjsdlkfjsldkj`);
		} else {
			model = await this.getTextModel();
		}
		this.setModel(model);
		this.getDomNode()?.classList.remove('hide');
		this.focus();
	}
	hide(): void {
		this.getDomNode()?.remove();
		this._modelData = null;
		this.dispose();
		this._widgetService.lastFocusedWidget?.focusInput();
	}
}
