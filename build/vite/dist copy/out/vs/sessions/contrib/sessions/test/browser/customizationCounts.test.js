/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { PromptsStorage, AgentInstructionFileType } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { getSourceCounts, getSourceCountsTotal, getCustomizationTotalCount } from '../../browser/customizationCounts.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
function localFile(path) {
    return { uri: URI.file(path), storage: PromptsStorage.local, type: PromptsType.instructions };
}
function userFile(path) {
    return { uri: URI.file(path), storage: PromptsStorage.user, type: PromptsType.instructions };
}
function extensionFile(path) {
    return {
        uri: URI.file(path),
        storage: PromptsStorage.extension,
        type: PromptsType.instructions,
        extension: undefined,
        source: undefined,
    };
}
function agentInstructionFile(path) {
    return { uri: URI.file(path), realPath: undefined, type: AgentInstructionFileType.agentsMd };
}
function makeWorkspaceFolder(path, name) {
    const uri = URI.file(path);
    return {
        uri,
        name: name ?? path.split('/').pop(),
        index: 0,
        toResource: (rel) => URI.joinPath(uri, rel),
    };
}
function createMockPromptsService(opts = {}) {
    return {
        listPromptFilesForStorage: async (type, storage) => {
            if (storage === PromptsStorage.local) {
                return opts.localFiles ?? [];
            }
            if (storage === PromptsStorage.user) {
                return opts.userFiles ?? [];
            }
            if (storage === PromptsStorage.extension) {
                return opts.extensionFiles ?? [];
            }
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
            uri: c.uri,
            name: c.name,
            type: c.type,
            storage: c.storage,
            userInvocable: true,
            parsedPromptFile: undefined,
            when: undefined,
        })),
        getSourceFolders: async () => [],
        getResolvedSourceFolders: async () => [],
        onDidChangeCustomAgents: Event.None,
        onDidChangeSlashCommands: Event.None,
    };
}
function createMockWorkspaceService(opts = {}) {
    const defaultFilter = opts.filter ?? {
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
    };
}
function createMockWorkspaceContextService(folders) {
    return {
        getWorkspace: () => ({ folders }),
        getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */,
        getWorkspaceFolder: () => folders[0],
        onDidChangeWorkspaceFolders: Event.None,
        onDidChangeWorkbenchState: Event.None,
        onDidChangeWorkspaceName: Event.None,
        isInsideWorkspace: () => true,
    };
}
suite('customizationCounts', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const workspaceRoot = URI.file('/workspace');
    const workspaceFolder = makeWorkspaceFolder('/workspace');
    suite('getSourceCountsTotal', () => {
        test('sums only visible sources', () => {
            const counts = { workspace: 5, user: 3, extension: 2, builtin: 0 };
            const filter = { sources: [PromptsStorage.local, PromptsStorage.user] };
            assert.strictEqual(getSourceCountsTotal(counts, filter), 8);
        });
        test('returns 0 for empty sources', () => {
            const counts = { workspace: 5, user: 3, extension: 2, builtin: 0 };
            const filter = { sources: [] };
            assert.strictEqual(getSourceCountsTotal(counts, filter), 0);
        });
        test('sums all sources', () => {
            const counts = { workspace: 5, user: 3, extension: 2, builtin: 0 };
            const filter = { sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension] };
            assert.strictEqual(getSourceCountsTotal(counts, filter), 10);
        });
        test('handles single source', () => {
            const counts = { workspace: 7, user: 0, extension: 0, builtin: 0 };
            const filter = { sources: [PromptsStorage.local] };
            assert.strictEqual(getSourceCountsTotal(counts, filter), 7);
        });
        test('ignores plugin storage in totals (not in ISourceCounts)', () => {
            const counts = { workspace: 1, user: 1, extension: 1, builtin: 0 };
            const filter = { sources: [PromptsStorage.plugin] };
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, { sources: [PromptsStorage.local] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.agent, { sources: [PromptsStorage.local] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.agent, { sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension] }, contextService, workspaceService);
            assert.deepStrictEqual(counts, { workspace: 1, user: 1, extension: 1, builtin: 0 });
        });
        test('empty agents returns all zeros', async () => {
            const promptsService = createMockPromptsService({ agents: [] });
            const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
            const contextService = createMockWorkspaceContextService([workspaceFolder]);
            const counts = await getSourceCounts(promptsService, PromptsType.agent, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
            assert.deepStrictEqual(counts, { workspace: 0, user: 0, extension: 0, builtin: 0 });
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
            const counts = await getSourceCounts(promptsService, PromptsType.skill, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
            assert.strictEqual(counts.workspace, 1);
            assert.strictEqual(counts.user, 1);
        });
        test('empty skills returns zeros', async () => {
            const promptsService = createMockPromptsService({ skills: [] });
            const workspaceService = createMockWorkspaceService({ activeRoot: workspaceRoot });
            const contextService = createMockWorkspaceContextService([workspaceFolder]);
            const counts = await getSourceCounts(promptsService, PromptsType.skill, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
            assert.deepStrictEqual(counts, { workspace: 0, user: 0, extension: 0, builtin: 0 });
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
            const counts = await getSourceCounts(promptsService, PromptsType.skill, { sources: [PromptsStorage.local] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.prompt, { sources: [PromptsStorage.local] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.prompt, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
            assert.deepStrictEqual(counts, { workspace: 1, user: 1, extension: 0, builtin: 0 });
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
            const counts = await getSourceCounts(promptsService, PromptsType.prompt, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
            assert.deepStrictEqual(counts, { workspace: 0, user: 0, extension: 0, builtin: 0 });
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
            const counts = await getSourceCounts(promptsService, PromptsType.hook, { sources: [PromptsStorage.local] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.hook, { sources: [PromptsStorage.local] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, {
                sources: [PromptsStorage.local, PromptsStorage.user],
                includedUserFileRoots: [copilotRoot],
            }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, { sources: [PromptsStorage.local] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, {
                sources: [PromptsStorage.local, PromptsStorage.user],
                includedUserFileRoots: [copilotRoot, claudeRoot],
            }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, { sources: [PromptsStorage.user] }, contextService, workspaceService);
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
            };
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
            };
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
            promptsService.listPromptFiles = async (type) => {
                return type === PromptsType.instructions ? instructionFiles : [];
            };
            const mcpService = {
                servers: observableValue('test', []),
            };
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
            const instructionFiles = Array.from({ length: 13 }, (_, i) => localFile(`/workspace/.github/instructions/rule-${i}.instructions.md`));
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.agent, { sources: [PromptsStorage.local] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.prompt, { sources: [PromptsStorage.local] }, contextService, workspaceService);
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
            const counts = await getSourceCounts(promptsService, PromptsType.instructions, { sources: [PromptsStorage.local, PromptsStorage.user] }, contextService, workspaceService);
            // No workspace context → classified as user
            assert.strictEqual(counts.workspace, 0);
            assert.strictEqual(counts.user, 1);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvbkNvdW50cy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9ucy90ZXN0L2Jyb3dzZXIvY3VzdG9taXphdGlvbkNvdW50cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBQ3ZHLE9BQU8sRUFBbUIsY0FBYyxFQUErRix3QkFBd0IsRUFBRSxNQUFNLHFGQUFxRixDQUFDO0FBRzdQLE9BQU8sRUFBRSxlQUFlLEVBQUUsb0JBQW9CLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV6SCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTNFLFNBQVMsU0FBUyxDQUFDLElBQVk7SUFDOUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxXQUFXLENBQUMsWUFBWSxFQUFFLENBQUM7QUFDL0YsQ0FBQztBQUVELFNBQVMsUUFBUSxDQUFDLElBQVk7SUFDN0IsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxjQUFjLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxXQUFXLENBQUMsWUFB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