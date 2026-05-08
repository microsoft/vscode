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
import { VSBuffer } from '../../../../base/common/buffer.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../platform/actions/common/actions.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { isLocalizedString } from '../../../../platform/action/common/action.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { EnablementState, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { Event } from '../../../../base/common/event.js';
import { timeout } from '../../../../base/common/async.js';

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

/**
 * Schema information for a single configuration property as returned by
 * `_developer.getConfigurationInformation`. Self-contained so it can be
 * copied verbatim into other projects.
 */
export interface IConfigurationPropertyInformation {
	type?: string | string[];
	default?: unknown;
	description?: string;
	markdownDescription?: string;
	deprecationMessage?: string;
	markdownDeprecationMessage?: string;
	enum?: unknown[];
	enumDescriptions?: string[];
	markdownEnumDescriptions?: string[];
	enumItemLabels?: string[];
	/** 1=APPLICATION, 2=MACHINE, 3=WINDOW, 4=RESOURCE, 5=LANGUAGE_OVERRIDABLE, 6=APPLICATION_MACHINE, 7=MACHINE_OVERRIDABLE */
	scope?: number;
	restricted?: boolean;
	included?: boolean;
	tags?: string[];
	ignoreSync?: boolean;
	disallowSyncIgnore?: boolean;
	disallowConfigurationDefault?: boolean;
	keywords?: string[];
	editPresentation?: string;
	order?: number;
	policy?: {
		name: string;
		minimumVersion: string;
		description?: string;
		previewFeature?: string;
		defaultValue?: string | number;
	};
	experiment?: {
		mode: 'startup' | 'auto';
		name?: string;
	};
	agentsWindow?: {
		default?: unknown;
		readOnly?: boolean;
	};
	section?: {
		id?: string;
		title?: string;
		order?: number;
		extensionInfo?: {
			id: string;
			displayName?: string;
		};
	};
	defaultDefaultValue?: unknown;
	source?: string | {
		id: string;
		displayName?: string;
	};
	// Additional JSON Schema fields may be present (e.g. minimum, maximum, pattern, items, properties).
	[key: string]: unknown;
}

/**
 * The shape of the JSON returned by `_developer.getConfigurationInformation`:
 * a map from configuration key to its schema information.
 */
export interface IConfigurationInformation {
	[settingId: string]: IConfigurationPropertyInformation;
}

CommandsRegistry.registerCommand({
	id: '_developer.getConfigurationInformation',
	handler: async (accessor, path?: string | URI): Promise<string | URI> => {
		const configRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		const fileService = accessor.get(IFileService);
		const extensionService = accessor.get(IExtensionService);
		const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
		const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);

		// Ensure extension-contributed configuration has been registered before
		// reading the registry, otherwise extension settings may be missing.
		await extensionService.whenInstalledExtensionsRegistered();

		// Some built-in extensions (e.g. Copilot when chat setup is incomplete) may be
		// disabled and therefore not contribute their configuration. Enable any disabled
		// built-in extensions and wait for them to register so their settings are dumped too.
		const installed = await extensionManagementService.getInstalled();
		const toEnable = installed.filter(e => e.isBuiltin && extensionEnablementService.canChangeEnablement(e) && !extensionEnablementService.isEnabled(e));
		if (toEnable.length) {
			const registered = Event.toPromise(extensionService.onDidChangeExtensions);
			await extensionEnablementService.setEnablement(toEnable, EnablementState.EnabledGlobally);
			await Promise.race([registered, timeout(5000)]);
			await extensionService.whenInstalledExtensionsRegistered();
		}

		const configurationProperties = configRegistry.getConfigurationProperties();
		const configurationInformation: IConfigurationInformation = Object.fromEntries(Object.entries(configurationProperties).map(([key, property]) => {
			// A map is not JSON-serializable and is not needed for schema consumers.
			const { defaultValueSource, ...schema } = property;
			return [key, schema];
		}));

		const content = JSON.stringify(configurationInformation);

		if (!path) {
			return content;
		}

		const targetUri = URI.isUri(path)
			? path
			: /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(path)
				? URI.parse(path)
				: URI.file(path);

		await fileService.writeFile(targetUri, VSBuffer.fromString(content));
		return targetUri;
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
