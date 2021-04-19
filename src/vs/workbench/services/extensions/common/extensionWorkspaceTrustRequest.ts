/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ExtensionWorkspaceTrustRequest } from 'vs/base/common/product';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionIdentifier, ExtensionWorkspaceTrustRequestType, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/productService';
import { isWorkspaceTrustEnabled, WORKSPACE_TRUST_EXTENSION_REQUEST } from 'vs/workbench/services/workspaces/common/workspaceTrust';

export const IExtensionWorkspaceTrustRequestService = createDecorator<IExtensionWorkspaceTrustRequestService>('extensionWorkspaceTrustRequestService');

export interface IExtensionWorkspaceTrustRequestService {
	readonly _serviceBrand: undefined;

	getExtensionWorkspaceTrustRequestType(manifest: IExtensionManifest): ExtensionWorkspaceTrustRequestType;
}

export class ExtensionWorkspaceTrustRequestService extends Disposable implements IExtensionWorkspaceTrustRequestService {
	_serviceBrand: undefined;

	private readonly _configuredExtensionWorkspaceTrustRequestMap: Map<string, { request: ExtensionWorkspaceTrustRequestType, version?: string }>;
	private readonly _productExtensionWorkspaceTrustRequestMap: Map<string, ExtensionWorkspaceTrustRequest>;

	constructor(
		@IProductService productService: IProductService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		// Settings.json
		this._configuredExtensionWorkspaceTrustRequestMap = new Map<string, { request: ExtensionWorkspaceTrustRequestType, version?: string }>();
		const configuredExtensionWorkspaceTrustRequests = configurationService.inspect<{ [key: string]: { request: ExtensionWorkspaceTrustRequestType, version?: string } }>(WORKSPACE_TRUST_EXTENSION_REQUEST).userValue || {};
		for (const id of Object.keys(configuredExtensionWorkspaceTrustRequests)) {
			this._configuredExtensionWorkspaceTrustRequestMap.set(ExtensionIdentifier.toKey(id), configuredExtensionWorkspaceTrustRequests[id]);
		}

		// Products.json
		this._productExtensionWorkspaceTrustRequestMap = new Map<string, ExtensionWorkspaceTrustRequest>();
		if (productService.extensionWorkspaceTrustRequest) {
			for (const id of Object.keys(productService.extensionWorkspaceTrustRequest)) {
				this._productExtensionWorkspaceTrustRequestMap.set(ExtensionIdentifier.toKey(id), productService.extensionWorkspaceTrustRequest[id]);
			}
		}
	}

	private getConfiguredExtensionWorkspaceTrustRequest(manifest: IExtensionManifest): ExtensionWorkspaceTrustRequestType | undefined {
		const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
		const extensionWorkspaceTrustRequest = this._configuredExtensionWorkspaceTrustRequestMap.get(ExtensionIdentifier.toKey(extensionId));

		if (extensionWorkspaceTrustRequest && (extensionWorkspaceTrustRequest.version === undefined || extensionWorkspaceTrustRequest.version === manifest.version)) {
			return extensionWorkspaceTrustRequest.request;
		}

		return undefined;
	}

	private getProductExtensionWorkspaceTrustRequest(manifest: IExtensionManifest): ExtensionWorkspaceTrustRequest | undefined {
		const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
		return this._productExtensionWorkspaceTrustRequestMap.get(ExtensionIdentifier.toKey(extensionId));
	}

	getExtensionWorkspaceTrustRequestType(manifest: IExtensionManifest): ExtensionWorkspaceTrustRequestType {
		// Workspace trust feature is disabled, or extension has no entry point
		if (!isWorkspaceTrustEnabled(this.configurationService) || !manifest.main) {
			return 'never';
		}

		// Get extension workspace trust requirements from settings.json
		const configuredWorkspaceTrustRequest = this.getConfiguredExtensionWorkspaceTrustRequest(manifest);

		// Get extension workspace trust requirements from product.json
		const productWorkspaceTrustRequest = this.getProductExtensionWorkspaceTrustRequest(manifest);

		// Use settings.json override value if it exists
		if (configuredWorkspaceTrustRequest) {
			return configuredWorkspaceTrustRequest;
		}

		// Use product.json override value if it exists
		if (productWorkspaceTrustRequest?.override) {
			return productWorkspaceTrustRequest.override;
		}

		// Use extension manifest value if it exists
		if (manifest.workspaceTrust?.request !== undefined) {
			return manifest.workspaceTrust.request;
		}

		// Use product.json default value if it exists
		if (productWorkspaceTrustRequest?.default) {
			return productWorkspaceTrustRequest.default;
		}

		return 'onStart';
	}
}

registerSingleton(IExtensionWorkspaceTrustRequestService, ExtensionWorkspaceTrustRequestService);
