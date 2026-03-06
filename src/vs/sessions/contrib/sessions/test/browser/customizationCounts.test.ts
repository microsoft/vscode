/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage, IPromptPath, ILocalPromptPath, IUserPromptPath, IExtensionPromptPath, IResolvedAgentFile, AgentFileType } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IAICustomizationWorkspaceService, IStorageSourceFilter } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IWorkspaceContextService, IWorkspace, IWorkspaceFolder, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { getSourceCounts, getSourceCountsTotal, getCustomizationTotalCount } from '../../browser/customizationCounts.js';
import { IMcpService } from '../../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';

function localFile(path: string): ILocalPromptPath {
	return { uri: URI.file(path), storage: PromptsStorage.local, type: PromptsType.instructions };
}

function userFile(path: string): IUserPromptPath {
	return { uri: URI.file(path), storage: PromptsStorage.user, type: PromptsType.instructions };
}

function extensionFile(path: string): IExtensionPromptPath {
	return {
		uri: URI.file(path),
		storage: PromptsStorage.extension,
		type: PromptsType.instructions,
		extension: undefined!,
		source: undefined!,
	};
}

function agentInstructionFile(path: string): IResolvedAgentFile {
	return { uri: URI.file(path), realPath: undefined, type: AgentFileType.agentsMd };
}

function makeWorkspaceFolder(path: string, name?: string): IWorkspaceFolder {
	const uri = URI.file(path);
	return {
		uri,
		name: name ?? path.split('/').pop()!,
		index: 0,
		toResource: (rel: string) => URI.joinPath(uri, rel),
	};
}

function createMockPromptsService(opts: {
	localFiles?: IPromptPath[];
	userFiles?: IPromptPath[];
	extensionFiles?: IPromptPath[];
	allFiles?: IPromptPath[];
	agentInstructions?: IResolvedAgentFile[];
	agents?: { name: string; uri: URI; storage: PromptsStorage }[];
	skills?: { name: string; uri: URI; storage: PromptsStorage }[];
	commands?: { name: string; uri: URI; storage: PromptsStorage; type: PromptsType }[];
} = {}): IPromptsService {
	return {
		listPromptFilesForStorage: async (type: PromptsType, storage: PromptsStorage) => {
			if (storage === PromptsStorage.local) { return opts.localFiles ?? []; }
			if (storage === PromptsStorage.user) { return opts.userFiles ?? []; }
			if (storage === PromptsStorage.extension) { return opts.extensionFiles ?? []; }
			return [];
		},
		listPromptFiles: async () => opts.allFiles ?? [...(opts.localFiles ?? []), ...(opts.userFiles ?? []), ...(opts.extensionFiles ?? [])],
		listAgentInstructions: async () => opts.agentInstructions ?? [],
		getCustomAgents: async () => (opts.agents ?? []).map(a => ({
			name: a.name,
			uri: a.uri,
			source: { storage: a.storage },
		})),
		findAgentSkills: async () => (opts.skills ?? []).map(s => ({
			name: s.name,
			uri: s.uri,
			storage: s.storage,
		})),
		getPromptSlashCommands: async () => (opts.commands ?? []).map(c => ({
			name: c.name,
			promptPath: { uri: c.uri, storage: c.storage, type: c.type },
		})),
		getSourceFolders: async () => [],
		getResolvedSourceFolders: async () => [],
		onDidChangeCustomAgents: Event.None,
		onDidChangeSlashCommands: Event.None,
	} as unknown as IPromptsService;
}

function createMockWorkspaceService(opts: {
	activeRoot?: URI;
	filter?: IStorageSourceFilter;
} = {}): IAICustomizationWorkspaceService {
	const defaultFilter: IStorageSourceFilter = opts.filter ?? {
		sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension],
	};
	return {
		_serviceBrand: undefined,
		activeProjectRoot: observableValue('test', opts.activeRoot),
		getActiveProjectRoot: () => opts.activeRoot,
		managementSections: [],
		getStorageSourceFilter: () => defaultFilter,
		preferManualCreation: false,
		commitFiles: async () => { },
		generateCustomization: async () => { },
	} as unknown as IAICustomizationWorkspaceService;
}

