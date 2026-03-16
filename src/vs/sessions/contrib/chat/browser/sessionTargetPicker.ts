/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Radio } from '../../../../base/browser/ui/radio/radio.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IGitRepository } from '../../../../workbench/contrib/git/common/gitService.js';

// #region --- Session Target Picker ---

/**
 * A self-contained widget for selecting the session target (Local vs Cloud).
 * Encapsulates state, events, and rendering. Can be placed anywhere in the view.
 */
export class SessionTargetPicker extends Disposable {

	private _selectedTarget: AgentSessionProviders;
	private _allowedTargets: AgentSessionProviders[];

	private readonly _onDidChangeTarget = this._register(new Emitter<AgentSessionProviders>());
	readonly onDidChangeTarget: Event<AgentSessionProviders> = this._onDidChangeTarget.event;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _container: HTMLElement | undefined;

	get selectedTarget(): AgentSessionProviders {
		return this._selectedTarget;
	}

	constructor(
		allowedTargets: AgentSessionProviders[],
		defaultTarget: AgentSessionProviders,
	) {
		super();
		this._allowedTargets = allowedTargets;
		this._selectedTarget = allowedTargets.includes(defaultTarget)
			? defaultTarget
			: allowedTargets[0];
	}

	/**
	 * Renders the target radio (Local / Cloud) into the given container.
	 */
	render(container: HTMLElement): void {
		this._container = container;
		this._renderRadio();
	}

	updateAllowedTargets(targets: AgentSessionProviders[]): void {
		if (targets.length === 0) {
			return;
		}
		this._allowedTargets = targets;
		if (!targets.includes(this._selectedTarget)) {
			this._selectedTarget = targets[0];
			this._onDidChangeTarget.fire(this._selectedTarget);
		}
		if (this._container) {
			this._renderRadio();
		}
	}

	private _renderRadio(): void {
		if (!this._container) {
			return;
		}

		this._renderDisposables.clear();
		dom.clearNode(this._container);

		if (this._allowedTargets.length === 0) {
			return;
		}

		const targets = [AgentSessionProviders.Background, AgentSessionProviders.Cloud].filter(t => this._allowedTargets.includes(t));
		const activeIndex = targets.indexOf(this._selectedTarget);

		const radio = new Radio({
			items: targets.map(target => ({
				text: getTargetLabel(target),
				isActive: target === this._selectedTarget,
			})),
		});
		this._renderDisposables.add(radio);
		this._container.appendChild(radio.domNode);

		if (activeIndex >= 0) {
			radio.setActiveItem(activeIndex);
		}

		this._renderDisposables.add(radio.onDidSelect(index => {
			const target = targets[index];
			if (this._selectedTarget !== target) {
				this._selectedTarget = target;
				this._onDidChangeTarget.fire(target);
			}
		}));
	}
}

function getTargetLabel(provider: AgentSessionProviders): string {
	switch (provider) {
		case AgentSessionProviders.Local:
		case AgentSessionProviders.Background:
			return localize('chat.session.providerLabel.local', "Local");
		case AgentSessionProviders.Cloud:
			return localize('chat.session.providerLabel.cloud', "Cloud");
		case AgentSessionProviders.Claude:
			return 'Claude';
		case AgentSessionProviders.Codex:
			return 'Codex';
		case AgentSessionProviders.Growth:
			return 'Growth';
	}
}

// #endregion

// #region --- Target Picker ---

export type IsolationMode = 'worktree' | 'workspace';

export type TargetMode = 'worktree' | 'workspace' | 'cloud';

/**
 * A self-contained widget for selecting the session target mode.
 *
 * Options:
 * - **Worktree** (`worktree`) — always shown
 * - **Folder** (`workspace`) — shown only when isolation option is enabled
 * - **Cloud** (`cloud`) — shown and auto-selected when a repository is picked; disabled
 *
 * Emits `onDidChange` with the underlying `IsolationMode` (`'worktree' | 'workspace'`)
 * when the user selects a local option. Cloud mode is informational only.
 */
export class TargetPicker extends Disposable {

	private _targetMode: TargetMode = 'worktree';
	private _preferredLocalMode: IsolationMode | undefined;
	private _repository: IGitRepository | undefined;
	private _isolationOptionEnabled: boolean = true;

