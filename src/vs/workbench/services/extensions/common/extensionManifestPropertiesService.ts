/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManifest, ExtensionKind, ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { IProductService } from 'vs/platform/product/common/productService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

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
}

export class ExtensionManifestPropertiesService implements IExtensionManifestPropertiesService {

	readonly _serviceBrand: undefined;

	private _uiExtensionPoints: Set<string> | null = null;
	private _productExtensionKindsMap: Map<string, ExtensionKind[]> | null = null;
	private _configuredExtensionKindsMap: Map<string, ExtensionKind | ExtensionKind[]> | null = null;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

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
		// check in config
		let result = this.getConfiguredExtensionKind(manifest);
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
			return this.toArray(result);
		}

		return this.deduceExtensionKind(manifest);
	}

	deduceExtensionKind(manifest: IExtensionManifest): ExtensionKind[] {
		// Not an UI extension if it has main
		if (manifest.main) {
			if (manifest.browser) {
				return ['workspace', 'web'];
			}
			return ['workspace'];
		}

		if (manifest.browser) {
			return ['web'];
		}

		// Not an UI nor web extension if it has dependencies or an extension pack
		if (isNonEmptyArray(manifest.extensionDependencies) || isNonEmptyArray(manifest.extensionPack)) {
			return ['workspace'];
		}

		if (manifest.contributes) {
			// Not an UI nor web extension if it has no ui contributions
			for (const contribution of Object.keys(manifest.contributes)) {
				if (!this.isUIExtensionPoint(contribution)) {
					return ['workspace'];
				}
			}
		}

		return ['ui', 'workspace', 'web'];
	}

	private isUIExtensionPoint(extensionPoint: string): boolean {
		if (this._uiExtensionPoints === null) {
			const uiExtensionPoints = new Set<string>();
			ExtensionsRegistry.getExtensionPoints().filter(e => e.defaultExtensionKind !== 'workspace').forEach(e => {
				uiExtensionPoints.add(e.name);
			});
			this._uiExtensionPoints = uiExtensionPoints;
		}
		return this._uiExtensionPoints.has(extensionPoint);
	}

	private getProductExtensionKind(manifest: IExtensionManifest): ExtensionKind[] | undefined {
		if (this._productExtensionKindsMap === null) {
			const productExtensionKindsMap = new Map<string, ExtensionKind[]>();
			if (this.productService.extensionKind) {
				for (const id of Object.keys(this.productService.extensionKind)) {
					productExtensionKindsMap.set(ExtensionIdentifier.toKey(id), this.productService.extensionKind[id]);
				}
			}
			this._productExtensionKindsMap = productExtensionKindsMap;
		}

		const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
		return this._productExtensionKindsMap.get(ExtensionIdentifier.toKey(extensionId));
	}

	private getConfiguredExtensionKind(manifest: IExtensionManifest): ExtensionKind | ExtensionKind[] | undefined {
		if (this._configuredExtensionKindsMap === null) {
			const configuredExtensionKindsMap = new Map<string, ExtensionKind | ExtensionKind[]>();
			const configuredExtensionKinds = this.configurationService.getValue<{ [key: string]: ExtensionKind | ExtensionKind[] }>('remote.extensionKind') || {};
			for (const id of Object.keys(configuredExtensionKinds)) {
				configuredExtensionKindsMap.set(ExtensionIdentifier.toKey(id), configuredExtensionKinds[id]);
			}
			this._configuredExtensionKindsMap = configuredExtensionKindsMap;
		}

		const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
		return this._configuredExtensionKindsMap.get(ExtensionIdentifier.toKey(extensionId));
	}

	private toArray(extensionKind: ExtensionKind | ExtensionKind[]): ExtensionKind[] {
		if (Array.isArray(extensionKind)) {
			return extensionKind;
		}
		return extensionKind === 'ui' ? ['ui', 'workspace'] : [extensionKind];
	}
}

registerSingleton(IExtensionManifestPropertiesService, ExtensionManifestPropertiesService);
