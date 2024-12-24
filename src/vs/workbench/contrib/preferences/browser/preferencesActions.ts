/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { URI } from '../../../../base/common/uri.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import * as nls from '../../../../nls.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../platform/actions/common/actions.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { isLocalizedString } from '../../../../platform/action/common/action.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

export class ConfigureLanguageBasedSettingsAction extends Action {

	static readonly ID = 'workbench.action.configureLanguageBasedSettings';
	static readonly LABEL = nls.localize2('configureLanguageBasedSettings', "Configure Language Specific Settings...");

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
		const picks: IQuickPickItem[] = languages.map(({ languageName, languageId }): IQuickPickItem => {
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
			};
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
CommandsRegistry.registerCommand('_getAllCommands', function (accessor, filterByPrecondition?: boolean) {
	const keybindingService = accessor.get(IKeybindingService);
	const contextKeyService = accessor.get(IContextKeyService);
	const actions: { command: string; label: string; keybinding: string; description?: string; precondition?: string }[] = [];
	for (const editorAction of EditorExtensionsRegistry.getEditorActions()) {
		const keybinding = keybindingService.lookupKeybinding(editorAction.id);
		if (filterByPrecondition && !contextKeyService.contextMatchesRules(editorAction.precondition)) {
			continue;
		}
		actions.push({
			command: editorAction.id,
			label: editorAction.label,
			description: isLocalizedString(editorAction.metadata?.description) ? editorAction.metadata.description.value : editorAction.metadata?.description,
			precondition: editorAction.precondition?.serialize(),
			keybinding: keybinding?.getLabel() ?? 'Not set'
		});
	}
	for (const menuItem of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
		if (isIMenuItem(menuItem)) {
			if (filterByPrecondition && !contextKeyService.contextMatchesRules(menuItem.when)) {
				continue;
			}
			const title = typeof menuItem.command.title === 'string' ? menuItem.command.title : menuItem.command.title.value;
			const category = menuItem.command.category ? typeof menuItem.command.category === 'string' ? menuItem.command.category : menuItem.command.category.value : undefined;
			const label = category ? `${category}: ${title}` : title;
			const description = isLocalizedString(menuItem.command.metadata?.description) ? menuItem.command.metadata.description.value : menuItem.command.metadata?.description;
			const keybinding = keybindingService.lookupKeybinding(menuItem.command.id);
			actions.push({
				command: menuItem.command.id,
				label,
				description,
				precondition: menuItem.when?.serialize(),
				keybinding: keybinding?.getLabel() ?? 'Not set'
			});
		}
	}
	return actions;
});
//#endregion
