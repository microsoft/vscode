/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { IActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { CheckboxActionViewItem, ICheckboxActionViewItemOptions } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { defaultCheckboxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IsSessionsWindowContext, RemoteNameContext, WorkbenchStateContext } from '../../../../../common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IChatExecuteActionContext } from '../../actions/chatExecuteActions.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { ChatContextKeys, ChatContextKeyExprs } from '../../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../common/constants.js';
import { AgentHostWorktreeFolderChoices } from './agentHostWorktreeFolderChoices.js';
import { AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID, IAgentHostWorktreeSendChoiceService } from './agentHostWorktreeSendChoice.js';
import { markOnboardingTarget, resolveOnboardingTarget } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import './media/agentHostChatInputPicker.css';

/** Whether the chat input offers New Worktree as a checkbox rather than the folder chip: while the folder has no worktrees. */
export const ChatAgentHostNewWorktreeToggleVisible = new RawContextKey<boolean>('chatAgentHostNewWorktreeToggleVisible', false, { type: 'boolean', description: localize('chatAgentHostNewWorktreeToggleVisible', "Whether the chat input offers New Worktree as a checkbox, as the folder has no worktrees.") });
/** Whether the chat input shows the folder chip: while it offers more than the folder the session works in already. */
export const ChatAgentHostFolderChipVisible = new RawContextKey<boolean>('chatAgentHostFolderChipVisible', false, { type: 'boolean', description: localize('chatAgentHostFolderChipVisible', "Whether the chat input shows the folder chip, as it offers more than the folder the session works in already.") });
/** Whether the session of the chat input is to work in a new worktree of its folder. */
export const ChatAgentHostNewWorktreeSelected = new RawContextKey<boolean>('chatAgentHostNewWorktreeSelected', false, { type: 'boolean', description: localize('chatAgentHostNewWorktreeSelected', "Whether the session of the chat input is to work in a new worktree of its folder.") });

/**
 * Marks `element`, the worktree control of a chat input (its New Worktree checkbox or folder chip), as where the Work in
 * Parallel callout anchors while it asks about the chat that the control shows now ({@link IAgentHostWorktreeSendChoiceService.pendingSendChoice}),
 * until disposed. The control owns its element; the service only tells which chat it asks about.
 */
export function markWorktreeSendChoiceTarget(element: HTMLElement, sendChoice: IAgentHostWorktreeSendChoiceService, sessionResource: () => URI | undefined, onDidChangeSessionResource: Event<unknown>): IDisposable {
	const store = new DisposableStore();
	// The callout keeps the element it shows on. While this control is that element, the question ends unanswered once it shows
	// another chat, rather than staying on the other chat's control. Once it goes, the callout shows again on another control of
	// the same chat, such as where its toolbar renders it again, else the question ends. Other controls never end it.
	let anchoredFor: URI | undefined;
	store.add(sendChoice.onDidShowSendChoice(resource => {
		// As the callout shows, it anchors on the target that resolves now in the window onboarding presents in, the main
		// window, whatever window this control is in
		anchoredFor = resolveOnboardingTarget(mainWindow, AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID)?.element === element ? resource : undefined;
	}));
	store.add(autorun(reader => {
		const pending = sendChoice.pendingSendChoice.read(reader);
		if (anchoredFor && !(pending && extUriBiasedIgnorePathCase.isEqual(anchoredFor, pending))) {
			anchoredFor = undefined;
		}
	}));
	store.add(onDidChangeSessionResource(() => {
		const next = sessionResource();
		if (anchoredFor && !(next && extUriBiasedIgnorePathCase.isEqual(anchoredFor, next))) {
			const resource = anchoredFor;
			anchoredFor = undefined;
			sendChoice.cancelSendChoice(resource);
		}
	}));
	store.add(toDisposable(() => {
		const resource = anchoredFor;
		if (resource) {
			// Once its marker is gone too, and a replacement rendered in the meantime marks itself
			queueMicrotask(() => {
				if (!resolveOnboardingTarget(mainWindow, AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID)) {
					sendChoice.cancelSendChoice(resource);
				}
			});
		}
	}));
	// A callout run has no scope: it matches only the control of the chat it asks about, and every other control is out of scope
	store.add(markOnboardingTarget(element, AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID, {
		scope: () => {
			const resource = sessionResource();
			const pending = sendChoice.pendingSendChoice.get();
			return resource && pending && extUriBiasedIgnorePathCase.isEqual(resource, pending) ? undefined : (resource?.toString() ?? '');
		},
	}));
	return store;
}

/**
 * Where the chat input offers worktrees, by the folder chip or the New Worktree checkbox: a local agent host chat in a
 * window with a single local folder, while worktree support is on.
 */
export const agentHostWorktreeChoicesWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ChatContextKeyExprs.isAgentHostSession,
	// Of the local agent host only: a remote agent host's session works where its own host says
	ContextKeyExpr.regex(ChatContextKeys.chatSessionType.key, /^agent-host-/),
	ContextKeyExpr.equals(`config.${ChatConfiguration.EditorWindowEnableWorktree}`, true),
	WorkbenchStateContext.isEqualTo('folder'),
	RemoteNameContext.isEqualTo(''),
	IsSessionsWindowContext.negate(),
);

