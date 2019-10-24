/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/productService';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const TRUSTED_DOMAINS_URI = URI.parse('trustedDomains:/Trusted Domains');

export const manageTrustedDomainSettingsCommand = {
	id: 'workbench.action.manageTrustedDomain',
	description: {
		description: localize('trustedDomain.manageTrustedDomain', 'Manage Trusted Domains'),
		args: []
	},
	handler: async (accessor: ServicesAccessor) => {
		const editorService = accessor.get(IEditorService);
		editorService.openEditor({ resource: TRUSTED_DOMAINS_URI, mode: 'jsonc' });
		return;
	}
};

export async function configureOpenerTrustedDomainsHandler(
	trustedDomains: string[],
	domainToConfigure: string,
	quickInputService: IQuickInputService,
	storageService: IStorageService,
	editorService: IEditorService
) {
	const parsedDomainToConfigure = URI.parse(domainToConfigure);
	const toplevelDomainSegements = parsedDomainToConfigure.authority.split('.');
	const domainEnd = toplevelDomainSegements.slice(toplevelDomainSegements.length - 2).join('.');
	const topLevelDomain = '*.' + domainEnd;

	const trustDomainAndOpenLinkItem: IQuickPickItem = {
		type: 'item',
		label: localize('trustedDomain.trustDomain', 'Trust {0}', domainToConfigure),
		id: domainToConfigure,
		picked: true
	};
	const trustSubDomainAndOpenLinkItem: IQuickPickItem = {
		type: 'item',
		label: localize('trustedDomain.trustSubDomain', 'Trust {0} and all its subdomains', domainEnd),
		id: topLevelDomain
	};
	const openAllLinksItem: IQuickPickItem = {
		type: 'item',
		label: localize('trustedDomain.trustAllDomains', 'Trust all domains (disables link protection)'),
		id: '*'
	};
	const manageTrustedDomainItem: IQuickPickItem = {
		type: 'item',
		label: localize('trustedDomain.manageTrustedDomains', 'Manage Trusted Domains'),
		id: 'manage'
	};

	const pickedResult = await quickInputService.pick(
		[trustDomainAndOpenLinkItem, trustSubDomainAndOpenLinkItem, openAllLinksItem, manageTrustedDomainItem],
		{
			activeItem: trustDomainAndOpenLinkItem
		}
	);

	if (pickedResult) {
		if (pickedResult.id === 'manage') {
			editorService.openEditor({
				resource: TRUSTED_DOMAINS_URI,
				mode: 'jsonc'
			});
			return trustedDomains;
		}
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

export function readTrustedDomains(storageService: IStorageService, productService: IProductService) {
	const defaultTrustedDomains: string[] = productService.linkProtectionTrustedDomains
		? [...productService.linkProtectionTrustedDomains]
		: [];

	let trustedDomains: string[] = [];
	try {
		const trustedDomainsSrc = storageService.get('http.linkProtectionTrustedDomains', StorageScope.GLOBAL);
		if (trustedDomainsSrc) {
			trustedDomains = JSON.parse(trustedDomainsSrc);
		}
	} catch (err) { }

	return {
		defaultTrustedDomains,
		trustedDomains
	};
}
