/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionType } from '../../../extensions/common/extensions.js';
import type { ILogger } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import { InstallOperation, type IExtensionGalleryService, type IExtensionManagementService, type IGalleryExtension, type ILocalExtension, type InstallExtensionInfo } from '../../common/extensionManagement.js';
import { ExtensionManagementCLI } from '../../common/extensionManagementCLI.js';

suite('ExtensionManagementCLI', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('updateExtensions reports the previous and updated versions', async () => {
		const installedExtension = {
			identifier: { id: 'publisher.extension', uuid: 'uuid' },
			manifest: { version: '1.0.0' },
			preRelease: false,
			isApplicationScoped: false,
			type: ExtensionType.User
		} as unknown as ILocalExtension;

		const galleryExtension = {
			identifier: installedExtension.identifier,
			version: '1.2.3'
		} as unknown as IGalleryExtension;

		const messages: string[] = [];
		const logger = {
			info: (message: string) => messages.push(message),
			trace: () => undefined,
			error: (message: string) => assert.fail(message)
		} as unknown as ILogger;

		const extensionManagementService = {
			async getInstalled() {
				return [installedExtension];
			},
			async installGalleryExtensions(extensionsToInstall: InstallExtensionInfo[]) {
				assert.strictEqual(extensionsToInstall.length, 1);
				assert.strictEqual(extensionsToInstall[0].extension, galleryExtension);

				return [{
					identifier: galleryExtension.identifier,
					operation: InstallOperation.Update,
					local: {
						...installedExtension,
						manifest: {
							...installedExtension.manifest,
							version: galleryExtension.version
						}
					}
				}];
			}
		} as unknown as IExtensionManagementService;

		const extensionGalleryService = {
			async getExtensions() {
				return [galleryExtension];
			}
		} as unknown as IExtensionGalleryService;

		const productService = { quality: 'stable', builtInExtensionsEnabledWithAutoUpdates: [] } as unknown as IProductService;
		const cli = new ExtensionManagementCLI([], logger, extensionManagementService, extensionGalleryService, productService);

		await cli.updateExtensions();

		assert.deepStrictEqual(messages, [
			'Updating extensions: publisher.extension',
			'Extension \'publisher.extension\' was successfully updated from v1.0.0 to v1.2.3.'
		]);
	});
});
