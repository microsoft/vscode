/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IAdditionalRoutableSession } from '../../common/sessionRouter.js';

const GLOBAL_OMNI_SESSION_CANDIDATE_PREFIX = 'global-omni-session:';

export interface IGlobalOmniSessionSnapshotEntry {
	readonly resource: string;
	readonly label: string;
	readonly status?: string;
	readonly created?: number;
	readonly lastActivity?: number;
	readonly repo?: string;
	readonly cwd?: string;
	readonly description?: string;
}

export interface IGlobalOmniSessionSnapshot {
	readonly profileId: string;
	readonly sourceId: string;
	readonly sentAt: number;
	readonly sessions: readonly IGlobalOmniSessionSnapshotEntry[];
}

export interface IGlobalOmniSessionCandidateIdentity {
	readonly sourceId: string;
	readonly resource: string;
}

interface IRemoteSourceSnapshot {
	lastSeen: number;
	sessions: readonly IGlobalOmniSessionSnapshotEntry[];
}

export function encodeGlobalOmniSessionCandidateId(sourceId: string, resource: string): string {
	return `${GLOBAL_OMNI_SESSION_CANDIDATE_PREFIX}${encodeURIComponent(sourceId)}:${encodeURIComponent(resource)}`;
}

export function decodeGlobalOmniSessionCandidateId(candidateId: string): IGlobalOmniSessionCandidateIdentity | undefined {
	if (!candidateId.startsWith(GLOBAL_OMNI_SESSION_CANDIDATE_PREFIX)) {
		return undefined;
	}
	const encodedIdentity = candidateId.slice(GLOBAL_OMNI_SESSION_CANDIDATE_PREFIX.length);
	const separator = encodedIdentity.indexOf(':');
	if (separator <= 0 || separator === encodedIdentity.length - 1) {
		return undefined;
	}
	try {
		const sourceId = decodeURIComponent(encodedIdentity.slice(0, separator));
		const resource = decodeURIComponent(encodedIdentity.slice(separator + 1));
		return sourceId && resource ? { sourceId, resource } : undefined;
	} catch {
		return undefined;
	}
}

export class GlobalOmniSessionBrokerModel {

	private readonly _sources = new Map<string, IRemoteSourceSnapshot>();

	constructor(
		private readonly profileId: string,
		private readonly localSourceId: string,
	) { }

	touchSource(profileId: string, sourceId: string, receivedAt: number): boolean {
		if (!this._accepts(profileId, sourceId)) {
			return false;
		}
		const current = this._sources.get(sourceId);
		if (current) {
			current.lastSeen = receivedAt;
			return false;
		}
		this._sources.set(sourceId, { lastSeen: receivedAt, sessions: [] });
		return true;
	}

	acceptSnapshot(snapshot: IGlobalOmniSessionSnapshot, receivedAt: number): boolean {
		if (!this._accepts(snapshot.profileId, snapshot.sourceId)) {
			return false;
		}
		this._sources.set(snapshot.sourceId, {
			lastSeen: receivedAt,
			sessions: snapshot.sessions,
		});
		return true;
	}

	removeSource(profileId: string, sourceId: string): boolean {
		return profileId === this.profileId && this._sources.delete(sourceId);
	}

	expireSources(now: number, maximumAge: number): readonly string[] {
		const expired: string[] = [];
		for (const [sourceId, source] of this._sources) {
			if (now - source.lastSeen >= maximumAge) {
				this._sources.delete(sourceId);
				expired.push(sourceId);
			}
		}
		return expired.sort();
	}

	hasSource(sourceId: string): boolean {
		return this._sources.has(sourceId);
	}

	getCandidate(candidateId: string): IAdditionalRoutableSession | undefined {
		const identity = decodeGlobalOmniSessionCandidateId(candidateId);
		if (!identity) {
			return undefined;
		}
		const source = this._sources.get(identity.sourceId);
		const session = source?.sessions.find(candidate => candidate.resource === identity.resource);
		return session ? this._toCandidate(identity.sourceId, session) : undefined;
	}

	getCandidates(localSessionResources: readonly string[]): readonly IAdditionalRoutableSession[] {
		const localResources = new Set(localSessionResources);
		const selectedResources = new Set<string>();
		const candidates: IAdditionalRoutableSession[] = [];
		for (const [sourceId, source] of [...this._sources].sort(([a], [b]) => a.localeCompare(b))) {
			for (const session of [...source.sessions].sort((a, b) => a.resource.localeCompare(b.resource) || a.label.localeCompare(b.label))) {
				if (localResources.has(session.resource) || selectedResources.has(session.resource)) {
					continue;
				}
				const candidate = this._toCandidate(sourceId, session);
				if (candidate) {
					selectedResources.add(session.resource);
					candidates.push(candidate);
				}
			}
		}
		return candidates;
	}

	private _toCandidate(sourceId: string, session: IGlobalOmniSessionSnapshotEntry): IAdditionalRoutableSession | undefined {
		let rawSessionResource: URI;
		try {
			rawSessionResource = URI.parse(session.resource);
		} catch {
			return undefined;
		}
		return {
			sessionId: encodeGlobalOmniSessionCandidateId(sourceId, session.resource),
			rawSessionResource,
			label: session.label,
			status: session.status,
			lastActivity: session.lastActivity,
			repo: session.repo,
			cwd: session.cwd,
			description: session.description,
		};
	}

	private _accepts(profileId: string, sourceId: string): boolean {
		return profileId === this.profileId && sourceId !== this.localSourceId;
	}
}
