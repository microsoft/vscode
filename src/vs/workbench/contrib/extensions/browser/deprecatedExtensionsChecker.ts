/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SearchExtensionsAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { distinct } from 'vs/base/common/arrays';
import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';

export class DeprecatedExtensionsChecker extends Disposable implements IWorkbenchContribution {

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
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
						const action = this.instantiationService.createInstance(SearchExtensionsAction, toNotify.map(extension => `@id:${extension.identifier.id}`).join(' '));
						try {
							await action.run();
						} finally {
							action.dispose();
						}
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
