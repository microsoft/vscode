/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { isUUID } from 'vs/base/common/uuid';
import { mock } from 'vs/base/test/common/mock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { resolveMarketplaceHeaders } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { NullLogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { InMemoryStorageService, IStorageService } from 'vs/platform/storage/common/storage';

class EnvironmentServiceMock extends mock<IEnvironmentService>() {
	override readonly serviceMachineIdResource: URI;
	constructor(serviceMachineIdResource: URI) {
		super();
		this.serviceMachineIdResource = serviceMachineIdResource;
	}
}

suite('Extension Gallery Service', () => {
	const disposables: DisposableStore = new DisposableStore();
	let fileService: IFileService, environmentService: IEnvironmentService, storageService: IStorageService, productService: IProductService, configurationService: IConfigurationService;

	setup(() => {
		const serviceMachineIdResource = joinPath(URI.file('tests').with({ scheme: 'vscode-tests' }), 'machineid');
		environmentService = new EnvironmentServiceMock(serviceMachineIdResource);
		fileService = disposables.add(new FileService(new NullLogService()));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		fileService.registerProvider(serviceMachineIdResource.scheme, fileSystemProvider);
		storageService = new InMemoryStorageService();
		configurationService = new TestConfigurationService();
		productService = { _serviceBrand: undefined, ...product };
	});

	teardown(() => disposables.clear());

	test('marketplace machine id', async () => {
		const headers = await resolveMarketplaceHeaders(product.version, productService, environmentService, configurationService, fileService, storageService);
		assert.ok(isUUID(headers['X-Market-User-Id']));
		const headers2 = await resolveMarketplaceHeaders(product.version, productService, environmentService, configurationService, fileService, storageService);
		assert.strictEqual(headers['X-Market-User-Id'], headers2['X-Market-User-Id']);
	});
});