/**
 * Keeps the {@link ChatAgentHostNewWorktreeToggleVisible}, {@link ChatAgentHostFolderChipVisible} and
 * {@link ChatAgentHostNewWorktreeSelected} of a chat widget's input as its session's worktree choices are: as the folder comes to have worktrees or no longer has any, and as the
 * widget shows another session.
 */
export class AgentHostNewWorktreeToggle extends Disposable {

	constructor(
		widget: Pick<IChatWidget, 'viewModel' | 'onDidChangeViewModel' | 'scopedContextKeyService'>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAgentHostWorktreeSendChoiceService sendChoice: IAgentHostWorktreeSendChoiceService,
	) {
		super();
		const choices = this._register(instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => widget.viewModel?.sessionResource));
		/** The new chats whose New Worktree it preselected, or tried to: once each, whatever the user changes after. */
		const preselected = new ResourceSet();
		const visible = ChatAgentHostNewWorktreeToggleVisible.bindTo(widget.scopedContextKeyService);
		const chipVisible = ChatAgentHostFolderChipVisible.bindTo(widget.scopedContextKeyService);
		const selected = ChatAgentHostNewWorktreeSelected.bindTo(widget.scopedContextKeyService);
		const update = () => {
			visible.set(choices.offersOnlyNewWorktree());
			chipVisible.set(choices.offersChoices());
			selected.set(choices.isNewWorktreeSelected());
			// As the user answered before, once its configuration tells it can work in a new worktree
			const resource = widget.viewModel?.sessionResource;
			if (resource && !preselected.has(resource) && sendChoice.preselectsNewWorktree(resource, choices)) {
				preselected.add(resource);
				// Shown at once, as a send or a click waits for it to apply; shown as it is once it settled, also where it failed
				selected.set(true);
				sendChoice.preselectNewWorktree(resource, choices).then(() => {
					if (!this._store.isDisposed) {
						selected.set(choices.isNewWorktreeSelected());
					}
				});
			}
		};
		this._register(choices.onDidChange(update));
		this._register(widget.onDidChangeViewModel(update));
		this._register(configurationService.onDidChangeConfiguration(e => {
			// The worktrees follow by themselves, read once for the window
			if (e.affectsConfiguration(ChatConfiguration.EditorWindowEnableWorktree)) {
				update();
			}
		}));
		this._register(toDisposable(() => {
			visible.reset();
			chipVisible.reset();
			selected.reset();
		}));
		update();
	}
}

/** Gives each chat widget of the editor window its {@link AgentHostNewWorktreeToggle}. */
class AgentHostNewWorktreeToggleContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostNewWorktreeToggle';

	private readonly _toggles = this._register(new DisposableMap<IChatWidget>());

	constructor(
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		for (const widget of chatWidgetService.getAllWidgets()) {
			this._add(widget);
		}
		this._register(chatWidgetService.onDidAddWidget(widget => this._add(widget)));
		this._register(chatWidgetService.onDidRemoveWidget(widget => this._toggles.deleteAndDispose(widget)));
	}

	private _add(widget: IChatWidget): void {
		if (widget.location !== ChatAgentLocation.Chat || this._toggles.has(widget)) {
			return;
		}
		this._toggles.set(widget, this._instantiationService.createInstance(AgentHostNewWorktreeToggle, widget));
	}
}

