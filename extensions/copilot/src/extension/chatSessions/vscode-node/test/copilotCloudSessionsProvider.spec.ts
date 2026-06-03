/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { AgentTaskGetResponse, AgentTaskSessionEvent } from '@vscode/copilot-api';
import { IGitService } from '../../../../platform/git/common/gitService';
import { PullRequestSearchItem, SessionInfo } from '../../../../platform/github/common/githubAPI';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { mock } from '../../../../util/common/test/simpleMock';
import { ChatRequestTurn2, ChatResponseMarkdownPart, ChatResponseTurn2, ChatToolInvocationPart } from '../../../../vscodeTypes';
import { ChatSessionContentBuilder } from '../copilotCloudSessionContentBuilder';
import { normalizeInitialSessionOptions, parseSessionLogChunksSafely } from '../copilotCloudSessionsProvider';

vi.mock('vscode', async () => {
	const actual = await import('../../../../vscodeTypes');
	return {
		...actual,
		workspace: {
			workspaceFolders: [],
		},
	};
});

class RecordingLogService extends TestLogService {
	override readonly trace = vi.fn();
	override readonly warn = vi.fn();
	override readonly error = vi.fn();
}

class TestGitService extends mock<IGitService>() {
	declare readonly _serviceBrand: undefined;
	override activeRepository = { get: () => undefined } as IGitService['activeRepository'];
	override initialize = vi.fn(async () => { });
	override repositories = [];
}

function createPullRequest(): PullRequestSearchItem {
	return {
		id: 'pr-1',
		number: 1,
		title: 'Test PR',
		state: 'OPEN',
		url: 'https://example.com/pr/1',
		createdAt: '2026-03-27T00:00:00Z',
		updatedAt: '2026-03-27T00:00:00Z',
		author: { login: 'octocat' },
		repository: {
			owner: { login: 'microsoft' },
			name: 'vscode',
		},
		additions: 1,
		deletions: 0,
		files: { totalCount: 1 },
		fullDatabaseId: 1,
		headRefOid: 'abc123',
		headRefName: 'copilot/test-branch',
		baseRefName: 'main',
		body: 'Body',
	};
}

function createSession(state: SessionInfo['state'] = 'completed'): SessionInfo {
	return {
		id: 'session-1',
		name: 'Cloud session',
		user_id: 1,
		agent_id: 1,
		logs: '',
		logs_blob_id: 'blob-1',
		state,
		owner_id: 1,
		repo_id: 1,
		resource_type: 'pull_request',
		resource_id: 1,
		last_updated_at: '2026-03-27T00:00:00Z',
		created_at: '2026-03-27T00:00:00Z',
		completed_at: '2026-03-27T00:00:00Z',
		event_type: 'pull_request',
		workflow_run_id: 1,
		premium_requests: 0,
		error: null,
		resource_global_id: 'global-1',
	};
}

describe('copilotCloudSessionsProvider helpers', () => {
	it('coerces object-shaped initialSessionOptions into option entries', () => {
		const logService = new RecordingLogService();
		const sessionResource = vscode.Uri.parse('copilot-cloud-agent:/1');

		const result = normalizeInitialSessionOptions({
			models: { id: 'gpt-4.1', name: 'GPT-4.1' },
			repositories: 'microsoft/vscode',
		}, logService, sessionResource);

		expect(result).toEqual([
			{ optionId: 'models', value: { id: 'gpt-4.1', name: 'GPT-4.1' } },
			{ optionId: 'repositories', value: 'microsoft/vscode' },
		]);
		expect(logService.warn).toHaveBeenCalledWith(expect.stringContaining('Coerced object-shaped initialSessionOptions'));
	});

	it('ignores unsupported initialSessionOptions payloads and logs a warning', () => {
		const logService = new RecordingLogService();

		const result = normalizeInitialSessionOptions({
			models: { foo: 'bar' },
		}, logService);

		expect(result).toEqual([]);
		expect(logService.warn).toHaveBeenCalledWith(expect.stringContaining('Ignoring unsupported initialSessionOptions'));
	});

	it('logs parse failures when streamed log content is malformed', () => {
		const logService = new RecordingLogService();

		const result = parseSessionLogChunksSafely('data: {not-json}', logService, () => {
			throw new SyntaxError('Unexpected token');
		});

		expect(result).toEqual([]);
		expect(logService.error).toHaveBeenCalledWith(expect.any(SyntaxError), expect.stringContaining('Failed to parse streamed log content'));
	});
});

