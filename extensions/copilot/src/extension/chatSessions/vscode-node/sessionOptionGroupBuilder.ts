/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ## Dropdown Business Rules
 *
 * ### Feature Flags
 * - `CLIBranchSupport`   — gates the Branch dropdown entirely.
 * - `CLIIsolationOption`  — gates the Isolation dropdown entirely.
 *
 * ### Trust
 * - Git repository lookups are only performed on **trusted** folders
 *   (via {@link getTrustedRepository}). Untrusted folders are treated
 *   as non-git: isolation locks to Workspace and branch is hidden.
 *
 * ---
 * ### NEW Sessions
 *
 * #### Isolation dropdown
 * | Scenario                                      | Shown? | Editable? | Selected                                        |
 * |-----------------------------------------------|--------|-----------|-------------------------------------------------|
 * | Feature disabled                              | No     | —         | —                                               |
 * | Enabled, folder is a trusted git repo         | Yes    | Yes       | Last-used value (defaults to Workspace)         |
 * | Enabled, folder is NOT a git repo / untrusted | Yes    | Locked    | Forced to Workspace                             |
 * | Re-evaluated after git init (rebuildInputState)       | Yes | Unlocked | Preserves current selection              |
 *
 * #### Folder / Repository dropdown
 * | Workspace type                        | Shown? | Editable? | Items                                              |
 * |---------------------------------------|--------|-----------|--------------------------------------------------|
 * | Welcome view (no workspace folders)   | Yes    | Yes       | MRU list (max 10) + "Browse folders…" command     |
 * | Single workspace folder, 1 repo item  | No     | —         | Implicit (used as default)                         |
 * | Single workspace folder, 0 repos      | No     | —         | Implicit (workspace folder used as default)        |
 * | Multi-root / multiple repo items      | Yes    | Yes       | All repos + non-git workspace folders, sorted A-Z  |
 *
 * #### Branch dropdown
 * | Scenario                                   | Shown? | Editable? | Selected    |
 * |--------------------------------------------|--------|-----------|-------------|
 * | `CLIBranchSupport` disabled                | No     | —         | —           |
 * | Folder is NOT a git repo / untrusted       | No     | —         | —           |
 * | Git repo, isolation disabled               | Yes    | Locked    | HEAD branch |
 * | Git repo, isolation enabled + Workspace    | Yes    | Locked    | HEAD branch |
 * | Git repo, isolation enabled + Worktree     | Yes    | Editable  | HEAD branch |
 *
 * #### Branch item ordering
 * 1. HEAD branch (first)
 * 2. `main` / `master` (second, if it exists and isn't HEAD)
 * 3. Other local branches (by committer date)
 * 4. `copilot-worktree-*` branches excluded
 * 5. Remote refs excluded
 *
 * #### Selection persistence
 * - **Isolation** — persisted to global state on every change.
 * - **Folder**    — previous selection restored if still in list → first item.
 * - **Branch**    — previous selection if still in list → HEAD → stale previous preserved.
 *
 * ---
 * ### EXISTING Sessions
 *
 * Everything is **locked** — no dropdowns are editable.
 *
 * | Dropdown  | Shown?                      | Locked? | Value                                           |
 * |-----------|-----------------------------|---------|-------------------------------------------------|
 * | Isolation | Yes (if feature enabled)    | Yes     | Worktree if session has worktree props, else Workspace |
 * | Folder    | Always                      | Yes     | The session's folder / repo                     |
 * | Branch    | Only if branch name exists  | Yes     | Session's worktree branch or repo branch        |
 *
 * ---
 * ### State Transitions
 *
 * **handleInputStateChange** (user dropdown interaction):
 * Partial refresh — rebuilds branch and isolation only.
 * Cannot add/remove the folder dropdown group.
 *
 * **rebuildInputState** (external state changes):
 * Full rebuild of all groups
 * Used when git repos are discovered/closed or workspace folders
 * change, since these can add/remove entire dropdown groups.
 *
 * **updateInputStateAfterFolderSelection** (Browse folders… flow):
 * Same pattern as handleInputStateChange — updates folder selection,
 * then locks/unlocks isolation and rebuilds branch based on git status.
 *
 * **provideChatSessionProviderOptionGroups** (initial build):
 * Builds all groups, checks git status, forces workspace
 * isolation if folder is non-git / untrusted.
 */

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
 * Determine branch dropdown locked state.
 *
 * - Isolation enabled + Workspace selected → locked
 * - Isolation enabled + Worktree selected → editable
 * - Isolation disabled → locked (always workspace mode)
 */
export function resolveBranchLockState(
	isolationEnabled: boolean,
	currentIsolation: IsolationMode | undefined,
): { locked: boolean } {
	if (!isolationEnabled) {
		return { locked: true };
	}

	const isWorktree = currentIsolation === IsolationMode.Worktree;
	return {
		locked: !isWorktree,
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

function optionItemsEqual(a: vscode.ChatSessionProviderOptionItem | undefined, b: vscode.ChatSessionProviderOptionItem | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return a.id === b.id && a.locked === b.locked;
}

function optionGroupsEqual(
	oldGroups: readonly vscode.ChatSessionProviderOptionGroup[],
	newGroups: readonly vscode.ChatSessionProviderOptionGroup[],
): boolean {
	if (oldGroups.length !== newGroups.length) {
		return false;
	}
	for (let i = 0; i < oldGroups.length; i++) {
		const oldGroup = oldGroups[i];
		const newGroup = newGroups[i];
		if (oldGroup.id !== newGroup.id) {
			return false;
		}
		if (!optionItemsEqual(oldGroup.selected, newGroup.selected)) {
			return false;
		}
		if (oldGroup.items.length !== newGroup.items.length) {
			return false;
		}
		for (let j = 0; j < oldGroup.items.length; j++) {
			if (!optionItemsEqual(oldGroup.items[j], newGroup.items[j])) {
				return false;
			}
		}
	}
	return true;
}

export function getSelectedOption(groups: readonly vscode.ChatSessionProviderOptionGroup[], groupId: string): vscode.ChatSessionProviderOptionItem | undefined {
	return groups.find(g => g.id === groupId)?.selected;
}

/**
 * Extract the selected repository, branch, and isolation values from an input state.
 */
export function getSelectedSessionOptions(inputState: vscode.ChatSessionInputState): { folder?: vscode.Uri; branch?: string; isolation?: IsolationMode } {
	const repoId = getSelectedOption(inputState.groups, REPOSITORY_OPTION_ID)?.id;
	const branch = getSelectedOption(inputState.groups, BRANCH_OPTION_ID)?.id;
	const isolationId = getSelectedOption(inputState.groups, ISOLATION_OPTION_ID)?.id;
	return {
		folder: repoId ? vscode.Uri.file(repoId) : undefined,
		branch: branch || undefined,
		isolation: (isolationId === IsolationMode.Workspace || isolationId === IsolationMode.Worktree) ? isolationId : undefined,
	};
}

export function isBranchOptionFeatureEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getConfig(ConfigKey.Advanced.CLIBranchSupport);
}

/**
 * Force the isolation option group to workspace and lock it when the
 * selected folder is not a git repository (worktree isolation is a
 * no-op without git). Use {@link resetIsolationLock} to unlock when
 * the folder becomes a git repo (e.g. after git init).
 */
function forceWorkspaceIsolation(groups: vscode.ChatSessionProviderOptionGroup[]): void {
	const isolationIdx = groups.findIndex(g => g.id === ISOLATION_OPTION_ID);
	if (isolationIdx !== -1) {
		const isolationGroup = groups[isolationIdx];
		const workspaceItem = isolationGroup.items.find(i => i.id === IsolationMode.Workspace);
		if (workspaceItem) {
			groups[isolationIdx] = {
				...isolationGroup,
				items: isolationGroup.items.map(i => ({ ...i, locked: true })),
				selected: { ...workspaceItem, locked: true },
			};
		}
	}
}

/**
 * Remove the locked flag from all isolation items.
 * Called when the selected folder turns out to be (or becomes) a git
 * repository, so the worktree option is valid again.
 */
function resetIsolationLock(groups: vscode.ChatSessionProviderOptionGroup[]): void {
	const isolationIdx = groups.findIndex(g => g.id === ISOLATION_OPTION_ID);
	if (isolationIdx !== -1) {
		const isolationGroup = groups[isolationIdx];
		const unlock = (item: vscode.ChatSessionProviderOptionItem): vscode.ChatSessionProviderOptionItem => {
			const { locked: _, ...rest } = item;
			return rest;
		};
		groups[isolationIdx] = {
			...isolationGroup,
			items: isolationGroup.items.map(unlock),
			selected: isolationGroup.selected ? unlock(isolationGroup.selected) : undefined,
		};
	}
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
	rebuildInputState(state: vscode.ChatSessionInputState, selectedFolderUri?: vscode.Uri): Promise<void>;
	buildExistingSessionInputStateGroups(resource: vscode.Uri, token: vscode.CancellationToken): Promise<vscode.ChatSessionProviderOptionGroup[]>;
	getBranchOptionItemsForRepository(repoUri: Uri, headBranchName: string | undefined): Promise<vscode.ChatSessionProviderOptionItem[]>;
	getRepositoryOptionItems(): vscode.ChatSessionProviderOptionItem[];
	/**
	 * Lock all dropdown groups (make them readonly).
	 * Used when a new session is being created.
	 */
	lockInputStateGroups(state: vscode.ChatSessionInputState): void;
	/**
	 * Update the branch dropdown to display a specific branch name (locked).
	 * Used after a worktree is created to show the new branch.
	 */
	updateBranchInInputState(state: vscode.ChatSessionInputState, branchName: string): void;
}
export const ISessionOptionGroupBuilder = createServiceIdentifier<ISessionOptionGroupBuilder>('ISessionOptionGroupBuilder');

export class SessionOptionGroupBuilder implements ISessionOptionGroupBuilder {
	declare readonly _serviceBrand: undefined;
	private readonly _getBranchOptionItemsForRepositorySequencer = new SequencerByKey<string>();
	private readonly _pendingBuildGroups = new WeakMap<vscode.ChatSessionInputState, Promise<vscode.ChatSessionProviderOptionGroup[]>>();
	// Keeps track of the new folders selected by user
	private readonly _inputStateNewFolders = new WeakMap<vscode.ChatSessionInputState, vscode.Uri>();
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


	/**
	 * Return the git repository for a URI only if the folder is trusted.
	 * Untrusted folders are treated as non-git.
	 */
	private async getTrustedRepository(uri: vscode.Uri | undefined, discover?: boolean): Promise<RepoContext | undefined> {
		if (!uri) {
			return undefined;
		}
		const isTrusted = await this.workspaceService.isResourceTrusted(uri);
		if (!isTrusted) {
			return undefined;
		}
		return this.gitService.getRepository(uri, discover);
	}

	async provideChatSessionProviderOptionGroups(previousInputState: vscode.ChatSessionInputState | undefined, selectedFolderUri?: vscode.Uri): Promise<vscode.ChatSessionProviderOptionGroup[]> {
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
			// Use the previous selection's ID to find the matching fresh item
			// (without stale flags like `locked`), falling back to the default.
			const selectedId = previouslySelectedIsolationOption?.id ?? currentIsolation;
			optionGroups.push({
				id: ISOLATION_OPTION_ID,
				name: l10n.t('Isolation'),
				description: l10n.t('Pick Isolation Mode'),
				items,
				selected: items.find(i => i.id === selectedId)!
			});
		}

		// Handle repository options based on workspace type
		const folders = this.workspaceService.getWorkspaceFolders();
		const isSingleFolderWorkspace = !isWelcomeView(this.workspaceService)
			&& !this.agentSessionsWorkspace.isAgentSessionsWorkspace
			&& folders?.length === 1;
		let defaultRepoUri = selectedFolderUri ?? (isSingleFolderWorkspace ? folders![0] : undefined);
		if (isWelcomeView(this.workspaceService)) {
			const commands: vscode.Command[] = [];
			const previouslySelected = previousInputState ? getSelectedOption(previousInputState.groups, REPOSITORY_OPTION_ID) : undefined;
			let items: vscode.ChatSessionProviderOptionItem[] = [];

			// For untitled workspaces, show last used repositories and "Open Repository..." command
			const repositories = await this.copilotCLIFolderMruService.getRecentlyUsedFolders(CancellationToken.None);
			items = folderMRUToChatProviderOptions(repositories);
			const addFolderToList = async (uri: Uri) => {
				const newFolderRepo = await this.getTrustedRepository(uri, true);
				const newFolderItem = newFolderRepo
					? toRepositoryOptionItem(newFolderRepo.rootUri)
					: toWorkspaceFolderOptionItem(uri, uri.path.split('/').pop() ?? uri.fsPath);
				// Remove duplicate if already in the list, then add to top
				items = items.filter(item => item.id !== newFolderItem.id);
				items.unshift(newFolderItem);
			};
			if (selectedFolderUri) {
				await addFolderToList(selectedFolderUri);
			}
			const previouslySelectedUri = previouslySelected ? vscode.Uri.file(previouslySelected.id) : undefined;
			if (previouslySelectedUri) {
				await addFolderToList(previouslySelectedUri);
			}
			// Ensure previously selected folder is added back into the list of folders.
			const newFolder = previousInputState ? this._inputStateNewFolders.get(previousInputState) : undefined;
			if (newFolder) {
				await addFolderToList(newFolder);
			}
			const selectedFolderItem = selectedFolderUri ? items.find(i => i.id === selectedFolderUri.fsPath) : undefined;
			const previouslySelectedItem = previouslySelected ? items.find(i => i.id === previouslySelected.id) : undefined;
			const selectedItem = selectedFolderItem
				?? previouslySelectedItem ?? items[0];
			if (selectedItem) {
				defaultRepoUri = vscode.Uri.file(selectedItem.id);
			}

			items.splice(MAX_MRU_ENTRIES); // Limit to max entries
			// If user selected something from the list but it's not there anymore (perhaps its an item at the end of MRU).
			if (selectedItem && !items.some(item => item.id === selectedItem.id)) {
				items.push(selectedItem);
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
				selected: selectedItem,
				commands
			});
		} else {
			const repositories = this.getRepositoryOptionItems();
			if (repositories.length > 1) {
				const previouslySelected = previousInputState ? getSelectedOption(previousInputState.groups, REPOSITORY_OPTION_ID) : undefined;
				const selectedFolderRepo = selectedFolderUri ? repositories.find(repository => repository.id === selectedFolderUri.fsPath) : undefined;
				const selectedRepository = selectedFolderRepo ?? (previouslySelected ? repositories.find(repository => repository.id === previouslySelected.id) ?? repositories[0] : repositories[0]);
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

		const repo = await this.getTrustedRepository(defaultRepoUri);

		// When the selected folder is not a git repo (or untrusted), force isolation to workspace
		if (defaultRepoUri && !repo && isolationEnabled) {
			forceWorkspaceIsolation(optionGroups);
		}

		if (repo && isBranchOptionFeatureEnabled(this.configurationService)) {
			const branches = await this.getBranchOptionItemsForRepository(repo.rootUri, repo.headBranchName);
			const previouslySelectedBranchItem = previousInputState ? getSelectedOption(previousInputState.groups, BRANCH_OPTION_ID) : undefined;
			const branchGroup = this.buildBranchOptionGroup(branches, repo.headBranchName, isolationEnabled, currentIsolation, previouslySelectedBranchItem);
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
		// BUG: Work around for https://github.com/microsoft/vscode/issues/288457#issuecomment-4157935788
		// Locked doesn't work, once locked, we cannot unlock.
		const { locked } = resolveBranchLockState(isolationEnabled, currentIsolation);
		// const locked = false;
		// When locked (workspace isolation), ignore the previous selection so we
		// always snap back to the active branch instead of keeping a stale pick.
		const selectedItem = resolveBranchSelection(branches, headBranchName, locked ? undefined : previousSelection);
		const lockedSelected = selectedItem && locked ? { ...selectedItem, locked } : undefined;
		return {
			id: BRANCH_OPTION_ID,
			name: l10n.t('Branch'),
			description: l10n.t('Pick Branch'),
			items: lockedSelected ? [lockedSelected] : locked ? branches.map(b => ({ ...b, locked })) : branches,
			selected: lockedSelected ?? selectedItem,
		};
	}

	/**
	 * Rebuild dependent option groups based on current selections.
	 * Called when any dropdown changes — inspects each group's `selected`
	 * property to determine the current state and update accordingly.
	 */
	async handleInputStateChange(state: vscode.ChatSessionInputState): Promise<void> {
		// Persist the user's isolation choice so it's remembered across sessions
		const currentIsolation = getSelectedOption(state.groups, ISOLATION_OPTION_ID)?.id as IsolationMode | undefined;
		if (currentIsolation) {
			void this.context.globalState.update(LAST_USED_ISOLATION_OPTION_KEY, currentIsolation);
		}

		const newGroups = await this._buildGroupsOnce(state);
		if (!optionGroupsEqual(state.groups, newGroups)) {
			state.groups = newGroups;
		}
	}

	/**
	 * Full rebuild of all option groups (isolation, folder, branch).
	 * Called when external state changes (workspace folders added/removed,
	 * git repos discovered/closed) that may require adding or removing
	 * entire dropdown groups — not just updating branch/isolation.
	 */
	async rebuildInputState(state: vscode.ChatSessionInputState, selectedFolderUri?: vscode.Uri): Promise<void> {
		const newGroups = await this._buildGroupsOnce(state, selectedFolderUri);
		if (!optionGroupsEqual(state.groups, newGroups) || selectedFolderUri) {
			state.groups = newGroups;
		}
		if (selectedFolderUri) {
			this._inputStateNewFolders.set(state, selectedFolderUri);
		}
	}

	/**
	 * Deduplicate concurrent builds for the same state object.
	 * If a build is already in-flight for this state, return the same promise.
	 */
	private _buildGroupsOnce(state: vscode.ChatSessionInputState, selectedFolderUri?: vscode.Uri): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const pending = this._pendingBuildGroups.get(state);
		if (pending) {
			return pending;
		}
		const promise = this.provideChatSessionProviderOptionGroups(state, selectedFolderUri).finally(() => {
			this._pendingBuildGroups.delete(state);
		});
		this._pendingBuildGroups.set(state, promise);
		return promise;
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
		if (branchName) {
			const branchSelected = { id: branchName, name: branchName, icon: new vscode.ThemeIcon('git-branch'), locked: true };
			optionGroups.push({
				id: BRANCH_OPTION_ID,
				name: l10n.t('Branch'),
				description: l10n.t('Pick Branch'),
				items: [branchSelected],
				selected: branchSelected,
			});
		}

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

	lockInputStateGroups(state: vscode.ChatSessionInputState): void {
		lockInputStateGroups(state);
	}

	updateBranchInInputState(state: vscode.ChatSessionInputState, branchName: string): void {
		const existingIdx = state.groups.findIndex(g => g.id === BRANCH_OPTION_ID);
		if (existingIdx === -1) {
			return;
		}
		const branchSelected: vscode.ChatSessionProviderOptionItem = {
			id: branchName,
			name: branchName,
			icon: new vscode.ThemeIcon('git-branch'),
			locked: true,
		};
		const branchGroup: vscode.ChatSessionProviderOptionGroup = {
			id: BRANCH_OPTION_ID,
			name: l10n.t('Branch'),
			description: l10n.t('Pick Branch'),
			items: [branchSelected],
			selected: branchSelected,
		};
		const updatedGroups = [...state.groups];
		updatedGroups[existingIdx] = branchGroup;
		state.groups = updatedGroups;
	}
}

export function lockInputStateGroups(state: vscode.ChatSessionInputState): void {
	state.groups = state.groups.map(group => ({
		...group,
		items: group.items.map(item => ({ ...item, locked: true })),
		selected: group.selected ? { ...group.selected, locked: true } : undefined,
	}));
}
