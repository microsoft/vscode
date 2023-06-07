/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { URI } from 'vs/base/common/uri';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import * as nls from 'vs/nls';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { MenuId, MenuRegistry, isIMenuItem } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class ConfigureLanguageBasedSettingsAction extends Action {

	static readonly ID = 'workbench.action.configureLanguageBasedSettings';
	static readonly LABEL = { value: nls.localize('configureLanguageBasedSettings', "Configure Language Specific Settings..."), original: 'Configure Language Specific Settings...' };

	constructor(
		id: string,
		label: string,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const languages = this.languageService.getSortedRegisteredLanguageNames();
		const picks: IQuickPickItem[] = languages.map(({ languageName, languageId }) => {
			const description: string = nls.localize('languageDescriptionConfigured', "({0})", languageId);
			// construct a fake resource to be able to show nice icons if any
			let fakeResource: URI | undefined;
			const extensions = this.languageService.getExtensions(languageId);
			if (extensions.length) {
				fakeResource = URI.file(extensions[0]);
			} else {
				const filenames = this.languageService.getFilenames(languageId);
				if (filenames.length) {
					fakeResource = URI.file(filenames[0]);
				}
			}
			return {
				label: languageName,
				iconClasses: getIconClasses(this.modelService, this.languageService, fakeResource),
				description
			} as IQuickPickItem;
		});

		await this.quickInputService.pick(picks, { placeHolder: nls.localize('pickLanguage', "Select Language") })
			.then(pick => {
				if (pick) {
					const languageId = this.languageService.getLanguageIdByLanguageName(pick.label);
					if (typeof languageId === 'string') {
						return this.preferencesService.openLanguageSpecificSettings(languageId);
					}
				}
				return undefined;
			});

	}
}

// Register a command that gets all settings
CommandsRegistry.registerCommand({
	id: '_getAllSettings',
	handler: () => {
		const configRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		const allSettings = configRegistry.getConfigurationProperties();
		return allSettings;
	}
});

//#region --- Register a command to get all actions from the command palette
CommandsRegistry.registerCommand('_getAllCommands', function (accessor) {
	const keybindingService = accessor.get(IKeybindingService);
	const actions: { command: string; label: string; precondition?: string; keybinding: string }[] = [];
	for (const editorAction of EditorExtensionsRegistry.getEditorActions()) {
		const keybinding = keybindingService.lookupKeybinding(editorAction.id);
		actions.push({ command: editorAction.id, label: editorAction.label, precondition: editorAction.precondition?.serialize(), keybinding: keybinding?.getLabel() ?? 'Not set' });
	}
	for (const menuItem of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
		if (isIMenuItem(menuItem)) {
			const title = typeof menuItem.command.title === 'string' ? menuItem.command.title : menuItem.command.title.value;
			const category = menuItem.command.category ? typeof menuItem.command.category === 'string' ? menuItem.command.category : menuItem.command.category.value : undefined;
			const label = category ? `${category}: ${title}` : title;
			const keybinding = keybindingService.lookupKeybinding(menuItem.command.id);
			actions.push({ command: menuItem.command.id, label, precondition: menuItem.when?.serialize(), keybinding: keybinding?.getLabel() ?? 'Not set' });
		}
	}
	return actions;
});
//#endregion

