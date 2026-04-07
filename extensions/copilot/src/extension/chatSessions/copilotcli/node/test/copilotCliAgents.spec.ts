/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SweCustomAgent } from '@github/copilot/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IVSCodeExtensionContext } from '../../../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../../../platform/log/common/logService';
import { PromptFileParser, type ParsedPromptFile } from '../../../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { Emitter, Event } from '../../../../../util/vs/base/common/event';
import { Disposable, DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IChatPromptFileService } from '../../../common/chatPromptFileService';
import { CopilotCLIAgents, type ICopilotCLISDK } from '../copilotCli';

const CopilotCLIAgentsConstructor = CopilotCLIAgents as unknown as new (
	chatPromptFileService: IChatPromptFileService,
	copilotCLISDK: ICopilotCLISDK,
	extensionContext: IVSCodeExtensionContext,
	logService: ILogService,
	workspaceService: IWorkspaceService,
) => CopilotCLIAgents;

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

class TestChatPromptFileService extends Disposable implements IChatPromptFileService {
	declare _serviceBrand: undefined;
	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;
	readonly onDidChangeInstructions: Event<void> = Event.None;
	readonly onDidChangeSkills: Event<void> = Event.None;
	readonly onDidChangeHooks: Event<void> = Event.None;
	readonly onDidChangePlugins: Event<void> = Event.None;
	readonly customAgents: readonly import('vscode').ChatResource[] = [];
	readonly instructions: readonly import('vscode').ChatResource[] = [];
	readonly skills: readonly import('vscode').ChatResource[] = [];
	readonly hooks: readonly import('vscode').ChatResource[] = [];
	readonly plugins: readonly import('vscode').ChatResource[] = [];

	constructor(private _customAgentPromptFiles: ParsedPromptFile[] = []) {
		super();
	}

	get customAgentPromptFiles(): readonly ParsedPromptFile[] {
		return [...this._customAgentPromptFiles];
	}

	setCustomAgents(customAgents: ParsedPromptFile[]): void {
		this._customAgentPromptFiles = customAgents;
		this._onDidChangeCustomAgents.fire();
	}
}

function parsePromptFile(fileName: string, content: string): ParsedPromptFile {
	return new PromptFileParser().parse(URI.file(`/workspace/.github/agents/${fileName}`), content);
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

	function createAgents(options: { sdkAgentsByCall: ReadonlyArray<ReadonlyArray<SweCustomAgent>>; promptAgents?: ParsedPromptFile[] }): { agents: CopilotCLIAgents; chatPromptFileService: TestChatPromptFileService; sdk: ICopilotCLISDK } {
		const chatPromptFileService = new TestChatPromptFileService(options.promptAgents ?? []);
		const sdk = createMockSDK(options.sdkAgentsByCall);
		const agents = new CopilotCLIAgentsConstructor(
			chatPromptFileService,
			sdk,
			createMockExtensionContext(),
			logService,
			createWorkspaceService(),
		);
		disposables.add(chatPromptFileService);
		disposables.add(agents);
		return { agents, chatPromptFileService, sdk };
	}

	it('prefers prompt-derived agents over SDK agents with the same name', async () => {
		const promptAgent = parsePromptFile('merge.agent.md', `---
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
			promptAgents: [promptAgent]
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
			promptAgents: [parsePromptFile('invalid.agent.md', `---
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
		const { agents, chatPromptFileService, sdk } = createAgents({
			sdkAgentsByCall: [[], []],
			promptAgents: [parsePromptFile('first.agent.md', `---
name: First
description: First prompt agent
---
First body`)]
		});

		const first = await agents.getAgents();
		chatPromptFileService.setCustomAgents([parsePromptFile('second.agent.md', `---
name: Second
description: Second prompt agent
---
Second body`)]);
		const second = await agents.getAgents();

		expect(first.map(a => a.agent.name)).toEqual(['First']);
		expect(second.map(a => a.agent.name)).toEqual(['Second']);
		expect(sdk.getPackage).toHaveBeenCalled();
	});

	it('filters out legacy .chatmode.md files', async () => {
		const chatmodeFile = new PromptFileParser().parse(
			URI.file('/workspace/.github/chatmodes/test.chatmode.md'),
			`---
name: TestMode
description: A legacy chatmode
---
Body`
		);
		const agentFile = parsePromptFile('real.agent.md', `---
name: RealAgent
description: A real agent
---
Body`);
		const { agents } = createAgents({
			sdkAgentsByCall: [[]],
			promptAgents: [chatmodeFile, agentFile]
		});

		const result = await agents.getAgents();
		expect(result).toHaveLength(1);
		expect(result[0].agent.name).toBe('RealAgent');
	});
});
