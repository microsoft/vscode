/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentInfo, Settings as ClaudeSettings } from '@anthropic-ai/claude-agent-sdk';
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
import { ClaudeSettingsFile, ClaudeSettingsLocationType, IClaudeSettingsService } from '../../claude/common/claudeSettingsService';
import { ClaudeCustomizationProvider } from '../claudeCustomizationProvider';
import { MockPromptsService } from '../../../../platform/promptFiles/test/common/mockPromptsService';

class MockMemento implements vscode.Memento {
	private readonly _store = new Map<string, unknown>();
	keys(): readonly string[] { return [...this._store.keys()]; }
	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(key: string, defaultValue?: T): T | undefined {
		const v = this._store.get(key);
		return v !== undefined ? v as T : defaultValue;
	}
	update(key: string, value: unknown): Thenable<void> {
		if (value === undefined) {
			this._store.delete(key);
		} else {
			this._store.set(key, value);
		}
		return Promise.resolve();
	}
}

function mockAgent(uri: URI, name: string): vscode.ChatCustomAgent {
	return { uri, name, source: 'local', userInvocable: true, disableModelInvocation: false } as vscode.ChatCustomAgent;
}

function mockSkill(uri: URI, name: string): vscode.ChatSkill {
	return { uri, name, source: 'local' } as vscode.ChatSkill;
}

class FakeChatSessionCustomizationType {
	static readonly Agent = new FakeChatSessionCustomizationType('agent');
	static readonly Skill = new FakeChatSessionCustomizationType('skill');
	static readonly Instructions = new FakeChatSessionCustomizationType('instructions');
	static readonly Prompt = new FakeChatSessionCustomizationType('prompt');
	static readonly Hook = new FakeChatSessionCustomizationType('hook');
	static readonly Plugins = new FakeChatSessionCustomizationType('plugins');
	constructor(readonly id: string) { }
}

const FakeChatSessionCustomizationEnablementScope = {
	None: 0,
	Global: 1,
	Workspace: 2,
	ManagedByApplication: 3,
} as const;

class MockRuntimeDataService extends mock<IClaudeRuntimeDataService>() {
	private readonly _onDidChange = new Emitter<void>();
	override readonly onDidChange = this._onDidChange.event;
	private _agents: AgentInfo[] = [];

	setAgents(agents: AgentInfo[]) { this._agents = agents; }
	override getAgents(): readonly AgentInfo[] { return this._agents; }
	fireChanged() { this._onDidChange.fire(); }
	dispose() { this._onDidChange.dispose(); }
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

class MockClaudeSettingsService extends mock<IClaudeSettingsService>() {
	private readonly _onDidChange = new Emitter<void>();
	override readonly onDidChange = this._onDidChange.event;
	private readonly _files = new Map<string, ClaudeSettings>();
	private readonly _writtenFiles = new Map<string, ClaudeSettings>();
	private _settingsUris: URI[] = [];

	setSettingsUris(uris: URI[]) { this._settingsUris = uris; }

	setFile(uri: URI, settings: ClaudeSettings) {
		this._files.set(uri.toString(), settings);
	}

	getWrittenFile(uri: URI): ClaudeSettings | undefined {
		return this._writtenFiles.get(uri.toString());
	}

	override getUris(location?: ClaudeSettingsLocationType): URI[] {
		return this._settingsUris.filter(u => {
			if (!location) {
				return true;
			}
			if (location === ClaudeSettingsLocationType.User) {
				return u.path.includes('/home/user/');
			}
			if (location === ClaudeSettingsLocationType.WorkspaceLocal) {
				return u.path.endsWith('.local.json');
			}
			return u.path.includes('/workspace/') && !u.path.endsWith('.local.json');
		});
	}

	override getUri(location: ClaudeSettingsLocationType, _uri: URI): URI {
		const uris = this.getUris(location);
		return uris[0];
	}

	override async readSettingsFile(uri: URI): Promise<ClaudeSettings> {
		return this._files.get(uri.toString()) ?? {};
	}

	override async readAllSettings(): Promise<Readonly<ClaudeSettingsFile[]>> {
		return this._settingsUris.map(uri => {
			let type: ClaudeSettingsLocationType;
			if (uri.path.includes('/home/user/')) {
				type = ClaudeSettingsLocationType.User;
			} else if (uri.path.endsWith('.local.json')) {
				type = ClaudeSettingsLocationType.WorkspaceLocal;
			} else {
				type = ClaudeSettingsLocationType.Workspace;
			}
			return { type, settings: this._files.get(uri.toString()) ?? {}, uri };
		});
	}

