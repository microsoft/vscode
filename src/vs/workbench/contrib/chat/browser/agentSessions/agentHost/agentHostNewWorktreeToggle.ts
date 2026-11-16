/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
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

/** Whether the chat input offers New Worktree as a checkbox rather than the folder chip: while the folder has no worktrees. */
export const ChatAgentHostNewWorktreeToggleVisible = new RawContextKey<boolean>('chatAgentHostNewWorktreeToggleVisible', false, { type: 'boolean', description: localize('chatAgentHostNewWorktreeToggleVisible', "Whether the chat input offers New Worktree as a checkbox, as the folder has no worktrees.") });
/** Whether the session of the chat input is to work in a new worktree of its folder. */
export const ChatAgentHostNewWorktreeSelected = new RawContextKey<boolean>('chatAgentHostNewWorktreeSelected', false, { type: 'boolean', description: localize('chatAgentHostNewWorktreeSelected', "Whether the session of the chat input is to work in a new worktree of its folder.") });

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
 * Keeps the {@link ChatAgentHostNewWorktreeToggleVisible} and {@link ChatAgentHostNewWorktreeSelected} of a chat widget's
 * input as its session's worktree choices are: as the folder comes to have worktrees or no longer has any, and as the
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
		const selected = ChatAgentHostNewWorktreeSelected.bindTo(widget.scopedContextKeyService);
		const update = () => {
			visible.set(choices.offersOnlyNewWorktree());
			selected.set(choices.isNewWorktreeSelected());
		};
		this._register(choices.onDidChange(update));
		this._register(widget.onDidChangeViewModel(update));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.EditorWindowEnableWorktree) || e.affectsConfiguration('chat.viewSessions.sessionsList.enabled')) {
				// The worktrees too: they are read only while worktree support is on
				choices.refresh();
				update();
			}
		}));
		this._register(toDisposable(() => {
			visible.reset();
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

class ToggleAgentHostNewWorktreeAction extends Action2 {
	static readonly ID = 'workbench.action.chat.toggleAgentHostNewWorktree';
	constructor() {
		super({
			id: ToggleAgentHostNewWorktreeAction.ID,
			title: localize2('agentHost.newWorktreeToggle', "New Worktree"),
			tooltip: localize('agentHost.newWorktreeToggle.tooltip', "Start the session in a new worktree of the folder"),
			icon: Codicon.worktree,
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

registerAction2(ToggleAgentHostNewWorktreeAction);
registerWorkbenchContribution2(AgentHostNewWorktreeToggleContribution.ID, AgentHostNewWorktreeToggleContribution, WorkbenchPhase.AfterRestored);
