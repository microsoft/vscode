/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../base/common/async.js';
import { SessionArtifactCollection } from '../../common/sessionArtifactCollection.js';
import { readSessionArtifacts, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { AHP_SESSION_NOT_FOUND, ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';

/** Shared artifact mutations for server tools and direct user requests. */
export class SessionArtifacts {
	private static readonly _mutations = new WeakMap<AgentHostStateManager, SequencerByKey<string>>();

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
		const defaultChat = buildDefaultChatUri(this._session);
		return readSessionArtifacts(this._getState()._meta).map(artifact =>
			artifact.chat ? artifact : { ...artifact, chat: defaultChat }
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
	mutate<T extends { readonly artifacts: readonly ISessionArtifact[] }>(
		mutation: (collection: SessionArtifactCollection) => T,
		afterMutation?: (result: T) => void | Promise<void>,
	): Promise<T> {
		let sequencer = SessionArtifacts._mutations.get(this._stateManager);
		if (!sequencer) {
			sequencer = new SequencerByKey<string>();
			SessionArtifacts._mutations.set(this._stateManager, sequencer);
		}
		return sequencer.queue(this._session, async () => {
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
			return result;
		});
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
