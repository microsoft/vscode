/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SweCustomAgent } from '@github/copilot/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IVSCodeExtensionContext } from '../../../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../../../platform/log/common/logService';
import { PromptFileParser } from '../../../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { Event } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { CopilotCLIAgents, type ICopilotCLISDK } from '../copilotCli';
import { MockPromptsService } from '../../../../../platform/promptFiles/test/common/mockPromptsService';
import type { ChatCustomAgent } from 'vscode';

function createMockExtensionContext(): IVSCodeExtensionContext {
	const workspaceState = new Map<string, unknown>();
	return {
		extensionPath: '/mock',
		globalState: {
			get: <T>(_key: string, defaultValue?: T) => defaultValue as T,
			update: async () => { },
			keys: () => []
		},
		workspaceState: {
			get: <T>(key: string, defaultValue?: T) => (workspaceState.get(key) as T) ?? defaultValue,
			update: async (key: string, value: unknown) => {
				workspaceState.set(key, value);
			},
			keys: () => [...workspaceState.keys()]
		}
	} as unknown as IVSCodeExtensionContext;
}

interface PromptFileInfo {
	readonly uri: URI;
	readonly content: string;
}

function mockPromptFile(fileName: string, content: string): PromptFileInfo {
	return { uri: URI.file(`/workspace/.github/agents/${fileName}`), content };
}

function createMockSDK(agentsByCall: ReadonlyArray<ReadonlyArray<SweCustomAgent>>): ICopilotCLISDK {
	let index = 0;
	const getCustomAgents = vi.fn(async () => {
		const result = agentsByCall[Math.min(index, agentsByCall.length - 1)] ?? [];
		index += 1;
		return result;
	});

	return {
		_serviceBrand: undefined,
		getPackage: vi.fn(async () => ({ getCustomAgents })),
		getAuthInfo: vi.fn(async () => ({ type: 'token' as const, token: 'test-token', host: 'https://github.com' })),
		getRequestId: vi.fn(() => undefined),
		setRequestId: vi.fn(),
	} as unknown as ICopilotCLISDK;
}

function createWorkspaceService(): IWorkspaceService {
	return {
		_serviceBrand: undefined,
		onDidChangeWorkspaceFolders: Event.None,
		getWorkspaceFolders: () => [URI.file('/workspace')]
	} as unknown as IWorkspaceService;
}

describe('CopilotCLIAgents', () => {
	const disposables = new DisposableStore();
	let logService: ILogService;

	beforeEach(() => {
		const services = disposables.add(createExtensionUnitTestingServices());
		logService = services.createTestingAccessor().get(ILogService);
	});

	afterEach(() => {
		disposables.clear();
	});

	function createChatCustomAgent(mock: PromptFileInfo): ChatCustomAgent {
		const parsed = new PromptFileParser().parse(mock.uri, mock.content);
		return {
			uri: mock.uri,
			source: 'local',
			name: parsed.header?.name ?? mock.uri.path.split('/').pop()?.replace('.agent.md', '') ?? 'unknown',
			description: parsed.header?.description ?? '',
			model: parsed.header?.model,
			tools: parsed.header?.tools,
			userInvocable: parsed.header?.userInvocable ?? true,
			disableModelInvocation: parsed.header?.disableModelInvocation ?? false,
			enabled: true
		};
	}

	function createAgents(options: { sdkAgentsByCall: ReadonlyArray<ReadonlyArray<SweCustomAgent>>; customAgents?: PromptFileInfo[] }): { agents: CopilotCLIAgents; promptsService: MockPromptsService; sdk: ICopilotCLISDK } {
		const promptsService = disposables.add(new MockPromptsService());
		if (options.customAgents) {
			const customAgents = [];
			for (const ca of options.customAgents) {
				promptsService.setFileContent(ca.uri, ca.content);
				customAgents.push(createChatCustomAgent(ca));
			}
			promptsService.setCustomAgents(customAgents);
		}
		const sdk = createMockSDK(options.sdkAgentsByCall);
		const agents = new CopilotCLIAgents(
			promptsService,
			sdk,
			createMockExtensionContext(),
			logService,
			createWorkspaceService(),
		);
		disposables.add(agents);
		return { agents, promptsService, sdk };
	}

	it('prefers prompt-derived agents over SDK agents with the same name', async () => {
		const promptAgent = mockPromptFile('merge.agent.md', `---
name: MergeMe
description: Prompt description
tools: []
model: ['gpt-4.1', 'gpt-4o']
disable-model-invocation: true
---
Prompt body`);
		const { agents } = createAgents({
			sdkAgentsByCall: [[{
				name: 'mergeme',
				displayName: 'SDK MergeMe',
				description: 'SDK description',
				tools: ['sdk-tool'],
				prompt: async () => 'sdk body',
				disableModelInvocation: false,
			}]],
			customAgents: [promptAgent]
		});

		const result = await agents.getAgents();

		expect(result).toHaveLength(1);
		expect(result[0].agent.name).toBe('MergeMe');
		expect(result[0].agent.displayName).toBe('MergeMe');
		expect(result[0].agent.description).toBe('Prompt description');
		expect(result[0].agent.tools).toBeNull();
		expect(result[0].agent.model).toBe('gpt-4.1');
		expect(result[0].agent.disableModelInvocation).toBe(true);
		expect(await result[0].agent.prompt()).toBe('Prompt body');
		expect(result[0].sourceUri.scheme).toBe('file');
	});

	it('derives agent name from filename when frontmatter name is missing', async () => {
		const { agents } = createAgents({
			sdkAgentsByCall: [[]],
			customAgents: [mockPromptFile('invalid.agent.md', `---
description: Missing name
tools: ['read_file']
---
Body`)]
		});

		const result = await agents.getAgents();
		expect(result).toHaveLength(1);
		expect(result[0].agent.name).toBe('invalid');
		expect(result[0].agent.displayName).toBe('invalid');
		expect(result[0].agent.description).toBe('Missing name');
		expect(result[0].agent.tools).toEqual(['read_file']);
	});

	it('refreshes cached agents when custom agents change', async () => {
		const { agents, promptsService, sdk } = createAgents({
			sdkAgentsByCall: [[], []],
			customAgents: [mockPromptFile('first.agent.md', `---
name: First
description: First prompt agent
---
First body`)]
		});

		const first = await agents.getAgents();
		promptsService.setCustomAgents([createChatCustomAgent(mockPromptFile('second.agent.md', `---
name: Second
description: Second prompt agent
---
Second body`))]);
		const second = await agents.getAgents();

		expect(first.map(a => a.agent.name)).toEqual(['First']);
		expect(second.map(a => a.agent.name)).toEqual(['Second']);
		expect(sdk.getPackage).toHaveBeenCalled();
	});

	it('filters out legacy .chatmode.md files', async () => {
		const chatmodeFile = {
			uri:
				URI.file('/workspace/.github/chatmodes/test.chatmode.md'),
			content: `---
name: TestMode
description: A legacy chatmode
---
Body`
		};
		const agentFile = mockPromptFile('real.agent.md', `---
name: RealAgent
description: A real agent
---
Body`);
		const { agents } = createAgents({
			sdkAgentsByCall: [[]],
			customAgents: [chatmodeFile, agentFile]
		});

		const result = await agents.getAgents();
		expect(result).toHaveLength(1);
		expect(result[0].agent.name).toBe('RealAgent');
	});
});
