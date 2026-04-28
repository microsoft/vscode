/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, beforeEach, describe, expect, suite, test } from 'vitest';
import type { MemoryPromptResponse, StoreMemoryRequest } from '@github/copilot-agentic-tools/memory';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IAgentMemoryService } from '../../common/agentMemoryService';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { StoreMemoryTool } from '../storeMemoryTool';

function getResultText(result: { content: { value: string }[] }): string {
	return result.content.map((c: { value: string }) => c.value).join('');
}

function invokeTool(tool: StoreMemoryTool, input: object) {
	return tool.invoke({ input } as never, CancellationToken.None);
}

class TrackingMemoryService implements IAgentMemoryService {
	declare readonly _serviceBrand: undefined;

	repoMemories: StoreMemoryRequest[] = [];
	userMemories: StoreMemoryRequest[] = [];
	shouldSucceed = true;
	cachedResponse: MemoryPromptResponse | undefined = undefined;

	async getMemoryPrompt(_repoNwo?: string, _sessionId?: string): Promise<MemoryPromptResponse | undefined> { return undefined; }
	getCachedMemoryPrompt(_sessionId?: string): MemoryPromptResponse | undefined { return this.cachedResponse; }
	clearCache(_sessionId?: string): void { }

	async storeRepoMemory(memory: StoreMemoryRequest): Promise<boolean> {
		if (this.shouldSucceed) {
			this.repoMemories.push(memory);
		}
		return this.shouldSucceed;
	}

	async storeUserMemory(memory: StoreMemoryRequest): Promise<boolean> {
		if (this.shouldSucceed) {
			this.userMemories.push(memory);
		}
		return this.shouldSucceed;
	}

	clear(): void {
		this.repoMemories = [];
		this.userMemories = [];
		this.shouldSucceed = true;
		this.cachedResponse = undefined;
	}
}

class FailingMemoryService extends TrackingMemoryService {
	override async storeRepoMemory(_memory: StoreMemoryRequest): Promise<boolean> {
		throw new Error('Network error');
	}
	override async storeUserMemory(_memory: StoreMemoryRequest): Promise<boolean> {
		throw new Error('Network error');
	}
}

