/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { QuickPickItem, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { once } from 'vs/base/common/functional';
import { IProductService } from 'vs/platform/product/common/productService';
import { Action2, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { retry } from 'vs/base/common/async';
import { Registry } from 'vs/platform/registry/common/platform';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';

const STATUSBAR_REMOTEINDICATOR_CONTRIBUTION = 'statusBar/remoteIndicator';

type RemoteStartActionClassification = {
	command: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The command being executed by the remote start entry.' };
	remoteExtensionId?: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The remote extension id being used.' };
	owner: 'bhavyau';
	comment: 'Help understand which remote extensions are most commonly used from the remote start entry';
};

type RemoteStartActionEvent = {
	command: string;
	remoteExtensionId?: string;
};

interface RemoteCommand {
	command: string;
	commandContext: string | undefined;
}

interface RemoteExtensionMetadata {
	id: string;
	friendlyName: string;
	remoteCommands: RemoteCommand[];
	installed: boolean;
	dependencies: string[];
	isPlatformCompatible: boolean;
}

export class RemoteStartEntry extends Disposable implements IWorkbenchContribution {

	private static readonly REMOTE_START_ENTRY_ACTIONS_COMMAND_ID = 'workbench.action.remote.showStartEntryActions';
	private readonly remoteExtensionMetadata: RemoteExtensionMetadata[];
	private _isInitialized: boolean = false;

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService) {

		super();
		const enable = this.extensionGalleryService.isEnabled() && (this.productService.remoteExtensionTips ?? false) && this.productService.quality !== 'stable';
		registerConfiguration(enable);
		const remoteExtensionTips = { ...this.productService.remoteExtensionTips, ...this.productService.virtualWorkspaceExtensionTips };
		this.remoteExtensionMetadata = Object.values(remoteExtensionTips).filter(value => value.showInStartEntry === true).map(value => {
			return { id: value.extensionId, installed: false, friendlyName: value.friendlyName, remoteCommands: [], isPlatformCompatible: false, dependencies: [] };
		});

		this.registerActions();
		this.registerListeners();
	}

	private registerActions(): void {
		const category = { value: nls.localize('remote.category', "Remote"), original: 'Remote' };

		// Show Remote Start Action
		const startEntry = this;
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteStartEntry.REMOTE_START_ENTRY_ACTIONS_COMMAND_ID,
					category,
					title: { value: nls.localize('remote.showStartEntryActions', "Show Remote Start Entry Actions"), original: 'Show Remote Start Entry Actions' },
					f1: false
				});
			}

			async run(): Promise<void> {
				await startEntry.showRemoteStartActions();
			}
		});
	}

	private registerListeners(): void {
		this._register(this.extensionManagementService.onDidInstallExtensions(async (result) => {
			for (const ext of result) {
				const index = this.remoteExtensionMetadata.findIndex(value => ExtensionIdentifier.equals(value.id, ext.identifier.id));
				if (index > -1) {
					this.remoteExtensionMetadata[index].installed = true;
					this.remoteExtensionMetadata[index].remoteCommands = await this.getRemoteCommands(ext.identifier.id);
				}
			}
		}));

		this._register(this.extensionManagementService.onDidUninstallExtension(async (result) => {
			const index = this.remoteExtensionMetadata.findIndex(value => ExtensionIdentifier.equals(value.id, result.identifier.id));
			if (index > -1) {
				this.remoteExtensionMetadata[index].installed = false;
			}
		}));

		this._register(this.extensionEnablementService.onEnablementChanged(async (result) => {
			for (const ext of result) {
				const index = this.remoteExtensionMetadata.findIndex(value => ExtensionIdentifier.equals(value.id, ext.identifier.id));
				if (index > -1) {
					// update remote commands for extension if we never fetched it when it was disabled.
					if (this.extensionEnablementService.isEnabled(ext) && this.remoteExtensionMetadata[index].remoteCommands.length === 0) {
						this.remoteExtensionMetadata[index].remoteCommands = await this.getRemoteCommands(ext.identifier.id);
					}
				}
			}
		}));
	}

	private async _init(): Promise<void> {
		if (this._isInitialized) {
			return;
		}

		for (let i = 0; i < this.remoteExtensionMetadata.length; i++) {
			const extensionId = this.remoteExtensionMetadata[i].id;

			// Update compatibility
			const galleryExtension = (await this.extensionGalleryService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
			if (!await this.extensionManagementService.canInstall(galleryExtension)) {
				this.remoteExtensionMetadata[i].isPlatformCompatible = false;
			}
			else {
				this.remoteExtensionMetadata[i].isPlatformCompatible = true;
				this.remoteExtensionMetadata[i].dependencies = galleryExtension.properties.extensionPack ?? [];
			}

			// Check if installed and enabled
			const installed = (await this.extensionManagementService.getInstalled()).find(value => ExtensionIdentifier.equals(value.identifier.id, extensionId));
			if (installed) {
				this.remoteExtensionMetadata[i].installed = true;
				if (this.extensionEnablementService.isEnabled(installed)) {
					// update commands if enabled
					this.remoteExtensionMetadata[i].remoteCommands = await this.getRemoteCommands(extensionId);
				}
			}
		}

		this._isInitialized = true;
	}

	private async getRemoteCommands(remoteExtensionId: string): Promise<RemoteCommand[]> {

		const extension = await retry(async () => {
			const ext = await this.extensionService.getExtension(remoteExtensionId);
			if (!ext) {
				throw Error('Failed to find installed remote extension');
			}
			return ext;
		}, 300, 10);

		const menus = extension?.contributes?.menus;
		if (!menus) {
			throw Error('Failed to find remoteIndicator menu');
		}

		const commands: RemoteCommand[] = [];
		for (const contextMenu in menus) {
			// The remote start entry pulls the first command from the statusBar/remoteIndicator menu contribution
			if (contextMenu === STATUSBAR_REMOTEINDICATOR_CONTRIBUTION) {
				for (const command of menus[contextMenu]) {
					commands.push({ command: command.command, commandContext: command.when });
				}
			}
		}

		return commands;
	}

	private async showRemoteStartActions() {
		await this._init();

		const computeItems = async () => {
			const installedItems: QuickPickItem[] = [];
			const notInstalledItems: QuickPickItem[] = [];
			for (const metadata of this.remoteExtensionMetadata) {
				if (metadata.installed && metadata.remoteCommands) {
					installedItems.push({ type: 'separator', label: metadata.friendlyName });
					for (const command of metadata.remoteCommands) {

						const expression = ContextKeyExpr.deserialize(command.commandContext);
						if (!this.contextKeyService.contextMatchesRules(expression)) {
							continue;
						}

						const commandAction = MenuRegistry.getCommand(command.command);
						const label = typeof commandAction?.title === 'string' ? commandAction.title : commandAction?.title?.value;
						if (label) {
							installedItems.push({
								type: 'item',
								label: label,
								id: command.command
							});
						}
					}
				}
				else if (!metadata.installed && metadata.isPlatformCompatible) {
					const label = nls.localize('remote.startActions.connectTo', 'Connect to {0}... ', metadata.friendlyName);
					notInstalledItems.push({ type: 'item', id: metadata.id, label: label });
				}
			}

			installedItems.push({
				type: 'separator', label: nls.localize('remote.startActions.install', 'Install')
			});
			return installedItems.concat(notInstalledItems);
		};

		const quickPick = this.quickInputService.createQuickPick();
		quickPick.placeholder = nls.localize('remote.startActions.quickPickPlaceholder', 'Select an option to connect to a Remote Window');
		quickPick.items = await computeItems();
		quickPick.sortByLabel = false;
		quickPick.canSelectMany = false;
		quickPick.ignoreFocusOut = false;
		once(quickPick.onDidAccept)(async () => {

			const selectedItems = quickPick.selectedItems;
			if (selectedItems.length === 1) {
				const selectedItem = selectedItems[0].id!;
				const remoteExtension = this.remoteExtensionMetadata.find(value => ExtensionIdentifier.equals(value.id, selectedItem));
				if (remoteExtension) {

					quickPick.items = [];
					quickPick.busy = true;

					quickPick.placeholder = nls.localize('remote.startActions.installingExtension', 'Installing extension... ');

					const galleryExtension = (await this.extensionGalleryService.getExtensions([{ id: selectedItem }], CancellationToken.None))[0];
					await this.extensionManagementService.installFromGallery(galleryExtension, {
						isMachineScoped: false,
						donotIncludePackAndDependencies: false,
						context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true }
					});

					this.telemetryService.publicLog2<RemoteStartActionEvent, RemoteStartActionClassification>('remoteStartList.ActionExecuted', { command: 'workbench.extensions.installExtension', remoteExtensionId: selectedItem });
					const commands = await this.getRemoteCommands(selectedItem);

					await this.extensionService.activateByEvent(`onCommand:${commands[0]}`);

					const command = commands[0].command;
					this.commandService.executeCommand(command);

					this.telemetryService.publicLog2<RemoteStartActionEvent, RemoteStartActionClassification>('remoteStartList.ActionExecuted', { command: command, remoteExtensionId: selectedItem });
				}
				else {
					this.commandService.executeCommand(selectedItem);
					this.telemetryService.publicLog2<RemoteStartActionEvent, RemoteStartActionClassification>('remoteStartList.ActionExecuted', { command: selectedItem });
				}
				quickPick.dispose();
			}
		});
		quickPick.onDidHide(() => quickPick.dispose());
		quickPick.show();
	}
}

function registerConfiguration(enabled: boolean): void {
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	configurationRegistry.registerConfiguration({
		...workbenchConfigurationNodeBase,
		properties: {
			'workbench.remote.experimental.showStartListEntry': {
				scope: ConfigurationScope.MACHINE,
				type: 'boolean',
				default: enabled,
				tags: ['experimental'],
				description: nls.localize('workbench.remote.showStartListEntry', "When enabled, a start list entry for getting started with remote experiences in shown on the welcome page.")
			}
		}
	});
}
