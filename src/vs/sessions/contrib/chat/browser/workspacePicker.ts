/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { GITHUB_REMOTE_FILE_SCHEME, SessionWorkspace } from '../../sessions/common/sessionWorkspace.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { agentHostAuthority } from '../../remoteAgentHost/browser/remoteAgentHost.contribution.js';
import { AGENT_HOST_FS_SCHEME } from '../../remoteAgentHost/browser/agentHostFileSystemProvider.js';
import { pickRemoteAgentHostFolder } from '../../remoteAgentHost/browser/remoteAgentHostPicker.js';

const OPEN_REPO_COMMAND = 'github.copilot.chat.cloudSessions.openRepository';
const STORAGE_KEY_LAST_PROJECT = 'sessions.lastPickedProject';
const STORAGE_KEY_RECENT_PROJECTS = 'sessions.recentlyPickedProjects';
const MAX_RECENT_PROJECTS = 10;
const FILTER_THRESHOLD = 10;

// Legacy storage keys from the old separate folder/repo pickers
const LEGACY_STORAGE_KEY_LAST_FOLDER = 'agentSessions.lastPickedFolder';
const LEGACY_STORAGE_KEY_RECENT_FOLDERS = 'agentSessions.recentlyPickedFolders';
const LEGACY_STORAGE_KEY_LAST_REPO = 'agentSessions.lastPickedRepo';
const LEGACY_STORAGE_KEY_RECENT_REPOS = 'agentSessions.recentlyPickedRepos';

const COMMAND_BROWSE_FOLDERS = 'command:browseFolders';
const COMMAND_BROWSE_REPOS = 'command:browseRepos';
const COMMAND_BROWSE_REMOTE_AGENT_HOSTS = 'command:browseRemoteAgentHosts';

/**
 * Serializable form of a project entry for storage.
 */
interface IStoredProject {
	readonly uri: UriComponents;
	readonly checked?: boolean;
	/** Cached display name for remote agent host connections. */
	readonly remoteName?: string;
}

/**
 * A unified project picker that shows recently selected folders and repositories
 * in a single dropdown. Selecting a folder creates a local session; selecting a
 * repository creates a remote/cloud session.
 *
 * Actions at the bottom:
 * - "Browse Folders..." — opens a folder dialog
 * - "Browse Repositories..." — runs the cloud repository picker command
 */
export class WorkspacePicker extends Disposable {

	private readonly _onDidSelectProject = this._register(new Emitter<SessionWorkspace>());
	readonly onDidSelectProject: Event<SessionWorkspace> = this._onDidSelectProject.event;

	private _selectedProject: SessionWorkspace | undefined;
	private _recentProjects: IStoredProject[] = [];

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	get selectedProject(): SessionWorkspace | undefined {
		return this._selectedProject;
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		// Restore recently picked projects (or migrate from legacy storage)
		try {
			const stored = this.storageService.get(STORAGE_KEY_RECENT_PROJECTS, StorageScope.PROFILE);
			if (stored) {
				this._recentProjects = JSON.parse(stored);
			} else {
				this._migrateFromLegacyStorage();
			}
		} catch { /* ignore */ }

		// Restore last picked project (or migrate from legacy)
		try {
			const last = this.storageService.get(STORAGE_KEY_LAST_PROJECT, StorageScope.PROFILE);
			if (last) {
				this._selectedProject = this._fromStored(JSON.parse(last));
			} else {
				this._migrateLastPickedFromLegacy();
			}
		} catch { /* ignore */ }
	}

