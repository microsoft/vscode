/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ChatMode, IChatMode, IChatModes, IChatModeService } from '../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Target } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { AICustomizationManagementCommands } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider } from './copilotChatSessionsProvider.js';
import { CopilotCLISessionType } from '../../../services/sessions/common/session.js';

interface IModePickerItem {
	readonly kind: 'mode';
	readonly mode: IChatMode;
}

interface IConfigurePickerItem {
	readonly kind: 'configure';
}

type ModePickerItem = IModePickerItem | IConfigurePickerItem;

/**
 * A self-contained widget for selecting a chat mode (Agent, custom agents)
 * for local/Background sessions. Shows only modes whose target matches
 * the Background session type's customAgentTarget.
 */
export class ModePicker extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<IChatMode>());
	readonly onDidChange: Event<IChatMode> = this._onDidChange.event;

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	private _selectedMode: IChatMode = ChatMode.Agent;

	get selectedMode(): IChatMode {
		return this._selectedMode;
	}

	private readonly _chatModes: IChatModes;

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		this._chatModes = this.chatModeService.getModes(CopilotCLISessionType.id);

		this._register(this._chatModes.onDidChange(() => {
			// Refresh the trigger label when available chat modes change
			if (this._triggerElement) {
				this._updateTriggerLabel();
			}
		}));
	}

	/**
	 * Resets the selected mode back to the default Agent mode.
	 */
	reset(): void {
		this._selectedMode = ChatMode.Agent;
		this._updateTriggerLabel();
	}

	/**
	 * Renders the mode picker trigger button into the given container.
	 */
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

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

		return slot;
	}

	private _getAvailableModes(): IChatMode[] {
		const customAgentTarget = this.chatSessionsService.getCustomAgentTargetForSessionType(CopilotCLISessionType.id);
		const effectiveTarget = customAgentTarget && customAgentTarget !== Target.Undefined ? customAgentTarget : Target.GitHubCopilot;

		// Always include the default Agent mode
		const result: IChatMode[] = [ChatMode.Agent];

		// Add custom modes matching the target and visible to users
		for (const mode of this._chatModes.custom) {
			const target = mode.target.get();
			if (target === effectiveTarget || target === Target.Undefined) {
				const visibility = mode.visibility?.get();
				if (visibility && !visibility.userInvocable) {
					continue;
				}
				result.push(mode);
			}
		}

		return result;
	}

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const modes = this._getAvailableModes();

		const items = this._buildItems(modes);

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<ModePickerItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				if (item.kind === 'mode') {
					this._selectMode(item.mode);
				} else {
					this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Agents);
				}
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<ModePickerItem>(
			'localModePicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('modePicker.ariaLabel', "Mode Picker"),
			},
		);
	}

	private _buildItems(modes: IChatMode[]): IActionListItem<ModePickerItem>[] {
		const items: IActionListItem<ModePickerItem>[] = [];

		// Default Agent mode
		const agentMode = modes[0];
		items.push({
			kind: ActionListItemKind.Action,
			label: agentMode.label.get(),
			group: { title: '', icon: this._selectedMode.id === agentMode.id ? Codicon.check : Codicon.blank },
			item: { kind: 'mode', mode: agentMode },
		});

		// Custom modes (with separator if any exist)
		const customModes = modes.slice(1);
		if (customModes.length > 0) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
			for (const mode of customModes) {
				items.push({
					kind: ActionListItemKind.Action,
					label: mode.label.get(),
					group: { title: '', icon: this._selectedMode.id === mode.id ? Codicon.check : Codicon.blank },
					item: { kind: 'mode', mode },
				});
			}
		}

		// Configure Custom Agents action
		items.push({ kind: ActionListItemKind.Separator, label: '' });
		items.push({
			kind: ActionListItemKind.Action,
			label: localize('configureCustomAgents', "Configure Custom Agents..."),
			group: { title: '', icon: Codicon.blank },
			item: { kind: 'configure' },
		});

		return items;
	}

	private _selectMode(mode: IChatMode): void {
		this._selectedMode = mode;
		this._updateTriggerLabel();
		this._onDidChange.fire(mode);

		const session = this.sessionsManagementService.activeSession.get();
		if (!session) {
			return;
		}

		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (provider instanceof CopilotChatSessionsProvider) {
			provider.getSession(session.sessionId)?.setMode(mode);
		}
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);

		const icon = this._selectedMode.icon.get();
		if (icon) {
			dom.append(this._triggerElement, renderIcon(icon));
		}

		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = this._selectedMode.label.get();
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

		this._triggerElement.ariaLabel = localize('modePicker.triggerAriaLabel', "Pick Mode, {0}", this._selectedMode.label.get());
	}
}
