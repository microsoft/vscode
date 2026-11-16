/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { IActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { CheckboxActionViewItem } from '../../../../../../base/browser/ui/toggle/toggle.js';
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
import './media/agentHostChatInputPicker.css';

/** Whether the chat input offers New Worktree as a checkbox rather than the folder chip: while the folder has no worktrees. */
export const ChatAgentHostNewWorktreeToggleVisible = new RawContextKey<boolean>('chatAgentHostNewWorktreeToggleVisible', false, { type: 'boolean', description: localize('chatAgentHostNewWorktreeToggleVisible', "Whether the chat input offers New Worktree as a checkbox, as the folder has no worktrees.") });
/** Whether the chat input shows the folder chip: while it offers more than the folder the session works in already. */
export const ChatAgentHostFolderChipVisible = new RawContextKey<boolean>('chatAgentHostFolderChipVisible', false, { type: 'boolean', description: localize('chatAgentHostFolderChipVisible', "Whether the chat input shows the folder chip, as it offers more than the folder the session works in already.") });
/** Whether the session of the chat input is to work in a new worktree of its folder. */
export const ChatAgentHostNewWorktreeSelected = new RawContextKey<boolean>('chatAgentHostNewWorktreeSelected', false, { type: 'boolean', description: localize('chatAgentHostNewWorktreeSelected', "Whether the session of the chat input is to work in a new worktree of its folder.") });

/** The rendered worktree controls of chat inputs: New Worktree checkboxes and folder chips. */
const worktreeControls = new Set<HTMLElement>();

/** Makes `element`, a rendered worktree control of a chat input, known as one, until disposed. */
export function registerWorktreeControl(element: HTMLElement): IDisposable {
	worktreeControls.add(element);
	return toDisposable(() => worktreeControls.delete(element));
}

/**
 * The visible worktree control in `container`, such as a chat widget's: its New Worktree checkbox, else its folder chip. Not
 * one that is hidden or no longer in the document, which a callout could not point at.
 */
export function getWorktreeControl(container: HTMLElement): HTMLElement | undefined {
	const controls = [...worktreeControls].filter(control => container.contains(control) && control.isConnected && control.getClientRects().length > 0);
	return controls.find(control => control.classList.contains('chat-input-checkbox-item')) ?? controls[0];
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
	) {
		super();
		const choices = this._register(instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => widget.viewModel?.sessionResource));
		const visible = ChatAgentHostNewWorktreeToggleVisible.bindTo(widget.scopedContextKeyService);
		const chipVisible = ChatAgentHostFolderChipVisible.bindTo(widget.scopedContextKeyService);
		const selected = ChatAgentHostNewWorktreeSelected.bindTo(widget.scopedContextKeyService);
		const update = () => {
			visible.set(choices.offersOnlyNewWorktree());
			chipVisible.set(choices.offersChoices());
			selected.set(choices.isNewWorktreeSelected());
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
		const choices = accessor.get(IInstantiationService).createInstance(AgentHostWorktreeFolderChoices, () => widget.viewModel?.sessionResource);
		try {
			await choices.setNewWorktree(!choices.isNewWorktreeSelected());
		} finally {
			choices.dispose();
		}
	}
}

/**
 * The New Worktree toggle in the chat input's toolbar: a checkbox with its name, as it stands in for the folder chip, rather
 * than the glyph a toolbar shows for a toggled action.
 */
export function createNewWorktreeCheckboxViewItem(action: IAction, options: IActionViewItemOptions): IActionViewItem | undefined {
	return action.id === ToggleAgentHostNewWorktreeAction.ID && action instanceof MenuItemAction
		? new ChatInputCheckboxActionViewItem(undefined, action, { ...options, label: true, checkboxStyles: { ...defaultCheckboxStyles, size: 14 } })
		: undefined;
}

/**
 * A checkbox sized as the chips of the chat input's toolbar it shows in (`chat-input-checkbox-item`): the compact checkbox
 * of the workbench's toolbars and chip rows (`size: 14`, its check at the compact codicon size), with the chips' text.
 */
class ChatInputCheckboxActionViewItem extends CheckboxActionViewItem {
	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-input-checkbox-item');
		this._register(registerWorktreeControl(container));
	}
}

registerAction2(ToggleAgentHostNewWorktreeAction);
registerWorkbenchContribution2(AgentHostNewWorktreeToggleContribution.ID, AgentHostNewWorktreeToggleContribution, WorkbenchPhase.AfterRestored);
