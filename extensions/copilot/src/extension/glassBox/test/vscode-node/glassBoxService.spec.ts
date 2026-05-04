/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { LoggedInfoKind, LoggedRequestKind, type ILoggedElementInfo, type ILoggedRequestInfo, type LoggedInfo, type ILoggedChatMLSuccessRequest } from '../../../../platform/requestLogger/common/requestLogger';
import { Raw } from '@vscode/prompt-tsx';
import { ContextItemKind } from '../../common/types';
import type { IGlassBoxService } from '../../common/glassBoxService';
import { GlassBoxServiceImpl } from '../../vscode-node/glassBoxServiceImpl';

/** Helper to create a text content part */
function textPart(text: string): Raw.ChatCompletionContentPartText {
	return { type: Raw.ChatCompletionContentPartKind.Text, text };
}

// --- Minimal mock services ---

class MockRequestLogger {
	declare _serviceBrand: undefined;

	private readonly _onDidChangeRequests = new Emitter<void>();
	readonly onDidChangeRequests: Event<void> = this._onDidChangeRequests.event;

	promptRendererTracing = false;
	private _entries: LoggedInfo[] = [];

	getRequests(): LoggedInfo[] {
		return [...this._entries];
	}

	getRequestById(id: string): LoggedInfo | undefined {
		return this._entries.find(e => e.id === id);
	}

	addPromptTrace(): void { }
	addEntry(): void { }
	logToolCall(): void { }
	logServerToolCall(): void { }
	logModelListCall(): void { }
	logContentExclusionRules(): void { }
	logChatRequest(): void { }
	enableWorkspaceEditTracing(): void { }
	disableWorkspaceEditTracing(): void { }
	captureInvocation<T>(_: unknown, fn: () => Promise<T>): Promise<T> { return fn(); }

	addTestSuccessRequest(id: string, debugName: string, model: string, messages: Raw.ChatMessage[]): void {
		const startTime = new Date(Date.now() - 1000);
		const endTime = new Date();
		const entry: ILoggedChatMLSuccessRequest = {
			type: LoggedRequestKind.ChatMLSuccess,
			debugName,
			chatEndpoint: { model, modelMaxPromptTokens: 128000 },
			chatParams: {
				messages,
				ourRequestId: `req-${id}`,
				model,
				location: 1 as any,
			},
			startTime,
			endTime,
			timeToFirstToken: 250,
			usage: {
				prompt_tokens: 5000,
				completion_tokens: 800,
				total_tokens: 5800,
				prompt_tokens_details: { cached_tokens: 1200 },
			},
			result: {
				type: 'success' as any,
				value: ['test response'],
				toolCalls: [],
			} as any,
		};

		this._entries.push({
			kind: LoggedInfoKind.Request,
			id,
			entry,
			token: undefined,
			toJSON: () => ({}),
		} as ILoggedRequestInfo);

		this._onDidChangeRequests.fire();
	}

	addTestElementEntry(id: string, name: string, tokens: number, maxTokens: number): void {
		this._entries.push({
			kind: LoggedInfoKind.Element,
			id,
			name,
			tokens,
			maxTokens,
			trace: {} as any,
			token: undefined,
			toJSON: () => ({}),
		} as ILoggedElementInfo);

		this._onDidChangeRequests.fire();
	}

	clear(): void {
		this._entries = [];
		this._onDidChangeRequests.fire();
	}
}

class MockLogService {
	declare _serviceBrand: undefined;
	trace() { }
	debug() { }
	info() { }
	warn() { }
	error() { }
}

