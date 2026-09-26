/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IDisposable, IReference } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { ArtifactAuthority, ArtifactAvailability, ArtifactPrompt, ArtifactPromptReceipt, ArtifactRecord, IArtifactActionContext } from './artifactIntegration.js';

export interface ArtifactSessionState {
	readonly availability: ArtifactAvailability;
	readonly archived: boolean;
	readonly deleted?: boolean;
	readonly artifacts: readonly ArtifactRecord[];
}

export interface ArtifactPromptRequest {
	readonly session: string;
	readonly chat: string;
	readonly requestId: string;
	readonly prompt: ArtifactPrompt;
}

export type ArtifactPromptSubmission =
	| { readonly kind: 'accepted'; readonly handle: IArtifactPromptHandle }
	| { readonly kind: 'busy' }
	| { readonly kind: 'notSent'; readonly reason: string }
	| { readonly kind: 'indeterminate'; readonly reason: string };

export type ArtifactPromptRecovery =
	| { readonly kind: 'attached'; readonly handle: IArtifactPromptHandle }
	| { readonly kind: 'notSent' }
	| { readonly kind: 'indeterminate'; readonly reason: string };

export type ArtifactPromptOutcome = {
	readonly kind: 'completed' | 'cancelled' | 'failed';
	readonly turnId?: string;
	readonly reason: string;
};

export type ArtifactPromptState =
	| { readonly kind: 'submitted' }
	| { readonly kind: 'running'; readonly turnId: string }
	| { readonly kind: 'unavailable' | 'indeterminate'; readonly reason: string }
	| ArtifactPromptOutcome;

export function isArtifactPromptOutcome(state: ArtifactPromptState): state is ArtifactPromptOutcome {
	return state.kind === 'completed' || state.kind === 'cancelled' || state.kind === 'failed';
}

export class ArtifactPromptTrackingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ArtifactPromptTrackingError';
	}
}

export interface IArtifactChatObservation extends IDisposable {
	readonly state: IObservable<{ readonly available: boolean; readonly busy: boolean; readonly reason?: string }>;
}

/** A lease on tracking one request; disposal stops observation without cancelling its work. */
export interface IArtifactPromptHandle extends IDisposable {
	readonly requestId: string;
	readonly receipt: ArtifactPromptReceipt;
	readonly state: IObservable<ArtifactPromptState>;
	/** Resolves for a confirmed terminal outcome; tracking loss rejects without implying execution failure. */
	readonly completion: Promise<ArtifactPromptOutcome>;
	cancel(token: CancellationToken): Promise<void>;
}

export interface IArtifactChatAccess {
	readonly admission: 'atomic' | 'bestEffort';
	observeChat(session: string, chat: string): IArtifactChatObservation;
	submit(request: ArtifactPromptRequest, token: CancellationToken, isCurrent: () => boolean): Promise<ArtifactPromptSubmission>;
	/** Attaches to existing work using its persisted identity and receipt; never sends the prompt. */
	recover(request: ArtifactPromptRequest, receipt: ArtifactPromptReceipt | undefined, token: CancellationToken): Promise<ArtifactPromptRecovery>;
}

export type ArtifactAuthorization = { readonly kind: 'allowed' } | { readonly kind: 'blocked'; readonly reason: string };

/** The composition must hold exclusive ownership of this authority's store until disposal. */
export interface IArtifactRuntime {
	readonly authority: ArtifactAuthority;
	readonly available: IObservable<boolean>;
	readonly chat: IArtifactChatAccess;
	isOwner(): boolean;
	acquireSession(session: string): Promise<IReference<IObservable<ArtifactSessionState>>>;
	authorize(context: IArtifactActionContext, scope: 'resource' | 'resourceAndWorkspace', token: CancellationToken): Promise<ArtifactAuthorization>;
}

/** Writes must be durable and atomic; a rejected write must not publish the new value. */
export interface IArtifactIntegrationStorage {
	read(): Promise<string | undefined>;
	write(value: string): Promise<void>;
}

export type ArtifactCoordinatorSelection =
	| { readonly kind: 'host' }
	| { readonly kind: 'client' }
	| { readonly kind: 'unavailable'; readonly reason: 'pending' | 'disconnected' | 'denied' | 'authorityChanged' };

export function selectArtifactCoordinator(capability: 'pending' | 'supported' | 'unsupported', connected: boolean, permitted: boolean, previous?: 'host' | 'client'): ArtifactCoordinatorSelection {
	if (!permitted) {
		return { kind: 'unavailable', reason: 'denied' };
	}
	if (!connected) {
		return { kind: 'unavailable', reason: 'disconnected' };
	}
	if (capability === 'pending') {
		return { kind: 'unavailable', reason: 'pending' };
	}
	const kind = capability === 'supported' ? 'host' : 'client';
	return previous && previous !== kind ? { kind: 'unavailable', reason: 'authorityChanged' } : { kind };
}
