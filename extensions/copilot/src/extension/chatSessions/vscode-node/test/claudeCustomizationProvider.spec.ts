/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentInfo } from '@anthropic-ai/claude-agent-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { INativeEnvService } from '../../../../platform/env/common/envService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { mock } from '../../../../util/common/test/simpleMock';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { IClaudeRuntimeDataService } from '../../claude/common/claudeRuntimeDataService';
import { IChatPromptFileService } from '../../common/chatPromptFileService';
import { ClaudeCustomizationProvider } from '../claudeCustomizationProvider';

class FakeChatSessionCustomizationType {
	static readonly Agent = new FakeChatSessionCustomizationType('agent');
	static readonly Skill = new FakeChatSessionCustomizationType('skill');
	static readonly Instructions = new FakeChatSessionCustomizationType('instructions');
	static readonly Prompt = new FakeChatSessionCustomizationType('prompt');
	static readonly Hook = new FakeChatSessionCustomizationType('hook');
	constructor(readonly id: string) { }
}

class MockRuntimeDataService extends mock<IClaudeRuntimeDataService>() {
	private readonly _onDidChange = new Emitter<void>();
	override readonly onDidChange = this._onDidChange.event;
	private _agents: AgentInfo[] = [];

	setAgents(agents: AgentInfo[]) { this._agents = agents; }
	override getAgents(): readonly AgentInfo[] { return this._agents; }
	fireChanged() { this._onDidChange.fire(); }
	dispose() { this._onDidChange.dispose(); }
}

class MockChatPromptFileService extends mock<IChatPromptFileService>() {
	private readonly _onDidChangeCustomAgents = new Emitter<void>();
	override readonly onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;
	private readonly _onDidChangeInstructions = new Emitter<void>();
	override readonly onDidChangeInstructions = this._onDidChangeInstructions.event;
	private readonly _onDidChangeSkills = new Emitter<void>();
	override readonly onDidChangeSkills = this._onDidChangeSkills.event;

	private _customAgents: vscode.ChatResource[] = [];
	private _skills: vscode.ChatResource[] = [];

	override get customAgents(): readonly vscode.ChatResource[] { return this._customAgents; }
	override get skills(): readonly vscode.ChatResource[] { return this._skills; }

	setCustomAgents(agents: vscode.ChatResource[]) { this._customAgents = agents; }
	setSkills(skills: vscode.ChatResource[]) { this._skills = skills; }
	fireCustomAgentsChanged() { this._onDidChangeCustomAgents.fire(); }
	fireSkillsChanged() { this._onDidChangeSkills.fire(); }

	override dispose() {
		this._onDidChangeCustomAgents.dispose();
		this._onDidChangeInstructions.dispose();
		this._onDidChangeSkills.dispose();
	}
}

class MockWorkspaceService extends mock<IWorkspaceService>() {
	private _folders: URI[] = [];
	private readonly _onDidChange = new Emitter<void>();
	override readonly onDidChangeWorkspaceFolders: Event<any> = this._onDidChange.event;
	setFolders(folders: URI[]) { this._folders = folders; }
	override getWorkspaceFolders(): URI[] { return this._folders; }
	fireWorkspaceFoldersChanged() { this._onDidChange.fire(); }
}

class MockFileSystemService extends mock<IFileSystemService>() {
	private readonly _files = new Map<string, Uint8Array>();
	setFile(uri: URI, content: string) {
		this._files.set(uri.toString(), new TextEncoder().encode(content));
	}
	override async stat(uri: URI): Promise<{ type: number; ctime: number; mtime: number; size: number }> {
		if (!this._files.has(uri.toString())) {
			throw new Error(`File not found: ${uri.toString()}`);
		}
		return { type: 1 /* File */, ctime: 0, mtime: 0, size: this._files.get(uri.toString())!.length };
	}
	override async readFile(uri: URI): Promise<Uint8Array> {
		const content = this._files.get(uri.toString());
		if (!content) {
			throw new Error(`File not found: ${uri.toString()}`);
		}
		return content;
	}
}

class MockEnvService extends mock<INativeEnvService>() {
	override userHome = URI.file('/home/user');
}

