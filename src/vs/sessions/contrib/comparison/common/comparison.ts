/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISession } from '../../../services/sessions/common/session.js';

export const COMPARISON_VIEW_ID = 'sessions.comparison';
export const COMPARISON_ENABLED_SETTING = 'sessions.comparison.enabled';
export const ComparisonFocusedContext = new RawContextKey<boolean>('sessionsComparisonFocused', false);
export const MAX_COMPARISON_CANDIDATES = 4;

export interface IComparisonTarget {
	readonly providerId: string;
	readonly sessionTypeId: string;
	readonly providerLabel: string;
	readonly modelId: string;
	readonly modelLabel: string;
}

export interface IComparisonCandidate {
	readonly id: string;
	readonly target: IComparisonTarget;
	readonly state: 'starting' | 'started' | 'failed' | 'cancelled' | 'interrupted';
	readonly sessionResource?: URI;
	readonly error?: string;
}

export interface IComparisonRun {
	readonly id: string;
	readonly createdAt: number;
	readonly prompt: string;
	readonly folderUri: URI;
	readonly branch: string;
	readonly candidates: readonly IComparisonCandidate[];
	readonly preferredCandidateId?: string;
}

export const ISessionComparisonService = createDecorator<ISessionComparisonService>('sessionComparisonService');

export interface ISessionComparisonService {
	readonly _serviceBrand: undefined;
	readonly runs: IObservable<readonly IComparisonRun[]>;
	readonly activeRunId: IObservable<string | undefined>;
	selectRun(id: string | undefined): void;
	start(folderUri: URI, branch: string, prompt: string, targets: readonly IComparisonTarget[]): Promise<void>;
	getSession(candidate: IComparisonCandidate, reader?: IReader): ISession | undefined;
	stop(runId: string, candidateId: string): Promise<void>;
	prefer(runId: string, candidateId: string): void;
}
