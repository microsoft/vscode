/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatSendResult, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ActiveSessionContextKeys, IsolationMode } from '../../changes/common/changes.js';
import { BaseAgentHostSessionsProvider } from './baseAgentHostSessionsProvider.js';

/**
 * True when the active session (in the Sessions window) is provided by an
 * agent-host sessions provider (local or remote). Used to gate the built-in
 * skill toolbar buttons and to suppress the Copilot CLI extension's own
 * buttons for the same sessions.
 */
export const IsAgentHostSession = new RawContextKey<boolean>('sessions.isAgentHostSession', false);

/**
 * Binds {@link IsAgentHostSession} to the global context key service based on
 * the active session's provider — true iff the provider is a
 * {@link BaseAgentHostSessionsProvider}.
 */
export class IsAgentHostSessionContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentHost.isAgentHostSession';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		this._register(bindContextKey(IsAgentHostSession, contextKeyService, reader => {
			const activeSession = sessionsManagementService.activeSession.read(reader);
			if (!activeSession) {
				return false;
			}
			const provider = sessionsProvidersService.getProvider(activeSession.providerId);
			return provider instanceof BaseAgentHostSessionsProvider;
		}));
	}
}

registerWorkbenchContribution2(IsAgentHostSessionContextContribution.ID, IsAgentHostSessionContextContribution, WorkbenchPhase.AfterRestored);

/**
 * Toolbar buttons in the changes view that drive the built-in agent-host skills
 * (`merge` / `create-pr` / `create-draft-pr` / `update-pr`) for any
 * `agent-host-*` session.
 *
 * They mirror the buttons the Copilot CLI extension contributes for its own
 * `chatSessionType == copilotcli` sessions, sending the same `/<skill-name>`
 * prompt as if the user typed it. The skills themselves are bundled into every
 * agent-host session via the synced customization bundler picking up
 * {@link PromptsType.skill} entries with `BUILTIN_STORAGE`.
 */

interface IAgentHostSkillButtonSpec {
	readonly id: string;
	readonly title: ILocalizedString;
	readonly skill: string;
	readonly icon: ThemeIcon;
	readonly group: string;
	readonly order: number;
	readonly extraWhen: ContextKeyExpression | undefined;
}

const AGENT_HOST_SKILL_BUTTON_ID_PREFIX = 'workbench.action.agentSessions.runSkill.';

const AGENT_HOST_SKILL_BUTTONS: readonly IAgentHostSkillButtonSpec[] = [
	{
		id: `${AGENT_HOST_SKILL_BUTTON_ID_PREFIX}merge`,
		title: localize2('agentSessions.runSkill.merge', "Merge Changes"),
		skill: 'merge',
		icon: Codicon.gitMerge,
		group: 'merge',
		order: 1,
		extraWhen: ContextKeyExpr.and(
			ActiveSessionContextKeys.IsolationMode.isEqualTo(IsolationMode.Worktree),
			ActiveSessionContextKeys.IsMergeBaseBranchProtected.negate(),
			ActiveSessionContextKeys.HasPullRequest.negate(),
			ContextKeyExpr.or(ActiveSessionContextKeys.HasUncommittedChanges, ActiveSessionContextKeys.HasOutgoingChanges),
		),
	},
	{
		id: `${AGENT_HOST_SKILL_BUTTON_ID_PREFIX}createPR`,
		title: localize2('agentSessions.runSkill.createPR', "Create Pull Request"),
		skill: 'create-pr',
		icon: Codicon.gitPullRequestCreate,
		group: 'pull_request',
		order: 1,
		extraWhen: ContextKeyExpr.and(
			ActiveSessionContextKeys.IsolationMode.isEqualTo(IsolationMode.Worktree),
			ActiveSessionContextKeys.HasGitHubRemote,
			ActiveSessionContextKeys.HasPullRequest.negate(),
			ContextKeyExpr.or(ActiveSessionContextKeys.HasUncommittedChanges, ActiveSessionContextKeys.HasOutgoingChanges),
		),
	},
	{
		id: `${AGENT_HOST_SKILL_BUTTON_ID_PREFIX}createDraftPR`,
		title: localize2('agentSessions.runSkill.createDraftPR', "Create Draft Pull Request"),
		skill: 'create-draft-pr',
		icon: Codicon.gitPullRequestDraft,
		group: 'pull_request',
		order: 2,
		extraWhen: ContextKeyExpr.and(
			ActiveSessionContextKeys.IsolationMode.isEqualTo(IsolationMode.Worktree),
			ActiveSessionContextKeys.HasGitHubRemote,
			ActiveSessionContextKeys.HasPullRequest.negate(),
			ContextKeyExpr.or(ActiveSessionContextKeys.HasUncommittedChanges, ActiveSessionContextKeys.HasOutgoingChanges),
		),
	},
	{
		id: `${AGENT_HOST_SKILL_BUTTON_ID_PREFIX}updatePR`,
		title: localize2('agentSessions.runSkill.updatePR', "Sync Pull Request"),
		skill: 'update-pr',
		icon: Codicon.repoPush,
		group: 'pull_request',
		order: 1,
		extraWhen: ContextKeyExpr.and(
			ActiveSessionContextKeys.IsolationMode.isEqualTo(IsolationMode.Worktree),
			ActiveSessionContextKeys.HasGitHubRemote,
			ActiveSessionContextKeys.HasPullRequest,
			ActiveSessionContextKeys.HasOpenPullRequest,
			ContextKeyExpr.or(
				ActiveSessionContextKeys.HasIncomingChanges,
				ActiveSessionContextKeys.HasOutgoingChanges,
				ActiveSessionContextKeys.HasUncommittedChanges,
			),
		),
	},
];

