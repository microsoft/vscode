/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INewSession } from './newSession.js';

const OPEN_REPO_COMMAND = 'github.copilot.chat.cloudSessions.openRepository';
const STORAGE_KEY_LAST_REPO = 'agentSessions.lastPickedRepo';
const STORAGE_KEY_RECENT_REPOS = 'agentSessions.recentlyPickedRepos';
const MAX_RECENT_REPOS = 10;
const FILTER_THRESHOLD = 10;

interface IRepoItem {
	readonly id: string;
	readonly name: string;
}

/**
 * A self-contained widget for selecting the repository in cloud sessions.
 * Uses the `github.copilot.chat.cloudSessions.openRepository` command for
 * browsing repositories. Manages recently used repos in storage.
 * Behaves like FolderPicker: trigger button with dropdown, storage persistence,
 * recently used list with remove buttons.
 */
export class RepoPicker extends Disposable {

	private readonly _onDidSelectRepo = this._register(new Emitter<string>());
	readonly onDidSelectRepo: Event<string> = this._onDidSelectRepo.event;

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());
	private _browseGeneration = 0;

	private _newSession: INewSession | undefined;
	private _selectedRepo: IRepoItem | undefined;
	private _recentlyPickedRepos: IRepoItem[] = [];

	get selectedRepo(): string | undefined {
		return this._selectedRepo?.id;
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		// Restore last picked repo
		try {
			const last = this.storageService.get(STORAGE_KEY_LAST_REPO, StorageScope.PROFILE);
			if (last) {
				this._selectedRepo = JSON.parse(last);
			}
		} catch { /* ignore */ }

		// Restore recently picked repos
		try {
			const stored = this.storageService.get(STORAGE_KEY_RECENT_REPOS, StorageScope.PROFILE);
			if (stored) {
				this._recentlyPickedRepos = JSON.parse(stored);
			}
		} catch { /* ignore */ }
	}

	/**
	 * Sets the pending session that this picker writes to.
	 * If a repository is already selected, notifies the session.
	 */
	setNewSession(session: INewSession | undefined): void {
		this._newSession = session;
		this._browseGeneration++;
		if (session && this._selectedRepo) {
			session.setOption('repositories', this._selectedRepo);
		}
	}

	/**
	 * Renders the repo picker trigger button into the given container.
	 * Returns the container element.
	 */
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
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
	 * Shows the repo picker dropdown anchored to the trigger element.
	 */
	showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const items = this._buildItems();
		const showFilter = items.filter(i => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IRepoItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				if (item.id === 'browse') {
					this._browseForRepo();
				} else {
					this._selectRepo(item);
				}
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<IRepoItem>(
			'repoPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('repoPicker.ariaLabel', "Repository Picker"),
			},
			showFilter ? { showFilter: true, filterPlaceholder: localize('repoPicker.filter', "Filter repositories...") } : undefined,
		);
	}

	/**
	 * Programmatically set the selected repository.
	 */
	setSelectedRepo(repoPath: string): void {
		this._selectRepo({ id: repoPath, name: repoPath });
	}

	/**
	 * Clears the selected repository.
	 */
	clearSelection(): void {
		this._selectedRepo = undefined;
		this._updateTriggerLabel();
	}

	private _selectRepo(item: IRepoItem): void {
		this._selectedRepo = item;
		this._addToRecentlyPicked(item);
		this.storageService.store(STORAGE_KEY_LAST_REPO, JSON.stringify(item), StorageScope.PROFILE, StorageTarget.MACHINE);
		this._updateTriggerLabel();
		this._newSession?.setOption('repositories', item);
		this._onDidSelectRepo.fire(item.id);
	}

	private async _browseForRepo(): Promise<void> {
		const generation = this._browseGeneration;
		try {
			const result: string | undefined = await this.commandService.executeCommand(OPEN_REPO_COMMAND);
			if (result && generation === this._browseGeneration) {
				this._selectRepo({ id: result, name: result });
			}
		} catch {
			// command was cancelled or failed — nothing to do
		}
	}

	private _addToRecentlyPicked(item: IRepoItem): void {
		this._recentlyPickedRepos = [
			{ id: item.id, name: item.name },
			...this._recentlyPickedRepos.filter(r => r.id !== item.id),
		].slice(0, MAX_RECENT_REPOS);
		this.storageService.store(STORAGE_KEY_RECENT_REPOS, JSON.stringify(this._recentlyPickedRepos), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _buildItems(): IActionListItem<IRepoItem>[] {
		const seenIds = new Set<string>();
		const items: IActionListItem<IRepoItem>[] = [];

		// Currently selected (shown first, checked)
		if (this._selectedRepo) {
			seenIds.add(this._selectedRepo.id);
			items.push({
				kind: ActionListItemKind.Action,
				label: this._selectedRepo.name,
				group: { title: '', icon: Codicon.repo },
				item: this._selectedRepo,
			});
		}

		// Recently picked repos (sorted by name)
		const dedupedRepos = this._recentlyPickedRepos.filter(r => !seenIds.has(r.id));
		dedupedRepos.sort((a, b) => a.name.localeCompare(b.name));
		for (const repo of dedupedRepos) {
			seenIds.add(repo.id);
			items.push({
				kind: ActionListItemKind.Action,
				label: repo.name,
				group: { title: '', icon: Codicon.repo },
				item: repo,
				onRemove: () => this._removeRepo(repo.id),
			});
		}

		// Separator + Browse...
		if (items.length > 0) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
		}
		items.push({
			kind: ActionListItemKind.Action,
			label: localize('browseRepo', "Browse..."),
			group: { title: '', icon: Codicon.search },
			item: { id: 'browse', name: localize('browseRepo', "Browse...") },
		});

		return items;
	}

	private _removeRepo(repoId: string): void {
		this._recentlyPickedRepos = this._recentlyPickedRepos.filter(r => r.id !== repoId);
		this.storageService.store(STORAGE_KEY_RECENT_REPOS, JSON.stringify(this._recentlyPickedRepos), StorageScope.PROFILE, StorageTarget.MACHINE);

		// Re-show picker with updated items
		this.actionWidgetService.hide();
		this.showPicker();
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);
		const label = this._selectedRepo?.name ?? localize('pickRepo', "Pick Repository");

		dom.append(this._triggerElement, renderIcon(Codicon.repo));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
	}
}
