/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ChatSessionProviderOptionItem, Uri } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IGitService, RepoContext } from '../../../platform/git/common/gitService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { isUri } from '../../../util/common/types';
import { SequencerByKey } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { basename } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IAgentSessionsWorkspace } from '../common/agentSessionsWorkspace';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import { FolderRepositoryMRUEntry, IChatFolderMruService, IFolderRepositoryManager, IsolationMode } from '../common/folderRepositoryManager';
import { SessionIdForCLI } from '../copilotcli/common/utils';
import { isWelcomeView } from '../copilotcli/node/copilotCli';
export const REPOSITORY_OPTION_ID = 'repository';
export const BRANCH_OPTION_ID = 'branch';
export const ISOLATION_OPTION_ID = 'isolation';
export const OPEN_REPOSITORY_COMMAND_ID = 'github.copilot.cli.sessions.openRepository';

/**
 * Resolve which branch should be selected.
 *
 * Priority: previous selection (if still in the branch list) → active (HEAD)
 * branch → previous selection as-is (stale but preserved so it's not lost).
 */
export function resolveBranchSelection<T extends { id: string }>(
	branches: readonly T[],
	activeBranchId: string | undefined,
	previousSelection: T | undefined,
): T | undefined {
	if (previousSelection) {
		const inList = branches.find(b => b.id === previousSelection.id);
		if (inList) {
			return inList;
		}
	}
	const activeBranch = activeBranchId
		? branches.find(b => b.id === activeBranchId)
		: undefined;
	return activeBranch ?? previousSelection;
}

/**
 * Determine branch dropdown locked state and `when` clause.
 *
 * - Isolation enabled + Workspace selected → locked, with `when` clause
 * - Isolation enabled + Worktree selected → editable, with `when` clause
 * - Isolation disabled → locked, no `when` clause (nothing to reference)
 */
export function resolveBranchLockState(
	isolationEnabled: boolean,
	currentIsolation: IsolationMode | undefined,
): { locked: boolean; when: string | undefined } {
	if (!isolationEnabled) {
		// No isolation dropdown exists, so no `when` clause to reference
		return { locked: true, when: undefined };
	}

	const isWorktree = currentIsolation === IsolationMode.Worktree;
	return {
		locked: !isWorktree,
		when: `chatSessionOption.${ISOLATION_OPTION_ID} == '${IsolationMode.Worktree}'`,
	};
}

/**
 * Resolve which isolation item should be selected for a new session.
 * Uses the previous selection if valid, otherwise falls back to the last-used value.
 */
export function resolveIsolationSelection(
	lastUsed: IsolationMode,
	previousSelectionId: string | undefined,
): IsolationMode {
	if (previousSelectionId === IsolationMode.Workspace || previousSelectionId === IsolationMode.Worktree) {
		return previousSelectionId;
	}
	return lastUsed;
}

const LAST_USED_ISOLATION_OPTION_KEY = 'github.copilot.cli.lastUsedIsolationOption';
const MAX_MRU_ENTRIES = 10;
const COPILOT_WORKTREE_PATTERN = 'copilot-worktree-';

export function getSelectedOption(groups: readonly vscode.ChatSessionProviderOptionGroup[], groupId: string): vscode.ChatSessionProviderOptionItem | undefined {
	return groups.find(g => g.id === groupId)?.selected;
}

export function isBranchOptionFeatureEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getConfig(ConfigKey.Advanced.CLIBranchSupport);
}

export function isIsolationOptionFeatureEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getConfig(ConfigKey.Advanced.CLIIsolationOption);
}

export function toRepositoryOptionItem(repository: RepoContext | Uri, isDefault: boolean = false): ChatSessionProviderOptionItem {
	const repositoryUri = isUri(repository) ? repository : repository.rootUri;
	const repositoryIcon = isUri(repository) ? 'repo' : repository.kind === 'repository' ? 'repo' : 'archive';
	const repositoryName = repositoryUri.path.split('/').pop() ?? repositoryUri.toString();

	return {
		id: repositoryUri.fsPath,
		name: repositoryName,
		icon: new vscode.ThemeIcon(repositoryIcon),
		default: isDefault
	} satisfies vscode.ChatSessionProviderOptionItem;
}

