/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { AgentTask, AgentTaskCreateRequest, AgentTaskGetResponse, AgentTaskListEventsResponse, AgentTaskListResponse, AgentTaskSessionEvent, AgentTaskState, AgentTaskSteerRequest, AgentTaskCreatePullRequestResponse } from '@vscode/copilot-api';
import { GithubRepoId, IGitService } from '../../../../platform/git/common/gitService';
import { PullRequestSearchItem, SessionInfo } from '../../../../platform/github/common/githubAPI';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { mock } from '../../../../util/common/test/simpleMock';
import { ChatRequestTurn2, ChatResponseMarkdownPart, ChatResponseTurn2, ChatToolInvocationPart } from '../../../../vscodeTypes';
import { ITaskApiClient, ListTaskEventsOptions, ListTasksOptions } from '../../common/taskApiTypes';
import { ChatSessionContentBuilder, extractTaskErrorDetail, formatTaskStoppedMessage } from '../copilotCloudSessionContentBuilder';
import { normalizeInitialSessionOptions, parseSessionLogChunksSafely, taskStateToChatSessionStatus } from '../copilotCloudSessionsProvider';
import { TaskApiBackend, parseRepoFromTaskUrl, isCloudCodingAgentTask } from '../taskApiBackend';
import { NullCloudBackendInstrumentation } from '../cloudBackendTelemetry';
import { MockOctoKitService } from '../../../agents/vscode-node/test/mockOctoKitService';

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

function makeTask(sessions: Array<{ state: string; prompt?: string }> = [], taskState: string = 'completed'): AgentTaskGetResponse {
	return {
		id: 'task-1',
		state: taskState,
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

	it('renders a stopped notice (not a progress spinner) when the task terminally failed but its latest session state is still active', async () => {
		// "Failed to launch agent": the task ends in `failed` while its only session's state is
		// stuck at `in_progress` and no renderable events were ever emitted. Keying off the task
		// state must surface the stop instead of a perpetual "Session is in progress…" spinner.
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
		];
		const task = makeTask([{ state: 'in_progress', prompt: 'Do the thing' }], 'failed');

		const history = await newBuilder().buildTaskHistory(task, events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'Do the thing' },
			{ kind: 'response', parts: [{ type: 'markdown', value: 'Copilot stopped: an error occurred' }] },
		]);
	});

	it('renders a cancellation reason (not an error) when the task was cancelled with no error event', async () => {
		// A cancelled task emits no session.error/session.shutdown; the reason comes from the state.
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
			userMessage('one more'),
		];
		const task = makeTask([{ state: 'cancelled', prompt: 'Do the thing' }], 'cancelled');

		const history = await newBuilder().buildTaskHistory(task, events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'one more' },
			{ kind: 'response', parts: [{ type: 'markdown', value: 'Copilot stopped: cancelled' }] },
		]);
	});

	it('includes the concrete error detail from a bootstrap session.error in the stopped notice', async () => {
		// A `session.error` emitted during bootstrap (before any user.message) is suppressed from
		// the rendered turn, but its detail is still surfaced in the terminal-stopped notice.
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
			evt('session.error', { errorType: 'launch_failed', message: 'Failed to launch agent' }),
		];
		const task = makeTask([{ state: 'in_progress', prompt: 'Do the thing' }], 'failed');

		const history = await newBuilder().buildTaskHistory(task, events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'Do the thing' },
			{ kind: 'response', parts: [{ type: 'markdown', value: 'Copilot stopped: (launch_failed) Failed to launch agent' }] },
		]);
	});

	it('still shows the in-progress spinner when the task is active with no renderable events yet', async () => {
		const events: AgentTaskSessionEvent[] = [
			evt('session.requested', {}),
			evt('session.start', {}),
		];
		const task = makeTask([{ state: 'in_progress', prompt: 'Do the thing' }], 'in_progress');

		const history = await newBuilder().buildTaskHistory(task, events, undefined, Promise.resolve([]));

		expect(summarise(history)).toEqual([
			{ kind: 'request', prompt: 'Do the thing' },
			{ kind: 'response', parts: [{ type: 'ChatResponseProgressPart' }] },
		]);
	});
});

