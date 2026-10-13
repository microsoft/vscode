/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { ILogService } from '../../../../platform/log/common/logService';
import { ITestingServicesAccessor, TestingServiceCollection } from '../../../../platform/test/node/services';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { McpSetupCommands } from '../../vscode-node/commands';
import { FixtureFetcherService } from './util';

describe('get MCP server info', { timeout: 30_000 }, () => {
	let testingServiceCollection: TestingServiceCollection;
	let accessor: ITestingServicesAccessor;
	let logService: ILogService;
	let emptyFetcherService: FixtureFetcherService;

	beforeEach(() => {
		testingServiceCollection = createExtensionUnitTestingServices();
		accessor = testingServiceCollection.createTestingAccessor();
		logService = accessor.get(ILogService);
		emptyFetcherService = new FixtureFetcherService();
	});

	it('npm returns package metadata', async () => {
		const fetcherService = new FixtureFetcherService(new Map([
			['https://registry.npmjs.org/%40modelcontextprotocol%2Fserver-everything', {
				fileName: 'npm-modelcontextprotocol-server-everything.json',
				status: 200
			}]
		]));
		const result = await McpSetupCommands.validatePackageRegistry({ type: 'npm', name: '@modelcontextprotocol/server-everything' }, logService, fetcherService);
		expect(result.state).toBe('ok');
		if (result.state === 'ok') {
			expect(result.name).toBe('@modelcontextprotocol/server-everything');
			expect(result.version).toBeDefined();
			expect(result.publisher).toContain('jspahrsummers');
		} else {
			expect.fail();
		}
	});

	it('npm handles missing package', async () => {
		const result = await McpSetupCommands.validatePackageRegistry({ type: 'npm', name: '@modelcontextprotocol/does-not-exist' }, logService, emptyFetcherService);
		expect(emptyFetcherService.urls[0]).toBe('https://registry.npmjs.org/%40modelcontextprotocol%2Fdoes-not-exist');
		expect(result.state).toBe('error');
		if (result.state === 'error') {
			expect(result.error).toBeDefined();
			expect(result.errorType).toBe('NotFound');
		} else {
			expect.fail();
		}
	});

	it('pip returns package metadata', async () => {
		const fetcherService = new FixtureFetcherService(new Map([
			['https://pypi.org/pypi/mcp-server-fetch/json', {
				fileName: 'pip-mcp-server-fetch.json',
				status: 200
			}]
		]));
		const result = await McpSetupCommands.validatePackageRegistry({ type: 'pip', name: 'mcp-server-fetch' }, logService, fetcherService);
		expect(result.state).toBe('ok');
		if (result.state === 'ok') {
			expect(result.name).toBe('mcp-server-fetch');
			expect(result.version).toBeDefined();
			expect(result.publisher).toContain('Anthropic');
		} else {
			expect.fail();
		}
	});

	it('pip handles missing package', async () => {
		const result = await McpSetupCommands.validatePackageRegistry({ type: 'pip', name: 'mcp-server-that-does-not-exist' }, logService, emptyFetcherService);
		expect(emptyFetcherService.urls[0]).toBe('https://pypi.org/pypi/mcp-server-that-does-not-exist/json');
		expect(result.state).toBe('error');
		if (result.state === 'error') {
			expect(result.error).toBeDefined();
			expect(result.errorType).toBe('NotFound');
		} else {
			expect.fail();
		}
	});

	it('docker returns package metadata', async () => {
		const fetcherService = new FixtureFetcherService(new Map([
			['https://hub.docker.com/v2/repositories/mcp/node-code-sandbox', {
				fileName: 'docker-mcp-node-code-sandbox.json',
				status: 200
			}]
		]));
		const result = await McpSetupCommands.validatePackageRegistry({ type: 'docker', name: 'mcp/node-code-sandbox' }, logService, fetcherService);
		expect(result.state).toBe('ok');
		if (result.state === 'ok') {
			expect(result.name).toBe('mcp/node-code-sandbox');
			expect(result.version).toBeUndefined(); // currently not populated
			expect(result.publisher).toBe('mcp');
		} else {
			expect.fail();
		}
	});

	it('docker handles missing package', async () => {
		const result = await McpSetupCommands.validatePackageRegistry({ type: 'docker', name: 'mcp/server-that-does-not-exist' }, logService, emptyFetcherService);
		expect(emptyFetcherService.urls[0]).toBe('https://hub.docker.com/v2/repositories/mcp/server-that-does-not-exist');
		expect(result.state).toBe('error');
		if (result.state === 'error') {
			expect(result.error).toBeDefined();
			expect(result.errorType).toBe('NotFound');
		} else {
			expect.fail();
		}
	});
});