export function toWorkspaceFolderOptionItem(workspaceFolderUri: URI, name: string): ChatSessionProviderOptionItem {
	return {
		id: workspaceFolderUri.fsPath,
		name: name,
		icon: new vscode.ThemeIcon('folder'),
	} satisfies vscode.ChatSessionProviderOptionItem;
}

export function folderMRUToChatProviderOptions(mruItems: FolderRepositoryMRUEntry[]): ChatSessionProviderOptionItem[] {
	return mruItems.map((item) => {
		if (item.repository) {
			return toRepositoryOptionItem(item.folder);
		} else {
			return toWorkspaceFolderOptionItem(item.folder, basename(item.folder));
		}
	});
}

/**
 * Builds and manages the dropdown option groups (repository, branch, isolation)
 * for new and existing CLI chat sessions.
 */
export interface ISessionOptionGroupBuilder {
	readonly _serviceBrand: undefined;
	provideChatSessionProviderOptionGroups(previousInputState: vscode.ChatSessionInputState | undefined): Promise<vscode.ChatSessionProviderOptionGroup[]>;
	buildBranchOptionGroup(branches: vscode.ChatSessionProviderOptionItem[], headBranchName: string | undefined, isolationEnabled: boolean, currentIsolation: IsolationMode | undefined, previousSelection: vscode.ChatSessionProviderOptionItem | undefined): vscode.ChatSessionProviderOptionGroup | undefined;
	handleInputStateChange(state: vscode.ChatSessionInputState): Promise<void>;
	buildExistingSessionInputStateGroups(resource: vscode.Uri, token: vscode.CancellationToken): Promise<vscode.ChatSessionProviderOptionGroup[]>;
	getBranchOptionItemsForRepository(repoUri: Uri, headBranchName: string | undefined): Promise<vscode.ChatSessionProviderOptionItem[]>;
	getRepositoryOptionItems(): vscode.ChatSessionProviderOptionItem[];
	updateInputStateAfterFolderSelection(inputState: vscode.ChatSessionInputState, folderUri: vscode.Uri): Promise<void>;
}
export const ISessionOptionGroupBuilder = createServiceIdentifier<ISessionOptionGroupBuilder>('ISessionOptionGroupBuilder');

export class SessionOptionGroupBuilder implements ISessionOptionGroupBuilder {
	declare readonly _serviceBrand: undefined;
	private _lastUsedFolderIdInUntitledWorkspace?: { kind: 'folder' | 'repo'; uri: vscode.Uri; lastAccessed: number };
	private readonly _getBranchOptionItemsForRepositorySequencer = new SequencerByKey<string>();

	constructor(
		@IGitService private readonly gitService: IGitService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IChatFolderMruService private readonly copilotCLIFolderMruService: IChatFolderMruService,
		@IAgentSessionsWorkspace private readonly agentSessionsWorkspace: IAgentSessionsWorkspace,
		@IChatSessionWorktreeService private readonly chatSessionWorktreeService: IChatSessionWorktreeService,
		@IFolderRepositoryManager private readonly folderRepositoryManager: IFolderRepositoryManager,
	) { }

	async provideChatSessionProviderOptionGroups(previousInputState: vscode.ChatSessionInputState | undefined): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const optionGroups: vscode.ChatSessionProviderOptionGroup[] = [];
		const isolationEnabled = isIsolationOptionFeatureEnabled(this.configurationService);
		const previouslySelectedIsolationOption = previousInputState ? getSelectedOption(previousInputState.groups, ISOLATION_OPTION_ID) : undefined;
		let currentIsolation: IsolationMode | undefined;
		if (isolationEnabled) {
			const lastUsed = this.context.globalState.get<IsolationMode>(LAST_USED_ISOLATION_OPTION_KEY, IsolationMode.Workspace);
			currentIsolation = resolveIsolationSelection(lastUsed, previouslySelectedIsolationOption?.id);
			const items = [
				{ id: IsolationMode.Workspace, name: l10n.t('Workspace'), icon: new vscode.ThemeIcon('folder') },
				{ id: IsolationMode.Worktree, name: l10n.t('Worktree'), icon: new vscode.ThemeIcon('worktree') },
			];
			optionGroups.push({
				id: ISOLATION_OPTION_ID,
				name: l10n.t('Isolation'),
				description: l10n.t('Pick Isolation Mode'),
				items,
				selected: previouslySelectedIsolationOption ?? items.find(i => i.id === currentIsolation)!
			});
		}

