/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider } from './copilotChatSessionsProvider.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';

const PERMISSION_MODE_OPTION_ID = 'permissionMode';
const ALLOW_AUTO_PERMISSIONS_SETTING = 'github.copilot.chat.claudeAgent.allowAutoPermissions';

interface IClaudePermissionModeItem {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly icon: ThemeIcon;
}

const permissionModes: IClaudePermissionModeItem[] = [
	{
		id: 'default',
		label: localize('claude.permissionMode.default', "Ask Before Edits"),
		description: localize('claude.permissionMode.default.description', "Claude asks for approval before making changes"),
		icon: Codicon.shield,
	},
	{
		id: 'acceptEdits',
		label: localize('claude.permissionMode.acceptEdits', "Edit Automatically"),
		description: localize('claude.permissionMode.acceptEdits.description', "Claude edits files without asking"),
		icon: Codicon.edit,
	},
	{
		id: 'plan',
		label: localize('claude.permissionMode.plan', "Plan Mode"),
		description: localize('claude.permissionMode.plan.description', "Claude creates a plan before making changes"),
		icon: Codicon.lightbulb,
	},
];

const autoPermissionMode: IClaudePermissionModeItem = {
	id: 'auto',
	label: localize('claude.permissionMode.auto', "Auto"),
	description: localize('claude.permissionMode.auto.description', "A model classifier approves or denies tool operations automatically"),
	icon: Codicon.sparkle,
};

export class ClaudePermissionModePicker extends Disposable {

	private _currentModeId = 'acceptEdits';
	private readonly _autoPermissionsEnabled: IObservable<boolean>;
	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this._autoPermissionsEnabled = observableConfigValue<boolean>(ALLOW_AUTO_PERMISSIONS_SETTING, false, configurationService);
	}

	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-permission-picker'));
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
				this._showPicker();
			}));
		}

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));

		return slot;
	}

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const autoAvailable = this._autoPermissionsEnabled.get() && !this.chatEntitlementService.previewFeaturesDisabled;
		const availableModes = autoAvailable ? [...permissionModes, autoPermissionMode] : permissionModes;
		const items: IActionListItem<IClaudePermissionModeItem>[] = availableModes.map(mode => ({
			kind: ActionListItemKind.Action,
			group: { kind: ActionListItemKind.Header, title: '', icon: mode.icon },
			item: mode,
			label: mode.label,
			detail: mode.description,
			disabled: false,
		}));

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IClaudePermissionModeItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				this._selectMode(item);
			},
			onHide: () => { triggerElement.focus(); },
		};

		const listOptions: IActionListOptions = { minWidth: 255 };
		this.actionWidgetService.show<IClaudePermissionModeItem>(
			'claudePermissionModePicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getWidgetAriaLabel: () => localize('claudePermissionModePicker.ariaLabel', "Permission Mode"),
			},
			listOptions,
		);
	}

	private _selectMode(mode: IClaudePermissionModeItem): void {
		const beforeId = this._currentModeId;
		const beforeLabel = [...permissionModes, autoPermissionMode].find(m => m.id === beforeId)?.label;
		reportNewChatPickerClosed(this.telemetryService, {
			id: 'NewChatClaudePermissionModePicker',
			name: 'NewChatClaudePermissionModePicker',
			optionIdBefore: beforeId,
			optionIdAfter: mode.id,
			optionLabelBefore: beforeLabel,
			optionLabelAfter: mode.label,
			isPII: false,
		});

		this._currentModeId = mode.id;
		this._updateTriggerLabel(this._triggerElement);

		const session = this.sessionsManagementService.activeSession.get();
		if (!session) {
			return;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (provider instanceof CopilotChatSessionsProvider) {
			const chatSession = provider.getSession(session.sessionId);
			if (!chatSession) {
				return;
			}
			const option = { id: mode.id, name: mode.label };
			if (chatSession.setOption) {
				chatSession.setOption(PERMISSION_MODE_OPTION_ID, option);
			} else {
				this.chatSessionsService.setSessionOption(chatSession.resource, PERMISSION_MODE_OPTION_ID, option);
			}
		}
	}

	private _updateTriggerLabel(trigger: HTMLElement | undefined): void {
		if (!trigger) {
			return;
		}

		dom.clearNode(trigger);
		const currentMode = [...permissionModes, autoPermissionMode].find(m => m.id === this._currentModeId) ?? permissionModes[1];

		dom.append(trigger, renderIcon(currentMode.icon));
		const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = currentMode.label;
		dom.append(trigger, renderIcon(Codicon.chevronDown));

		trigger.ariaLabel = localize('claudePermissionModePicker.triggerAriaLabel', "Pick Permission Mode, {0}", currentMode.label);
	}
}
