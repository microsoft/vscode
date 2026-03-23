/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { isEqual } from '../../../../base/common/resources.js';
import { createScanner, SyntaxKind } from '../../../../base/common/json.js';

const TRUSTED_DOMAINS_URI = URI.parse('trustedDomains:/Trusted Domains');

export const TRUSTED_DOMAINS_STORAGE_KEY = 'http.linkProtectionTrustedDomains';
export const TRUSTED_DOMAINS_CONTENT_STORAGE_KEY = 'http.linkProtectionTrustedDomainsContent';

async function openInEditor(editorService: IEditorService, resource: URI): Promise<void> {
	await editorService.openEditor({
		resource,
		languageId: 'jsonc',
		options: { pinned: true }
	});

	const editor = editorService.activeTextEditorControl;
	if (!isCodeEditor(editor)) {
		return;
	}

	const model = editor.getModel();
	if (!model || !isEqual(model.uri, resource)) {
		return;
	}

	// Find first token after [ to place cursor there
	const scanner = createScanner(model.getValue(), true);
	let offset: number | undefined;
	for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
		if (token === SyntaxKind.OpenBracketToken) {
			offset = scanner.getTokenOffset() + scanner.getTokenLength();
			const nextToken = scanner.scan();
			if (nextToken !== SyntaxKind.EOF && nextToken !== SyntaxKind.CloseBracketToken) {
				offset = scanner.getTokenOffset();
			}
			break;
		}
	}

	if (offset !== undefined) {
		const position = model.getPositionAt(offset);
		editor.setPosition(position);
		editor.revealPositionInCenter(position);
	}
}

export const manageTrustedDomainSettingsCommand = {
	id: 'workbench.action.manageTrustedDomain',
	description: {
		description: localize2('trustedDomain.manageTrustedDomain', 'Manage Trusted Domains'),
		args: []
	},
	handler: async (accessor: ServicesAccessor) => {
		const editorService = accessor.get(IEditorService);
		await openInEditor(editorService, TRUSTED_DOMAINS_URI);
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
			case 'manage': {
				const uriWithFragment = TRUSTED_DOMAINS_URI.with({ fragment: resource.toString() });
				await openInEditor(editorService, uriWithFragment);
				return trustedDomains;
			}
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