		// Handle repository options based on workspace type
		let defaultRepoUri = !isWelcomeView(this.workspaceService) && !this.agentSessionsWorkspace.isAgentSessionsWorkspace && this.workspaceService.getWorkspaceFolders()?.length === 1 ? this.workspaceService.getWorkspaceFolders()![0] : undefined;
		if (isWelcomeView(this.workspaceService)) {
			const commands: vscode.Command[] = [];
			const previouslySelected = previousInputState ? getSelectedOption(previousInputState.groups, REPOSITORY_OPTION_ID) : undefined;
			let items: vscode.ChatSessionProviderOptionItem[] = [];

			// For untitled workspaces, show last used repositories and "Open Repository..." command
			const repositories = await this.copilotCLIFolderMruService.getRecentlyUsedFolders(CancellationToken.None);
			items = folderMRUToChatProviderOptions(repositories);
			items.splice(MAX_MRU_ENTRIES); // Limit to max entries
			if (this._lastUsedFolderIdInUntitledWorkspace) {
				const folder = this._lastUsedFolderIdInUntitledWorkspace.uri;
				const isRepo = this._lastUsedFolderIdInUntitledWorkspace.kind === 'repo';
				const lastAccessed = this._lastUsedFolderIdInUntitledWorkspace.lastAccessed;
				const id = folder.fsPath;
				if (!items.find(item => item.id === id)) {
					const lastUsedEntry = folderMRUToChatProviderOptions([{
						folder,
						repository: isRepo ? folder : undefined,
						lastAccessed
					}])[0];
					items.unshift(lastUsedEntry);
				}
			}
			commands.push({
				command: OPEN_REPOSITORY_COMMAND_ID,
				title: l10n.t('Browse folders...')
			});

			optionGroups.push({
				id: REPOSITORY_OPTION_ID,
				name: l10n.t('Folder'),
				description: l10n.t('Pick Folder'),
				items,
				selected: previouslySelected,
				commands
			});
		} else {
			const repositories = this.getRepositoryOptionItems();
			if (repositories.length > 1) {
				const previouslySelected = previousInputState ? getSelectedOption(previousInputState.groups, REPOSITORY_OPTION_ID) : undefined;
				const selectedRepository = previouslySelected ? repositories.find(repository => repository.id === previouslySelected.id) ?? repositories[0] : repositories[0];
				defaultRepoUri = selectedRepository.id ? vscode.Uri.file(selectedRepository.id) : defaultRepoUri;
				optionGroups.push({
					id: REPOSITORY_OPTION_ID,
					name: l10n.t('Folder'),
					description: l10n.t('Pick Folder'),
					items: repositories,
					selected: selectedRepository
				});
			} else if (repositories.length === 1) {
				defaultRepoUri = vscode.Uri.file(repositories[0].id);
			}
		}

		if (isBranchOptionFeatureEnabled(this.configurationService)) {
			const repo = defaultRepoUri ? await this.gitService.getRepository(defaultRepoUri) : undefined;
			const branches = repo ? await this.getBranchOptionItemsForRepository(repo.rootUri, repo.headBranchName) : [];
			const previouslySelectedBranchItem = previousInputState ? getSelectedOption(previousInputState.groups, BRANCH_OPTION_ID) : undefined;
			const branchGroup = this.buildBranchOptionGroup(branches, repo?.headBranchName, isolationEnabled, currentIsolation, previouslySelectedBranchItem);
			if (branchGroup) {
				optionGroups.push(branchGroup);
			}
		}

