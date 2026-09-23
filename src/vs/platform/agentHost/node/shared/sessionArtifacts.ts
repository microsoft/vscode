/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../base/common/async.js';
import { SessionArtifactCollection } from '../../common/sessionArtifactCollection.js';
import { readSessionArtifacts, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { AHP_SESSION_NOT_FOUND, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';

/** Shared artifact mutations for server tools and direct user requests. */
export class SessionArtifacts {
	private static readonly _mutations = new WeakMap<AgentHostStateManager, SequencerByKey<string>>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _session: string,
		private readonly _persist: (session: string, artifacts: readonly ISessionArtifact[]) => void | Promise<void>,
	) { }

	read(): SessionArtifactCollection {
		return new SessionArtifactCollection(readSessionArtifacts(this._getState()._meta));
	}

	private _getState() {
		const state = this._stateManager.getSessionState(this._session);
		if (!state) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${this._session}`);
		}
		return state;
	}

	/** Serializes collection reads, durable writes and publication across tools and user requests. */
	mutate<T extends { readonly artifacts: readonly ISessionArtifact[] }>(mutation: (collection: SessionArtifactCollection) => T): Promise<T> {
		let sequencer = SessionArtifacts._mutations.get(this._stateManager);
		if (!sequencer) {
			sequencer = new SequencerByKey<string>();
			SessionArtifacts._mutations.set(this._stateManager, sequencer);
		}
		return sequencer.queue(this._session, async () => {
			const collection = this.read();
			const result = mutation(collection);
			if (result.artifacts !== collection.artifacts) {
				await this._persist(this._session, result.artifacts);
				const meta = this._getState()._meta;
				this._stateManager.setSessionMeta(this._session, withSessionArtifacts(meta, result.artifacts));
			}
			return result;
		});
	}

	async remove(artifactId: string): Promise<void> {
		if (!artifactId.trim()) {
			throw new Error('artifactId must be a non-empty string');
		}
		await this.mutate(collection => collection.remove(artifactId));
	}
}
