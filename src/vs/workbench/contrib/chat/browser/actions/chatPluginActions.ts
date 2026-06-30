/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IAgentPluginRepositoryService } from '../../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { type IMarketplaceReference, MarketplaceReferenceKind, parseMarketplaceReference, parseMarketplaceReferences, readConfiguredMarketplaces } from '../../common/plugins/pluginMarketplaceService.js';
import { InstalledAgentPluginsViewId } from '../chat.js';
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

interface IInstallFromSourceActionOptions {
	/** When `true`, do not reveal the installed plugin in the Extensions viewlet after install. */
	readonly skipReveal?: boolean;
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

	async run(accessor: ServicesAccessor, options?: IInstallFromSourceActionOptions): Promise<boolean> {
		const quickInputService = accessor.get(IQuickInputService);
		const pluginInstallService = accessor.get(IPluginInstallService);
		const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);

		const store = new DisposableStore();
		const inputBox = store.add(quickInputService.createInputBox());
		inputBox.placeholder = localize('pluginSourcePlaceholder', "owner/repo or git clone URL");
		inputBox.prompt = localize('pluginSourcePrompt', "Enter a GitHub repository or git URL to install a plugin from");
		inputBox.ignoreFocusOut = true;
		inputBox.show();

		store.add(inputBox.onDidChangeValue(() => {
			inputBox.validationMessage = undefined;
		}));

		return new Promise<boolean>(resolve => {
			let installing = false;
			let installed = false;
			store.add(toDisposable(() => resolve(installed)));

			store.add(inputBox.onDidHide(() => {
				if (!installing) {
					store.dispose();
				}
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
				installing = true;
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
						installed = true;
						if (!options?.skipReveal) {
							const ref = parseMarketplaceReference(source);
							if (ref) {
								extensionsWorkbenchService.openSearch(`@agentPlugins ${ref.displayLabel}`);
							}
						}
						store.dispose();
					}
				} catch (e) {
					// An unexpected failure (e.g. cancelled trust prompt) would otherwise
					// leave the hidden input box and awaited promise stuck. Re-show it with
					// the error so the user can retry or cancel.
					const detail = e instanceof Error ? e.message : String(e);
					inputBox.validationMessage = localize('installFromSourceFailed', "Failed to install plugin: {0}", detail);
					inputBox.show();
				} finally {
					installing = false;
					if (!store.isDisposed) {
						inputBox.busy = false;
						inputBox.enabled = true;
					}
				}
			}));
		});
	}
}

interface IMarketplaceQuickPickItem extends IQuickPickItem {
	readonly reference: IMarketplaceReference;
	readonly managedByPolicy: boolean;
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
		const notificationService = accessor.get(INotificationService);

		const { userValues, extraValues, effectiveValues } = readConfiguredMarketplaces(configurationService);
		const refs = parseMarketplaceReferences(effectiveValues);
		const policyCanonicalIds = new Set(parseMarketplaceReferences(extraValues).map(r => r.canonicalId));

		if (refs.length === 0) {
			quickInputService.pick([], { placeHolder: localize('noMarketplaces', "No plugin marketplaces configured") });
			return;
		}

		// Step 1: pick a marketplace
		const items: IMarketplaceQuickPickItem[] = refs.map(ref => ({
			label: ref.displayLabel,
			description: ref.kind === MarketplaceReferenceKind.LocalFileUri
				? localize('localMarketplace', "Local")
				: policyCanonicalIds.has(ref.canonicalId)
					? localize('managedMarketplace', "{0} (managed by enterprise policy)", ref.cloneUrl)
					: ref.cloneUrl,
			reference: ref,
			managedByPolicy: policyCanonicalIds.has(ref.canonicalId),
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
				if (selected.managedByPolicy) {
					notificationService.notify({
						severity: Severity.Warning,
						message: localize('removeManagedMarketplace', "Enterprise policy manages '{0}', so it can't be removed here.", ref.displayLabel),
					});
					return;
				}

				const updated = userValues.filter(v => typeof v === 'string' && v.trim() !== ref.rawValue);
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