		return optionGroups;
	}

	/**
	 * Build a branch option group from pre-fetched branch items.
	 * Returns undefined if there are no branches.
	 */
	buildBranchOptionGroup(
		branches: vscode.ChatSessionProviderOptionItem[],
		headBranchName: string | undefined,
		isolationEnabled: boolean,
		currentIsolation: IsolationMode | undefined,
		previousSelection: vscode.ChatSessionProviderOptionItem | undefined,
	): vscode.ChatSessionProviderOptionGroup | undefined {
		if (branches.length === 0) {
			return undefined;
		}
		const selectedItem = resolveBranchSelection(branches, headBranchName, previousSelection);
		const { locked, when } = resolveBranchLockState(isolationEnabled, currentIsolation);
		return {
			id: BRANCH_OPTION_ID,
			name: l10n.t('Branch'),
			description: l10n.t('Pick Branch'),
			items: locked ? branches.map(b => ({ ...b, locked: true })) : branches,
			selected: selectedItem && locked ? { ...selectedItem, locked: true } : selectedItem,
			when
		};
	}

	/**
	 * Rebuild the branch group based on current selections.
	 * Called when any dropdown changes — we don't need to know which one.
	 */
	async handleInputStateChange(state: vscode.ChatSessionInputState): Promise<void> {
		const currentIsolation = getSelectedOption(state.groups, ISOLATION_OPTION_ID)?.id as IsolationMode | undefined;
		const currentRepoId = getSelectedOption(state.groups, REPOSITORY_OPTION_ID)?.id;
		const previousBranchSelection = getSelectedOption(state.groups, BRANCH_OPTION_ID);
		const isolationEnabled = isIsolationOptionFeatureEnabled(this.configurationService);

		// Persist the user's isolation choice so it's remembered across sessions
		if (currentIsolation) {
			void this.context.globalState.update(LAST_USED_ISOLATION_OPTION_KEY, currentIsolation);
		}

		// Remove existing branch group, rebuild from scratch
		const groups = [...state.groups.filter(g => g.id !== BRANCH_OPTION_ID)];

		if (currentRepoId && isBranchOptionFeatureEnabled(this.configurationService)) {
			const repoUri = vscode.Uri.file(currentRepoId);
			const repo = await this.gitService.getRepository(repoUri);
			if (repo) {
				let branches: vscode.ChatSessionProviderOptionItem[] = [];
				try {
					branches = await this.getBranchOptionItemsForRepository(repo.rootUri, repo.headBranchName);
				} catch {
					// On failure, branches remain empty — dropdown will be hidden
				}

				const branchGroup = this.buildBranchOptionGroup(branches, repo.headBranchName, isolationEnabled, currentIsolation, previousBranchSelection);
				if (branchGroup) {
					groups.push(branchGroup);
				}
			}
		}

		state.groups = groups;
	}

	async buildExistingSessionInputStateGroups(resource: vscode.Uri, token: vscode.CancellationToken): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const copilotcliSessionId = SessionIdForCLI.parse(resource);
		const optionGroups: vscode.ChatSessionProviderOptionGroup[] = [];
		const folderInfo = await this.folderRepositoryManager.getFolderRepository(copilotcliSessionId, undefined, token);
		const repositories = isWelcomeView(this.workspaceService) ? folderMRUToChatProviderOptions(await this.copilotCLIFolderMruService.getRecentlyUsedFolders(token)) : this.getRepositoryOptionItems();
		const folderOrRepoId = folderInfo.repository?.fsPath ?? folderInfo.folder?.fsPath;
		const existingItem = folderOrRepoId ? repositories.find(repo => repo.id === folderOrRepoId) : undefined;
		const worktreeProperties = await this.chatSessionWorktreeService.getWorktreeProperties(copilotcliSessionId);

		let repoSelected: vscode.ChatSessionProviderOptionItem;
		if (existingItem) {
			repoSelected = { ...existingItem, locked: true };
		} else if (folderInfo.repository) {
			repoSelected = { ...toRepositoryOptionItem(folderInfo.repository), locked: true };
		} else if (folderInfo.folder) {
			const folderName = this.workspaceService.getWorkspaceFolderName(folderInfo.folder) || basename(folderInfo.folder);
			repoSelected = { ...toWorkspaceFolderOptionItem(folderInfo.folder, folderName), locked: true };
		} else {
			let folderName = l10n.t('Unknown');
			if (this.workspaceService.getWorkspaceFolders().length === 1) {
				folderName = this.workspaceService.getWorkspaceFolderName(this.workspaceService.getWorkspaceFolders()[0]) || folderName;
			}
			repoSelected = { id: '', name: folderName, icon: new vscode.ThemeIcon('folder'), locked: true };
		}

		if (isIsolationOptionFeatureEnabled(this.configurationService)) {
			const isWorktree = !!worktreeProperties;
			const isolationSelected = {
				id: isWorktree ? IsolationMode.Worktree : IsolationMode.Workspace,
				name: isWorktree ? l10n.t('Worktree') : l10n.t('Workspace'),
				icon: new vscode.ThemeIcon(isWorktree ? 'worktree' : 'folder'),
				locked: true
			};
			optionGroups.push({
				id: ISOLATION_OPTION_ID,
				name: l10n.t('Isolation'),
				description: l10n.t('Pick Isolation Mode'),
				items: [
					{ id: IsolationMode.Workspace, name: l10n.t('Workspace'), icon: new vscode.ThemeIcon('folder') },
					{ id: IsolationMode.Worktree, name: l10n.t('Worktree'), icon: new vscode.ThemeIcon('worktree') },
				],
				selected: isolationSelected
			});
		}

		optionGroups.push({
			id: REPOSITORY_OPTION_ID,
			name: l10n.t('Folder'),
			description: l10n.t('Pick Folder'),
			items: [repoSelected],
			selected: repoSelected,
			commands: []
		});

		const branchName = worktreeProperties?.branchName ?? folderInfo.repositoryProperties?.branchName;
		const branchSelected = branchName ? { id: branchName, name: branchName, icon: new vscode.ThemeIcon('git-branch'), locked: true } : undefined;
		optionGroups.push({
			id: BRANCH_OPTION_ID,
			name: l10n.t('Branch'),
			description: l10n.t('Pick Branch'),
			items: branchSelected ? [branchSelected] : [],
			selected: branchSelected,
			when: worktreeProperties ? `chatSessionOption.${ISOLATION_OPTION_ID} == '${IsolationMode.Worktree}'` : undefined
		});

		return optionGroups;
	}

	async getBranchOptionItemsForRepository(repoUri: Uri, headBranchName: string | undefined): Promise<vscode.ChatSessionProviderOptionItem[]> {
		const key = `${repoUri.toString()}|${headBranchName ?? ''}`;
		return this._getBranchOptionItemsForRepositorySequencer.queue(key, async () => {

			const refs = await this.gitService.getRefs(repoUri, { sort: 'committerdate' });

			// Filter to local branches only (RefType.Head === 0)
			const localBranches = refs.filter(ref => ref.type === 0 /* RefType.Head */ && ref.name);

			// Build items with HEAD branch first
			const items: vscode.ChatSessionProviderOptionItem[] = [];
			let headItem: vscode.ChatSessionProviderOptionItem | undefined;
			let mainOrheadBranch: vscode.ChatSessionProviderOptionItem | undefined;
			for (const ref of localBranches) {
				if (!ref.name) {
					continue;
				}
				if (ref.name.includes(COPILOT_WORKTREE_PATTERN)) {
					continue;
				}
				const isHead = ref.name === headBranchName;
				const item: vscode.ChatSessionProviderOptionItem = {
					id: ref.name!,
					name: ref.name!,
					icon: new vscode.ThemeIcon('git-branch'),
					// default: isHead
				};
				if (isHead) {
					headItem = item;
				} else if (ref.name === 'main' || ref.name === 'master') {
					mainOrheadBranch = item;
				} else {
					items.push(item);
				}
			}

			if (mainOrheadBranch) {
				items.unshift(mainOrheadBranch);
			}
			if (headItem) {
				items.unshift(headItem);
			}

			return items;
		});
	}

	getRepositoryOptionItems() {
		// Exclude worktrees from the repository list
		const repositories = this.gitService.repositories
			.filter(repository => repository.kind !== 'worktree')
			.filter(repository => {
				if (isWelcomeView(this.workspaceService)) {
					// In the welcome view, include all repositories from the MRU list
					return true;
				}
				// Only include repositories that belong to one of the workspace folders
				return this.workspaceService.getWorkspaceFolder(repository.rootUri) !== undefined;
			});

		const repoItems = repositories
			.map(repository => toRepositoryOptionItem(repository));

		// In multi-root workspaces, also include workspace folders that don't have any git repos
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length) {
			// Find workspace folders that contain git repos
			const foldersWithRepos = new Set<string>();
			for (const repo of repositories) {
				const folder = this.workspaceService.getWorkspaceFolder(repo.rootUri);
				if (folder) {
					foldersWithRepos.add(folder.fsPath);
				}
			}

			// Add workspace folders that don't have any git repos
			for (const folder of workspaceFolders) {
				if (!foldersWithRepos.has(folder.fsPath)) {
					const folderName = this.workspaceService.getWorkspaceFolderName(folder);
					repoItems.push(toWorkspaceFolderOptionItem(folder, folderName));
				}
			}
		}

		return repoItems.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * After a folder is selected via "Browse folders..." command,
	 * update the repo group's selected item and rebuild the branch group.
	 */
	async updateInputStateAfterFolderSelection(inputState: vscode.ChatSessionInputState, folderUri: vscode.Uri): Promise<void> {
		const repo = await this.gitService.getRepository(folderUri, true);
		// Possible the user didn't trust this folder. In that case, we shouldn't be using this folder.
		if (!repo && !(await vscode.workspace.isResourceTrusted(folderUri))) {
			return;
		}
		// Update MRU tracking for untitled workspaces
		if (isWelcomeView(this.workspaceService)) {
			if (repo) {
				this._lastUsedFolderIdInUntitledWorkspace = { kind: 'repo', uri: repo.rootUri, lastAccessed: Date.now() };
			} else {
				this._lastUsedFolderIdInUntitledWorkspace = { kind: 'folder', uri: folderUri, lastAccessed: Date.now() };
			}
		}


		const repoItem = repo
			? toRepositoryOptionItem(repo.rootUri)
			: toWorkspaceFolderOptionItem(folderUri, folderUri.path.split('/').pop() ?? folderUri.fsPath);

		// Update repo group's selected item
		const groups = [...inputState.groups];
		const repoGroupIdx = groups.findIndex(g => g.id === REPOSITORY_OPTION_ID);
		if (repoGroupIdx !== -1) {
			const repoGroup = groups[repoGroupIdx];
			const items = repoGroup.items.find(i => i.id === repoItem.id)
				? [...repoGroup.items]
				: [repoItem, ...repoGroup.items];
			groups[repoGroupIdx] = { ...repoGroup, items, selected: repoItem };
		}

		// Remove existing branch group, rebuild
		const previousBranchSelection = getSelectedOption(inputState.groups, BRANCH_OPTION_ID);
		const branchIdx = groups.findIndex(g => g.id === BRANCH_OPTION_ID);
		if (branchIdx !== -1) {
			groups.splice(branchIdx, 1);
		}

		if (repo && isBranchOptionFeatureEnabled(this.configurationService)) {
			let branches: vscode.ChatSessionProviderOptionItem[] = [];
			try {
				branches = await this.getBranchOptionItemsForRepository(repo.rootUri, repo.headBranchName);
			} catch {
				// branches remain empty
			}
			const isolationEnabled = isIsolationOptionFeatureEnabled(this.configurationService);
			const currentIsolation = getSelectedOption(inputState.groups, ISOLATION_OPTION_ID)?.id as IsolationMode | undefined;
			// Preserve previous branch selection if the same branch exists in the new repo
			const branchGroup = this.buildBranchOptionGroup(branches, repo.headBranchName, isolationEnabled, currentIsolation, previousBranchSelection);
			if (branchGroup) {
				groups.push(branchGroup);
			}
		}

		inputState.groups = groups;
	}
}
