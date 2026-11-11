/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, SequencerByKey } from '../../../../base/common/async.js';
import { toDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { SessionArtifactCollection } from '../../common/sessionArtifactCollection.js';
import { readSessionArtifacts, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { AHP_SESSION_NOT_FOUND, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';

/** Shared artifact mutations for server tools and direct user requests. */
export class SessionArtifacts {
	private static readonly _mutations = new WeakMap<AgentHostStateManager, SequencerByKey<string>>();

	private static _sequencer(stateManager: AgentHostStateManager): SequencerByKey<string> {
		let sequencer = SessionArtifacts._mutations.get(stateManager);
		if (!sequencer) {
			sequencer = new SequencerByKey<string>();
			SessionArtifacts._mutations.set(stateManager, sequencer);
		}
		return sequencer;
	}

	/**
	 * Waits for the artifact changes of `sessions` in progress, then holds off new ones until the returned disposable
	 * is disposed, so a chat move can carry the artifacts of its chats without overwriting one recorded meanwhile.
	 */
	static async hold(stateManager: AgentHostStateManager, sessions: readonly string[]): Promise<IDisposable> {
		const sequencer = SessionArtifacts._sequencer(stateManager);
		const released = new DeferredPromise<void>();
		// Held in one order, so two holds of the same sessions can't deadlock.
		for (const session of [...new Set(sessions)].sort()) {
			const held = new DeferredPromise<void>();
			sequencer.queue(session, () => {
				held.complete();
				return released.p;
			});
			await held.p;
		}
		return toDisposable(() => released.complete());
	}

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _session: string,
		private readonly _chat: string,
		private readonly _persist: (session: string, artifacts: readonly ISessionArtifact[]) => void | Promise<void>,
	) { }

	read(): SessionArtifactCollection {
		return new SessionArtifactCollection(this._readAll().filter(artifact => artifact.chat === this._chat));
	}

	private _readAll(): readonly ISessionArtifact[] {
		const defaultChat = this._stateManager.getDefaultChat(this._session);
		return readSessionArtifacts(this._getState()._meta).map(artifact =>
			artifact.chat || defaultChat === undefined ? artifact : { ...artifact, chat: defaultChat }
		);
	}

	private _getState() {
		const state = this._stateManager.getSessionState(this._session);
		if (!state) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${this._session}`);
		}
		return state;
	}

	/** Serializes collection reads, durable writes and publication across tools and user requests. */
	async mutate<T extends { readonly artifacts: readonly ISessionArtifact[] }>(
		mutation: (collection: SessionArtifactCollection) => T,
		afterMutation?: (result: T) => void | Promise<void>,
	): Promise<T> {
		const outcome = await SessionArtifacts._sequencer(this._stateManager).queue(this._session, async (): Promise<{ readonly kind: 'applied'; readonly result: T } | { readonly kind: 'moved'; readonly owner: string }> => {
			const owner = this._stateManager.getChatOwner(this._chat);
			if (owner !== undefined && owner !== this._session) {
				return { kind: 'moved', owner };
			}
			const collection = this.read();
			const result = mutation(collection);
			if (result.artifacts !== collection.artifacts) {
				const allArtifacts = this._readAll();
				const updated = result.artifacts.map(artifact => ({ ...artifact, chat: this._chat }));
				const updatedById = new Map(updated.map(artifact => [artifact.id, artifact]));
				const merged: ISessionArtifact[] = [];
				for (const artifact of allArtifacts) {
					if (artifact.chat !== this._chat) {
						merged.push(artifact);
					} else {
						const replacement = updatedById.get(artifact.id);
						if (replacement) {
							merged.push(replacement);
							updatedById.delete(artifact.id);
						}
					}
				}
				for (const artifact of updatedById.values()) {
					merged.push(artifact);
				}
				await this._persist(this._session, merged);
				const meta = this._getState()._meta;
				this._stateManager.setSessionMeta(this._session, withSessionArtifacts(meta, merged));
			}
			await afterMutation?.(result);
			return { kind: 'applied', result };
		});
		if (outcome.kind === 'moved') {
			// The chat moved while this change waited: it applies to the session that owns the chat now, in that session's
			// order, queued only once this session's queue is released so two sessions' queues are never held together.
			return new SessionArtifacts(this._stateManager, outcome.owner, this._chat, this._persist).mutate(mutation, afterMutation);
		}
		return outcome.result;
	}

	async remove(artifactId: string, onRemoved?: (artifact: ISessionArtifact) => void | Promise<void>): Promise<void> {
		if (!artifactId.trim()) {
			throw new Error('artifactId must be a non-empty string');
		}
		await this.mutate(collection => collection.remove(artifactId), async result => {
			if (result.removed) {
				await onRemoved?.(result.removed);
			}
		});
	}
}