	private readonly _onDidChange = this._register(new Emitter<IsolationMode>());
	readonly onDidChange: Event<IsolationMode> = this._onDidChange.event;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	get isolationMode(): IsolationMode {
		if (this._targetMode === 'cloud') {
			return 'worktree';
		}
		return this._targetMode;
	}

	get isCloud(): boolean {
		return this._targetMode === 'cloud';
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._isolationOptionEnabled = this.configurationService.getValue<boolean>('github.copilot.chat.cli.isolationOption.enabled') === true;

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('github.copilot.chat.cli.isolationOption.enabled')) {
				this._isolationOptionEnabled = this.configurationService.getValue<boolean>('github.copilot.chat.cli.isolationOption.enabled') === true;
				if (!this._isolationOptionEnabled && this._targetMode === 'workspace') {
					this._setMode('worktree');
				}
				this._updateTriggerLabel();
			}
		}));
	}

	/**
	 * Sets the git repository. When undefined and in worktree mode,
	 * the picker becomes disabled.
	 */
	setRepository(repository: IGitRepository | undefined): void {
		this._repository = repository;
		if (repository && this._targetMode !== 'cloud') {
			const preferred = this._preferredLocalMode;
			this._preferredLocalMode = undefined;
			this._setMode(preferred ?? this._targetMode);
		} else if (!repository && this._targetMode === 'worktree') {
			this._preferredLocalMode ??= 'worktree';
			this._setMode('workspace');
		}
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
			this._showPicker();
		}));

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));
	}

	setPreferredIsolationMode(mode: IsolationMode): void {
		this._preferredLocalMode = mode;
	}

	setIsolationMode(mode: IsolationMode): void {
		if (this._targetMode !== 'cloud') {
			this._setMode(mode);
		}
	}

	/**
	 * Sets cloud mode. When true, the picker shows "Cloud" and is disabled.
	 * When false, reverts to the last local mode.
	 */
	setCloudMode(cloud: boolean): void {
		if (cloud) {
			if (this._targetMode !== 'cloud') {
				this._preferredLocalMode = this._targetMode as IsolationMode;
			}
			this._targetMode = 'cloud';
		} else if (this._targetMode === 'cloud') {
			this._targetMode = this._preferredLocalMode ?? 'worktree';
			this._preferredLocalMode = undefined;
		}
		this._updateTriggerLabel();
	}

	setVisible(visible: boolean): void {
		if (this._slotElement) {
			this._slotElement.style.display = visible ? '' : 'none';
		}
	}

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible || this._targetMode === 'cloud') {
			return;
		}

		const items: IActionListItem<TargetMode>[] = [
			{
				kind: ActionListItemKind.Action,
				label: localize('targetMode.worktree', "Worktree"),
				group: { title: '', icon: Codicon.worktree },
				item: 'worktree',
			},
		];

		if (this._isolationOptionEnabled) {
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('targetMode.folder', "Folder"),
				group: { title: '', icon: Codicon.folder },
				item: 'workspace',
			});
		}

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<TargetMode> = {
			onSelect: (mode) => {
				this.actionWidgetService.hide();
				this._setMode(mode);
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<TargetMode>(
			'targetPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('targetPicker.ariaLabel', "Target"),
			},
		);
	}

	private _setMode(mode: TargetMode): void {
		if (this._targetMode !== mode) {
			this._targetMode = mode;
			this._updateTriggerLabel();
			if (mode !== 'cloud') {
				this._onDidChange.fire(mode);
			}
		}
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);

		let modeIcon;
		let modeLabel: string;
		let isDisabled: boolean;

		switch (this._targetMode) {
			case 'cloud':
				modeIcon = Codicon.cloud;
				modeLabel = localize('targetMode.cloud', "Cloud");
				isDisabled = true;
				break;
			case 'workspace':
				modeIcon = Codicon.folder;
				modeLabel = localize('targetMode.folder', "Folder");
				isDisabled = !this._repository;
				break;
			case 'worktree':
			default:
				modeIcon = Codicon.worktree;
				modeLabel = localize('targetMode.worktree', "Worktree");
				isDisabled = !this._repository;
				break;
		}

		dom.append(this._triggerElement, renderIcon(modeIcon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = modeLabel;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

		this._slotElement?.classList.toggle('disabled', isDisabled);
		if (this._triggerElement) {
			this._triggerElement.tabIndex = isDisabled ? -1 : 0;
			this._triggerElement.setAttribute('aria-disabled', String(isDisabled));
		}
	}
}

// #endregion
