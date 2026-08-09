/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { NullLogService } from '../../../log/common/log.js';
import { registerAgentHostNetworkServices } from '../../node/agentHostBootstrap.js';

suite('AgentHostBootstrap', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reads settings through the disk file system provider', async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const userRoamingDataHome = URI.from({ scheme: Schemas.vscodeUserData, path: '/User' });
		const settingsResource = joinPath(userRoamingDataHome.with({ scheme: Schemas.file }), 'settings.json');
		await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "http.proxy": "http://proxy.example", "http.proxySupport": "on" }'));
		const environmentService = upcastPartial<INativeEnvironmentService>({ userRoamingDataHome });
		const services = new ServiceCollection();
		const networkServiceDisposables = disposables.add(new DisposableStore());

		const networkServices = await registerAgentHostNetworkServices(services, fileService, environmentService, logService, networkServiceDisposables);

		assert.strictEqual(await networkServices.proxyResolver.resolveProxy('https://example.com'), 'http://proxy.example');
	});
});