	/**
	 * Migrates recently picked folders and repos from the old separate storage
	 * keys into the unified project list.
	 */
	private _migrateFromLegacyStorage(): void {
		const migrated: IStoredProject[] = [];

		try {
			const storedFolders = this.storageService.get(LEGACY_STORAGE_KEY_RECENT_FOLDERS, StorageScope.PROFILE);
			if (storedFolders) {
				for (const uriStr of JSON.parse(storedFolders) as string[]) {
					migrated.push({ uri: URI.parse(uriStr).toJSON() });
				}
			}
		} catch { /* ignore */ }

		try {
			const storedRepos = this.storageService.get(LEGACY_STORAGE_KEY_RECENT_REPOS, StorageScope.PROFILE);
			if (storedRepos) {
				for (const repo of JSON.parse(storedRepos) as { id: string; name: string }[]) {
					migrated.push({ uri: URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${repo.id}/HEAD` }).toJSON() });
				}
			}
		} catch { /* ignore */ }

		if (migrated.length > 0) {
			this._recentProjects = migrated.slice(0, MAX_RECENT_PROJECTS);
			this._persistRecents();
		}
	}

	/**
	 * Migrates the last picked folder or repo from the old storage keys.
	 */
	private _migrateLastPickedFromLegacy(): void {
		try {
			const lastFolder = this.storageService.get(LEGACY_STORAGE_KEY_LAST_FOLDER, StorageScope.PROFILE);
			if (lastFolder) {
				this._selectedProject = new SessionWorkspace(URI.parse(lastFolder));
				return;
			}
		} catch { /* ignore */ }

		try {
			const lastRepo = this.storageService.get(LEGACY_STORAGE_KEY_LAST_REPO, StorageScope.PROFILE);
			if (lastRepo) {
				const repo: { id: string; name: string } = JSON.parse(lastRepo);
				this._selectedProject = new SessionWorkspace(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${repo.id}/HEAD` }));
			}
		} catch { /* ignore */ }
	}

