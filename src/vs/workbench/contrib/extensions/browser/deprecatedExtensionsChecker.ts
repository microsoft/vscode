/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionsWorkbenchService } from '../common/extensions.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { localize } from '../../../../nls.js';
import { distinct } from '../../../../base/common/arrays.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';

export class DeprecatedExtensionsChecker extends Disposable implements IWorkbenchContribution {

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.checkForDeprecatedExtensions();
		this._register(extensionManagementService.onDidInstallExtensions(e => {
			const ids: string[] = [];
			for (const { local } of e) {
				if (local && extensionsWorkbenchService.local.find(extension => areSameExtensions(extension.identifier, local.identifier))?.deprecationInfo) {
					ids.push(local.identifier.id.toLowerCase());
				}
			}
			if (ids.length) {
				this.setNotifiedDeprecatedExtensions(ids);
			}
		}));
	}

	private async checkForDeprecatedExtensions(): Promise<void> {
		if (this.storageService.getBoolean('extensionsAssistant/doNotCheckDeprecated', StorageScope.PROFILE, false)) {
			return;
		}
		const local = await this.extensionsWorkbenchService.queryLocal();
		const previouslyNotified = this.getNotifiedDeprecatedExtensions();
		const toNotify = local.filter(e => !!e.deprecationInfo && e.local && this.extensionEnablementService.isEnabled(e.local)).filter(e => !previouslyNotified.includes(e.identifier.id.toLowerCase()));
		if (toNotify.length) {
			this.notificationService.prompt(
				Severity.Warning,
				localize('deprecated extensions', "You have deprecated extensions installed. We recommend to review them and migrate to alternatives."),
				[{
					label: localize('showDeprecated', "Show Deprecated Extensions"),
					run: async () => {
						this.setNotifiedDeprecatedExtensions(toNotify.map(e => e.identifier.id.toLowerCase()));
						await this.extensionsWorkbenchService.openSearch(toNotify.map(extension => `@id:${extension.identifier.id}`).join(' '));
					}
				}, {
					label: localize('neverShowAgain', "Don't Show Again"),
					isSecondary: true,
					run: () => this.storageService.store('extensionsAssistant/doNotCheckDeprecated', true, StorageScope.PROFILE, StorageTarget.USER)
				}]
			);
		}
	}

	private getNotifiedDeprecatedExtensions(): string[] {
		return JSON.parse(this.storageService.get('extensionsAssistant/deprecated', StorageScope.PROFILE, '[]'));
	}

	private setNotifiedDeprecatedExtensions(notified: string[]): void {
		this.storageService.store('extensionsAssistant/deprecated', JSON.stringify(distinct([...this.getNotifiedDeprecatedExtensions(), ...notified])), StorageScope.PROFILE, StorageTarget.USER);
	}
}
