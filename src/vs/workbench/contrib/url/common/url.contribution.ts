/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { IURLService } from 'vs/platform/url/common/url';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { URI } from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IProductService } from 'vs/platform/product/common/product';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { Schemas } from 'vs/base/common/network';
import Severity from 'vs/base/common/severity';

export class OpenUrlAction extends Action {
	static readonly ID = 'workbench.action.url.openUrl';
	static readonly LABEL = localize('openUrl', 'Open URL');

	constructor(
		id: string,
		label: string,
		@IURLService private readonly urlService: IURLService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
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

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(OpenUrlAction, OpenUrlAction.ID, OpenUrlAction.LABEL),
	'Open URL',
	localize('developer', 'Developer')
);

const VSCODE_DOMAIN = 'https://code.visualstudio.com';

const configureTrustedDomainsHandler = async (
	quickInputService: IQuickInputService,
	storageService: IStorageService,
	domainToConfigure?: string
) => {
	let trustedDomains: string[] = [VSCODE_DOMAIN];

	try {
		const trustedDomainsSrc = storageService.get('http.trustedDomains', StorageScope.GLOBAL);
		if (trustedDomainsSrc) {
			trustedDomains = JSON.parse(trustedDomainsSrc);
		}
	} catch (err) { }

	const domainQuickPickItems: IQuickPickItem[] = trustedDomains
		.filter(d => d !== '*')
		.map(d => {
			return {
				type: 'item',
				label: d,
				id: d,
				picked: true
			};
		});

	const specialQuickPickItems: IQuickPickItem[] = [
		{
			type: 'item',
			label: localize('openAllLinksWithoutPrompt', 'Open all links without prompt'),
			id: '*',
			picked: trustedDomains.indexOf('*') !== -1
		}
	];

	let domainToConfigureItem: IQuickPickItem | undefined = undefined;
	if (domainToConfigure && trustedDomains.indexOf(domainToConfigure) === -1) {
		domainToConfigureItem = {
			type: 'item',
			label: domainToConfigure,
			id: domainToConfigure,
			picked: true,
			description: localize('trustDomainAndOpenLink', 'Trust domain and open link')
		};
		specialQuickPickItems.push(<IQuickPickItem>domainToConfigureItem);
	}

	const quickPickItems: (IQuickPickItem | IQuickPickSeparator)[] =
		domainQuickPickItems.length === 0
			? specialQuickPickItems
			: [...specialQuickPickItems, { type: 'separator' }, ...domainQuickPickItems];

	const pickedResult = await quickInputService.pick(quickPickItems, {
		canPickMany: true,
		activeItem: domainToConfigureItem
	});

	if (pickedResult) {
		const pickedDomains: string[] = pickedResult.map(r => r.id!);
		storageService.store('http.trustedDomains', JSON.stringify(pickedDomains), StorageScope.GLOBAL);

		return pickedDomains;
	}

	return [];
};

const configureTrustedDomainCommand = {
	id: 'workbench.action.configureTrustedDomains',
	description: {
		description: localize('configureTrustedDomains', 'Configure Trusted Domains'),
		args: [{ name: 'domainToConfigure', schema: { type: 'string' } }]
	},
	handler: (accessor: ServicesAccessor, domainToConfigure?: string) => {
		const quickInputService = accessor.get(IQuickInputService);
		const storageService = accessor.get(IStorageService);

		return configureTrustedDomainsHandler(quickInputService, storageService, domainToConfigure);
	}
};

CommandsRegistry.registerCommand(configureTrustedDomainCommand);
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: configureTrustedDomainCommand.id,
		title: configureTrustedDomainCommand.description.description
	}
});

class OpenerValidatorContributions implements IWorkbenchContribution {
	constructor(
		@IOpenerService private readonly _openerService: IOpenerService,
		@IStorageService private readonly _storageService: IStorageService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IProductService private readonly _productService: IProductService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService
	) {
		this._openerService.registerValidator({ shouldOpen: r => this.validateLink(r) });
	}

	async validateLink(resource: URI): Promise<boolean> {
		const { scheme, authority } = resource;

		if (!equalsIgnoreCase(scheme, Schemas.http) && !equalsIgnoreCase(scheme, Schemas.https)) {
			return true;
		}

		let trustedDomains: string[] = [VSCODE_DOMAIN];
		try {
			const trustedDomainsSrc = this._storageService.get('http.trustedDomains', StorageScope.GLOBAL);
			if (trustedDomainsSrc) {
				trustedDomains = JSON.parse(trustedDomainsSrc);
			}
		} catch (err) { }

		const domainToOpen = `${scheme}://${authority}`;

		if (isDomainTrusted(domainToOpen, trustedDomains)) {
			return true;
		} else {
			const choice = await this._dialogService.show(
				Severity.Info,
				localize(
					'openExternalLinkAt',
					'Do you want {0} to open the external website?\n{1}',
					this._productService.nameShort,
					resource.toString(true)
				),
				[
					localize('openLink', 'Open Link'),
					localize('cancel', 'Cancel'),
					localize('configureTrustedDomains', 'Configure Trusted Domains')
				],
				{
					cancelId: 1
				}
			);

			// Open Link
			if (choice === 0) {
				return true;
			}
			// Configure Trusted Domains
			else if (choice === 2) {
				const pickedDomains = await configureTrustedDomainsHandler(this._quickInputService, this._storageService, domainToOpen);
				if (pickedDomains.indexOf(domainToOpen) !== -1) {
					return true;
				}
				return false;
			}

			return false;
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	OpenerValidatorContributions,
	LifecyclePhase.Restored
);

/**
 * Check whether a domain like https://www.microsoft.com matches
 * the list of trusted domains.
 */
function isDomainTrusted(domain: string, trustedDomains: string[]) {
	for (let i = 0; i < trustedDomains.length; i++) {
		if (trustedDomains[i] === '*') {
			return true;
		}

		if (trustedDomains[i] === domain) {
			return true;
		}
	}

	return false;
}
