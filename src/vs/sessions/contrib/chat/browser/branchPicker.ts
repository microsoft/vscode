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
import { IGitRepository } from '../../../../workbench/contrib/git/common/gitService.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { INewSession } from './newSession.js';

const COPILOT_WORKTREE_PATTERN = 'copilot-worktree-';
const FILTER_THRESHOLD = 10;

interface IBranchItem {
	readonly name: string;
}

/**
 * A self-contained widget for selecting a git branch.
 * Uses `IGitRepository.getRefs` to list local branches.
 * Copilot worktree branches are shown in a collapsible section;
 * other branches are listed without a section header.
 * Writes the selected branch to the new session object.
 */
export class BranchPicker extends Disposable {

	private _selectedBranch: string | undefined;
	private _newSession: INewSession | undefined;
	private _branches: string[] = [];

	private readonly _onDidChange = this._register(new Emitter<string | undefined>());
	readonly onDidChange: Event<string | undefined> = this._onDidChange.event;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	get selectedBranch(): string | undefined {
		return this._selectedBranch;
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
	) {
		super();
	}

	/**
	 * Sets the new session that this picker writes to.
	 */
	setNewSession(session: INewSession | undefined): void {
		this._newSession = session;
	}

	/**
	 * Sets the git repository and loads its branches.
	 * When undefined, the picker is shown disabled.
	 */
	async setRepository(repository: IGitRepository | undefined): Promise<void> {
		this._branches = [];
		this._selectedBranch = undefined;

		if (!repository) {
			this._newSession?.setBranch(undefined);
			this._updateTriggerLabel();
			return;
		}

		const refs = await repository.getRefs({ pattern: 'refs/heads' });
		this._branches = refs
			.map(ref => ref.name)
			.filter((name): name is string => !!name)
			.filter(name => !name.includes(COPILOT_WORKTREE_PATTERN));

		// Select active branch, main, master, or the first branch by default
		const defaultBranch = this._branches.find(b => b === repository.state.get().HEAD?.name)
			?? this._branches.find(b => b === 'main')
			?? this._branches.find(b => b === 'master')
			?? this._branches[0];
		if (defaultBranch) {
			this._selectBranch(defaultBranch);
		}

		this._updateTriggerLabel();
	}

	/**
	 * Renders the branch picker trigger into the given container.
	 */
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

	/**
	 * Shows or hides the picker.
	 */
	setVisible(visible: boolean): void {
		if (this._slotElement) {
			this._slotElement.style.display = visible ? '' : 'none';
		}
	}

	/**
	 * Shows the branch picker dropdown anchored to the trigger element.
	 */
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
			group: { title: '', icon: this._selectedBranch === branch ? Codicon.check : Codicon.blank },
			item: { name: branch },
		}));
	}

	private _selectBranch(branch: string): void {
		if (this._selectedBranch !== branch) {
			this._selectedBranch = branch;
			this._newSession?.setBranch(branch);
			this._onDidChange.fire(branch);
			this._updateTriggerLabel();
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
}
