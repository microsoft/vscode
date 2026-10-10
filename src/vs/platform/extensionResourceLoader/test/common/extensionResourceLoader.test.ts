/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { ExtensionGalleryAuthorizationService } from '../../../extensionManagement/common/extensionGalleryAuthorization.js';
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from '../../../extensionManagement/common/extensionGalleryManifest.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { InMemoryStorageService } from '../../../storage/common/storage.js';
import { AbstractExtensionResourceLoaderService } from '../../common/extensionResourceLoader.js';

class TestExtensionResourceLoaderService extends AbstractExtensionResourceLoaderService {

	async readExtensionResource(): Promise<string> {
		return '';
	}

	getRequestHeaders(resource: URI): Promise<Record<string, string>> {
		return this.getExtensionGalleryRequestHeaders(resource);
	}
}

suite('ExtensionResourceLoaderService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards the resource URL to marketplace authorization', async () => {
		const manifestService: IExtensionGalleryManifestService = {
			_serviceBrand: undefined,
			extensionGalleryManifestStatus: ExtensionGalleryManifestStatus.Available,
			onDidChangeExtensionGalleryManifestStatus: Event.None,
			onDidChangeExtensionGalleryManifest: Event.None,
			getExtensionGalleryManifest: async () => null,
		};
		const authorizationService = disposables.add(new ExtensionGalleryAuthorizationService());
		authorizationService.setAuthorization('resource-token', 'https://marketplace.example.com');
		const resource = URI.parse('https://marketplace.example.com/publisher/extension/themes/theme.json');
		const productService: IProductService = { _serviceBrand: undefined, ...product };
		const clientName = `${productService.applicationName}${isWeb ? '-web' : ''}`;
		const service = disposables.add(new TestExtensionResourceLoaderService(
			new class extends mock<IFileService>() { }(),
			disposables.add(new InMemoryStorageService()),
			productService,
			new class extends mock<IEnvironmentService>() { }(),
			new TestConfigurationService(),
			manifestService,
			authorizationService,
			new NullLogService(),
		));

		const headers = await Promise.all([
			resource,
			URI.parse('https://marketplace.visualstudio.com/publisher/extension/themes/theme.json'),
			URI.parse('https://assets.example.com/publisher/extension/themes/theme.json'),
			resource.with({ scheme: 'http' }),
		].map(uri => service.getRequestHeaders(uri)));

		assert.deepStrictEqual(headers.map(header => ({
			authorization: header.Authorization,
			clientName: header['X-Client-Name'],
			clientVersion: header['X-Client-Version'],
		})), [
			{ authorization: 'Bearer resource-token', clientName, clientVersion: productService.version },
			{ authorization: undefined, clientName, clientVersion: productService.version },
			{ authorization: undefined, clientName, clientVersion: productService.version },
			{ authorization: undefined, clientName, clientVersion: productService.version },
		]);
	});
});
