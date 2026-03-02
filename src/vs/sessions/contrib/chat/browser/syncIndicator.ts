/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IGitRepository } from '../../../../workbench/contrib/git/common/gitService.js';

const GIT_SYNC_COMMAND = 'git.sync';

/**
 * Renders a compact "Synchronize Changes" button next to the branch picker.
 * Shows ahead/behind counts (e.g. "3↓ 2↑") and is only visible when
 * the selected branch matches the repository HEAD and has changes to sync.
 */
export class SyncIndicator extends Disposable {

	private _repository: IGitRepository | undefined;
	private _selectedBranch: string | undefined;
	private _visible = true;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _stateDisposables = this._register(new DisposableStore());

	private _slotElement: HTMLElement | undefined;
	private _buttonElement: HTMLElement | undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
	}

	/**
	 * Sets the git repository. Subscribes to its state observable to react to
	 * ahead/behind changes.
	 */
	setRepository(repository: IGitRepository | undefined): void {
		this._stateDisposables.clear();
		this._repository = repository;

		if (repository) {
			this._stateDisposables.add(autorun(reader => {
				repository.state.read(reader);
				this._update();
			}));
		} else {
			this._update();
		}
	}

	/**
	 * Sets the currently selected branch name (from the branch picker).
	 * The sync indicator is only shown when the selected branch is the HEAD branch.
	 */
	setBranch(branch: string | undefined): void {
		this._selectedBranch = branch;
		this._update();
	}

	/**
	 * Renders the sync indicator button into the given container.
	 */
	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-sync-indicator'));
		this._slotElement = slot;
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const button = dom.append(slot, dom.$('a.action-label'));
		button.tabIndex = 0;
		button.role = 'button';
		this._buttonElement = button;

		this._renderDisposables.add(dom.addDisposableListener(button, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this.commandService.executeCommand(GIT_SYNC_COMMAND, this._repository?.rootUri);
		}));

		this._renderDisposables.add(dom.addDisposableListener(button, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this.commandService.executeCommand(GIT_SYNC_COMMAND, this._repository?.rootUri);
			}
		}));

		this._update();
	}

	/**
	 * Shows or hides the sync indicator slot.
	 */
	setVisible(visible: boolean): void {
		this._visible = visible;
		this._update();
	}

	private _getAheadBehind(): { ahead: number; behind: number } | undefined {
		if (!this._repository) {
			return undefined;
		}

		const head = this._repository.state.get().HEAD;
		if (!head?.upstream) {
			return undefined;
		}

		// Only show sync for the HEAD branch (i.e. the selected branch must match the actual HEAD)
		if (head.name !== this._selectedBranch) {
			return undefined;
		}

		const ahead = head.ahead ?? 0;
		const behind = head.behind ?? 0;
		if (ahead === 0 && behind === 0) {
			return undefined;
		}

		return { ahead, behind };
	}

	private _update(): void {
		if (!this._slotElement || !this._buttonElement) {
			return;
		}

		const counts = this._getAheadBehind();
		if (!counts || !this._visible) {
			this._slotElement.style.display = 'none';
			return;
		}

		this._slotElement.style.display = '';

		dom.clearNode(this._buttonElement);
		dom.append(this._buttonElement, renderIcon(Codicon.sync));

		const parts: string[] = [];
		if (counts.behind > 0) {
			parts.push(`${counts.behind}↓`);
		}
		if (counts.ahead > 0) {
			parts.push(`${counts.ahead}↑`);
		}

		const label = dom.append(this._buttonElement, dom.$('span.sessions-chat-dropdown-label'));
		label.textContent = parts.join('\u00a0');

		this._buttonElement.title = localize(
			'syncIndicator.tooltip',
			"Synchronize Changes ({0} to pull, {1} to push)",
			counts.behind,
			counts.ahead,
		);
	}
}
