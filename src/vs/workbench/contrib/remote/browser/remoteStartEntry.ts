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
import { IExtensionGalleryService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { timeout } from 'vs/base/common/async';
import { Registry } from 'vs/platform/registry/common/platform';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';

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
	remoteCommand?: string;
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
		@ITelemetryService private readonly telemetryService: ITelemetryService) {

		super();

		const remoteExtensionTips = { ...this.productService.remoteExtensionTips, ...this.productService.virtualWorkspaceExtensionTips };
		this.remoteExtensionMetadata = Object.values(remoteExtensionTips).filter(value => value.showInStartEntry === true).map(value => {
			return { id: value.extensionId, installed: false, friendlyName: value.friendlyName };
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
					f1: true
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
				const index = this.remoteExtensionMetadata.findIndex(value => value.id === ext.identifier.id && !value.installed);
				if (index > -1) {
					const command = await this.getRemoteCommand(ext.identifier.id);
					if (command) {
						this.remoteExtensionMetadata[index].remoteCommand = command;
						this.remoteExtensionMetadata[index].installed = true;
					}
				}
			}
		}));

		this._register(this.extensionManagementService.onDidUninstallExtension(async (result) => {
			const index = this.remoteExtensionMetadata.findIndex(value => value.id === result.identifier.id && value.installed);
			if (index > -1) {
				this.remoteExtensionMetadata[index].installed = false;
				if (this.remoteExtensionMetadata[index].dependenciesStr === undefined) {
					const dependenciesStr = await this.getDependenciesStr(this.remoteExtensionMetadata[index].id);
					this.remoteExtensionMetadata[index].dependenciesStr = dependenciesStr;
				}
			}
		}));
	}

	private async _init(): Promise<void> {

		if (this._isInitialized) {
			return;
		}

		for (let i = 0; i < this.remoteExtensionMetadata.length; i++) {
			const installed = this.extensionService.extensions.some((e) => e.id?.toLowerCase() === this.remoteExtensionMetadata[i].id);
			if (installed) {
				const command = await this.getRemoteCommand(this.remoteExtensionMetadata[i].id);
				if (command) {
					this.remoteExtensionMetadata[i].remoteCommand = command;
					this.remoteExtensionMetadata[i].installed = true;
				}
			}
			else {
				const dependenciesStr = await this.getDependenciesStr(this.remoteExtensionMetadata[i].id);
				this.remoteExtensionMetadata[i].dependenciesStr = dependenciesStr;
			}
		}

		this._isInitialized = true;
	}

	private async getRemoteCommand(remoteExtensionId: string): Promise<string | undefined> {

		// Remote extension is not registered immediately on install.
		// Wait for it to appear before returning.
		let extension: Readonly<IRelaxedExtensionDescription> | undefined;
		while (!extension) {
			extension = await this.extensionService.getExtension(remoteExtensionId);
			await timeout(300);
		}

		const menus = extension?.contributes?.menus;
		if (menus) {
			for (const contextMenu in menus) {
				// The remote start entry pulls the first command from the statusBar/remoteIndicator menu contribution
				if (contextMenu === STATUSBAR_REMOTEINDICATOR_CONTRIBUTION) {
					const command = menus[contextMenu][0];
					return command.command;
				}
			}
		}
		return undefined;
	}

	private async showRemoteStartActions() {

		await this._init();

		const computeItems = async () => {
			const installedItems: QuickPickItem[] = [];
			const notInstalledItems: QuickPickItem[] = [];
			for (const metadata of this.remoteExtensionMetadata) {

				if (metadata.installed && metadata.remoteCommand) {
					const commandAction = MenuRegistry.getCommand(metadata.remoteCommand);
					const label = typeof commandAction?.title === 'string' ? commandAction.title : commandAction?.title?.value;
					if (label) {
						installedItems.push({ type: 'separator', label: metadata.friendlyName });
						installedItems.push({
							type: 'item',
							label: label,
							id: metadata.id
						});
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

				const metadata = this.remoteExtensionMetadata.find(value => value.id === selectedItem)!;
				if (!metadata.installed) {
					this.executeCommand('workbench.extensions.installExtension', selectedItem);

					quickPick.placeholder = nls.localize('remote.startActions.installingExtension', 'Installing extension... ');
					quickPick.busy = true;

					// Remote extension is not registered immediately on install.
					// Wait for it to appear before returning.
					while (!(await this.extensionService.whenInstalledExtensionsRegistered())) {
						await timeout(300);
					}

					const command = await this.getRemoteCommand(selectedItem);
					quickPick.busy = false;

					if (command) {
						this.executeCommand(command);
					}
					else {
						throw Error('Could not find statusBar/remoteIndicator menu contributions for: ' + selectedItem);
					}
				}
				else if (metadata.installed && metadata.remoteCommand) {
					this.executeCommand(metadata.remoteCommand);
				}
				else {
					throw Error('Could not find statusBar/remoteIndicator menu contributions for: ' + selectedItem);
				}
			}
		});
		quickPick.show();
	}

	private executeCommand(command: string, remoteExtensionId?: string) {
		this.telemetryService.publicLog2<RemoteStartActionEvent, RemoteStartActionClassification>('remoteStartList.ActionExecuted', { command: command, remoteExtensionId: remoteExtensionId });
		this.commandService.executeCommand(command, remoteExtensionId);
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

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.remote.experimental.showStartListEntry': {
			scope: ConfigurationScope.MACHINE,
			type: 'boolean',
			default: true,
			description: nls.localize('workbench.remote.showStartListEntry', "When enabled, a start list entry for getting started with remote experiences in shown on the welcome page.")
		}
	}
});
