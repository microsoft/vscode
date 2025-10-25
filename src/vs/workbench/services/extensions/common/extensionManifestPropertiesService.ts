/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionManifest, ExtensionUntrustedWorkspaceSupportType, ExtensionVirtualWorkspaceSupportType, IExtensionIdentifier, ALL_EXTENSION_KINDS, ExtensionIdentifierMap } from '../../../../platform/extensions/common/extensions.js';
import { ExtensionKind } from '../../../../platform/environment/common/environment.js';
import { ExtensionsRegistry } from './extensionsRegistry.js';
import { getGalleryExtensionId } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ExtensionUntrustedWorkspaceSupport } from '../../../../base/common/product.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { WORKSPACE_TRUST_EXTENSION_SUPPORT } from '../../workspaces/common/workspaceTrust.js';
import { isBoolean } from '../../../../base/common/types.js';
import { IWorkspaceTrustEnablementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { isWeb } from '../../../../base/common/platform.js';

export const IExtensionManifestPropertiesService = createDecorator<IExtensionManifestPropertiesService>('extensionManifestPropertiesService');

export interface IExtensionManifestPropertiesService {
	readonly _serviceBrand: undefined;

	prefersExecuteOnUI(manifest: IExtensionManifest): boolean;
	prefersExecuteOnWorkspace(manifest: IExtensionManifest): boolean;
	prefersExecuteOnWeb(manifest: IExtensionManifest): boolean;

	canExecuteOnUI(manifest: IExtensionManifest): boolean;
	canExecuteOnWorkspace(manifest: IExtensionManifest): boolean;
	canExecuteOnWeb(manifest: IExtensionManifest): boolean;

	getExtensionKind(manifest: IExtensionManifest): ExtensionKind[];
	getUserConfiguredExtensionKind(extensionIdentifier: IExtensionIdentifier): ExtensionKind[] | undefined;
	getExtensionUntrustedWorkspaceSupportType(manifest: IExtensionManifest): ExtensionUntrustedWorkspaceSupportType;
	getExtensionVirtualWorkspaceSupportType(manifest: IExtensionManifest): ExtensionVirtualWorkspaceSupportType;
}

export class ExtensionManifestPropertiesService extends Disposable implements IExtensionManifestPropertiesService {

	readonly _serviceBrand: undefined;

	private _extensionPointExtensionKindsMap: Map<string, ExtensionKind[]> | null = null;
	private _productExtensionKindsMap: ExtensionIdentifierMap<ExtensionKind[]> | null = null;
	private _configuredExtensionKindsMap: ExtensionIdentifierMap<ExtensionKind | ExtensionKind[]> | null = null;

	private _productVirtualWorkspaceSupportMap: ExtensionIdentifierMap<{ default?: boolean; override?: boolean }> | null = null;
	private _configuredVirtualWorkspaceSupportMap: ExtensionIdentifierMap<boolean> | null = null;

	private readonly _configuredExtensionWorkspaceTrustRequestMap: ExtensionIdentifierMap<{ supported: ExtensionUntrustedWorkspaceSupportType; version?: string }>;
	private readonly _productExtensionWorkspaceTrustRequestMap: Map<string, ExtensionUntrustedWorkspaceSupport>;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceTrustEnablementService private readonly workspaceTrustEnablementService: IWorkspaceTrustEnablementService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Workspace trust request type (settings.json)
		this._configuredExtensionWorkspaceTrustRequestMap = new ExtensionIdentifierMap<{ supported: ExtensionUntrustedWorkspaceSupportType; version?: string }>();
		const configuredExtensionWorkspaceTrustRequests = configurationService.inspect<{ [key: string]: { supported: ExtensionUntrustedWorkspaceSupportType; version?: string } }>(WORKSPACE_TRUST_EXTENSION_SUPPORT).userValue || {};
		for (const id of Object.keys(configuredExtensionWorkspaceTrustRequests)) {
			this._configuredExtensionWorkspaceTrustRequestMap.set(id, configuredExtensionWorkspaceTrustRequests[id]);
		}

		// Workspace trust request type (product.json)
		this._productExtensionWorkspaceTrustRequestMap = new Map<string, ExtensionUntrustedWorkspaceSupport>();
		if (productService.extensionUntrustedWorkspaceSupport) {
			for (const id of Object.keys(productService.extensionUntrustedWorkspaceSupport)) {
				this._productExtensionWorkspaceTrustRequestMap.set(id, productService.extensionUntrustedWorkspaceSupport[id]);
			}
		}
	}

	prefersExecuteOnUI(manifest: IExtensionManifest): boolean {
		const extensionKind = this.getExtensionKind(manifest);
		return (extensionKind.length > 0 && extensionKind[0] === 'ui');
	}

	prefersExecuteOnWorkspace(manifest: IExtensionManifest): boolean {
		const extensionKind = this.getExtensionKind(manifest);
		return (extensionKind.length > 0 && extensionKind[0] === 'workspace');
	}

	prefersExecuteOnWeb(manifest: IExtensionManifest): boolean {
		const extensionKind = this.getExtensionKind(manifest);
		return (extensionKind.length > 0 && extensionKind[0] === 'web');
	}

	canExecuteOnUI(manifest: IExtensionManifest): boolean {
		const extensionKind = this.getExtensionKind(manifest);
		return extensionKind.some(kind => kind === 'ui');
	}

	canExecuteOnWorkspace(manifest: IExtensionManifest): boolean {
		const extensionKind = this.getExtensionKind(manifest);
		return extensionKind.some(kind => kind === 'workspace');
	}

	canExecuteOnWeb(manifest: IExtensionManifest): boolean {
		const extensionKind = this.getExtensionKind(manifest);
		return extensionKind.some(kind => kind === 'web');
	}

	getExtensionKind(manifest: IExtensionManifest): ExtensionKind[] {
		const deducedExtensionKind = this.deduceExtensionKind(manifest);
		const configuredExtensionKind = this.getConfiguredExtensionKind(manifest);

		if (configuredExtensionKind && configuredExtensionKind.length > 0) {
			const result: ExtensionKind[] = [];
			for (const extensionKind of configuredExtensionKind) {
				if (extensionKind !== '-web') {
					result.push(extensionKind);
				}
			}

			// If opted out from web without specifying other extension kinds then default to ui, workspace
			if (configuredExtensionKind.includes('-web') && !result.length) {
				result.push('ui');
				result.push('workspace');
			}

			// Add web kind if not opted out from web and can run in web
			if (isWeb && !configuredExtensionKind.includes('-web') && !configuredExtensionKind.includes('web') && deducedExtensionKind.includes('web')) {
				result.push('web');
			}

			return result;
		}

		return deducedExtensionKind;
	}

	getUserConfiguredExtensionKind(extensionIdentifier: IExtensionIdentifier): ExtensionKind[] | undefined {
		if (this._configuredExtensionKindsMap === null) {
			const configuredExtensionKindsMap = new ExtensionIdentifierMap<ExtensionKind | ExtensionKind[]>();
			const configuredExtensionKinds = this.configurationService.getValue<{ [key: string]: ExtensionKind | ExtensionKind[] }>('remote.extensionKind') || {};
			for (const id of Object.keys(configuredExtensionKinds)) {
				configuredExtensionKindsMap.set(id, configuredExtensionKinds[id]);
			}
			this._configuredExtensionKindsMap = configuredExtensionKindsMap;
		}

		const userConfiguredExtensionKind = this._configuredExtensionKindsMap.get(extensionIdentifier.id);
		return userConfiguredExtensionKind ? this.toArray(userConfiguredExtensionKind) : undefined;
	}

	getExtensionUntrustedWorkspaceSupportType(manifest: IExtensionManifest): ExtensionUntrustedWorkspaceSupportType {
		// Workspace trust feature is disabled, or extension has no entry point
		if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled() || !manifest.main) {
			return true;
		}

		// Get extension workspace trust requirements from settings.json
		const configuredWorkspaceTrustRequest = this.getConfiguredExtensionWorkspaceTrustRequest(manifest);

		// Get extension workspace trust requirements from product.json
		const productWorkspaceTrustRequest = this.getProductExtensionWorkspaceTrustRequest(manifest);

		// Use settings.json override value if it exists
		if (configuredWorkspaceTrustRequest !== undefined) {
			return configuredWorkspaceTrustRequest;
		}

		// Use product.json override value if it exists
		if (productWorkspaceTrustRequest?.override !== undefined) {
			return productWorkspaceTrustRequest.override;
		}

		// Use extension manifest value if it exists
		if (manifest.capabilities?.untrustedWorkspaces?.supported !== undefined) {
			return manifest.capabilities.untrustedWorkspaces.supported;
		}

		// Use product.json default value if it exists
		if (productWorkspaceTrustRequest?.default !== undefined) {
			return productWorkspaceTrustRequest.default;
		}

		return false;
	}

	getExtensionVirtualWorkspaceSupportType(manifest: IExtensionManifest): ExtensionVirtualWorkspaceSupportType {
		// check user configured
		const userConfiguredVirtualWorkspaceSupport = this.getConfiguredVirtualWorkspaceSupport(manifest);
		if (userConfiguredVirtualWorkspaceSupport !== undefined) {
			return userConfiguredVirtualWorkspaceSupport;
		}

		const productConfiguredWorkspaceSchemes = this.getProductVirtualWorkspaceSupport(manifest);

		// check override from product
		if (productConfiguredWorkspaceSchemes?.override !== undefined) {
			return productConfiguredWorkspaceSchemes.override;
		}

		// check the manifest
		const virtualWorkspaces = manifest.capabilities?.virtualWorkspaces;
		if (isBoolean(virtualWorkspaces)) {
			return virtualWorkspaces;
		} else if (virtualWorkspaces) {
			const supported = virtualWorkspaces.supported;
			if (isBoolean(supported) || supported === 'limited') {
				return supported;
			}
		}

		// check default from product
		if (productConfiguredWorkspaceSchemes?.default !== undefined) {
			return productConfiguredWorkspaceSchemes.default;
		}

		// Default - supports virtual workspace
		return true;
	}

	private deduceExtensionKind(manifest: IExtensionManifest): ExtensionKind[] {
		// Not an UI extension if it has main
		if (manifest.main) {
			if (manifest.browser) {
				return isWeb ? ['workspace', 'web'] : ['workspace'];
			}
			return ['workspace'];
		}

		if (manifest.browser) {
			return ['web'];
		}

		let result = [...ALL_EXTENSION_KINDS];

		if (isNonEmptyArray(manifest.extensionPack) || isNonEmptyArray(manifest.extensionDependencies)) {
			// Extension pack defaults to [workspace, web] in web and only [workspace] in desktop
			result = isWeb ? ['workspace', 'web'] : ['workspace'];
		}

		if (manifest.contributes) {
			for (const contribution of Object.keys(manifest.contributes)) {
				const supportedExtensionKinds = this.getSupportedExtensionKindsForExtensionPoint(contribution);
				if (supportedExtensionKinds.length) {
					result = result.filter(extensionKind => supportedExtensionKinds.includes(extensionKind));
				}
			}
		}

		if (!result.length) {
			this.logService.warn('Cannot deduce extensionKind for extension', getGalleryExtensionId(manifest.publisher, manifest.name));
		}

		return result;
	}

	private getSupportedExtensionKindsForExtensionPoint(extensionPoint: string): ExtensionKind[] {
		if (this._extensionPointExtensionKindsMap === null) {
			const extensionPointExtensionKindsMap = new Map<string, ExtensionKind[]>();
			ExtensionsRegistry.getExtensionPoints().forEach(e => extensionPointExtensionKindsMap.set(e.name, e.defaultExtensionKind || [] /* supports all */));
			this._extensionPointExtensionKindsMap = extensionPointExtensionKindsMap;
		}

		let extensionPointExtensionKind = this._extensionPointExtensionKindsMap.get(extensionPoint);
		if (extensionPointExtensionKind) {
			return extensionPointExtensionKind;
		}

		extensionPointExtensionKind = this.productService.extensionPointExtensionKind ? this.productService.extensionPointExtensionKind[extensionPoint] : undefined;
		if (extensionPointExtensionKind) {
			return extensionPointExtensionKind;
		}

		/* Unknown extension point */
		return isWeb ? ['workspace', 'web'] : ['workspace'];
	}

	private getConfiguredExtensionKind(manifest: IExtensionManifest): (ExtensionKind | '-web')[] | null {
		const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };

		// check in config
		let result: ExtensionKind | ExtensionKind[] | undefined = this.getUserConfiguredExtensionKind(extensionIdentifier);
		if (typeof result !== 'undefined') {
			return this.toArray(result);
		}

		// check product.json
		result = this.getProductExtensionKind(manifest);
		if (typeof result !== 'undefined') {
			return result;
		}

		// check the manifest itself
		result = manifest.extensionKind;
		if (typeof result !== 'undefined') {
			result = this.toArray(result);
			return result.filter(r => ['ui', 'workspace'].includes(r));
		}

		return null;
	}

	private getProductExtensionKind(manifest: IExtensionManifest): ExtensionKind[] | undefined {
		if (this._productExtensionKindsMap === null) {
			const productExtensionKindsMap = new ExtensionIdentifierMap<ExtensionKind[]>();
			if (this.productService.extensionKind) {
				for (const id of Object.keys(this.productService.extensionKind)) {
					productExtensionKindsMap.set(id, this.productService.extensionKind[id]);
				}
			}
			this._productExtensionKindsMap = productExtensionKindsMap;
		}

		const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
		return this._productExtensionKindsMap.get(extensionId);
	}

	private getProductVirtualWorkspaceSupport(manifest: IExtensionManifest): { default?: boolean; override?: boolean } | undefined {
		if (this._productVirtualWorkspaceSupportMap === null) {
			const productWorkspaceSchemesMap = new ExtensionIdentifierMap<{ default?: boolean; override?: boolean }>();
			if (this.productService.extensionVirtualWorkspacesSupport) {
				for (const id of Object.keys(this.productService.extensionVirtualWorkspacesSupport)) {
					productWorkspaceSchemesMap.set(id, this.productService.extensionVirtualWorkspacesSupport[id]);
				}
			}
			this._productVirtualWorkspaceSupportMap = productWorkspaceSchemesMap;
		}

		const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
		return this._productVirtualWorkspaceSupportMap.get(extensionId);
	}

	private getConfiguredVirtualWorkspaceSupport(manifest: IExtensionManifest): boolean | undefined {
		if (this._configuredVirtualWorkspaceSupportMap === null) {
			const configuredWorkspaceSchemesMap = new ExtensionIdentifierMap<boolean>();
			const configuredWorkspaceSchemes = this.configurationService.getValue<{ [key: string]: boolean }>('extensions.supportVirtualWorkspaces') || {};
			for (const id of Object.keys(configuredWorkspaceSchemes)) {
				if (configuredWorkspaceSchemes[id] !== undefined) {
					configuredWorkspaceSchemesMap.set(id, configuredWorkspaceSchemes[id]);
				}
			}
			this._configuredVirtualWorkspaceSupportMap = configuredWorkspaceSchemesMap;
		}

		const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
		return this._configuredVirtualWorkspaceSupportMap.get(extensionId);
	}

	private getConfiguredExtensionWorkspaceTrustRequest(manifest: IExtensionManifest): ExtensionUntrustedWorkspaceSupportType | undefined {
		const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
		const extensionWorkspaceTrustRequest = this._configuredExtensionWorkspaceTrustRequestMap.get(extensionId);

		if (extensionWorkspaceTrustRequest && (extensionWorkspaceTrustRequest.version === undefined || extensionWorkspaceTrustRequest.version === manifest.version)) {
			return extensionWorkspaceTrustRequest.supported;
		}

		return undefined;
	}

	private getProductExtensionWorkspaceTrustRequest(manifest: IExtensionManifest): ExtensionUntrustedWorkspaceSupport | undefined {
		const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
		return this._productExtensionWorkspaceTrustRequestMap.get(extensionId);
	}

	private toArray(extensionKind: ExtensionKind | ExtensionKind[]): ExtensionKind[] {
		if (Array.isArray(extensionKind)) {
			return extensionKind;
		}
		return extensionKind === 'ui' ? ['ui', 'workspace'] : [extensionKind];
	}
}

registerSingleton(IExtensionManifestPropertiesService, ExtensionManifestPropertiesService, InstantiationType.Delayed);
