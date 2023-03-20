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

interface RemoteExtensionMetadata {
	id: string;
	friendlyName: string;
	remoteCommands: string[];
	installed: boolean;
	dependenciesStr?: string;
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
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService) {

		super();
		registerConfiguration(this.productService.quality !== 'stable');
		const remoteExtensionTips = { ...this.productService.remoteExtensionTips, ...this.productService.virtualWorkspaceExtensionTips };
		this.remoteExtensionMetadata = Object.values(remoteExtensionTips).filter(value => value.showInStartEntry === true).map(value => {
			return { id: value.extensionId, installed: false, friendlyName: value.friendlyName, remoteCommands: [] };
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
				await this.updateInstallStatus(ext.identifier.id, true);
			}
		}));

		this._register(this.extensionManagementService.onDidUninstallExtension(async (result) => {
			await this.updateInstallStatus(result.identifier.id, false);
		}));
	}


	private async _init(): Promise<void> {
		if (this._isInitialized) {
			return;
		}

		for (let i = 0; i < this.remoteExtensionMetadata.length; i++) {
			const installed = this.extensionService.extensions.some((e) => e.id?.toLowerCase() === this.remoteExtensionMetadata[i].id);
			if (installed) {
				await this.updateInstallStatus(this.remoteExtensionMetadata[i].id, true);
			}
			else {
				await this.updateInstallStatus(this.remoteExtensionMetadata[i].id, false);
			}
		}
		this._isInitialized = true;
	}

	private async updateInstallStatus(extensionId: string, installed: boolean): Promise<RemoteExtensionMetadata | undefined> {
		const index = this.remoteExtensionMetadata.findIndex(value => value.id === extensionId);
		if (index > -1) {
			if (installed && !this.remoteExtensionMetadata[index].installed) {
				const commands = await this.getRemoteCommands(extensionId);
				if (commands) {
					this.remoteExtensionMetadata[index].remoteCommands = commands;
				}
				this.remoteExtensionMetadata[index].installed = true;
			} else if (!installed && this.remoteExtensionMetadata[index].installed) {
				if (this.remoteExtensionMetadata[index].dependenciesStr === undefined) {
					const dependenciesStr = await this.getDependenciesStr(this.remoteExtensionMetadata[index].id);
					this.remoteExtensionMetadata[index].dependenciesStr = dependenciesStr;
				}
				this.remoteExtensionMetadata[index].installed = false;
			}
			return this.remoteExtensionMetadata[index];
		}
		return undefined;
	}

	private async getRemoteCommands(remoteExtensionId: string): Promise<string[] | undefined> {

		const extension = await retry(async () => {
			const ext = await this.extensionService.getExtension(remoteExtensionId);
			if (!ext) {
				throw Error('Failed to find installed remote extension');
			}
			return ext;
		}, 300, 10);

		const menus = extension?.contributes?.menus;
		if (menus) {
			const commands: string[] = [];
			for (const contextMenu in menus) {
				// The remote start entry pulls the first command from the statusBar/remoteIndicator menu contribution
				if (contextMenu === STATUSBAR_REMOTEINDICATOR_CONTRIBUTION) {
					for (const command of menus[contextMenu]) {
						const expression = ContextKeyExpr.deserialize(command.when);
						if (this.contextKeyService.contextMatchesRules(expression)) {
							commands.push(command.command);
						}
					}
				}
			}
			return commands;
		}
		return undefined;
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
						const commandAction = MenuRegistry.getCommand(command);
						const label = typeof commandAction?.title === 'string' ? commandAction.title : commandAction?.title?.value;
						if (label) {
							installedItems.push({
								type: 'item',
								label: label,
								id: command
							});
						}
					}
				}
				else if (!metadata.installed) {
					const label = nls.localize('remote.startActions.connectTo', 'Connect to {0}... ', metadata.friendlyName);
					const tooltip = metadata.dependenciesStr ? nls.localize('remote.startActions.tooltip', 'Also installs dependencies - {0} ', metadata.dependenciesStr) : '';
					notInstalledItems.push({ type: 'item', id: metadata.id, label: label, tooltip: tooltip });
				}
			}

			installedItems.push({
				type: 'separator', label: nls.localize('remote.startActions.downloadAndInstall', 'Download and Install')
			});
			return installedItems.concat(notInstalledItems);
		};

		const quickPick = this.quickInputService.createQuickPick();
		quickPick.placeholder = nls.localize('remote.startActions.quickPickPlaceholder', 'Select an option to connect to a Remote Window');
		quickPick.items = await computeItems();
		quickPick.sortByLabel = false;
		quickPick.canSelectMany = false;
		quickPick.ignoreFocusOut = false;
		quickPick.busy = false;
		once(quickPick.onDidAccept)(async () => {

			const selectedItems = quickPick.selectedItems;
			if (selectedItems.length === 1) {
				const selectedItem = selectedItems[0].id!;

				const remoteExtension = this.remoteExtensionMetadata.find(value => value.id === selectedItem);
				if (remoteExtension) {
					quickPick.busy = true;
					quickPick.placeholder = nls.localize('remote.startActions.installingExtension', 'Installing extension... ');

					const galleryExtension = (await this.extensionGalleryService.getExtensions([{ id: selectedItem }], CancellationToken.None))[0];
					await this.extensionManagementService.installFromGallery(galleryExtension, {
						isMachineScoped: false,
						donotIncludePackAndDependencies: false,
						context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true }
					});

					this.telemetryService.publicLog2<RemoteStartActionEvent, RemoteStartActionClassification>('remoteStartList.ActionExecuted', { command: 'workbench.extensions.installExtension', remoteExtensionId: selectedItem });

					quickPick.busy = false;

					const metadata = await this.updateInstallStatus(selectedItem, true);
					if (metadata) {
						this.telemetryService.publicLog2<RemoteStartActionEvent, RemoteStartActionClassification>('remoteStartList.ActionExecuted', { command: metadata?.remoteCommands[0], remoteExtensionId: metadata?.id });
						this.commandService.executeCommand(metadata?.remoteCommands[0]);
					}
				}
				else {
					this.commandService.executeCommand(selectedItem);
					this.telemetryService.publicLog2<RemoteStartActionEvent, RemoteStartActionClassification>('remoteStartList.ActionExecuted', { command: selectedItem });
				}
			}
		});
		quickPick.show();
	}

	private async getDependenciesStr(extensionId: string): Promise<string> {

		const galleryExtension = (await this.extensionGalleryService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
		const friendlyNames: string[] = [];
		if (galleryExtension.properties.extensionPack) {
			for (const extensionPackItem of galleryExtension.properties.extensionPack) {
				const extensionPack = (await this.extensionGalleryService.getExtensions([{ id: extensionPackItem }], CancellationToken.None))[0];
				friendlyNames.push(extensionPack.displayName);
			}
		}

		return friendlyNames.join(', ');
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
