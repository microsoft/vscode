/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { isWeb } from '../../../../base/common/platform.js';
import * as resources from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { ExtensionGalleryManifestStatus, ExtensionGalleryResourceType, IExtensionGalleryManifest, IExtensionGalleryManifestService } from '../../../extensionManagement/common/extensionGalleryManifest.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { IRequestService } from '../../../request/common/request.js';
import { InMemoryStorageService } from '../../../storage/common/storage.js';
import { ExtensionResourceLoaderService } from '../../common/extensionResourceLoaderService.js';

suite('ExtensionResourceLoaderService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('applies actual catalog changes and retraction instead of retaining bootstrap resources', async () => {
		const changed = disposables.add(new Emitter<IExtensionGalleryManifest | null>());
		const catalog = (host: string): IExtensionGalleryManifest => ({
			version: '1',
			resources: [{ id: `https://${host}/{publisher}/{name}/{version}/{path}`, type: ExtensionGalleryResourceType.ExtensionResourceUri }],
			capabilities: { extensionQuery: {} },
		});
		let manifest: IExtensionGalleryManifest | null = catalog('first.marketplace.example');
		const manifestService: IExtensionGalleryManifestService = {
			_serviceBrand: undefined,
			extensionGalleryManifestStatus: ExtensionGalleryManifestStatus.Available,
			onDidChangeExtensionGalleryManifestStatus: Event.None,
			onDidChangeExtensionGalleryManifest: changed.event,
			getExtensionGalleryManifest: async () => manifest,
			getAccessToken: async () => undefined,
			refreshAccessToken: async () => false,
		};
		const service = disposables.add(new ExtensionResourceLoaderService(
			new class extends mock<IFileService>() { }(),
			disposables.add(new InMemoryStorageService()),
			{ _serviceBrand: undefined, ...product },
			new class extends mock<IEnvironmentService>() { }(),
			new TestConfigurationService(),
			manifestService,
			new class extends mock<IRequestService>() { }(),
			new NullLogService(),
		));
		const extension = { publisher: 'publisher', name: 'extension', version: '1.0.0' };
		const initial = await service.getExtensionGalleryResourceURL(extension);
		manifest = catalog('second.marketplace.example');
		changed.fire(manifest);
		const updated = await service.getExtensionGalleryResourceURL(extension);
		manifest = null;
		changed.fire(null);
		assert.deepStrictEqual({
			initial: initial?.authority, updated: updated?.authority,
			retracted: await service.getExtensionGalleryResourceURL(extension),
			supportsResources: await service.supportsExtensionGalleryResources(),
		}, { initial: 'first.marketplace.example', updated: 'second.marketplace.example', retracted: undefined, supportsResources: false });
	});

	test('authorizes marketplace theme resources on the private origin', async () => {
		const resourceUrlTemplate = 'https://marketplace.example.com/{publisher}/{name}/{version}/{path}';
		const manifestService: IExtensionGalleryManifestService = {
			_serviceBrand: undefined,
			extensionGalleryManifestStatus: ExtensionGalleryManifestStatus.Available,
			onDidChangeExtensionGalleryManifestStatus: Event.None,
			onDidChangeExtensionGalleryManifest: Event.None,
			getExtensionGalleryManifest: async () => ({
				version: '1.0',
				resources: [{ id: resourceUrlTemplate, type: ExtensionGalleryResourceType.ExtensionResourceUri }],
				capabilities: { extensionQuery: {} },
			}),
			getAccessToken: async targetUrl => URI.parse(targetUrl).authority === 'marketplace.example.com' ? 'resource-token' : undefined,
			refreshAccessToken: async () => false,
		};
		let requestOptions: IRequestOptions | undefined;
		const requestService = new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions) {
				requestOptions = options;
				return {
					res: { statusCode: 200, headers: {} },
					stream: bufferToStream(VSBuffer.fromString('{}')),
				};
			}
		}();
		const productService: IProductService = { _serviceBrand: undefined, ...product };
		const clientName = `${productService.applicationName}${isWeb ? '-web' : ''}`;
		const service = disposables.add(new ExtensionResourceLoaderService(
			new class extends mock<IFileService>() { }(),
			disposables.add(new InMemoryStorageService()),
			productService,
			new class extends mock<IEnvironmentService>() { }(),
			new TestConfigurationService(),
			manifestService,
			requestService,
			new NullLogService(),
		));

		const extensionLocation = await service.getExtensionGalleryResourceURL({ publisher: 'publisher', name: 'extension', version: '1.0.0' });
		assert.ok(extensionLocation);
		const packageJson = resources.joinPath(extensionLocation, 'package.json');
		await service.readExtensionResource(packageJson);

		assert.deepStrictEqual({
			url: requestOptions?.url,
			authorization: requestOptions?.headers?.Authorization,
			clientName: requestOptions?.headers?.['X-Client-Name'],
			clientVersion: requestOptions?.headers?.['X-Client-Version'],
		}, {
			url: packageJson.toString(),
			authorization: 'Bearer resource-token',
			clientName,
			clientVersion: productService.version,
		});
	});
});
