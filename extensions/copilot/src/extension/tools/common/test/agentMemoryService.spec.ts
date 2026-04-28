/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryPromptResponse } from '@github/copilot-agentic-tools/memory';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { AgentMemoryService } from '../agentMemoryService';

vi.mock('@github/copilot-agentic-tools/memory', () => ({
	fetchMemoryPrompts: vi.fn(),
	storeMemory: vi.fn(),
}));

import { fetchMemoryPrompts, storeMemory } from '@github/copilot-agentic-tools/memory';

const mockResponse: MemoryPromptResponse = {
	memoriesContext: { prompt: 'mem prompt', promptVersion: '1.0', memoriesCount: 5 },
	storeInstructions: { prompt: 'store instructions', promptVersion: '1.0' },
	toolDefinition: { name: 'store_memory', description: 'Store a memory', definitionVersion: '1.1.1' },
	storeToolDefinition: { name: 'store_memory', description: 'Store a memory', definitionVersion: '1.1.1' },
};

const memory = { subject: 'test', fact: 'a fact', citations: [], reason: 'useful' };

function makeDeps({ enabled = true, token = 'tok', repoNwo = 'owner/repo' } = {}) {
	const disposeFns: ((sessionId: string) => void)[] = [];
	const chatSessionService = {
		onDidDisposeChatSession: (fn: (sessionId: string) => void) => {
			disposeFns.push(fn);
			return { dispose: () => { } };
		},
		fireDispose: (sessionId: string) => disposeFns.forEach(fn => fn(sessionId)),
	};

	const workspaceFolders = repoNwo ? [{ uri: { fsPath: '/repo' } }] : [];
	const mockRepo = repoNwo ? {
		remoteFetchUrls: [`https://github.com/${repoNwo}.git`],
		remotes: ['origin'],
		worktrees: [],
	} : undefined;

	return {
		logService: new TestLogService(),
		capiClientService: { capiPingURL: 'https://api.github.com/copilot_internal/v2/_ping' },
		gitService: {
			getRepository: vi.fn().mockResolvedValue(mockRepo),
		},
		workspaceService: { getWorkspaceFolders: vi.fn().mockReturnValue(workspaceFolders) },
		configService: { getExperimentBasedConfig: vi.fn().mockReturnValue(enabled) },
		experimentationService: {},
		authenticationService: {
			getGitHubSession: vi.fn().mockResolvedValue(token ? { accessToken: token } : undefined),
		},
		chatSessionService,
	};
}

function makeService(deps = makeDeps()) {
	return new (AgentMemoryService as any)(
		deps.logService,
		deps.capiClientService,
		deps.gitService,
		deps.workspaceService,
		deps.configService,
		deps.experimentationService,
		deps.authenticationService,
		deps.chatSessionService,
	) as AgentMemoryService;
}

