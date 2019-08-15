/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { IURLService } from 'vs/platform/url/common/url';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { URI } from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

export class OpenUrlAction extends Action {

	static readonly ID = 'workbench.action.url.openUrl';
	static readonly LABEL = localize('openUrl', "Open URL");

	constructor(
		id: string,
		label: string,
		@IURLService private readonly urlService: IURLService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super(id, label);
	}

	run(): Promise<any> {
		return this.quickInputService.input({ prompt: 'URL to open' }).then(input => {
			const uri = URI.parse(input);
			this.urlService.open(uri);
		});
	}
}

export class ConfigureTrustedDomainsAction extends Action {

	static readonly ID = 'workbench.action.configureTrustedDomains';
	static readonly LABEL = localize('configureTrustedDomains', "Configure Trusted Domains");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		let trustedDomains: string[] = [];
		try {
			trustedDomains = JSON.parse(this.storageService.get('http.trustedDomains', StorageScope.GLOBAL, '[]'));
		} catch (err) { }

		const quickPickItems: (IQuickPickItem | IQuickPickSeparator)[] = trustedDomains
			.filter(d => d !== '*')
			.map(d => {
				return {
					type: 'item',
					label: d,
					picked: true,
				};
			});

		quickPickItems.unshift({
			type: 'separator'
		});
		quickPickItems.unshift({
			type: 'item',
			label: '*',
			description: 'Allow all links to be open without protection',
			picked: trustedDomains.indexOf('*') !== -1
		});

		return this.quickInputService.pick(quickPickItems, {
			canPickMany: true
		}).then(result => {
			if (result) {
				this.storageService.store('http.trustedDomains', JSON.stringify(result.map(r => r.label)), StorageScope.GLOBAL);
			}
		});
	}
}

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(OpenUrlAction, OpenUrlAction.ID, OpenUrlAction.LABEL),
	'Open URL',
	localize('developer', 'Developer')
);
Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(
		ConfigureTrustedDomainsAction,
		ConfigureTrustedDomainsAction.ID,
		ConfigureTrustedDomainsAction.LABEL
	),
	'Configure Trusted Domains'
);