describe('extractTaskErrorDetail / formatTaskStoppedMessage', () => {
	it('prefers the last session.error message, falls back to session.shutdown errorReason, else undefined', () => {
		expect(extractTaskErrorDetail([
			evt('session.error', { errorType: 'launch_failed', message: 'Failed to launch agent' }),
		])).toBe('(launch_failed) Failed to launch agent');

		expect(extractTaskErrorDetail([
			evt('session.error', { message: 'boom' }),
		])).toBe('boom');

		expect(extractTaskErrorDetail([
			evt('session.error', { errorType: 'x', message: 'first' }, { dismissed: true }),
			evt('session.shutdown', { shutdownType: 'error', errorReason: 'agent crashed' }),
		])).toBe('agent crashed');

		expect(extractTaskErrorDetail([
			evt('session.shutdown', { shutdownType: 'routine' }),
			evt('session.start', {}),
		])).toBeUndefined();
	});

	it('uses the detail when present, else a state-derived reason', () => {
		expect(formatTaskStoppedMessage('failed', '(launch_failed) Failed to launch agent'))
			.toBe('Copilot stopped: (launch_failed) Failed to launch agent');
		expect(formatTaskStoppedMessage('cancelled', undefined)).toBe('Copilot stopped: cancelled');
		expect(formatTaskStoppedMessage('timed_out', undefined)).toBe('Copilot stopped: timed out');
		expect(formatTaskStoppedMessage('failed', undefined)).toBe('Copilot stopped: an error occurred');
	});
});

// --- TaskApiBackend (v2) -------------------------------------------------------------------

class FakeTaskApiClient implements ITaskApiClient {
	public lastCreateRequest: AgentTaskCreateRequest | undefined;
	public createPRCalls: Array<{ owner: string; repo: string; taskId: string }> = [];
	public listForRepoCalls: Array<{ owner: string; repo: string; options?: ListTasksOptions }> = [];
	public listCalls: Array<{ options?: ListTasksOptions }> = [];
	private readonly _createPRResult: AgentTaskCreatePullRequestResponse;
	private readonly _createResult: AgentTask;
	private readonly _repoTasks: readonly AgentTask[];

	constructor(opts?: { createResult?: AgentTask; createPRResult?: AgentTaskCreatePullRequestResponse; repoTasks?: readonly AgentTask[] }) {
		this._createResult = opts?.createResult ?? ({
			id: 'task-created',
			state: 'queued',
			created_at: '2026-03-27T00:00:00Z',
			html_url: 'https://github.com/octocat/hello-world/agents/tasks/task-created',
		} as unknown as AgentTask);
		this._createPRResult = opts?.createPRResult ?? { id: 1, number: 42, repository_id: 1 };
		this._repoTasks = opts?.repoTasks ?? [];
	}

	async createTask(_owner: string, _repo: string, request: AgentTaskCreateRequest): Promise<AgentTask> {
		this.lastCreateRequest = request;
		return this._createResult;
	}
	async listTasksForRepo(owner: string, repo: string, options?: ListTasksOptions): Promise<AgentTaskListResponse> {
		this.listForRepoCalls.push({ owner, repo, options });
		return { tasks: this._repoTasks } as unknown as AgentTaskListResponse;
	}
	async listTasks(options?: ListTasksOptions): Promise<AgentTaskListResponse> {
		this.listCalls.push({ options });
		return { tasks: [] } as unknown as AgentTaskListResponse;
	}
	async getTask(_taskId: string): Promise<AgentTaskGetResponse> {
		return { id: _taskId } as unknown as AgentTaskGetResponse;
	}
	async getTaskEvents(_taskId: string, _options?: ListTaskEventsOptions): Promise<AgentTaskListEventsResponse> {
		return { events: [] } as unknown as AgentTaskListEventsResponse;
	}
	async steerTask(_taskId: string, _request: AgentTaskSteerRequest): Promise<void> { }
	async createPRForTask(owner: string, repo: string, taskId: string): Promise<AgentTaskCreatePullRequestResponse> {
		this.createPRCalls.push({ owner, repo, taskId });
		return this._createPRResult;
	}
	async archiveTask(_owner: string, _repo: string, taskId: string): Promise<AgentTask> {
		return { id: taskId } as unknown as AgentTask;
	}
	async unarchiveTask(_owner: string, _repo: string, taskId: string): Promise<AgentTask> {
		return { id: taskId } as unknown as AgentTask;
	}
}

const fakeChatStream = {} as vscode.ChatResponseStream;
const noToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) } as unknown as vscode.CancellationToken;

