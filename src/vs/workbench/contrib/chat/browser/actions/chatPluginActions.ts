/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IAgentPluginRepositoryService } from '../../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { type IMarketplaceReference, MarketplaceReferenceKind, parseMarketplaceReference, parseMarketplaceReferences } from '../../common/plugins/pluginMarketplaceService.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { InstalledAgentPluginsViewId } from '../agentPluginsView.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from './chatActions.js';

export class ManagePluginsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.managePlugins';

	constructor() {
		super({
			id: ManagePluginsAction.ID,
			title: localize2('plugins', 'Plugins'),
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: CHAT_CONFIG_MENU_ID,
				group: '2_plugins',
			}],
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IExtensionsWorkbenchService).openSearch('@agentPlugins ');
	}
}

class InstallFromSourceAction extends Action2 {
	static readonly ID = 'workbench.action.chat.installPluginFromSource';

	constructor() {
		super({
			id: InstallFromSourceAction.ID,
			title: localize2('installPluginFromSource', 'Install Plugin from Source'),
			category: CHAT_CATEGORY,
			icon: Codicon.add,
			precondition: ChatContextKeys.enabled,
			f1: true,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', InstalledAgentPluginsViewId),
					ChatContextKeys.Setup.hidden.negate(),
					ChatContextKeys.Setup.disabledInWorkspace.negate(),
				),
				group: 'navigation',
				order: 1,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const pluginInstallService = accessor.get(IPluginInstallService);

		const store = new DisposableStore();
		const inputBox = store.add(quickInputService.createInputBox());
		inputBox.placeholder = localize('pluginSourcePlaceholder', "owner/repo or git clone URL");
		inputBox.prompt = localize('pluginSourcePrompt', "Enter a GitHub repository or git URL to install a plugin from");
		inputBox.show();

		store.add(inputBox.onDidChangeValue(() => {
			inputBox.validationMessage = undefined;
		}));

		store.add(inputBox.onDidHide(() => {
			store.dispose();
		}));

		store.add(inputBox.onDidAccept(async () => {
			const source = inputBox.value.trim();
			if (!source) {
				return;
			}

			// Quick format validation keeps the input box open for correction.
			const validationError = pluginInstallService.validatePluginSource(source);
			if (validationError) {
				inputBox.validationMessage = validationError;
				return;
			}

			// Show busy state and prevent concurrent installs.
			inputBox.busy = true;
			inputBox.enabled = false;
			try {
				// Hide the input box so it doesn't conflict with trust/progress dialogs.
				inputBox.hide();

				const result = await pluginInstallService.installPluginFromValidatedSource(source);
				if (!result.success) {
					if (result.message) {
						// Re-open with the error so the user can correct their input.
						inputBox.validationMessage = result.message;
					}
					inputBox.show();
				} else {
					const ref = parseMarketplaceReference(source);
					if (ref) {
						accessor.get(IExtensionsWorkbenchService).openSearch(`@agentPlugins ${ref.displayLabel}`);
					}
				}
			} finally {
				inputBox.busy = false;
				inputBox.enabled = true;
			}
		}));
	}
}

interface IMarketplaceQuickPickItem extends IQuickPickItem {
	readonly reference: IMarketplaceReference;
}

class ManagePluginMarketplacesAction extends Action2 {
	static readonly ID = 'workbench.action.chat.managePluginMarketplaces';

	constructor() {
		super({
			id: ManagePluginMarketplacesAction.ID,
			title: localize2('managePluginMarketplaces', 'Manage Plugin Marketplaces'),
			icon: Codicon.globe,
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
			f1: true,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', InstalledAgentPluginsViewId),
					ChatContextKeys.Setup.hidden.negate(),
					ChatContextKeys.Setup.disabledInWorkspace.negate(),
				),
				group: 'navigation',
				order: 2,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const pluginRepositoryService = accessor.get(IAgentPluginRepositoryService);
		const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		const commandService = accessor.get(ICommandService);
		const fileService = accessor.get(IFileService);

		const configuredRefs = configurationService.getValue<unknown[]>(ChatConfiguration.PluginMarketplaces) ?? [];
		const refs = parseMarketplaceReferences(configuredRefs);

		if (refs.length === 0) {
			quickInputService.pick([], { placeHolder: localize('noMarketplaces', "No plugin marketplaces configured") });
			return;
		}

		// Step 1: pick a marketplace
		const items: IMarketplaceQuickPickItem[] = refs.map(ref => ({
			label: ref.displayLabel,
			description: ref.kind === MarketplaceReferenceKind.LocalFileUri
				? localize('localMarketplace', "Local")
				: ref.cloneUrl,
			reference: ref,
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('selectMarketplace', "Select a plugin marketplace"),
		});

		if (!selected) {
			return;
		}

		const ref = selected.reference;

		// Step 2: pick an action for the selected marketplace
		const actionItems: IQuickPickItem[] = [
			{ id: 'showPlugins', label: localize('showPlugins', "Show Plugins") },
		];

		// "Open Folder" only for cloned/local repos
		const repoUri = pluginRepositoryService.getRepositoryUri(ref);
		const repoExists = await fileService.exists(repoUri);
		if (repoExists) {
			actionItems.push({ id: 'openDirectory', label: localize('openMarketplaceDirectory', "Open Folder") });
		}

		actionItems.push({ id: 'removeMarketplace', label: localize('removeMarketplace', "Remove Marketplace") });

		const action = await quickInputService.pick(actionItems, {
			placeHolder: localize('selectMarketplaceAction', "Select an action for '{0}'", ref.displayLabel),
		});

		if (!action) {
			return;
		}

		switch (action.id) {
			case 'showPlugins':
				extensionsWorkbenchService.openSearch(`@agentPlugins ${ref.displayLabel}`);
				break;
			case 'openDirectory':
				await commandService.executeCommand('revealFileInOS', repoUri);
				break;
			case 'removeMarketplace': {
				const currentValues = configurationService.getValue<unknown[]>(ChatConfiguration.PluginMarketplaces) ?? [];
				const updated = currentValues.filter(v => typeof v === 'string' && v.trim() !== ref.rawValue);
				await configurationService.updateValue(ChatConfiguration.PluginMarketplaces, updated);
				break;
			}
		}
	}
}

export function registerChatPluginActions() {
	registerAction2(ManagePluginsAction);
	registerAction2(InstallFromSourceAction);
	registerAction2(ManagePluginMarketplacesAction);
}
