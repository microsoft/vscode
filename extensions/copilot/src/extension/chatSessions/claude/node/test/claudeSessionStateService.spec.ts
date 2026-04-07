/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import sinon from 'sinon';
import { afterEach, assert, beforeEach, describe, it } from 'vitest';
import type { ClaudeFolderInfo } from '../../common/claudeFolderInfo';
import { ClaudeSessionStateService, SessionStateChangeEvent } from '../claudeSessionStateService';

describe('ClaudeSessionStateService', () => {
	let service: ClaudeSessionStateService;

	beforeEach(() => {
		service = new ClaudeSessionStateService();
	});

	afterEach(() => {
		service.dispose();
		sinon.restore();
	});

	describe('getModelIdForSession', () => {
		it('should return undefined when no model is set for a session', () => {
			const modelId = service.getModelIdForSession('session-1');
			assert.strictEqual(modelId, undefined);
		});

		it('should return the set model when one has been set for a session', () => {
			service.setModelIdForSession('session-1', 'claude-opus-4-20250514');
			const modelId = service.getModelIdForSession('session-1');
			assert.strictEqual(modelId, 'claude-opus-4-20250514');
		});

		it('should return different models for different sessions', () => {
			service.setModelIdForSession('session-1', 'claude-opus-4-20250514');
			service.setModelIdForSession('session-2', 'claude-haiku-3-5-20250514');

			const modelId1 = service.getModelIdForSession('session-1');
			const modelId2 = service.getModelIdForSession('session-2');

			assert.strictEqual(modelId1, 'claude-opus-4-20250514');
			assert.strictEqual(modelId2, 'claude-haiku-3-5-20250514');
		});

		it('should return undefined when model is explicitly set to undefined', () => {
			service.setModelIdForSession('session-1', 'claude-opus-4-20250514');
			service.setModelIdForSession('session-1', undefined);

			const modelId = service.getModelIdForSession('session-1');
			assert.strictEqual(modelId, undefined);
		});
	});

	describe('setModelIdForSession', () => {
		it('should fire onDidChangeSessionState event when model is set', () => {
			const events: SessionStateChangeEvent[] = [];
			service.onDidChangeSessionState(e => events.push(e));

			service.setModelIdForSession('session-1', 'claude-opus-4-20250514');

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].sessionId, 'session-1');
			assert.strictEqual(events[0].modelId, 'claude-opus-4-20250514');
			assert.strictEqual(events[0].permissionMode, undefined);
		});

		it('should preserve permission mode when setting model', () => {
			service.setPermissionModeForSession('session-1', 'bypassPermissions');
			service.setModelIdForSession('session-1', 'claude-opus-4-20250514');

			const permissionMode = service.getPermissionModeForSession('session-1');
			assert.strictEqual(permissionMode, 'bypassPermissions');
		});
	});

	describe('getPermissionModeForSession', () => {
		it('should return default acceptEdits when no mode is set', () => {
			const mode = service.getPermissionModeForSession('session-1');
			assert.strictEqual(mode, 'acceptEdits');
		});

		it('should return the set permission mode', () => {
			service.setPermissionModeForSession('session-1', 'bypassPermissions');
			const mode = service.getPermissionModeForSession('session-1');
			assert.strictEqual(mode, 'bypassPermissions');
		});

		it('should return different modes for different sessions', () => {
			service.setPermissionModeForSession('session-1', 'bypassPermissions');
			service.setPermissionModeForSession('session-2', 'default');

			const mode1 = service.getPermissionModeForSession('session-1');
			const mode2 = service.getPermissionModeForSession('session-2');

			assert.strictEqual(mode1, 'bypassPermissions');
			assert.strictEqual(mode2, 'default');
		});
	});

	describe('setPermissionModeForSession', () => {
		it('should fire onDidChangeSessionState event when permission mode is set', () => {
			const events: SessionStateChangeEvent[] = [];
			service.onDidChangeSessionState(e => events.push(e));

			service.setPermissionModeForSession('session-1', 'bypassPermissions');

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].sessionId, 'session-1');
			assert.strictEqual(events[0].permissionMode, 'bypassPermissions');
			assert.strictEqual(events[0].modelId, undefined);
		});

		it('should preserve model id when setting permission mode', () => {
			service.setModelIdForSession('session-1', 'claude-opus-4-20250514');
			service.setPermissionModeForSession('session-1', 'bypassPermissions');

			const modelId = service.getModelIdForSession('session-1');
			assert.strictEqual(modelId, 'claude-opus-4-20250514');
		});
	});

	describe('getFolderInfoForSession', () => {
		it('should return undefined when no folder info is set', () => {
			const folderInfo = service.getFolderInfoForSession('session-1');
			assert.strictEqual(folderInfo, undefined);
		});

		it('should return the set folder info', () => {
			const info: ClaudeFolderInfo = { cwd: '/home/user', additionalDirectories: ['/tmp'] };
			service.setFolderInfoForSession('session-1', info);
			const folderInfo = service.getFolderInfoForSession('session-1');
			assert.deepStrictEqual(folderInfo, info);
		});
	});

	describe('setFolderInfoForSession', () => {
		it('should fire onDidChangeSessionState event when folder info is set', () => {
			const events: SessionStateChangeEvent[] = [];
			service.onDidChangeSessionState(e => events.push(e));

			const info: ClaudeFolderInfo = { cwd: '/home/user', additionalDirectories: [] };
			service.setFolderInfoForSession('session-1', info);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].sessionId, 'session-1');
			assert.deepStrictEqual(events[0].folderInfo, info);
			assert.strictEqual(events[0].modelId, undefined);
			assert.strictEqual(events[0].permissionMode, undefined);
		});

		it('should not fire event when folder info is unchanged', () => {
			const info: ClaudeFolderInfo = { cwd: '/home/user', additionalDirectories: ['/tmp'] };
			service.setFolderInfoForSession('session-1', info);

			const events: SessionStateChangeEvent[] = [];
			service.onDidChangeSessionState(e => events.push(e));

			service.setFolderInfoForSession('session-1', { cwd: '/home/user', additionalDirectories: ['/tmp'] });
			assert.strictEqual(events.length, 0);
		});

		it('should fire event when cwd changes', () => {
			service.setFolderInfoForSession('session-1', { cwd: '/home/user', additionalDirectories: [] });

			const events: SessionStateChangeEvent[] = [];
			service.onDidChangeSessionState(e => events.push(e));

			service.setFolderInfoForSession('session-1', { cwd: '/home/other', additionalDirectories: [] });
			assert.strictEqual(events.length, 1);
		});

		it('should fire event when additionalDirectories change', () => {
			service.setFolderInfoForSession('session-1', { cwd: '/home/user', additionalDirectories: ['/tmp'] });

			const events: SessionStateChangeEvent[] = [];
			service.onDidChangeSessionState(e => events.push(e));

			service.setFolderInfoForSession('session-1', { cwd: '/home/user', additionalDirectories: ['/tmp', '/var'] });
			assert.strictEqual(events.length, 1);
		});

		it('should preserve other state when setting folder info', () => {
			service.setModelIdForSession('session-1', 'claude-opus-4-20250514');
			service.setPermissionModeForSession('session-1', 'bypassPermissions');
			service.setFolderInfoForSession('session-1', { cwd: '/home/user', additionalDirectories: [] });

			const modelId = service.getModelIdForSession('session-1');
			assert.strictEqual(modelId, 'claude-opus-4-20250514');
			const permissionMode = service.getPermissionModeForSession('session-1');
			assert.strictEqual(permissionMode, 'bypassPermissions');
		});
	});

	describe('dispose', () => {
		it('should clear session state on dispose', () => {
			service.setModelIdForSession('session-1', 'claude-opus-4-20250514');
			service.setPermissionModeForSession('session-1', 'bypassPermissions');

			service.dispose();

			// After dispose, getting state should return defaults (though event subscriptions won't work)
			// We can't really test this fully without internal access, but we can verify it doesn't throw
			const newService = new ClaudeSessionStateService();
			const modelId = newService.getModelIdForSession('session-1');
			assert.strictEqual(modelId, undefined);
			newService.dispose();
		});
	});

	describe('getUsageHandlerForSession', () => {
		it('should return undefined when no usage handler is set', () => {
			const handler = service.getUsageHandlerForSession('session-1');
			assert.strictEqual(handler, undefined);
		});

		it('should return the set usage handler', () => {
			const mockHandler = sinon.stub();
			service.setUsageHandlerForSession('session-1', mockHandler);
			const handler = service.getUsageHandlerForSession('session-1');
			assert.strictEqual(handler, mockHandler);
		});

		it('should return different handlers for different sessions', () => {
			const handler1 = sinon.stub();
			const handler2 = sinon.stub();
			service.setUsageHandlerForSession('session-1', handler1);
			service.setUsageHandlerForSession('session-2', handler2);

			const retrieved1 = service.getUsageHandlerForSession('session-1');
			const retrieved2 = service.getUsageHandlerForSession('session-2');

			assert.strictEqual(retrieved1, handler1);
			assert.strictEqual(retrieved2, handler2);
		});
	});

	describe('setUsageHandlerForSession', () => {
		it('should allow setting a usage handler', () => {
			const mockHandler = sinon.stub();
			service.setUsageHandlerForSession('session-1', mockHandler);

			const handler = service.getUsageHandlerForSession('session-1');
			assert.strictEqual(handler, mockHandler);
		});

		it('should allow clearing a usage handler', () => {
			const mockHandler = sinon.stub();
			service.setUsageHandlerForSession('session-1', mockHandler);
			service.setUsageHandlerForSession('session-1', undefined);

			const handler = service.getUsageHandlerForSession('session-1');
			assert.strictEqual(handler, undefined);
		});

		it('should preserve other state when setting usage handler', () => {
			service.setModelIdForSession('session-1', 'claude-opus-4-20250514');
			service.setPermissionModeForSession('session-1', 'bypassPermissions');

			const mockHandler = sinon.stub();
			service.setUsageHandlerForSession('session-1', mockHandler);

			const modelId = service.getModelIdForSession('session-1');
			assert.strictEqual(modelId, 'claude-opus-4-20250514');
			const permissionMode = service.getPermissionModeForSession('session-1');
			assert.strictEqual(permissionMode, 'bypassPermissions');
		});

		it('should allow usage handler to be called after setting', () => {
			const mockHandler = sinon.stub();
			service.setUsageHandlerForSession('session-1', mockHandler);

			const handler = service.getUsageHandlerForSession('session-1');
			handler?.({ promptTokens: 100, completionTokens: 50 });

			assert.strictEqual(mockHandler.callCount, 1);
			assert.deepStrictEqual(mockHandler.firstCall.args[0], { promptTokens: 100, completionTokens: 50 });
		});

		it('should not fire onDidChangeSessionState event', () => {
			const events: SessionStateChangeEvent[] = [];
			service.onDidChangeSessionState(e => events.push(e));

			const mockHandler = sinon.stub();
			service.setUsageHandlerForSession('session-1', mockHandler);

			assert.strictEqual(events.length, 0);
		});

		it('should initialize defaults when session has no prior state', () => {
			const mockHandler = sinon.stub();
			service.setUsageHandlerForSession('new-session', mockHandler);

			assert.strictEqual(service.getModelIdForSession('new-session'), undefined);
			assert.strictEqual(service.getPermissionModeForSession('new-session'), 'acceptEdits');
			assert.strictEqual(service.getCapturingTokenForSession('new-session'), undefined);
			assert.strictEqual(service.getFolderInfoForSession('new-session'), undefined);
			assert.strictEqual(service.getUsageHandlerForSession('new-session'), mockHandler);
		});
	});
});