describe('ChatSessionContentBuilder', () => {
	it('ignores malformed tool_calls payloads instead of throwing', async () => {
		const builder = new ChatSessionContentBuilder('copilot-cloud-agent', new TestGitService(), new TestLogService());
		const logs = [
			'data: {"choices":[{"finish_reason":"stop","delta":{"role":"assistant","content":"Cloud reply","tool_calls":{"id":"not-an-array"}}}],"created":0,"id":"chunk-1","usage":{"completion_tokens":0,"prompt_tokens":0,"prompt_tokens_details":{"cached_tokens":0},"total_tokens":0},"model":"test-model","object":"chat.completion.chunk"}',
		].join('\n');

		const history = await builder.buildSessionHistory(
			Promise.resolve('Continue in cloud'),
			[createSession()],
			createPullRequest(),
			async () => logs,
			Promise.resolve([]),
		);

		expect(history).toHaveLength(2);
		const responseTurn = history[1];
		expect(responseTurn).toBeInstanceOf(ChatResponseTurn2);
		if (!(responseTurn instanceof ChatResponseTurn2)) {
			throw new Error('Expected a response turn.');
		}

		expect(responseTurn.response).toHaveLength(1);
		expect(responseTurn.response[0]).toBeInstanceOf(ChatResponseMarkdownPart);
		if (!(responseTurn.response[0] instanceof ChatResponseMarkdownPart)) {
			throw new Error('Expected markdown response content.');
		}

		expect(responseTurn.response[0].value.value).toBe('Cloud reply');
	});
});

// --- Task API (v2) history rendering ------------------------------------------------------

interface MakeEventOpts {
	readonly id?: string;
	readonly dismissed?: boolean;
	readonly parentId?: string | null;
}

function evt(type: string, data: Record<string, unknown>, opts: MakeEventOpts = {}): AgentTaskSessionEvent {
	return {
		id: opts.id ?? `${type}-${Math.random().toString(36).slice(2, 8)}`,
		timestamp: '2026-03-27T00:00:00Z',
		parentId: opts.parentId ?? null,
		dismissed: opts.dismissed,
		type,
		data,
	} as unknown as AgentTaskSessionEvent;
}

function userMessage(content: string): AgentTaskSessionEvent {
	// Real user input: agent host rewrites content into transformedContent (longer), so
	// they differ. The builder uses this divergence to identify user-authored messages.
	return evt('user.message', { content, transformedContent: `${content}\n\n<context>...</context>` });
}

function makeTask(sessions: Array<{ state: string; prompt?: string }> = []): AgentTaskGetResponse {
	return {
		id: 'task-1',
		state: 'completed',
		created_at: '2026-03-27T00:00:00Z',
		sessions: sessions.map((s, i) => ({
			id: `s-${i}`,
			state: s.state,
			created_at: '2026-03-27T00:00:00Z',
			prompt: s.prompt,
		})),
	} as unknown as AgentTaskGetResponse;
}

/** Summarise a chat history into a comparable shape: turn kind + content snippets. */
function summarise(history: ReadonlyArray<vscode.ChatRequestTurn | ChatResponseTurn2>): unknown {
	return history.map(turn => {
		if (turn instanceof ChatRequestTurn2) {
			return { kind: 'request', prompt: turn.prompt };
		}
		if (turn instanceof ChatResponseTurn2) {
			return {
				kind: 'response',
				parts: turn.response.map(p => {
					if (p instanceof ChatResponseMarkdownPart) {
						return { type: 'markdown', value: p.value.value };
					}
					if (p instanceof ChatToolInvocationPart) {
						return { type: 'tool', toolName: p.toolName, toolCallId: p.toolCallId };
					}
					return { type: p.constructor.name };
				}),
			};
		}
		return { kind: 'other' };
	});
}

