/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputButton, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { parseMarketplaceReference, parseMarketplaceReferences, readConfiguredMarketplaces } from '../../common/plugins/pluginMarketplaceService.js';
import { InstalledAgentPluginsViewId } from '../chat.js';
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
		await accessor.get(ICommandService).executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Plugins);
	}
}

interface IInstallFromSourceActionOptions {
	/** When `true`, do not reveal the installed plugin in Chat Customizations after install. */
	readonly skipReveal?: boolean;
}

export class InstallFromSourceAction extends Action2 {
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
		const commandService = accessor.get(ICommandService);
		const fileDialogService = accessor.get(IFileDialogService);
		const customizationHarnessService = accessor.get(ICustomizationHarnessService);
		const notificationService = accessor.get(INotificationService);
		const progressService = accessor.get(IProgressService);

		const store = new DisposableStore();
		const inputBox = store.add(quickInputService.createInputBox());
		store.add(autorun(reader => {
			const sessionResource = customizationHarnessService.activeSessionResource.read(reader);
			const harness = customizationHarnessService.getDescriptorForSession(sessionResource);
			inputBox.title = harness
				? localize('installPluginFromSourceForHarness', "Install Plugin from Source ({0})", harness.label)
				: localize('installPluginFromSourceTitle', "Install Plugin from Source");
		}));
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

			const sessionResource = customizationHarnessService.activeSessionResource.get();
			const pluginInstallProvider = customizationHarnessService.getDescriptorForSession(sessionResource)?.pluginInstallProvider;

			// Quick format validation keeps the input box open for correction.
			const validationError = pluginInstallProvider ? undefined : pluginInstallService.validatePluginSource(source);
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

				let success: boolean;
				let installedUri: URI | undefined;
				if (pluginInstallProvider) {
					await progressService.withProgress({
						location: ProgressLocation.Notification,
						title: localize('installingPluginFromSource', "Installing plugin from source..."),
						cancellable: false,
					}, () => pluginInstallProvider.installFromSource(sessionResource, source));
					success = true;
				} else {
					const result = await pluginInstallService.installPluginFromSource(source);
					success = result.success;
					installedUri = result.installedUri;
					if (!success && result.message) {
						notificationService.error(result.message);
					}
				}
				if (!success) {
					inputBox.show();
				} else {
					installed = true;
					try {
						if (!options?.skipReveal) {
							await commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
								section: AICustomizationManagementSection.Plugins,
								sessionResource,
								revealUri: installedUri,
							});
						}
					} catch (error) {
						notificationService.error(error instanceof Error ? error : String(error));
					} finally {
						store.dispose();
					}
				}
			} catch (e) {
				const detail = e instanceof Error ? e.message : String(e);
				notificationService.error(localize('installFromSourceFailed', "Failed to install plugin: {0}", detail));
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

export const MANAGE_PLUGIN_MARKETPLACES_COMMAND_ID = 'workbench.action.chat.managePluginMarketplaces';

export class AddPluginMarketplaceAction extends Action2 {
	static readonly ID = 'workbench.action.chat.addPluginMarketplace';

	constructor() {
		super({
			id: AddPluginMarketplaceAction.ID,
			title: localize2('addPluginMarketplace', "Add Plugin Marketplace"),
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const harnessService = accessor.get(ICustomizationHarnessService);
		const sessionResource = harnessService.activeSessionResource.get();
		const provider = harnessService.getDescriptorForSession(sessionResource)?.marketplaceManagementProvider;
		const configuredSources = provider
			? (await provider.list(sessionResource)).map(marketplace => marketplace.source)
			: parseMarketplaceReferences(readConfiguredMarketplaces(configurationService).effectiveValues).map(reference => reference.rawValue);
		const added = await promptMarketplaceSource(quickInputService, configuredSources, async source => {
			if (provider) {
				await provider.add(sessionResource, source);
			} else {
				await configurationService.updateValue(ChatConfiguration.PluginMarketplaces, [...readConfiguredMarketplaces(configurationService).userValues, source]);
			}
		});
		if (added) {
			await commandService.executeCommand(ManagePluginMarketplacesAction.ID);
		}
	}
}

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
		await accessor.get(ICommandService).executeCommand(AICustomizationManagementCommands.OpenEditor, {
			section: AICustomizationManagementSection.Plugins,
			sessionResource: accessor.get(ICustomizationHarnessService).activeSessionResource.get(),
			showPluginMarketplaces: true,
		});
	}
}

/**
 * Prompts for a marketplace source, validating it inline and keeping the input open
 * until `addMarketplace` succeeds. Resolves `true` once a marketplace was added.
 */
function promptMarketplaceSource(quickInputService: IQuickInputService, configuredSources: readonly string[], addMarketplace: (source: string) => Promise<void>): Promise<boolean> {
	const configuredIds = new Set(configuredSources.map(source => parseMarketplaceReference(source)?.canonicalId));
	const getError = (value: string) => {
		const reference = parseMarketplaceReference(value);
		if (!reference) {
			return localize('invalidMarketplaceSource', "Enter a valid GitHub repository, Git repository URL, or local repository URI.");
		}
		return configuredIds.has(reference.canonicalId) ? localize('marketplaceAlreadyConfigured', "This marketplace is already configured.") : undefined;
	};

	const store = new DisposableStore();
	const inputBox = store.add(quickInputService.createInputBox());
	inputBox.title = localize('addPluginMarketplace', "Add Plugin Marketplace");
	inputBox.placeholder = localize('pluginMarketplaceSourcePlaceholder', "owner/repo, Git URL, or local repository URI");
	inputBox.prompt = localize('marketplaceTrustPrompt', "Only add marketplaces you trust.");
	inputBox.ignoreFocusOut = true;

	return new Promise(resolve => {
		let added = false;
		const updateValidation = (value: string) => {
			const error = getError(value.trim());
			inputBox.severity = error ? Severity.Error : Severity.Ignore;
			inputBox.validationMessage = error;
			return error;
		};
		store.add(inputBox.onDidAccept(async () => {
			if (inputBox.busy || updateValidation(inputBox.value)) {
				return;
			}
			inputBox.busy = true;
			inputBox.enabled = false;
			try {
				await addMarketplace(inputBox.value.trim());
				if (!store.isDisposed) {
					added = true;
					inputBox.hide();
				}
			} catch (error) {
				if (!store.isDisposed) {
					inputBox.severity = Severity.Error;
					inputBox.validationMessage = localize('addMarketplaceFailed', "Failed to add marketplace: {0}", getErrorMessage(error));
				}
			} finally {
				if (!store.isDisposed) {
					inputBox.busy = false;
					inputBox.enabled = true;
				}
			}
		}));
		store.add(inputBox.onDidChangeValue(updateValidation));
		store.add(inputBox.onDidHide(() => {
			resolve(added);
			store.dispose();
		}));
		inputBox.show();
	});
}

export function registerChatPluginActions() {
	registerAction2(ManagePluginsAction);
	registerAction2(InstallFromSourceAction);
	registerAction2(AddPluginMarketplaceAction);
	registerAction2(ManagePluginMarketplacesAction);
}
