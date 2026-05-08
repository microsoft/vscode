/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { maybeConfirmElevatedPermissionLevel } from '../../../../workbench/contrib/chat/common/chatPermissionWarnings.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatConfiguration, ChatPermissionLevel, isChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { CopilotChatSessionsProvider } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';

const PERMISSION_LEVEL_OPTION_ID = 'permissionLevel';

/**
 * Strategy for the per-provider parts of {@link PermissionPicker}: how to read
 * back the current level (if at all), whether the picker should be visible
 * given the active session, and where to write the user's selection.
 *
 * Implementations live with the provider they back (e.g.
 * {@link CopilotPermissionPickerDelegate} below for the default Copilot
 * provider, or `AgentHostPermissionPickerDelegate` in the agent-host folder).
 */
export interface IPermissionPickerDelegate {
	/**
	 * If provided, the picker's trigger label reactively tracks this. If
	 * omitted, the picker manages its own internal state and starts at
	 * {@link ChatPermissionLevel.Default}.
	 */
	readonly currentPermissionLevel?: IObservable<ChatPermissionLevel>;

	/**
	 * If provided, the picker hides itself when this is `false`. Used by
	 * delegates whose applicability depends on the active session.
	 */
	readonly isApplicable?: IObservable<boolean>;

	/**
	 * Called after the user selects a level (and any required confirmation
	 * dialog has been accepted).
	 */
	setPermissionLevel(level: ChatPermissionLevel): void;
}

interface IPermissionItem {
	readonly level?: ChatPermissionLevel;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly checked: boolean;
}

export class PermissionPicker extends Disposable {

