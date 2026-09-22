/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { type IAgentCreateSessionConfig, CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID } from '../../../common/agent.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { createSessionComparisonJudgePrompt } from '../../../common/sessionComparisonPrompts.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { readSessionComparisonMetadata, SessionStatus, withSessionComparisonMetadata, type IAgentSessionComparisonLaunchMetadata } from '../../../common/state/sessionState.js';
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

interface IComparisonJudgeLaunchState {
	readonly attemptCount: number;
	readonly launch: IAgentSessionComparisonLaunchMetadata;
}

/**
 * Fallback orchestration path that lets Agent Host launch a comparison Judge
 * after attempt sessions finish when no client remains connected to continue
 * client-owned orchestration.
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
		if (!comparison || comparison.role !== 'attempt' || !comparison.launch) {
			return;
		}
		void this._maybeLaunchJudge(comparison.id);
	}

	private async _maybeLaunchJudge(comparisonId: string): Promise<void> {
		if (this._startingComparisons.has(comparisonId)) {
			return;
		}
		const launch = this._collectLaunchState(comparisonId);
		if (!launch) {
			return;
		}
		this._startingComparisons.add(comparisonId);
		try {
			const createConfig = this._buildJudgeSessionConfig(comparisonId, launch);
			await this._sessionPromptService.startSessionPrompt(createConfig, createSessionComparisonJudgePrompt(comparisonId));
		} catch (error) {
			this._logService.warn(`[SessionComparisonJudgeLaunchContribution] Failed to launch Judge for comparison '${comparisonId}'.`, error);
		} finally {
			this._startingComparisons.delete(comparisonId);
		}
	}

	private _collectLaunchState(comparisonId: string): IComparisonJudgeLaunchState | undefined {
		let judgeExists = false;
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
				case 'judge':
					judgeExists = true;
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
		if (judgeExists || !launch || attemptCount === undefined || attempts.length < attemptCount) {
			return undefined;
		}
		if (attempts.some(attempt => attempt.activeClientCount > 0)) {
			return undefined;
		}
		let successfulAttempts = 0;
		for (const attempt of attempts) {
			if ((attempt.status & SessionStatus.InProgress) === SessionStatus.InProgress) {
				return undefined;
			}
			if ((attempt.status & SessionStatus.Error) === SessionStatus.Error) {
				continue;
			}
			if (attempt.modifiedAt === attempt.createdAt) {
				return undefined;
			}
			successfulAttempts++;
		}
		if (successfulAttempts < 2) {
			return undefined;
		}
		return { attemptCount, launch };
	}

	private _buildJudgeSessionConfig(comparisonId: string, launchState: IComparisonJudgeLaunchState): IAgentCreateSessionConfig {
		const launch = launchState.launch;
		const permissionConfig = resolvePermissionConfig(launch.judge.sessionTypeId, launch.judge.permissionId);
		if (launch.judge.permissionId && !permissionConfig) {
			this._logService.warn(`[SessionComparisonJudgeLaunchContribution] Ignoring unsupported permission '${launch.judge.permissionId}' for session type '${launch.judge.sessionTypeId}'.`);
		}
		const config: Record<string, unknown> = {
			[SessionConfigKey.Isolation]: 'worktree',
			...(launch.branch ? { [SessionConfigKey.Branch]: launch.branch } : {}),
			...(permissionConfig ?? {}),
		};
		return {
			provider: launch.judge.sessionTypeId,
			workingDirectories: [URI.parse(launch.workspace)],
			config,
			...(launch.judge.modelId ? {
				model: {
					id: launch.judge.modelId,
					...(launch.judge.modelConfiguration ? { config: { ...launch.judge.modelConfiguration } } : {}),
				},
			} : {}),
			_meta: withSessionComparisonMetadata(undefined, {
				id: comparisonId,
				role: 'judge',
				attemptCount: launchState.attemptCount,
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
