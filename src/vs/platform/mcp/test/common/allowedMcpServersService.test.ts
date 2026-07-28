/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { AllowedMcpServersService } from '../../common/allowedMcpServersService.js';
import { IInstallableMcpServer, mcpAccessConfig, mcpAllowedServersConfig, mcpDeniedServersConfig, McpAccessValue } from '../../common/mcpManagement.js';
import { McpServerType } from '../../common/mcpPlatformTypes.js';

suite('AllowedMcpServersService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(config: Record<string, unknown>): AllowedMcpServersService {
		const configurationService = new TestConfigurationService(config);
		return disposables.add(new AllowedMcpServersService(configurationService));
	}

	test('allows any server when nothing is configured', () => {
		const service = createService({});
		assert.strictEqual(service.isServerAllowed({ name: 'github' }), true);
	});

	test('blocks all servers when access is None', () => {
		const service = createService({ [mcpAccessConfig]: McpAccessValue.None });
		const result = service.isServerAllowed({ name: 'github' });
		assert.notStrictEqual(result, true);
	});

	test('allowlist permits only matching servers', () => {
		const service = createService({ [mcpAllowedServersConfig]: [{ serverName: 'github' }] });
		assert.strictEqual(service.isServerAllowed({ name: 'github' }), true);

		const result = service.isServerAllowed({ name: 'gitlab' });
		assert.notStrictEqual(result, true);
		assert.ok(result !== true && result.value.includes('not in the list of servers allowed by your organization'));
	});

	test('denylist blocks a matching server even when it is also allowed', () => {
		const service = createService({
			[mcpAllowedServersConfig]: [{ serverName: 'github' }],
			[mcpDeniedServersConfig]: [{ serverName: 'github' }],
		});

		const result = service.isServerAllowed({ name: 'github' });
		assert.notStrictEqual(result, true);
		assert.ok(result !== true && result.value.includes('blocked by your organization'));
	});

	test('denylist blocks by remote URL wildcard even without an allowlist', () => {
		const service = createService({ [mcpDeniedServersConfig]: [{ serverUrl: 'https://*.untrusted.example.com/*' }] });

		const denied = service.isServerAllowed({ name: 's', url: 'https://api.untrusted.example.com/mcp' });
		assert.notStrictEqual(denied, true);
		assert.strictEqual(service.isServerAllowed({ name: 's', url: 'https://api.trusted.example.com/mcp' }), true);
	});

	test('isAllowed matches an installable stdio server by its command', () => {
		const service = createService({ [mcpAllowedServersConfig]: [{ serverCommand: ['npx', '-y', 'server'] }] });

		const allowed: IInstallableMcpServer = { name: 'anything', config: { type: McpServerType.LOCAL, command: 'npx', args: ['-y', 'server'] } };
		assert.strictEqual(service.isAllowed(allowed), true);

		const blocked: IInstallableMcpServer = { name: 'anything', config: { type: McpServerType.LOCAL, command: 'npx', args: ['other'] } };
		assert.notStrictEqual(service.isAllowed(blocked), true);
	});

	test('isAllowed matches an installable remote server by its URL', () => {
		const service = createService({ [mcpAllowedServersConfig]: [{ serverUrl: 'https://mcp.example.com/*' }] });

		const allowed: IInstallableMcpServer = { name: 'anything', config: { type: McpServerType.REMOTE, url: 'https://mcp.example.com/api' } };
		assert.strictEqual(service.isAllowed(allowed), true);

		const blocked: IInstallableMcpServer = { name: 'anything', config: { type: McpServerType.REMOTE, url: 'https://other.example.org/api' } };
		assert.notStrictEqual(service.isAllowed(blocked), true);
	});
});
