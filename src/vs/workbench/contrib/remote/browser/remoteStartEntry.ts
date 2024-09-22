/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';

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
		const category = nls.localize2('remote.category', "Remote");

		// Show Remote Start Action
		const startEntry = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteStartEntry.REMOTE_WEB_START_ENTRY_ACTIONS_COMMAND_ID,
					category,
					title: nls.localize2('remote.showWebStartEntryActions', "Show Remote Start Entry for web"),
					f1: false
				});
			}

			async run(): Promise<void> {
				await startEntry.showWebRemoteStartActions();
			}
		}));
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
