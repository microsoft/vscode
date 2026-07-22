/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { BranchChatSessionAction } from './branchChatSessionAction.js';
import { RunScriptContribution } from './runScriptAction.js';
import './nullInlineChatSessionService.js';
import './nullChatTipService.js';
import './modelPicker.js';
import './agentHostDelegation.js';
import './newSessionFolderQuickPickAction.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ISessionsTasksService, SessionsTasksService } from './sessionsTasksService.js';
import { ISessionTaskRunnerRegistry, SessionTaskRunnerRegistry } from './sessionTaskRunner.js';
import { RegisterDefaultSessionTaskRunnersContribution } from './registerDefaultSessionTaskRunners.js';
import { AgenticPromptsService } from './promptsService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { SessionsAICustomizationWorkspaceService } from './aiCustomizationWorkspaceService.js';
import { SessionsCustomizationHarnessService } from './customizationHarnessService.js';
import { IChatViewFactory } from '../../../services/chatView/browser/chatViewFactory.js';
import { ChatViewFactory } from './chatView.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SessionsChatAccessibilityHelp } from './sessionsChatAccessibilityHelp.js';
import { SessionsOpenerParticipantContribution } from './sessionsOpenerParticipant.js';
import { OpenSessionLinkOpenerContribution } from './openSessionLinkOpener.contribution.js';
import { WorktreeCreatedTaskDispatcher, AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING } from './worktreeCreatedTaskDispatcher.js';
import { LastTurnChangesMultiDiffSourceResolverContribution } from './lastTurnChangesMultiDiffSourceResolver.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from './sessionsChatHistory.js';
import '../../sessions/browser/mobile/mobileOverlayContribution.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorAreaFocusContext, SideBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { NEW_SESSION_ACTION_ID } from '../common/constants.js';
import { SessionsTitleBarNewSessionEnabledContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';


class NewChatInSessionsWindowAction extends Action2 {

	constructor() {
		super({
			id: NEW_SESSION_ACTION_ID,
			title: localize2('sessions.newSession.label', "New Session"),
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				// Don't shadow Ctrl/Cmd+N (and Ctrl/Cmd+L) when focus is in the
				// editor area so the standard editor commands (new untitled file,
				// expand line selection) handle the shortcut instead.
				when: EditorAreaFocusContext.negate(),
				primary: KeyMod.CtrlCmd | KeyCode.KeyN,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyL],
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyN,
					secondary: [KeyMod.WinCtrl | KeyCode.KeyL]
				},
			},
			menu: [
				{
					id: Menus.SidebarSessionsHeader,
					group: 'navigation',
					// Render before the filter (order 10) and find (order 20)
					// actions so the sessions sidebar header reads: New, Filter, Find.
					order: 0,
				},
				{
					id: Menus.TitleBarLeftLayout,
					group: 'navigation',
					order: 1,
					// Show in the titlebar only when the sidebar is hidden, gated behind an A/B experiment.
					when: ContextKeyExpr.and(SideBarVisibleContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionsTitleBarNewSessionEnabledContext)
				}
			]
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsService = accessor.get(ISessionsService);
		const activeSession = sessionsService.activeSession.get();
		// A quick chat never contributes its folder — it is workspace-less by
		// intent (any scratch working directory must not seed the workspace
		// composer), so it always falls to the New Session composer's folder picker.
		const isQuickChat = activeSession?.isQuickChat?.get() ?? false;
		sessionsService.openNewSession({
			folderUri: isQuickChat ? undefined : activeSession?.workspace.get()?.uri,
			providerId: activeSession?.providerId,
			sessionTypeId: activeSession?.sessionType,
		});
	}
}

registerAction2(NewChatInSessionsWindowAction);


// register actions
registerAction2(BranchChatSessionAction);

// register workbench contributions
registerWorkbenchContribution2(RunScriptContribution.ID, RunScriptContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsOpenerParticipantContribution.ID, SessionsOpenerParticipantContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(OpenSessionLinkOpenerContribution.ID, OpenSessionLinkOpenerContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(RegisterDefaultSessionTaskRunnersContribution.ID, RegisterDefaultSessionTaskRunnersContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(WorktreeCreatedTaskDispatcher.ID, WorktreeCreatedTaskDispatcher, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(LastTurnChangesMultiDiffSourceResolverContribution.ID, LastTurnChangesMultiDiffSourceResolverContribution, WorkbenchPhase.BlockRestore);

// register services
registerSingleton(IPromptsService, AgenticPromptsService, InstantiationType.Delayed);
registerSingleton(ISessionTaskRunnerRegistry, SessionTaskRunnerRegistry, InstantiationType.Delayed);
registerSingleton(ISessionsTasksService, SessionsTasksService, InstantiationType.Delayed);
registerSingleton(IAICustomizationWorkspaceService, SessionsAICustomizationWorkspaceService, InstantiationType.Delayed);
registerSingleton(ICustomizationHarnessService, SessionsCustomizationHarnessService, InstantiationType.Delayed);
registerSingleton(IChatViewFactory, ChatViewFactory, InstantiationType.Delayed);

// register accessibility help
AccessibleViewRegistry.register(new SessionsChatAccessibilityHelp());

// register configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.agentHost.runWorktreeCreatedTasks', "Whether to automatically run tasks tagged with `\"runOptions\": { \"runOn\": \"worktreeCreated\" }` when a new agent host session worktree is created. Manual `Run Task` invocations are unaffected."),
		},
		[AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.agentSessions.scopedInputHistory', "Controls whether chat input history in the Agents Window is scoped to the current session. Disable this to use shared input history across sessions."),
		},
	},
});
