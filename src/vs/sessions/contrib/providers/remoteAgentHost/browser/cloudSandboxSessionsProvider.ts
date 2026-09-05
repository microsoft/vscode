/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentSession, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import type { ISession } from '../../../../services/sessions/common/session.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';

/**
 * Sessions provider for a Copilot cloud sandbox.
 *
 * Adds the handling for sessions this client provisioned but the host has not materialized yet:
 * Mission Control mints the session id and returns it before the sandbox is even awake, so such a
 * session is real, addressable, and unknown to the host all at once.
 */
export class CloudSandboxSessionsProvider extends RemoteAgentHostSessionsProvider {

	/**
	 * Provisional sessions kept out of {@link getSessions} because the caller is still showing a
	 * placeholder row for them. They stay reachable by resource, so opening one still works.
	 */
	private readonly _withheldSessions = new Set<string>();

	/**
	 * Raw id → deadline after which eviction resumes, or `undefined` while the clock has not
	 * started. It starts when a connected host first omits the session, not at seed time, because
	 * waking a sandbox can take minutes.
	 */
	private readonly _provisionalSessions = new Map<string, number | undefined>();

	/** How long a provisional session resists eviction after the host first omits it. */
	static readonly PROVISIONAL_GRACE_MS = 2 * 60_000;

	/**
	 * Seed a session this client just provisioned. It is cached so a later discovery pass
	 * reconciles against it rather than adding a second entry, but stays out of the sessions list
	 * until {@link publishWithheldSession} and resists eviction until the host lists it.
	 */
	seedProvisionalSession(rawMeta: IAgentSessionMetadata): void {
		const meta = this._adoptSessionMeta(rawMeta);
		const rawId = AgentSession.id(meta.session);
		if (this._sessionCache.has(rawId)) {
			return;
		}
		this._sessionCache.set(rawId, this.createAdapter(meta));
		this._withheldSessions.add(rawId);
		// No deadline yet: the clock starts when the host first omits it.
		this._provisionalSessions.set(rawId, undefined);
	}

	/**
	 * Reveal a session seeded by {@link seedProvisionalSession}, so {@link getSessions} returns it.
	 *
	 * Pass `announce: false` when the caller immediately fires its own change event covering this
	 * session: the list re-reads {@link getSessions} on any change, so a single event can both drop
	 * a placeholder row and reveal this one.
	 */
	publishWithheldSession(rawId: string, options?: { announce?: boolean }): void {
		if (!this._withheldSessions.delete(rawId)) {
			return;
		}
		const session = this._sessionCache.get(rawId);
		if (session && options?.announce !== false) {
			this._onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
		}
	}

	/**
	 * Look up a cached session by raw id, **including** ones withheld from {@link getSessions},
	 * which callers that seeded a session need before it is listed.
	 */
	getCachedSession(rawId: string): ISession | undefined {
		return this._sessionCache.get(rawId);
	}

	override getSessions(): ISession[] {
		const sessions = super.getSessions();
		return this._withheldSessions.size === 0
			? sessions
			: sessions.filter(session => !this._withheldSessions.has(AgentSession.id(session.resource)));
	}

	protected override _isSessionEvictable(rawId: string): boolean {
		if (!this._provisionalSessions.has(rawId)) {
			return true;
		}
		const deadline = this._provisionalSessions.get(rawId);
		if (deadline === undefined || Date.now() < deadline) {
			return false;
		}
		this._provisionalSessions.delete(rawId);
		return true;
	}

	protected override _onHostListedSessions(rawIds: ReadonlySet<string>): void {
		if (this._provisionalSessions.size === 0) {
			return;
		}
		for (const [rawId, deadline] of [...this._provisionalSessions]) {
			if (rawIds.has(rawId)) {
				// The host knows it, so it reconciles like any other session from here on.
				this._provisionalSessions.delete(rawId);
			} else if (deadline === undefined) {
				// Start the grace period now, so a slow wake does not consume it beforehand.
				this._provisionalSessions.set(rawId, Date.now() + CloudSandboxSessionsProvider.PROVISIONAL_GRACE_MS);
			}
		}
	}
}