describe('ChatSessionContentBuilder Task API history', () => {
	const newBuilder = () =>
		new ChatSessionContentBuilder('copilot-cloud-agent', new TestGitService(), new TestLogService());

	it('suppresses bootstrap events before the first user-authored message and splits turns at user-authored boundaries', async () => {
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
			evt('assistant.message', { messageId: 'boot-1', content: 'Cloning repo…' }), // bootstrap — suppressed
			evt('tool.execution_start', { toolCallId: 'tc-boot', name: 'clone_repo' }), // bootstrap — suppressed
			userMessage('First user prompt'),
			evt('assistant.message', { messageId: 'turn-1', content: 'First reply' }),
			userMessage('Follow-up prompt'),
			evt('assistant.message', { messageId: 'turn-2', content: 'Second reply' }),
		];

		const history = await newBuilder().buildTaskHistory(makeTask([{ state: 'completed' }]), events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'First user prompt' },
			{ kind: 'response', parts: [{ type: 'markdown', value: 'First reply' }] },
			{ kind: 'request', prompt: 'Follow-up prompt' },
			{ kind: 'response', parts: [{ type: 'markdown', value: 'Second reply' }] },
		]);
	});

	it('eager-renders tool requests from assistant.message.toolRequests and dedupes the matching tool.execution_complete', async () => {
		const events: AgentTaskSessionEvent[] = [
			userMessage('Edit something'),
			evt('assistant.message', {
				messageId: 'm-1',
				content: 'Here is the raw diff the model would dump', // intermediate narration — suppressed
				toolRequests: [{ toolCallId: 'tc-edit', name: 'edit', arguments: { path: '/tmp/workspace/owner/repo/src/foo.ts' } }],
			}),
			evt('tool.execution_complete', { toolCallId: 'tc-edit', success: true, result: '' }),
			evt('assistant.message', { messageId: 'turn-1', content: 'Done.' }),
		];

		const history = await newBuilder().buildTaskHistory(makeTask([{ state: 'completed' }]), events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'Edit something' },
			{
				kind: 'response',
				parts: [
					{ type: 'tool', toolName: 'Edit', toolCallId: 'tc-edit' }, // only one card despite both events
					{ type: 'markdown', value: 'Done.' },
				],
			},
		]);
	});

	it('suppresses intermediate narration but renders the final pure-text assistant message', async () => {
		const events: AgentTaskSessionEvent[] = [
			userMessage('Run a tool'),
			evt('assistant.message', {
				messageId: 'm-1',
				content: 'About to commit and push:', // intermediate (has toolRequests)
				toolRequests: [{ toolCallId: 'tc-prog', name: 'report_progress', arguments: {} }],
			}),
			// Final reply: pure text, no toolRequests.
			evt('assistant.message', { messageId: 'turn-1', content: 'All done!' }),
		];

		const history = await newBuilder().buildTaskHistory(makeTask([{ state: 'completed' }]), events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'Run a tool' },
			{
				kind: 'response',
				parts: [
					{ type: 'tool', toolName: 'Progress Update', toolCallId: 'tc-prog' },
					{ type: 'markdown', value: 'All done!' },
				],
			},
		]);
	});

	it('synthesises a single turn from the first session prompt when no user.message has arrived yet', async () => {
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
			// No user.message — task still bootstrapping.
		];
		const task = makeTask([{ state: 'in_progress', prompt: 'Original prompt from creation' }]);

		const history = await newBuilder().buildTaskHistory(task, events, undefined, Promise.resolve([]));

		// First turn uses the session prompt, not the AI-generated task title.
		expect(history[0]).toBeInstanceOf(ChatRequestTurn2);
		const req = history[0] as ChatRequestTurn2;
		expect(req.prompt).toBe('Original prompt from creation');
	});
});
