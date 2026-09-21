/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { getReasoningEffortLabel, isReasoningEffortLevel, ReasoningEffortConfigKey } from '../../../../platform/agentHost/common/reasoningEffort.js';

export const enum SessionComparisonParticipantRole {
	Coordinator = 'coordinator',
	Attempt = 'attempt',
	Judge = 'judge',
	Synthesis = 'synthesis',
}

export const enum SessionComparisonValidationState {
	Passed = 'passed',
	Failed = 'failed',
	NotRun = 'notRun',
	NotApplicable = 'notApplicable',
	Unknown = 'unknown',
}

export const enum SessionComparisonValidationSource {
	AttemptReport = 'attemptReport',
	JudgeRun = 'judgeRun',
	NotApplicable = 'notApplicable',
	Unavailable = 'unavailable',
}

export type SessionComparisonValidationEvidence =
	| {
		readonly state: SessionComparisonValidationState.Passed | SessionComparisonValidationState.Failed;
		readonly source: SessionComparisonValidationSource.AttemptReport | SessionComparisonValidationSource.JudgeRun;
	}
	| {
		readonly state: SessionComparisonValidationState.NotRun | SessionComparisonValidationState.Unknown;
		readonly source: SessionComparisonValidationSource.AttemptReport | SessionComparisonValidationSource.JudgeRun | SessionComparisonValidationSource.Unavailable;
	}
	| {
		readonly state: SessionComparisonValidationState.NotApplicable;
		readonly source: SessionComparisonValidationSource.NotApplicable;
	};

export interface ISessionComparisonHarness {
	readonly providerId: string;
	readonly sessionTypeId: string;
	readonly label: string;
	readonly modelId?: string;
	readonly modelLabel?: string;
	readonly modelConfiguration?: Readonly<Record<string, string | number | boolean | null>>;
	readonly permissionId?: string;
	readonly permissionLabel?: string;
}

export interface ISessionComparisonAttemptConfiguration {
	readonly id: string;
	readonly harness: ISessionComparisonHarness;
}

export interface ISessionComparisonParticipant {
	readonly id: string;
	readonly role: SessionComparisonParticipantRole;
	readonly harness: ISessionComparisonHarness;
	readonly sessionResource?: URI;
	readonly launchError?: string;
	readonly completion?: {
		readonly elapsedMs?: number;
		readonly tokenCount?: number;
	};
}

export interface ISessionComparisonAttemptVerdict {
	readonly participantId: string;
	readonly summary: string;
	readonly validation: {
		readonly tests: SessionComparisonValidationEvidence;
		readonly build: SessionComparisonValidationEvidence;
		readonly lint: SessionComparisonValidationEvidence;
		readonly diagnostics: SessionComparisonValidationEvidence;
	};
	readonly unresolvedIssues: readonly string[];
	readonly notableDifferences: readonly string[];
}

export interface ISessionComparisonDecisionOption {
	readonly participantId: string;
	readonly approach: string;
	/** Undefined for verdicts persisted before decision assessments were introduced. */
	readonly assessment?: SessionComparisonDecisionAssessment;
}

export const enum SessionComparisonDecisionAssessment {
	Better = 'better',
	Neutral = 'neutral',
	Worse = 'worse',
}

export interface ISessionComparisonDecisionSection {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly affectedFiles: readonly string[];
	readonly options: readonly ISessionComparisonDecisionOption[];
	readonly recommendedParticipantId: string;
}

export interface ISessionComparisonRationale {
	readonly comparison: string;
	readonly validation: string;
	readonly codeQuality: string;
	readonly solution: string;
}

export interface ISessionComparisonVerdict {
	readonly recommendedParticipantId: string;
	readonly explanation: string;
	/** Undefined for verdicts persisted before categorized rationale was introduced. */
	readonly rationale?: ISessionComparisonRationale;
	readonly conflicts: readonly string[];
	readonly attempts: readonly ISessionComparisonAttemptVerdict[];
	readonly decisionSections?: readonly ISessionComparisonDecisionSection[];
}

export interface ISessionComparisonSynthesisSelection {
	readonly sectionId: string;
	/** Undefined means the synthesis agent should decide for this section. */
	readonly participantId?: string;
}

export const SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH = 4000;
export const COMPARE_AGENTS_ENABLED_SETTING = 'sessions.chat.compareAgents.enabled';