class TestLogService extends mock<ILogService>() {
	override trace() { }
	override debug() { }
}

describe('ClaudeCustomizationProvider', () => {
	let disposables: DisposableStore;
	let mockRuntimeDataService: MockRuntimeDataService;
	let mockPromptFileService: MockChatPromptFileService;
	let mockWorkspaceService: MockWorkspaceService;
	let mockFileSystemService: MockFileSystemService;
	let provider: ClaudeCustomizationProvider;

	let originalChatSessionCustomizationType: unknown;

	beforeEach(() => {
		originalChatSessionCustomizationType = (vscode as Record<string, unknown>).ChatSessionCustomizationType;
		(vscode as Record<string, unknown>).ChatSessionCustomizationType = FakeChatSessionCustomizationType;
		disposables = new DisposableStore();
		mockRuntimeDataService = disposables.add(new MockRuntimeDataService());
		mockPromptFileService = disposables.add(new MockChatPromptFileService());
		mockWorkspaceService = new MockWorkspaceService();
		mockFileSystemService = new MockFileSystemService();
		provider = disposables.add(new ClaudeCustomizationProvider(
			mockPromptFileService,
			mockRuntimeDataService,
			mockWorkspaceService,
			mockFileSystemService,
			new MockEnvService(),
			new TestLogService(),
		));
	});

	afterEach(() => {
		disposables.dispose();
		(vscode as Record<string, unknown>).ChatSessionCustomizationType = originalChatSessionCustomizationType;
	});

	describe('metadata', () => {
		it('has correct label and icon', () => {
			expect(ClaudeCustomizationProvider.metadata.label).toBe('Claude');
			expect(ClaudeCustomizationProvider.metadata.iconId).toBe('claude');
		});

		it('supports Agent, Skill, Instructions, and Hook types', () => {
			const supported = ClaudeCustomizationProvider.metadata.supportedTypes;
			expect(supported).toBeDefined();
			expect(supported).toHaveLength(4);
			expect(supported).toContain(FakeChatSessionCustomizationType.Agent);
			expect(supported).toContain(FakeChatSessionCustomizationType.Skill);
			expect(supported).toContain(FakeChatSessionCustomizationType.Instructions);
			expect(supported).toContain(FakeChatSessionCustomizationType.Hook);
		});

		it('only returns items whose type is in supportedTypes', async () => {
			mockRuntimeDataService.setAgents([
				{ name: 'Explore', description: 'Fast exploration agent' },
			]);
			const items = await provider.provideChatSessionCustomizations(undefined!);
			const supported = new Set(ClaudeCustomizationProvider.metadata.supportedTypes!.map(t => t.id));
			for (const item of items) {
				expect(supported.has(item.type.id), `item "${item.name}" has type "${item.type.id}" which is not in supportedTypes`).toBe(true);
			}
		});

		it('does not set groupKey for items with synthetic URIs (vscode infers grouping)', async () => {
			mockRuntimeDataService.setAgents([
				{ name: 'Explore', description: 'Explore agent' },
			]);
			const items = await provider.provideChatSessionCustomizations(undefined!);
			const builtinItems = items.filter(i => i.uri.scheme !== 'file');
			for (const item of builtinItems) {
				expect(item.groupKey, `item "${item.name}" with scheme "${item.uri.scheme}" should not have groupKey (vscode infers)`).toBeUndefined();
			}
		});
	});

	describe('agents from SDK', () => {
		it('returns empty when no session has initialized and no file agents', async () => {
			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toEqual([]);
		});

		it('returns agents from the runtime data service', async () => {
			mockRuntimeDataService.setAgents([
				{ name: 'Explore', description: 'Fast exploration agent' },
				{ name: 'Review', description: 'Code review agent', model: 'claude-3.5-sonnet' },
			]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const agentItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Agent);
			expect(agentItems).toHaveLength(2);
			expect(agentItems[0].name).toBe('Explore');
			expect(agentItems[0].description).toBe('Fast exploration agent');
			expect(agentItems[0].groupKey).toBeUndefined();
			expect(agentItems[0].uri.scheme).toBe('claude-code');
			expect(agentItems[0].uri.path).toBe('/agents/Explore');
			expect(agentItems[1].name).toBe('Review');
		});

		it('shows file-based agents from .claude/ paths before session starts', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockPromptFileService.setCustomAgents([
				{ uri: URI.file('/workspace/.claude/agents/my-agent.agent.md') },
			]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const agentItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Agent);
			expect(agentItems).toHaveLength(1);
			expect(agentItems[0].name).toBe('my-agent');
			expect(agentItems[0].uri.scheme).toBe('file');
		});

		it('deduplicates file agents when SDK provides the same agent', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockRuntimeDataService.setAgents([
				{ name: 'my-agent', description: 'SDK version' },
			]);
			mockPromptFileService.setCustomAgents([
				{ uri: URI.file('/workspace/.claude/agents/my-agent.agent.md') },
			]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const agentItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Agent);
			expect(agentItems).toHaveLength(1);
			expect(agentItems[0].description).toBe('SDK version');
			expect(agentItems[0].groupKey).toBeUndefined();
		});

		it('filters out file agents not under .claude/', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockPromptFileService.setCustomAgents([
				{ uri: URI.file('/workspace/.github/my-agent.agent.md') },
				{ uri: URI.file('/workspace/root.agent.md') },
			]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const agentItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Agent);
			expect(agentItems).toHaveLength(0);
		});
	});

	describe('instructions from CLAUDE.md paths', () => {
		beforeEach(() => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
		});

		it('discovers CLAUDE.md in workspace root', async () => {
			const uri = URI.joinPath(URI.file('/workspace'), 'CLAUDE.md');
			mockFileSystemService.setFile(uri, '# Instructions');

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instructionItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instructionItems).toHaveLength(1);
			expect(instructionItems[0].name).toBe('CLAUDE');
			expect(instructionItems[0].uri).toEqual(uri);
		});

		it('discovers CLAUDE.local.md in workspace root', async () => {
			const uri = URI.joinPath(URI.file('/workspace'), 'CLAUDE.local.md');
			mockFileSystemService.setFile(uri, '# Local');

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instructionItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instructionItems).toHaveLength(1);
			expect(instructionItems[0].name).toBe('CLAUDE.local');
		});

		it('discovers .claude/CLAUDE.md in workspace', async () => {
			const uri = URI.joinPath(URI.file('/workspace'), '.claude', 'CLAUDE.md');
			mockFileSystemService.setFile(uri, '# Claude dir');

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instructionItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instructionItems).toHaveLength(1);
			expect(instructionItems[0].name).toBe('CLAUDE');
		});

		it('discovers ~/.claude/CLAUDE.md in user home', async () => {
			const uri = URI.joinPath(URI.file('/home/user'), '.claude', 'CLAUDE.md');
			mockFileSystemService.setFile(uri, '# Home');

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instructionItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instructionItems).toHaveLength(1);
			expect(instructionItems[0].uri).toEqual(uri);
		});

		it('only reports instruction files that exist', async () => {
			// Only set one of the five possible paths
			const uri = URI.joinPath(URI.file('/workspace'), 'CLAUDE.md');
			mockFileSystemService.setFile(uri, '# Only this one');

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instructionItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instructionItems).toHaveLength(1);
		});
	});

	describe('skills from .claude/ paths', () => {
		beforeEach(() => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
		});

		it('returns skills under .claude/skills/', async () => {
			const uri = URI.file('/workspace/.claude/skills/my-skill/SKILL.md');
			mockPromptFileService.setSkills([{ uri }]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems).toHaveLength(1);
			expect(skillItems[0].uri).toBe(uri);
			expect(skillItems[0].name).toBe('my-skill');
		});

		it('filters out skills not under .claude/', async () => {
			mockPromptFileService.setSkills([
				{ uri: URI.file('/workspace/.github/skills/copilot-skill/SKILL.md') },
				{ uri: URI.file('/workspace/.copilot/skills/other/SKILL.md') },
			]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems).toHaveLength(0);
		});

		it('includes skills from user home .claude/ directory', async () => {
			const uri = URI.file('/home/user/.claude/skills/global-skill/SKILL.md');
			mockPromptFileService.setSkills([{ uri }]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems).toHaveLength(1);
		});
	});

	describe('combined items', () => {
		it('returns agents, instructions, skills, and hooks together', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockRuntimeDataService.setAgents([{ name: 'Explore', description: 'Agent' }]);
			mockFileSystemService.setFile(URI.joinPath(URI.file('/workspace'), 'CLAUDE.md'), '# Instructions');
			mockPromptFileService.setSkills([{ uri: URI.file('/workspace/.claude/skills/s/SKILL.md') }]);
			mockFileSystemService.setFile(
				URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json'),
				JSON.stringify({ hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: './init.sh' }] }] } })
			);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items.filter(i => i.type === FakeChatSessionCustomizationType.Agent)).toHaveLength(1);
			expect(items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions)).toHaveLength(1);
			expect(items.filter(i => i.type === FakeChatSessionCustomizationType.Skill)).toHaveLength(1);
			expect(items.filter(i => i.type === FakeChatSessionCustomizationType.Hook)).toHaveLength(1);
		});
	});

	describe('hook discovery', () => {
		it('discovers hooks from workspace .claude/settings.json', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);
			const settingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.json');
			mockFileSystemService.setFile(settingsUri, JSON.stringify({
				hooks: {
					PreToolUse: [
						{ matcher: 'Bash', hooks: [{ type: 'command', command: './scripts/pre-bash.sh' }] }
					]
				}
			}));

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems).toHaveLength(1);
			expect(hookItems[0].name).toBe('PreToolUse (Bash)');
			expect(hookItems[0].description).toBe('./scripts/pre-bash.sh');
			expect(hookItems[0].uri).toEqual(settingsUri);
		});

		it('uses wildcard label for * matcher', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);
			mockFileSystemService.setFile(
				URI.joinPath(workspaceFolder, '.claude', 'settings.json'),
				JSON.stringify({
					hooks: {
						SessionStart: [
							{ matcher: '*', hooks: [{ type: 'command', command: './init.sh' }] }
						]
					}
				})
			);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems).toHaveLength(1);
			expect(hookItems[0].name).toBe('SessionStart');
		});

		it('discovers hooks from user home .claude/settings.json', async () => {
			const userSettingsUri = URI.joinPath(URI.file('/home/user'), '.claude', 'settings.json');
			mockFileSystemService.setFile(userSettingsUri, JSON.stringify({
				hooks: {
					PostToolUse: [
						{ matcher: 'Edit', hooks: [{ type: 'command', command: './lint.sh' }] }
					]
				}
			}));

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems).toHaveLength(1);
			expect(hookItems[0].name).toBe('PostToolUse (Edit)');
		});

		it('discovers multiple hooks across event types', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);
			mockFileSystemService.setFile(
				URI.joinPath(workspaceFolder, '.claude', 'settings.json'),
				JSON.stringify({
					hooks: {
						PreToolUse: [
							{ matcher: 'Bash', hooks: [{ type: 'command', command: './a.sh' }] },
							{ matcher: 'Edit', hooks: [{ type: 'command', command: './b.sh' }, { type: 'command', command: './c.sh' }] },
						],
						SessionStart: [
							{ matcher: '*', hooks: [{ type: 'command', command: './init.sh' }] }
						]
					}
				})
			);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems).toHaveLength(4);
		});

		it('gracefully handles missing settings files', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toEqual([]);
		});

		it('gracefully handles invalid JSON in settings', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);
			mockFileSystemService.setFile(
				URI.joinPath(workspaceFolder, '.claude', 'settings.json'),
				'not valid json {'
			);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toEqual([]);
		});
	});

	describe('onDidChange', () => {
		it('fires when runtime data changes', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockRuntimeDataService.fireChanged();
			expect(fired).toBe(true);
		});

		it('fires when custom agents change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockPromptFileService.fireCustomAgentsChanged();
			expect(fired).toBe(true);
		});

		it('fires when skills change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockPromptFileService.fireSkillsChanged();
			expect(fired).toBe(true);
		});

		it('fires when workspace folders change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockWorkspaceService.fireWorkspaceFoldersChanged();
			expect(fired).toBe(true);
		});
	});
});
