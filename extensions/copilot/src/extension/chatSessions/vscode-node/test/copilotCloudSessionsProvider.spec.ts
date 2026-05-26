/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { IGitService } from '../../../../platform/git/common/gitService';
import { PullRequestSearchItem, SessionInfo } from '../../../../platform/github/common/githubAPI';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { mock } from '../../../../util/common/test/simpleMock';
import { ChatResponseMarkdownPart, ChatResponseTurn2 } from '../../../../vscodeTypes';
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
		const builder = new ChatSessionContentBuilder('copilot-cloud-agent', new TestGitService());
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