	override async writeSettingsFile(uri: URI, settings: ClaudeSettings): Promise<void> {
		this._files.set(uri.toString(), settings);
		this._writtenFiles.set(uri.toString(), settings);
	}

	fireChanged() { this._onDidChange.fire(); }
	dispose() { this._onDidChange.dispose(); }
}

class MockEnvService extends mock<INativeEnvService>() {
	override userHome = URI.file('/home/user');
}

class TestLogService extends mock<ILogService>() {
	override trace() { }
	override debug() { }
	override warn() { }
}

describe('ClaudeCustomizationProvider', () => {
	let disposables: DisposableStore;
	let mockRuntimeDataService: MockRuntimeDataService;
	let mockPromptsService: MockPromptsService;
	let mockClaudeSettingsService: MockClaudeSettingsService;
	let mockWorkspaceService: MockWorkspaceService;
	let mockFileSystemService: MockFileSystemService;
	let provider: ClaudeCustomizationProvider;

	let originalChatSessionCustomizationType: unknown;
	let originalChatSessionCustomizationEnablementScope: unknown;

	beforeEach(() => {
		originalChatSessionCustomizationType = (vscode as Record<string, unknown>).ChatSessionCustomizationType;
		originalChatSessionCustomizationEnablementScope = (vscode as Record<string, unknown>).ChatSessionCustomizationEnablementScope;
		(vscode as Record<string, unknown>).ChatSessionCustomizationType = FakeChatSessionCustomizationType;
		(vscode as Record<string, unknown>).ChatSessionCustomizationEnablementScope = FakeChatSessionCustomizationEnablementScope;
		disposables = new DisposableStore();
		mockRuntimeDataService = disposables.add(new MockRuntimeDataService());
		mockPromptsService = disposables.add(new MockPromptsService());
		mockClaudeSettingsService = disposables.add(new MockClaudeSettingsService());
		mockWorkspaceService = new MockWorkspaceService();
		mockFileSystemService = new MockFileSystemService();
		provider = disposables.add(new ClaudeCustomizationProvider(
			mockPromptsService,
			mockRuntimeDataService,
			mockClaudeSettingsService,
			mockWorkspaceService,
			mockFileSystemService,
			new MockEnvService(),
			new TestLogService(),
			{ globalState: new MockMemento(), workspaceState: new MockMemento() } as any,
		));
	});

	afterEach(() => {
		disposables.dispose();
		(vscode as Record<string, unknown>).ChatSessionCustomizationType = originalChatSessionCustomizationType;
		(vscode as Record<string, unknown>).ChatSessionCustomizationEnablementScope = originalChatSessionCustomizationEnablementScope;
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
			mockPromptsService.setCustomAgents([
				mockAgent(URI.file('/workspace/.claude/agents/my-agent.agent.md'), 'my-agent'),
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
			mockPromptsService.setCustomAgents([
				mockAgent(URI.file('/workspace/.claude/agents/my-agent.agent.md'), 'my-agent'),
			]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const agentItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Agent);
			expect(agentItems).toHaveLength(1);
			expect(agentItems[0].description).toBe('SDK version');
			expect(agentItems[0].groupKey).toBeUndefined();
		});

		it('filters out file agents not under .claude/', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockPromptsService.setCustomAgents([
				mockAgent(URI.file('/workspace/.github/my-agent.agent.md'), 'my-agent'),
				mockAgent(URI.file('/workspace/root.agent.md'), 'root-agent'),
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
			mockPromptsService.setSkills([mockSkill(uri, 'my-skill')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems).toHaveLength(1);
			expect(skillItems[0].uri).toBe(uri);
			expect(skillItems[0].name).toBe('my-skill');
		});

		it('filters out skills not under .claude/', async () => {
			mockPromptsService.setSkills([
				mockSkill(URI.file('/workspace/.github/skills/copilot-skill/SKILL.md'), 'copilot-skill'),
				mockSkill(URI.file('/workspace/.copilot/skills/other/SKILL.md'), 'other-skill'),
			]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems).toHaveLength(0);
		});

		it('includes skills from user home .claude/ directory', async () => {
			const uri = URI.file('/home/user/.claude/skills/global-skill/SKILL.md');
			mockPromptsService.setSkills([mockSkill(uri, 'global-skill')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems).toHaveLength(1);
		});

		it('marks skill as disabled when skillOverrides has off', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, { skillOverrides: { 'my-skill': 'off' } });
			mockPromptsService.setSkills([mockSkill(URI.file('/workspace/.claude/skills/my-skill/SKILL.md'), 'my-skill')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems).toHaveLength(1);
			expect(skillItems[0].enabled).toBe(false);
		});

		it('marks skill as enabled when skillOverrides has on or name-only', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, { skillOverrides: { 'skill-a': 'on', 'skill-b': 'name-only' } });
			mockPromptsService.setSkills([
				mockSkill(URI.file('/workspace/.claude/skills/skill-a/SKILL.md'), 'skill-a'),
				mockSkill(URI.file('/workspace/.claude/skills/skill-b/SKILL.md'), 'skill-b'),
			]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems).toHaveLength(2);
			expect(skillItems[0].enabled).toBe(true);
			expect(skillItems[1].enabled).toBe(true);
		});

		it('defaults skill to enabled when no override exists', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockPromptsService.setSkills([mockSkill(URI.file('/workspace/.claude/skills/my-skill/SKILL.md'), 'my-skill')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems[0].enabled).toBe(true);
		});

		it('uses higher-priority settings file for skillOverrides (first-writer-wins)', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const wsLocalUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.local.json');
			const wsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([wsLocalUri, wsUri]);
			mockClaudeSettingsService.setFile(wsLocalUri, { skillOverrides: { 'my-skill': 'off' } });
			mockClaudeSettingsService.setFile(wsUri, { skillOverrides: { 'my-skill': 'on' } });
			mockPromptsService.setSkills([mockSkill(URI.file('/workspace/.claude/skills/my-skill/SKILL.md'), 'my-skill')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems[0].enabled).toBe(false);
		});

		it('sets enablementScope to Workspace for skills', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockPromptsService.setSkills([mockSkill(URI.file('/workspace/.claude/skills/my-skill/SKILL.md'), 'my-skill')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const skillItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Skill);
			expect(skillItems[0].enablementScope).toBe(FakeChatSessionCustomizationEnablementScope.Workspace);
		});
	});

	describe('combined items', () => {
		it('returns agents, instructions, skills, and hooks together', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockRuntimeDataService.setAgents([{ name: 'Explore', description: 'Agent' }]);
			mockFileSystemService.setFile(URI.joinPath(URI.file('/workspace'), 'CLAUDE.md'), '# Instructions');
			mockPromptsService.setSkills([mockSkill(URI.file('/workspace/.claude/skills/s/SKILL.md'), 's')]);
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: './init.sh' }] }] }
			});

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items.filter(i => i.type === FakeChatSessionCustomizationType.Agent)).toHaveLength(1);
			expect(items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions)).toHaveLength(1);
			expect(items.filter(i => i.type === FakeChatSessionCustomizationType.Skill)).toHaveLength(1);
			expect(items.filter(i => i.type === FakeChatSessionCustomizationType.Hook)).toHaveLength(1);
		});
	});

	describe('hook discovery', () => {
		it('discovers hooks from workspace settings', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);
			const settingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				hooks: {
					PreToolUse: [
						{ matcher: 'Bash', hooks: [{ type: 'command', command: './scripts/pre-bash.sh' }] }
					]
				}
			});

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
			const settingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				hooks: {
					SessionStart: [
						{ matcher: '*', hooks: [{ type: 'command', command: './init.sh' }] }
					]
				}
			});

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems).toHaveLength(1);
			expect(hookItems[0].name).toBe('SessionStart');
		});

		it('discovers hooks from user home settings', async () => {
			const userSettingsUri = URI.joinPath(URI.file('/home/user'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([userSettingsUri]);
			mockClaudeSettingsService.setFile(userSettingsUri, {
				hooks: {
					PostToolUse: [
						{ matcher: 'Edit', hooks: [{ type: 'command', command: './lint.sh' }] }
					]
				}
			});

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems).toHaveLength(1);
			expect(hookItems[0].name).toBe('PostToolUse (Edit)');
		});

		it('discovers multiple hooks across event types', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);
			const settingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				hooks: {
					PreToolUse: [
						{ matcher: 'Bash', hooks: [{ type: 'command', command: './a.sh' }] },
						{ matcher: 'Edit', hooks: [{ type: 'command', command: './b.sh' }, { type: 'command', command: './c.sh' }] },
					],
					SessionStart: [
						{ matcher: '*', hooks: [{ type: 'command', command: './init.sh' }] }
					]
				}
			});

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems).toHaveLength(4);
		});

		it('reports hooks as enabled when disableAllHooks is not set', async () => {
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: './init.sh' }] }] }
			});

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems[0].enabled).toBe(true);
		});

		it('reports hooks as disabled when disableAllHooks is true', async () => {
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				disableAllHooks: true,
				hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: './init.sh' }] }] }
			});

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems[0].enabled).toBe(false);
		});

		it('disables hooks in lower-priority settings when higher-priority settings has disableAllHooks', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);

			const localSettingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.local.json');
			const wsSettingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.json');

			mockClaudeSettingsService.setSettingsUris([localSettingsUri, wsSettingsUri]);
			mockClaudeSettingsService.setFile(localSettingsUri, {
				disableAllHooks: true,
				hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: './local-init.sh' }] }] },
			});
			mockClaudeSettingsService.setFile(wsSettingsUri, {
				hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: './check.sh' }] }] },
			});

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems).toHaveLength(2);
			// Local hook disabled by its own disableAllHooks
			expect(hookItems[0].name).toBe('SessionStart');
			expect(hookItems[0].enabled).toBe(false);
			// Workspace hook also disabled because higher-priority local had disableAllHooks
			expect(hookItems[1].name).toBe('PreToolUse');
			expect(hookItems[1].enabled).toBe(false);
		});

		it('does not disable hooks in higher-priority settings when lower-priority has disableAllHooks', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);

			const localSettingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.local.json');
			const wsSettingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.json');

			mockClaudeSettingsService.setSettingsUris([localSettingsUri, wsSettingsUri]);
			mockClaudeSettingsService.setFile(localSettingsUri, {
				hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: './local-init.sh' }] }] },
			});
			mockClaudeSettingsService.setFile(wsSettingsUri, {
				disableAllHooks: true,
				hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: './check.sh' }] }] },
			});

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems).toHaveLength(2);
			// Local (higher priority) hook stays enabled
			expect(hookItems[0].name).toBe('SessionStart');
			expect(hookItems[0].enabled).toBe(true);
			// Workspace hook disabled by its own disableAllHooks
			expect(hookItems[1].name).toBe('PreToolUse');
			expect(hookItems[1].enabled).toBe(false);
		});

		it('gracefully handles no settings files', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);

			const items = await provider.provideChatSessionCustomizations(undefined!);
			expect(items).toEqual([]);
		});
	});

	describe('hook enablement', () => {
		it('disables hooks by setting disableAllHooks to true', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);
			const settingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: './check.sh' }] }] }
			});

			await provider.handleCustomizationEnablement(
				settingsUri, FakeChatSessionCustomizationType.Hook as any,
				false, 2 /* Workspace */, undefined!);

			const written = mockClaudeSettingsService.getWrittenFile(settingsUri);
			expect(written).toBeDefined();
			expect(written!.disableAllHooks).toBe(true);
		});

		it('enables hooks by removing disableAllHooks', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);
			const settingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				disableAllHooks: true,
				hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: './check.sh' }] }] }
			});

			await provider.handleCustomizationEnablement(
				settingsUri, FakeChatSessionCustomizationType.Hook as any,
				true, 2 /* Workspace */, undefined!);

			const written = mockClaudeSettingsService.getWrittenFile(settingsUri);
			expect(written).toBeDefined();
			expect(written!.disableAllHooks).toBeUndefined();
		});

		it('preserves other settings when toggling hooks', async () => {
			const workspaceFolder = URI.file('/workspace');
			mockWorkspaceService.setFolders([workspaceFolder]);
			const settingsUri = URI.joinPath(workspaceFolder, '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				permissions: { allow: ['Read'] },
				hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: './init.sh' }] }] }
			});

			await provider.handleCustomizationEnablement(
				settingsUri, FakeChatSessionCustomizationType.Hook as any,
				false, 2 /* Workspace */, undefined!);

			const written = mockClaudeSettingsService.getWrittenFile(settingsUri);
			expect(written!.permissions).toEqual({ allow: ['Read'] });
			expect(written!.hooks).toBeDefined();
		});

		it('only modifies the settings file matching the hook URI', async () => {
			const userUri = URI.joinPath(URI.file('/home/user'), '.claude', 'settings.json');
			const wsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockClaudeSettingsService.setSettingsUris([userUri, wsUri]);
			mockClaudeSettingsService.setFile(userUri, {
				hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: './user-init.sh' }] }] }
			});
			mockClaudeSettingsService.setFile(wsUri, {
				hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: './ws-check.sh' }] }] }
			});

			// Disable hooks in the workspace file only
			await provider.handleCustomizationEnablement(
				wsUri, FakeChatSessionCustomizationType.Hook as any,
				false, 2 /* Workspace */, undefined!);

			expect(mockClaudeSettingsService.getWrittenFile(wsUri)!.disableAllHooks).toBe(true);
			expect(mockClaudeSettingsService.getWrittenFile(userUri)).toBeUndefined();
		});

		it('fires onDidChange after toggling hooks', async () => {
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: './init.sh' }] }] }
			});

			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			await provider.handleCustomizationEnablement(
				settingsUri, FakeChatSessionCustomizationType.Hook as any,
				false, 2 /* Workspace */, undefined!);

			expect(fired).toBe(true);
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

			mockPromptsService.fireCustomAgentsChanged();
			expect(fired).toBe(true);
		});

		it('fires when skills change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockPromptsService.fireSkillsChanged();
			expect(fired).toBe(true);
		});

		it('fires when workspace folders change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockWorkspaceService.fireWorkspaceFoldersChanged();
			expect(fired).toBe(true);
		});

		it('fires when claude settings change', () => {
			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			mockClaudeSettingsService.fireChanged();
			expect(fired).toBe(true);
		});
	});

	describe('skill enablement', () => {
		it('disables a skill by writing skillOverrides off to workspace settings', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const wsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([wsUri]);
			mockClaudeSettingsService.setFile(wsUri, {});

			const skillUri = URI.file('/workspace/.claude/skills/my-skill/SKILL.md');
			await provider.handleCustomizationEnablement(
				skillUri, FakeChatSessionCustomizationType.Skill as any,
				false, FakeChatSessionCustomizationEnablementScope.Workspace, undefined!);

			const written = mockClaudeSettingsService.getWrittenFile(wsUri);
			expect(written).toBeDefined();
			expect(written!.skillOverrides).toEqual({ 'my-skill': 'off' });
		});

		it('enables a skill by removing its skillOverrides entry', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const wsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([wsUri]);
			mockClaudeSettingsService.setFile(wsUri, { skillOverrides: { 'my-skill': 'off' } });

			const skillUri = URI.file('/workspace/.claude/skills/my-skill/SKILL.md');
			await provider.handleCustomizationEnablement(
				skillUri, FakeChatSessionCustomizationType.Skill as any,
				true, FakeChatSessionCustomizationEnablementScope.Workspace, undefined!);

			const written = mockClaudeSettingsService.getWrittenFile(wsUri);
			expect(written).toBeDefined();
			expect(written!.skillOverrides).toBeUndefined();
		});

		it('preserves other skill overrides when toggling one', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const wsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([wsUri]);
			mockClaudeSettingsService.setFile(wsUri, { skillOverrides: { 'my-skill': 'off', 'other-skill': 'off' } });

			const skillUri = URI.file('/workspace/.claude/skills/my-skill/SKILL.md');
			await provider.handleCustomizationEnablement(
				skillUri, FakeChatSessionCustomizationType.Skill as any,
				true, FakeChatSessionCustomizationEnablementScope.Workspace, undefined!);

			const written = mockClaudeSettingsService.getWrittenFile(wsUri);
			expect(written!.skillOverrides).toEqual({ 'other-skill': 'off' });
		});

		it('fires onDidChange after toggling a skill', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const wsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([wsUri]);
			mockClaudeSettingsService.setFile(wsUri, {});

			let fired = false;
			disposables.add(provider.onDidChange(() => { fired = true; }));

			const skillUri = URI.file('/workspace/.claude/skills/my-skill/SKILL.md');
			await provider.handleCustomizationEnablement(
				skillUri, FakeChatSessionCustomizationType.Skill as any,
				false, FakeChatSessionCustomizationEnablementScope.Workspace, undefined!);

			expect(fired).toBe(true);
		});
	});

	describe('instructions enablement', () => {
		it('marks instruction as disabled when claudeMdExcludes matches', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const claudeMdUri = URI.joinPath(URI.file('/workspace'), 'CLAUDE.md');
			mockFileSystemService.setFile(claudeMdUri, '# Instructions');
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, { claudeMdExcludes: ['/workspace/CLAUDE.md'] });

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instructionItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instructionItems).toHaveLength(1);
			expect(instructionItems[0].enabled).toBe(false);
		});

		it('marks instruction as enabled when not excluded', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const claudeMdUri = URI.joinPath(URI.file('/workspace'), 'CLAUDE.md');
			mockFileSystemService.setFile(claudeMdUri, '# Instructions');

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instructionItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instructionItems[0].enabled).toBe(true);
		});

		it('sets enablementScope to Workspace when excluded by exact path', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const claudeMdUri = URI.joinPath(URI.file('/workspace'), 'CLAUDE.md');
			mockFileSystemService.setFile(claudeMdUri, '# Instructions');
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, { claudeMdExcludes: ['/workspace/CLAUDE.md'] });

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instructionItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instructionItems[0].enablementScope).toBe(FakeChatSessionCustomizationEnablementScope.Workspace);
		});

		it('sets enablementScope to None when excluded by glob pattern only', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const claudeMdUri = URI.joinPath(URI.file('/workspace'), 'CLAUDE.md');
			mockFileSystemService.setFile(claudeMdUri, '# Instructions');
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, { claudeMdExcludes: ['**/CLAUDE.md'] });

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const instructionItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Instructions);
			expect(instructionItems[0].enabled).toBe(false);
			expect(instructionItems[0].enablementScope).toBe(FakeChatSessionCustomizationEnablementScope.None);
		});

		it('disables an instruction by adding to claudeMdExcludes', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const wsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([wsUri]);
			mockClaudeSettingsService.setFile(wsUri, {});

			const claudeMdUri = URI.joinPath(URI.file('/workspace'), 'CLAUDE.md');
			await provider.handleCustomizationEnablement(
				claudeMdUri, FakeChatSessionCustomizationType.Instructions as any,
				false, FakeChatSessionCustomizationEnablementScope.Workspace, undefined!);

			const written = mockClaudeSettingsService.getWrittenFile(wsUri);
			expect(written).toBeDefined();
			expect(written!.claudeMdExcludes).toContain('/workspace/CLAUDE.md');
		});

		it('enables an instruction by removing from claudeMdExcludes', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const wsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([wsUri]);
			mockClaudeSettingsService.setFile(wsUri, { claudeMdExcludes: ['/workspace/CLAUDE.md'] });

			const claudeMdUri = URI.joinPath(URI.file('/workspace'), 'CLAUDE.md');
			await provider.handleCustomizationEnablement(
				claudeMdUri, FakeChatSessionCustomizationType.Instructions as any,
				true, FakeChatSessionCustomizationEnablementScope.Workspace, undefined!);

			const written = mockClaudeSettingsService.getWrittenFile(wsUri);
			expect(written).toBeDefined();
			expect(written!.claudeMdExcludes).toBeUndefined();
		});

		it('preserves other excludes when toggling one instruction', async () => {
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			const wsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockClaudeSettingsService.setSettingsUris([wsUri]);
			mockClaudeSettingsService.setFile(wsUri, {
				claudeMdExcludes: ['/workspace/CLAUDE.md', '/workspace/CLAUDE.local.md']
			});

			const claudeMdUri = URI.joinPath(URI.file('/workspace'), 'CLAUDE.md');
			await provider.handleCustomizationEnablement(
				claudeMdUri, FakeChatSessionCustomizationType.Instructions as any,
				true, FakeChatSessionCustomizationEnablementScope.Workspace, undefined!);

			const written = mockClaudeSettingsService.getWrittenFile(wsUri);
			expect(written!.claudeMdExcludes).toEqual(['/workspace/CLAUDE.local.md']);
		});
	});

	describe('hook descriptions', () => {
		it('shows prompt text for prompt-type hooks', async () => {
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				hooks: { PostToolUse: [{ matcher: '*', hooks: [{ type: 'prompt', prompt: 'Review the output' }] }] }
			});

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems[0].description).toBe('Review the output');
		});

		it('shows URL for http-type hooks', async () => {
			const settingsUri = URI.joinPath(URI.file('/workspace'), '.claude', 'settings.json');
			mockWorkspaceService.setFolders([URI.file('/workspace')]);
			mockClaudeSettingsService.setSettingsUris([settingsUri]);
			mockClaudeSettingsService.setFile(settingsUri, {
				hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'http', url: 'https://example.com/hook' }] }] }
			});

			const items = await provider.provideChatSessionCustomizations(undefined!);
			const hookItems = items.filter(i => i.type === FakeChatSessionCustomizationType.Hook);
			expect(hookItems[0].description).toBe('https://example.com/hook');
		});
	});
});
