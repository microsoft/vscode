/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IAgentPluginRepositoryService } from '../../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { type IMarketplaceReference, MarketplaceReferenceKind, parseMarketplaceReference, parseMarketplaceReferences, readConfiguredMarketplaces } from '../../common/plugins/pluginMarketplaceService.js';
import { getStrictKnownMarketplaces, isMarketplaceReferenceAllowed } from '../../common/plugins/strictKnownMarketplaces.js';
import { InstalledAgentPluginsViewId } from '../chat.js';
import { getPluginCustomizationMarketplaceNavigationSourceId } from '../aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { CHAT_CATEGORY } from './chatActions.js';

export class ManagePluginsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.managePlugins';

	constructor() {
		super({
			id: ManagePluginsAction.ID,
			title: localize2('plugins', 'Plugins'),
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
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
		const fileDialogService = accessor.get(IFileDialogService);

		const store = new DisposableStore();
		const inputBox = store.add(quickInputService.createInputBox());
		const pickFolderButton: IQuickInputButton = {
			iconClass: ThemeIcon.asClassName(Codicon.folder),
			tooltip: localize('pickPluginFolder', "Pick Folder"),
		};
		inputBox.placeholder = localize('pluginSourcePlaceholder', "owner/repo, git URL, or local folder path");
		inputBox.prompt = localize('pluginSourcePrompt', "Enter a GitHub repository, git URL, or local folder path to install a plugin from");
		inputBox.buttons = [pickFolderButton];
		inputBox.ignoreFocusOut = true;
		inputBox.show();

		let installing = false;
		let installed = false;
		const submit = async () => {
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

				const result = await pluginInstallService.installPluginFromSource(source);
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
		};
		store.add(inputBox.onDidChangeValue(() => {
			inputBox.validationMessage = undefined;
		}));
		store.add(inputBox.onDidTriggerButton(async button => {
			if (button !== pickFolderButton || installing) {
				return;
			}

			const folder = (await fileDialogService.showOpenDialog({
				title: localize('pickPluginFolderTitle', "Select Plugin Folder"),
				openLabel: localize('selectPluginFolder', "Select Folder"),
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				availableFileSystems: [Schemas.file],
			}))?.[0];
			if (folder) {
				inputBox.value = folder.fsPath;
				await submit();
			}
		}));
		return new Promise<boolean>(resolve => {
			store.add(toDisposable(() => resolve(installed)));

			store.add(inputBox.onDidHide(() => {
				if (!installing) {
					store.dispose();
				}
			}));

			store.add(inputBox.onDidAccept(submit));
		});
	}
}

interface IMarketplaceQuickPickItem extends IQuickPickItem {
	readonly kind: 'add' | 'marketplace';
	readonly reference?: IMarketplaceReference;
	readonly managedByPolicy: boolean;
}

export const MANAGE_PLUGIN_MARKETPLACES_COMMAND_ID = 'workbench.action.chat.managePluginMarketplaces';

export class ManagePluginMarketplacesAction extends Action2 {
	static readonly ID = MANAGE_PLUGIN_MARKETPLACES_COMMAND_ID;

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
		const commandService = accessor.get(ICommandService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);

		while (true) {
			const { extraValues, effectiveValues } = readConfiguredMarketplaces(configurationService);
			const refs = parseMarketplaceReferences(effectiveValues);
			const policyCanonicalIds = new Set(parseMarketplaceReferences(extraValues).map(reference => reference.canonicalId));
			const defaultCanonicalIds = new Set(parseMarketplaceReferences(
				configurationService.inspect<readonly unknown[]>(ChatConfiguration.PluginMarketplaces)?.defaultValue ?? []
			).map(reference => reference.canonicalId));
			const items: QuickPickInput<IMarketplaceQuickPickItem>[] = [{
				id: 'addMarketplace',
				label: localize('addMarketplace', "{0} Add Marketplace...", '$(add)'),
				ariaLabel: localize('addMarketplaceAriaLabel', "Add Marketplace"),
				detail: localize('addMarketplaceDetail', "Add a GitHub repository, Git repository URL, or local repository URI"),
				alwaysShow: true,
				kind: 'add',
				managedByPolicy: false,
			}];
			if (refs.length > 0) {
				items.push({ type: 'separator', label: localize('configuredMarketplaces', "Configured Marketplaces") });
				items.push(...refs.map(reference => {
					const descriptions = [
						defaultCanonicalIds.has(reference.canonicalId) ? localize('defaultMarketplace', "Default") : undefined,
						policyCanonicalIds.has(reference.canonicalId) ? localize('managedMarketplace', "Managed by Enterprise Policy") : undefined,
					].filter((description): description is string => description !== undefined);
					return {
						id: reference.canonicalId,
						label: reference.displayLabel,
						description: descriptions.join(', ') || undefined,
						detail: reference.kind === MarketplaceReferenceKind.LocalFileUri
							? localize('localMarketplaceDetail', "Local repository: {0}", reference.displayLabel)
							: reference.cloneUrl,
						kind: 'marketplace' as const,
						reference,
						managedByPolicy: policyCanonicalIds.has(reference.canonicalId),
					};
				}));
			}

			const selected = await quickInputService.pick(items, {
				title: localize('managePluginMarketplacesQuickPick', "Manage Plugin Marketplaces"),
				placeHolder: refs.length === 0
					? localize('noMarketplaces', "No plugin marketplaces configured")
					: localize('selectMarketplace', "Select a plugin marketplace"),
				prompt: localize('marketplaceTrustPrompt', "Only add marketplaces you trust."),
				matchOnDescription: true,
				matchOnDetail: true,
			});
			if (!selected) {
				return;
			}
			if (selected.kind === 'add') {
				const added = await this.addMarketplace(quickInputService, configurationService, notificationService);
				if (!added) {
					return;
				}
				continue;
			}

			const ref = selected.reference;
			if (!ref) {
				return;
			}
			const actionItems: IQuickPickItem[] = [];
			actionItems.push({ id: 'showPlugins', label: localize('showPlugins', "Show Plugins") });
			const repoUri = pluginRepositoryService.getRepositoryUri(ref);
			if (await fileService.exists(repoUri)) {
				actionItems.push({ id: 'openDirectory', label: localize('openMarketplaceDirectory', "Open Folder") });
			}
			if (!selected.managedByPolicy) {
				actionItems.push({ id: 'removeMarketplace', label: localize('removeMarketplace', "Remove Marketplace") });
			}
			if (actionItems.length === 0) {
				return;
			}

			const action = await quickInputService.pick(actionItems, {
				title: localize('managePluginMarketplace', "Manage Plugin Marketplace"),
				placeHolder: localize('selectMarketplaceAction', "Select an action for '{0}'", ref.displayLabel),
			});
			if (!action) {
				return;
			}
			switch (action.id) {
				case 'showPlugins':
					await commandService.executeCommand(
						AICustomizationManagementCommands.OpenMarketplace,
						{
							section: AICustomizationManagementSection.Plugins,
							sourceId: getPluginCustomizationMarketplaceNavigationSourceId(configurationService, ref),
						},
					);
					return;
				case 'openDirectory':
					await commandService.executeCommand('revealFileInOS', repoUri);
					return;
				case 'removeMarketplace': {
					const { userValues } = readConfiguredMarketplaces(configurationService);
					const updated = userValues.filter(value => typeof value === 'string' && parseMarketplaceReference(value)?.canonicalId !== ref.canonicalId);
					await configurationService.updateValue(ChatConfiguration.PluginMarketplaces, updated);
					break;
				}
			}
		}
	}

	private async addMarketplace(
		quickInputService: IQuickInputService,
		configurationService: IConfigurationService,
		notificationService: INotificationService,
	): Promise<boolean> {
		const value = await quickInputService.input({
			title: localize('addPluginMarketplace', "Add Plugin Marketplace"),
			placeHolder: localize('pluginMarketplaceSourcePlaceholder', "owner/repo, Git URL, or local repository URI"),
			prompt: localize('marketplaceTrustPrompt', "Only add marketplaces you trust."),
			ignoreFocusLost: true,
			validateInput: async input => this.getMarketplaceInputError(input, configurationService),
		});
		if (value === undefined) {
			return false;
		}

		const validationError = this.getMarketplaceInputError(value, configurationService);
		if (validationError) {
			notificationService.notify({ severity: Severity.Warning, message: validationError });
			return false;
		}

		const reference = parseMarketplaceReference(value);
		if (!reference) {
			return false;
		}
		const { userValues } = readConfiguredMarketplaces(configurationService);
		const updated = [
			...userValues.filter((entry): entry is string => typeof entry === 'string'),
			reference.rawValue,
		];
		await configurationService.updateValue(ChatConfiguration.PluginMarketplaces, updated);
		return true;
	}

	private getMarketplaceInputError(value: string, configurationService: IConfigurationService): string | undefined {
		const reference = parseMarketplaceReference(value);
		if (!reference) {
			return localize('invalidMarketplaceSource', "Enter a GitHub repository, Git repository URL, or local repository URI.");
		}
		const configured = parseMarketplaceReferences(readConfiguredMarketplaces(configurationService).effectiveValues);
		if (configured.some(candidate => candidate.canonicalId === reference.canonicalId)) {
			return localize('marketplaceAlreadyConfigured', "This marketplace is already configured.");
		}
		const allowlist = getStrictKnownMarketplaces(configurationService.getValue(ChatConfiguration.StrictMarketplaces));
		if (!isMarketplaceReferenceAllowed(allowlist, reference)) {
			return localize('marketplaceNotAllowed', "This marketplace is not allowed by enterprise policy.");
		}
		return undefined;
	}
}

export function registerChatPluginActions() {
	registerAction2(ManagePluginsAction);
	registerAction2(InstallFromSourceAction);
	registerAction2(ManagePluginMarketplacesAction);
}
