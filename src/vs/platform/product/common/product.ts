/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env } from '../../../base/common/process.js';
import { IProductConfiguration } from '../../../base/common/product.js';
import { ISandboxConfiguration } from '../../../base/parts/sandbox/common/sandboxTypes.js';
import { decodeProductUrl } from '../../../base/common/productEncoding.js';

/**
 * @deprecated It is preferred that you use `IProductService` if you can. This
 * allows web embedders to override our defaults. But for things like `product.quality`,
 * the use is fine because that property is not overridable.
 */
let product: IProductConfiguration;

// Native sandbox environment
const vscodeGlobal = (globalThis as { vscode?: { context?: { configuration(): ISandboxConfiguration | undefined } } }).vscode;
if (typeof vscodeGlobal !== 'undefined' && typeof vscodeGlobal.context !== 'undefined') {
	const configuration: ISandboxConfiguration | undefined = vscodeGlobal.context.configuration();
	if (configuration) {
		product = configuration.product;
	} else {
		throw new Error('Sandbox: unable to resolve product configuration from preload script.');
	}
}
// _VSCODE environment
else if (globalThis._VSCODE_PRODUCT_JSON && globalThis._VSCODE_PACKAGE_JSON) {
	// Obtain values from product.json and package.json-data
	product = globalThis._VSCODE_PRODUCT_JSON as unknown as IProductConfiguration;

	// Running out of sources
	if (env['VSCODE_DEV']) {
		Object.assign(product, {
			nameShort: `${product.nameShort} Dev`,
			nameLong: `${product.nameLong} Dev`,
			dataFolderName: `${product.dataFolderName}-dev`,
			serverDataFolderName: product.serverDataFolderName ? `${product.serverDataFolderName}-dev` : undefined
		});
	}

	// Version is added during built time, but we still
	// want to have it running out of sources so we
	// read it from package.json only when we need it.
	if (!product.version) {
		const pkg = globalThis._VSCODE_PACKAGE_JSON as { version: string };

		Object.assign(product, {
			version: pkg.version
		});
	}
}

// Web environment or unknown
else {

	// Built time configuration (do NOT modify)
	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	product = { /*BUILD->INSERT_PRODUCT_CONFIGURATION*/ } as unknown as IProductConfiguration;

	// Running out of sources
	if (Object.keys(product).length === 0) {
		Object.assign(product, {
			version: '1.104.0-dev',
			nameShort: 'Code - OSS Dev',
			nameLong: 'Code - OSS Dev',
			applicationName: 'code-oss',
			dataFolderName: '.vscode-oss',
			urlProtocol: 'code-oss',
			reportIssueUrl: 'https://github.com/microsoft/vscode/issues/new',
			licenseName: 'MIT',
			licenseUrl: 'https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
			serverLicenseUrl: 'https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
			defaultChatAgent: {
				extensionId: 'GitHub.copilot',
				chatExtensionId: 'GitHub.copilot-chat',
				provider: {
					default: {
						id: 'github',
						name: 'GitHub',
					},
					enterprise: {
						id: 'github-enterprise',
						name: 'GitHub Enterprise',
					}
				},
				providerScopes: []
			}
		});
	}
}

// test-workbench_change start - decode obfuscated URLs from product.json
if (product) {
	const decode = (v: string | undefined | null): string | undefined =>
		v ? decodeProductUrl(v) : undefined;

	const updates: Record<string, unknown> = {};

	if (product.updateUrl) {
		updates.updateUrl = decodeProductUrl(product.updateUrl);
	}

	if (product.extensionTelemetry) {
		updates.extensionTelemetry = {
			...product.extensionTelemetry,
			endpointUrl: decode(product.extensionTelemetry.endpointUrl),
			endpointHealthUrl: decode(product.extensionTelemetry.endpointHealthUrl),
		};
	}

	if (product.tsCodeBaseUrl) {
		updates.tsCodeBaseUrl = decode(product.tsCodeBaseUrl);
	}

	if (product.tsCodeGatewayBaseUrl) {
		updates.tsCodeGatewayBaseUrl = decode(product.tsCodeGatewayBaseUrl);
	}

	if (product.extensionsGallery) {
		const gallery = product.extensionsGallery as unknown as Record<string, string>;
		const decodedGallery: Record<string, string> = {};
		for (const key of ['serviceUrl', 'itemUrl', 'resourceUrlTemplate', 'publisherUrl']) {
			if (gallery[key]) {
				decodedGallery[key] = decodeProductUrl(gallery[key]);
			}
		}
		Object.assign(gallery, decodedGallery);
	}

	if (product.releaseNotesUrl) {
		updates.releaseNotesUrl = decode(product.releaseNotesUrl);
	}

	if (product.releaseNotesApiUrl) {
		updates.releaseNotesApiUrl = decode(product.releaseNotesApiUrl);
	}

	if (product.extensionsAutoInstallUrl) {
		updates.extensionsAutoInstallUrl = decode(product.extensionsAutoInstallUrl);
	}

	if (product.linkProtectionTrustedDomains) {
		updates.linkProtectionTrustedDomains = product.linkProtectionTrustedDomains.map(d => decode(d));
	}

	Object.assign(product, updates);
}
// test-workbench_change end

export default product;
