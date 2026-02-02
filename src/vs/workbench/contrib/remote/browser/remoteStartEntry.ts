/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IProductService } from 'vs/platform/product/common/productService';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';

export const showStartEntryInWeb = new RawContextKey<boolean>('showRemoteStartEntryInWeb', false);
export class RemoteStartEntry extends Disposable implements IWorkbenchContribution {

	private static readonly REMOTE_WEB_START_ENTRY_ACTIONS_COMMAND_ID = 'workbench.action.remote.showWebStartEntryActions';

	private readonly remoteExtensionId: string;
	private readonly startCommand: string;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService) {

		super();

		const remoteExtensionTips = this.productService.remoteExtensionTips?.['tunnel'];
		this.startCommand = remoteExtensionTips?.startEntry?.startCommand ?? '';
		this.remoteExtensionId = remoteExtensionTips?.extensionId ?? '';

		this._init();
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
					id: RemoteStartEntry.REMOTE_WEB_START_ENTRY_ACTIONS_COMMAND_ID,
					category,
					title: { value: nls.localize('remote.showWebStartEntryActions', "Show Remote Start Entry for web"), original: 'Show Remote Start Entry for web' },
					f1: false
				});
			}

			async run(): Promise<void> {
				await startEntry.showWebRemoteStartActions();
			}
		});
	}

	private registerListeners(): void {
		this._register(this.extensionEnablementService.onEnablementChanged(async (result) => {

			for (const ext of result) {
				if (ExtensionIdentifier.equals(this.remoteExtensionId, ext.identifier.id)) {
					if (this.extensionEnablementService.isEnabled(ext)) {
						showStartEntryInWeb.bindTo(this.contextKeyService).set(true);
					} else {
						showStartEntryInWeb.bindTo(this.contextKeyService).set(false);
					}
				}
			}
		}));
	}

	private async _init(): Promise<void> {

		// Check if installed and enabled
		const installed = (await this.extensionManagementService.getInstalled()).find(value => ExtensionIdentifier.equals(value.identifier.id, this.remoteExtensionId));
		if (installed) {
			if (this.extensionEnablementService.isEnabled(installed)) {
				showStartEntryInWeb.bindTo(this.contextKeyService).set(true);
			}
		}
	}

	private async showWebRemoteStartActions() {
		this.commandService.executeCommand(this.startCommand);
		this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
			id: this.startCommand,
			from: 'remote start entry'
		});
	}
}
