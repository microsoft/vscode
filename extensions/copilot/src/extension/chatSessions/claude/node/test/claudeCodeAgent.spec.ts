/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { CancellationToken, CancellationTokenSource } from '../../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatReferenceBinaryData } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { MockChatResponseStream, TestChatContext, TestChatRequest } from '../../../../test/node/testHelpers';
import type { ClaudeFolderInfo } from '../../common/claudeFolderInfo';
import { ClaudeAgentManager, ClaudeCodeSession } from '../claudeCodeAgent';
import { IClaudeCodeSdkService } from '../claudeCodeSdkService';
import { ClaudeLanguageModelServer } from '../claudeLanguageModelServer';
import { IClaudeSessionStateService } from '../claudeSessionStateService';
import { MockClaudeCodeSdkService } from './mockClaudeCodeSdkService';

function createMockLangModelServer(): ClaudeLanguageModelServer {
	return {
		incrementUserInitiatedMessageCount: vi.fn()
	} as unknown as ClaudeLanguageModelServer;
}

/** Helper to convert a string prompt to TextBlockParam array for tests */
function toPromptBlocks(text: string): Anthropic.TextBlockParam[] {
	return [{ type: 'text', text }];
}

function createMockChatRequest(): vscode.ChatRequest {
	return { tools: new Map() } as unknown as vscode.ChatRequest;
}

const TEST_MODEL_ID = 'claude-3-sonnet';
const TEST_PERMISSION_MODE = 'acceptEdits' as const;
const TEST_FOLDER_INFO: ClaudeFolderInfo = { cwd: '/test/project', additionalDirectories: [] };
const TEST_SESSION_ID = 'test-session-id';

/**
 * Commits test state to the session state service for a given session ID.
 * This is required before calling handleRequest() since the agent manager
 * now reads state from the service instead of accepting it as parameters.
 */
function commitTestState(
	sessionStateService: IClaudeSessionStateService,
	sessionId: string,
	modelId: string = TEST_MODEL_ID,
	permissionMode: PermissionMode = TEST_PERMISSION_MODE,
	folderInfo: ClaudeFolderInfo = TEST_FOLDER_INFO,
): void {
	sessionStateService.setModelIdForSession(sessionId, modelId);
	sessionStateService.setPermissionModeForSession(sessionId, permissionMode);
	sessionStateService.setFolderInfoForSession(sessionId, folderInfo);
}

