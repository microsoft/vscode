/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBuiltinExtensionsScannerService, ExtensionType, IExtensionManifest, TargetPlatform, IExtension } from 'vs/platform/extensions/common/extensions';
import { isWeb, Language } from 'vs/base/common/platform';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { FileAccess } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITranslations, localizeManifest } from 'vs/platform/extensionManagement/common/extensionNls';
import { ILogService } from 'vs/platform/log/common/log';

interface IBundledExtension {
	extensionPath: string;
	packageJSON: IExtensionManifest;
	packageNLS?: any;
	browserNlsMetadataPath?: string;
	readmePath?: string;
	changelogPath?: string;
}

export class BuiltinExtensionsScannerService implements IBuiltinExtensionsScannerService {

	declare readonly _serviceBrand: undefined;

	private readonly builtinExtensionsPromises: Promise<IExtension>[] = [];

	private nlsUrl: URI | undefined;

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IExtensionResourceLoaderService private readonly extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IProductService productService: IProductService,
		@ILogService private readonly logService: ILogService
	) {
		if (isWeb) {
			const nlsBaseUrl = productService.extensionsGallery?.nlsBaseUrl;
			// Only use the nlsBaseUrl if we are using a language other than the default, English.
			if (nlsBaseUrl && productService.commit && !Language.isDefaultVariant()) {
				this.nlsUrl = URI.joinPath(URI.parse(nlsBaseUrl), productService.commit, productService.version, Language.value());
			}

			const builtinExtensionsServiceUrl = FileAccess.asBrowserUri('../../../../../../extensions', require);
			if (builtinExtensionsServiceUrl) {
				let bundledExtensions: IBundledExtension[] = [];

				if (environmentService.isBuilt) {
					// Built time configuration (do NOT modify)
					bundledExtensions = [/*BUILD->INSERT_BUILTIN_EXTENSIONS*/];
				} else {
					// Find builtin extensions by checking for DOM
					const builtinExtensionsElement = document.getElementById('vscode-workbench-builtin-extensions');
					const builtinExtensionsElementAttribute = builtinExtensionsElement ? builtinExtensionsElement.getAttribute('data-settings') : undefined;
					if (builtinExtensionsElementAttribute) {
						try {
							bundledExtensions = JSON.parse(builtinExtensionsElementAttribute);
						} catch (error) { /* ignore error*/ }
					}
				}

				this.builtinExtensionsPromises = bundledExtensions.map(async e => {
					const id = getGalleryExtensionId(e.packageJSON.publisher, e.packageJSON.name);
					const browserNlsBundleUris: { [language: string]: URI } = {};
					if (e.browserNlsMetadataPath) {
						if (this.nlsUrl) {
							browserNlsBundleUris[Language.value()] = uriIdentityService.extUri.joinPath(this.nlsUrl, id, 'main');
						}
						browserNlsBundleUris.en = uriIdentityService.extUri.resolvePath(builtinExtensionsServiceUrl!, e.browserNlsMetadataPath);
					}
					return {
						identifier: { id },
						location: uriIdentityService.extUri.joinPath(builtinExtensionsServiceUrl!, e.extensionPath),
						type: ExtensionType.System,
						isBuiltin: true,
						browserNlsBundleUris,
						manifest: e.packageNLS ? await this.localizeManifest(id, e.packageJSON, e.packageNLS) : e.packageJSON,
						readmeUrl: e.readmePath ? uriIdentityService.extUri.joinPath(builtinExtensionsServiceUrl!, e.readmePath) : undefined,
						changelogUrl: e.changelogPath ? uriIdentityService.extUri.joinPath(builtinExtensionsServiceUrl!, e.changelogPath) : undefined,
						targetPlatform: TargetPlatform.WEB,
						validations: [],
						isValid: true
					};
				});
			}
		}
	}

	async scanBuiltinExtensions(): Promise<IExtension[]> {
		return [...await Promise.all(this.builtinExtensionsPromises)];
	}

	private async localizeManifest(extensionId: string, manifest: IExtensionManifest, fallbackTranslations: ITranslations): Promise<IExtensionManifest> {
		if (!this.nlsUrl) {
			return localizeManifest(manifest, fallbackTranslations);
		}
		// the `package` endpoint returns the translations in a key-value format similar to the package.nls.json file.
		const uri = URI.joinPath(this.nlsUrl, extensionId, 'package');
		try {
			const res = await this.extensionResourceLoaderService.readExtensionResource(uri);
			const json = JSON.parse(res.toString());
			return localizeManifest(manifest, json, fallbackTranslations);
		} catch (e) {
			this.logService.error(e);
			return localizeManifest(manifest, fallbackTranslations);
		}
	}
}

registerSingleton(IBuiltinExtensionsScannerService, BuiltinExtensionsScannerService, true);