/**
 * The `update-pr` button gets the same outgoing-changes count badge styling
 * as the Copilot CLI extension's Sync PR button. Exported so the changes
 * view can pick it out of the toolbar without re-deriving the ID.
 */
export const AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID = `${AGENT_HOST_SKILL_BUTTON_ID_PREFIX}updatePR`;

/**
 * True for any {@link Action2#id} created by this module. Used by the changes
 * view to apply primary-button styling.
 */
export function isAgentHostSkillButtonId(actionId: string): boolean {
	return actionId.startsWith(AGENT_HOST_SKILL_BUTTON_ID_PREFIX);
}

function registerAgentHostSkillButton(spec: IAgentHostSkillButtonSpec): void {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: spec.id,
				title: spec.title,
				icon: spec.icon,
				f1: false,
				menu: {
					id: MenuId.AgentsChangesPrimaryActionSubMenu,
					group: spec.group,
					order: spec.order,
					when: ContextKeyExpr.and(
						IsSessionsWindowContext,
						IsAgentHostSession,
						ActiveSessionContextKeys.HasGitRepository,
						spec.extraWhen,
					),
				},
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const sessionsManagementService = accessor.get(ISessionsManagementService);
			const chatService = accessor.get(IChatService);

			const activeSession = sessionsManagementService.activeSession.get();
			if (!activeSession) {
				return;
			}

			// `activeSession.resource.scheme` matches the chat session
			// contribution `type` registered for the agent-host (e.g.
			// `agent-host-copilotcli`), which is the agent id the chat
			// service uses for routing. The `sessionType` field is the
			// logical, user-facing id (e.g. `copilotcli`) that is shared
			// between the Copilot CLI extension and the local/remote
			// agent-host providers, so it is NOT a valid agent id here.
			const agentId = activeSession.resource.scheme;
			const prompt = `/${spec.skill}`;
			const ref = await chatService.acquireOrLoadSession(activeSession.resource, ChatAgentLocation.Chat, CancellationToken.None, 'AgentHostSkillButton');
			try {
				let result = await chatService.sendRequest(activeSession.resource, prompt, { agentIdSilent: agentId });
				if (ChatSendResult.isQueued(result)) {
					result = await result.deferred;
				}
				if (ChatSendResult.isSent(result)) {
					await result.data.responseCompletePromise;
				}
			} finally {
				ref?.dispose();
			}
		}
	});
}

for (const spec of AGENT_HOST_SKILL_BUTTONS) {
	registerAgentHostSkillButton(spec);
}
