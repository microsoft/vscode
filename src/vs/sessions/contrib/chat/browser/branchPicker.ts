/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IGitRepository, IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';

const COPILOT_WORKTREE_PATTERN = 'copilot-worktree-';
const FILTER_THRESHOLD = 10;

interface IBranchItem {
	readonly name: string;
}

/**
 * A self-contained widget for selecting a git branch.
 * Observes the active session from {@link ISessionsManagementService} to get
 * the current project, opens the git repository via {@link IGitService},
 * and loads branches automatically.
 *
 * Emits `onDidChange` with the selected branch name.
 */
export class BranchPicker extends Disposable {

	private _selectedBranch: string | undefined;
	private _preferredBranch: string | undefined;
	private _branches: string[] = [];
	private _repository: IGitRepository | undefined;

	private readonly _onDidChange = this._register(new Emitter<string | undefined>());
	readonly onDidChange: Event<string | undefined> = this._onDidChange.event;

	private readonly _onDidChangeLoading = this._register(new Emitter<boolean>());
	readonly onDidChangeLoading: Event<boolean> = this._onDidChangeLoading.event;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _loadCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	get selectedBranch(): string | undefined {
		return this._selectedBranch;
	}

	/**
	 * Sets a preferred branch to select when branches are loaded.
	 */
	setPreferredBranch(branch: string | undefined): void {
		this._preferredBranch = branch;
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IGitService private readonly gitService: IGitService,
	) {
		super();

		// Observe the active session's project and load branches when it changes
		this._register(autorun(reader => {
			const activeSession = this.sessionsManagementService.activeSession.read(reader);
			if (activeSession?.isUntitled) {
				// For new sessions, get the project from the new session object
				const project = (this.sessionsManagementService as any)._newSession?.value?.project;
				const repository = project?.repository;
				this._onRepositoryChanged(repository);
			} else {
				this._onRepositoryChanged(undefined);
			}
		}));
	}

	private async _onRepositoryChanged(repository: IGitRepository | undefined): Promise<void> {
		// Cancel any in-flight branch loading
		this._loadCts.value?.cancel();

		this._repository = repository;
		this._branches = [];
		this._selectedBranch = undefined;

		if (!repository) {
			this._onDidChange.fire(undefined);
			this._setLoading(false);
			this._updateTriggerLabel();
			this._updateVisibility();
			return;
		}

		this._setLoading(true);
		const cts = this._loadCts.value = new CancellationTokenSource();

		try {
			const refs = await repository.getRefs({ pattern: 'refs/heads' });
			if (cts.token.isCancellationRequested) {
				return;
			}

			this._branches = refs
				.map(ref => ref.name)
				.filter((name): name is string => !!name)
				.filter(name => !name.includes(COPILOT_WORKTREE_PATTERN));

			// Select preferred branch (from draft), active branch, main, master, or the first branch
			const preferred = this._preferredBranch;
			this._preferredBranch = undefined;
			const defaultBranch = (preferred ? this._branches.find(b => b === preferred) : undefined)
				?? this._branches.find(b => b === repository.state.get().HEAD?.name)
				?? this._branches.find(b => b === 'main')
				?? this._branches.find(b => b === 'master')
				?? this._branches[0];
			if (defaultBranch) {
				this._selectBranch(defaultBranch);
			}
		} finally {
			if (!cts.token.isCancellationRequested) {
				this._setLoading(false);
				this._updateTriggerLabel();
				this._updateVisibility();
			}
		}
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._slotElement = slot;
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;
		this._updateTriggerLabel();
		this._updateVisibility();

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
	}

	showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible || this._branches.length === 0) {
			return;
		}

		const items = this._buildItems();
		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IBranchItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				this._selectBranch(item.name);
			},
			onHide: () => { triggerElement.focus(); },
		};

		const totalActions = items.filter(i => i.kind === ActionListItemKind.Action).length;

		this.actionWidgetService.show<IBranchItem>(
			'branchPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('branchPicker.ariaLabel', "Branch Picker"),
			},
			totalActions > FILTER_THRESHOLD ? { showFilter: true, filterPlaceholder: localize('branchPicker.filter', "Filter branches...") } : undefined,
		);
	}

	private _buildItems(): IActionListItem<IBranchItem>[] {
		return this._branches.map(branch => ({
			kind: ActionListItemKind.Action,
			label: branch,
			group: { title: '', icon: Codicon.gitBranch },
			item: { name: branch },
		}));
	}

	private _selectBranch(branch: string): void {
		if (this._selectedBranch !== branch) {
			this._selectedBranch = branch;
			this._onDidChange.fire(branch);
			this._updateTriggerLabel();
		}
	}

	private _updateVisibility(): void {
		if (this._slotElement) {
			const shouldShow = !!this._repository && this._branches.length > 0;
			this._slotElement.style.display = shouldShow ? '' : 'none';
		}
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}
		dom.clearNode(this._triggerElement);
		const isDisabled = this._branches.length === 0;
		const label = this._selectedBranch ?? localize('branchPicker.select', "Branch");
		dom.append(this._triggerElement, renderIcon(Codicon.gitBranch));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
		this._slotElement?.classList.toggle('disabled', isDisabled);
	}

	private _setLoading(loading: boolean): void {
		this._onDidChangeLoading.fire(loading);
	}
}
