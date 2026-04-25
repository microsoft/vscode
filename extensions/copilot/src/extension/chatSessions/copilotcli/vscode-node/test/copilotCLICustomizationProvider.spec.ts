/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SweCustomAgent } from '@github/copilot/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { ILogService } from '../../../../../platform/log/common/logService';
import { MockCustomInstructionsService } from '../../../../../platform/test/common/testCustomInstructionsService';
import { mock } from '../../../../../util/common/test/simpleMock';
import { Emitter } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { CLIAgentInfo, ICopilotCLIAgents } from '../../../copilotcli/node/copilotCli';
import { CopilotCLICustomizationProvider } from '../copilotCLICustomizationProvider';
import { MockPromptsService } from '../../../../../platform/promptFiles/test/common/mockPromptsService';

class FakeChatSessionCustomizationType {
	static readonly Agent = new FakeChatSessionCustomizationType('agent');
	static readonly Skill = new FakeChatSessionCustomizationType('skill');
	static readonly Instructions = new FakeChatSessionCustomizationType('instructions');
	static readonly Prompt = new FakeChatSessionCustomizationType('prompt');
	static readonly Hook = new FakeChatSessionCustomizationType('hook');
	static readonly Plugins = new FakeChatSessionCustomizationType('plugins');
	constructor(readonly id: string) { }
}

function makeSweAgent(name: string, description = '', displayName?: string): Readonly<SweCustomAgent> {
	return {
		name,
		displayName: displayName ?? name,
		description,
		tools: null,
		prompt: () => Promise.resolve(''),
		disableModelInvocation: false,
	};
}

/** Creates a CLIAgentInfo with a synthetic copilotcli: URI (SDK-only agent). */
function makeAgentInfo(name: string, description = '', displayName?: string): CLIAgentInfo {
	return {
		agent: makeSweAgent(name, description, displayName),
		sourceUri: URI.from({ scheme: 'copilotcli', path: `/agents/${name}` }),
	};
}

/** Creates a CLIAgentInfo with a file: URI (prompt-file-backed agent). */
function makeFileAgentInfo(name: string, fileUri: URI, description = ''): CLIAgentInfo {
	return {
		agent: makeSweAgent(name, description),
		sourceUri: fileUri,
	};
}

/** Creates a ChatInstruction stub with the required name and source fields. */
function makeInstruction(uri: URI, name: string, pattern: string | undefined, description?: string): vscode.ChatInstruction {
	return { uri, name, pattern, source: 'local', description };
}

/** Creates a ChatSkill stub, deriving the name from the parent directory for SKILL.md files. */
function makeSkill(uri: URI, name: string): vscode.ChatSkill {
	return { uri, name: name, source: 'local' };
}

/** Creates a ChatHook stub. */
function makeHook(uri: URI): vscode.ChatHook {
	return { uri };
}

/** Creates a ChatPlugin stub. */
function makePlugin(uri: URI): vscode.ChatPlugin {
	return { uri };
}

class MockCopilotCLIAgents extends mock<ICopilotCLIAgents>() {
	private readonly _onDidChangeAgents = new Emitter<void>();
	override readonly onDidChangeAgents = this._onDidChangeAgents.event;
	private _agents: CLIAgentInfo[] = [];

	setAgents(agents: CLIAgentInfo[]) { this._agents = agents; }
	override async getAgents(): Promise<readonly CLIAgentInfo[]> { return this._agents; }
	fireAgentsChanged() { this._onDidChangeAgents.fire(); }
	dispose() { this._onDidChangeAgents.dispose(); }
}

class TestLogService extends mock<ILogService>() {
	override trace() { }
	override debug() { }
}

class TestCustomInstructionsService extends MockCustomInstructionsService {
	private _agentInstructions: URI[] = [];

	setAgentInstructionUris(uris: URI[]) { this._agentInstructions = uris; }
	override getAgentInstructions(): Promise<URI[]> { return Promise.resolve(this._agentInstructions); }
}

