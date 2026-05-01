/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { mock } from '../../../../util/common/test/simpleMock';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatSessionStatus } from '../../../../vscodeTypes';
import { IChatSessionMetadataStore } from '../../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeCheckpointService } from '../../common/chatSessionWorktreeCheckpointService';
import { IChatSessionWorktreeService } from '../../common/chatSessionWorktreeService';
import { IWorkspaceInfo } from '../../common/workspaceInfo';
import { IPullRequestDetectionService } from '../pullRequestDetectionService';
import { SessionCompletionInfo, SessionRequestLifecycle } from '../sessionRequestLifecycle';

// ─── Test Helpers ────────────────────────────────────────────────

class TestWorktreeService extends mock<IChatSessionWorktreeService>() {
	declare readonly _serviceBrand: undefined;
	override handleRequestCompleted = vi.fn(async () => { });
	override setWorktreeProperties = vi.fn(async () => { });
}

class TestCheckpointService extends mock<IChatSessionWorktreeCheckpointService>() {
	declare readonly _serviceBrand: undefined;
	override handleRequest = vi.fn(async () => { });
	override handleRequestCompleted = vi.fn(async () => { });
}

class TestWorkspaceFolderService extends mock<IChatSessionWorkspaceFolderService>() {
	declare readonly _serviceBrand: undefined;
	override handleRequestCompleted = vi.fn(async () => { });
	override trackSessionWorkspaceFolder = vi.fn(async () => { });
}

class TestPrDetectionService extends mock<IPullRequestDetectionService>() {
	declare readonly _serviceBrand: undefined;
	override onDidDetectPullRequest = Event.None;
	override handlePullRequestCreated = vi.fn();
}

class TestMetadataStore extends mock<IChatSessionMetadataStore>() {
	declare readonly _serviceBrand: undefined;
	override updateRequestDetails = vi.fn(async () => { });
}

class TestLogService extends mock<ILogService>() {
	declare readonly _serviceBrand: undefined;
	override error = vi.fn();
}

function makeRequest(id: string = 'req-1'): vscode.ChatRequest {
	return { id } as unknown as vscode.ChatRequest;
}

function makeSession(overrides?: Partial<SessionCompletionInfo>): SessionCompletionInfo {
	return {
		status: ChatSessionStatus.Completed,
		workspace: {
			folder: URI.file('/workspace') as unknown as vscode.Uri,
			repository: undefined,
			repositoryProperties: undefined,
			worktree: undefined,
			worktreeProperties: undefined,
		},
		createdPullRequestUrl: undefined,
		...overrides,
	};
}

function makeIsolatedSession(overrides?: Partial<SessionCompletionInfo>): SessionCompletionInfo {
	return makeSession({
		workspace: {
			folder: URI.file('/workspace') as unknown as vscode.Uri,
			repository: URI.file('/repo') as unknown as vscode.Uri,
			repositoryProperties: undefined,
			worktree: URI.file('/worktree') as unknown as vscode.Uri,
			worktreeProperties: {
				version: 2,
				baseCommit: 'abc',
				baseBranchName: 'main',
				branchName: 'copilot/test',
				repositoryPath: '/repo',
				worktreePath: '/worktree',
			},
		},
		...overrides,
	});
}

function makeToken(cancelled: boolean = false): vscode.CancellationToken {
	return { isCancellationRequested: cancelled, onCancellationRequested: vi.fn() } as unknown as vscode.CancellationToken;
}

function makeWorkspace(overrides?: Partial<IWorkspaceInfo>): IWorkspaceInfo {
	return {
		folder: URI.file('/workspace') as unknown as vscode.Uri,
		repository: undefined,
		repositoryProperties: undefined,
		worktree: undefined,
		worktreeProperties: undefined,
		...overrides,
	};
}

function makeIsolatedWorkspace(): IWorkspaceInfo {
	return makeWorkspace({
		repository: URI.file('/repo') as unknown as vscode.Uri,
		worktree: URI.file('/worktree') as unknown as vscode.Uri,
		worktreeProperties: {
			version: 2,
			baseCommit: 'abc',
			baseBranchName: 'main',
			branchName: 'copilot/test',
			repositoryPath: '/repo',
			worktreePath: '/worktree',
		},
	});
}

// ─── Tests ───────────────────────────────────────────────────────