describe('ClaudeAgentManager', () => {
	const store = new DisposableStore();
	let instantiationService: IInstantiationService;
	let mockService: MockClaudeCodeSdkService;
	let sessionStateService: IClaudeSessionStateService;

	beforeEach(() => {
		const services = store.add(createExtensionUnitTestingServices());
		const accessor = services.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);

		// Reset mock service call count
		mockService = accessor.get(IClaudeCodeSdkService) as MockClaudeCodeSdkService;
		mockService.queryCallCount = 0;

		sessionStateService = accessor.get(IClaudeSessionStateService);
	});

	afterEach(() => {
		store.clear();
		vi.resetAllMocks();
	});

	it('reuses a live session across requests and streams assistant text', async () => {
		const manager = instantiationService.createInstance(ClaudeAgentManager);

		// Use MockChatResponseStream to capture markdown output
		const stream1 = new MockChatResponseStream();

		commitTestState(sessionStateService, TEST_SESSION_ID);
		const req1 = new TestChatRequest('Hi');
		const res1 = await manager.handleRequest(TEST_SESSION_ID, req1, new TestChatContext(), stream1, CancellationToken.None, true);

		expect(stream1.output.join('\n')).toContain('Hello from mock!');
		expect(res1.claudeSessionId).toBe(TEST_SESSION_ID);

		// Second request should reuse the same live session (SDK query created only once)
		const stream2 = new MockChatResponseStream();

		const req2 = new TestChatRequest('Again');
		const res2 = await manager.handleRequest(TEST_SESSION_ID, req2, new TestChatContext(), stream2, CancellationToken.None, false);

		expect(stream2.output.join('\n')).toContain('Hello from mock!');
		expect(res2.claudeSessionId).toBe(TEST_SESSION_ID);

		// Verify session continuity by checking that the same session ID was returned
		expect(res1.claudeSessionId).toBe(res2.claudeSessionId);

		// Verify that the service's query method was called only once (proving session reuse)
		expect(mockService.queryCallCount).toBe(1);
	});

	it('resolves image references as ImageBlockParam content blocks', async () => {
		const manager = instantiationService.createInstance(ClaudeAgentManager);
		const stream = new MockChatResponseStream();

		const imageData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG magic bytes
		const imageRef: vscode.ChatPromptReference = {
			id: 'image-1',
			name: 'image-1',
			value: new ChatReferenceBinaryData('image/png', () => Promise.resolve(imageData)),
		};
		commitTestState(sessionStateService, TEST_SESSION_ID);
		const req = new TestChatRequest('What is in this image?', [imageRef]);
		await manager.handleRequest(TEST_SESSION_ID, req, new TestChatContext(), stream, CancellationToken.None, true);

		expect(mockService.receivedMessages).toHaveLength(1);
		const content = mockService.receivedMessages[0].message.content;
		expect(Array.isArray(content)).toBe(true);

		const blocks = content as Anthropic.ContentBlockParam[];
		const imageBlocks = blocks.filter(b => b.type === 'image');
		expect(imageBlocks).toHaveLength(1);

		const imageBlock = imageBlocks[0] as Anthropic.ImageBlockParam;
		expect(imageBlock.source.type).toBe('base64');
		const source = imageBlock.source as Anthropic.Base64ImageSource;
		expect(source.media_type).toBe('image/png');
		expect(source.data).toBe(Buffer.from(imageData).toString('base64'));

		// The text prompt should still be present
		const textBlocks = blocks.filter(b => b.type === 'text') as Anthropic.TextBlockParam[];
		expect(textBlocks.some(b => b.text === 'What is in this image?')).toBe(true);
	});

	it('normalizes image/jpg to image/jpeg', async () => {
		const manager = instantiationService.createInstance(ClaudeAgentManager);
		const stream = new MockChatResponseStream();

		const imageRef: vscode.ChatPromptReference = {
			id: 'image-1',
			name: 'image-1',
			value: new ChatReferenceBinaryData('image/jpg', () => Promise.resolve(new Uint8Array([0xFF, 0xD8]))),
		};
		commitTestState(sessionStateService, TEST_SESSION_ID);
		const req = new TestChatRequest('Describe this', [imageRef]);
		await manager.handleRequest(TEST_SESSION_ID, req, new TestChatContext(), stream, CancellationToken.None, true);

		const blocks = mockService.receivedMessages[0].message.content as Anthropic.ContentBlockParam[];
		const imageBlock = blocks.find(b => b.type === 'image') as Anthropic.ImageBlockParam;
		expect(imageBlock).toBeDefined();
		expect((imageBlock.source as Anthropic.Base64ImageSource).media_type).toBe('image/jpeg');
	});

	it('skips unsupported image MIME types', async () => {
		const manager = instantiationService.createInstance(ClaudeAgentManager);
		const stream = new MockChatResponseStream();

		const imageRef: vscode.ChatPromptReference = {
			id: 'image-1',
			name: 'image-1',
			value: new ChatReferenceBinaryData('image/bmp', () => Promise.resolve(new Uint8Array([0x42, 0x4D]))),
		};
		commitTestState(sessionStateService, TEST_SESSION_ID);
		const req = new TestChatRequest('Describe this', [imageRef]);
		await manager.handleRequest(TEST_SESSION_ID, req, new TestChatContext(), stream, CancellationToken.None, true);

		const blocks = mockService.receivedMessages[0].message.content as Anthropic.ContentBlockParam[];
		const imageBlocks = blocks.filter(b => b.type === 'image');
		expect(imageBlocks).toHaveLength(0);
	});

	it('handles mixed image and file references', async () => {
		const manager = instantiationService.createInstance(ClaudeAgentManager);
		const stream = new MockChatResponseStream();

		const imageRef: vscode.ChatPromptReference = {
			id: 'image-1',
			name: 'image-1',
			value: new ChatReferenceBinaryData('image/png', () => Promise.resolve(new Uint8Array([0x89]))),
		};
		const fileUri = URI.file('/test/file.ts');
		const fileRef: vscode.ChatPromptReference = {
			id: 'file-1',
			name: 'file-1',
			value: fileUri,
		};
		commitTestState(sessionStateService, TEST_SESSION_ID);
		const req = new TestChatRequest('Explain both', [imageRef, fileRef]);
		await manager.handleRequest(TEST_SESSION_ID, req, new TestChatContext(), stream, CancellationToken.None, true);

		const blocks = mockService.receivedMessages[0].message.content as Anthropic.ContentBlockParam[];
		const imageBlocks = blocks.filter(b => b.type === 'image');
		const textBlocks = blocks.filter(b => b.type === 'text') as Anthropic.TextBlockParam[];
		expect(imageBlocks).toHaveLength(1);
		// File reference should appear in system-reminder text block (use fsPath for cross-platform)
		expect(textBlocks.some(b => b.text.includes(fileUri.fsPath))).toBe(true);
		// User prompt should still be present
		expect(textBlocks.some(b => b.text === 'Explain both')).toBe(true);
	});
});

