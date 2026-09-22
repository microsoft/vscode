/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { type IAgentCreateSessionConfig, CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID } from '../../../common/agent.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { createSessionComparisonJudgePrompt, createSessionComparisonSynthesisPrompt } from '../../../common/sessionComparisonPrompts.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { readSessionComparisonMetadata, SessionStatus, withSessionComparisonMetadata, type AgentSessionComparisonRole, type IAgentSessionComparisonHarnessMetadata, type IAgentSessionComparisonLaunchMetadata } from '../../../common/state/sessionState.js';
import { ClaudeSessionConfigKey, narrowClaudePermissionMode } from '../../../common/claudeSessionConfigKeys.js';
import { CodexSessionConfigKey, narrowCodexPermissionsPreset } from '../../../common/codexSessionConfigKeys.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { ILogService } from '../../../../log/common/log.js';
import { IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostSessionPromptService } from '../../agentHostSessionPromptService.js';

const COPILOT_CLI_AGENT_PROVIDER_ID = 'copilotcli';

interface IComparisonAttemptState {
	readonly session: string;
	readonly status: SessionStatus;
	readonly createdAt: string;
	readonly modifiedAt: string;
	readonly activeClientCount: number;
}

interface IComparisonJudgeState {
	readonly status: SessionStatus;
	readonly createdAt: string;
	readonly modifiedAt: string;
	readonly activeClientCount: number;
}

interface IComparisonLaunchState {
	readonly attemptCount: number;
	readonly launch: IAgentSessionComparisonLaunchMetadata;
	readonly attempts: readonly IComparisonAttemptState[];
	readonly judge: IComparisonJudgeState | undefined;
	readonly synthesisExists: boolean;
}

/**
 * Fallback orchestration path that lets Agent Host launch comparison Judge
 * and Synthesizer sessions after disconnects so orchestration can continue
 * without a connected client.
 */
export class SessionComparisonJudgeLaunchContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'sessionComparisonJudgeLaunch';
	readonly order = 250;

	private readonly _startingComparisons = new Set<string>();

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostStateManager private readonly _stateManager: IAgentHostStateManager,
		@IAgentHostSessionPromptService private readonly _sessionPromptService: IAgentHostSessionPromptService,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.rejectionReason !== undefined) {
			return;
		}
		switch (dispatched.action.type) {
			case ActionType.ChatTurnComplete:
			case ActionType.ChatError:
			case ActionType.SessionActiveClientRemoved:
				break;
			default:
				return;
		}
		const summary = this._stateManager.getSessionSummary(dispatched.session);
		const comparison = readSessionComparisonMetadata(summary?._meta);
		if (!comparison) {
			return;
		}
		void this._maybeLaunchComparisonSession(comparison.id);
	}

	private async _maybeLaunchComparisonSession(comparisonId: string): Promise<void> {
		if (this._startingComparisons.has(comparisonId)) {
			return;
		}
		const launch = this._collectLaunchState(comparisonId);
		if (!launch) {
			return;
		}
		const nextLaunch = this._resolveNextLaunch(comparisonId, launch);
		if (!nextLaunch) {
			return;
		}
		this._startingComparisons.add(comparisonId);
		try {
			const createConfig = this._buildSessionConfig(comparisonId, launch.attemptCount, nextLaunch.role, nextLaunch.harness, launch.launch.branch, launch.launch.workspace);
			await this._sessionPromptService.startSessionPrompt(createConfig, nextLaunch.prompt);
		} catch (error) {
			this._logService.warn(`[SessionComparisonJudgeLaunchContribution] Failed to launch ${nextLaunch.role} for comparison '${comparisonId}'.`, error);
		} finally {
			this._startingComparisons.delete(comparisonId);
		}
	}

	private _resolveNextLaunch(comparisonId: string, launchState: IComparisonLaunchState): { readonly role: 'judge' | 'synthesis'; readonly harness: IAgentSessionComparisonHarnessMetadata; readonly prompt: string } | undefined {
		if (this._shouldLaunchJudge(launchState)) {
			return {
				role: 'judge',
				harness: launchState.launch.judge,
				prompt: createSessionComparisonJudgePrompt(comparisonId),
			};
		}
		if (this._shouldLaunchSynthesis(launchState) && launchState.launch.synthesis) {
			return {
				role: 'synthesis',
				harness: launchState.launch.synthesis,
				prompt: createSessionComparisonSynthesisPrompt(comparisonId),
			};
		}
		return undefined;
	}

	private _shouldLaunchJudge(launchState: IComparisonLaunchState): boolean {
		if (launchState.judge || launchState.attempts.length < launchState.attemptCount) {
			return false;
		}
		return this._countSuccessfulAttempts(launchState.attempts) >= 2;
	}

	private _shouldLaunchSynthesis(launchState: IComparisonLaunchState): boolean {
		if (!launchState.launch.synthesis || launchState.synthesisExists || !launchState.judge) {
			return false;
		}
		const judge = launchState.judge;
		if ((judge.status & SessionStatus.InProgress) === SessionStatus.InProgress || (judge.status & SessionStatus.Error) === SessionStatus.Error) {
			return false;
		}
		if (judge.modifiedAt === judge.createdAt) {
			return false;
		}
		return this._countSuccessfulAttempts(launchState.attempts) >= 2;
	}

	private _collectLaunchState(comparisonId: string): IComparisonLaunchState | undefined {
		let judge: IComparisonJudgeState | undefined;
		let synthesisExists = false;
		let launch: IAgentSessionComparisonLaunchMetadata | undefined;
		let attemptCount: number | undefined;
		const attempts: IComparisonAttemptState[] = [];
		for (const session of this._stateManager.getSessionUris()) {
			const summary = this._stateManager.getSessionSummary(session);
			const comparison = readSessionComparisonMetadata(summary?._meta);
			if (!summary || !comparison || comparison.id !== comparisonId) {
				continue;
			}
			switch (comparison.role) {
				case 'judge': {
					const state = this._stateManager.getSessionState(session);
					if (!state) {
						return undefined;
					}
					judge = {
						status: summary.status,
						createdAt: summary.createdAt,
						modifiedAt: summary.modifiedAt,
						activeClientCount: state.activeClients.length,
					};
					break;
				}
				case 'synthesis':
					synthesisExists = true;
					break;
				case 'attempt': {
					attemptCount = attemptCount ?? comparison.attemptCount;
					launch = launch ?? comparison.launch;
					const state = this._stateManager.getSessionState(session);
					if (!state) {
						return undefined;
					}
					attempts.push({
						session,
						status: summary.status,
						createdAt: summary.createdAt,
						modifiedAt: summary.modifiedAt,
						activeClientCount: state.activeClients.length,
					});
					break;
				}
			}
		}
		if (!launch || attemptCount === undefined || attempts.length < attemptCount) {
			return undefined;
		}
		const participantsHaveActiveClients = attempts.some(attempt => attempt.activeClientCount > 0) || (judge?.activeClientCount ?? 0) > 0;
		if (participantsHaveActiveClients) {
			return undefined;
		}
		if (attempts.some(attempt => (attempt.status & SessionStatus.InProgress) === SessionStatus.InProgress)) {
			return undefined;
		}
		return { attemptCount, launch, attempts, judge, synthesisExists };
	}

	private _countSuccessfulAttempts(attempts: readonly IComparisonAttemptState[]): number {
		let successfulAttempts = 0;
		for (const attempt of attempts) {
			if ((attempt.status & SessionStatus.Error) === SessionStatus.Error) {
				continue;
			}
			if (attempt.modifiedAt === attempt.createdAt) {
				continue;
			}
			successfulAttempts++;
		}
		return successfulAttempts;
	}

	private _buildSessionConfig(comparisonId: string, attemptCount: number, role: AgentSessionComparisonRole, harness: IAgentSessionComparisonHarnessMetadata, branch: string | undefined, workspace: string): IAgentCreateSessionConfig {
		const permissionConfig = resolvePermissionConfig(harness.sessionTypeId, harness.permissionId);
		if (harness.permissionId && !permissionConfig) {
			this._logService.warn(`[SessionComparisonJudgeLaunchContribution] Ignoring unsupported permission '${harness.permissionId}' for session type '${harness.sessionTypeId}'.`);
		}
		const config: Record<string, unknown> = {
			[SessionConfigKey.Isolation]: 'worktree',
			...(branch ? { [SessionConfigKey.Branch]: branch } : {}),
			...(permissionConfig ?? {}),
		};
		return {
			provider: harness.sessionTypeId,
			workingDirectories: [URI.parse(workspace)],
			config,
			...(harness.modelId ? {
				model: {
					id: harness.modelId,
					...(harness.modelConfiguration ? { config: { ...harness.modelConfiguration } } : {}),
				},
			} : {}),
			_meta: withSessionComparisonMetadata(undefined, {
				id: comparisonId,
				role,
				attemptCount,
			}),
		};
	}
}

function resolvePermissionConfig(sessionTypeId: string, permissionId: string | undefined): Record<string, unknown> | undefined {
	if (!permissionId) {
		return undefined;
	}
	switch (sessionTypeId) {
		case COPILOT_CLI_AGENT_PROVIDER_ID:
			return {
				[SessionConfigKey.Mode]: 'interactive',
				[SessionConfigKey.AutoApprove]: permissionId,
			};
		case CLAUDE_AGENT_PROVIDER_ID: {
			const permissionMode = narrowClaudePermissionMode(permissionId);
			return permissionMode ? { [ClaudeSessionConfigKey.PermissionMode]: permissionMode } : undefined;
		}
		case CODEX_AGENT_PROVIDER_ID: {
			const permissionsPreset = narrowCodexPermissionsPreset(permissionId);
			return permissionsPreset ? {
				[SessionConfigKey.Mode]: 'interactive',
				[CodexSessionConfigKey.PermissionsPreset]: permissionsPreset,
			} : undefined;
		}
		default:
			return undefined;
	}
}
