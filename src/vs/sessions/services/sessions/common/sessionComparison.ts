/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IObservable } from '../../../../base/common/observable.js';
import { isEqualOrParent, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
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
	readonly participants: readonly ISessionComparisonParticipant[];
	readonly selectedParticipantId?: string;
	readonly verdict?: ISessionComparisonVerdict;
}

export interface IStartSessionComparisonOptions {
	readonly workspace: URI;
	readonly prompt: string;
	readonly attachedContext?: readonly IChatRequestVariableEntry[];
	readonly attempts: readonly ISessionComparisonAttemptConfiguration[];
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
