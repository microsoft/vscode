/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService } from '../../../log/common/log.js';
import { McpGalleryService } from '../../common/mcpGalleryService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IRequestService } from '../../../request/common/request.js';
import { IFileService } from '../../../files/common/files.js';
import { IMcpGalleryManifestService } from '../../common/mcpGalleryManifest.js';
import { RegistryType } from '../../common/mcpManagement.js';

suite('McpGalleryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let service: McpGalleryService;

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IRequestService, {});
		instantiationService.stub(IFileService, {});
		instantiationService.stub(ILogService, {});
		instantiationService.stub(IMcpGalleryManifestService, {});
		service = disposables.add(instantiationService.createInstance(McpGalleryService));
	});

	teardown(() => {
		service.dispose();
	});

	suite('mapServerJsonToServerConfiguration', () => {
		test('Maps 2025-09-29 schema version', () => {
			const input = {
				'$schema': 'https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json',
				packages: [
					{
						registryType: 'nuget',
						identifier: 'NuGet.Mcp.Server',
						version: '0.1.0'
					}
				]
			};
			const config = service.mapServerJsonToServerConfiguration(input);
			assert.deepStrictEqual(config, {
				packages: [
					{
						identifier: 'NuGet.Mcp.Server',
						registryType: RegistryType.NUGET,
						version: '0.1.0',
					}
				],
				remotes: undefined,
			});
		});

		test('Maps 2025-07-09 schema version, new names', () => {
			const input = {
				'$schema': 'https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json',
				packages: [
					{
						registry_type: 'nuget',
						identifier: 'NuGet.Mcp.Server',
						version: '0.1.0'
					}
				]
			};
			const config = service.mapServerJsonToServerConfiguration(input);
			assert.deepStrictEqual(config, {
				packages: [
					{
						environmentVariables: undefined,
						fileSha256: undefined,
						identifier: 'NuGet.Mcp.Server',
						packageArguments: undefined,
						registryBaseUrl: undefined,
						registryType: RegistryType.NUGET,
						runtimeArguments: undefined,
						runtimeHint: undefined,
						transport: undefined,
						version: '0.1.0',
					}
				],
				remotes: undefined,
			});
		});

		test('Maps 2025-07-09 schema version, old names', () => {
			const input = {
				'$schema': 'https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json',
				packages: [
					{
						registry_name: 'nuget',
						name: 'NuGet.Mcp.Server',
						version: '0.1.0'
					}
				]
			};
			const config = service.mapServerJsonToServerConfiguration(input);
			assert.deepStrictEqual(config, {
				packages: [
					{
						environmentVariables: undefined,
						fileSha256: undefined,
						identifier: 'NuGet.Mcp.Server',
						packageArguments: undefined,
						registryBaseUrl: undefined,
						registryType: RegistryType.NUGET,
						runtimeArguments: undefined,
						runtimeHint: undefined,
						transport: undefined,
						version: '0.1.0',
					}
				],
				remotes: undefined,
			});
		});
	});
});
