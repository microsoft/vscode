/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { SessionWorkspace } from '../../sessions/common/sessionWorkspace.js';

// #region --- Types ---

export type SessionTargetType = 'copilot-cli' | 'cloud';
export type IsolationMode = 'worktree' | 'workspace';

// #endregion

// #region --- Target Picker ---

/**
 * A self-contained widget for selecting the session target type.
 *
 * Options:
 * - **Copilot CLI** (`cli`) — local agent session
 * - **Cloud** (`cloud`) — remote/cloud agent session
 *
 * The target is determined by the project type (folder → CLI, repo → Cloud).
 * Emits `onDidChange` with the selected `SessionTargetType` when the target changes.
 */
export class SessionTypePicker extends Disposable {

	private _sessionTarget: SessionTargetType = 'copilot-cli';
	private _project: SessionWorkspace | undefined;

	private readonly _onDidChange = this._register(new Emitter<SessionTargetType>());
	readonly onDidChange: Event<SessionTargetType> = this._onDidChange.event;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	get sessionTarget(): SessionTargetType {
		return this._sessionTarget;
	}

	get isCli(): boolean {
		return this._sessionTarget === 'copilot-cli';
	}

	get isCloud(): boolean {
		return this._sessionTarget === 'cloud';
	}

	constructor(
	) {
		super();
	}

	/**
	 * Sets the current project context. Determines the target type:
	 * - Repo project → cloud
	 * - Folder project → cli
	 * - No project → retains current target
	 */
	setProject(project: SessionWorkspace | undefined): void {
		this._project = project;
		this._updateTarget();
		this._updateTriggerLabel();
	}

	private _updateTarget(): void {
		if (this._project?.isRepo) {
			this._setTarget('cloud');
			return;
		}

		if (this._project?.isFolder) {
			this._setTarget('copilot-cli');
			return;
		}
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._slotElement = slot;
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = -1;
		trigger.role = 'button';
		trigger.setAttribute('aria-disabled', 'true');
		this._triggerElement = trigger;
		this._updateTriggerLabel();
	}

	private _setTarget(target: SessionTargetType): void {
		if (this._sessionTarget !== target) {
			this._sessionTarget = target;
			this._updateTriggerLabel();
			this._onDidChange.fire(target);
		}
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);

		let modeIcon;
		let modeLabel: string;

		switch (this._sessionTarget) {
			case 'cloud':
				modeIcon = Codicon.cloud;
				modeLabel = localize('sessionTarget.cloud', "Cloud");
				break;
			case 'copilot-cli':
			default:
				modeIcon = Codicon.worktree;
				modeLabel = localize('sessionTarget.cli', "Copilot CLI");
				break;
		}

		dom.append(this._triggerElement, renderIcon(modeIcon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = modeLabel;

		this._slotElement?.classList.toggle('disabled', true);
	}
}

// #endregion

// #region --- Isolation Picker ---

/**
 * A self-contained widget for selecting the isolation mode.
 *
 * Options:
 * - **Worktree** (`worktree`) — run in a git worktree
 * - **Folder** (`workspace`) — run directly in the folder
 *
 * Only visible when isolation option is enabled, project has a git repo,
 * and the target is CLI.
 *
 * Emits `onDidChange` with the selected `IsolationMode` when the user picks an option.
 */
export class IsolationPicker extends Disposable {

	private _isolationMode: IsolationMode = 'worktree';
	private _hasGitRepo = false;
	private _visible = true;
	private _isolationOptionEnabled: boolean;

	private readonly _onDidChange = this._register(new Emitter<IsolationMode>());
	readonly onDidChange: Event<IsolationMode> = this._onDidChange.event;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	get isolationMode(): IsolationMode {
		return this._isolationMode;
	}

	get isWorktree(): boolean {
		return this._isolationMode === 'worktree';
	}

	get isFolder(): boolean {
		return this._isolationMode === 'workspace';
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._isolationOptionEnabled = this.configurationService.getValue<boolean>('github.copilot.chat.cli.isolationOption.enabled') !== false;

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('github.copilot.chat.cli.isolationOption.enabled')) {
				this._isolationOptionEnabled = this.configurationService.getValue<boolean>('github.copilot.chat.cli.isolationOption.enabled') !== false;
				if (!this._isolationOptionEnabled) {
					// Reset to worktree when isolation option is disabled
					this._setMode('worktree');
				}
				this._updateVisibility();
				this._updateTriggerLabel();
			}
		}));
	}

	/**
	 * Sets whether the project has a git repository.
	 * Resets isolation mode to the appropriate default.
	 */
	setHasGitRepo(hasRepo: boolean): void {
		this._hasGitRepo = hasRepo;
		if (!hasRepo) {
			this._setMode('workspace');
		} else {
			this._setMode('worktree');
		}
		this._updateVisibility();
		this._updateTriggerLabel();
	}

	/**
	 * Sets external visibility (e.g. hidden when target is Cloud).
	 */
	setVisible(visible: boolean): void {
		this._visible = visible;
		this._updateVisibility();
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
			this._showPicker();
		}));

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));
	}

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		if (!this._hasGitRepo || !this._isolationOptionEnabled) {
			return;
		}

		const items: IActionListItem<IsolationMode>[] = [
			{
				kind: ActionListItemKind.Action,
				label: localize('isolationMode.worktree', "Worktree"),
				group: { title: '', icon: Codicon.worktree },
				item: 'worktree',
			},
			{
				kind: ActionListItemKind.Action,
				label: localize('isolationMode.folder', "Folder"),
				group: { title: '', icon: Codicon.folder },
				item: 'workspace',
			},
		];

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IsolationMode> = {
			onSelect: (mode) => {
				this.actionWidgetService.hide();
				this._setMode(mode);
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<IsolationMode>(
			'isolationPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('isolationPicker.ariaLabel', "Isolation Mode"),
			},
		);
	}

	private _setMode(mode: IsolationMode): void {
		if (this._isolationMode !== mode) {
			this._isolationMode = mode;
			this._updateTriggerLabel();
			this._onDidChange.fire(mode);
		}
	}

	private _updateVisibility(): void {
		if (!this._slotElement) {
			return;
		}
		const shouldShow = this._visible && this._hasGitRepo && this._isolationOptionEnabled;
		this._slotElement.style.display = shouldShow ? '' : 'none';
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);

		let modeIcon;
		let modeLabel: string;

		switch (this._isolationMode) {
			case 'workspace':
				modeIcon = Codicon.folder;
				modeLabel = localize('isolationMode.folder', "Folder");
				break;
			case 'worktree':
			default:
				modeIcon = Codicon.worktree;
				modeLabel = localize('isolationMode.worktree', "Worktree");
				break;
		}

		dom.append(this._triggerElement, renderIcon(modeIcon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = modeLabel;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
	}
}

// #endregion
