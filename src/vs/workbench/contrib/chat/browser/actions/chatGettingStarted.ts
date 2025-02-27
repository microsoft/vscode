/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IExtensionManagementService, InstallOperation } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IDefaultChatAgent } from '../../../../../base/common/product.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ensureSideBarChatViewSize, showCopilotView } from '../chat.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';

export class ChatGettingStartedContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatGettingStarted';
	private recentlyInstalled: boolean = false;

	private static readonly hideWelcomeView = 'workbench.chat.hideWelcomeView';

	constructor(
		@IProductService private readonly productService: IProductService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IViewsService private readonly viewsService: IViewsService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		const defaultChatAgent = this.productService.defaultChatAgent;
		const hideWelcomeView = this.storageService.getBoolean(ChatGettingStartedContribution.hideWelcomeView, StorageScope.APPLICATION, false);
		if (!defaultChatAgent || hideWelcomeView) {
			return;
		}

		this.registerListeners(defaultChatAgent);
	}

	private registerListeners(defaultChatAgent: IDefaultChatAgent): void {

		this._register(this.extensionManagementService.onDidInstallExtensions(async (result) => {
			for (const e of result) {
				if (ExtensionIdentifier.equals(defaultChatAgent.extensionId, e.identifier.id) && e.operation === InstallOperation.Install) {
					this.recentlyInstalled = true;
					return;
				}
			}
		}));

		this._register(this.extensionService.onDidChangeExtensionsStatus(async (event) => {
			for (const ext of event) {
				if (ExtensionIdentifier.equals(defaultChatAgent.extensionId, ext.value)) {
					const extensionStatus = this.extensionService.getExtensionsStatus();
					if (extensionStatus[ext.value].activationTimes && this.recentlyInstalled) {
						this.onDidInstallChat();
						return;
					}
				}
			}
		}));
	}

	private async onDidInstallChat() {

		// Open Copilot view
		showCopilotView(this.viewsService, this.layoutService);
		ensureSideBarChatViewSize(this.viewDescriptorService, this.layoutService, this.viewsService);

		// Only do this once
		this.storageService.store(ChatGettingStartedContribution.hideWelcomeView, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		this.recentlyInstalled = false;

		// Enable Copilot related UI if previously disabled
		this.statusbarService.updateEntryVisibility('chat.statusBarEntry', true);
		this.configurationService.updateValue('chat.commandCenter.enabled', true);
	}
}
