/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../../workbench/contrib/git/common/utils.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { IProviderSessionType } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionWorkspaceIntentRepository } from '../../../services/sessions/common/sessionsProvider.js';

export const SESSION_INTENT_CONTEXT_ID = 'sessions.intent.context';

export interface IWorkspaceIntent {
	readonly repository?: ISessionWorkspaceIntentRepository;
	readonly folders?: readonly URI[];
}

export interface IWorkspaceCandidate {
	readonly kind: 'local';
	readonly id: string;
	readonly revision: number;
	readonly folder: URI;
	readonly repository?: ISessionWorkspaceIntentRepository;
	readonly validation: 'verified' | 'missing' | 'unavailable' | 'error';
	readonly reason: string;
	readonly worktree: 'available' | 'unavailable' | 'unknown';
	readonly worktreeReason: string;
}

export interface IIntentSetupAlternative {
	readonly kind: 'clone' | 'cloud';
	readonly id: string;
	readonly revision: number;
	readonly providerId: string;
	readonly actionId: string;
	readonly label: string;
	readonly availability: 'available' | 'unavailable' | 'unknown';
	readonly reason: string;
}

export interface ISessionIntentDiscovery {
	readonly status: 'idle' | 'resolving' | 'resolved' | 'failed';
	readonly revision: number;
	readonly candidates: readonly IWorkspaceCandidate[];
	readonly alternatives: readonly IIntentSetupAlternative[];
	readonly message?: string;
}

export interface ISessionIntentPresentation {
	readonly session: ISession;
	readonly chatResource: URI;
	readonly canAttachWorkspace: boolean;
	readonly discovery: ISessionIntentDiscovery;
	readonly busy: boolean;
	readonly collectionId?: string;
	readonly proposedWorkspace?: { readonly candidate: IWorkspaceCandidate; readonly isolate: boolean };
}

export type ISessionIntentAlternativeResult =
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'candidate'; readonly candidate: IWorkspaceCandidate }
	| { readonly kind: 'destination'; readonly session: ISession; readonly source: ISession };

export const ISessionIntentService = createDecorator<ISessionIntentService>('sessionIntentService');

/** Recommendations are context, never authorization to set up or send a session. */
export interface ISessionIntentService {
	readonly _serviceBrand: undefined;
	readonly intakes: IObservable<readonly ISession[]>;
	getTargets(): readonly IProviderSessionType[];
	/** Prepare or resume a draft without navigation, discovery, or loading its conversation. */
	start(target: IProviderSessionType, options?: { readonly outcome?: string; readonly collectionId?: string }): Promise<ISession>;
	/** Observe an explicitly tracked intake without adopting an unrelated quick chat. */
	getPresentation(session: ISession): IObservable<ISessionIntentPresentation>;
	refresh(session: ISession, intent?: IWorkspaceIntent, token?: CancellationToken): Promise<ISessionIntentDiscovery>;
	/** Recheck an exact candidate without staging a proposal or creating a session. */
	validateCandidate(session: ISession, id: string, revision: number): Promise<IWorkspaceCandidate>;
	stageCandidate(session: ISession, id: string, revision: number, isolate: boolean): Promise<void>;
	chooseFolder(session: ISession): Promise<IWorkspaceCandidate | undefined>;
	runAlternative(session: ISession, id: string, revision: number): Promise<ISessionIntentAlternativeResult>;
}

/** Accepts an explicit GitHub repository, issue, or pull request URL, not arbitrary prompt text. */
export function parseIntentRepository(value: string): ISessionWorkspaceIntentRepository | undefined {
	const link = /^https:\/\/(?:www\.)?github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)(?:\/(?:issues|pull)\/\d+)?\/?(?:[?#].*)?$/i.exec(value.trim());
	return link?.groups ? getGitHubRepositoryFromRemoteUrl(`https://github.com/${link.groups.owner}/${link.groups.repo}`) : undefined;
}

export function sameIntentRepository(a: ISessionWorkspaceIntentRepository | undefined, b: ISessionWorkspaceIntentRepository | undefined): boolean {
	return !!a && !!b && a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase();
}