suite('StoreMemoryTool', () => {
	let accessor: ITestingServicesAccessor;
	let mockMemoryService: TrackingMemoryService;
	let tool: StoreMemoryTool;

	const baseInput = {
		subject: 'test subject',
		fact: 'test fact',
		citations: ['src/foo.ts:10'],
		reason: 'This is useful for future tasks.',
	};

	beforeAll(() => {
		const services = createExtensionUnitTestingServices();
		mockMemoryService = new TrackingMemoryService();
		services.define(IAgentMemoryService, mockMemoryService);
		accessor = services.createTestingAccessor();
	});

	afterAll(() => {
		accessor.dispose();
	});

	beforeEach(() => {
		tool = accessor.get(IInstantiationService).createInstance(StoreMemoryTool);
		mockMemoryService.clear();
	});

	describe('scope routing', () => {
		test('routes to storeRepoMemory when scope is repo', async () => {
			const result = await invokeTool(tool, { ...baseInput, scope: 'repo' });
			expect(getResultText(result as never)).toBe('Memory stored successfully.');
			expect(mockMemoryService.repoMemories).toHaveLength(1);
			expect(mockMemoryService.userMemories).toHaveLength(0);
		});

		test('routes to storeUserMemory when scope is user', async () => {
			const result = await invokeTool(tool, { ...baseInput, scope: 'user' });
			expect(getResultText(result as never)).toBe('Memory stored successfully.');
			expect(mockMemoryService.userMemories).toHaveLength(1);
			expect(mockMemoryService.repoMemories).toHaveLength(0);
		});

		test('defaults to repo scope when scope is not provided', async () => {
			const result = await invokeTool(tool, baseInput);
			expect(getResultText(result as never)).toBe('Memory stored successfully.');
			expect(mockMemoryService.repoMemories).toHaveLength(1);
			expect(mockMemoryService.userMemories).toHaveLength(0);
		});
	});

	describe('memory payload', () => {
		test('passes subject, fact, citations, and reason to service', async () => {
			await invokeTool(tool, { ...baseInput, scope: 'repo' });
			const stored = mockMemoryService.repoMemories[0];
			expect(stored.subject).toBe('test subject');
			expect(stored.fact).toBe('test fact');
			expect(stored.citations).toEqual(['src/foo.ts:10']);
			expect(stored.reason).toBe('This is useful for future tasks.');
		});

		test('passes empty citations array when provided', async () => {
			await invokeTool(tool, { ...baseInput, scope: 'user', citations: [] });
			expect(mockMemoryService.userMemories[0].citations).toEqual([]);
		});

		test('passes empty citations array when omitted', async () => {
			const { citations: _, ...inputWithoutCitations } = baseInput;
			await invokeTool(tool, { ...inputWithoutCitations, scope: 'repo' });
			expect(mockMemoryService.repoMemories[0].citations).toEqual([]);
		});
	});

	describe('failure handling', () => {
		test('returns failure message for repo scope when service returns false', async () => {
			mockMemoryService.shouldSucceed = false;
			const result = await invokeTool(tool, { ...baseInput, scope: 'repo' });
			const text = getResultText(result as never);
			expect(text).toContain('Failed to store memory');
		});

		test('returns failure message for user scope when service returns false', async () => {
			mockMemoryService.shouldSucceed = false;
			const result = await invokeTool(tool, { ...baseInput, scope: 'user' });
			const text = getResultText(result as never);
			expect(text).toContain('Failed to store memory');
		});

		test('returns error message when service throws', async () => {
			const services = createExtensionUnitTestingServices();
			services.define(IAgentMemoryService, new FailingMemoryService());
			const throwingAccessor = services.createTestingAccessor();
			try {
				const throwingTool = throwingAccessor.get(IInstantiationService).createInstance(StoreMemoryTool);
				const result = await invokeTool(throwingTool, { ...baseInput, scope: 'repo' });
				const text = getResultText(result as never);
				expect(text).toContain('Failed to store memory');
				expect(text).toContain('try again');
			} finally {
				throwingAccessor.dispose();
			}
		});
	});

	describe('alternativeDefinition', () => {
		const staticTool = {
			name: 'store_memory',
			description: 'static description',
			inputSchema: { type: 'object', properties: {} },
		} as unknown as import('vscode').LanguageModelToolInformation;

		test('returns static tool unchanged when cache is empty', () => {
			const result = tool.alternativeDefinition(staticTool);
			expect(result).toBe(staticTool);
		});

		test('returns static tool unchanged when storeToolDefinition is absent from cached response', () => {
			mockMemoryService.cachedResponse = {
				memoriesContext: { prompt: '', promptVersion: '1.0', memoriesCount: 0 },
				storeInstructions: { prompt: '', promptVersion: '1.0' },
				toolDefinition: { name: 'store_memory', description: 'server desc', definitionVersion: '1.1.1' },
				storeToolDefinition: undefined as never,
			};
			const result = tool.alternativeDefinition(staticTool);
			expect(result).toBe(staticTool);
		});

		test('overrides description and inputSchema from cached storeToolDefinition', () => {
			mockMemoryService.cachedResponse = {
				memoriesContext: { prompt: '', promptVersion: '1.0', memoriesCount: 0 },
				storeInstructions: { prompt: '', promptVersion: '1.0' },
				toolDefinition: { name: 'store_memory', description: 'server desc', definitionVersion: '1.1.1' },
				storeToolDefinition: { name: 'store_memory', description: 'server desc', definitionVersion: '1.1.1' },
			};
			const result = tool.alternativeDefinition(staticTool);
			expect(result).not.toBe(staticTool);
			expect(result.description).toBe('server desc');
			expect(result.inputSchema).toBeDefined();
			expect(result.inputSchema).not.toBe(staticTool.inputSchema);
		});
	});
});
