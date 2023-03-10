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
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { timeout } from 'vs/base/common/async';
import { Registry } from 'vs/platform/registry/common/platform';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IExtensionContributions } from 'vs/platform/extensions/common/extensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

const STATUSBAR_REMOTEINDICATOR_CONTRIBUTION = 'statusBar/remoteIndicator';

type RemoteStartActionClassification = {
	command: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The command being executed by the remote start entry.' };
	remoteExtensionId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The remote extension id being used.' };
	owner: 'bhavyau';
	comment: 'Help understand which remote extensions are most commonly used from the remote start entry';
};

type RemoteStartActionEvent = {
	command: string;
	remoteExtensionId: string;
};

export class RemoteStartEntry extends Disposable implements IWorkbenchContribution {

	private static readonly REMOTE_START_ENTRY_ACTIONS_COMMAND_ID = 'workbench.action.remote.showStartEntryActions';
	private currentRemoteExtensionId: string = '';
	private readonly remoteCommands: Map<string, string> = new Map<string, string>();

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService) {

		super();
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
		this._register(this.extensionManagementService.onDidInstallExtensions(result => {
			for (const ext of result) {
				if (ext.identifier.id === this.currentRemoteExtensionId) {
					this.registerRemoteCommand(ext.local?.manifest?.contributes, this.currentRemoteExtensionId);
				}
			}
		}));

		this._register(this.extensionManagementService.onDidUninstallExtension(result => {
			if (this.remoteCommands.has(result.identifier.id)) {
				this.remoteCommands.delete(result.identifier.id);
			}
		}));
	}

	private registerRemoteCommand(extensionContributions: IExtensionContributions | undefined, remoteId: string) {
		if (extensionContributions?.menus) {
			for (const context in extensionContributions.menus) {
				if (context === STATUSBAR_REMOTEINDICATOR_CONTRIBUTION) {
					const command = extensionContributions.menus[context][0];
					this.remoteCommands.set(remoteId, command.command);
				}
			}
		}
	}

	private async showRemoteStartActions() {

		const computeItems = () => {
			const items: QuickPickItem[] = [];
			const remoteExtensionTips = { ...this.productService.remoteExtensionTips, ...this.productService.virtualWorkspaceExtensionTips };

			for (const extension of Object.values(remoteExtensionTips)) {
				if (extension?.showInStartEntry === true) {
					const label = nls.localize('remote.startActions.connectTo', 'Connect to {0}... ', extension.friendlyName);
					const description = this.extensionService.extensions.some((e) => e.id?.toLowerCase() === extension.extensionId.toLowerCase()) ?
						'' : nls.localize('remote.startActions.installExtension', 'Extension will be downloaded and installed.');

					items.push({
						type: 'item',
						id: extension.extensionId,
						description: description,
						label
					});

					items.push({
						type: 'separator'
					});
				}
			}

			return items;
		};

		const quickPick = this.quickInputService.createQuickPick();
		quickPick.placeholder = nls.localize('remoteActions', "Select an option to connect to a Remote Window");
		quickPick.items = computeItems();
		quickPick.sortByLabel = false;
		quickPick.canSelectMany = false;
		quickPick.ignoreFocusOut = false;
		quickPick.busy = false;
		once(quickPick.onDidAccept)(async () => {

			const selectedItems = quickPick.selectedItems;
			if (selectedItems.length === 1) {

				const selectedItem = selectedItems[0];
				const remoteExtensionId = selectedItem.id!;
				this.currentRemoteExtensionId = remoteExtensionId;

				let remoteCommand = this.remoteCommands.get(remoteExtensionId);

				//Remote Extension is not installed
				if (!remoteCommand && selectedItem.description !== '') {

					this.commandService.executeCommand('workbench.extensions.installExtension', remoteExtensionId);
					this.telemetryService.publicLog2<RemoteStartActionEvent, RemoteStartActionClassification>('remoteStartList.ActionExecuted', { command: 'workbench.extensions.installExtension', remoteExtensionId: remoteExtensionId });

					quickPick.placeholder = nls.localize('remote.startActions.installingExtension', 'Installing extension... ');
					quickPick.busy = true;

					// Remote extension is not registered immediately on install.
					// Wait for it to appear before returning.
					while (!await this.extensionService.getExtension(remoteExtensionId)) {
						await timeout(300);
					}

					while (!(await this.extensionService.whenInstalledExtensionsRegistered())) {
						await timeout(300);
					}
				}
				//Remote Extension is installed
				else {
					const extension = await this.extensionService.getExtension(remoteExtensionId);
					this.registerRemoteCommand(extension?.contributes, this.currentRemoteExtensionId);
				}

				remoteCommand = this.remoteCommands.get(remoteExtensionId);
				if (remoteCommand) {

					this.telemetryService.publicLog2<RemoteStartActionEvent, RemoteStartActionClassification>('remoteStartList.ActionExecuted', { command: remoteCommand, remoteExtensionId: remoteExtensionId });
					this.commandService.executeCommand(remoteCommand);
					quickPick.busy = false;
				}
				else {
					throw Error('Could not find statusBar/remoteIndicator menu contributions for ' + remoteExtensionId);
				}
			}
		});
		quickPick.show();
	}
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.remote.experimental.showStartListEntry': {
			scope: ConfigurationScope.MACHINE,
			type: 'boolean',
			default: false,
			description: nls.localize('workbench.remote.showStartListEntry', "When enabled, a start list entry for getting started with remote experiences in shown on the welcome page.")
		}
	}
});
