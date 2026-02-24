/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { IExtensionsWorkbenchService } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { ISessionsWelcomeStep } from '../../common/sessionsWelcomeService.js';

export class CopilotChatInstallStep implements ISessionsWelcomeStep {

	readonly id = 'copilotChat.install';
	readonly title = localize('copilotChatInstall.title', "Install Copilot Chat");
	readonly description = localize('copilotChatInstall.description', "The Copilot Chat extension is required for Agent Sessions.");
	readonly actionLabel = localize('copilotChatInstall.action', "Install Copilot Chat");
	readonly order = 10;

	readonly isSatisfied: IObservable<boolean>;
	readonly initialized: Promise<void>;

	private readonly chatExtensionId: string;

	constructor(
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IProductService private readonly productService: IProductService,
	) {
		this.chatExtensionId = this.productService.defaultChatAgent?.chatExtensionId ?? '';

		this.isSatisfied = observableFromEvent<boolean>(
			this,
			this.extensionService.onDidChangeExtensionsStatus,
			() => this.extensionService.extensions.some(
				ext => ext.identifier.value.toLowerCase() === this.chatExtensionId.toLowerCase()
			)
		);

		// Wait until the extension host has loaded installed extensions
		this.initialized = this.extensionService.whenInstalledExtensionsRegistered().then(() => { });
	}

	async action(): Promise<void> {
		if (!this.chatExtensionId) {
			return;
		}

		await this.extensionsWorkbenchService.install(this.chatExtensionId, {
			enable: true,
			isApplicationScoped: true,
			isMachineScoped: false,
			installEverywhere: true,
			installPreReleaseVersion: this.productService.quality !== 'stable',
		});
	}
}
