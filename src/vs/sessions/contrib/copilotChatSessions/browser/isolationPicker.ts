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
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { CopilotCLISession } from './copilotChatSessionsProvider.js';

export type IsolationMode = 'worktree' | 'workspace';

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

	private _hasGitRepo = false;
	private _isolationOptionEnabled: boolean;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this._isolationOptionEnabled = this.configurationService.getValue<boolean>('github.copilot.chat.cli.isolationOption.enabled') !== false;

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('github.copilot.chat.cli.isolationOption.enabled')) {
				this._isolationOptionEnabled = this.configurationService.getValue<boolean>('github.copilot.chat.cli.isolationOption.enabled') !== false;
				if (!this._isolationOptionEnabled) {
					this._setModeOnSession('worktree');
				}
				this._updateTriggerLabel();
			}
		}));

		this._register(autorun(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			if (session instanceof CopilotCLISession) {
				const isLoading = session.loading.read(reader);
				this._hasGitRepo = !isLoading && !!session.gitRepository;
				// Read isolation mode from session — session is the source of truth
				session.isolationModeObservable.read(reader);
			} else {
				this._hasGitRepo = false;
			}
			this._updateTriggerLabel();
		}));
	}

	private _getSessionIsolationMode(): IsolationMode {
		const session = this.sessionsManagementService.activeSession.get();
		return session instanceof CopilotCLISession ? session.isolationMode : 'worktree';
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		this._slotElement = slot;

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
				this._setModeOnSession(mode);
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

	private _setModeOnSession(mode: IsolationMode): void {
		const session = this.sessionsManagementService.activeSession.get();
		if (!(session instanceof CopilotCLISession)) {
			throw new Error('IsolationPicker requires a CopilotCLISession');
		}
		session.setIsolationMode(mode);
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);

		const isolationMode = this._getSessionIsolationMode();
		let modeIcon;
		let modeLabel: string;

		switch (isolationMode) {
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

		const isDisabled = !this._hasGitRepo;
		this._slotElement?.classList.toggle('disabled', isDisabled);
		this._triggerElement.setAttribute('aria-disabled', String(isDisabled));
		this._triggerElement.tabIndex = isDisabled ? -1 : 0;
	}
}
