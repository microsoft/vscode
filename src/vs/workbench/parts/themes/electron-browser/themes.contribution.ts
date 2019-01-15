/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { firstIndex } from 'vs/base/common/arrays';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { IWorkbenchThemeService, COLOR_THEME_SETTING, ICON_THEME_SETTING, IColorTheme, IFileIconTheme } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { VIEWLET_ID, IExtensionsViewlet } from 'vs/workbench/parts/extensions/common/extensions';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Delayer } from 'vs/base/common/async';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IColorRegistry, Extensions as ColorRegistryExtensions } from 'vs/platform/theme/common/colorRegistry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Color } from 'vs/base/common/color';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { LIGHT, DARK, HIGH_CONTRAST } from 'vs/platform/theme/common/themeService';
import { schemaId } from 'vs/workbench/services/themes/common/colorThemeSchema';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';

export class SelectColorThemeAction extends Action {

	static readonly ID = 'workbench.action.selectTheme';
	static LABEL = localize('selectTheme.label', "Color Theme");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IViewletService private readonly viewletService: IViewletService,
		@IWorkspaceConfigurationService private readonly configurationService: IWorkspaceConfigurationService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.themeService.getColorThemes().then(themes => {
			const currentTheme = this.themeService.getColorTheme();

			const picks: QuickPickInput[] = [].concat(
				toEntries(themes.filter(t => t.type === LIGHT), localize('themes.category.light', "light themes")),
				toEntries(themes.filter(t => t.type === DARK), localize('themes.category.dark', "dark themes")),
				toEntries(themes.filter(t => t.type === HIGH_CONTRAST), localize('themes.category.hc', "high contrast themes")),
				configurationEntries(this.extensionGalleryService, localize('installColorThemes', "Install Additional Color Themes..."))
			);

			const selectTheme = (theme, applyTheme: boolean) => {
				if (typeof theme.id === 'undefined') { // 'pick in marketplace' entry
					if (applyTheme) {
						openExtensionViewlet(this.viewletService, 'category:themes ');
					}
					theme = currentTheme;
				}
				let target = null;
				if (applyTheme) {
					let confValue = this.configurationService.inspect(COLOR_THEME_SETTING);
					target = typeof confValue.workspace !== 'undefined' ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
				}

				this.themeService.setColorTheme(theme.id, target).then(undefined,
					err => {
						onUnexpectedError(err);
						this.themeService.setColorTheme(currentTheme.id, null);
					}
				);
			};

			const placeHolder = localize('themes.selectTheme', "Select Color Theme (Up/Down Keys to Preview)");
			const autoFocusIndex = firstIndex(picks, p => p.type !== 'separator' && p.id === currentTheme.id);
			const delayer = new Delayer<void>(100);
			const chooseTheme = theme => delayer.trigger(() => selectTheme(theme || currentTheme, true), 0);
			const tryTheme = theme => delayer.trigger(() => selectTheme(theme, false));

			return this.quickInputService.pick(picks, { placeHolder, activeItem: picks[autoFocusIndex], onDidFocus: tryTheme })
				.then(chooseTheme);
		});
	}
}

class SelectIconThemeAction extends Action {