function createMockWorkspaceContextService(folders: IWorkspaceFolder[]): IWorkspaceContextService {
	return {
		getWorkspace: () => ({ folders } as IWorkspace),
		getWorkbenchState: () => WorkbenchState.FOLDER,
		getWorkspaceFolder: () => folders[0],
		onDidChangeWorkspaceFolders: Event.None,
		onDidChangeWorkbenchState: Event.None,
		onDidChangeWorkspaceName: Event.None,
		isInsideWorkspace: () => true,
	} as unknown as IWorkspaceContextService;
}

suite('customizationCounts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const workspaceRoot = URI.file('/workspace');
	const workspaceFolder = makeWorkspaceFolder('/workspace');

	suite('getSourceCountsTotal', () => {
		test('sums only visible sources', () => {
			const counts = { workspace: 5, user: 3, extension: 2 };
			const filter: IStorageSourceFilter = { sources: [PromptsStorage.local, PromptsStorage.user] };
			assert.strictEqual(getSourceCountsTotal(counts, filter), 8);
		});

		test('returns 0 for empty sources', () => {
			const counts = { workspace: 5, user: 3, extension: 2 };
			const filter: IStorageSourceFilter = { sources: [] };
			assert.strictEqual(getSourceCountsTotal(counts, filter), 0);
		});

		test('sums all sources', () => {
			const counts = { workspace: 5, user: 3, extension: 2 };
			const filter: IStorageSourceFilter = { sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension] };
			assert.strictEqual(getSourceCountsTotal(counts, filter), 10);
		});

		test('handles single source', () => {
			const counts = { workspace: 7, user: 0, extension: 0 };
			const filter: IStorageSourceFilter = { sources: [PromptsStorage.local] };
			assert.strictEqual(getSourceCountsTotal(counts, filter), 7);
		});

		test('ignores plugin storage in totals (not in ISourceCounts)', () => {
			const counts = { workspace: 1, user: 1, extension: 1 };
			const filter: IStorageSourceFilter = { sources: [PromptsStorage.plugin] };
			assert.strictEqual(getSourceCountsTotal(counts, filter), 0);
		});
	});

	suite('getSourceCounts - instructions', () => {
		test('includes agent instruction files in workspace count', async () => {
			const promptsService = createMockPromptsService({
				localFiles: [
					localFile('/workspace/.github/instructions/a.instructions.md'),
				],
				userFiles: [],
				extensionFiles: [],
				allFiles: [
					localFile('/workspace/.github/instructions/a.instructions.md'),
				],
				agentInstructions: [
					agentInstructionFile('/workspace/AGENTS.md'),
					agentInstructionFile('/workspace/.github/copilot-instructions.md'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.instructions,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService,
				workspaceService,
			);

			// 1 .instructions.md + 2 agent instruction files = 3 workspace
			assert.strictEqual(counts.workspace, 3);
			assert.strictEqual(counts.user, 0);
		});

		test('classifies agent instructions outside workspace as user', async () => {
			const promptsService = createMockPromptsService({
				localFiles: [],
				userFiles: [],
				extensionFiles: [],
				allFiles: [],
				agentInstructions: [
					agentInstructionFile('/home/user/.claude/CLAUDE.md'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.instructions,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService,
				workspaceService,
			);

			assert.strictEqual(counts.workspace, 0);
			assert.strictEqual(counts.user, 1);
		});

		test('agent instructions under active root classified as workspace', async () => {
			// Active root might not be in getWorkspace().folders (e.g. sessions worktree),
			// but should still count as workspace
			const activeRoot = URI.file('/session/worktree');
			const promptsService = createMockPromptsService({
				allFiles: [],
				agentInstructions: [
					agentInstructionFile('/session/worktree/AGENTS.md'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot });
			// No workspace folders match — but active root does
			const contextService = createMockWorkspaceContextService([]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.instructions,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService,
				workspaceService,
			);

			assert.strictEqual(counts.workspace, 1);
			assert.strictEqual(counts.user, 0);
		});

		test('no agent instructions returns only prompt file counts', async () => {
			const promptsService = createMockPromptsService({
				allFiles: [
					localFile('/workspace/.github/instructions/a.instructions.md'),
					localFile('/workspace/.github/instructions/b.instructions.md'),
				],
				agentInstructions: [],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.instructions,
				{ sources: [PromptsStorage.local] },
				contextService,
				workspaceService,
			);

			assert.strictEqual(counts.workspace, 2);
		});

		test('mixed agent instructions across workspace and user', async () => {
			const promptsService = createMockPromptsService({
				allFiles: [
					localFile('/workspace/.github/instructions/rules.instructions.md'),
				],
				agentInstructions: [
					agentInstructionFile('/workspace/AGENTS.md'),
					agentInstructionFile('/workspace/CLAUDE.md'),
					agentInstructionFile('/home/user/.claude/CLAUDE.md'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.instructions,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService,
				workspaceService,
			);

			// 1 .instructions.md + 2 workspace agent files = 3
			assert.strictEqual(counts.workspace, 3);
			// 1 user-level CLAUDE.md
			assert.strictEqual(counts.user, 1);
		});
	});

	suite('getSourceCounts - agents', () => {
		test('uses getCustomAgents instead of listPromptFilesForStorage', async () => {
			const promptsService = createMockPromptsService({
				// listPromptFilesForStorage would return these — but agents should use getCustomAgents
				localFiles: [localFile('/workspace/.github/agents/a.agent.md')],
				agents: [
					{ name: 'agent-a', uri: URI.file('/workspace/.github/agents/a.agent.md'), storage: PromptsStorage.local },
					{ name: 'agent-b', uri: URI.file('/workspace/.github/agents/b.agent.md'), storage: PromptsStorage.local },
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.agent,
				{ sources: [PromptsStorage.local] },
				contextService,
				workspaceService,
			);

			// Should use getCustomAgents (2), not listPromptFilesForStorage (1)
			assert.strictEqual(counts.workspace, 2);
		});

		test('counts agents across storage types', async () => {
			const promptsService = createMockPromptsService({
				agents: [
					{ name: 'local-agent', uri: URI.file('/workspace/.github/agents/a.agent.md'), storage: PromptsStorage.local },
					{ name: 'user-agent', uri: URI.file('/home/.claude/agents/b.agent.md'), storage: PromptsStorage.user },
					{ name: 'ext-agent', uri: URI.file('/ext/agents/c.agent.md'), storage: PromptsStorage.extension },
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.agent,
				{ sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension] },
				contextService,
				workspaceService,
			);

			assert.deepStrictEqual(counts, { workspace: 1, user: 1, extension: 1 });
		});

		test('empty agents returns all zeros', async () => {
			const promptsService = createMockPromptsService({ agents: [] });
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.agent,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService, workspaceService,
			);

			assert.deepStrictEqual(counts, { workspace: 0, user: 0, extension: 0 });
		});
	});

	suite('getSourceCounts - skills', () => {
		test('uses findAgentSkills', async () => {
			const promptsService = createMockPromptsService({
				skills: [
					{ name: 'skill-a', uri: URI.file('/workspace/.github/skills/a/SKILL.md'), storage: PromptsStorage.local },
					{ name: 'skill-b', uri: URI.file('/home/user/.copilot/skills/b/SKILL.md'), storage: PromptsStorage.user },
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.skill,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService,
				workspaceService,
			);

			assert.strictEqual(counts.workspace, 1);
			assert.strictEqual(counts.user, 1);
		});

		test('empty skills returns zeros', async () => {
			const promptsService = createMockPromptsService({ skills: [] });
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.skill,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService, workspaceService,
			);

			assert.deepStrictEqual(counts, { workspace: 0, user: 0, extension: 0 });
		});

		test('skills filtered by storage source filter', async () => {
			const promptsService = createMockPromptsService({
				skills: [
					{ name: 'skill-a', uri: URI.file('/workspace/.github/skills/a/SKILL.md'), storage: PromptsStorage.local },
					{ name: 'skill-b', uri: URI.file('/home/user/.copilot/skills/b/SKILL.md'), storage: PromptsStorage.user },
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			// Only local sources visible
			const counts = await getSourceCounts(
				promptsService, PromptsType.skill,
				{ sources: [PromptsStorage.local] },
				contextService, workspaceService,
			);

			assert.strictEqual(counts.workspace, 1);
			assert.strictEqual(counts.user, 0);
		});
	});

	suite('getSourceCounts - prompts', () => {
		test('uses getPromptSlashCommands and filters out skills', async () => {
			const promptsService = createMockPromptsService({
				commands: [
					{ name: 'my-prompt', uri: URI.file('/workspace/.github/prompts/a.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt },
					{ name: 'my-skill', uri: URI.file('/workspace/.github/skills/b/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill },
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.prompt,
				{ sources: [PromptsStorage.local] },
				contextService,
				workspaceService,
			);

			// Should exclude the skill command
			assert.strictEqual(counts.workspace, 1);
		});

		test('counts prompts across storage types', async () => {
			const promptsService = createMockPromptsService({
				commands: [
					{ name: 'wp', uri: URI.file('/workspace/.github/prompts/a.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt },
					{ name: 'up', uri: URI.file('/home/user/prompts/b.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt },
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.prompt,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService, workspaceService,
			);

			assert.deepStrictEqual(counts, { workspace: 1, user: 1, extension: 0 });
		});

		test('all skills are excluded from prompt counts', async () => {
			const promptsService = createMockPromptsService({
				commands: [
					{ name: 's1', uri: URI.file('/w/s1/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill },
					{ name: 's2', uri: URI.file('/w/s2/SKILL.md'), storage: PromptsStorage.user, type: PromptsType.skill },
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.prompt,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService, workspaceService,
			);

			assert.deepStrictEqual(counts, { workspace: 0, user: 0, extension: 0 });
		});
	});

	suite('getSourceCounts - hooks', () => {
		test('uses listPromptFiles for hooks', async () => {
			const promptsService = createMockPromptsService({
				allFiles: [
					localFile('/workspace/.github/hooks/pre-commit.json'),
					localFile('/workspace/.claude/settings.json'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.hook,
				{ sources: [PromptsStorage.local] },
				contextService, workspaceService,
			);

			assert.strictEqual(counts.workspace, 2);
		});

		test('hooks with only local source excludes user hooks', async () => {
			const promptsService = createMockPromptsService({
				allFiles: [
					localFile('/workspace/.github/hooks/pre-commit.json'),
					userFile('/home/user/.claude/settings.json'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.hook,
				{ sources: [PromptsStorage.local] },
				contextService, workspaceService,
			);

			assert.strictEqual(counts.workspace, 1);
			assert.strictEqual(counts.user, 0);
		});
	});

	suite('getSourceCounts - filter', () => {
		test('applies includedUserFileRoots filter', async () => {
			const copilotRoot = URI.file('/home/user/.copilot');
			const promptsService = createMockPromptsService({
				allFiles: [
					localFile('/workspace/.github/instructions/a.instructions.md'),
					userFile('/home/user/.copilot/instructions/b.instructions.md'),
					userFile('/home/user/.vscode/instructions/c.instructions.md'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.instructions,
				{
					sources: [PromptsStorage.local, PromptsStorage.user],
					includedUserFileRoots: [copilotRoot],
				},
				contextService,
				workspaceService,
			);

			assert.strictEqual(counts.workspace, 1);
			// Only the copilot file passes, not the vscode profile file
			assert.strictEqual(counts.user, 1);
		});

		test('excludes storage types not in sources', async () => {
			const promptsService = createMockPromptsService({
				allFiles: [
					localFile('/workspace/.github/instructions/a.instructions.md'),
					extensionFile('/ext/instructions/b.instructions.md'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService,
				PromptsType.instructions,
				{ sources: [PromptsStorage.local] },
				contextService,
				workspaceService,
			);

			assert.strictEqual(counts.workspace, 1);
			assert.strictEqual(counts.extension, 0);
		});

		test('includedUserFileRoots with multiple roots', async () => {
			const copilotRoot = URI.file('/home/user/.copilot');
			const claudeRoot = URI.file('/home/user/.claude');
			const promptsService = createMockPromptsService({
				allFiles: [
					userFile('/home/user/.copilot/instructions/a.instructions.md'),
					userFile('/home/user/.claude/rules/b.md'),
					userFile('/home/user/.vscode/instructions/c.instructions.md'),
					userFile('/home/user/.agents/instructions/d.instructions.md'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.instructions,
				{
					sources: [PromptsStorage.local, PromptsStorage.user],
					includedUserFileRoots: [copilotRoot, claudeRoot],
				},
				contextService, workspaceService,
			);

			// copilot + claude pass, vscode + agents don't
			assert.strictEqual(counts.user, 2);
		});

		test('undefined includedUserFileRoots shows all user files', async () => {
			const promptsService = createMockPromptsService({
				allFiles: [
					userFile('/home/user/.copilot/instructions/a.instructions.md'),
					userFile('/home/user/.vscode/instructions/b.instructions.md'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.instructions,
				{ sources: [PromptsStorage.user] },
				contextService, workspaceService,
			);

			assert.strictEqual(counts.user, 2);
		});
	});

	suite('getCustomizationTotalCount', () => {
		test('sums all sections', async () => {
			const promptsService = createMockPromptsService({
				agents: [
					{ name: 'a', uri: URI.file('/w/a.agent.md'), storage: PromptsStorage.local },
				],
				skills: [
					{ name: 's', uri: URI.file('/w/s/SKILL.md'), storage: PromptsStorage.local },
				],
				commands: [
					{ name: 'p', uri: URI.file('/w/p.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt },
				],
			});
			const mcpService = {
				servers: observableValue('test', [{ id: 'srv1' }]),
			} as unknown as IMcpService;
			const workspaceService = createMockWorkspaceService({
				activeRoot: URI.file('/w'),
				filter: { sources: [PromptsStorage.local] },
			});
			const contextService = createMockWorkspaceContextService([makeWorkspaceFolder('/w')]);

			const total = await getCustomizationTotalCount(promptsService, mcpService, workspaceService, contextService);

			// 1 agent + 1 skill + 0 instructions + 1 prompt + 0 hooks + 1 mcp = 4
			assert.strictEqual(total, 4);
		});

		test('empty workspace returns only mcp count', async () => {
			const promptsService = createMockPromptsService({});
			const mcpService = {
				servers: observableValue('test', [{ id: 's1' }, { id: 's2' }]),
			} as unknown as IMcpService;
			const workspaceService = createMockWorkspaceService({
				filter: { sources: [PromptsStorage.local] },
			});
			const contextService = createMockWorkspaceContextService([]);

			const total = await getCustomizationTotalCount(promptsService, mcpService, workspaceService, contextService);

			assert.strictEqual(total, 2); // just 2 mcp servers
		});

		test('includes instructions with agent files in count', async () => {
			const instructionFiles = [
				localFile('/w/.github/instructions/a.instructions.md'),
			];
			const promptsService = createMockPromptsService({
				allFiles: instructionFiles,
				agentInstructions: [
					agentInstructionFile('/w/AGENTS.md'),
				],
			});
			// Override listPromptFiles to only return files for instructions type
			promptsService.listPromptFiles = async (type: PromptsType) => {
				return type === PromptsType.instructions ? instructionFiles : [];
			};
			const mcpService = {
				servers: observableValue('test', []),
			} as unknown as IMcpService;
			const workspaceService = createMockWorkspaceService({
				activeRoot: URI.file('/w'),
				filter: { sources: [PromptsStorage.local] },
			});
			const contextService = createMockWorkspaceContextService([makeWorkspaceFolder('/w')]);

			const total = await getCustomizationTotalCount(promptsService, mcpService, workspaceService, contextService);

			// 0 agents + 0 skills + 2 instructions (1 file + 1 AGENTS.md) + 0 prompts + 0 hooks + 0 mcp = 2
			assert.strictEqual(total, 2);
		});
	});

	suite('data source consistency', () => {
		// These tests verify that getSourceCounts uses the same data sources
		// as the list widget's loadItems() — the root cause of the count mismatch bug.

		test('instructions count matches widget: listPromptFiles + listAgentInstructions', async () => {
			// Scenario: 13 .instructions.md files + 2 agent instruction files = 15 total
			// The old bug: sidebar showed 13 (only listPromptFilesForStorage),
			// editor showed 15 (listPromptFiles + listAgentInstructions)
			const instructionFiles = Array.from({ length: 13 }, (_, i) =>
				localFile(`/workspace/.github/instructions/rule-${i}.instructions.md`)
			);
			const promptsService = createMockPromptsService({
				localFiles: instructionFiles,
				allFiles: instructionFiles,
				agentInstructions: [
					agentInstructionFile('/workspace/AGENTS.md'),
					agentInstructionFile('/workspace/.github/copilot-instructions.md'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.instructions,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService, workspaceService,
			);

			// Must be 15, not 13
			assert.strictEqual(counts.workspace, 15);
		});

		test('agents count uses getCustomAgents not listPromptFilesForStorage', async () => {
			// getCustomAgents parses frontmatter and may exclude invalid files
			const promptsService = createMockPromptsService({
				// Raw file count would be 3
				localFiles: [
					localFile('/workspace/.github/agents/a.agent.md'),
					localFile('/workspace/.github/agents/b.agent.md'),
					localFile('/workspace/.github/agents/README.md'), // would be excluded by getCustomAgents
				],
				// But parsed custom agents is only 2
				agents: [
					{ name: 'agent-a', uri: URI.file('/workspace/.github/agents/a.agent.md'), storage: PromptsStorage.local },
					{ name: 'agent-b', uri: URI.file('/workspace/.github/agents/b.agent.md'), storage: PromptsStorage.local },
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.agent,
				{ sources: [PromptsStorage.local] },
				contextService, workspaceService,
			);

			// Must use getCustomAgents count (2), not raw file count (3)
			assert.strictEqual(counts.workspace, 2);
		});

		test('prompts count excludes skills to match widget', async () => {
			// The widget's loadItems filters out skill-type commands.
			// Count must do the same.
			const promptsService = createMockPromptsService({
				localFiles: [
					localFile('/workspace/.github/prompts/a.prompt.md'),
					localFile('/workspace/.github/prompts/b.prompt.md'),
				],
				commands: [
					{ name: 'prompt-a', uri: URI.file('/workspace/.github/prompts/a.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt },
					{ name: 'prompt-b', uri: URI.file('/workspace/.github/prompts/b.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt },
					{ name: 'skill-x', uri: URI.file('/workspace/.github/skills/x/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill },
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
			const contextService = createMockWorkspaceContextService([workspaceFolder]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.prompt,
				{ sources: [PromptsStorage.local] },
				contextService, workspaceService,
			);

			// Must be 2 (prompts only), not 3 (including skill)
			assert.strictEqual(counts.workspace, 2);
		});

		test('no active root: agent instructions classified as user', async () => {
			const promptsService = createMockPromptsService({
				allFiles: [],
				agentInstructions: [
					agentInstructionFile('/somewhere/AGENTS.md'),
				],
			});
			const workspaceService = createMockWorkspaceService({ activeRoot: undefined });
			const contextService = createMockWorkspaceContextService([]);

			const counts = await getSourceCounts(
				promptsService, PromptsType.instructions,
				{ sources: [PromptsStorage.local, PromptsStorage.user] },
				contextService, workspaceService,
			);

			// No workspace context → classified as user
			assert.strictEqual(counts.workspace, 0);
			assert.strictEqual(counts.user, 1);
		});
	});
});