describe('GlassBoxServiceImpl', () => {
	let store: DisposableStore;
	let mockRequestLogger: MockRequestLogger;
	let service: IGlassBoxService;

	beforeEach(() => {
		store = new DisposableStore();
		mockRequestLogger = new MockRequestLogger();
		const mockLog = new MockLogService();

		service = store.add(new GlassBoxServiceImpl(
			mockRequestLogger as any,
			mockLog as any,
		));

		// Enable by default for most tests
		service.setEnabled(true);
	});

	afterEach(() => {
		store.dispose();
	});

	it('should start with no requests', () => {
		expect(service.getRequests()).toHaveLength(0);
	});

	it('should start disabled (opt-in)', () => {
		// Create a fresh service to test initial state
		const freshService = store.add(new GlassBoxServiceImpl(
			mockRequestLogger as any,
			new MockLogService() as any,
		));
		expect(freshService.isEnabled).toBe(false);
	});

	it('should allow toggling enabled state', () => {
		service.setEnabled(false);
		expect(service.isEnabled).toBe(false);
		service.setEnabled(true);
		expect(service.isEnabled).toBe(true);
	});

	it('should sync requests from request logger when enabled', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.System, content: [textPart('You are a helpful assistant.')] },
			{ role: Raw.ChatRole.User, content: [textPart('Hello, how are you?')] },
		];

		mockRequestLogger.addTestSuccessRequest('test-1', 'agentRequest', 'gpt-4o', messages);

		const requests = service.getRequests();
		expect(requests.length).toBeGreaterThan(0);
	});

	it('should not sync when disabled', () => {
		service.setEnabled(false);

		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [textPart('Hello')] },
		];
		mockRequestLogger.addTestSuccessRequest('test-1', 'agentRequest', 'gpt-4o', messages);

		expect(service.getRequests()).toHaveLength(0);
	});

	it('should populate token budget from usage data', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [textPart('Hello')] },
		];
		mockRequestLogger.addTestSuccessRequest('test-1', 'agentRequest', 'gpt-4o', messages);

		const requests = service.getRequests();
		const req = requests[0];
		expect(req.tokenBudget.promptTokens).toBe(5000);
		expect(req.tokenBudget.completionTokens).toBe(800);
		expect(req.tokenBudget.totalTokens).toBe(5800);
		expect(req.tokenBudget.cachedTokens).toBe(1200);
		expect(req.tokenBudget.modelMaxTokens).toBe(128000);
		// Remaining = Max - Prompt (not Max - Total; completion tokens don't consume context)
		expect(req.tokenBudget.remainingTokens).toBe(128000 - 5000);
	});

	it('should populate performance metrics', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [textPart('Hello')] },
		];
		mockRequestLogger.addTestSuccessRequest('test-1', 'agentRequest', 'gpt-4o', messages);

		const req = service.getRequests()[0];
		expect(req.performance.timeToFirstTokenMs).toBe(250);
		expect(req.performance.totalDurationMs).toBeGreaterThan(0);
		expect(req.performance.cacheHit).toBe(true);
		expect(req.performance.cachedTokens).toBe(1200);
	});

	it('should build context items from messages', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.System, content: [textPart('You are a helpful assistant.')] },
			{ role: Raw.ChatRole.User, content: [textPart('Explain this code')] },
		];
		mockRequestLogger.addTestSuccessRequest('test-1', 'agentRequest', 'gpt-4o', messages);

		const req = service.getRequests()[0];
		expect(req.contextItems.length).toBe(2);
		expect(req.contextItems[0].kind).toBe(ContextItemKind.SystemMessage);
		expect(req.contextItems[1].kind).toBe(ContextItemKind.UserMessage);
	});

	it('should sanitize sensitive data in context previews', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [textPart('My API key is api_key=sk_test_super_secret_key_12345')] },
		];
		mockRequestLogger.addTestSuccessRequest('test-1', 'agentRequest', 'gpt-4o', messages);

		const req = service.getRequests()[0];
		const userMsg = req.contextItems.find(c => c.kind === ContextItemKind.UserMessage);
		expect(userMsg?.preview).toBeDefined();
		expect(userMsg!.preview).toContain('[API_KEY_REDACTED]');
		expect(userMsg!.preview).not.toContain('sk_test_super_secret');
	});

	it('should store full system message preview without truncation', () => {
		// System messages (injected prompts) must be fully stored so the Replay panel can show them
		const longSystemPrompt = 'You are a helpful assistant. '.repeat(200); // ~5800 chars, > 2000 cap
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.System, content: [textPart(longSystemPrompt)] },
			{ role: Raw.ChatRole.User, content: [textPart('Hello')] },
		];
		mockRequestLogger.addTestSuccessRequest('test-sys', 'agentRequest', 'gpt-4o', messages);

		const req = service.getRequests()[0];
		const sysItem = req.contextItems.find(c => c.kind === ContextItemKind.SystemMessage);
		expect(sysItem?.preview).toBeDefined();
		// Full content stored — not truncated to 2000 chars
		expect(sysItem!.preview!.length).toBeGreaterThan(2000);
		expect(sysItem!.preview).not.toContain('[truncated]');
	});

	it('should capture response text from successful requests', () => {
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [textPart('What is 2 + 2?')] },
		];
		mockRequestLogger.addTestSuccessRequest('test-resp', 'agentRequest', 'gpt-4o', messages);

		const req = service.getRequests()[0];
		// The mock sets result.value = ['test response']
		expect(req.responseText).toBeDefined();
		expect(req.responseText).toContain('test response');
	});

	it('should handle prompt element entries', () => {
		mockRequestLogger.addTestElementEntry('elem-1', 'systemPrompt', 3000, 128000);

		const requests = service.getRequests();
		expect(requests.length).toBeGreaterThan(0);
		const elemReq = requests.find(r => r.id.startsWith('elem-'));
		expect(elemReq).toBeDefined();
		expect(elemReq!.contextItems[0].tokens).toBe(3000);
		expect(elemReq!.contextItems[0].maxTokens).toBe(128000);
	});

	it('should cap stored requests to MAX_STORED_REQUESTS', () => {
		for (let i = 0; i < 60; i++) {
			mockRequestLogger.addTestSuccessRequest(`test-${i}`, `request-${i}`, 'gpt-4o', [
				{ role: Raw.ChatRole.User, content: [textPart(`Message ${i}`)] },
			]);
		}

		expect(service.getRequests().length).toBeLessThanOrEqual(50);
	});

	it('should find request by ID', () => {
		mockRequestLogger.addTestSuccessRequest('test-1', 'agentRequest', 'gpt-4o', [
			{ role: Raw.ChatRole.User, content: [textPart('Hello')] },
		]);

		const requests = service.getRequests();
		const firstId = requests[0].id;
		const found = service.getRequestById(firstId);
		expect(found).toBeDefined();
		expect(found!.id).toBe(firstId);
	});

	it('should return undefined for unknown request ID', () => {
		expect(service.getRequestById('nonexistent')).toBeUndefined();
	});

	it('should fire onDidChangeRequests when data updates', () => {
		let fired = false;
		store.add(service.onDidChangeRequests(() => { fired = true; }));

		mockRequestLogger.addTestSuccessRequest('test-1', 'agentRequest', 'gpt-4o', [
			{ role: Raw.ChatRole.User, content: [textPart('Hello')] },
		]);

		expect(fired).toBe(true);
	});

	it('should mark successful requests correctly', () => {
		mockRequestLogger.addTestSuccessRequest('test-1', 'agentRequest', 'gpt-4o', [
			{ role: Raw.ChatRole.User, content: [textPart('Hello')] },
		]);

		const req = service.getRequests()[0];
		expect(req.success).toBe(true);
		expect(req.errorMessage).toBeUndefined();
	});

	describe('buildReasoningTraces', () => {
		it('should build traces from thinking data', () => {
			const traces = GlassBoxServiceImpl.buildReasoningTraces([
				{ id: 'think-1', text: 'Let me think about this...', tokens: 50 },
				{ id: 'think-2', text: ['Step 1', 'Step 2'], tokens: 30, encrypted: 'enc-data' },
			]);

			expect(traces).toHaveLength(2);
			expect(traces[0].id).toBe('think-1');
			expect(traces[0].text).toContain('Let me think about this...');
			expect(traces[0].isEncrypted).toBe(false);
			expect(traces[0].tokens).toBe(50);

			expect(traces[1].isEncrypted).toBe(true);
			expect(traces[1].text).toContain('Step 1');
		});
	});

	describe('buildToolCallMetrics', () => {
		it('should build tool call metrics', () => {
			const metrics = GlassBoxServiceImpl.buildToolCallMetrics([
				{ name: 'read_file', durationMs: 150 },
				{ name: 'run_in_terminal', durationMs: 3000 },
			]);

			expect(metrics).toHaveLength(2);
			expect(metrics[0].name).toBe('read_file');
			expect(metrics[0].durationMs).toBe(150);
			expect(metrics[1].name).toBe('run_in_terminal');
		});

		it('should redact sensitive data in tool names', () => {
			const metrics = GlassBoxServiceImpl.buildToolCallMetrics([
				{ name: 'tool with password=secret123', durationMs: 100 },
			]);

			expect(metrics[0].name).toContain('[SECRET_REDACTED]');
		});
	});
});
