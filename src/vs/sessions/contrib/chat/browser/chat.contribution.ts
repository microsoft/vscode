/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { BranchChatSessionAction } from './branchChatSessionAction.js';
import { RunScriptContribution } from './runScriptAction.js';
import './nullInlineChatSessionService.js';
import './nullChatTipService.js';
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
import { WorktreeCreatedTaskDispatcher, AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING } from './worktreeCreatedTaskDispatcher.js';
import '../../sessions/browser/mobile/mobileOverlayContribution.js';
import { Registry } from '../../../../platform/registry/common/platform.js';


class NewChatInSessionsWindowAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.sessions.newChat',
			title: localize2('chat.newEdits.label', "New Chat"),
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 2,
				primary: KeyMod.CtrlCmd | KeyCode.KeyN,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyL],
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyN,
					secondary: [KeyMod.WinCtrl | KeyCode.KeyL]
				},
			}
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		sessionsManagementService.openNewSessionView();
	}
}

registerAction2(NewChatInSessionsWindowAction);


// register actions
registerAction2(BranchChatSessionAction);

// register workbench contributions
registerWorkbenchContribution2(RunScriptContribution.ID, RunScriptContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsOpenerParticipantContribution.ID, SessionsOpenerParticipantContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(RegisterDefaultSessionTaskRunnersContribution.ID, RegisterDefaultSessionTaskRunnersContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(WorktreeCreatedTaskDispatcher.ID, WorktreeCreatedTaskDispatcher, WorkbenchPhase.AfterRestored);

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
	},
});
