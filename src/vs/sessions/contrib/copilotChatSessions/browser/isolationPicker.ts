/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider } from './copilotChatSessionsProvider.js';

export type IsolationMode = 'worktree' | 'workspace';

interface IIsolationPickerItem {
	readonly mode: IsolationMode;
	readonly checked?: boolean;
}

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
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
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
			const isLoading = session?.loading.read(reader);
			const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
			const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
			if (providerSession) {
				const gitRepo = providerSession.gitRepository;
				const repoState = gitRepo?.state?.read?.(reader);
				const hasHeadCommit = repoState ? !!repoState.HEAD?.commit : true;
				// Enable only when git repo exists and HEAD has a valid commit (not an empty repo)
				this._hasGitRepo = !isLoading && !!gitRepo && hasHeadCommit;
				// Read isolation mode from session — session is the source of truth
				providerSession.isolationMode.read(reader);
			} else {
				this._hasGitRepo = false;
			}
			this._updateTriggerLabel();
		}));
	}

	private _getSessionIsolationMode(): IsolationMode {
		const session = this.sessionsManagementService.activeSession.get();
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
		const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
		return providerSession?.isolationMode.get() ?? 'worktree';
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

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}));
		}

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

		const currentIsolationMode = this._getSessionIsolationMode();
		const items: IActionListItem<IIsolationPickerItem>[] = [
			{
				kind: ActionListItemKind.Action,
				label: localize('isolationMode.worktree', "Worktree"),
				group: { title: '', icon: Codicon.worktree },
				item: { mode: 'worktree', checked: currentIsolationMode === 'worktree' || undefined },
			},
			{
				kind: ActionListItemKind.Action,
				label: localize('isolationMode.folder', "Folder"),
				group: { title: '', icon: Codicon.folder },
				item: { mode: 'workspace', checked: currentIsolationMode === 'workspace' || undefined },
			},
		];

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IIsolationPickerItem> = {
			onSelect: ({ mode }) => {
				this.actionWidgetService.hide();
				this._setModeOnSession(mode);
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<IIsolationPickerItem>(
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
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
		const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
		providerSession?.setIsolationMode(mode);
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

		this._triggerElement.ariaLabel = localize('isolationPicker.triggerAriaLabel', "Pick Isolation Mode, {0}", modeLabel);

		const isDisabled = !this._hasGitRepo;
		this._slotElement?.classList.toggle('disabled', isDisabled);
		this._triggerElement.setAttribute('aria-disabled', String(isDisabled));
		this._triggerElement.tabIndex = isDisabled ? -1 : 0;
	}
}
