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
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { CopilotCLISession } from './copilotChatSessionsProvider.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';

const FILTER_THRESHOLD = 10;
const COPILOT_WORKTREE_PATTERN = 'copilot-worktree-';

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
	private _branches: string[] = [];
	private _loading = false;

	private readonly _onDidChange = this._register(new Emitter<string | undefined>());
	readonly onDidChange: Event<string | undefined> = this._onDidChange.event;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _loadCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		// Watch the active session — load branches when a CopilotCLISession finishes loading
		this._register(autorun(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			if (session instanceof CopilotCLISession) {
				const isLoading = session.loading.read(reader);
				if (!isLoading && session.gitRepository) {
					this._loadBranches(session);
				} else if (isLoading) {
					// Session is still loading — show disabled state
					this._loading = true;
					this._branches = [];
					this._updateTriggerLabel();
				} else {
					// No git repo
					this._clearBranches();
				}
			} else {
				this._clearBranches();
			}
		}));
	}

	private _loadBranches(session: CopilotCLISession): void {
		const repo = session.gitRepository;
		if (!repo) {
			this._clearBranches();
			return;
		}

		this._loadCts.value?.cancel();
		const cts = this._loadCts.value = new CancellationTokenSource();

		this._loading = true;
		this._updateTriggerLabel();

		repo.getRefs({ pattern: 'refs/heads' }, cts.token).then(refs => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			this._branches = refs
				.map(r => r.name)
				.filter((name): name is string => !!name)
				.filter(name => !name.includes(COPILOT_WORKTREE_PATTERN));
			this._loading = false;
			this._updateTriggerLabel();

			// Auto-select the best default branch
			const defaultBranch = this._branches.find(b => b === repo.state.get().HEAD?.name)
				?? this._branches.find(b => b === 'main')
				?? this._branches.find(b => b === 'master')
				?? this._branches[0];
			if (defaultBranch) {
				this._selectBranch(defaultBranch);
			}
		}).catch(() => {
			if (!cts.token.isCancellationRequested) {
				this._branches = [];
				this._loading = false;
				this._updateTriggerLabel();
			}
		});
	}

	private _clearBranches(): void {
		this._loadCts.value?.cancel();
		this._branches = [];
		this._selectedBranch = undefined;
		this._loading = false;
		this._updateTriggerLabel();
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
			item: { name: branch, checked: branch === this._selectedBranch || undefined },
		}));
	}

	private _selectBranch(branch: string): void {
		if (this._selectedBranch !== branch) {
			this._selectedBranch = branch;
			this._onDidChange.fire(branch);
			this._updateTriggerLabel();

			const session = this.sessionsManagementService.activeSession.get();
			if (!(session instanceof CopilotCLISession)) {
				throw new Error('BranchPicker requires a CopilotCLISession');
			}
			session.setBranch(branch);
		}
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}
		dom.clearNode(this._triggerElement);

		if (this._loading) {
			dom.append(this._triggerElement, renderIcon(Codicon.gitBranch));
			const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
			labelSpan.textContent = this._selectedBranch ?? localize('branchPicker.select', "Branch");
			dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
			this._slotElement?.classList.toggle('disabled', true);
			return;
		}

		const isDisabled = this._branches.length === 0;
		const label = this._selectedBranch ?? localize('branchPicker.select', "Branch");
		dom.append(this._triggerElement, renderIcon(Codicon.gitBranch));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
		this._slotElement?.classList.toggle('disabled', isDisabled);
	}
}
