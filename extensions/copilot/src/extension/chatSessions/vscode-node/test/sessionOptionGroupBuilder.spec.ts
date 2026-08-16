/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
// eslint-disable-next-line no-duplicate-imports
import * as vscodeShim from 'vscode';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IGitService, RepoContext } from '../../../../platform/git/common/gitService';
import { NullWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { mock } from '../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { IAgentSessionsWorkspace } from '../../common/agentSessionsWorkspace';
import { ChatSessionWorktreeProperties, IChatSessionWorktreeService } from '../../common/chatSessionWorktreeService';
import { FolderRepositoryMRUEntry, IChatFolderMruService, IFolderRepositoryManager, IsolationMode } from '../../common/folderRepositoryManager';
import {
	BRANCH_OPTION_ID,
	ISOLATION_OPTION_ID,
	REPOSITORY_OPTION_ID,
	SessionOptionGroupBuilder,
	folderMRUToChatProviderOptions,
	getSelectedOption,
	getSelectedSessionOptions,
	isBranchOptionFeatureEnabled,
	isIsolationOptionFeatureEnabled,
	resolveBranchLockState,
	resolveBranchSelection,
	resolveIsolationSelection,
	toRepositoryOptionItem,
	toWorkspaceFolderOptionItem,
} from '../sessionOptionGroupBuilder';

beforeAll(() => {
	(vscodeShim as Record<string, unknown>).workspace = {
		...((vscodeShim as Record<string, unknown>).workspace as object),
		isResourceTrusted: async () => true,
	};
});

// ─── Test Helpers ────────────────────────────────────────────────

class TestGitService extends mock<IGitService>() {
	declare readonly _serviceBrand: undefined;
	override onDidOpenRepository = Event.None;
	override onDidCloseRepository = Event.None;
	override onDidFinishInitialization = Event.None;
	override activeRepository = { get: () => undefined } as IGitService['activeRepository'];
	override repositories: RepoContext[] = [];
	override getRepository = vi.fn(async (_uri: URI): Promise<RepoContext | undefined> => this.repositories[0]);
	override getRefs = vi.fn(async () => [] as { name: string | undefined; type: number }[]);
}

class TestFolderMruService extends mock<IChatFolderMruService>() {
	declare readonly _serviceBrand: undefined;
	override getRecentlyUsedFolders = vi.fn(async () => [] as FolderRepositoryMRUEntry[]);
	override deleteRecentlyUsedFolder = vi.fn(async () => { });
}

class TestWorktreeService extends mock<IChatSessionWorktreeService>() {
	declare readonly _serviceBrand: undefined;
	override getWorktreeProperties = vi.fn(async (): Promise<ChatSessionWorktreeProperties | undefined> => undefined);
}

class TestFolderRepositoryManager extends mock<IFolderRepositoryManager>() {
	declare readonly _serviceBrand: undefined;
	override getFolderRepository = vi.fn(async () => ({
		folder: undefined,
		repository: undefined,
		worktree: undefined,
		worktreeProperties: undefined,
		trusted: undefined,
	}));
}

function createInMemoryContext(): IVSCodeExtensionContext {
	const state = new Map<string, unknown>();
	return {
		globalState: {
			get: (key: string, defaultValue?: unknown) => state.get(key) ?? defaultValue,
			keys: () => [...state.keys()],
			update: (key: string, value: unknown) => { state.set(key, value); return Promise.resolve(); },
		},
	} as unknown as IVSCodeExtensionContext;
}

function makeRepo(path: string, kind: 'repository' | 'worktree' = 'repository'): RepoContext {
	return {
		rootUri: URI.file(path),
		kind,
		headBranchName: 'main',
		remotes: ['origin'],
		remoteFetchUrls: ['https://github.com/owner/repo.git'],
	} as unknown as RepoContext;
}

function makeRef(name: string, type: number = 0 /* Head */): { name: string; type: number } {
	return { name, type };
}

function createMockChatSessionInputState(groups: readonly vscode.ChatSessionProviderOptionGroup[]): vscode.ChatSessionInputState {
	return {
		onDidDispose: Event.None,
		onDidChange: Event.None,
		groups,
		sessionResource: undefined
	};
}

// ─── Pure function tests ─────────────────────────────────────────
describe('SessionOptionGroupBuilder', () => {

	describe('getSelectedOption', () => {
		it('returns selected from matching group', () => {
			const selected = { id: 'main', name: 'main' };
			const groups: vscode.ChatSessionProviderOptionGroup[] = [
				{ id: 'branch', name: 'Branch', description: '', items: [selected], selected },
			];
			expect(getSelectedOption(groups, 'branch')).toBe(selected);
		});

		it('returns undefined when group not found', () => {
			expect(getSelectedOption([], 'branch')).toBeUndefined();
		});

		it('returns undefined when group has no selection', () => {
			const groups: vscode.ChatSessionProviderOptionGroup[] = [
				{ id: 'branch', name: 'Branch', description: '', items: [] },
			];
			expect(getSelectedOption(groups, 'branch')).toBeUndefined();
		});
	});

	describe('getSelectedSessionOptions', () => {
		it('extracts folder, branch, and isolation from input state groups', () => {
			const inputState = createMockChatSessionInputState([
				{ id: REPOSITORY_OPTION_ID, name: 'Folder', items: [{ id: '/my-repo', name: 'my-repo' }], selected: { id: '/my-repo', name: 'my-repo' } },
				{ id: BRANCH_OPTION_ID, name: 'Branch', items: [{ id: 'main', name: 'main' }], selected: { id: 'main', name: 'main' } },
				{ id: ISOLATION_OPTION_ID, name: 'Isolation', items: [{ id: IsolationMode.Worktree, name: 'Worktree' }], selected: { id: IsolationMode.Worktree, name: 'Worktree' } },
			]);
			const result = getSelectedSessionOptions(inputState);
			expect(result.folder?.fsPath).toBe(URI.file('/my-repo').fsPath);
			expect(result.branch).toBe('main');
			expect(result.isolation).toBe(IsolationMode.Worktree);
		});

		it('returns undefined values when no groups are present', () => {
			const inputState = createMockChatSessionInputState([]);
			const result = getSelectedSessionOptions(inputState);
			expect(result.folder).toBeUndefined();
			expect(result.branch).toBeUndefined();
			expect(result.isolation).toBeUndefined();
		});

		it('returns undefined values when groups have no selection', () => {
			const inputState = createMockChatSessionInputState([
				{ id: REPOSITORY_OPTION_ID, name: 'Folder', items: [] },
				{ id: BRANCH_OPTION_ID, name: 'Branch', items: [] },
				{ id: ISOLATION_OPTION_ID, name: 'Isolation', items: [] },
			]);
			const result = getSelectedSessionOptions(inputState);
			expect(result.folder).toBeUndefined();
			expect(result.branch).toBeUndefined();
			expect(result.isolation).toBeUndefined();
		});
	});

	describe('isBranchOptionFeatureEnabled / isIsolationOptionFeatureEnabled', () => {
		it('reads CLIBranchSupport config key', () => {
			const configService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
			// Default value should be whatever the config default is
			const result = isBranchOptionFeatureEnabled(configService);
			expect(typeof result).toBe('boolean');
		});

		it('reads CLIIsolationOption config key', () => {
			const configService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
			const result = isIsolationOptionFeatureEnabled(configService);
			expect(typeof result).toBe('boolean');
		});
	});

	describe('toRepositoryOptionItem', () => {
		it('creates option item from RepoContext', () => {
			const repo = makeRepo('/workspace/my-project');
			const item = toRepositoryOptionItem(repo);
			expect(item.id).toBe(URI.file('/workspace/my-project').fsPath);
			expect(item.name).toBe('my-project');
		});

		it('uses repo icon for repository kind', () => {
			const repo = makeRepo('/repo', 'repository');
			const item = toRepositoryOptionItem(repo);
			expect(item.icon).toBeDefined();
		});

		it('creates option item from Uri', () => {
			const uri = URI.file('/some/folder');
			const item = toRepositoryOptionItem(uri as any);
			expect(item.id).toBe(uri.fsPath);
			expect(item.name).toBe('folder');
		});

		it('marks item as default when isDefault is true', () => {
			const repo = makeRepo('/repo');
			const item = toRepositoryOptionItem(repo, true);
			expect(item.default).toBe(true);
		});
	});

	describe('toWorkspaceFolderOptionItem', () => {
		it('creates option item with folder icon', () => {
			const uri = URI.file('/workspace/my-folder');
			const item = toWorkspaceFolderOptionItem(uri, 'My Folder');
			expect(item.id).toBe(uri.fsPath);
			expect(item.name).toBe('My Folder');
			expect(item.icon).toBeDefined();
		});
	});

	describe('folderMRUToChatProviderOptions', () => {
		it('converts MRU entries with repositories to repo option items', () => {
			const uri = URI.file('/my-repo');
			const entries: FolderRepositoryMRUEntry[] = [
				{ folder: uri, repository: uri, lastAccessed: 100 },
			];
			const items = folderMRUToChatProviderOptions(entries);
			expect(items).toHaveLength(1);
			expect(items[0].id).toBe(uri.fsPath);
		});

		it('converts MRU entries without repositories to folder option items', () => {
			const uri = URI.file('/my-folder');
			const entries: FolderRepositoryMRUEntry[] = [
				{ folder: uri, repository: undefined, lastAccessed: 100 },
			];
			const items = folderMRUToChatProviderOptions(entries);
			expect(items).toHaveLength(1);
			expect(items[0].id).toBe(uri.fsPath);
		});

		it('returns empty array for empty input', () => {
			expect(folderMRUToChatProviderOptions([])).toEqual([]);
		});
	});

	describe('resolveBranchSelection', () => {
		const main = { id: 'main', name: 'main' };
		const dev = { id: 'dev', name: 'dev' };
		const featureX = { id: 'feature-x', name: 'feature-x' };
		const branches = [main, dev, featureX];

		it('returns previous selection if it still exists in the branch list', () => {
			expect(resolveBranchSelection(branches, 'main', dev)?.id).toBe('dev');
		});

		it('falls back to active (HEAD) branch when previous selection is no longer in list', () => {
			const stale = { id: 'deleted-branch', name: 'deleted-branch' };
			expect(resolveBranchSelection(branches, 'main', stale)?.id).toBe('main');
		});

		it('preserves stale previous selection when no active branch matches either', () => {
			const stale = { id: 'deleted-branch', name: 'deleted-branch' };
			expect(resolveBranchSelection(branches, undefined, stale)?.id).toBe('deleted-branch');
		});

		it('returns active branch when there is no previous selection', () => {
			expect(resolveBranchSelection(branches, 'dev', undefined)?.id).toBe('dev');
		});

		it('returns undefined when no branches, no active, no previous', () => {
			expect(resolveBranchSelection([], undefined, undefined)).toBeUndefined();
		});

		it('returns undefined when branches exist but no active and no previous', () => {
			expect(resolveBranchSelection(branches, undefined, undefined)).toBeUndefined();
		});
	});

	describe('resolveBranchLockState', () => {
		it('locked when isolation is enabled and Workspace is selected', () => {
			const result = resolveBranchLockState(true, IsolationMode.Workspace);
			expect(result.locked).toBe(true);
		});

		it('editable when isolation is enabled and Worktree is selected', () => {
			const result = resolveBranchLockState(true, IsolationMode.Worktree);
			expect(result.locked).toBe(false);
		});

		it('locked when isolation feature is disabled', () => {
			const result = resolveBranchLockState(false, undefined);
			expect(result.locked).toBe(true);
		});

		it('locked when isolation is disabled even if isolation value is worktree', () => {
			const result = resolveBranchLockState(false, IsolationMode.Worktree);
			expect(result.locked).toBe(true);
		});
	});

	describe('resolveIsolationSelection', () => {
		it('uses previous selection when it is a valid isolation mode', () => {
			expect(resolveIsolationSelection(IsolationMode.Worktree, IsolationMode.Workspace)).toBe(IsolationMode.Workspace);
			expect(resolveIsolationSelection(IsolationMode.Workspace, IsolationMode.Worktree)).toBe(IsolationMode.Worktree);
		});

		it('falls back to lastUsed when there is no previous selection', () => {
			expect(resolveIsolationSelection(IsolationMode.Worktree, undefined)).toBe(IsolationMode.Worktree);
		});

		it('falls back to lastUsed when previous selection is not a valid isolation mode', () => {
			expect(resolveIsolationSelection(IsolationMode.Workspace, 'invalid-value')).toBe(IsolationMode.Workspace);
		});
	});

	// ─── SessionOptionGroupBuilder class tests ───────────────────────

	describe('SessionOptionGroupBuilder Class', () => {
		let gitService: TestGitService;
		let configurationService: InMemoryConfigurationService;
		let context: IVSCodeExtensionContext;
		let workspaceService: NullWorkspaceService;
		let folderMruService: TestFolderMruService;
		let agentSessionsWorkspace: IAgentSessionsWorkspace;
		let worktreeService: TestWorktreeService;
		let folderRepositoryManager: TestFolderRepositoryManager;
		let builder: SessionOptionGroupBuilder;

		beforeEach(async () => {
			vi.restoreAllMocks();
			gitService = new TestGitService();
			configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
			context = createInMemoryContext();
			workspaceService = new NullWorkspaceService([URI.file('/workspace')]);
			folderMruService = new TestFolderMruService();
			agentSessionsWorkspace = { _serviceBrand: undefined, isAgentSessionsWorkspace: false };
			worktreeService = new TestWorktreeService();
			folderRepositoryManager = new TestFolderRepositoryManager();

			builder = new SessionOptionGroupBuilder(
				gitService,
				configurationService,
				context,
				workspaceService,
				folderMruService,
				agentSessionsWorkspace,
				worktreeService,
				folderRepositoryManager,
			);
		});

		describe('getRepositoryOptionItems', () => {
			it('returns empty array when no repositories', () => {
				gitService.repositories = [];
				const items = builder.getRepositoryOptionItems();
				// Should still return workspace folder as non-git folder
				expect(items.length).toBeGreaterThanOrEqual(0);
			});

			it('excludes worktree repositories', () => {
				gitService.repositories = [
					makeRepo('/repo', 'repository'),
					makeRepo('/worktree', 'worktree'),
				];
				const items = builder.getRepositoryOptionItems();
				expect(items.find(i => i.id === URI.file('/worktree').fsPath)).toBeUndefined();
			});

			it('includes repositories that belong to workspace folders', () => {
				const repoUri = URI.file('/workspace');
				gitService.repositories = [makeRepo('/workspace')];
				const items = builder.getRepositoryOptionItems();
				expect(items.find(i => i.id === repoUri.fsPath)).toBeDefined();
			});

			it('includes workspace folders without git repos in multi-root', () => {
				workspaceService = new NullWorkspaceService([URI.file('/workspace'), URI.file('/other-folder')]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				// Only one repo under /workspace
				gitService.repositories = [makeRepo('/workspace')];
				const items = builder.getRepositoryOptionItems();
				// Should include the repo and the non-git folder
				expect(items.length).toBe(2);
				expect(items.find(i => i.id === URI.file('/other-folder').fsPath)).toBeDefined();
			});

			it('sorts items alphabetically by name', () => {
				// NullWorkspaceService.getWorkspaceFolderName returns 'default', so we use git repos
				// which derive their name from the URI path
				workspaceService = new NullWorkspaceService([URI.file('/z-repo'), URI.file('/a-repo')]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				gitService.repositories = [makeRepo('/z-repo'), makeRepo('/a-repo')];
				const items = builder.getRepositoryOptionItems();
				expect(items.length).toBe(2);
				expect(items[0].name).toBe('a-repo');
				expect(items[1].name).toBe('z-repo');
			});
		});

		describe('buildBranchOptionGroup', () => {
			it('returns undefined when no branches', () => {
				const result = builder.buildBranchOptionGroup([], 'main', false, undefined, undefined);
				expect(result).toBeUndefined();
			});

			it('returns branch group with items', () => {
				const branches = [
					{ id: 'main', name: 'main', icon: {} as any },
					{ id: 'dev', name: 'dev', icon: {} as any },
				];
				const result = builder.buildBranchOptionGroup(branches, 'main', false, undefined, undefined);
				expect(result).toBeDefined();
				expect(result!.id).toBe(BRANCH_OPTION_ID);
				expect(result!.items).toHaveLength(1);
			});

			it('selects HEAD branch when no previous selection', () => {
				const branches = [
					{ id: 'main', name: 'main', icon: {} as any },
					{ id: 'dev', name: 'dev', icon: {} as any },
				];
				const result = builder.buildBranchOptionGroup(branches, 'main', false, undefined, undefined);
				expect(result!.selected?.id).toBe('main');
			});

			it('locks items when isolation is disabled', () => {
				const branches = [{ id: 'main', name: 'main', icon: {} as any }];
				const result = builder.buildBranchOptionGroup(branches, 'main', false, undefined, undefined);
				expect(result!.items[0].locked).toBe(true);
			});

			it('locks items when isolation is enabled but Workspace is selected', () => {
				const branches = [{ id: 'main', name: 'main', icon: {} as any }];
				const result = builder.buildBranchOptionGroup(branches, 'main', true, IsolationMode.Workspace, undefined);
				expect(result!.items[0].locked).toBe(true);
			});

			it('does not lock items when isolation is enabled and Worktree is selected', () => {
				const branches = [{ id: 'main', name: 'main', icon: {} as any }];
				const result = builder.buildBranchOptionGroup(branches, 'main', true, IsolationMode.Worktree, undefined);
				expect(result!.items[0].locked).toBeUndefined();
			});

			it('resets to HEAD branch when locked with workspace isolation even if previous selection was different', () => {
				const branches = [
					{ id: 'main', name: 'main', icon: {} as any },
					{ id: 'hello', name: 'hello', icon: {} as any },
				];
				const previousSelection = { id: 'hello', name: 'hello', icon: {} as any };
				const result = builder.buildBranchOptionGroup(branches, 'main', true, IsolationMode.Workspace, previousSelection);
				expect(result!.selected?.id).toBe('main');
				expect(result!.selected?.locked).toBe(true);
			});
		});

		describe('getBranchOptionItemsForRepository', () => {
			it('returns branch items sorted with HEAD first', async () => {
				const repoUri = URI.file('/repo');
				gitService.getRefs.mockResolvedValue([
					makeRef('feature'),
					makeRef('main'),
					makeRef('dev'),
				]);
				const items = await builder.getBranchOptionItemsForRepository(repoUri, 'main');
				expect(items[0].id).toBe('main');
			});

			it('puts main/master branch second after HEAD', async () => {
				const repoUri = URI.file('/repo');
				gitService.getRefs.mockResolvedValue([
					makeRef('feature'),
					makeRef('main'),
					makeRef('dev'),
				]);
				// HEAD is 'dev'
				const items = await builder.getBranchOptionItemsForRepository(repoUri, 'dev');
				expect(items[0].id).toBe('dev'); // HEAD first
				expect(items[1].id).toBe('main'); // main/master second
			});

			it('filters out copilot-worktree branches', async () => {
				const repoUri = URI.file('/repo');
				gitService.getRefs.mockResolvedValue([
					makeRef('main'),
					makeRef('copilot-worktree-abc123'),
				]);
				const items = await builder.getBranchOptionItemsForRepository(repoUri, 'main');
				expect(items).toHaveLength(1);
				expect(items[0].id).toBe('main');
			});

			it('filters out non-local branches (remote refs)', async () => {
				const repoUri = URI.file('/repo');
				gitService.getRefs.mockResolvedValue([
					makeRef('main'),
					{ name: 'origin/main', type: 1 }, // RefType.Remote
				]);
				const items = await builder.getBranchOptionItemsForRepository(repoUri, 'main');
				expect(items).toHaveLength(1);
			});

			it('returns empty array when no refs', async () => {
				const repoUri = URI.file('/repo');
				gitService.getRefs.mockResolvedValue([]);
				const items = await builder.getBranchOptionItemsForRepository(repoUri, 'main');
				expect(items).toHaveLength(0);
			});

			it('skips refs with no name', async () => {
				const repoUri = URI.file('/repo');
				gitService.getRefs.mockResolvedValue([
					{ name: undefined, type: 0 },
					makeRef('main'),
				]);
				const items = await builder.getBranchOptionItemsForRepository(repoUri, 'main');
				expect(items).toHaveLength(1);
			});
		});

		describe('provideChatSessionProviderOptionGroups', () => {
			it('returns repository group for multi-repo workspaces', async () => {
				workspaceService = new NullWorkspaceService([URI.file('/repo1'), URI.file('/repo2')]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				gitService.repositories = [makeRepo('/repo1'), makeRepo('/repo2')];

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup).toBeDefined();
				expect(repoGroup!.items.length).toBe(2);
			});

			it('pre-selects selectedFolderUri in multi-repo workspace', async () => {
				workspaceService = new NullWorkspaceService([URI.file('/repo1'), URI.file('/repo2')]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				gitService.repositories = [makeRepo('/repo1'), makeRepo('/repo2')];
				gitService.getRepository.mockResolvedValue(makeRepo('/repo2'));
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined, URI.file('/repo2') as any);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup).toBeDefined();
				expect(repoGroup!.selected?.id).toBe(URI.file('/repo2').fsPath);
			});

			it('pre-selects selectedFolderUri over previous selection in multi-repo workspace', async () => {
				workspaceService = new NullWorkspaceService([URI.file('/repo1'), URI.file('/repo2')]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				gitService.repositories = [makeRepo('/repo1'), makeRepo('/repo2')];
				gitService.getRepository.mockResolvedValue(makeRepo('/repo2'));
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);

				const previousState = createMockChatSessionInputState([{
					id: REPOSITORY_OPTION_ID,
					name: 'Folder',
					description: '',
					items: [],
					selected: { id: URI.file('/repo1').fsPath, name: 'repo1' },
				}]);

				const groups = await builder.provideChatSessionProviderOptionGroups(previousState, URI.file('/repo2') as any);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup!.selected?.id).toBe(URI.file('/repo2').fsPath);
			});

			it('does not include repository group for single-repo workspace', async () => {
				gitService.repositories = [makeRepo('/workspace')];
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, false);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup).toBeUndefined();
			});

			it('does not include repository group for single folder with no git repos', async () => {
				gitService.repositories = [];
				gitService.getRepository.mockResolvedValue(undefined);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, false);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				expect(groups.find(g => g.id === REPOSITORY_OPTION_ID)).toBeUndefined();
			});

			it('includes isolation group when feature is enabled', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);
				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const isolationGroup = groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationGroup).toBeDefined();
				expect(isolationGroup!.items).toHaveLength(2);
			});

			it('does not include isolation group when feature is disabled', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, false);
				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const isolationGroup = groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationGroup).toBeUndefined();
			});

			it('includes branch group when feature is enabled and repo exists', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				const repo = makeRepo('/workspace');
				gitService.repositories = [repo];
				gitService.getRepository.mockResolvedValue(repo);
				gitService.getRefs.mockResolvedValue([makeRef('main')]);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const branchGroup = groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchGroup).toBeDefined();
			});

			it('does not include branch group when feature is disabled', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const branchGroup = groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchGroup).toBeUndefined();
			});

			it('preserves previous isolation selection', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);
				const repo = makeRepo('/workspace');
				gitService.repositories = [repo];
				gitService.getRepository.mockResolvedValue(repo);

				const previousState = createMockChatSessionInputState([{
					id: ISOLATION_OPTION_ID,
					name: 'Isolation',
					description: '',
					items: [],
					selected: { id: IsolationMode.Worktree, name: 'Worktree' },
				}]);

				const groups = await builder.provideChatSessionProviderOptionGroups(previousState);
				const isolationGroup = groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationGroup!.selected?.id).toBe(IsolationMode.Worktree);
			});

			it('shows MRU items for welcome view (empty workspace)', async () => {
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const mruUri = URI.file('/recent-repo');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([
					{ folder: mruUri, repository: mruUri, lastAccessed: Date.now() },
				]);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup).toBeDefined();
				expect(repoGroup!.items).toHaveLength(1);
				expect(repoGroup!.items[0].id).toBe(mruUri.fsPath);
				// First item should be auto-selected when no previous selection
				expect(repoGroup!.selected?.id).toBe(mruUri.fsPath);
				// Should have a command for browsing folders
				expect(repoGroup!.commands).toBeDefined();
				expect(repoGroup!.commands!.length).toBeGreaterThan(0);
			});

			it('caps MRU items at 10 entries in welcome view', async () => {
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const entries = Array.from({ length: 15 }, (_, i) => {
					const uri = URI.file(`/repo-${i}`);
					return { folder: uri, repository: uri, lastAccessed: i } as FolderRepositoryMRUEntry;
				});
				folderMruService.getRecentlyUsedFolders.mockResolvedValue(entries);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup!.items).toHaveLength(10);
			});

			it('pre-selects selectedFolderUri in welcome view', async () => {
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const mruUri1 = URI.file('/repo-a');
				const mruUri2 = URI.file('/repo-b');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([
					{ folder: mruUri1, repository: mruUri1, lastAccessed: Date.now() },
					{ folder: mruUri2, repository: mruUri2, lastAccessed: Date.now() - 1000 },
				]);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined, mruUri2 as any);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup!.selected?.id).toBe(mruUri2.fsPath);
			});

			it('pre-selects selectedFolderUri over previous selection in welcome view', async () => {
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const mruUri1 = URI.file('/repo-a');
				const mruUri2 = URI.file('/repo-b');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([
					{ folder: mruUri1, repository: mruUri1, lastAccessed: Date.now() },
					{ folder: mruUri2, repository: mruUri2, lastAccessed: Date.now() - 1000 },
				]);

				const previousState = createMockChatSessionInputState([{
					id: REPOSITORY_OPTION_ID,
					name: 'Folder',
					description: '',
					items: [],
					selected: { id: mruUri1.fsPath, name: 'repo-a' },
				}]);

				const groups = await builder.provideChatSessionProviderOptionGroups(previousState, mruUri2 as any);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup!.selected?.id).toBe(mruUri2.fsPath);
			});

			it('shows branch dropdown in welcome view when first MRU item is a git repo', async () => {
				workspaceService = new NullWorkspaceService([]);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);
				await context.globalState.update('github.copilot.cli.lastUsedIsolationOption', IsolationMode.Worktree);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const mruUri = URI.file('/recent-repo');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([
					{ folder: mruUri, repository: mruUri, lastAccessed: Date.now() },
				]);
				const repo = makeRepo(mruUri.fsPath);
				gitService.getRepository.mockResolvedValue(repo);
				gitService.getRefs.mockResolvedValue([makeRef('main'), makeRef('develop')]);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const branchGroup = groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchGroup).toBeDefined();
				expect(branchGroup!.items.length).toBe(2);
			});

			it('selects no repo in welcome view when MRU is empty', async () => {
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([]);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup).toBeDefined();
				expect(repoGroup!.items).toHaveLength(0);
				expect(repoGroup!.selected).toBeUndefined();
			});

			it('preserves previous selection even when no longer in welcome view MRU', async () => {
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const currentUri = URI.file('/current-repo');
				const removedUri = URI.file('/removed-repo');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([
					{ folder: currentUri, repository: currentUri, lastAccessed: Date.now() },
				]);
				gitService.getRepository.mockResolvedValue(undefined);

				const previousState = createMockChatSessionInputState([{
					id: REPOSITORY_OPTION_ID,
					name: 'Folder',
					description: '',
					items: [],
					selected: { id: removedUri.fsPath, name: 'removed-repo' },
				}]);

				const groups = await builder.provideChatSessionProviderOptionGroups(previousState);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				// Previous selection is re-resolved and added to the top
				expect(repoGroup!.selected?.id).toBe(removedUri.fsPath);
				expect(repoGroup!.items[0].id).toBe(removedUri.fsPath);
			});

			it('adds new folder (git repo) to top of items in welcome view', async () => {
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const mruUri = URI.file('/existing-repo');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([
					{ folder: mruUri, repository: mruUri, lastAccessed: Date.now() },
				]);
				const newFolderUri = URI.file('/new-git-folder');
				const newRepo = makeRepo(newFolderUri.fsPath);
				gitService.getRepository.mockResolvedValue(newRepo);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined, newFolderUri as any);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup).toBeDefined();
				expect(repoGroup!.items[0].id).toBe(newFolderUri.fsPath);
			});

			it('adds new folder (non-git) to top of items in welcome view', async () => {
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const mruUri = URI.file('/existing-repo');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([
					{ folder: mruUri, repository: mruUri, lastAccessed: Date.now() },
				]);
				const newFolderUri = URI.file('/new-plain-folder');
				gitService.getRepository.mockResolvedValue(undefined);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined, newFolderUri as any);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup).toBeDefined();
				expect(repoGroup!.items[0].id).toBe(newFolderUri.fsPath);
			});

			it('deduplicates new folder if already in MRU list', async () => {
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const sharedUri = URI.file('/shared-repo');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([
					{ folder: sharedUri, repository: sharedUri, lastAccessed: Date.now() },
				]);
				const newRepo = makeRepo(sharedUri.fsPath);
				gitService.getRepository.mockResolvedValue(newRepo);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined, sharedUri as any);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup).toBeDefined();
				// Should not have duplicates
				const matchingItems = repoGroup!.items.filter(i => i.id === sharedUri.fsPath);
				expect(matchingItems).toHaveLength(1);
				// And it should be at the top
				expect(repoGroup!.items[0].id).toBe(sharedUri.fsPath);
			});

			it('does not duplicate selected item when new folder replaces its MRU entry', async () => {
				// Regression: the selected item was resolved from MRU before
				// deduplication replaced it with a fresh object. Using reference
				// equality (Array.includes) caused the stale reference to be
				// re-appended, creating a duplicate.
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const repoUri = URI.file('/my-repo');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([
					{ folder: repoUri, repository: repoUri, lastAccessed: Date.now() },
				]);
				gitService.getRepository.mockResolvedValue(makeRepo(repoUri.fsPath));

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined, repoUri as any);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID)!;
				// Selected item must reference an object that is in the items list
				expect(repoGroup.items.some(i => i.id === repoGroup.selected?.id)).toBe(true);
				// And there must be exactly one item with that id
				expect(repoGroup.items.filter(i => i.id === repoUri.fsPath)).toHaveLength(1);
			});

			it('does not add new folder when no previousInputState', async () => {
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([]);

				const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup!.items).toHaveLength(0);
			});

			it('re-resolves previously selected folder as git repo when not in MRU', async () => {
				// When the previous selection is not in the MRU list, the builder should
				// look it up via getTrustedRepository and add it with the correct icon.
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				const mruUri = URI.file('/current-repo');
				const prevUri = URI.file('/prev-repo');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([
					{ folder: mruUri, repository: mruUri, lastAccessed: Date.now() },
				]);
				const prevRepo = makeRepo(prevUri.fsPath);
				gitService.getRepository.mockResolvedValue(prevRepo);

				const previousState = createMockChatSessionInputState([{
					id: REPOSITORY_OPTION_ID,
					name: 'Folder',
					description: '',
					items: [],
					selected: { id: prevUri.fsPath, name: 'prev-repo' },
				}]);

				const groups = await builder.provideChatSessionProviderOptionGroups(previousState);
				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup!.selected?.id).toBe(prevUri.fsPath);
				// The previously selected item should be at the top
				expect(repoGroup!.items[0].id).toBe(prevUri.fsPath);
			});
		});

		describe('handleInputStateChange', () => {
			it('rebuilds branch group when repo changes', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);
				const repo = makeRepo('/new-repo');
				gitService.getRepository.mockResolvedValue(repo);
				gitService.getRefs.mockResolvedValue([makeRef('main'), makeRef('develop')]);

				const state = createMockChatSessionInputState([
					{
						id: ISOLATION_OPTION_ID,
						name: 'Isolation',
						description: '',
						items: [],
						selected: { id: IsolationMode.Worktree, name: 'Worktree' },
					},
					{
						id: REPOSITORY_OPTION_ID,
						name: 'Folder',
						description: '',
						items: [],
						selected: { id: URI.file('/new-repo').fsPath, name: 'new-repo' },
					},
					{
						id: BRANCH_OPTION_ID,
						name: 'Branch',
						description: '',
						items: [{ id: 'old-branch', name: 'old-branch' }],
						selected: { id: 'old-branch', name: 'old-branch' },
					},
				]);

				await builder.handleInputStateChange(state);
				const branchGroup = state.groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchGroup).toBeDefined();
				expect(branchGroup!.items.length).toBe(2);
			});

			it('removes branch group when repo has no branches', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				gitService.getRepository.mockResolvedValue(makeRepo('/repo'));
				gitService.getRefs.mockResolvedValue([]);

				const state = createMockChatSessionInputState([
					{
						id: REPOSITORY_OPTION_ID,
						name: 'Folder',
						description: '',
						items: [],
						selected: { id: URI.file('/repo').fsPath, name: 'repo' },
					},
					{
						id: BRANCH_OPTION_ID,
						name: 'Branch',
						description: '',
						items: [{ id: 'old', name: 'old' }],
					},
				]);

				await builder.handleInputStateChange(state);
				const branchGroup = state.groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchGroup).toBeUndefined();
			});

			it('does not add branch group when branch feature is disabled', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);

				const state = createMockChatSessionInputState([{
					id: REPOSITORY_OPTION_ID,
					name: 'Folder',
					description: '',
					items: [],
					selected: { id: URI.file('/repo').fsPath, name: 'repo' },
				}]);

				await builder.handleInputStateChange(state);
				expect(state.groups.find(g => g.id === BRANCH_OPTION_ID)).toBeUndefined();
			});

			it('persists isolation selection to global state', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);
				gitService.getRepository.mockResolvedValue(makeRepo('/workspace'));

				const state = createMockChatSessionInputState([{
					id: ISOLATION_OPTION_ID,
					name: 'Isolation',
					description: '',
					items: [],
					selected: { id: IsolationMode.Worktree, name: 'Worktree' },
				}]);

				await builder.handleInputStateChange(state);
				expect(context.globalState.get('github.copilot.cli.lastUsedIsolationOption')).toBe(IsolationMode.Worktree);
			});

			it('forces workspace isolation when selected folder is not a git repo', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);
				gitService.getRepository.mockResolvedValue(undefined);

				const state = createMockChatSessionInputState([
					{
						id: ISOLATION_OPTION_ID,
						name: 'Isolation',
						description: '',
						items: [
							{ id: IsolationMode.Workspace, name: 'Workspace' },
							{ id: IsolationMode.Worktree, name: 'Worktree' },
						],
						selected: { id: IsolationMode.Worktree, name: 'Worktree' },
					},
					{
						id: REPOSITORY_OPTION_ID,
						name: 'Folder',
						description: '',
						items: [],
						selected: { id: URI.file('/non-git').fsPath, name: 'non-git' },
					},
				]);

				await builder.handleInputStateChange(state);

				const isolationGroup = state.groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationGroup!.selected?.id).toBe(IsolationMode.Workspace);
				expect(isolationGroup!.selected?.locked).toBe(true);
			});

			it('unlocks isolation when selected folder is a git repo', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);
				gitService.getRepository.mockResolvedValue(makeRepo('/workspace'));

				const state = createMockChatSessionInputState([
					{
						id: ISOLATION_OPTION_ID,
						name: 'Isolation',
						description: '',
						items: [
							{ id: IsolationMode.Workspace, name: 'Workspace', locked: true },
							{ id: IsolationMode.Worktree, name: 'Worktree', locked: true },
						],
						selected: { id: IsolationMode.Workspace, name: 'Workspace', locked: true },
					},
					{
						id: REPOSITORY_OPTION_ID,
						name: 'Folder',
						description: '',
						items: [],
						selected: { id: URI.file('/workspace').fsPath, name: 'workspace' },
					},
				]);

				await builder.handleInputStateChange(state);

				const isolationGroup = state.groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationGroup!.selected?.locked).toBeUndefined();
				expect(isolationGroup!.items.every(i => !('locked' in i))).toBe(true);
			});
		});

		describe('buildExistingSessionInputStateGroups', () => {
			it('returns locked groups for existing session', async () => {
				folderRepositoryManager.getFolderRepository.mockResolvedValue({
					folder: URI.file('/workspace'),
					repository: URI.file('/workspace'),
					worktree: undefined,
					worktreeProperties: undefined,
					trusted: true,
				} as any);
				worktreeService.getWorktreeProperties.mockResolvedValue(undefined);

				const resource = URI.from({ scheme: 'copilotcli', path: '/session-1' });
				const groups = await builder.buildExistingSessionInputStateGroups(resource, CancellationToken.None);

				const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup).toBeDefined();
				expect(repoGroup!.selected?.locked).toBe(true);
			});

			it('includes worktree branch for worktree sessions', async () => {
				const worktreeProps: ChatSessionWorktreeProperties = {
					version: 2,
					baseCommit: 'abc',
					baseBranchName: 'main',
					branchName: 'copilot/feature',
					repositoryPath: '/repo',
					worktreePath: '/wt',
				};
				folderRepositoryManager.getFolderRepository.mockResolvedValue({
					folder: URI.file('/repo'),
					repository: URI.file('/repo'),
					worktree: undefined,
					worktreeProperties: worktreeProps,
					trusted: true,
				} as any);
				worktreeService.getWorktreeProperties.mockResolvedValue(worktreeProps);

				const resource = URI.from({ scheme: 'copilotcli', path: '/session-1' });
				const groups = await builder.buildExistingSessionInputStateGroups(resource, CancellationToken.None);

				const branchGroup = groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchGroup).toBeDefined();
				expect(branchGroup!.selected?.id).toBe('copilot/feature');
				expect(branchGroup!.selected?.locked).toBe(true);
			});

			it('includes repository branch for non-worktree sessions', async () => {
				folderRepositoryManager.getFolderRepository.mockResolvedValue({
					folder: URI.file('/workspace'),
					repository: URI.file('/workspace'),
					repositoryProperties: {
						repositoryPath: '/workspace',
						branchName: 'main',
						baseBranchName: 'origin/main',
					},
					trusted: true,
				} as any);
				worktreeService.getWorktreeProperties.mockResolvedValue(undefined);

				const resource = URI.from({ scheme: 'copilotcli', path: '/session-1' });
				const groups = await builder.buildExistingSessionInputStateGroups(resource, CancellationToken.None);

				const branchGroup = groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchGroup).toBeDefined();
				expect(branchGroup!.selected?.id).toBe('main');
				expect(branchGroup!.selected?.locked).toBe(true);
				expect(branchGroup!.when).toBeUndefined();
			});

			it('includes isolation group when feature is enabled and session is worktree', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);
				const worktreeProps: ChatSessionWorktreeProperties = {
					version: 2,
					baseCommit: 'abc',
					baseBranchName: 'main',
					branchName: 'copilot/feature',
					repositoryPath: '/repo',
					worktreePath: '/wt',
				};
				folderRepositoryManager.getFolderRepository.mockResolvedValue({
					folder: URI.file('/repo'),
					repository: URI.file('/repo'),
					trusted: true,
				} as any);
				worktreeService.getWorktreeProperties.mockResolvedValue(worktreeProps);

				const resource = URI.from({ scheme: 'copilotcli', path: '/session-1' });
				const groups = await builder.buildExistingSessionInputStateGroups(resource, CancellationToken.None);

				const isolationGroup = groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationGroup).toBeDefined();
				expect(isolationGroup!.selected?.id).toBe(IsolationMode.Worktree);
				expect(isolationGroup!.selected?.locked).toBe(true);
			});

			it('shows Workspace isolation for non-worktree sessions', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);
				folderRepositoryManager.getFolderRepository.mockResolvedValue({
					folder: URI.file('/workspace'),
					repository: URI.file('/workspace'),
					trusted: true,
				} as any);
				worktreeService.getWorktreeProperties.mockResolvedValue(undefined);

				const resource = URI.from({ scheme: 'copilotcli', path: '/session-1' });
				const groups = await builder.buildExistingSessionInputStateGroups(resource, CancellationToken.None);

				const isolationGroup = groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationGroup!.selected?.id).toBe(IsolationMode.Workspace);
			});

			it('omits isolation group when feature is disabled for existing session', async () => {
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, false);
				folderRepositoryManager.getFolderRepository.mockResolvedValue({
					folder: URI.file('/workspace'),
					repository: URI.file('/workspace'),
					trusted: true,
				} as any);
				worktreeService.getWorktreeProperties.mockResolvedValue(undefined);

				const resource = URI.from({ scheme: 'copilotcli', path: '/session-1' });
				const groups = await builder.buildExistingSessionInputStateGroups(resource, CancellationToken.None);

				expect(groups.find(g => g.id === ISOLATION_OPTION_ID)).toBeUndefined();
			});

			it('omits branch group when session has no branch name', async () => {
				folderRepositoryManager.getFolderRepository.mockResolvedValue({
					folder: URI.file('/workspace'),
					repository: undefined,
					repositoryProperties: undefined,
					trusted: true,
				} as any);
				worktreeService.getWorktreeProperties.mockResolvedValue(undefined);

				const resource = URI.from({ scheme: 'copilotcli', path: '/session-1' });
				const groups = await builder.buildExistingSessionInputStateGroups(resource, CancellationToken.None);

				expect(groups.find(g => g.id === BRANCH_OPTION_ID)).toBeUndefined();
			});
		});

		describe('rebuildInputState', () => {
			it('adds folder dropdown when a second workspace folder appears', async () => {
				// Start with single workspace folder — no folder dropdown
				gitService.repositories = [makeRepo('/workspace')];
				gitService.getRepository.mockResolvedValue(makeRepo('/workspace'));
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, false);

				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				expect(initialGroups.find(g => g.id === REPOSITORY_OPTION_ID)).toBeUndefined();

				const state = createMockChatSessionInputState(initialGroups);

				// Simulate adding a second workspace folder
				workspaceService = new NullWorkspaceService([URI.file('/workspace'), URI.file('/workspace2')]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				gitService.repositories = [makeRepo('/workspace'), makeRepo('/workspace2')];

				await builder.rebuildInputState(state);

				const repoGroup = state.groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup).toBeDefined();
				expect(repoGroup!.items.length).toBe(2);
			});

			it('removes folder dropdown when going from two workspace folders to one', async () => {
				// Start with two workspace folders — folder dropdown shown
				workspaceService = new NullWorkspaceService([URI.file('/repo1'), URI.file('/repo2')]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				gitService.repositories = [makeRepo('/repo1'), makeRepo('/repo2')];
				gitService.getRepository.mockResolvedValue(makeRepo('/repo1'));
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, false);

				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				expect(initialGroups.find(g => g.id === REPOSITORY_OPTION_ID)).toBeDefined();

				const state = createMockChatSessionInputState(initialGroups);

				// Simulate removing a workspace folder
				workspaceService = new NullWorkspaceService([URI.file('/repo1')]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				gitService.repositories = [makeRepo('/repo1')];

				await builder.rebuildInputState(state);

				expect(state.groups.find(g => g.id === REPOSITORY_OPTION_ID)).toBeUndefined();
			});

			it('adds branch dropdown after git init in single folder workspace', async () => {
				// Start with non-git folder — no branch dropdown
				gitService.repositories = [];
				gitService.getRepository.mockResolvedValue(undefined);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, false);

				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				expect(initialGroups.find(g => g.id === BRANCH_OPTION_ID)).toBeUndefined();

				const state = createMockChatSessionInputState(initialGroups);

				// Simulate git init — repo now discovered
				const repo = makeRepo('/workspace');
				gitService.repositories = [repo];
				gitService.getRepository.mockResolvedValue(repo);
				gitService.getRefs.mockResolvedValue([makeRef('main')]);

				await builder.rebuildInputState(state);

				const branchGroup = state.groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchGroup).toBeDefined();
				expect(branchGroup!.items.length).toBe(1);
				expect(branchGroup!.items[0].id).toBe('main');
			});

			it('preserves selected folder across rebuild', async () => {
				workspaceService = new NullWorkspaceService([URI.file('/repo1'), URI.file('/repo2')]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				gitService.repositories = [makeRepo('/repo1'), makeRepo('/repo2')];
				gitService.getRepository.mockResolvedValue(makeRepo('/repo2'));
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, false);

				// User selects /repo2
				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const repoGroupIndex = initialGroups.findIndex(g => g.id === REPOSITORY_OPTION_ID);
				const repoGroup = initialGroups[repoGroupIndex];
				initialGroups[repoGroupIndex] = { ...repoGroup, selected: repoGroup.items.find(i => i.id === URI.file('/repo2').fsPath) };

				const state = createMockChatSessionInputState(initialGroups);

				// Add a third folder
				workspaceService = new NullWorkspaceService([URI.file('/repo1'), URI.file('/repo2'), URI.file('/repo3')]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				gitService.repositories = [makeRepo('/repo1'), makeRepo('/repo2'), makeRepo('/repo3')];

				await builder.rebuildInputState(state);

				const newRepoGroup = state.groups.find(g => g.id === REPOSITORY_OPTION_ID)!;
				expect(newRepoGroup.items.length).toBe(3);
				// Previous selection preserved
				expect(newRepoGroup.selected?.id).toBe(URI.file('/repo2').fsPath);
			});

			it('unlocks isolation after git init for non-git folder', async () => {
				// Start with non-git folder — isolation locked
				gitService.repositories = [];
				gitService.getRepository.mockResolvedValue(undefined);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);

				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const isolationGroup = initialGroups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationGroup).toBeDefined();
				// Should be locked to workspace for non-git
				expect(isolationGroup!.selected?.locked).toBe(true);

				const state = createMockChatSessionInputState(initialGroups);

				// Simulate git init
				const repo = makeRepo('/workspace');
				gitService.repositories = [repo];
				gitService.getRepository.mockResolvedValue(repo);

				await builder.rebuildInputState(state);

				const newIsolationGroup = state.groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(newIsolationGroup).toBeDefined();
				// Should be unlocked after git init
				expect(newIsolationGroup!.selected?.locked).toBeUndefined();
			});

			it('rebuildInputState after lockInputStateGroups restores correct editable state', async () => {
				// Scenario: user starts a session, dropdowns are locked, then trust
				// fails and rebuildInputState is called to unlock them.
				const repo = makeRepo('/workspace');
				gitService.repositories = [repo];
				gitService.getRepository.mockResolvedValue(repo);
				gitService.getRefs.mockResolvedValue([makeRef('main'), makeRef('dev')]);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);

				// Build initial groups (worktree isolation → branch editable)
				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const state = createMockChatSessionInputState(initialGroups);

				// Simulate selecting worktree isolation
				const isolationIdx = state.groups.findIndex(g => g.id === ISOLATION_OPTION_ID);
				const worktreeItem = state.groups[isolationIdx].items.find(i => i.id === IsolationMode.Worktree)!;
				const mutableGroups = [...state.groups];
				mutableGroups[isolationIdx] = { ...state.groups[isolationIdx], selected: worktreeItem };
				state.groups = mutableGroups;

				// Lock all groups (simulating session start)
				builder.lockInputStateGroups(state);

				// Verify everything is locked
				for (const group of state.groups) {
					expect(group.selected?.locked).toBe(true);
					for (const item of group.items) {
						expect(item.locked).toBe(true);
					}
				}

				// Rebuild (simulating trust failure unlock)
				await builder.rebuildInputState(state);

				// Branch should be editable (worktree isolation selected)
				const branchGroup = state.groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchGroup).toBeDefined();
				expect(branchGroup!.selected?.locked).toBeUndefined();

				// Isolation items should be editable
				const isolationGroup = state.groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationGroup).toBeDefined();
				expect(isolationGroup!.selected?.locked).toBeUndefined();
				for (const item of isolationGroup!.items) {
					expect(item.locked).toBeUndefined();
				}
			});

			it('rebuildInputState after lock re-applies branch lock when workspace isolation is selected', async () => {
				const repo = makeRepo('/workspace');
				gitService.repositories = [repo];
				gitService.getRepository.mockResolvedValue(repo);
				gitService.getRefs.mockResolvedValue([makeRef('main')]);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);

				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const state = createMockChatSessionInputState(initialGroups);

				// Default isolation is workspace → branch should be locked
				builder.lockInputStateGroups(state);
				await builder.rebuildInputState(state);

				const branchGroup = state.groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchGroup).toBeDefined();
				// Branch must remain locked because workspace isolation is selected
				expect(branchGroup!.selected?.locked).toBe(true);
			});

			it('rebuildInputState after lock re-applies isolation lock for non-git folder', async () => {
				gitService.repositories = [];
				gitService.getRepository.mockResolvedValue(undefined);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);

				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const state = createMockChatSessionInputState(initialGroups);

				builder.lockInputStateGroups(state);
				await builder.rebuildInputState(state);

				// Isolation should be forced to workspace and locked for non-git folder
				const isolationGroup = state.groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationGroup).toBeDefined();
				expect(isolationGroup!.selected?.id).toBe(IsolationMode.Workspace);
				expect(isolationGroup!.selected?.locked).toBe(true);

				// Branch should not be shown for non-git folder
				expect(state.groups.find(g => g.id === BRANCH_OPTION_ID)).toBeUndefined();
			});

			it('stores selectedFolderUri so it persists in subsequent rebuilds (welcome view)', async () => {
				// In the welcome view, rebuildInputState with a selectedFolderUri should
				// remember it so the next rebuild keeps the folder in the list.
				workspaceService = new NullWorkspaceService([]);
				builder = new SessionOptionGroupBuilder(
					gitService, configurationService, context, workspaceService,
					folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
				);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, false);

				const browsedUri = URI.file('/browsed-folder');
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([]);
				gitService.getRepository.mockResolvedValue(undefined);

				// Initial build — empty
				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const state = createMockChatSessionInputState(initialGroups);

				// Simulate "Browse folders…" — rebuild with the browsed folder
				await builder.rebuildInputState(state, browsedUri as any);
				const repoGroup1 = state.groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup1!.items.some(i => i.id === browsedUri.fsPath)).toBe(true);

				// Second rebuild without selectedFolderUri — the browsed folder should persist
				folderMruService.getRecentlyUsedFolders.mockResolvedValue([]);
				await builder.rebuildInputState(state);
				const repoGroup2 = state.groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup2!.items.some(i => i.id === browsedUri.fsPath)).toBe(true);
			});
		});

		describe('lockInputStateGroups', () => {
			it('locks all items and selections in every group', async () => {
				const repo = makeRepo('/workspace');
				gitService.repositories = [repo];
				gitService.getRepository.mockResolvedValue(repo);
				gitService.getRefs.mockResolvedValue([makeRef('main'), makeRef('dev')]);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);

				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const state = createMockChatSessionInputState(initialGroups);

				// Verify some items are unlocked before locking
				const isolationBefore = state.groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationBefore!.items.some(i => !i.locked)).toBe(true);

				builder.lockInputStateGroups(state);

				for (const group of state.groups) {
					if (group.selected) {
						expect(group.selected.locked).toBe(true);
					}
					for (const item of group.items) {
						expect(item.locked).toBe(true);
					}
				}
			});

			it('preserves group ids and selected ids after locking', async () => {
				const repo = makeRepo('/workspace');
				gitService.repositories = [repo];
				gitService.getRepository.mockResolvedValue(repo);
				gitService.getRefs.mockResolvedValue([makeRef('main')]);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);

				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const groupIds = initialGroups.map(g => g.id);
				const selectedIds = initialGroups.map(g => g.selected?.id);
				const state = createMockChatSessionInputState(initialGroups);

				builder.lockInputStateGroups(state);

				expect(state.groups.map(g => g.id)).toEqual(groupIds);
				expect(state.groups.map(g => g.selected?.id)).toEqual(selectedIds);
			});

			it('handles groups with no selected item', () => {
				const state = createMockChatSessionInputState([
					{ id: 'test', name: 'Test', items: [{ id: 'a', name: 'A' }] },
				]);

				builder.lockInputStateGroups(state);

				expect(state.groups[0].selected).toBeUndefined();
				expect(state.groups[0].items[0].locked).toBe(true);
			});

			it('handles empty groups array', () => {
				const state = createMockChatSessionInputState([]);

				builder.lockInputStateGroups(state);

				expect(state.groups).toEqual([]);
			});
		});

		describe('updateBranchInInputState', () => {
			it('replaces existing branch group with new locked branch', async () => {
				const repo = makeRepo('/workspace');
				gitService.repositories = [repo];
				gitService.getRepository.mockResolvedValue(repo);
				gitService.getRefs.mockResolvedValue([makeRef('main'), makeRef('dev')]);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);

				// Select worktree isolation so branch dropdown has multiple editable items
				await context.globalState.update('github.copilot.cli.lastUsedIsolationOption', IsolationMode.Worktree);

				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const state = createMockChatSessionInputState(initialGroups);

				// Verify branch group exists with multiple items (worktree → editable)
				const branchBefore = state.groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchBefore).toBeDefined();
				expect(branchBefore!.items.length).toBeGreaterThan(1);

				builder.updateBranchInInputState(state, 'copilot/my-feature');

				const branchAfter = state.groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchAfter).toBeDefined();
				expect(branchAfter!.items).toHaveLength(1);
				expect(branchAfter!.items[0].id).toBe('copilot/my-feature');
				expect(branchAfter!.items[0].locked).toBe(true);
				expect(branchAfter!.selected?.id).toBe('copilot/my-feature');
				expect(branchAfter!.selected?.locked).toBe(true);
			});

			it('does not add branch group when none exists', () => {
				const state = createMockChatSessionInputState([
					{
						id: ISOLATION_OPTION_ID,
						name: 'Isolation',
						items: [{ id: IsolationMode.Workspace, name: 'Workspace' }],
						selected: { id: IsolationMode.Workspace, name: 'Workspace' },
					},
				]);

				builder.updateBranchInInputState(state, 'copilot/my-feature');

				// Should not add a branch group
				expect(state.groups.find(g => g.id === BRANCH_OPTION_ID)).toBeUndefined();
				expect(state.groups).toHaveLength(1);
			});

			it('preserves other groups when updating branch', async () => {
				const repo = makeRepo('/workspace');
				gitService.repositories = [repo];
				gitService.getRepository.mockResolvedValue(repo);
				gitService.getRefs.mockResolvedValue([makeRef('main')]);
				await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
				await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, true);

				const initialGroups = await builder.provideChatSessionProviderOptionGroups(undefined);
				const state = createMockChatSessionInputState(initialGroups);

				const isolationBefore = state.groups.find(g => g.id === ISOLATION_OPTION_ID);

				builder.updateBranchInInputState(state, 'copilot/new-branch');

				// Isolation group should be unchanged
				const isolationAfter = state.groups.find(g => g.id === ISOLATION_OPTION_ID);
				expect(isolationAfter).toEqual(isolationBefore);

				// Branch group should be updated
				const branchAfter = state.groups.find(g => g.id === BRANCH_OPTION_ID);
				expect(branchAfter!.selected?.id).toBe('copilot/new-branch');
			});
		});
	});
});
