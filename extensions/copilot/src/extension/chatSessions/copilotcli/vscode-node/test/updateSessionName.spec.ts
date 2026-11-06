/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { MockMcpServer, MockSessionTracker, parseToolResult } from './testHelpers';

vi.mock('vscode', () => ({}));

import { registerUpdateSessionNameTool } from '../tools/updateSessionName';

interface UpdateSessionNameResult {
	success: boolean;
}

describe('updateSessionName tool', () => {
	const logger = new TestLogService();
	let server: MockMcpServer;
	let sessionTracker: MockSessionTracker;
	const sessionId = 'test-session-123';

	beforeEach(() => {
		vi.clearAllMocks();
		server = new MockMcpServer();
		sessionTracker = new MockSessionTracker();
		registerUpdateSessionNameTool(
			server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
			logger,
			sessionTracker.asTracker(),
			sessionId
		);
	});

	it('should register the update_session_name tool', () => {
		expect(server.hasToolRegistered('update_session_name')).toBe(true);
	});

	it('should update session name in tracker', async () => {
		const handler = server.getToolHandler('update_session_name')!;
		const result = parseToolResult<UpdateSessionNameResult>(await handler({ name: 'Fix Login Bug' }));

		expect(result.success).toBe(true);
		expect(sessionTracker.setSessionName).toHaveBeenCalledWith(sessionId, 'Fix Login Bug');
		expect(sessionTracker.getSessionDisplayName(sessionId)).toBe('Fix Login Bug');
	});

	it('should handle different session names', async () => {
		const handler = server.getToolHandler('update_session_name')!;

		await handler({ name: 'First Name' });
		expect(sessionTracker.getSessionDisplayName(sessionId)).toBe('First Name');

		await handler({ name: 'Second Name' });
		expect(sessionTracker.getSessionDisplayName(sessionId)).toBe('Second Name');
	});

	it('should fallback to sessionId for empty string name', async () => {
		const handler = server.getToolHandler('update_session_name')!;
		const result = parseToolResult<UpdateSessionNameResult>(await handler({ name: '' }));

		expect(result.success).toBe(true);
		expect(sessionTracker.setSessionName).toHaveBeenCalledWith(sessionId, '');
	});

	it('should handle unicode characters in name', async () => {
		const handler = server.getToolHandler('update_session_name')!;
		const unicodeName = '修复登录错误 🐛';
		const result = parseToolResult<UpdateSessionNameResult>(await handler({ name: unicodeName }));

		expect(result.success).toBe(true);
		expect(sessionTracker.getSessionDisplayName(sessionId)).toBe(unicodeName);
	});
});