export class ToggleAgentHostNewWorktreeAction extends Action2 {
	static readonly ID = 'workbench.action.chat.toggleAgentHostNewWorktree';
	constructor() {
		super({
			id: ToggleAgentHostNewWorktreeAction.ID,
			title: localize2('agentHost.newWorktreeToggle', "New Worktree"),
			tooltip: localize('agentHost.newWorktreeToggle.tooltip', "Start the session in a new worktree of the folder"),
			f1: false,
			// As the folder chip: only for a new chat, whose session has not started
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.chatSessionIsEmpty),
			toggled: ChatAgentHostNewWorktreeSelected,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 1.1,
				when: ContextKeyExpr.and(agentHostWorktreeChoicesWhen, ChatAgentHostNewWorktreeToggleVisible),
			}],
		});
	}

	override async run(accessor: ServicesAccessor, context?: IChatExecuteActionContext): Promise<void> {
		const widget = context?.widget ?? accessor.get(IChatWidgetService).lastFocusedWidget;
		if (!widget) {
			return;
		}
		// The chat it was clicked for: also once a preselection under way applied, never the one the widget shows by then
		const model = widget.viewModel?.model;
		const resource = widget.viewModel?.sessionResource;
		if (!model || !resource) {
			return;
		}
		const sendChoice = accessor.get(IAgentHostWorktreeSendChoiceService);
		const choices = accessor.get(IInstantiationService).createInstance(AgentHostWorktreeFolderChoices, () => resource);
		try {
			// Flips what the checkbox shows: a preselection under way, which it shows already, first applies
			await sendChoice.whenPreselected(resource);
			if (widget.viewModel?.model !== model) {
				// The widget closed or shows another chat meanwhile: the click was for a chat no longer shown
				return;
			}
			await choices.setNewWorktree(!choices.isNewWorktreeSelected());
			// The user's choice is their answer for later new chats in the folder
			sendChoice.rememberSelection(resource);
		} finally {
			choices.dispose();
		}
	}
}

/**
 * The New Worktree toggle in the chat input's toolbar: a checkbox with its name, as it stands in for the folder chip, rather
 * than the glyph a toolbar shows for a toggled action.
 */
export function createNewWorktreeCheckboxViewItem(action: IAction, options: IActionViewItemOptions, instantiationService: IInstantiationService): IActionViewItem | undefined {
	return action.id === ToggleAgentHostNewWorktreeAction.ID && action instanceof MenuItemAction
		? instantiationService.createInstance(ChatInputCheckboxActionViewItem, undefined, action, { ...options, label: true, checkboxStyles: { ...defaultCheckboxStyles, size: 14 } })
		: undefined;
}

/**
 * A checkbox sized as the chips of the chat input's toolbar it shows in (`chat-input-checkbox-item`): the compact checkbox
 * of the workbench's toolbars and chip rows (`size: 14`, its check at the compact codicon size), with the chips' text.
 */
class ChatInputCheckboxActionViewItem extends CheckboxActionViewItem {

	private readonly _onDidChangeSessionResource = this._register(new Emitter<void>());
	/** The chat widget of its toolbar's context, as it can be set again, and where that widget shows another chat. */
	private readonly _widgetListener = this._register(new MutableDisposable());

	constructor(
		context: unknown,
		action: IAction,
		options: ICheckboxActionViewItemOptions,
		@IAgentHostWorktreeSendChoiceService private readonly _sendChoice: IAgentHostWorktreeSendChoiceService,
	) {
		super(context, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-input-checkbox-item');
		// The chat it shows is its toolbar's, as the action runs for it
		this._register(markWorktreeSendChoiceTarget(container, this._sendChoice, () => this._widget()?.viewModel?.sessionResource, this._onDidChangeSessionResource.event));
	}

	override setActionContext(newContext: unknown): void {
		super.setActionContext(newContext);
		this._widgetListener.value = this._widget()?.onDidChangeViewModel(() => this._onDidChangeSessionResource.fire());
		this._onDidChangeSessionResource.fire();
	}

	private _widget() {
		return (this._context as IChatExecuteActionContext | undefined)?.widget;
	}
}

registerAction2(ToggleAgentHostNewWorktreeAction);
registerWorkbenchContribution2(AgentHostNewWorktreeToggleContribution.ID, AgentHostNewWorktreeToggleContribution, WorkbenchPhase.AfterRestored);
