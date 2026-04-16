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
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import Severity from '../../../../base/common/severity.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { CopilotChatSessionsProvider } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';

// Track whether warnings have been shown this VS Code session
const shownWarnings = new Set<ChatPermissionLevel>();

interface IPermissionItem {
	readonly level?: ChatPermissionLevel;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly checked: boolean;
}

export class PermissionPicker extends Disposable {

	private readonly _onDidChangeLevel = this._register(new Emitter<ChatPermissionLevel>());
	readonly onDidChangeLevel: Event<ChatPermissionLevel> = this._onDidChangeLevel.event;

	private _currentLevel: ChatPermissionLevel = ChatPermissionLevel.Default;
	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	get permissionLevel(): ChatPermissionLevel {
		return this._currentLevel;
	}

	set permissionLevel(level: ChatPermissionLevel) {
		this._currentLevel = level;
		this._updateTriggerLabel(this._triggerElement);
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		// Write permission level to the active session data when it changes
		this._register(this.onDidChangeLevel(level => {
			const session = this.sessionsManagementService.activeSession.get();
			if (!session) {
				return;
			}
			const provider = this.sessionsProvidersService.getProvider(session.providerId);
			if (provider instanceof CopilotChatSessionsProvider) {
				provider.getSession(session.sessionId)?.setPermissionLevel(level);
			}
		}));
	}

	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		this._updateTriggerLabel(trigger);

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
				description: localize('permissions.default.subtext', "Copilot uses your configured settings"),
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
				description: localize('permissions.autoApprove.subtext', "All tool calls are auto-approved"),
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
				description: localize('permissions.autopilot.subtext', "Autonomously iterates from start to finish"),
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

		const listOptions: IActionListOptions = { descriptionBelow: true, minWidth: 255 };
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

	private async _selectLevel(level: ChatPermissionLevel): Promise<void> {
		if (level === ChatPermissionLevel.AutoApprove && !shownWarnings.has(ChatPermissionLevel.AutoApprove)) {
			const result = await this.dialogService.prompt({
				type: Severity.Warning,
				message: localize('permissions.autoApprove.warning.title', "Enable Bypass Approvals?"),
				buttons: [
					{
						label: localize('permissions.autoApprove.warning.confirm', "Enable"),
						run: () => true
					},
					{
						label: localize('permissions.autoApprove.warning.cancel', "Cancel"),
						run: () => false
					},
				],
				custom: {
					icon: Codicon.warning,
					markdownDetails: [{
						markdown: new MarkdownString(localize('permissions.autoApprove.warning.detail', "Bypass Approvals will auto-approve all tool calls without asking for confirmation. This includes file edits, terminal commands, and external tool calls.")),
					}],
				},
			});
			if (result.result !== true) {
				return;
			}
			shownWarnings.add(ChatPermissionLevel.AutoApprove);
		}

		if (level === ChatPermissionLevel.Autopilot && !shownWarnings.has(ChatPermissionLevel.Autopilot)) {
			const result = await this.dialogService.prompt({
				type: Severity.Warning,
				message: localize('permissions.autopilot.warning.title', "Enable Autopilot?"),
				buttons: [
					{
						label: localize('permissions.autopilot.warning.confirm', "Enable"),
						run: () => true
					},
					{
						label: localize('permissions.autopilot.warning.cancel', "Cancel"),
						run: () => false
					},
				],
				custom: {
					icon: Codicon.rocket,
					markdownDetails: [{
						markdown: new MarkdownString(localize('permissions.autopilot.warning.detail', "Autopilot will auto-approve all tool calls and continue working autonomously until the task is complete. The agent will make decisions on your behalf without asking for confirmation.\n\nYou can stop the agent at any time by clicking the stop button. This applies to the current session only.")),
					}],
				},
			});
			if (result.result !== true) {
				return;
			}
			shownWarnings.add(ChatPermissionLevel.Autopilot);
		}

		this._currentLevel = level;
		this._updateTriggerLabel(this._triggerElement);
		this._onDidChangeLevel.fire(level);
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

		trigger.classList.toggle('warning', this._currentLevel === ChatPermissionLevel.Autopilot);
		trigger.classList.toggle('info', this._currentLevel === ChatPermissionLevel.AutoApprove);
	}
}
