/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IProductService } from 'vs/platform/product/common/product';

export const enum ConfigureTrustedDomainActionType {
	ToggleTrustAll = 'toggleTrustAll',
	Add = 'add',
	Configure = 'configure',
	Reset = 'reset'
}

export const configureTrustedDomainSettingsCommand = {
	id: 'workbench.action.configureTrustedDomain',
	description: {
		description: localize('configureTrustedDomain', 'Configure Trusted Domains for Link Protection'),
		args: []
	},
	handler: async (accessor: ServicesAccessor) => {
		const quickInputService = accessor.get(IQuickInputService);
		const storageService = accessor.get(IStorageService);
		const productService = accessor.get(IProductService);

		let trustedDomains: string[] = productService.linkProtectionTrustedDomains
			? [...productService.linkProtectionTrustedDomains]
			: [];

		try {
			const trustedDomainsSrc = storageService.get('http.linkProtectionTrustedDomains', StorageScope.GLOBAL);
			if (trustedDomainsSrc) {
				trustedDomains = JSON.parse(trustedDomainsSrc);
			}
		} catch (err) { }

		const trustOrUntrustAllLabel =
			trustedDomains.indexOf('*') === -1
				? localize('trustedDomain.trustAll', 'Disable Link Protection')
				: localize('trustedDomain.untrustAll', 'Enable Link Protection');

		const trustOrUntrustAll: IQuickPickItem = {
			id: ConfigureTrustedDomainActionType.ToggleTrustAll,
			label: trustOrUntrustAllLabel
		};

		const result = await quickInputService.pick(
			[
				trustOrUntrustAll,
				{ id: ConfigureTrustedDomainActionType.Add, label: localize('trustedDomain.add', 'Add Trusted Domain') },
				{
					id: ConfigureTrustedDomainActionType.Configure,
					label: localize('trustedDomain.edit', 'View and configure Trusted Domains')
				},
				{ id: ConfigureTrustedDomainActionType.Reset, label: localize('trustedDomain.reset', 'Reset Trusted Domains') }
			],
			{}
		);

		if (result) {
			switch (result.id) {
				case ConfigureTrustedDomainActionType.ToggleTrustAll:
					toggleAll(trustedDomains, storageService);
					break;
				case ConfigureTrustedDomainActionType.Add:
					addDomain(trustedDomains, storageService, quickInputService);
					break;
				case ConfigureTrustedDomainActionType.Configure:
					configureDomains(trustedDomains, storageService, quickInputService);
					break;
				case ConfigureTrustedDomainActionType.Reset:
					resetDomains(storageService, productService);
					break;
			}
		}
	}
};

function toggleAll(trustedDomains: string[], storageService: IStorageService) {
	if (trustedDomains.indexOf('*') === -1) {
		storageService.store(
			'http.linkProtectionTrustedDomains',
			JSON.stringify(trustedDomains.concat(['*'])),
			StorageScope.GLOBAL
		);
	} else {
		storageService.store(
			'http.linkProtectionTrustedDomains',
			JSON.stringify(trustedDomains.filter(x => x !== '*')),
			StorageScope.GLOBAL
		);
	}
}

function addDomain(trustedDomains: string[], storageService: IStorageService, quickInputService: IQuickInputService) {
	quickInputService
		.input({
			placeHolder: 'Domain to trust',
			validateInput: i => {
				if (!i.match(/^https?:\/\//)) {
					return Promise.resolve(undefined);
				}

				return Promise.resolve(i);
			}
		})
		.then(result => {
			console.log(result);
			if (result) {
				storageService.store(
					'http.linkProtectionTrustedDomains',
					JSON.stringify(trustedDomains.concat([result])),
					StorageScope.GLOBAL
				);
			}
		});
}

function configureDomains(
	trustedDomains: string[],
	storageService: IStorageService,
	quickInputService: IQuickInputService
) {
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

	quickInputService.pick(domainQuickPickItems, { canPickMany: true }).then(result => {
		const pickedDomains: string[] = result.map(r => r.id!);
		storageService.store('http.linkProtectionTrustedDomains', JSON.stringify(pickedDomains), StorageScope.GLOBAL);
	});
}

function resetDomains(storageService: IStorageService, productService: IProductService) {
	if (productService.linkProtectionTrustedDomains) {
		storageService.store(
			'http.linkProtectionTrustedDomains',
			JSON.stringify(productService.linkProtectionTrustedDomains),
			StorageScope.GLOBAL
		);
	} else {
		storageService.store('http.linkProtectionTrustedDomains', JSON.stringify([]), StorageScope.GLOBAL);
	}
}

export async function configureOpenerTrustedDomainsHandler(
	trustedDomains: string[],
	domainToConfigure: string,
	quickInputService: IQuickInputService,
	storageService: IStorageService
) {
	const openAllLinksItem: IQuickPickItem = {
		type: 'item',
		label: localize('trustedDomain.trustAllAndOpenLink', 'Disable Link Protection and open link'),
		id: '*',
		picked: trustedDomains.indexOf('*') !== -1
	};
	const trustDomainItem: IQuickPickItem = {
		type: 'item',
		label: localize('trustedDomain.trustDomainAndOpenLink', 'Trust {0} and open link', domainToConfigure),
		id: domainToConfigure,
		picked: true
	};

	const pickedResult = await quickInputService.pick([openAllLinksItem, trustDomainItem], {
		activeItem: trustDomainItem
	});

	if (pickedResult) {
		if (pickedResult.id && trustedDomains.indexOf(pickedResult.id) === -1) {
			storageService.store(
				'http.linkProtectionTrustedDomains',
				JSON.stringify([...trustedDomains, pickedResult.id]),
				StorageScope.GLOBAL
			);

			return [...trustedDomains, pickedResult.id];
		}
	}

	return [];
}