describe('TaskApiBackend', () => {
	it('createSession sends create_pull_request: false so the v2 backend no longer auto-creates PRs', async () => {
		const client = new FakeTaskApiClient();
		const backend = new TaskApiBackend(client, new TestLogService(), new MockOctoKitService(), NullCloudBackendInstrumentation);

		await backend.createSession({
			owner: 'octocat',
			repo: 'hello-world',
			host: 'github.com',
			title: 'New task',
			prompt: 'Do the thing',
			problemStatement: 'Statement',
			baseRef: 'main',
		}, fakeChatStream, noToken);

		expect(client.lastCreateRequest?.create_pull_request).toBe(false);
	});

	it('createPullRequestForTask resolves owner/repo from the task html_url and delegates to createPRForTask', async () => {
		const client = new FakeTaskApiClient();
		const backend = new TaskApiBackend(client, new TestLogService(), new MockOctoKitService(), NullCloudBackendInstrumentation);

		const result = await backend.createPullRequestForTask({ id: 'task-1', html_url: 'https://github.com/octocat/hello-world/agents/tasks/task-1' } as AgentTaskGetResponse);

		expect(client.createPRCalls).toEqual([{ owner: 'octocat', repo: 'hello-world', taskId: 'task-1' }]);
		expect(result).toEqual({ id: 1, number: 42, repository_id: 1 });
	});

	it('createPullRequestForTask resolves the repo by id when the task has no html_url', async () => {
		const client = new FakeTaskApiClient();
		const octoKitService = new MockOctoKitService();
		octoKitService.getRepositoryById = async () => ({ owner: 'octocat', name: 'hello-world' });
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		await backend.createPullRequestForTask({ id: 'task-2', repository: { id: 123 } } as unknown as AgentTaskGetResponse);

		expect(client.createPRCalls).toEqual([{ owner: 'octocat', repo: 'hello-world', taskId: 'task-2' }]);
	});

	it('createPullRequestForTask throws when the repository cannot be resolved', async () => {
		const client = new FakeTaskApiClient();
		const backend = new TaskApiBackend(client, new TestLogService(), new MockOctoKitService(), NullCloudBackendInstrumentation);

		await expect(backend.createPullRequestForTask({ id: 'task-3' } as AgentTaskGetResponse)).rejects.toThrow();
		expect(client.createPRCalls).toEqual([]);
	});

	it('fetchSessionList scopes the repo task list to the current user via creator_id', async () => {
		const client = new FakeTaskApiClient();
		const octoKitService = new MockOctoKitService();
		octoKitService.getCurrentAuthedUser = async () => ({ id: 4242, login: 'octocat', name: 'The Octocat', avatar_url: '' });
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		await backend.fetchSessionList([new GithubRepoId('octocat', 'hello-world')], false, false);

		expect(client.listForRepoCalls).toEqual([
			{ owner: 'octocat', repo: 'hello-world', options: { per_page: 100, creator_id: 4242 } },
		]);
	});

	it('fetchSessionList fails closed (no repo fetch, empty result) when the current user id cannot be resolved', async () => {
		const client = new FakeTaskApiClient({ repoTasks: [{ id: 't1', state: 'completed', created_at: '2026-03-27T00:00:00Z', creator: { id: 999 } } as unknown as AgentTask] });
		const octoKitService = new MockOctoKitService();
		octoKitService.getCurrentAuthedUser = async () => undefined;
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		const result = await backend.fetchSessionList([new GithubRepoId('octocat', 'hello-world')], false, false);

		expect(client.listForRepoCalls).toEqual([]);
		expect(result).toEqual([]);
	});

	it('fetchSessionList does not send creator_id on the user-scoped global list', async () => {
		const client = new FakeTaskApiClient();
		const backend = new TaskApiBackend(client, new TestLogService(), new MockOctoKitService(), NullCloudBackendInstrumentation);

		await backend.fetchSessionList(undefined, false, false);

		expect(client.listForRepoCalls).toEqual([]);
		expect(client.listCalls).toEqual([{ options: { per_page: 100 } }]);
	});

	it('fetchSessionList carries the raw task lifecycle state so settled tasks are not shown as in_progress', async () => {
		// `idle` collapses to `in_progress` in the legacy SessionInfo shape; the raw `taskState`
		// must be preserved alongside it so the provider can render it as Completed/NeedsInput.
		const client = new FakeTaskApiClient({ repoTasks: [{ id: 't-idle', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'copilot-developer' }] } as unknown as AgentTask] });
		const octoKitService = new MockOctoKitService();
		octoKitService.getCurrentAuthedUser = async () => ({ id: 4242, login: 'octocat', name: 'The Octocat', avatar_url: '' });
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		const result = await backend.fetchSessionList([new GithubRepoId('octocat', 'hello-world')], false, false);

		expect(result.map(r => ({ taskState: r.taskState, sessionState: r.latestSession.state }))).toEqual([
			{ taskState: 'idle', sessionState: 'in_progress' },
		]);
	});

	it('fetchSessionList shows only cloud coding agent tasks and excludes local-client tasks (CLI / VS Code / JetBrains)', async () => {
		const repoTasks = [
			{ id: 'cloud-dev', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'copilot-developer' }] },
			{ id: 'cloud-swe', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'copilot-swe-agent' }] },
			{ id: 'cli', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'copilot-developer-cli' }] },
			{ id: 'vscode', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'vscode-chat' }] },
			{ id: 'jetbrains', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 }, agent_collaborators: [{ slug: 'jetbrains-chat' }] },
			{ id: 'no-collaborators', state: 'idle', created_at: '2026-03-27T00:00:00Z', creator: { id: 4242 } },
		] as unknown as readonly AgentTask[];
		const client = new FakeTaskApiClient({ repoTasks });
		const octoKitService = new MockOctoKitService();
		octoKitService.getCurrentAuthedUser = async () => ({ id: 4242, login: 'octocat', name: 'The Octocat', avatar_url: '' });
		const backend = new TaskApiBackend(client, new TestLogService(), octoKitService, NullCloudBackendInstrumentation);

		const result = await backend.fetchSessionList([new GithubRepoId('octocat', 'hello-world')], false, false);

		expect(result.map(r => r.latestSession.id)).toEqual(['cloud-dev', 'cloud-swe']);
	});
});

