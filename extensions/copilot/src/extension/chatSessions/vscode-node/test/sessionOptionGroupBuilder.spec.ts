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

// ─── Pure function tests ─────────────────────────────────────────

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
	it('locked with when clause when isolation is enabled and Workspace is selected', () => {
		const result = resolveBranchLockState(true, IsolationMode.Workspace);
		expect(result.locked).toBe(true);
		expect(result.when).toContain('worktree');
	});

	it('editable with when clause when isolation is enabled and Worktree is selected', () => {
		const result = resolveBranchLockState(true, IsolationMode.Worktree);
		expect(result.locked).toBe(false);
		expect(result.when).toContain('worktree');
	});

	it('locked with no when clause when isolation feature is disabled', () => {
		const result = resolveBranchLockState(false, undefined);
		expect(result.locked).toBe(true);
		expect(result.when).toBeUndefined();
	});

	it('no when clause when isolation is disabled even if isolation value is worktree', () => {
		const result = resolveBranchLockState(false, IsolationMode.Worktree);
		expect(result.locked).toBe(true);
		expect(result.when).toBeUndefined();
	});

	it('when clause references the isolation option ID', () => {
		const result = resolveBranchLockState(true, IsolationMode.Workspace);
		expect(result.when).toBe(`chatSessionOption.${ISOLATION_OPTION_ID} == '${IsolationMode.Worktree}'`);
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

describe('SessionOptionGroupBuilder', () => {
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
			expect(result!.items).toHaveLength(2);
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
			expect(result!.when).toBeDefined();
		});

		it('does not lock items when isolation is enabled and Worktree is selected', () => {
			const branches = [{ id: 'main', name: 'main', icon: {} as any }];
			const result = builder.buildBranchOptionGroup(branches, 'main', true, IsolationMode.Worktree, undefined);
			expect(result!.items[0].locked).toBeUndefined();
			expect(result!.when).toBeDefined();
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

		it('does not include repository group for single-repo workspace', async () => {
			gitService.repositories = [makeRepo('/workspace')];
			await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
			await configurationService.setConfig(ConfigKey.Advanced.CLIIsolationOption, false);

			const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
			const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
			expect(repoGroup).toBeUndefined();
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

			const previousState: vscode.ChatSessionInputState = {
				onDidChange: Event.None,
				groups: [{
					id: ISOLATION_OPTION_ID,
					name: 'Isolation',
					description: '',
					items: [],
					selected: { id: IsolationMode.Worktree, name: 'Worktree' },
				}],
			};

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
			// Should have a command for browsing folders
			expect(repoGroup!.commands).toBeDefined();
			expect(repoGroup!.commands!.length).toBeGreaterThan(0);
		});
	});

	describe('handleInputStateChange', () => {
		it('rebuilds branch group when repo changes', async () => {
			await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
			const repo = makeRepo('/new-repo');
			gitService.getRepository.mockResolvedValue(repo);
			gitService.getRefs.mockResolvedValue([makeRef('main'), makeRef('develop')]);

			const state: vscode.ChatSessionInputState = {
				onDidChange: Event.None,
				groups: [
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
				],
			};

			await builder.handleInputStateChange(state);
			const branchGroup = state.groups.find(g => g.id === BRANCH_OPTION_ID);
			expect(branchGroup).toBeDefined();
			expect(branchGroup!.items.length).toBe(2);
		});

		it('removes branch group when repo has no branches', async () => {
			await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
			gitService.getRepository.mockResolvedValue(makeRepo('/repo'));
			gitService.getRefs.mockResolvedValue([]);

			const state: vscode.ChatSessionInputState = {
				onDidChange: Event.None,
				groups: [
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
				],
			};

			await builder.handleInputStateChange(state);
			const branchGroup = state.groups.find(g => g.id === BRANCH_OPTION_ID);
			expect(branchGroup).toBeUndefined();
		});

		it('does not add branch group when branch feature is disabled', async () => {
			await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);

			const state: vscode.ChatSessionInputState = {
				onDidChange: Event.None,
				groups: [{
					id: REPOSITORY_OPTION_ID,
					name: 'Folder',
					description: '',
					items: [],
					selected: { id: URI.file('/repo').fsPath, name: 'repo' },
				}],
			};

			await builder.handleInputStateChange(state);
			expect(state.groups.find(g => g.id === BRANCH_OPTION_ID)).toBeUndefined();
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
	});

	describe('updateInputStateAfterFolderSelection', () => {
		it('updates repo group selected item', async () => {
			await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
			const repo = makeRepo('/new-folder');
			gitService.getRepository.mockResolvedValue(repo);

			const state: vscode.ChatSessionInputState = {
				onDidChange: Event.None,
				groups: [{
					id: REPOSITORY_OPTION_ID,
					name: 'Folder',
					description: '',
					items: [{ id: URI.file('/old-folder').fsPath, name: 'old-folder' }],
					selected: { id: URI.file('/old-folder').fsPath, name: 'old-folder' },
				}],
			};

			await builder.updateInputStateAfterFolderSelection(state, URI.file('/new-folder') as any);

			const repoGroup = state.groups.find(g => g.id === REPOSITORY_OPTION_ID);
			expect(repoGroup!.selected!.id).toBe(URI.file('/new-folder').fsPath);
		});

		it('rebuilds branch group when new folder is a git repo', async () => {
			await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
			const repo = makeRepo('/new-repo');
			gitService.getRepository.mockResolvedValue(repo);
			gitService.getRefs.mockResolvedValue([makeRef('main'), makeRef('feature')]);

			const state: vscode.ChatSessionInputState = {
				onDidChange: Event.None,
				groups: [{
					id: REPOSITORY_OPTION_ID,
					name: 'Folder',
					description: '',
					items: [],
				}],
			};

			await builder.updateInputStateAfterFolderSelection(state, URI.file('/new-repo') as any);

			const branchGroup = state.groups.find(g => g.id === BRANCH_OPTION_ID);
			expect(branchGroup).toBeDefined();
			expect(branchGroup!.items.length).toBe(2);
		});

		it('removes branch group when new folder is not a git repo', async () => {
			await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);
			gitService.getRepository.mockResolvedValue(undefined);

			const state: vscode.ChatSessionInputState = {
				onDidChange: Event.None,
				groups: [
					{
						id: REPOSITORY_OPTION_ID,
						name: 'Folder',
						description: '',
						items: [],
					},
					{
						id: BRANCH_OPTION_ID,
						name: 'Branch',
						description: '',
						items: [{ id: 'main', name: 'main' }],
					},
				],
			};

			await builder.updateInputStateAfterFolderSelection(state, URI.file('/non-git-folder') as any);

			const branchGroup = state.groups.find(g => g.id === BRANCH_OPTION_ID);
			expect(branchGroup).toBeUndefined();
		});

		it('adds new folder to items if not already present', async () => {
			await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
			gitService.getRepository.mockResolvedValue(undefined);

			const existingItem = { id: URI.file('/old').fsPath, name: 'old' };
			const state: vscode.ChatSessionInputState = {
				onDidChange: Event.None,
				groups: [{
					id: REPOSITORY_OPTION_ID,
					name: 'Folder',
					description: '',
					items: [existingItem],
				}],
			};

			await builder.updateInputStateAfterFolderSelection(state, URI.file('/new-folder') as any);

			const repoGroup = state.groups.find(g => g.id === REPOSITORY_OPTION_ID);
			expect(repoGroup!.items.length).toBe(2);
		});

		it('returns early without updating state when non-git folder is untrusted', async () => {
			await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
			gitService.getRepository.mockResolvedValue(undefined);

			// Override isResourceTrusted to return false for this test
			const origWorkspace = (vscodeShim as Record<string, unknown>).workspace;
			(vscodeShim as Record<string, unknown>).workspace = {
				...(origWorkspace as object),
				isResourceTrusted: async () => false,
			};
			try {
				const state: vscode.ChatSessionInputState = {
					onDidChange: Event.None,
					groups: [{
						id: REPOSITORY_OPTION_ID,
						name: 'Folder',
						description: '',
						items: [{ id: URI.file('/old').fsPath, name: 'old' }],
						selected: { id: URI.file('/old').fsPath, name: 'old' },
					}],
				};

				await builder.updateInputStateAfterFolderSelection(state, URI.file('/untrusted') as any);

				// State should be unchanged
				const repoGroup = state.groups.find(g => g.id === REPOSITORY_OPTION_ID);
				expect(repoGroup!.selected!.id).toBe(URI.file('/old').fsPath);
				expect(repoGroup!.items.length).toBe(1);
			} finally {
				(vscodeShim as Record<string, unknown>).workspace = origWorkspace;
			}
		});

		it('tracks MRU in welcome view when updating folder selection', async () => {
			// Use empty workspace to trigger welcome view
			workspaceService = new NullWorkspaceService([]);
			builder = new SessionOptionGroupBuilder(
				gitService, configurationService, context, workspaceService,
				folderMruService, agentSessionsWorkspace, worktreeService, folderRepositoryManager,
			);
			await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, false);
			const repo = makeRepo('/my-repo');
			gitService.getRepository.mockResolvedValue(repo);

			const state: vscode.ChatSessionInputState = {
				onDidChange: Event.None,
				groups: [{
					id: REPOSITORY_OPTION_ID,
					name: 'Folder',
					description: '',
					items: [],
				}],
			};

			await builder.updateInputStateAfterFolderSelection(state, URI.file('/my-repo') as any);

			// Verify the last used folder appears in subsequent option group builds
			folderMruService.getRecentlyUsedFolders.mockResolvedValue([]);
			const groups = await builder.provideChatSessionProviderOptionGroups(undefined);
			const repoGroup = groups.find(g => g.id === REPOSITORY_OPTION_ID);
			expect(repoGroup!.items.find(i => i.id === URI.file('/my-repo').fsPath)).toBeDefined();
		});
	});
});