	static readonly ID = 'workbench.action.selectIconTheme';
	static LABEL = localize('selectIconTheme.label', "File Icon Theme");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IViewletService private readonly viewletService: IViewletService,
		@IWorkspaceConfigurationService private readonly configurationService: IWorkspaceConfigurationService

	) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.themeService.getFileIconThemes().then(themes => {
			const currentTheme = this.themeService.getFileIconTheme();

			let picks: QuickPickInput[] = [{ id: '', label: localize('noIconThemeLabel', 'None'), description: localize('noIconThemeDesc', 'Disable file icons') }];
			picks = picks.concat(
				toEntries(themes),
				configurationEntries(this.extensionGalleryService, localize('installIconThemes', "Install Additional File Icon Themes..."))
			);

			const selectTheme = (theme, applyTheme: boolean) => {
				if (typeof theme.id === 'undefined') { // 'pick in marketplace' entry
					if (applyTheme) {
						openExtensionViewlet(this.viewletService, 'tag:icon-theme ');
					}
					theme = currentTheme;
				}
				let target = null;
				if (applyTheme) {
					let confValue = this.configurationService.inspect(ICON_THEME_SETTING);
					target = typeof confValue.workspace !== 'undefined' ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
				}
				this.themeService.setFileIconTheme(theme && theme.id, target).then(undefined,
					err => {
						onUnexpectedError(err);
						this.themeService.setFileIconTheme(currentTheme.id, null);
					}
				);
			};

			const placeHolder = localize('themes.selectIconTheme', "Select File Icon Theme");
			const autoFocusIndex = firstIndex(picks, p => p.type !== 'separator' && p.id === currentTheme.id);
			const delayer = new Delayer<void>(100);
			const chooseTheme = theme => delayer.trigger(() => selectTheme(theme || currentTheme, true), 0);
			const tryTheme = theme => delayer.trigger(() => selectTheme(theme, false));

			return this.quickInputService.pick(picks, { placeHolder, activeItem: picks[autoFocusIndex], onDidFocus: tryTheme })
				.then(chooseTheme);
		});
	}
}

function configurationEntries(extensionGalleryService: IExtensionGalleryService, label: string): QuickPickInput[] {
	if (extensionGalleryService.isEnabled()) {
		return [
			{
				type: 'separator'
			},
			{
				id: undefined,
				label: label,
				alwaysShow: true,
			}
		];
	}
	return [];
}

function openExtensionViewlet(viewletService: IViewletService, query: string) {
	return viewletService.openViewlet(VIEWLET_ID, true).then(viewlet => {
		(<IExtensionsViewlet>viewlet).search(query);
		viewlet.focus();
	});
}

function toEntries(themes: Array<IColorTheme | IFileIconTheme>, label?: string) {
	const toEntry = theme => <IQuickPickItem>{ id: theme.id, label: theme.label, description: theme.description };
	const sorter = (t1: IQuickPickItem, t2: IQuickPickItem) => t1.label.localeCompare(t2.label);
	let entries: QuickPickInput[] = themes.map(toEntry).sort(sorter);
	if (entries.length > 0 && label) {
		entries.unshift({ type: 'separator', label });
	}
	return entries;
}

class GenerateColorThemeAction extends Action {

	static readonly ID = 'workbench.action.generateColorTheme';
	static LABEL = localize('generateColorTheme.label', "Generate Color Theme From Current Settings");

	constructor(
		id: string,
		label: string,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(id, label);
	}

	run(): Promise<any> {
		let theme = this.themeService.getColorTheme();
		let colors = Registry.as<IColorRegistry>(ColorRegistryExtensions.ColorContribution).getColors();
		let colorIds = colors.map(c => c.id).sort();
		let resultingColors = {};
		let inherited: string[] = [];
		for (let colorId of colorIds) {
			const color = theme.getColor(colorId, false);
			if (color) {
				resultingColors[colorId] = Color.Format.CSS.formatHexA(color, true);
			} else {
				inherited.push(colorId);
			}
		}
		for (let id of inherited) {
			const color = theme.getColor(id);
			if (color) {
				resultingColors['__' + id] = Color.Format.CSS.formatHexA(color, true);
			}
		}
		let contents = JSON.stringify({
			'$schema': schemaId,
			type: theme.type,
			colors: resultingColors,
			tokenColors: theme.tokenColors.filter(t => !!t.scope)
		}, null, '\t');
		contents = contents.replace(/\"__/g, '//"');

		return this.editorService.openEditor({ contents, language: 'jsonc' });
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

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '4_themes',
	command: {
		id: SelectColorThemeAction.ID,
		title: localize({ key: 'miSelectColorTheme', comment: ['&& denotes a mnemonic'] }, "&&Color Theme")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '4_themes',
	command: {
		id: SelectIconThemeAction.ID,
		title: localize({ key: 'miSelectIconTheme', comment: ['&& denotes a mnemonic'] }, "File &&Icon Theme")
	},
	order: 2
});