describe('isCloudCodingAgentTask', () => {
	it('keeps cloud coding agent slugs and rejects local-client / missing / malformed slugs', () => {
		const classify = (agent_collaborators?: Array<{ slug?: unknown }>) =>
			isCloudCodingAgentTask({ id: 't', state: 'idle', created_at: '2026-03-27T00:00:00Z', ...(agent_collaborators && { agent_collaborators }) } as unknown as AgentTask);

		expect({
			'copilot-developer': classify([{ slug: 'copilot-developer' }]),
			'copilot-swe-agent': classify([{ slug: 'copilot-swe-agent' }]),
			'copilot-developer-cli': classify([{ slug: 'copilot-developer-cli' }]),
			'vscode-chat': classify([{ slug: 'vscode-chat' }]),
			'jetbrains-chat': classify([{ slug: 'jetbrains-chat' }]),
			'missing-slug': classify([{}]),
			'null-slug': classify([{ slug: null }]),
			'no-collaborators': classify(undefined),
			'empty-collaborators': classify([]),
		}).toEqual({
			'copilot-developer': true,
			'copilot-swe-agent': true,
			'copilot-developer-cli': false,
			'vscode-chat': false,
			'jetbrains-chat': false,
			'missing-slug': false,
			'null-slug': false,
			'no-collaborators': false,
			'empty-collaborators': false,
		});
	});
});

describe('taskStateToChatSessionStatus', () => {
	it('maps each Task API lifecycle state to the right ChatSessionStatus', () => {
		const states: readonly AgentTaskState[] = ['queued', 'in_progress', 'idle', 'waiting_for_user', 'completed', 'failed', 'timed_out', 'cancelled'];
		const mapped = Object.fromEntries(states.map(state => [state, taskStateToChatSessionStatus(state)]));

		expect(mapped).toEqual({
			queued: vscode.ChatSessionStatus.InProgress,
			in_progress: vscode.ChatSessionStatus.InProgress,
			// Agent finished its turn / is waiting — must not look like active work.
			idle: vscode.ChatSessionStatus.Completed,
			waiting_for_user: vscode.ChatSessionStatus.NeedsInput,
			completed: vscode.ChatSessionStatus.Completed,
			failed: vscode.ChatSessionStatus.Failed,
			timed_out: vscode.ChatSessionStatus.Failed,
			cancelled: vscode.ChatSessionStatus.Failed,
		});
	});

	it('falls back to InProgress for an unknown/forward-compat state instead of returning undefined', () => {
		expect(taskStateToChatSessionStatus('some_new_server_state' as AgentTaskState)).toBe(vscode.ChatSessionStatus.InProgress);
	});
});

describe('parseRepoFromTaskUrl', () => {
	it('extracts owner and name from a task html_url', () => {
		expect(parseRepoFromTaskUrl('https://github.com/octocat/hello-world/agents/tasks/abc')).toEqual({ owner: 'octocat', name: 'hello-world' });
	});

	it('returns undefined for an unparseable URL', () => {
		expect(parseRepoFromTaskUrl('not-a-url')).toBeUndefined();
	});

	it('returns undefined when the path does not start with owner/repo', () => {
		expect(parseRepoFromTaskUrl('https://github.com/')).toBeUndefined();
	});

	it('returns undefined when the URL is undefined', () => {
		expect(parseRepoFromTaskUrl(undefined)).toBeUndefined();
	});
});