describe('SessionRequestLifecycle', () => {
	let worktreeService: TestWorktreeService;
	let checkpointService: TestCheckpointService;
	let workspaceFolderService: TestWorkspaceFolderService;
	let prDetectionService: TestPrDetectionService;
	let metadataStore: TestMetadataStore;
	let logService: TestLogService;
	let handler: SessionRequestLifecycle;

	beforeEach(() => {
		vi.restoreAllMocks();
		worktreeService = new TestWorktreeService();
		checkpointService = new TestCheckpointService();
		workspaceFolderService = new TestWorkspaceFolderService();
		prDetectionService = new TestPrDetectionService();
		metadataStore = new TestMetadataStore();
		logService = new TestLogService();
		handler = new SessionRequestLifecycle(
			worktreeService,
			checkpointService,
			workspaceFolderService,
			prDetectionService,
			metadataStore,
			logService,
		);
	});

	describe('startRequest', () => {
		it('creates baseline checkpoint on first request', async () => {
			const request = makeRequest();
			await handler.startRequest('session-1', request, true, makeWorkspace());
			expect(checkpointService.handleRequest).toHaveBeenCalledWith('session-1');
		});

		it('skips baseline checkpoint on subsequent requests', async () => {
			const request = makeRequest();
			await handler.startRequest('session-1', request, false, makeWorkspace());
			expect(checkpointService.handleRequest).not.toHaveBeenCalled();
		});

		it('records request metadata with modeInstructions', async () => {
			const request = makeRequest();
			(request as any).modeInstructions2 = {
				name: 'test',
				content: 'instructions',
			};
			await handler.startRequest('session-1', request, false, makeWorkspace(), 'test-agent');

			expect(metadataStore.updateRequestDetails).toHaveBeenCalledWith(
				'session-1',
				[{
					vscodeRequestId: 'req-1',
					modeInstructions: expect.objectContaining({ name: 'test', content: 'instructions' }),
				}]
			);
		});

		it('records metadata without modeInstructions when request has no modeInstructions2', async () => {
			const request = makeRequest();
			await handler.startRequest('session-1', request, false, makeWorkspace(), 'test-agent');

			expect(metadataStore.updateRequestDetails).toHaveBeenCalledWith(
				'session-1',
				[{
					vscodeRequestId: 'req-1',
					modeInstructions: undefined,
				}]
			);
		});

		it('sets worktree properties on first request with worktree', async () => {
			const workspace = makeIsolatedWorkspace();
			await handler.startRequest('session-1', makeRequest(), true, workspace);

			expect(worktreeService.setWorktreeProperties).toHaveBeenCalledWith(
				'session-1',
				expect.objectContaining({ branchName: 'copilot/test' })
			);
		});

		it('does not set worktree properties on subsequent requests', async () => {
			const workspace = makeIsolatedWorkspace();
			await handler.startRequest('session-1', makeRequest(), false, workspace);

			expect(worktreeService.setWorktreeProperties).not.toHaveBeenCalled();
		});

		it('tracks workspace folder for non-isolated session on first request', async () => {
			const workspace = makeWorkspace();
			await handler.startRequest('session-1', makeRequest(), true, workspace);

			expect(workspaceFolderService.trackSessionWorkspaceFolder).toHaveBeenCalled();
		});

		it('does not track workspace folder for isolated session', async () => {
			const workspace = makeIsolatedWorkspace();
			await handler.startRequest('session-1', makeRequest(), true, workspace);

			expect(workspaceFolderService.trackSessionWorkspaceFolder).not.toHaveBeenCalled();
		});
	});

	describe('endRequest', () => {
		it('commits worktree changes for isolated session', async () => {
			const request = makeRequest();
			const session = makeIsolatedSession();

			await handler.startRequest('session-1', request, false, makeWorkspace());
			await handler.endRequest('session-1', request, session, makeToken());

			expect(worktreeService.handleRequestCompleted).toHaveBeenCalledWith('session-1');
			expect(workspaceFolderService.handleRequestCompleted).not.toHaveBeenCalled();
			expect(checkpointService.handleRequestCompleted).toHaveBeenCalledWith('session-1', 'req-1');
		});

		it('stages workspace changes for non-isolated session with working directory', async () => {
			const request = makeRequest();
			const session = makeSession(); // non-isolated, has folder

			await handler.startRequest('session-1', request, false, makeWorkspace());
			await handler.endRequest('session-1', request, session, makeToken());

			expect(workspaceFolderService.handleRequestCompleted).toHaveBeenCalledWith('session-1');
			expect(worktreeService.handleRequestCompleted).not.toHaveBeenCalled();
			expect(checkpointService.handleRequestCompleted).toHaveBeenCalledWith('session-1', 'req-1');
		});

		it('skips commit/stage when session status is not Completed', async () => {
			const request = makeRequest();
			const session = makeSession({ status: ChatSessionStatus.InProgress });

			await handler.startRequest('session-1', request, false, makeWorkspace());
			await handler.endRequest('session-1', request, session, makeToken());

			expect(worktreeService.handleRequestCompleted).not.toHaveBeenCalled();
			expect(workspaceFolderService.handleRequestCompleted).not.toHaveBeenCalled();
			expect(checkpointService.handleRequestCompleted).not.toHaveBeenCalled();
		});

		it('skips commit/stage when session status is undefined', async () => {
			const request = makeRequest();
			const session = makeSession({ status: undefined });

			await handler.startRequest('session-1', request, false, makeWorkspace());
			await handler.endRequest('session-1', request, session, makeToken());

			expect(worktreeService.handleRequestCompleted).not.toHaveBeenCalled();
			expect(workspaceFolderService.handleRequestCompleted).not.toHaveBeenCalled();
		});

		it('skips workspace commit when no working directory', async () => {
			const request = makeRequest();
			const session = makeSession({
				workspace: {
					folder: undefined,
					repository: undefined,
					repositoryProperties: undefined,
					worktree: undefined,
					worktreeProperties: undefined,
				},
			});

			await handler.startRequest('session-1', request, false, makeWorkspace());
			await handler.endRequest('session-1', request, session, makeToken());

			expect(worktreeService.handleRequestCompleted).not.toHaveBeenCalled();
			expect(workspaceFolderService.handleRequestCompleted).not.toHaveBeenCalled();
			// Checkpoint should still be created
			expect(checkpointService.handleRequestCompleted).toHaveBeenCalled();
		});

		it('defers handling when multiple requests are in flight (steering)', async () => {
			const req1 = makeRequest('req-1');
			const req2 = makeRequest('req-2');
			const session = makeSession();

			await handler.startRequest('session-1', req1, false, makeWorkspace());
			await handler.startRequest('session-1', req2, false, makeWorkspace());

			// First request completes — should defer (2 pending)
			await handler.endRequest('session-1', req1, session, makeToken());
			expect(worktreeService.handleRequestCompleted).not.toHaveBeenCalled();
			expect(workspaceFolderService.handleRequestCompleted).not.toHaveBeenCalled();
			expect(checkpointService.handleRequestCompleted).not.toHaveBeenCalled();

			// Second (last) request completes — should proceed
			await handler.endRequest('session-1', req2, session, makeToken());
			expect(workspaceFolderService.handleRequestCompleted).toHaveBeenCalledWith('session-1');
			expect(checkpointService.handleRequestCompleted).toHaveBeenCalledWith('session-1', 'req-2');
		});

		it('skips everything when token is cancelled', async () => {
			const request = makeRequest();
			const session = makeSession();

			await handler.startRequest('session-1', request, false, makeWorkspace());
			await handler.endRequest('session-1', request, session, makeToken(true));

			expect(worktreeService.handleRequestCompleted).not.toHaveBeenCalled();
			expect(workspaceFolderService.handleRequestCompleted).not.toHaveBeenCalled();
			expect(checkpointService.handleRequestCompleted).not.toHaveBeenCalled();
		});

		it('calls PR detection service on completion', async () => {
			const request = makeRequest();
			const session = makeSession();

			await handler.startRequest('session-1', request, false, makeWorkspace());
			await handler.endRequest('session-1', request, session, makeToken());

			// PR detection is fire-and-forget; wait for microtask
			await new Promise(resolve => setTimeout(resolve, 10));
			expect(prDetectionService.handlePullRequestCreated).toHaveBeenCalledWith('session-1', undefined);
		});

		it('cleans up tracked request even when commit throws', async () => {
			workspaceFolderService.handleRequestCompleted.mockRejectedValue(new Error('commit failed'));
			const request = makeRequest();
			const session = makeSession();

			await handler.startRequest('session-1', request, false, makeWorkspace());
			await expect(handler.endRequest('session-1', request, session, makeToken())).rejects.toThrow('commit failed');

			// After the error, a new request for the same session should proceed normally
			workspaceFolderService.handleRequestCompleted.mockResolvedValue();
			const req2 = makeRequest('req-2');
			await handler.startRequest('session-1', req2, false, makeWorkspace());
			await handler.endRequest('session-1', req2, session, makeToken());
			expect(workspaceFolderService.handleRequestCompleted).toHaveBeenCalledTimes(2);
		});

		it('handles request without prior tracking gracefully', async () => {
			const request = makeRequest();
			const session = makeSession();

			// Not tracked, but should still work (pendingRequests is undefined → size check skipped)
			await handler.endRequest('session-1', request, session, makeToken());
			expect(workspaceFolderService.handleRequestCompleted).toHaveBeenCalled();
		});
	});
});