	protected _currentLevel: ChatPermissionLevel = ChatPermissionLevel.Default;
	protected _triggerElement: HTMLElement | undefined;
	protected readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		protected readonly _delegate: IPermissionPickerDelegate,
		@IActionWidgetService protected readonly actionWidgetService: IActionWidgetService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IDialogService protected readonly dialogService: IDialogService,
		@IOpenerService protected readonly openerService: IOpenerService,
		@IStorageService protected readonly storageService: IStorageService,
	) {
		super();
	}

	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		// Initialize the picker to reflect the configured default permission level
		// (`chat.permissions.default`) whenever it is (re-)rendered. If enterprise
		// policy disables global auto-approval, clamp to Default regardless of the
		// configured default so we never show an elevated level the user can't pick.
		const policyRestricted = this.configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
		const configuredDefault = this.configurationService.getValue<string>(ChatConfiguration.DefaultPermissionLevel);
		const initialLevel = isChatPermissionLevel(configuredDefault) ? configuredDefault : ChatPermissionLevel.Default;
		this._currentLevel = policyRestricted ? ChatPermissionLevel.Default : initialLevel;

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		this._updateTriggerLabel(trigger);

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
				dom.EventHelper.stop(e, true);
				this.showPicker();
			}));
		}

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this.showPicker();
			}
		}));

		const currentPermissionLevel = this._delegate.currentPermissionLevel;
		if (currentPermissionLevel) {
			this._renderDisposables.add(autorun(reader => {
				this._currentLevel = currentPermissionLevel.read(reader);
				this._updateTriggerLabel(trigger);
			}));
		}

		const isApplicable = this._delegate.isApplicable;
		if (isApplicable) {
			this._renderDisposables.add(autorun(reader => {
				slot.style.display = isApplicable.read(reader) ? '' : 'none';
			}));
		}

		return slot;
	}

	showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const policyRestricted = this.configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
		const isAutopilotEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.AutopilotEnabled) !== false;

		const items: IActionListItem<IPermissionItem>[] = [
			{
				kind: ActionListItemKind.Action,
				group: { kind: ActionListItemKind.Header, title: '', icon: Codicon.shield },
				item: {
					level: ChatPermissionLevel.Default,
					label: localize('permissions.default', "Default Approvals"),
					icon: Codicon.shield,
					checked: this._currentLevel === ChatPermissionLevel.Default,
				},
				label: localize('permissions.default', "Default Approvals"),
				detail: localize('permissions.default.subtext', "Copilot uses your configured settings"),
				disabled: false,
			},
			{
				kind: ActionListItemKind.Action,
				group: { kind: ActionListItemKind.Header, title: '', icon: Codicon.warning },
				item: {
					level: ChatPermissionLevel.AutoApprove,
					label: localize('permissions.autoApprove', "Bypass Approvals"),
					icon: Codicon.warning,
					checked: this._currentLevel === ChatPermissionLevel.AutoApprove,
				},
				label: localize('permissions.autoApprove', "Bypass Approvals"),
				detail: localize('permissions.autoApprove.subtext', "All tool calls are auto-approved"),
				disabled: policyRestricted,
			},
		];

		if (isAutopilotEnabled) {
			items.push({
				kind: ActionListItemKind.Action,
				group: { kind: ActionListItemKind.Header, title: '', icon: Codicon.rocket },
				item: {
					level: ChatPermissionLevel.Autopilot,
					label: localize('permissions.autopilot', "Autopilot (Preview)"),
					icon: Codicon.rocket,
					checked: this._currentLevel === ChatPermissionLevel.Autopilot,
				},
				label: localize('permissions.autopilot', "Autopilot (Preview)"),
				detail: localize('permissions.autopilot.subtext', "Autonomously iterates from start to finish"),
				disabled: policyRestricted,
			});
		}

		items.push({
			kind: ActionListItemKind.Separator,
			label: '',
			disabled: false,
		});
		items.push({
			kind: ActionListItemKind.Action,
			group: { kind: ActionListItemKind.Header, title: '', icon: Codicon.blank },
			item: {
				label: localize('permissions.learnMore', "Learn more about permissions"),
				icon: Codicon.blank,
				checked: false,
			},
			label: localize('permissions.learnMore', "Learn more about permissions"),
			hideIcon: false,
			disabled: false,
		});

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IPermissionItem> = {
			onSelect: async (item) => {
				this.actionWidgetService.hide();
				if (item.level) {
					await this._selectLevel(item.level);
				} else {
					await this.openerService.open(URI.parse('https://code.visualstudio.com/docs/copilot/agents/agent-tools#_permission-levels'));
				}
			},
			onHide: () => { triggerElement.focus(); },
		};

		const listOptions: IActionListOptions = { minWidth: 255 };
		this.actionWidgetService.show<IPermissionItem>(
			'permissionPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getWidgetAriaLabel: () => localize('permissionPicker.ariaLabel', "Permission Picker"),
			},
			listOptions,
		);
	}

	protected async _selectLevel(level: ChatPermissionLevel): Promise<void> {
		if (!await maybeConfirmElevatedPermissionLevel(level, this.dialogService, this.storageService)) {
			return;
		}

		this._currentLevel = level;
		this._updateTriggerLabel(this._triggerElement);
		this._delegate.setPermissionLevel(level);
	}

	private _updateTriggerLabel(trigger: HTMLElement | undefined): void {
		if (!trigger) {
			return;
		}

		dom.clearNode(trigger);
		let icon: ThemeIcon;
		let label: string;
		switch (this._currentLevel) {
			case ChatPermissionLevel.Autopilot:
				icon = Codicon.rocket;
				label = localize('permissions.autopilot.label', "Autopilot (Preview)");
				break;
			case ChatPermissionLevel.AutoApprove:
				icon = Codicon.warning;
				label = localize('permissions.autoApprove.label', "Bypass Approvals");
				break;
			default:
				icon = Codicon.shield;
				label = localize('permissions.default.label', "Default Approvals");
				break;
		}

		dom.append(trigger, renderIcon(icon));
		const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(trigger, renderIcon(Codicon.chevronDown));

		trigger.ariaLabel = localize('permissionPicker.triggerAriaLabel', "Pick Permission Level, {0}", label);

		trigger.classList.toggle('warning', this._currentLevel === ChatPermissionLevel.Autopilot);
		trigger.classList.toggle('info', this._currentLevel === ChatPermissionLevel.AutoApprove);
	}
}

/**
 * Default-Copilot {@link IPermissionPickerDelegate}: writes the user's chosen
 * level back to the active {@link CopilotChatSessionsProvider} session.
 *
 * Does not provide `currentPermissionLevel` or `isApplicable`, so the picker
 * manages its own state and is always visible (visibility is gated at the menu
 * contribution level via `when` clauses).
 */
export class CopilotPermissionPickerDelegate extends Disposable implements IPermissionPickerDelegate {
	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
	) {
		super();
	}

	setPermissionLevel(level: ChatPermissionLevel): void {
		const session = this._sessionsManagementService.activeSession.get();
		if (!session) {
			return;
		}
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (provider instanceof CopilotChatSessionsProvider) {
			const chatSession = provider.getSession(session.sessionId);
			if (!chatSession) {
				return;
			}
			if (chatSession.setOption) {
				chatSession.setPermissionLevel(level);
				chatSession.setOption(PERMISSION_LEVEL_OPTION_ID, level);
			} else {
				this._chatSessionsService.setSessionOption(chatSession.resource, PERMISSION_LEVEL_OPTION_ID, level);
			}
		}
	}
}
