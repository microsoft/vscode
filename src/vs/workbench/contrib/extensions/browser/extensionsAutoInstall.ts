/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IExtensionGalleryService, IExtensionManagementService, EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

export class ExtensionsAutoInstallContribution implements IWorkbenchContribution {
	constructor(
		@IProductService private readonly productService: IProductService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@ILogService private readonly logService: ILogService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		this.autoInstallExtensions();
	}

	private async autoInstallExtensions(): Promise<void> {
		const extensionsToAutoInstall = await this.resolveExtensionsToInstall();
		if (!extensionsToAutoInstall.length) {
			return;
		}

		const installed = await this.extensionManagementService.getInstalled();
		const toInstall = extensionsToAutoInstall.filter(id =>
			!installed.some(e => areSameExtensions(e.identifier, { id }))
		);

		if (!toInstall.length) {
			return;
		}

		this.logService.info(`Auto installing ${toInstall.length} extension(s): ${toInstall.join(', ')}`);

		const galleryExtensions = await this.extensionGalleryService.getExtensions(
			toInstall.map(id => ({ id })),
			CancellationToken.None
		);

		await Promise.allSettled(galleryExtensions.map(async gallery => {
			try {
				await this.extensionManagementService.installFromGallery(gallery, {
					isMachineScoped: true,
					context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true },
				});
				this.logService.info(`Successfully auto-installed extension: ${gallery.identifier.id}`);
			} catch (error) {
				this.logService.error(`Failed to auto-install extension '${gallery.identifier.id}': ${error}`);
			}
		}));
	}

	private async resolveExtensionsToInstall(): Promise<string[]> {
		const localList = this.productService.extensionsAutoInstall ?? [];

		const remoteUrl = this.productService.extensionsAutoInstallUrl;
		let remoteList: string[] = [];
		if (remoteUrl) {
			try {
				const context = await this.requestService.request({ url: remoteUrl, callSite: 'extensionsAutoInstall' }, CancellationToken.None);
				const result = await asJson<unknown[]>(context);
				if (Array.isArray(result)) {
					remoteList = result.filter(item => typeof item === 'string');
					this.logService.info(`Fetched ${remoteList.length} extension(s) from extensionsAutoInstallUrl`);
				} else {
					this.logService.warn(`extensionsAutoInstallUrl response is not an array`);
				}
			} catch (error) {
				this.logService.warn(`Failed to fetch extensionsAutoInstallUrl: ${error}`);
			}
		}

		const merged = [...new Set([...localList, ...remoteList])];
		if (merged.length) {
			this.logService.info(`Merged extension auto-install list (local: ${localList.length}, remote: ${remoteList.length}, total: ${merged.length})`);
		}
		return merged;
	}
}
