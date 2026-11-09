/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { IChatRequestVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { getReasoningEffortLabel, isReasoningEffortLevel, ReasoningEffortConfigKey } from '../../../../platform/agentHost/common/reasoningEffort.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';

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
	readonly modelConfigurationLabel?: string;
	readonly modeId?: string;
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
	/** Exact participant chat; absent in comparisons created before nested participants. */
	readonly chatResource?: URI;
	readonly launchError?: string;
	readonly missingSession?: boolean;
	readonly completion?: {
		readonly elapsedMs?: number;
		readonly tokenCount?: number;
		/** Whether the token count includes every model call; false means it is a lower bound. */
		readonly tokenCountIsComplete?: boolean;
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
}

export const SESSION_COMPARISON_MANIFEST_TEXT_MAX_LENGTH = 1000;
export const SESSION_COMPARISON_MANIFEST_LIST_MAX_ITEMS = 32;
export const SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH = 4000;
export const SESSION_COMPARISON_MIN_ATTEMPTS = 2;
export const SESSION_COMPARISON_MAX_ATTEMPTS = 10;
export const COMPARE_AGENTS_ENABLED_SETTING = 'sessions.chat.compareAgents.enabled';
export const COMPARE_AGENTS_TOOLS_ENABLED_SETTING = 'sessions.chat.compareAgents.tools.enabled';

export function getBoundedSessionComparisonManifestText(value: string): string {
	return value.length <= SESSION_COMPARISON_MANIFEST_TEXT_MAX_LENGTH ? value : value.slice(0, SESSION_COMPARISON_MANIFEST_TEXT_MAX_LENGTH);
}

export function getBoundedSessionComparisonManifestList(values: readonly string[]): readonly string[] {
	return values.slice(0, SESSION_COMPARISON_MANIFEST_LIST_MAX_ITEMS).map(getBoundedSessionComparisonManifestText);
}

export interface ISessionComparisonSynthesisPlan {
	readonly instructions?: string;
}

export interface ISessionComparison {
	readonly id: string;
	readonly groupId: string;
	/** Legacy owning session for comparisons persisted with nested participants. */
	readonly sessionResource?: URI;
	readonly title: string;
	readonly createdAt: number;
	readonly workspace?: URI;
	readonly prompt: string;
	/** Transient while the initial attempt sessions are still being created. */
	readonly launching?: boolean;
	readonly attachedContext?: readonly IChatRequestVariableEntry[];
	readonly branch?: string;
	/** Retained for comparisons persisted before execution presets were introduced. */
	readonly permissionLevel?: string;
	readonly judgeHarness?: ISessionComparisonHarness;
	readonly synthesisHarness?: ISessionComparisonHarness;
	readonly participants: readonly ISessionComparisonParticipant[];
	readonly cancelledAt?: number;
	readonly archivedAt?: number;
	readonly selectedParticipantId?: string;
	readonly verdict?: ISessionComparisonVerdict;
	readonly synthesisPlan?: ISessionComparisonSynthesisPlan;
}

export interface IStartSessionComparisonOptions {
	readonly workspace?: URI;
	readonly prompt: string;
	readonly attachedContext?: readonly IChatRequestVariableEntry[];
	readonly attempts: readonly ISessionComparisonAttemptConfiguration[];
	readonly judgeHarness?: ISessionComparisonHarness;
	readonly synthesisHarness?: ISessionComparisonHarness;
	readonly permissionLevel?: string;
	readonly branch?: string;
}

export class SessionComparisonLaunchError extends Error {
	constructor(message: string, readonly participants: readonly ISessionComparisonParticipant[]) {
		super(message);
		this.name = 'SessionComparisonLaunchError';
	}
}

export interface ISessionComparisonService {
	readonly _serviceBrand: undefined;
	readonly comparisons: IObservable<readonly ISessionComparison[]>;

	startComparison(options: IStartSessionComparisonOptions, token?: CancellationToken): Promise<ISessionComparison>;
	getComparison(comparisonId: string): ISessionComparison | undefined;
	getComparisonForSession(resource: URI): ISessionComparison | undefined;
	/** Resolves an exact participant chat, including the live request model retained across its move. */
	getParticipantForChat(comparisonId: string, resource: URI): ISessionComparisonParticipant | undefined;
	cancelComparison(comparisonId: string): void;
	archiveComparison(comparisonId: string): void;
	/** Restores an automatically removed comparison group for bulk archive Undo and returns its group ID. */
	restoreComparison(comparisonId: string): string;
	selectAttempt(comparisonId: string, participantId: string): void;
	submitVerdict(comparisonId: string, verdict: ISessionComparisonVerdict): void;
	canRetryJudge(comparisonId: string): boolean;
	retryJudge(comparisonId: string): void;
	setSynthesisPlan(comparisonId: string, plan: ISessionComparisonSynthesisPlan | undefined): void;
	synthesize(comparisonId: string): Promise<void>;
}

export const ISessionComparisonService = createDecorator<ISessionComparisonService>('sessionComparisonService');

export function getSessionComparisonChat(participant: ISessionComparisonParticipant, session: ISession | undefined, reader?: IReader): IChat | undefined {
	return participant.chatResource
		? session?.chats.read(reader).find(chat => isEqual(chat.resource, participant.chatResource))
		: session?.mainChat.read(reader);
}

export function getSessionComparisonWorkspaceError(branch: string | undefined): string | undefined {
	if (!branch) {
		return localize('sessionComparison.gitBranchRequired', "Comparisons require a Git repository with branch information.");
	}
	return undefined;
}

export function getSessionComparisonHarnessLabel(participant: ISessionComparisonParticipant, includeHarness = true): string {
	return getSessionComparisonHarnessDisplayLabel(participant.harness, includeHarness);
}

export function getSessionComparisonAttemptLabel(participant: ISessionComparisonParticipant, attemptNumber: number): string {
	return localize('sessionComparison.attemptLabel', "Attempt {0} ({1})", attemptNumber, getSessionComparisonHarnessLabel(participant));
}

export function getSessionComparisonHarnessDisplayLabel(harness: ISessionComparisonHarness, includeHarness = true): string {
	const configurationLabel = getSessionComparisonHarnessConfigurationLabel(harness);
	if (!includeHarness) {
		if (harness.modelLabel && configurationLabel) {
			return localize('sessionComparison.modelAndConfiguration', "{0} · {1}", harness.modelLabel, configurationLabel);
		}
		return harness.modelLabel || configurationLabel || harness.label;
	}
	const harnessLabel = harness.modelLabel
		? localize('sessionComparison.harnessAndModel', "{0} · {1}", harness.label, harness.modelLabel)
		: harness.label;
	return configurationLabel
		? localize('sessionComparison.harnessModelAndConfiguration', "{0} · {1}", harnessLabel, configurationLabel)
		: harnessLabel;
}

/** The reasoning effort or other model configuration of a harness, such as "High". */
export function getSessionComparisonHarnessConfigurationLabel(harness: ISessionComparisonHarness): string | undefined {
	const reasoningEffort = harness.modelConfiguration?.[ReasoningEffortConfigKey];
	return typeof reasoningEffort === 'string' && isReasoningEffortLevel(reasoningEffort)
		? getReasoningEffortLabel(reasoningEffort)
		: harness.modelConfigurationLabel;
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
