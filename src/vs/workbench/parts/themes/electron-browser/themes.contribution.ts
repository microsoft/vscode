/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { firstIndex } from 'vs/base/common/arrays';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { IWorkbenchThemeService, COLOR_THEME_SETTING, ICON_THEME_SETTING } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { VIEWLET_ID, IExtensionsViewlet } from 'vs/workbench/parts/extensions/common/extensions';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Delayer } from 'vs/base/common/async';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IColorRegistry, Extensions as ColorRegistryExtensions } from 'vs/platform/theme/common/colorRegistry';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Color } from 'vs/base/common/color';

export class SelectColorThemeAction extends Action {

	static ID = 'workbench.action.selectTheme';
	static LABEL = localize('selectTheme.label', "Color Theme");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService,
		@IViewletService private viewletService: IViewletService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.themeService.getColorThemes().then(themes => {
			const currentTheme = this.themeService.getColorTheme();

			const pickInMarketPlace = findInMarketplacePick(this.viewletService, 'category:themes', localize('installColorThemes', "Install Additional Color Themes..."));

			const picks: IPickOpenEntry[] = themes
				.map(theme => ({ id: theme.id, label: theme.label, description: theme.description }))
				.sort((t1, t2) => t1.label.localeCompare(t2.label));

			const selectTheme = (theme, applyTheme) => {
				if (theme === pickInMarketPlace) {
					theme = currentTheme;
				}
				let target = null;
				if (applyTheme) {
					let confValue = this.configurationService.lookup(COLOR_THEME_SETTING);
					target = typeof confValue.workspace !== 'undefined' ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
				}

				this.themeService.setColorTheme(theme.id, target).done(null,
					err => {
						this.themeService.setColorTheme(currentTheme.id, null);
					}
				);
			};

			const placeHolder = localize('themes.selectTheme', "Select Color Theme (Up/Down Keys to Preview)");
			const autoFocusIndex = firstIndex(picks, p => p.id === currentTheme.id);
			const delayer = new Delayer<void>(100);

			if (this.extensionGalleryService.isEnabled()) {
				picks.push(pickInMarketPlace);
			}

			return this.quickOpenService.pick(picks, { placeHolder, autoFocus: { autoFocusIndex } })
				.then(
				theme => delayer.trigger(() => selectTheme(theme || currentTheme, true), 0),
				null,
				theme => delayer.trigger(() => selectTheme(theme, false))
				);
		});
	}
}

class SelectIconThemeAction extends Action {

	static ID = 'workbench.action.selectIconTheme';
	static LABEL = localize('selectIconTheme.label', "File Icon Theme");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService,
		@IViewletService private viewletService: IViewletService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService

	) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.themeService.getFileIconThemes().then(themes => {
			const currentTheme = this.themeService.getFileIconTheme();

			const pickInMarketPlace = findInMarketplacePick(this.viewletService, 'tag:icon-theme', localize('installIconThemes', "Install Additional File Icon Themes..."));

			const picks: IPickOpenEntry[] = themes
				.map(theme => ({ id: theme.id, label: theme.label, description: theme.description }))
				.sort((t1, t2) => t1.label.localeCompare(t2.label));

			picks.splice(0, 0, { id: '', label: localize('noIconThemeLabel', 'None'), description: localize('noIconThemeDesc', 'Disable file icons') });

			const selectTheme = (theme, applyTheme) => {
				if (theme === pickInMarketPlace) {
					theme = currentTheme;
				}
				let target = null;
				if (applyTheme) {
					let confValue = this.configurationService.lookup(ICON_THEME_SETTING);
					target = typeof confValue.workspace !== 'undefined' ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
				}
				this.themeService.setFileIconTheme(theme && theme.id, target).done(null,
					err => {
						this.messageService.show(Severity.Info, localize('problemChangingIconTheme', "Problem setting icon theme: {0}", err.message));
						this.themeService.setFileIconTheme(currentTheme.id, null);
					}
				);
			};

			const placeHolder = localize('themes.selectIconTheme', "Select File Icon Theme");
			const autoFocusIndex = firstIndex(picks, p => p.id === currentTheme.id);
			const delayer = new Delayer<void>(100);


			if (this.extensionGalleryService.isEnabled()) {
				picks.push(pickInMarketPlace);
			}

			return this.quickOpenService.pick(picks, { placeHolder, autoFocus: { autoFocusIndex } })
				.then(
				theme => delayer.trigger(() => selectTheme(theme || currentTheme, true), 0),
				null,
				theme => delayer.trigger(() => selectTheme(theme, false))
				);
		});
	}
}

function findInMarketplacePick(viewletService: IViewletService, query: string, label: string) {
	return {
		id: 'themes.findmore',
		label: label,
		separator: { border: true },
		alwaysShow: true,
		run: () => viewletService.openViewlet(VIEWLET_ID, true).then(viewlet => {
			(<IExtensionsViewlet>viewlet).search(query);
			viewlet.focus();
		})
	};
}

class GenerateColorThemeAction extends Action {

	static ID = 'workbench.action.generateColorTheme';
	static LABEL = localize('generateColorTheme.label', "Generate Color Theme From Current Settings");

	constructor(
		id: string,
		label: string,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		let theme = this.themeService.getColorTheme();
		let colorRegistry = <IColorRegistry>Registry.as(ColorRegistryExtensions.ColorContribution);
		let resultingColors = {};
		colorRegistry.getColors().map(c => {
			let color = theme.getColor(c.id, false);
			if (color) {
				resultingColors[c.id] = Color.Format.CSS.formatHexA(color, true);
			}
		});
		let contents = JSON.stringify({
			type: theme.type,
			colors: resultingColors,
			tokenColors: theme.tokenColors
		}, null, '\t');
		return this.editorService.openEditor({ contents, language: 'json' });
	}
}

const category = localize('preferences', "Preferences");

const colorThemeDescriptor = new SyncActionDescriptor(SelectColorThemeAction, SelectColorThemeAction.ID, SelectColorThemeAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_T) });
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(colorThemeDescriptor, 'Preferences: Color Theme', category);

const iconThemeDescriptor = new SyncActionDescriptor(SelectIconThemeAction, SelectIconThemeAction.ID, SelectIconThemeAction.LABEL);
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(iconThemeDescriptor, 'Preferences: File Icon Theme', category);


const developerCategory = localize('developer', "Developer");

const generateColorThemeDescriptor = new SyncActionDescriptor(GenerateColorThemeAction, GenerateColorThemeAction.ID, GenerateColorThemeAction.LABEL);
Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(generateColorThemeDescriptor, 'Developer: Generate Color Theme From Current Settings', developerCategory);
