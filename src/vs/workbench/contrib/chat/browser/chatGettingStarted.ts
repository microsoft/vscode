/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, } from '../../../../platform/configuration/common/configurationRegistry.js';
import { applicationConfigurationNodeBase } from '../../../common/configuration.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CHAT_VIEW_ID } from './chat.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';

const showChatGettingStartedConfigKey = 'workbench.panel.chat.view.experimental.showGettingStarted';

export class ChatGettingStartedContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatGettingStarted';
	private readonly showChatGettingStartedDisposable = this._register(new MutableDisposable());
	constructor(
		@IContextKeyService private readonly contextService: IContextKeyService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@IActivityService private readonly activityService: IActivityService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
	) {
		super();

		if (!this.productService.gitHubEntitlement) {
			return;
		}

		if (this.storageService.get(showChatGettingStartedConfigKey, StorageScope.APPLICATION) !== undefined) {
			return;
		}

		this.extensionManagementService.getInstalled().then(async exts => {
			const installed = exts.find(value => ExtensionIdentifier.equals(value.identifier.id, this.productService.gitHubEntitlement!.extensionId));
			if (!installed) {
				this.registerListeners();
				return;
			}
			this.storageService.store(showChatGettingStartedConfigKey, 'installed', StorageScope.APPLICATION, StorageTarget.MACHINE);
		});
	}

	private registerListeners() {

		this._register(this.extensionService.onDidChangeExtensions(async (result) => {

			if (this.storageService.get(showChatGettingStartedConfigKey, StorageScope.APPLICATION) !== undefined) {
				return;
			}

			for (const ext of result.added) {
				if (ExtensionIdentifier.equals(this.productService.gitHubEntitlement!.extensionId, ext.identifier)) {
					this.displayBadge();
					return;
				}
			}
		}));

		this.extensionService.onDidChangeExtensionsStatus(async (event) => {

			if (this.storageService.get(showChatGettingStartedConfigKey, StorageScope.APPLICATION) !== undefined) {
				return;
			}

			for (const ext of event) {
				if (ExtensionIdentifier.equals(this.productService.gitHubEntitlement!.extensionId, ext.value)) {
					const extensionStatus = this.extensionService.getExtensionsStatus();
					if (extensionStatus[ext.value].activationTimes) {
						this.displayChatPanel();
						return;
					}
				}
			}
		});

		this._register(this.contextService.onDidChangeContext(event => {
			if (this.storageService.get(showChatGettingStartedConfigKey, StorageScope.APPLICATION) === undefined) {
				return;
			}
			if (event.affectsSome(new Set([`view.${CHAT_VIEW_ID}.visible`]))) {
				if (this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(`${CHAT_VIEW_ID}.visible`))) {
					this.showChatGettingStartedDisposable.clear();
				}
			}
		}));
	}

	private async displayBadge() {
		const showGettingStartedExp = this.configurationService.inspect<string>(showChatGettingStartedConfigKey).value ?? '';
		if (!showGettingStartedExp || showGettingStartedExp !== 'showBadge') {
			return;
		}

		const badge = new NumberBadge(1, () => localize('chat.openPanel', 'Open Chat Panel'));
		this.showChatGettingStartedDisposable.value = this.activityService.showViewActivity(CHAT_VIEW_ID, { badge });
		this.storageService.store(showChatGettingStartedConfigKey, showGettingStartedExp, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private async displayChatPanel() {
		const showGettingStartedExp = this.configurationService.inspect<string>(showChatGettingStartedConfigKey).value ?? '';
		if (!showGettingStartedExp || showGettingStartedExp !== 'showChatPanel') {
			return;
		}

		this.commandService.executeCommand(`${CHAT_VIEW_ID}.focus`);
		this.storageService.store(showChatGettingStartedConfigKey, showGettingStartedExp, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	...applicationConfigurationNodeBase,
	properties: {
		'workbench.panel.chat.view.experimental.showGettingStarted': {
			scope: ConfigurationScope.MACHINE,
			type: 'string',
			default: '',
			tags: ['experimental'],
			description: localize('workbench.panel.chat.view.showGettingStarted', "When enabled, shows a getting started experiments in the chat panel.")
		}
	}
});

