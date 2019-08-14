/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { IURLService } from 'vs/platform/url/common/url';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { URI } from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

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
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const trustedDomains = this.configurationService.getValue<string[]>('http.trustedDomains');

		return this.quickInputService.pick(trustedDomains.map(d => {
			return {
				type: 'item',
				label: d,
				picked: true,
			};
		}), {
			canPickMany: true
		}).then(result => {
			if (result) {
				this.configurationService.updateValue('http.trustedDomains', result.map(r => r.label));
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

