/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentSession, IAgentSessionMetadata } from '../../../../platform/agentHost/common/agent.js';
import { CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID, readAgentModelSourceId } from '../../../../platform/agentHost/common/agentModelSource.js';
import { ICodexAccountInfo } from '../../../../platform/agentHost/common/codexAccount.js';
import { isPaidChatGPTPlan } from '../../../../platform/agentHost/common/codexAccountPlan.js';
import { parseCodexModelSelection, toCodexModelSelectionId } from '../../../../platform/agentHost/common/codexModelSelection.js';
import { SessionModelInfo } from '../../../../platform/agentHost/common/state/sessionState.js';

export const CODEX_CONTINUATION_MAX_AGE = 5 * 60 * 1000;
export type CodexContinuationSurface = 'agentsWindow' | 'editorWindow';
export interface ICodexLimitBoundary {
	readonly duration: number;
	readonly until: number;
	readonly observedAt: number;
	readonly reliable: boolean;
}
export interface ICodexContinuationEpisode {
	readonly limits: readonly ICodexLimitBoundary[];
	readonly owner: string;
	readonly surface: CodexContinuationSurface;
}
export interface ICodexContinuationCandidate {
	readonly session: IAgentSessionMetadata;
	readonly source: SessionModelInfo;
	readonly target: SessionModelInfo;
}

export function getCodexTriggeringLimits(account: ICodexAccountInfo, now: number): ICodexLimitBoundary[] {
	const observedAt = account.observedAt;
	if (account.status !== 'signedIn' || !isPaidChatGPTPlan(account.planType)
		|| observedAt === undefined || !Number.isFinite(observedAt) || observedAt > now || now - observedAt > CODEX_CONTINUATION_MAX_AGE) {
		return [];
	}
	return (account.rateLimits ?? (account.rateLimit ? [account.rateLimit] : [])).flatMap(limit => {
		const duration = limit.windowDurationMins;
		if ((duration !== 300 && duration !== 10080) || !Number.isFinite(limit.usedPercent) || limit.usedPercent < 90 || limit.usedPercent > 100) {
			return [];
		}
		const until = limit.resetsAt !== undefined ? limit.resetsAt * 1000 : observedAt + duration * 60 * 1000;
		return Number.isFinite(until) && until > now ? [{ duration, until, observedAt, reliable: limit.resetsAt !== undefined }] : [];
	});
}

/** Overlapping windows extend an episode; unknown resets never slide on repeated observations. */
export function updateCodexEpisode(episode: ICodexContinuationEpisode | undefined, account: ICodexAccountInfo, now: number): ICodexContinuationEpisode | undefined {
	if (!episode) {
		return undefined;
	}
	const fresh = account.observedAt !== undefined && account.observedAt <= now && now - account.observedAt <= CODEX_CONTINUATION_MAX_AGE;
	const retained = episode.limits.filter(boundary => boundary.until > now && (boundary.reliable || !fresh || !(account.rateLimits ?? (account.rateLimit ? [account.rateLimit] : [])).some(limit =>
		limit.windowDurationMins === boundary.duration && limit.usedPercent < 90 && account.observedAt! > boundary.observedAt)));
	if (!retained.length) {
		return undefined;
	}
	for (const boundary of getCodexTriggeringLimits(account, now)) {
		const index = retained.findIndex(previous => previous.duration === boundary.duration);
		if (index < 0) {
			retained.push(boundary);
		} else if (boundary.reliable && boundary.until > retained[index].until) {
			retained[index] = boundary;
		}
	}
	return { ...episode, limits: retained };
}

export function getCodexContinuationCandidates(sessions: readonly IAgentSessionMetadata[], models: readonly SessionModelInfo[], activeSession?: string): ICodexContinuationCandidate[] {
	const candidates: ICodexContinuationCandidate[] = [];
	for (const session of sessions) {
		if (AgentSession.provider(session.session) !== 'codex' || !session.model) {
			continue;
		}
		const selection = parseCodexModelSelection(session.model);
		const source = models.find(model => model.id === session.model?.id);
		if (selection.modelProvider !== 'openai' || !source || readAgentModelSourceId(source) !== CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID) {
			continue;
		}
		const target = models.find(model => model.id === toCodexModelSelectionId('vscode-proxy', selection.modelId) && model.policyState !== 'disabled');
		if (target) {
			candidates.push({ session, source, target });
		}
	}
	return candidates.sort((a, b) => Number(b.session.session.toString() === activeSession) - Number(a.session.session.toString() === activeSession)
		|| b.session.modifiedTime - a.session.modifiedTime);
}