describe('ClaudeCodeSession', () => {
	const store = new DisposableStore();
	let instantiationService: IInstantiationService;
	let sessionStateService: IClaudeSessionStateService;

	beforeEach(() => {
		const services = store.add(createExtensionUnitTestingServices());
		const accessor = services.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		sessionStateService = accessor.get(IClaudeSessionStateService);
	});

	afterEach(() => {
		store.clear();
		vi.resetAllMocks();
	});

	it('processes a single request correctly', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		commitTestState(sessionStateService, 'test-session');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', TEST_MODEL_ID, TEST_PERMISSION_MODE, true));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		expect(stream.output.join('\n')).toContain('Hello from mock!');
	});

	it('queues multiple requests and processes them sequentially', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		commitTestState(sessionStateService, 'test-session');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', TEST_MODEL_ID, TEST_PERMISSION_MODE, true));

		const stream1 = new MockChatResponseStream();
		const stream2 = new MockChatResponseStream();

		// Start both requests simultaneously
		const promise1 = session.invoke(createMockChatRequest(), toPromptBlocks('First'), {} as vscode.ChatParticipantToolToken, stream1, CancellationToken.None);
		const promise2 = session.invoke(createMockChatRequest(), toPromptBlocks('Second'), {} as vscode.ChatParticipantToolToken, stream2, CancellationToken.None);

		// Wait for both to complete
		await Promise.all([promise1, promise2]);

		// Both should have received responses
		expect(stream1.output.join('\n')).toContain('Hello from mock!');
		expect(stream2.output.join('\n')).toContain('Hello from mock!');
	});

	it('cancels pending requests when cancelled', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		commitTestState(sessionStateService, 'test-session');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', TEST_MODEL_ID, TEST_PERMISSION_MODE, true));
		const stream = new MockChatResponseStream();
		const source = new CancellationTokenSource();
		source.cancel();

		await expect(session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream, source.token)).rejects.toThrow();
	});

	it('cleans up resources when disposed', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		commitTestState(sessionStateService, 'test-session');
		const session = instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', TEST_MODEL_ID, TEST_PERMISSION_MODE, true);

		// Dispose the session immediately
		session.dispose();

		// Any new requests should be rejected
		const stream = new MockChatResponseStream();
		await expect(session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None))
			.rejects.toThrow('Session disposed');
	});

	it('handles multiple sessions with different session IDs', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer1 = createMockLangModelServer();
		const mockServer2 = createMockLangModelServer();
		commitTestState(sessionStateService, 'session-1');
		commitTestState(sessionStateService, 'session-2');
		const session1 = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer1, 'session-1', TEST_MODEL_ID, TEST_PERMISSION_MODE, true));
		const session2 = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer2, 'session-2', TEST_MODEL_ID, TEST_PERMISSION_MODE, true));

		expect(session1.sessionId).toBe('session-1');
		expect(session2.sessionId).toBe('session-2');

		const stream1 = new MockChatResponseStream();
		const stream2 = new MockChatResponseStream();

		// Both sessions should work independently
		await Promise.all([
			session1.invoke(createMockChatRequest(), toPromptBlocks('Hello from session 1'), {} as vscode.ChatParticipantToolToken, stream1, CancellationToken.None),
			session2.invoke(createMockChatRequest(), toPromptBlocks('Hello from session 2'), {} as vscode.ChatParticipantToolToken, stream2, CancellationToken.None)
		]);

		expect(stream1.output.join('\n')).toContain('Hello from mock!');
		expect(stream2.output.join('\n')).toContain('Hello from mock!');
	});

	it('initializes with model ID from constructor', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		commitTestState(sessionStateService, 'test-session', 'claude-3-opus');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', 'claude-3-opus', TEST_PERMISSION_MODE, true));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		expect(stream.output.join('\n')).toContain('Hello from mock!');
	});

	it('calls setModel when model changes instead of restarting session', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		const mockService = instantiationService.invokeFunction(accessor => accessor.get(IClaudeCodeSdkService)) as MockClaudeCodeSdkService;
		mockService.queryCallCount = 0;
		mockService.setModelCallCount = 0;

		commitTestState(sessionStateService, 'test-session', 'claude-3-sonnet');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', 'claude-3-sonnet', TEST_PERMISSION_MODE, true));

		// First request with initial model
		const stream1 = new MockChatResponseStream();
		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream1, CancellationToken.None);
		expect(mockService.queryCallCount).toBe(1);

		// Update model in session state service for the second request
		sessionStateService.setModelIdForSession('test-session', 'claude-3-opus');

		// Second request with different model should call setModel on existing session
		const stream2 = new MockChatResponseStream();
		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello again'), {} as vscode.ChatParticipantToolToken, stream2, CancellationToken.None);
		expect(mockService.queryCallCount).toBe(1); // Same query reused
		expect(mockService.setModelCallCount).toBe(1); // setModel was called
		expect(mockService.lastSetModel).toBe('claude-3-opus');
	});

	it('does not restart session when same model is used', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		const mockService = instantiationService.invokeFunction(accessor => accessor.get(IClaudeCodeSdkService)) as MockClaudeCodeSdkService;
		mockService.queryCallCount = 0;

		commitTestState(sessionStateService, 'test-session', 'claude-3-sonnet');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', 'claude-3-sonnet', TEST_PERMISSION_MODE, true));

		// First request
		const stream1 = new MockChatResponseStream();
		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream1, CancellationToken.None);
		expect(mockService.queryCallCount).toBe(1);

		// Second request with same model should reuse session
		const stream2 = new MockChatResponseStream();
		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello again'), {} as vscode.ChatParticipantToolToken, stream2, CancellationToken.None);
		expect(mockService.queryCallCount).toBe(1); // Same query reused
	});

	it('uses session state model for initial Options when starting a new session', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		const mockService = instantiationService.invokeFunction(accessor => accessor.get(IClaudeCodeSdkService)) as MockClaudeCodeSdkService;

		// Constructor gets 'claude-3-sonnet', but session state has 'claude-3-opus'
		commitTestState(sessionStateService, 'test-session', 'claude-3-opus');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', 'claude-3-sonnet', TEST_PERMISSION_MODE, true));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		// The Options passed to the SDK should reflect the session state model, not the constructor value
		expect(mockService.lastQueryOptions?.model).toBe('claude-3-opus');
	});

	it('uses session state permission mode for initial Options when starting a new session', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		const mockService = instantiationService.invokeFunction(accessor => accessor.get(IClaudeCodeSdkService)) as MockClaudeCodeSdkService;

		// Constructor gets 'acceptEdits', but session state has 'bypassPermissions'
		commitTestState(sessionStateService, 'test-session', TEST_MODEL_ID, 'bypassPermissions');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', TEST_MODEL_ID, 'acceptEdits', true));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		// The Options passed to the SDK should reflect the session state permission mode
		expect(mockService.lastQueryOptions?.permissionMode).toBe('bypassPermissions');
	});

	it('does not call setModel when model has not changed', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		const mockService = instantiationService.invokeFunction(accessor => accessor.get(IClaudeCodeSdkService)) as MockClaudeCodeSdkService;
		mockService.setModelCallCount = 0;

		commitTestState(sessionStateService, 'test-session', 'claude-3-sonnet');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', 'claude-3-sonnet', TEST_PERMISSION_MODE, true));

		// First request establishes the session
		const stream1 = new MockChatResponseStream();
		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream1, CancellationToken.None);

		// Second request with same model should not call setModel
		const stream2 = new MockChatResponseStream();
		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello again'), {} as vscode.ChatParticipantToolToken, stream2, CancellationToken.None);

		expect(mockService.setModelCallCount).toBe(0);
	});

	it('does not call setPermissionMode when permission mode has not changed', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		const mockService = instantiationService.invokeFunction(accessor => accessor.get(IClaudeCodeSdkService)) as MockClaudeCodeSdkService;
		mockService.setPermissionModeCallCount = 0;

		commitTestState(sessionStateService, 'test-session', TEST_MODEL_ID, 'acceptEdits');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', TEST_MODEL_ID, 'acceptEdits', true));

		// First request establishes the session
		const stream1 = new MockChatResponseStream();
		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream1, CancellationToken.None);

		// Second request with same permission mode should not call setPermissionMode
		const stream2 = new MockChatResponseStream();
		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello again'), {} as vscode.ChatParticipantToolToken, stream2, CancellationToken.None);

		expect(mockService.setPermissionModeCallCount).toBe(0);
	});

	it('calls setPermissionMode when permission mode changes', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		const mockService = instantiationService.invokeFunction(accessor => accessor.get(IClaudeCodeSdkService)) as MockClaudeCodeSdkService;
		mockService.setPermissionModeCallCount = 0;

		commitTestState(sessionStateService, 'test-session', TEST_MODEL_ID, 'acceptEdits');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'test-session', TEST_MODEL_ID, 'acceptEdits', true));

		// First request establishes the session
		const stream1 = new MockChatResponseStream();
		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream1, CancellationToken.None);

		// Change permission mode in session state for the second request
		sessionStateService.setPermissionModeForSession('test-session', 'bypassPermissions');

		// Second request should call setPermissionMode
		const stream2 = new MockChatResponseStream();
		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello again'), {} as vscode.ChatParticipantToolToken, stream2, CancellationToken.None);

		expect(mockService.setPermissionModeCallCount).toBe(1);
		expect(mockService.lastSetPermissionMode).toBe('bypassPermissions');
	});

	it('passes sessionId in SDK options for new sessions', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		const mockService = instantiationService.invokeFunction(accessor => accessor.get(IClaudeCodeSdkService)) as MockClaudeCodeSdkService;

		commitTestState(sessionStateService, 'new-session');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'new-session', TEST_MODEL_ID, TEST_PERMISSION_MODE, true));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		// New session should use sessionId, not resume
		expect(mockService.lastQueryOptions?.sessionId).toBe('new-session');
		expect(mockService.lastQueryOptions?.resume).toBeUndefined();
	});

	it('passes resume in SDK options for resumed sessions', async () => {
		const serverConfig = { port: 8080, nonce: 'test-nonce' };
		const mockServer = createMockLangModelServer();
		const mockService = instantiationService.invokeFunction(accessor => accessor.get(IClaudeCodeSdkService)) as MockClaudeCodeSdkService;

		commitTestState(sessionStateService, 'existing-session');
		const session = store.add(instantiationService.createInstance(ClaudeCodeSession, serverConfig, mockServer, 'existing-session', TEST_MODEL_ID, TEST_PERMISSION_MODE, false));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('Hello'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		// Resumed session should use resume, not sessionId
		expect(mockService.lastQueryOptions?.resume).toBe('existing-session');
		expect(mockService.lastQueryOptions?.sessionId).toBeUndefined();
	});
});

describe('ClaudeAgentManager - error handling', () => {
	const store = new DisposableStore();
	let instantiationService: IInstantiationService;

	beforeEach(() => {
		const services = store.add(createExtensionUnitTestingServices());
		const accessor = services.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
	});

	afterEach(() => {
		store.clear();
		vi.resetAllMocks();
	});

	it('throws when session state has not been committed', async () => {
		const manager = instantiationService.createInstance(ClaudeAgentManager);
		const stream = new MockChatResponseStream();

		// Do NOT commit state - handleRequest should fail
		const req = new TestChatRequest('Hello');
		const result = await manager.handleRequest('no-state-session', req, new TestChatContext(), stream, CancellationToken.None, true);

		// Should return an error result (the error is caught and streamed)
		expect(result.errorDetails).toBeDefined();
	});
});
