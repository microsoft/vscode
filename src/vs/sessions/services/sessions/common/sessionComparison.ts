/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IObservable } from '../../../../base/common/observable.js';
import { isEqualOrParent, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatUsageSummary } from '../../../../workbench/contrib/chat/common/chatUsage.js';
import { ISessionFolder } from './session.js';

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
	Unknown = 'unknown',
}

export const enum SessionComparisonValidationSource {
	AttemptReport = 'attemptReport',
	JudgeRun = 'judgeRun',
	Unavailable = 'unavailable',
}

export interface ISessionComparisonHarness {
	readonly providerId: string;
	readonly sessionTypeId: string;
	readonly label: string;
	readonly modelId?: string;
	readonly modelLabel?: string;
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
	readonly usage?: IChatUsageSummary;
}

export interface ISessionComparisonAttemptVerdict {
	readonly participantId: string;
	readonly summary: string;
	readonly validation: {
		readonly tests: SessionComparisonValidationState;
		readonly build: SessionComparisonValidationState;
		readonly lint: SessionComparisonValidationState;
		readonly diagnostics: SessionComparisonValidationState;
	};
	readonly validationSource?: {
		readonly tests: SessionComparisonValidationSource;
		readonly build: SessionComparisonValidationSource;
		readonly lint: SessionComparisonValidationSource;
		readonly diagnostics: SessionComparisonValidationSource;
	};
	readonly unresolvedIssues: readonly string[];
	readonly notableDifferences: readonly string[];
}

export interface ISessionComparisonVerdict {
	readonly recommendedParticipantId: string;
	readonly explanation: string;
	readonly conflicts: readonly string[];
	readonly attempts: readonly ISessionComparisonAttemptVerdict[];
}

export interface ISessionComparison {
	readonly id: string;
	readonly groupId: string;
	readonly title: string;
	readonly createdAt: number;
	readonly workspace: URI;
	readonly prompt: string;
	readonly branch?: string;
	readonly judgeHarness?: ISessionComparisonHarness;
	readonly participants: readonly ISessionComparisonParticipant[];
	readonly selectedParticipantId?: string;
	readonly verdict?: ISessionComparisonVerdict;
}

export interface IStartSessionComparisonOptions {
	readonly workspace: URI;
	readonly prompt: string;
	readonly attachedContext?: readonly IChatRequestVariableEntry[];
	readonly attempts: readonly ISessionComparisonAttemptConfiguration[];
	readonly judgeHarness: ISessionComparisonHarness;
	readonly permissionLevel?: string;
	readonly branch?: string;
}

export interface ISessionComparisonService {
	readonly _serviceBrand: undefined;
	readonly comparisons: IObservable<readonly ISessionComparison[]>;

	startComparison(options: IStartSessionComparisonOptions, token?: CancellationToken): Promise<ISessionComparison>;
	getComparison(comparisonId: string): ISessionComparison | undefined;
	getComparisonForSession(resource: URI): ISessionComparison | undefined;
	selectAttempt(comparisonId: string, participantId: string): void;
	submitVerdict(comparisonId: string, verdict: ISessionComparisonVerdict): void;
	synthesize(comparisonId: string): Promise<void>;
	discardOriginalAttempts(comparisonId: string): Promise<readonly string[]>;
}

export const ISessionComparisonService = createDecorator<ISessionComparisonService>('sessionComparisonService');

export function getSessionComparisonAttemptLabel(participant: ISessionComparisonParticipant, index: number): string {
	const harnessLabel = participant.harness.modelLabel
		? localize('sessionComparison.harnessAndModel', "{0} · {1}", participant.harness.label, participant.harness.modelLabel)
		: participant.harness.label;
	return localize('sessionComparison.attemptTitle', "Attempt {0}: {1}", index + 1, harnessLabel);
}

export function getSessionComparisonParticipantsInDisplayOrder(participants: readonly ISessionComparisonParticipant[]): readonly ISessionComparisonParticipant[] {
	const rolePriority = (role: SessionComparisonParticipantRole): number => {
		switch (role) {
			case SessionComparisonParticipantRole.Judge:
				return 0;
			case SessionComparisonParticipantRole.Synthesis:
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

export function getSessionComparisonFileKey(resource: URI, folders: readonly ISessionFolder[]): string {
	const matchingFolders = folders
		.map((folder, index) => ({ folder, index }))
		.filter(({ folder }) => isEqualOrParent(resource, folder.workingDirectory))
		.sort((a, b) => b.folder.workingDirectory.path.length - a.folder.workingDirectory.path.length);
	const match = matchingFolders[0];
	if (!match) {
		return resource.toString();
	}
	const path = relativePath(match.folder.workingDirectory, resource);
	if (path === undefined) {
		return resource.toString();
	}
	return folders.length === 1 ? path : `${match.folder.name}/${path}`;
}