export interface ISessionComparisonSynthesisPlan {
	readonly selections: readonly ISessionComparisonSynthesisSelection[];
	readonly instructions?: string;
}

export interface ISessionComparison {
	readonly id: string;
	readonly groupId: string;
	readonly title: string;
	readonly createdAt: number;
	readonly workspace: URI;
	readonly prompt: string;
	readonly attachedContext?: readonly IChatRequestVariableEntry[];
	readonly branch?: string;
	/** Retained for comparisons persisted before execution presets were introduced. */
	readonly permissionLevel?: string;
	readonly judgeHarness?: ISessionComparisonHarness;
	readonly synthesisHarness?: ISessionComparisonHarness;
	readonly participants: readonly ISessionComparisonParticipant[];
	readonly cancelledAt?: number;
	readonly selectedParticipantId?: string;
	readonly verdict?: ISessionComparisonVerdict;
	readonly synthesisPlan?: ISessionComparisonSynthesisPlan;
}

export interface IStartSessionComparisonOptions {
	readonly workspace: URI;
	readonly prompt: string;
	readonly attachedContext?: readonly IChatRequestVariableEntry[];
	readonly attempts: readonly ISessionComparisonAttemptConfiguration[];
	readonly judgeHarness: ISessionComparisonHarness;
	readonly synthesisHarness?: ISessionComparisonHarness;
	readonly permissionLevel?: string;
	readonly branch?: string;
}

export interface ISessionComparisonService {
	readonly _serviceBrand: undefined;
	readonly comparisons: IObservable<readonly ISessionComparison[]>;

	startComparison(options: IStartSessionComparisonOptions, token?: CancellationToken): Promise<ISessionComparison>;
	getComparison(comparisonId: string): ISessionComparison | undefined;
	getComparisonForSession(resource: URI): ISessionComparison | undefined;
	cancelComparison(comparisonId: string): void;
	selectAttempt(comparisonId: string, participantId: string): void;
	submitVerdict(comparisonId: string, verdict: ISessionComparisonVerdict): void;
	retryJudge(comparisonId: string): void;
	setSynthesisPlan(comparisonId: string, plan: ISessionComparisonSynthesisPlan | undefined): void;
	synthesize(comparisonId: string): Promise<void>;
}

export const ISessionComparisonService = createDecorator<ISessionComparisonService>('sessionComparisonService');

export function getSessionComparisonHarnessLabel(participant: ISessionComparisonParticipant): string {
	return getSessionComparisonHarnessDisplayLabel(participant.harness);
}

export function getSessionComparisonAttemptLabel(participant: ISessionComparisonParticipant, attemptNumber: number): string {
	return localize('sessionComparison.attemptLabel', "Attempt {0} ({1})", attemptNumber, getSessionComparisonHarnessLabel(participant));
}

export function getSessionComparisonHarnessDisplayLabel(harness: ISessionComparisonHarness): string {
	const harnessLabel = harness.modelLabel
		? localize('sessionComparison.harnessAndModel', "{0} · {1}", harness.label, harness.modelLabel)
		: harness.label;
	const reasoningEffort = harness.modelConfiguration?.[ReasoningEffortConfigKey];
	const configuredLabel = typeof reasoningEffort === 'string' && isReasoningEffortLevel(reasoningEffort)
		? localize('sessionComparison.harnessModelAndEffort', "{0} · {1}", harnessLabel, getReasoningEffortLabel(reasoningEffort))
		: harnessLabel;
	return configuredLabel;
}

export function getSessionComparisonParticipantsInDisplayOrder(participants: readonly ISessionComparisonParticipant[]): readonly ISessionComparisonParticipant[] {
	const rolePriority = (role: SessionComparisonParticipantRole): number => {
		switch (role) {
			case SessionComparisonParticipantRole.Synthesis:
				return 0;
			case SessionComparisonParticipantRole.Judge:
				return 1;
			case SessionComparisonParticipantRole.Attempt:
				return 2;
			default:
				return 3;
		}
	};
	return participants
		.map((participant, index) => ({ participant, index }))
		.sort((a, b) => rolePriority(a.participant.role) - rolePriority(b.participant.role) || a.index - b.index)
		.map(({ participant }) => participant);
}
