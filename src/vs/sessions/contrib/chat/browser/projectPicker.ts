/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';

const OPEN_REPO_COMMAND = 'github.copilot.chat.cloudSessions.openRepository';
const STORAGE_KEY_LAST_PROJECT = 'agentSessions.lastPickedProject';
const STORAGE_KEY_RECENT_PROJECTS = 'agentSessions.recentlyPickedProjects';
const MAX_RECENT_PROJECTS = 10;
const FILTER_THRESHOLD = 10;

export type ProjectSelectionKind = 'folder' | 'repo';

export interface IProjectSelection {
	readonly kind: ProjectSelectionKind;
	/** For folders: the folder URI. For repos: a URI constructed from the repo id. */
	readonly uri: URI;
	/** Display label (folder basename or repo name). */
	readonly label: string;
	/** For repos: the repo id string (e.g. "owner/repo"). */
	readonly repoId?: string;
}

/**
 * Serializable form of a project entry for storage.
 */
interface IStoredProject {
	readonly kind: ProjectSelectionKind;
	readonly uri: string;
	readonly label: string;
	readonly repoId?: string;
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
export class ProjectPicker extends Disposable {

	private readonly _onDidSelectProject = this._register(new Emitter<IProjectSelection>());
	readonly onDidSelectProject: Event<IProjectSelection> = this._onDidSelectProject.event;

	private _selectedProject: IProjectSelection | undefined;
	private _recentProjects: IStoredProject[] = [];

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	get selectedProject(): IProjectSelection | undefined {
		return this._selectedProject;
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		// Restore last picked project
		try {
			const last = this.storageService.get(STORAGE_KEY_LAST_PROJECT, StorageScope.PROFILE);
			if (last) {
				const stored: IStoredProject = JSON.parse(last);
				this._selectedProject = this._fromStored(stored);
			}
		} catch { /* ignore */ }

		// Restore recently picked projects
		try {
			const stored = this.storageService.get(STORAGE_KEY_RECENT_PROJECTS, StorageScope.PROFILE);
			if (stored) {
				this._recentProjects = JSON.parse(stored);
			}
		} catch { /* ignore */ }
	}

	/**
	 * Renders the project picker trigger button into the given container.
	 * Returns the container element.
	 */
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		// Label
		const label = dom.append(slot, dom.$('span.sessions-chat-picker-label'));
		label.textContent = localize('pickProject.label', "Pick a Project");

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
				if (item.kind === 'folder' && item.uri === 'command:browseFolders') {
					this._browseForFolder();
				} else if (item.kind === 'repo' && item.uri === 'command:browseRepos') {
					this._browseForRepo();
				} else {
					this._selectProject(this._fromStored(item));
				}
			},
			onHide: () => { triggerElement.focus(); },
		};

		const listOptions = showFilter ? { showFilter: true, filterPlaceholder: localize('projectPicker.filter', "Filter projects...") } : undefined;

		this.actionWidgetService.show<IStoredProject>(
			'projectPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('projectPicker.ariaLabel', "Project Picker"),
			},
			listOptions,
		);
	}

	/**
	 * Programmatically set the selected project from a folder URI.
	 */
	setSelectedFolder(folderUri: URI): void {
		this._selectProject({
			kind: 'folder',
			uri: folderUri,
			label: basename(folderUri),
		});
	}

	/**
	 * Programmatically set the selected project from a repository id.
	 */
	setSelectedRepo(repoId: string): void {
		this._selectProject({
			kind: 'repo',
			uri: URI.from({ scheme: 'github-remote-file', authority: 'github', path: `/${repoId}/HEAD` }),
			label: repoId,
			repoId,
		});
	}

	/**
	 * Clears the selected project.
	 */
	clearSelection(): void {
		this._selectedProject = undefined;
		this._updateTriggerLabel();
	}

	/**
	 * Removes a folder from the recently picked list.
	 */
	removeFromRecents(folderUri: URI): void {
		this._recentProjects = this._recentProjects.filter(p => !(p.kind === 'folder' && p.uri === folderUri.toString()));
		this._persistRecents();
		if (this._selectedProject?.kind === 'folder' && isEqual(this._selectedProject.uri, folderUri)) {
			this._selectedProject = undefined;
			this.storageService.remove(STORAGE_KEY_LAST_PROJECT, StorageScope.PROFILE);
			this._updateTriggerLabel();
		}
	}

	private _selectProject(project: IProjectSelection): void {
		this._selectedProject = project;
		const stored = this._toStored(project);
		this._addToRecents(stored);
		this.storageService.store(STORAGE_KEY_LAST_PROJECT, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
		this._updateTriggerLabel();
		this._onDidSelectProject.fire(project);
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
				this._selectProject({
					kind: 'folder',
					uri: selected[0],
					label: basename(selected[0]),
				});
			}
		} catch {
			// dialog was cancelled or failed
		}
	}

	private async _browseForRepo(): Promise<void> {
		try {
			const result: string | undefined = await this.commandService.executeCommand(OPEN_REPO_COMMAND);
			if (result) {
				this._selectProject({
					kind: 'repo',
					uri: URI.from({ scheme: 'github-remote-file', authority: 'github', path: `/${result}/HEAD` }),
					label: result,
					repoId: result,
				});
			}
		} catch {
			// command was cancelled or failed
		}
	}

	private _addToRecents(stored: IStoredProject): void {
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
		const seen = new Set<string>();
		const items: IActionListItem<IStoredProject>[] = [];

		// Current selection first
		if (this._selectedProject) {
			const stored = this._toStored(this._selectedProject);
			const key = this._projectKey(stored);
			seen.add(key);
			items.push({
				kind: ActionListItemKind.Action,
				label: stored.label,
				group: { title: '', icon: stored.kind === 'folder' ? Codicon.folder : Codicon.repo },
				item: stored,
			});
		}

		// Recently picked projects (deduped, preserving order)
		for (const project of this._recentProjects) {
			const key = this._projectKey(project);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			items.push({
				kind: ActionListItemKind.Action,
				label: project.label,
				group: { title: '', icon: project.kind === 'folder' ? Codicon.folder : Codicon.repo },
				item: project,
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
			item: { kind: 'folder', uri: 'command:browseFolders', label: localize('browseFolders', "Browse Folders...") },
		});
		items.push({
			kind: ActionListItemKind.Action,
			label: localize('browseRepositories', "Browse Repositories..."),
			group: { title: '', icon: Codicon.repo },
			item: { kind: 'repo', uri: 'command:browseRepos', label: localize('browseRepositories', "Browse Repositories...") },
		});

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
		const label = project?.label ?? localize('pickProject', "Pick a Project");
		const icon = project ? (project.kind === 'folder' ? Codicon.folder : Codicon.repo) : Codicon.project;

		dom.append(this._triggerElement, renderIcon(icon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
	}

	private _toStored(project: IProjectSelection): IStoredProject {
		return {
			kind: project.kind,
			uri: project.uri.toString(),
			label: project.label,
			repoId: project.repoId,
		};
	}

	private _fromStored(stored: IStoredProject): IProjectSelection {
		return {
			kind: stored.kind,
			uri: URI.parse(stored.uri),
			label: stored.label,
			repoId: stored.repoId,
		};
	}

	private _projectKey(project: IStoredProject): string {
		return `${project.kind}:${project.uri}`;
	}

	private _isSameProject(a: IStoredProject, b: IStoredProject): boolean {
		return a.kind === b.kind && a.uri === b.uri;
	}
}