describe('AgentMemoryService', () => {
	beforeEach(() => {
		vi.mocked(fetchMemoryPrompts).mockResolvedValue(mockResponse);
		vi.mocked(storeMemory).mockResolvedValue({ success: true });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getMemoryPrompt — cache lifecycle', () => {
		it('fetches and caches response when sessionId is provided', async () => {
			const svc = makeService();
			const result = await svc.getMemoryPrompt(undefined, 'session-1');
			expect(result).toBe(mockResponse);
			expect(vi.mocked(fetchMemoryPrompts)).toHaveBeenCalledTimes(1);
		});

		it('returns cached response on second call with same sessionId', async () => {
			const svc = makeService();
			await svc.getMemoryPrompt(undefined, 'session-1');
			const result = await svc.getMemoryPrompt(undefined, 'session-1');
			expect(result).toBe(mockResponse);
			expect(vi.mocked(fetchMemoryPrompts)).toHaveBeenCalledTimes(1);
		});

		it('fetches independently for different sessionIds', async () => {
			const svc = makeService();
			await svc.getMemoryPrompt(undefined, 'session-1');
			await svc.getMemoryPrompt(undefined, 'session-2');
			expect(vi.mocked(fetchMemoryPrompts)).toHaveBeenCalledTimes(2);
		});

		it('does not cache when no sessionId is provided', async () => {
			const svc = makeService();
			await svc.getMemoryPrompt(undefined, undefined);
			await svc.getMemoryPrompt(undefined, undefined);
			expect(vi.mocked(fetchMemoryPrompts)).toHaveBeenCalledTimes(2);
		});

		it('returns undefined when config is disabled', async () => {
			const svc = makeService(makeDeps({ enabled: false }));
			const result = await svc.getMemoryPrompt(undefined, 'session-1');
			expect(result).toBeUndefined();
			expect(vi.mocked(fetchMemoryPrompts)).not.toHaveBeenCalled();
		});

		it('returns undefined when auth token is missing', async () => {
			const svc = makeService(makeDeps({ token: '' }));
			const result = await svc.getMemoryPrompt(undefined, 'session-1');
			expect(result).toBeUndefined();
		});

		it('returns undefined and does not throw when fetchMemoryPrompts throws', async () => {
			vi.mocked(fetchMemoryPrompts).mockRejectedValue(new Error('network error'));
			const svc = makeService();
			const result = await svc.getMemoryPrompt(undefined, 'session-1');
			expect(result).toBeUndefined();
		});
	});

	describe('getCachedMemoryPrompt', () => {
		it('returns cached response for a known sessionId', async () => {
			const svc = makeService();
			await svc.getMemoryPrompt(undefined, 'session-1');
			expect(svc.getCachedMemoryPrompt('session-1')).toBe(mockResponse);
		});

		it('returns undefined for an unknown sessionId', async () => {
			const svc = makeService();
			expect(svc.getCachedMemoryPrompt('unknown')).toBeUndefined();
		});

		it('returns first cached entry when no sessionId is provided', async () => {
			const svc = makeService();
			await svc.getMemoryPrompt(undefined, 'session-1');
			expect(svc.getCachedMemoryPrompt()).toBe(mockResponse);
		});

		it('returns undefined when cache is empty and no sessionId is provided', () => {
			const svc = makeService();
			expect(svc.getCachedMemoryPrompt()).toBeUndefined();
		});
	});

	describe('clearCache', () => {
		it('removes a specific session from the cache', async () => {
			const svc = makeService();
			await svc.getMemoryPrompt(undefined, 'session-1');
			svc.clearCache('session-1');
			expect(svc.getCachedMemoryPrompt('session-1')).toBeUndefined();
		});

		it('does not remove other sessions when clearing a specific one', async () => {
			const svc = makeService();
			await svc.getMemoryPrompt(undefined, 'session-1');
			await svc.getMemoryPrompt(undefined, 'session-2');
			svc.clearCache('session-1');
			expect(svc.getCachedMemoryPrompt('session-2')).toBe(mockResponse);
		});

		it('clears all sessions when called without sessionId', async () => {
			const svc = makeService();
			await svc.getMemoryPrompt(undefined, 'session-1');
			await svc.getMemoryPrompt(undefined, 'session-2');
			svc.clearCache();
			expect(svc.getCachedMemoryPrompt('session-1')).toBeUndefined();
			expect(svc.getCachedMemoryPrompt('session-2')).toBeUndefined();
		});

		it('clears session cache when onDidDisposeChatSession fires', async () => {
			const deps = makeDeps();
			const svc = makeService(deps);
			await svc.getMemoryPrompt(undefined, 'session-1');
			expect(svc.getCachedMemoryPrompt('session-1')).toBe(mockResponse);
			deps.chatSessionService.fireDispose('session-1');
			expect(svc.getCachedMemoryPrompt('session-1')).toBeUndefined();
		});
	});

	describe('storeRepoMemory', () => {
		it('returns true on success', async () => {
			const result = await makeService().storeRepoMemory(memory);
			expect(result).toBe(true);
			expect(vi.mocked(storeMemory)).toHaveBeenCalledWith(
				memory,
				expect.objectContaining({ scope: 'repository', agent: 'vscode' }),
			);
		});

		it('returns false when config is disabled', async () => {
			const result = await makeService(makeDeps({ enabled: false })).storeRepoMemory(memory);
			expect(result).toBe(false);
			expect(vi.mocked(storeMemory)).not.toHaveBeenCalled();
		});

		it('returns false when auth token is missing', async () => {
			const result = await makeService(makeDeps({ token: '' })).storeRepoMemory(memory);
			expect(result).toBe(false);
		});

		it('returns false when repo NWO cannot be resolved', async () => {
			const result = await makeService(makeDeps({ repoNwo: '' })).storeRepoMemory(memory);
			expect(result).toBe(false);
		});

		it('returns false when storeMemory reports failure', async () => {
			vi.mocked(storeMemory).mockResolvedValue({ success: false, error: 'server error' });
			const result = await makeService().storeRepoMemory(memory);
			expect(result).toBe(false);
		});

		it('returns false and does not throw when storeMemory throws', async () => {
			vi.mocked(storeMemory).mockRejectedValue(new Error('network error'));
			const result = await makeService().storeRepoMemory(memory);
			expect(result).toBe(false);
		});

		it('passes baseModel when provided', async () => {
			await makeService().storeRepoMemory(memory, 'gpt-4o');
			expect(vi.mocked(storeMemory)).toHaveBeenCalledWith(
				memory,
				expect.objectContaining({ baseModel: 'gpt-4o' }),
			);
		});
	});

	describe('storeUserMemory', () => {
		it('returns true on success', async () => {
			const result = await makeService().storeUserMemory(memory);
			expect(result).toBe(true);
			expect(vi.mocked(storeMemory)).toHaveBeenCalledWith(
				memory,
				expect.objectContaining({ scope: 'user', agent: 'vscode' }),
			);
		});

		it('returns false when config is disabled', async () => {
			const result = await makeService(makeDeps({ enabled: false })).storeUserMemory(memory);
			expect(result).toBe(false);
			expect(vi.mocked(storeMemory)).not.toHaveBeenCalled();
		});

		it('returns false when auth token is missing', async () => {
			const result = await makeService(makeDeps({ token: '' })).storeUserMemory(memory);
			expect(result).toBe(false);
		});

		it('returns false when storeMemory reports failure', async () => {
			vi.mocked(storeMemory).mockResolvedValue({ success: false, error: 'server error' });
			const result = await makeService().storeUserMemory(memory);
			expect(result).toBe(false);
		});

		it('returns false and does not throw when storeMemory throws', async () => {
			vi.mocked(storeMemory).mockRejectedValue(new Error('network error'));
			const result = await makeService().storeUserMemory(memory);
			expect(result).toBe(false);
		});

		it('passes baseModel when provided', async () => {
			await makeService().storeUserMemory(memory, 'claude-3-5-sonnet');
			expect(vi.mocked(storeMemory)).toHaveBeenCalledWith(
				memory,
				expect.objectContaining({ baseModel: 'claude-3-5-sonnet' }),
			);
		});
	});
});
