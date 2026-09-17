/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { IWorkspaceCandidate } from './sessionIntent.js';

export interface IDashboardExecutionTarget {
	readonly id: string;
	readonly revision: number;
	readonly kind: 'local' | 'remote' | 'cloud';
	readonly label: string;
	readonly providerId: string;
	readonly sessionTypeId: string;
	readonly folder: URI;
	readonly candidateId?: string;
	readonly supportsWorktree: boolean;
	readonly availability: 'available' | 'unknown';
	readonly reason: string;
}

export interface IDashboardWorkDiscovery {
	readonly revision: number;
	readonly candidates: readonly IWorkspaceCandidate[];
	readonly targets: readonly IDashboardExecutionTarget[];
}

export interface IDashboardStartWork {
	readonly operationId: string;
	readonly targetId: string;
	readonly revision: number;
	readonly title: string;
	readonly prompt: string;
	readonly isolation?: 'folder' | 'worktree';
}

export interface IDashboardWorkExecution {
	readonly id: string;
	readonly source: URI;
	readonly title: string;
	readonly target: string;
	readonly phase: 'starting' | 'started' | 'failed' | 'unknown';
	readonly sessionResource?: URI;
	readonly error?: string;
}

export const IDashboardWorkService = createDecorator<IDashboardWorkService>('dashboardWorkService');

/** Dashboard-only conversation ownership and approved execution, independent of the regular composer. */
export interface IDashboardWorkService {
	readonly _serviceBrand: undefined;
	readonly sessions: IObservable<readonly ISession[]>;
	readonly draft: IObservable<ISession | undefined>;
	readonly executions: IObservable<readonly IDashboardWorkExecution[]>;
	start(): Promise<ISession>;
	send(session: ISession, query: string, attachments: readonly IChatRequestVariableEntry[]): Promise<ISession>;
	discardDraft(): void;
	getSessionForChat(resource: URI): ISession | undefined;
	discover(session: ISession, repository: string | undefined, token: CancellationToken): Promise<IDashboardWorkDiscovery>;
	resolveTarget(session: ISession, targetId: string, revision: number): IDashboardExecutionTarget;
	startWork(session: ISession, options: IDashboardStartWork, token: CancellationToken): Promise<IDashboardWorkExecution>;
	cloneRepository(session: ISession, operationId: string, repository: string, destinationParent: URI, token: CancellationToken): Promise<IDashboardWorkDiscovery>;
	readWork(session: ISession, executionId: string, token: CancellationToken, wait?: boolean): Promise<{ readonly execution: IDashboardWorkExecution; readonly status?: string; readonly output?: string; readonly truncated?: boolean }>;
}
