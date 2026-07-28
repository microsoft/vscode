/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatMode, IChatMode, IChatModes, IChatModeService } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getChatSessionType } from '../../../../../workbench/contrib/chat/common/model/chatUri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Target } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { AICustomizationManagementCommands } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementSection } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import type { ISession } from '../../../../services/sessions/common/session.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { CopilotCLISessionType } from '../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { URI } from '../../../../../base/common/uri.js';

interface IModePickerItem {
	readonly kind: 'mode';
	readonly mode: IChatMode;
}

interface IConfigurePickerItem {
	readonly kind: 'configure';
}

type ModePickerItem = IModePickerItem | IConfigurePickerItem;

export class ModePickerModel extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _modeChangeListener = this._register(new MutableDisposable());
	private readonly _chatModesDisposable = this._register(new MutableDisposable<IChatModes & IDisposable>());

	private _selectedModeId: string | undefined = undefined;
	private _sessionResource: URI | undefined;
	private _chatModes: IChatModes | undefined;

	get selectedMode(): IChatMode {
		if (!this._selectedModeId) {
			return ChatMode.Agent;
		}
		return this._findModeById(this._selectedModeId) ?? ChatMode.Agent;
	}

	get selectedModeId(): string | undefined {
		return this._selectedModeId;
	}

	constructor(
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
	) {
		super();
	}

	reset(): void {
		this._selectedModeId = undefined;
		this._onDidChange.fire();
	}

	setSelectedMode(mode: IChatMode): void {
		this._selectedModeId = mode.id;
		this._onDidChange.fire();
	}

	setSession(session: ISession | undefined, selectedModeId: string | undefined): void {
		if (!session) {
			if (!this._sessionResource) {
				return;
			}
			this._sessionResource = undefined;
			this._chatModesDisposable.value = undefined;
			this._chatModes = undefined;
			this._selectedModeId = undefined;
			this._onDidChange.fire();
			return;
		}

		this._setSession(session, selectedModeId);
	}

	getAvailableModes(): IChatMode[] {
		const sessionType = this._sessionResource ? getChatSessionType(this._sessionResource) : CopilotCLISessionType.id;
		const customAgentTarget = this.chatSessionsService.getCustomAgentTargetForSessionType(sessionType);
		const effectiveTarget = customAgentTarget && customAgentTarget !== Target.Undefined ? customAgentTarget : Target.GitHubCopilot;

		// Always include the default Agent mode.
		const result: IChatMode[] = [ChatMode.Agent];

		// Add custom modes matching the target and visible to users.
		for (const mode of (this._chatModes?.custom ?? [])) {
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

	private _setSession(session: ISession, selectedModeId: string | undefined): void {
		const sessionResource = session.resource;
		if (this._sessionResource?.toString() === sessionResource.toString()) {
			if (this._selectedModeId !== selectedModeId) {
				this._selectedModeId = selectedModeId;
				this._onDidChange.fire();
			}
			return;
		}
		this._sessionResource = sessionResource;
		const modes = this.chatModeService.createModes(sessionResource);
		this._chatModesDisposable.value = modes;
		this._chatModes = modes;
		this._modeChangeListener.value = modes.onDidChange(() => {
			this._onDidChange.fire();
		});
		this._selectedModeId = selectedModeId;
		this._onDidChange.fire();
	}

	private _findModeById(id: string): IChatMode | undefined {
		const mode = this._chatModes?.findModeById(id);
		if (mode) {
			return mode;
		}
		return undefined;
	}
}

/**
 * A self-contained widget for selecting a chat mode (Agent, custom agents)
 * for local/Background sessions. Shows only modes whose target matches
 * the Background session type's customAgentTarget.
 */
export class ModePicker extends Disposable {

	private readonly _onDidSelect = this._register(new Emitter<IChatMode>());
	readonly onDidSelect: Event<IChatMode> = this._onDidSelect.event;

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _modePickerModel: ModePickerModel;

	constructor(
		modePickerModel: ModePickerModel,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._modePickerModel = modePickerModel;
		this._register(this._modePickerModel.onDidChange(() => {
			if (this._triggerElement) {
				this._updateTriggerLabel();
			}
		}));
	}

	/**
	 * Resets the selected mode back to the default Agent mode.
	 */
	reset(): void {
		this._modePickerModel.reset();
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

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const modes = this._modePickerModel.getAvailableModes();

		const items = this._buildItems(modes);

		const triggerElement = this._triggerElement;
		const previousMode = this._modePickerModel.selectedMode;
		const delegate: IActionListDelegate<ModePickerItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				if (item.kind === 'mode') {
					reportNewChatPickerClosed(this.telemetryService, {
						id: 'NewChatModePicker',
						optionIdBefore: previousMode.id,
						optionIdAfter: item.mode.id,
						optionLabelBefore: previousMode.label.get(),
						optionLabelAfter: item.mode.label.get(),
						isPII: true,
					});
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

		const selectedModeId = this._modePickerModel.selectedMode.id;

		// Default Agent mode
		const agentMode = modes[0];
		items.push({
			kind: ActionListItemKind.Action,
			label: agentMode.label.get(),
			group: { title: '', icon: selectedModeId === agentMode.id ? Codicon.check : Codicon.blank },
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
					group: { title: '', icon: selectedModeId === mode.id ? Codicon.check : Codicon.blank },
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
		this._modePickerModel.setSelectedMode(mode);
		this._updateTriggerLabel();
		this._onDidSelect.fire(mode);
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);

		const selectedMode = this._modePickerModel.selectedMode;
		const icon = selectedMode.icon.get();
		if (icon) {
			dom.append(this._triggerElement, renderIcon(icon));
		}

		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = selectedMode.label.get();

		this._triggerElement.ariaLabel = localize('modePicker.triggerAriaLabel', "Pick Mode, {0}", selectedMode.label.get());
	}
}