describe('CopilotCLICustomizationProvider', () => {
	let disposables: DisposableStore;
	let mockPromptsService: MockPromptsService;
	let mockCopilotCLIAgents: MockCopilotCLIAgents;
	let mockCustomInstructionsService: TestCustomInstructionsService;
	let provider: CopilotCLICustomizationProvider;

	let originalChatSessionCustomizationType: unknown;

	beforeEach(() => {
		originalChatSessionCustomizationType = (vscode as Record<string, unknown>).ChatSessionCustomizationType;
		(vscode as Record<string, unknown>).ChatSessionCustomizationType = FakeChatSessionCustomizationType;
		disposables = new DisposableStore();
		mockPromptsService = disposables.add(new MockPromptsService());
		mockCopilotCLIAgents = disposables.add(new MockCopilotCLIAgents());
		mockCustomInstructionsService = new TestCustomInstructionsService();
		provider = disposables.add(new CopilotCLICustomizationProvider(
			mockCopilotCLIAgents,
			mockCustomInstructionsService,
			mockPromptsService,
			new TestLogService(),
			{ getWorkspaceFolders: () => [] } as any,
			{ stat: () => Promise.reject(new Error('not found')) } as any,
		));
	});

	afterEach(() => {
		disposables.dispose();
		(vscode as Record<string, unknown>).ChatSessionCustomizationType = originalChatSessionCustomizationType;
	});

	describe('metadata', () => {
		it('has correct label and icon', () => {
			expect(CopilotCLICustomizationProvider.metadata.label).toBe('Copilot CLI');
			expect(CopilotCLICustomizationProvider.metadata.iconId).toBe('copilot');
		});

		it('supports Agent, Skill, Instructions, Hook, and Plugins types', () => {
			const supported = CopilotCLICustomizationProvider.metadata.supportedTypes;
			expect(supported).toBeDefined();
			expect(supported).toHaveLength(5);
			expect(supported).toContain(FakeChatSessionCustomizationType.Agent);
			expect(supported).toContain(FakeChatSessionCustomizationType.Skill);
			expect(supported).toContain(FakeChatSessionCustomizationType.Instructions);
			expect(supported).toContain(FakeChatSessionCustomizationType.Hook);
			expect(supported).toContain(FakeChatSessionCustomizationType.Plugins);
		});

		it('only returns items whose type is in supportedTypes', async () => {
			mockCopilotCLIAgents.setAgents([makeAgentInfo('explore', 'Explore')]);
			const items = await provider.provideChatSessionCustomizations(undefined!);
			const supported = new Set(CopilotCLICustomizationProvider.metadata.supportedTypes!.map(t => t.id));
			for (const item of items) {
				expect(supported.has(item.type.id), `item "${item.name}" has type "${item.type.id}" not in supportedTypes`).toBe(true);
			}
		});

		it('does not set groupKey for items with synthetic URIs (vscode infers grouping)', async () => {
			mockCopilotCLIAgents.setAgents([makeAgentInfo('explore', 'Explore')]);
			const items = await provider.provideChatSessionCustomizations(undefined!);
			const builtinItems = items.filter(i => i.uri.scheme !== 'file');
			for (const item of builtinItems) {
				expect(item.groupKey, `item "${item.name}" should not have groupKey (vscode infers)`).toBeUndefined();
			}
		});
	});

	describe('provideChatSessionCustomizations', () => {
		it('returns empty array when no files exist', async () => {
			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toEqual([]);
		});

		it('returns agents from ICopilotCLIAgents with source URIs', async () => {
			mockCopilotCLIAgents.setAgents([
				makeAgentInfo('explore', 'Fast code exploration'),
				makeAgentInfo('task', 'Multi-step tasks'),
			]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const agentItems = items.filter((i: vscode.ChatSessionCustomizationItem) => i.type === FakeChatSessionCustomizationType.Agent);
			expect(agentItems).toHaveLength(2);
			expect(agentItems[0].name).toBe('explore');
			expect(agentItems[0].description).toBe('Fast code exploration');
		});

		it('uses file URI from sourceUri for file-backed agents', async () => {
			const fileUri = URI.file('/workspace/.github/explore.agent.md');
			mockCopilotCLIAgents.setAgents([makeFileAgentInfo('explore', fileUri, 'Explore agent')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const agentItems = items.filter((i: vscode.ChatSessionCustomizationItem) => i.type === FakeChatSessionCustomizationType.Agent);
			expect(agentItems).toHaveLength(1);
			expect(agentItems[0].uri).toEqual(fileUri);
			expect(agentItems[0].groupKey).toBeUndefined();
		});

		it('uses synthetic URI for SDK-only agents', async () => {
			mockCopilotCLIAgents.setAgents([makeAgentInfo('task', 'Task agent')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const agentItems = items.filter((i: vscode.ChatSessionCustomizationItem) => i.type === FakeChatSessionCustomizationType.Agent);
			expect(agentItems).toHaveLength(1);
			expect(agentItems[0].uri.scheme).toBe('copilotcli');
			expect(agentItems[0].uri.path).toBe('/agents/task');
			expect(agentItems[0].groupKey).toBeUndefined();
		});

		it('uses displayName from agents when available', async () => {
			mockCopilotCLIAgents.setAgents([makeAgentInfo('code-review', 'Reviews code', 'Code Review')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items[0].name).toBe('Code Review');
		});

		it('returns instructions with on-demand groupKey when no applyTo pattern', async () => {
			const uri = URI.file('/workspace/.github/copilot-instructions.md');
			mockPromptsService.setInstructions([makeInstruction(uri, 'copilot-instructions', undefined)]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toHaveLength(1);
			expect(items[0].uri).toBe(uri);
			expect(items[0].type).toBe(FakeChatSessionCustomizationType.Instructions);
			expect(items[0].groupKey).toBe('on-demand-instructions');
		});

		it('returns skills', async () => {
			const uri = URI.file('/workspace/.github/skills/lint-check/SKILL.md');
			mockPromptsService.setSkills([makeSkill(uri, 'lint-check')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toHaveLength(1);
			expect(items[0].uri).toBe(uri);
			expect(items[0].type).toBe(FakeChatSessionCustomizationType.Skill);
			expect(items[0].name).toBe('lint-check');
		});

		it('derives skill name from parent directory for SKILL.md files', async () => {
			const uri = URI.file('/workspace/.copilot/skills/my-skill/SKILL.md');
			mockPromptsService.setSkills([makeSkill(uri, 'my-skill')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toHaveLength(1);
			expect(items[0].name).toBe('my-skill');
		});

		it('returns all matching types combined', async () => {
			mockCopilotCLIAgents.setAgents([makeAgentInfo('explore', 'Explore')]);
			mockPromptsService.setInstructions([makeInstruction(URI.file('/workspace/.github/b.instructions.md'), 'b instructions', undefined)]);
			mockPromptsService.setSkills([makeSkill(URI.file('/workspace/.github/skills/c/SKILL.md'), 'c')]);
			mockPromptsService.setHooks([makeHook(URI.file('/workspace/.copilot/hooks/pre-commit.json'))]);
			mockPromptsService.setPlugins([makePlugin(URI.file('/workspace/.copilot/plugins/my-plugin'))]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toHaveLength(5);
		});

		it('returns hooks with correct type and name', async () => {
			const uri = URI.file('/workspace/.copilot/hooks/diagnostics.json');
			mockPromptsService.setHooks([makeHook(uri)]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toHaveLength(1);
			expect(items[0].uri).toBe(uri);
			expect(items[0].type).toBe(FakeChatSessionCustomizationType.Hook);
			expect(items[0].name).toBe('diagnostics');
		});

		it('strips .json extension from hook file name', async () => {
			mockPromptsService.setHooks([makeHook(URI.file('/workspace/.copilot/hooks/security-checks.json'))]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items[0].name).toBe('security-checks');
		});

		it('returns multiple hooks', async () => {
			mockPromptsService.setHooks([
				makeHook(URI.file('/workspace/.copilot/hooks/hooks.json')),
				makeHook(URI.file('/workspace/.copilot/hooks/diagnostics.json')),
			]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter((i: vscode.ChatSessionCustomizationItem) => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems).toHaveLength(2);
		});

		it('returns plugins with correct type and name derived from URI', async () => {
			const uri = URI.file('/workspace/.copilot/plugins/lint-rules');
			mockPromptsService.setPlugins([makePlugin(uri)]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toHaveLength(1);
			expect(items[0].uri).toEqual(uri);
			expect(items[0].type).toBe(FakeChatSessionCustomizationType.Plugins);
			expect(items[0].name).toBe('lint-rules');
		});
	});

	describe('instruction groupKeys and badges', () => {
		it('uses agent-instructions groupKey for copilot-instructions.md files', async () => {
			const uri = URI.file('/workspace/.github/copilot-instructions.md');
			mockPromptsService.setInstructions([makeInstruction(uri, 'copilot-instructions', undefined)]);
			mockCustomInstructionsService.setAgentInstructionUris([uri]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instrItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instrItems).toHaveLength(1);
			expect(instrItems[0].groupKey).toBe('agent-instructions');
			expect(instrItems[0].badge).toBeUndefined();
		});

		it('emits agent instructions not in chatPromptFileService.instructions', async () => {
			const agentsUri = URI.file('/workspace/AGENTS.md');
			const claudeUri = URI.file('/workspace/CLAUDE.md');
			const copilotUri = URI.file('/workspace/.github/copilot-instructions.md');
			// Agent instructions are NOT in chatPromptFileService.instructions —
			// they come only from customInstructionsService.getAgentInstructions().
			mockPromptsService.setInstructions([]);
			mockCustomInstructionsService.setAgentInstructionUris([agentsUri, claudeUri, copilotUri]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instrItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instrItems).toHaveLength(3);
			expect(instrItems.every(i => i.groupKey === 'agent-instructions')).toBe(true);
			expect(instrItems.map(i => i.name)).toEqual(['AGENTS.md', 'CLAUDE.md', 'copilot-instructions.md']);
		});

		it('discovers AGENTS.md and CLAUDE.md from workspace roots via filesystem', async () => {
			const workspaceRoot = URI.file('/workspace');
			const agentsUri = URI.file('/workspace/AGENTS.md');
			const claudeUri = URI.file('/workspace/CLAUDE.md');
			const existingUris = new Set([agentsUri.toString(), claudeUri.toString()]);

			const testProvider = disposables.add(new CopilotCLICustomizationProvider(
				mockCopilotCLIAgents,
				mockCustomInstructionsService,
				mockPromptsService,
				new TestLogService(),
				{ getWorkspaceFolders: () => [workspaceRoot] } as any,
				{
					stat: (uri: URI) => existingUris.has(uri.toString())
						? Promise.resolve({ type: 1, ctime: 0, mtime: 0, size: 0 })
						: Promise.reject(new Error('not found')),
				} as any,
			));

			mockPromptsService.setInstructions([]);
			mockCustomInstructionsService.setAgentInstructionUris([]);

			const items = await testProvider.provideChatSessionCustomizations(undefined!);
			const instrItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instrItems).toHaveLength(2);
			expect(instrItems.every(i => i.groupKey === 'agent-instructions')).toBe(true);
			expect(instrItems.map(i => i.name)).toEqual(['AGENTS.md', 'CLAUDE.md']);
		});

		it('uses context-instructions groupKey with badge for instructions with applyTo pattern', async () => {
			const uri = URI.file('/workspace/.github/style.instructions.md');
			mockPromptsService.setInstructions([makeInstruction(uri, 'style instructions', 'src/**/*.ts')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instrItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instrItems).toHaveLength(1);
			expect(instrItems[0].groupKey).toBe('context-instructions');
			expect(instrItems[0].badge).toBe('src/**/*.ts');
			expect(instrItems[0].badgeTooltip).toContain('src/**/*.ts');
		});

		it('uses "always added" badge when applyTo is **', async () => {
			const uri = URI.file('/workspace/.github/global.instructions.md');
			mockPromptsService.setInstructions([makeInstruction(uri, 'global instructions', '**')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instrItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instrItems).toHaveLength(1);
			expect(instrItems[0].groupKey).toBe('context-instructions');
			expect(instrItems[0].badge).toBe('always added');
			expect(instrItems[0].badgeTooltip).toContain('every interaction');
		});

		it('uses on-demand-instructions groupKey for instructions without applyTo', async () => {
			const uri = URI.file('/workspace/.github/refactor.instructions.md');
			mockPromptsService.setInstructions([makeInstruction(uri, 'refactor instructions', undefined, 'Refactoring guidelines')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instrItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instrItems).toHaveLength(1);
			expect(instrItems[0].groupKey).toBe('on-demand-instructions');
			expect(instrItems[0].badge).toBeUndefined();
			expect(instrItems[0].description).toBe('Refactoring guidelines');
		});

		it('includes description from parsed header', async () => {
			const uri = URI.file('/workspace/.github/testing.instructions.md');
			mockPromptsService.setInstructions([makeInstruction(uri, 'testing instructions', '**/*.spec.ts', 'Testing standards')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instrItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instrItems).toHaveLength(1);
			expect(instrItems[0].description).toBe('Testing standards');
			expect(instrItems[0].badge).toBe('**/*.spec.ts');
		});

		it('categorizes mixed instructions correctly', async () => {
			const agentUri = URI.file('/workspace/.github/copilot-instructions.md');
			const contextUri = URI.file('/workspace/.github/style.instructions.md');
			const onDemandUri = URI.file('/workspace/.github/refactor.instructions.md');
			mockPromptsService.setInstructions([makeInstruction(agentUri, 'copilot instructions', undefined), makeInstruction(contextUri, 'style instructions', 'src/**'), makeInstruction(onDemandUri, 'refactor instructions', undefined)]);
			mockCustomInstructionsService.setAgentInstructionUris([agentUri]);
			mockPromptsService.setFileContent(contextUri, '---\napplyTo: \'src/**\'\n---\nStyle rules.');
			mockPromptsService.setFileContent(onDemandUri, '---\ndescription: Refactoring\n---\nRefactor tips.');

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instrItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instrItems).toHaveLength(3);

			const agent = instrItems.find(i => i.groupKey === 'agent-instructions');
			const context = instrItems.find(i => i.groupKey === 'context-instructions');
			const onDemand = instrItems.find(i => i.groupKey === 'on-demand-instructions');

			expect(agent).toBeDefined();
			expect(agent!.uri).toBe(agentUri);

			expect(context).toBeDefined();
			expect(context!.badge).toBe('src/**');

			expect(onDemand).toBeDefined();
			expect(onDemand!.badge).toBeUndefined();
		});

		it('falls back to on-demand-instructions when file has no YAML header', async () => {
			const uri = URI.file('/workspace/.github/plain.instructions.md');
			mockPromptsService.setInstructions([makeInstruction(uri, 'plain instructions', undefined)]);
			mockPromptsService.setFileContent(uri, 'Just plain text, no frontmatter.');

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instrItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instrItems).toHaveLength(1);
			expect(instrItems[0].groupKey).toBe('on-demand-instructions');
			expect(instrItems[0].badge).toBeUndefined();
		});
	});

	describe('onDidChange', () => {
		it('fires when custom agents change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockPromptsService.fireCustomAgentsChanged();
			expect(fired).toBe(true);
		});

		it('fires when instructions change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockPromptsService.fireInstructionsChanged();
			expect(fired).toBe(true);
		});

		it('fires when skills change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockPromptsService.fireSkillsChanged();
			expect(fired).toBe(true);
		});

		it('fires when hooks change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockPromptsService.fireHooksChanged();
			expect(fired).toBe(true);
		});

		it('fires when plugins change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockPromptsService.firePluginsChanged();
			expect(fired).toBe(true);
		});

		it('fires when ICopilotCLIAgents agents change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockCopilotCLIAgents.fireAgentsChanged();
			expect(fired).toBe(true);
		});
	});
});
