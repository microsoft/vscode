/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { ConfigurationService } from '../../../configuration/common/configurationService.js';
import { NativeEnvironmentService } from '../../../environment/node/environmentService.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { OPTIONS, parseArgs } from '../../../environment/node/argv.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { registerAgentHostNetworkServices } from '../../node/agentHostBootstrap.js';

class TestEnvironmentService extends NativeEnvironmentService {
	override get appSettingsHome(): URI {
		return URI.from({ scheme: Schemas.file, path: '/User' });
	}
}

function createFileService(disposables: DisposableStore): FileService {
	const fileService = disposables.add(new FileService(new NullLogService()));
	const provider = disposables.add(new InMemoryFileSystemProvider());
	disposables.add(fileService.registerProvider(Schemas.file, provider));
	return fileService;
}

suite('agentHostBootstrap', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('loads configuration from appSettingsHome', async () => {
		const testDisposables = disposables.add(new DisposableStore());
		const environmentService = new TestEnvironmentService(parseArgs(['--force-disable-user-env'], OPTIONS), { _serviceBrand: undefined, ...product });
		const fileService = createFileService(testDisposables);

		await fileService.createFolder(environmentService.appSettingsHome);
		await fileService.writeFile(joinPath(environmentService.appSettingsHome, 'settings.json'), VSBuffer.fromString('{ "http.proxy": "http://proxy.example:8080" }'));

		const services = new ServiceCollection();
		await registerAgentHostNetworkServices(services, fileService, environmentService, new NullLogService(), testDisposables);

		const configurationService = services.get(IConfigurationService);
		assert.ok(configurationService instanceof ConfigurationService);
		assert.strictEqual(configurationService.getValue('http.proxy'), 'http://proxy.example:8080');
	});
});
