/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/worktreeSwitcher.css';
import * as DOM from '../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IAction } from '../../../../base/common/actions.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IWorktreeGroupService } from '../../../services/worktrees/common/worktrees.js';

const $ = DOM.$;

/**
 * Renders the active worktree as a clickable pill in the titlebar:
 * `[repo-icon] <worktree-name>  /  [git-branch] <branch-name>`. Click runs
 * the wrapped action (typically `workbench.action.worktrees.switch`), which
 * opens the worktree quick pick.
 */
export class WorktreeSwitcherViewItem extends BaseActionViewItem {

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		@IWorktreeGroupService private readonly worktreeGroupService: IWorktreeGroupService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('worktree-switcher-host');

		const root = DOM.append(container, $('.worktree-switcher'));
		root.role = 'button';
		root.tabIndex = 0;

		const worktreeIcon = DOM.append(root, $('span.icon'));
		const worktreeLabel = DOM.append(root, $('span.worktree-name'));
		const separator = DOM.append(root, $('span.separator'));
		separator.textContent = '/';
		const branchIcon = DOM.append(root, $('span.icon.branch'));
		const branchLabel = DOM.append(root, $('span.branch-name'));

		const hoverDelegate = this.options.hoverDelegate ?? getDefaultHoverDelegate('mouse');
		const hover = this._register(this.hoverService.setupManagedHover(hoverDelegate, root, ''));

		this._register(autorun(reader => {
			const active = this.worktreeGroupService.activeWorktree.read(reader);
			if (!active) {
				root.classList.add('empty');
				worktreeIcon.className = `icon ${ThemeIcon.asClassName(Codicon.listTree)}`;
				worktreeLabel.textContent = localize('worktrees.switcher.none', "Worktrees");
				separator.style.display = 'none';
				branchIcon.style.display = 'none';
				branchLabel.textContent = '';
				const tooltip = localize('worktrees.switcher.tooltip.none', "Switch Worktree...");
				hover.update(tooltip);
				root.setAttribute('aria-label', tooltip);
				return;
			}

			root.classList.remove('empty');
			// Main worktree → repo icon; linked → list-tree (matches SCM's worktree picker).
			worktreeIcon.className = `icon ${ThemeIcon.asClassName(active.isMain ? Codicon.repo : Codicon.listTree)}`;
			const activeLabel = active.label.read(reader);
			worktreeLabel.textContent = activeLabel;

			const branch = active.branch.read(reader);
			let tooltip: string;
			if (branch) {
				separator.style.display = '';
				branchIcon.style.display = '';
				branchIcon.className = `icon branch ${ThemeIcon.asClassName(Codicon.gitBranch)}`;
				branchLabel.textContent = branch;
				tooltip = localize('worktrees.switcher.tooltip', "{0} ({1}) — Click to switch worktree", activeLabel, branch);
			} else {
				separator.style.display = 'none';
				branchIcon.style.display = 'none';
				branchLabel.textContent = '';
				tooltip = localize('worktrees.switcher.tooltip.nobranch', "{0} — Click to switch worktree", activeLabel);
			}
			hover.update(tooltip);
			root.setAttribute('aria-label', tooltip);
		}));

		this._register(DOM.addDisposableListener(root, DOM.EventType.CLICK, e => {
			DOM.EventHelper.stop(e, true);
			this.actionRunner.run(this._action);
		}));
		this._register(DOM.addDisposableListener(root, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				DOM.EventHelper.stop(e, true);
				this.actionRunner.run(this._action);
			}
		}));
	}
}