	/**
	 * Renders the project picker trigger button into the given container.
	 * Returns the container element.
	 */
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-workspace-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		this._updateTriggerLabel();

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this.showPicker();
		}));

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this.showPicker();
			}
		}));

		return slot;
	}

	/**
	 * Shows the project picker dropdown anchored to the trigger element.
	 */
	showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const items = this._buildItems();
		const showFilter = items.filter(i => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IStoredProject> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				const uriStr = URI.revive(item.uri).toString();
				if (uriStr === COMMAND_BROWSE_FOLDERS) {
					this._browseForFolder();
				} else if (uriStr === COMMAND_BROWSE_REPOS) {
					this._browseForRepo();
				} else if (uriStr === COMMAND_BROWSE_REMOTE_AGENT_HOSTS) {
					this._browseForRemoteAgentHost();
				} else {
					this._selectProject(this._fromStored(item));
				}
			},
			onHide: () => { triggerElement.focus(); },
		};

		const listOptions = showFilter ? { showFilter: true, filterPlaceholder: localize('workspacePicker.filter', "Search Workspaces...") } : undefined;

		this.actionWidgetService.show<IStoredProject>(
			'workspacePicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('workspacePicker.ariaLabel', "Workspace Picker"),
			},
			listOptions,
		);
	}

	/**
	 * Programmatically set the selected project.
	 * @param fireEvent Whether to fire the onDidSelectProject event. Defaults to true.
	 */
	setSelectedProject(project: SessionWorkspace, fireEvent = true): void {
		this._selectProject(project, fireEvent);
	}

	/**
	 * Clears the selected project.
	 */
	clearSelection(): void {
		this._selectedProject = undefined;
		this._updateTriggerLabel();
	}

	/**
	 * Removes a project from the recently picked list by URI.
	 */
	removeFromRecents(uri: URI): void {
		this._recentProjects = this._recentProjects.filter(p => !this.uriIdentityService.extUri.isEqual(URI.revive(p.uri), uri));
		this._persistRecents();
		if (this._selectedProject && this.uriIdentityService.extUri.isEqual(this._selectedProject.uri, uri)) {
			this._selectedProject = undefined;
			this.storageService.remove(STORAGE_KEY_LAST_PROJECT, StorageScope.PROFILE);
			this._updateTriggerLabel();
		}
	}

	private _selectProject(project: SessionWorkspace, fireEvent = true): void {
		this._selectedProject = project;
		const stored = this._withCachedRemoteName(this._toStored(project));
		this._addToRecents(stored);
		this.storageService.store(STORAGE_KEY_LAST_PROJECT, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
		this._updateTriggerLabel();
		if (fireEvent) {
			this._onDidSelectProject.fire(project);
		}
	}

	private async _browseForFolder(): Promise<void> {
		try {
			const selected = await this.fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('selectFolder', "Select Folder"),
			});
			if (selected?.[0]) {
				this._selectProject(new SessionWorkspace(selected[0]));
			}
		} catch {
			// dialog was cancelled or failed
		}
	}

	private async _browseForRepo(): Promise<void> {
		try {
			const result: string | undefined = await this.commandService.executeCommand(OPEN_REPO_COMMAND);
			if (result) {
				this._selectProject(new SessionWorkspace(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${result}/HEAD` })));
			}
		} catch {
			// command was cancelled or failed
		}
	}

	private async _browseForRemoteAgentHost(): Promise<void> {
		const folderUri = await this.instantiationService.invokeFunction(pickRemoteAgentHostFolder);
		if (folderUri) {
			this._selectProject(new SessionWorkspace(folderUri));
		}
	}

	private _addToRecents(stored: IStoredProject): void {
		stored = this._withCachedRemoteName(stored);
		this._recentProjects = [
			stored,
			...this._recentProjects.filter(p => !this._isSameProject(p, stored)),
		].slice(0, MAX_RECENT_PROJECTS);
		this._persistRecents();
	}

	private _persistRecents(): void {
		this.storageService.store(STORAGE_KEY_RECENT_PROJECTS, JSON.stringify(this._recentProjects), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _buildItems(): IActionListItem<IStoredProject>[] {
		const items: IActionListItem<IStoredProject>[] = [];

		// Collect all projects (current + recents), deduped
		const allProjects: IStoredProject[] = [];
		if (this._selectedProject) {
			const stored = this._withCachedRemoteName(this._toStored(this._selectedProject));
			allProjects.push(stored);
		}
		for (const project of this._recentProjects) {
			if (!allProjects.some(p => this._isSameProject(p, project))) {
				allProjects.push(project);
			}
		}

		// Split into folders, repos, and remotes, sort each group alphabetically
		const isStoredFolder = (p: IStoredProject) => {
			const scheme = URI.revive(p.uri).scheme;
			return scheme !== GITHUB_REMOTE_FILE_SCHEME && scheme !== AGENT_HOST_FS_SCHEME;
		};
		const isStoredRemote = (p: IStoredProject) => URI.revive(p.uri).scheme === AGENT_HOST_FS_SCHEME;
		const folders = allProjects.filter(p => isStoredFolder(p)).sort((a, b) => this._getStoredProjectLabel(a).localeCompare(this._getStoredProjectLabel(b)));
		const repos = allProjects.filter(p => !isStoredFolder(p) && !isStoredRemote(p)).sort((a, b) => this._getStoredProjectLabel(a).localeCompare(this._getStoredProjectLabel(b)));
		const remotes = allProjects.filter(p => isStoredRemote(p)).sort((a, b) => this._getStoredProjectLabel(a).localeCompare(this._getStoredProjectLabel(b)));

		const selectedStored = this._selectedProject ? this._toStored(this._selectedProject) : undefined;
		const isSelected = (p: IStoredProject) => !!selectedStored && this._isSameProject(p, selectedStored);

		// Folders first
		for (const project of folders) {
			const selected = isSelected(project);
			items.push({
				kind: ActionListItemKind.Action,
				label: this._getStoredProjectLabel(project),
				group: { title: '', icon: Codicon.folder },
				item: selected ? { ...project, checked: true } : project,
				onRemove: () => this._removeProject(project),
			});
		}

		// Then repos
		for (const project of repos) {
			const selected = isSelected(project);
			items.push({
				kind: ActionListItemKind.Action,
				label: this._getStoredProjectLabel(project),
				group: { title: '', icon: Codicon.repo },
				item: selected ? { ...project, checked: true } : project,
				onRemove: () => this._removeProject(project),
			});
		}

		// Then remotes
		for (const project of remotes) {
			const selected = isSelected(project);
			items.push({
				kind: ActionListItemKind.Action,
				label: this._getStoredProjectLabel(project),
				group: { title: '', icon: Codicon.remote },
				item: selected ? { ...project, checked: true } : project,
				onRemove: () => this._removeProject(project),
			});
		}

		// Separator + Browse actions
		if (items.length > 0) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
		}
		items.push({
			kind: ActionListItemKind.Action,
			label: localize('browseFolders', "Browse Folders..."),
			group: { title: '', icon: Codicon.folderOpened },
			item: { uri: URI.parse(COMMAND_BROWSE_FOLDERS).toJSON() },
		});
		items.push({
			kind: ActionListItemKind.Action,
			label: localize('browseRepositories', "Browse Repositories..."),
			group: { title: '', icon: Codicon.repo },
			item: { uri: URI.parse(COMMAND_BROWSE_REPOS).toJSON() },
		});
		if (this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('browseRemotes', "Browse Remotes..."),
				group: { title: '', icon: Codicon.remote },
				item: { uri: URI.parse(COMMAND_BROWSE_REMOTE_AGENT_HOSTS).toJSON() },
			});
		}

		return items;
	}

	private _removeProject(project: IStoredProject): void {
		this._recentProjects = this._recentProjects.filter(p => !this._isSameProject(p, project));
		this._persistRecents();
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);
		const project = this._selectedProject;
		const label = project ? this._getProjectLabel(project) : localize('pickWorkspace', "Pick a Workspace");
		const icon = project
			? (project.isRemoteAgentHost ? Codicon.remote : project.isFolder ? Codicon.folder : Codicon.repo)
			: Codicon.project;

		dom.append(this._triggerElement, renderIcon(icon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
	}

	private _getProjectLabel(project: SessionWorkspace): string {
		return this._getStoredProjectLabel(this._withCachedRemoteName(this._toStored(project)));
	}

	private _getStoredProjectLabel(project: IStoredProject): string {
		const uri = URI.revive(project.uri);
		// TODO@roblourens HACK
		if (uri.scheme === AGENT_HOST_FS_SCHEME) {
			const folderName = basename(uri) || uri.path || '/';
			const remoteName = this._getRemoteName(uri.authority) ?? project.remoteName ?? uri.authority;
			return `${folderName} [${remoteName}]`;
		}
		if (uri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
			return basename(uri);
		}
		// For repos, extract "owner/repo" from the URI path (e.g. "/owner/repo/HEAD" → "owner/repo")
		return uri.path.substring(1).replace(/\/HEAD$/, '');
	}

	/**
	 * Resolves a sanitized authority back to a user-facing remote name.
	 */
	private _getRemoteName(authority: string): string | undefined {
		for (const conn of this.remoteAgentHostService.connections) {
			if (agentHostAuthority(conn.address) === authority) {
				return conn.name;
			}
		}
		return undefined;
	}

	private _toStored(project: SessionWorkspace): IStoredProject {
		const uri = project.uri;
		const stored: IStoredProject = { uri: uri.toJSON() };
		if (uri.scheme === AGENT_HOST_FS_SCHEME) {
			const remoteName = this._getRemoteName(uri.authority);
			if (remoteName) {
				return { ...stored, remoteName };
			}
		}
		return stored;
	}

	private _fromStored(stored: IStoredProject): SessionWorkspace {
		return new SessionWorkspace(URI.revive(stored.uri));
	}

	/**
	 * If the stored project is missing a cached remoteName, tries to recover
	 * it from the recents list so labels remain stable across restarts.
	 */
	private _withCachedRemoteName(stored: IStoredProject): IStoredProject {
		if (!stored.remoteName && URI.revive(stored.uri).scheme === AGENT_HOST_FS_SCHEME) {
			const cached = this._recentProjects.find(p => this._isSameProject(p, stored));
			if (cached?.remoteName) {
				return { ...stored, remoteName: cached.remoteName };
			}
		}
		return stored;
	}

	private _isSameProject(a: IStoredProject, b: IStoredProject): boolean {
		return this.uriIdentityService.extUri.isEqual(URI.revive(a.uri), URI.revive(b.uri));
	}
}
