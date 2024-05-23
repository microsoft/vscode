/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { localize, localize2 } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/productService';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';

const TRUSTED_DOMAINS_URI = URI.parse('trustedDomains:/Trusted Domains');

export const TRUSTED_DOMAINS_STORAGE_KEY = 'http.linkProtectionTrustedDomains';
export const TRUSTED_DOMAINS_CONTENT_STORAGE_KEY = 'http.linkProtectionTrustedDomainsContent';

export const manageTrustedDomainSettingsCommand = {
	id: 'workbench.action.manageTrustedDomain',
	description: {
		description: localize2('trustedDomain.manageTrustedDomain', 'Manage Trusted Domains'),
		args: []
	},
	handler: async (accessor: ServicesAccessor) => {
		const editorService = accessor.get(IEditorService);
		editorService.openEditor({ resource: TRUSTED_DOMAINS_URI, languageId: 'jsonc', options: { pinned: true } });
		return;
	}
};

type ConfigureTrustedDomainsQuickPickItem = IQuickPickItem & ({ id: 'manage' } | { id: 'trust'; toTrust: string });

export async function configureOpenerTrustedDomainsHandler(
	trustedDomains: string[],
	domainToConfigure: string,
	resource: URI,
	quickInputService: IQuickInputService,
	storageService: IStorageService,
	editorService: IEditorService,
	telemetryService: ITelemetryService,
) {
	const parsedDomainToConfigure = URI.parse(domainToConfigure);
	const toplevelDomainSegements = parsedDomainToConfigure.authority.split('.');
	const domainEnd = toplevelDomainSegements.slice(toplevelDomainSegements.length - 2).join('.');
	const topLevelDomain = '*.' + domainEnd;
	const options: ConfigureTrustedDomainsQuickPickItem[] = [];

	options.push({
		type: 'item',
		label: localize('trustedDomain.trustDomain', 'Trust {0}', domainToConfigure),
		id: 'trust',
		toTrust: domainToConfigure,
		picked: true
	});

	const isIP =
		toplevelDomainSegements.length === 4 &&
		toplevelDomainSegements.every(segment =>
			Number.isInteger(+segment) || Number.isInteger(+segment.split(':')[0]));

	if (isIP) {
		if (parsedDomainToConfigure.authority.includes(':')) {
			const base = parsedDomainToConfigure.authority.split(':')[0];
			options.push({
				type: 'item',
				label: localize('trustedDomain.trustAllPorts', 'Trust {0} on all ports', base),
				toTrust: base + ':*',
				id: 'trust'
			});
		}
	} else {
		options.push({
			type: 'item',
			label: localize('trustedDomain.trustSubDomain', 'Trust {0} and all its subdomains', domainEnd),
			toTrust: topLevelDomain,
			id: 'trust'
		});
	}

	options.push({
		type: 'item',
		label: localize('trustedDomain.trustAllDomains', 'Trust all domains (disables link protection)'),
		toTrust: '*',
		id: 'trust'
	});
	options.push({
		type: 'item',
		label: localize('trustedDomain.manageTrustedDomains', 'Manage Trusted Domains'),
		id: 'manage'
	});

	const pickedResult = await quickInputService.pick<ConfigureTrustedDomainsQuickPickItem>(
		options, { activeItem: options[0] }
	);

	if (pickedResult && pickedResult.id) {
		switch (pickedResult.id) {
			case 'manage':
				await editorService.openEditor({
					resource: TRUSTED_DOMAINS_URI.with({ fragment: resource.toString() }),
					languageId: 'jsonc',
					options: { pinned: true }
				});
				return trustedDomains;
			case 'trust': {
				const itemToTrust = pickedResult.toTrust;
				if (trustedDomains.indexOf(itemToTrust) === -1) {
					storageService.remove(TRUSTED_DOMAINS_CONTENT_STORAGE_KEY, StorageScope.APPLICATION);
					storageService.store(
						TRUSTED_DOMAINS_STORAGE_KEY,
						JSON.stringify([...trustedDomains, itemToTrust]),
						StorageScope.APPLICATION,
						StorageTarget.USER
					);

					return [...trustedDomains, itemToTrust];
				}
			}
		}
	}

	return [];
}

export interface IStaticTrustedDomains {
	readonly defaultTrustedDomains: string[];
	readonly trustedDomains: string[];
}

export async function readTrustedDomains(accessor: ServicesAccessor): Promise<IStaticTrustedDomains> {
	const { defaultTrustedDomains, trustedDomains } = readStaticTrustedDomains(accessor);
	return {
		defaultTrustedDomains,
		trustedDomains,
	};
}

export function readStaticTrustedDomains(accessor: ServicesAccessor): IStaticTrustedDomains {
	const storageService = accessor.get(IStorageService);
	const productService = accessor.get(IProductService);
	const environmentService = accessor.get(IBrowserWorkbenchEnvironmentService);

	const defaultTrustedDomains = [
		...productService.linkProtectionTrustedDomains ?? [],
		...environmentService.options?.additionalTrustedDomains ?? []
	];

	let trustedDomains: string[] = [];
	try {
		const trustedDomainsSrc = storageService.get(TRUSTED_DOMAINS_STORAGE_KEY, StorageScope.APPLICATION);
		if (trustedDomainsSrc) {
			trustedDomains = JSON.parse(trustedDomainsSrc);
		}
	} catch (err) { }

	return {
		defaultTrustedDomains,
		trustedDomains,
	};
}
