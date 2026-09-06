/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { MockMcpServer, parseToolResult } from './testHelpers';

vi.mock('vscode', () => ({
	version: '1.95.0',
	env: {
		appName: 'Visual Studio Code',
		appRoot: '/usr/share/code',
		language: 'en',
		machineId: 'test-machine-id',
		sessionId: 'test-session-id',
		uriScheme: 'vscode',
		shell: '/bin/bash',
	},
}));

import { registerGetVscodeInfoTool } from '../tools/getVscodeInfo';

interface VscodeInfoResult {
	version: string;
	appName: string;
	appRoot: string;
	language: string;
	machineId: string;
	sessionId: string;
	uriScheme: string;
	shell: string;
}

describe('getVscodeInfo tool', () => {
	const logger = new TestLogService();
	let server: MockMcpServer;

	beforeEach(() => {
		vi.clearAllMocks();
		server = new MockMcpServer();
		registerGetVscodeInfoTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer, logger);
	});

	it('should register the get_vscode_info tool', () => {
		expect(server.hasToolRegistered('get_vscode_info')).toBe(true);
	});

	it('should return VS Code environment information', async () => {
		const handler = server.getToolHandler('get_vscode_info')!;
		const result = parseToolResult<VscodeInfoResult>(await handler({}));

		expect(result.version).toBe('1.95.0');
		expect(result.appName).toBe('Visual Studio Code');
		expect(result.appRoot).toBe('/usr/share/code');
		expect(result.language).toBe('en');
		expect(result.machineId).toBe('test-machine-id');
		expect(result.sessionId).toBe('test-session-id');
		expect(result.uriScheme).toBe('vscode');
		expect(result.shell).toBe('/bin/bash');
	});
});
