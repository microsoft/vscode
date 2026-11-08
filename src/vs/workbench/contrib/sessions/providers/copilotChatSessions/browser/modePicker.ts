/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatMode, getChatModeSourceLabel, IChatMode, IChatModes, IChatModeService } from '../../../../chat/common/chatModes.js';
import { reportChatModeChange } from '../../../../chat/common/chatModeTelemetry.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { getAgentHostProviderForTelemetry, IChatSessionsService } from '../../../../chat/common/chatSessionsService.js';
import { getChatSessionType } from '../../../../chat/common/model/chatUri.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import type { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Target } from '../../../../chat/common/promptSyntax/promptTypes.js';
import { AICustomizationManagementCommands } from '../../../../chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementSection } from '../../../../chat/common/aiCustomizationWorkspaceService.js';
import type { ISession } from '../../../../../services/sessions/common/session.js';
import type { ISessionChatSource } from '../../../../../services/sessions/browser/sessionHost.js';
import { reportNewChatPickerClosed } from '../../../browser/newChatPickerTelemetry.js';
import { CopilotCLISessionType } from '../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { PromptsStorage } from '../../../../chat/common/promptSyntax/service/promptsService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { hasReadableCustomizationContent } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';

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
	/** The resource discovery runs for: the chat the surface shows, else its session. */
	private _discoveryResource: URI | undefined;
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

	/**
	 * Shows the modes of `session` for the chat of it that the surface shows, `chatResource`, which discovery runs for:
	 * chats of one session may discover different agents. Without a chat, discovery runs for the session.
	 */
	setSession(session: ISession | undefined, selectedModeId: string | undefined, chatResource?: URI): void {
		if (!session) {
			if (!this._sessionResource) {
				return;
			}
			this._sessionResource = undefined;
			this._discoveryResource = undefined;
			this._modeChangeListener.clear();
			this._chatModesDisposable.value = undefined;
			this._chatModes = undefined;
			this._selectedModeId = undefined;
			this._onDidChange.fire();
			return;
		}

		this._setSession(session, selectedModeId, chatResource ?? session.resource);
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

	private _setSession(session: ISession, selectedModeId: string | undefined, discoveryResource: URI): void {
		if (this._discoveryResource?.toString() === discoveryResource.toString()) {
			if (this._selectedModeId !== selectedModeId) {
				this._selectedModeId = selectedModeId;
				this._onDidChange.fire();
			}
			return;
		}
		this._sessionResource = session.resource;
		this._discoveryResource = discoveryResource;
		const modes = this.chatModeService.createModes(discoveryResource);
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

interface IModePickerModelEntry {
	readonly model: ModePickerModel;
	readonly store: DisposableStore;
	references: number;
	disposalGeneration: number;
}

/** Retains each surface's model across synchronous toolbar rebuilds. The mode is that of the surface's chat. */
export class ScopedModePickerModelCache extends Disposable {
	private readonly entries = new Map<ISessionChatSource, IModePickerModelEntry>();

	constructor(private readonly acceptsSession: (session: ISession) => boolean) {
		super();
	}

	acquire(source: ISessionChatSource, instantiationService: IInstantiationService): IDisposable & { readonly model: ModePickerModel } {
		let entry = this.entries.get(source);
		if (!entry) {
			const store = new DisposableStore();
			const model = store.add(instantiationService.createInstance(ModePickerModel));
			store.add(autorun(reader => {
				const scopedSession = source.session.read(reader);
				const chat = source.chat.read(reader);
				model.setSession(scopedSession && this.acceptsSession(scopedSession) ? scopedSession : undefined, chat?.mode.read(reader)?.id, chat?.resource);
			}));
			entry = { model, store, references: 0, disposalGeneration: 0 };
			this.entries.set(source, entry);
		}

		entry.references++;
		entry.disposalGeneration++;
		let disposed = false;
		return {
			model: entry.model,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				this.release(source, entry);
			},
		};
	}

	private release(source: ISessionChatSource, entry: IModePickerModelEntry): void {
		entry.references--;
		const disposalGeneration = ++entry.disposalGeneration;
		queueMicrotask(() => {
			if (entry.references === 0 && entry.disposalGeneration === disposalGeneration && this.entries.get(source) === entry) {
				this.entries.delete(source);
				entry.store.dispose();
			}
		});
	}

	override dispose(): void {
		for (const entry of this.entries.values()) {
			entry.store.dispose();
		}
		this.entries.clear();
		super.dispose();
	}
}

/**
 * A self-contained widget for selecting a chat mode (Agent, custom agents)
 * for a session. Shows only modes whose target matches the session type's
 * customAgentTarget.
 */
export class ModePicker extends Disposable {

	private readonly _onDidSelect = this._register(new Emitter<IChatMode>());
	readonly onDidSelect: Event<IChatMode> = this._onDidSelect.event;

	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _modePickerModel: ModePickerModel;

	constructor(
		modePickerModel: ModePickerModel,
		private readonly source: ISessionChatSource,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IEditorService private readonly editorService: IEditorService,
		@IFileService private readonly fileService: IFileService,
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
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');
		this._triggerElement = trigger;

		this._updateTriggerLabel();

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

		return slot;
	}

	showPicker(anchor?: HTMLElement): void {
		const triggerElement = anchor ?? this._triggerElement;
		if (!triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const modes = this._modePickerModel.getAvailableModes();

		const items = this._buildItems(modes);

		const delegate: IActionListDelegate<ModePickerItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				if (item.kind === 'mode') {
					const activeChat = this.source.chat.get();
					const previousModeId = activeChat?.mode.get()?.id;
					const previousMode = modes.find(mode => mode.id === previousModeId) ?? ChatMode.Agent;
					reportNewChatPickerClosed(this.telemetryService, {
						id: 'NewChatModePicker',
						optionIdBefore: previousMode.id,
						optionIdAfter: item.mode.id,
						optionLabelBefore: previousMode.label.get(),
						optionLabelAfter: item.mode.label.get(),
						isPII: true,
					});
					const requestCount = activeChat ? this.chatService.getSession(activeChat.resource)?.getRequests().length ?? 0 : 0;
					reportChatModeChange(this.telemetryService, previousMode, item.mode, requestCount, getAgentHostProviderForTelemetry(this.source.session.get()?.sessionType, this.chatSessionsService));
					this._selectMode(item.mode);
				} else {
					this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Agents);
				}
			},
			onHide: () => {
				triggerElement.setAttribute('aria-expanded', 'false');
				triggerElement.focus();
			},
		};

		// Shows the trigger as expanded, and with it the toolbar's open picker background.
		triggerElement.setAttribute('aria-expanded', 'true');
		this.actionWidgetService.show<ModePickerItem>(
			'localModePicker',
			false,
			items,
			delegate,
			triggerElement,
			undefined,
			[],
			{
				getAriaLabel: item => item.ariaDescription
					? localize('modePicker.sourceAriaLabel', "{0}, {1}", item.label ?? '', item.ariaDescription)
					: item.label ?? '',
				getWidgetAriaLabel: () => localize('modePicker.ariaLabel', "Mode Picker"),
			},
			{ tabThroughItemActions: true },
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
				const source = getChatModeSourceLabel(mode, modes);
				const resource = mode.uri?.get();
				const isExtension = mode.source?.storage === PromptsStorage.extension;
				const openLabel = isExtension
					? localize('viewModeConfiguration', "View {0} agent", mode.label.get())
					: localize('editModeConfiguration', "Edit {0} agent", mode.label.get());
				items.push({
					kind: ActionListItemKind.Action,
					label: mode.label.get(),
					description: source,
					ariaDescription: source,
					group: { title: '', icon: selectedModeId === mode.id ? Codicon.check : Codicon.blank },
					item: { kind: 'mode', mode },
					toolbarActions: resource && hasReadableCustomizationContent(resource) && this.fileService.hasProvider(resource) ? [{
						id: `${isExtension ? 'viewAgent' : 'editAgent'}:${mode.id}`,
						label: openLabel,
						tooltip: openLabel,
						class: ThemeIcon.asClassName(isExtension ? Codicon.file : Codicon.edit),
						enabled: true,
						run: async () => {
							this.actionWidgetService.hide();
							await this.editorService.openEditor({ resource });
						},
					}] : undefined,
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
