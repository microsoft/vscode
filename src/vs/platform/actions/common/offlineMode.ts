/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

export const offlineModeSetting = 'workbench.enableOfflineMode';

export class EnableOfflineMode extends Action {
	static readonly ID = 'workbench.action.enableOfflineMode';
	static LABEL = localize('enableOfflineMode', 'Enable Offline Mode');

	private readonly disclaimerStorageKey = 'workbench.offlineMode.disclaimer.dontShowAgain';

	constructor(
		id: string = EnableOfflineMode.ID,
		label: string = EnableOfflineMode.LABEL,
		@IConfigurationService private configurationService: IConfigurationService,
		@IStorageService private storageService: IStorageService,
		@INotificationService private notificationService: INotificationService
	) {
		super(id, label);
		this.updateEnabled();
		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(offlineModeSetting)) {
				this.updateEnabled();
			}
		});
	}

	private updateEnabled() {
		this.enabled = this.configurationService.getValue(offlineModeSetting) !== true;
	}

	run(): TPromise<any> {
		if (this.storageService.getBoolean(this.disclaimerStorageKey, StorageScope.GLOBAL, false) === false) {
			this.notificationService.prompt(Severity.Info, localize('offlineModeDisclaimer', "VS Code cannot stop extensions from making network requests in offline mode. If extensions make such requests, please log an issue against them."), [
				{
					label: localize('DontShowAgain', "Don't Show Again"),
					run: () => {
						this.storageService.store(this.disclaimerStorageKey, true);
					}
				}
			]);
		}
		return this.configurationService.updateValue(offlineModeSetting, true);
	}
}

export class DisableOfflineMode extends Action {
	static readonly ID = 'workbench.action.disableOfflineMode';
	static LABEL = localize('disableOfflineMode', 'Disable Offline Mode');

	constructor(
		id: string = DisableOfflineMode.ID,
		label: string = DisableOfflineMode.LABEL,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label);
		this.updateEnabled();
		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(offlineModeSetting)) {
				this.updateEnabled();
			}
		});
	}

	private updateEnabled() {
		this.enabled = this.configurationService.getValue(offlineModeSetting) === true;
	}

	run(): TPromise<any> {
		return this.configurationService.updateValue(offlineModeSetting, false);
	}
}

export class NotifyUnsupportedFeatureInOfflineMode extends Action {
	static readonly ID = 'workbench.action.notifyUnsupportedFeatureInOfflineMode';

	constructor(
		id: string = NotifyUnsupportedFeatureInOfflineMode.ID,
		label: string = '',
		@IConfigurationService private configurationService: IConfigurationService,
		@INotificationService private notificationService: INotificationService
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		this.notificationService.prompt(Severity.Info, localize('offlineModeUnsupportedFeature', "This feature is not supported in offline mode"), [
			{
				label: DisableOfflineMode.LABEL,
				run: () => {
					return this.configurationService.updateValue(offlineModeSetting, false);
				}
			}
		]);
		return TPromise.as(null);
	}
}

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '5_offline',
	command: {
		id: EnableOfflineMode.ID,
		title: localize({ key: 'miEnableOfflineMode', comment: ['&& denotes a mnemonic'] }, "Enable &&Offline Mode")
	},
	order: 1,
	when: ContextKeyExpr.not('config.' + offlineModeSetting)
});

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '5_offline',
	command: {
		id: DisableOfflineMode.ID,
		title: localize({ key: 'miDisableOfflineMode', comment: ['&& denotes a mnemonic'] }, "Disable &&Offline Mode")
	},
	order: 1,
	when: ContextKeyExpr.has('config.' + offlineModeSetting)
});