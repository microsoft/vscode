/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatRequest } from 'vscode';
import { IChatHookService } from '../../../../platform/chat/common/chatHookService';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { MockChatHookService } from '../../../intents/test/node/mockChatHookService';
import { ExecutionSubagentToolCallingLoop, IExecutionSubagentToolCallingLoopOptions } from '../../node/executionSubagentToolCallingLoop';
import { createExtensionUnitTestingServices } from '../../../test/node/services';

function createMockChatRequest(): ChatRequest {
	return {
		prompt: 'run things',
		command: undefined,
		references: [],
		location: 1,
		location2: undefined,
		attempt: 0,
		enableCommandDetection: false,
		isParticipantDetected: false,
		toolReferences: [],
		toolInvocationToken: {} as ChatRequest['toolInvocationToken'],
		model: null!,
		tools: new Map(),
		id: generateUuid(),
		sessionId: generateUuid(),
	} as unknown as ChatRequest;
}

/** Records how the mock endpoint provider was called so tests can assert the resolution path. */
interface IEndpointProviderProbe {
	getAllCalls: number;
	familyCalls: string[];
	mainCalls: number;
}

function endpoint(model: string, family: string, supportsToolCalls: boolean): IChatEndpoint {
	return { model, name: `${model} display name`, family, supportsToolCalls } as IChatEndpoint;
}

describe('ExecutionSubagentToolCallingLoop.getEndpoint (non-proxy resolution)', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let configurationService: IConfigurationService;

	beforeEach(() => {
		disposables = new DisposableStore();
		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		serviceCollection.define(IChatHookService, new MockChatHookService());
		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		configurationService = accessor.get(IConfigurationService);
	});

	afterEach(() => {
		disposables.dispose();
	});

	const mainEndpoint = { model: 'main-agent', name: 'Main Agent' } as IChatEndpoint;

	function createLoop(options: {
		allEndpoints?: IChatEndpoint[];
		familyEndpoint?: IChatEndpoint;
		familyThrows?: boolean;
	}): { loop: ExecutionSubagentToolCallingLoop; probe: IEndpointProviderProbe } {
		const loopOptions: IExecutionSubagentToolCallingLoopOptions = {
			conversation: null!,
			toolCallLimit: 10,
			request: createMockChatRequest(),
			location: ChatLocation.Panel,
			promptText: 'run things',
		};
		const loop = instantiationService.createInstance(ExecutionSubagentToolCallingLoop, loopOptions);
		disposables.add(loop);
		const probe: IEndpointProviderProbe = { getAllCalls: 0, familyCalls: [], mainCalls: 0 };
		(loop as any).endpointProvider = {
			getAllChatEndpoints: async () => {
				probe.getAllCalls++;
				return options.allEndpoints ?? [];
			},
			getChatEndpoint: async (arg: unknown) => {
				if (typeof arg === 'string') {
					probe.familyCalls.push(arg);
					if (options.familyThrows) {
						throw new Error(`Unable to resolve chat model with CAPI family selection: ${arg}`);
					}
					return options.familyEndpoint;
				}
				probe.mainCalls++;
				return mainEndpoint;
			},
		};
		return { loop, probe };
	}

	it('uses the exact model-id endpoint when it resolves and supports tool calls', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentModel, 'mai-code-1-flash-picker');
		const { loop, probe } = createLoop({
			allEndpoints: [
				endpoint('lark-debug-picker', 'oswe-vscode-modelD', true),
				endpoint('mai-code-1-flash-picker', 'oswe-vscode-modelD', true),
			],
		});

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('mai-code-1-flash-picker');
		expect(await loop.getModelName()).toBe('mai-code-1-flash-picker display name');
		expect(await (loop as any).getEndpoint()).toBe(resolved);
		expect(probe.getAllCalls).toBe(1);
		expect(probe.familyCalls).toEqual([]);
		expect(probe.mainCalls).toBe(0);
	});

	it('falls back to the main agent endpoint when the exact model-id endpoint does not support tool calls', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentModel, 'mai-code-1-flash-picker');
		const { loop, probe } = createLoop({
			allEndpoints: [
				endpoint('mai-code-1-flash-picker', 'oswe-vscode-modelD', false),
			],
		});

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('main-agent');
		expect(probe.getAllCalls).toBe(1);
		expect(probe.familyCalls).toEqual([]);
		expect(probe.mainCalls).toBe(1);
	});

	it('falls back to family resolution when there is no exact model-id match', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentModel, 'oswe-vscode-modelD');
		const { loop, probe } = createLoop({
			allEndpoints: [endpoint('lark-debug-picker', 'oswe-vscode-modelD', true)],
			familyEndpoint: endpoint('lark-debug-picker', 'oswe-vscode-modelD', true),
		});

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('lark-debug-picker');
		expect(probe.getAllCalls).toBe(1);
		expect(probe.familyCalls).toEqual(['oswe-vscode-modelD']);
		expect(probe.mainCalls).toBe(0);
	});

	it('falls back to the main agent endpoint when the family-resolved model does not support tool calls', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentModel, 'oswe-vscode-modelD');
		const { loop, probe } = createLoop({
			allEndpoints: [],
			familyEndpoint: endpoint('lark-debug-picker', 'oswe-vscode-modelD', false),
		});

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('main-agent');
		expect(probe.familyCalls).toEqual(['oswe-vscode-modelD']);
		expect(probe.mainCalls).toBe(1);
	});

	it('falls back to the main agent endpoint when neither id nor family resolution succeeds', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentModel, 'does-not-exist');
		const { loop, probe } = createLoop({ allEndpoints: [], familyThrows: true });

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('main-agent');
		expect(probe.getAllCalls).toBe(1);
		expect(probe.familyCalls).toEqual(['does-not-exist']);
		expect(probe.mainCalls).toBe(1);
	});

	it('uses the main agent endpoint without any lookups when no model is configured', async () => {
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentUseAgenticProxy, false);
		await configurationService.setConfig(ConfigKey.Advanced.ExecutionSubagentModel, '');
		const { loop, probe } = createLoop({
			allEndpoints: [endpoint('should-not-be-used', 'oswe-vscode-modelD', true)],
		});

		const resolved = await (loop as any).getEndpoint();

		expect(resolved.model).toBe('main-agent');
		expect(probe.getAllCalls).toBe(0);
		expect(probe.familyCalls).toEqual([]);
		expect(probe.mainCalls).toBe(1);
	});
});
