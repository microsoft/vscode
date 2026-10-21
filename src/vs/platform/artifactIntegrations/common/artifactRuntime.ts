/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IDisposable, IReference } from '../../../base/common/lifecycle.js';
import { IObservable, IReader } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { ArtifactAuthority, ArtifactAvailability, ArtifactPrompt, ArtifactPromptReceipt, ArtifactRecord, ArtifactRequestPresentation, ArtifactRunInitiator, IArtifactActionContext } from './artifactIntegration.js';

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
	readonly presentation?: ArtifactRequestPresentation;
	/** Lets the chat tell turns a person started apart from automated ones. */
	readonly initiator?: ArtifactRunInitiator;
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

export interface ArtifactAutomationNotice {
	readonly session: string;
	readonly artifact: ArtifactRecord;
	readonly kind: 'enabled' | 'changed' | 'disabled';
	readonly content: string;
	readonly iconId?: string;
}

/** The composition must hold exclusive ownership of this authority's store until disposal. */
export interface IArtifactRuntime {
	readonly authority: ArtifactAuthority;
	readonly available: IObservable<boolean>;
	/** Explicit feature enablement; disabling cancels automation without revoking consent. Absence means enabled. */
	readonly enabled?: IObservable<boolean>;
	/** An adapter may pause automation without disabling manual resource actions. */
	readonly automationUnavailableReason?: IObservable<string | undefined>;
	readonly chat: IArtifactChatAccess;
	/** Publishes a system-authored transcript notice when supported; never sends it to an agent. */
	postNotice?(notice: ArtifactAutomationNotice): Promise<void>;
	isOwner(): boolean;
	acquireSession(session: string): Promise<IReference<IObservable<ArtifactSessionState>>>;
	/** Fires when a session is permanently deleted, not merely unloaded, so its bindings can be removed. */
	readonly onDidDeleteSession?: Event<string>;
	authorize(context: IArtifactActionContext, scope: 'resource' | 'resourceAndWorkspace', token: CancellationToken): Promise<ArtifactAuthorization>;
}

export function isArtifactRuntimeAvailable(runtime: IArtifactRuntime, reader?: IReader): boolean {
	return runtime.enabled?.read(reader) !== false && runtime.available.read(reader);
}

/** A write replaced the ledger, but confirming its durability failed. */
export class ArtifactStorageCommitError extends Error {
	constructor(cause: unknown) {
		super(localize('artifactStorageCommitUncertain', "The artifact changes were saved, but their durability could not be confirmed. Further changes are blocked until the artifact runtime restarts."), { cause });
	}
}

/** Successful writes are durable and atomic; only ArtifactStorageCommitError may reject after publishing the new value. */
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
