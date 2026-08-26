/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionSummaryMeta } from './state/sessionState.js';

/**
 * The kinds an agent can record on its session, as either an artifact (the
 * session produced it) or a reference (the session found it worth returning
 * to). Each kind carries the one field the client needs to open it, plus a
 * label.
 */
export const enum SessionArtifactType {
	PullRequest = 'pullRequest',
	Issue = 'issue',
	Commit = 'commit',
	Website = 'website',
	File = 'file',
	Resource = 'resource',
}

export const SESSION_ARTIFACT_TYPES: readonly SessionArtifactType[] = [
	SessionArtifactType.PullRequest,
	SessionArtifactType.Issue,
	SessionArtifactType.Commit,
	SessionArtifactType.Website,
	SessionArtifactType.File,
	SessionArtifactType.Resource,
];

/** A session artifact or reference as stored by the host and published to clients. */
export interface ISessionArtifact {
	readonly id: string;
	readonly type: SessionArtifactType;
	readonly label: string;
	/**
	 * `true` for an artifact — something this session produced — and `false` for
	 * a reference, something it only points the user at.
	 */
	readonly isArtifact: boolean;
	/** Link for pull request, issue, commit and website entries. */
	readonly link?: string;
	/** Resource URI for file and resource entries. */
	readonly uri?: string;
	/** Commit hash for commit entries. */
	readonly commitHash?: string;
	/** Whether a pull request or issue link points at GitHub. Host-computed. */
	readonly isGitHub?: boolean;
}

/**
 * Reserved key under {@link SessionSummaryMeta} holding the session's agent-set
 * artifacts and references. VS Code convention layered on the protocol's
 * generic `_meta` bag.
 */
export const SESSION_META_ARTIFACTS_KEY = 'agentHost/sessionArtifacts';

function isSessionArtifactType(value: unknown): value is SessionArtifactType {
	return typeof value === 'string' && (SESSION_ARTIFACT_TYPES as readonly string[]).includes(value);
}

function parseSessionArtifact(value: unknown): ISessionArtifact | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['id'] !== 'string' || typeof raw['label'] !== 'string' || !isSessionArtifactType(raw['type'])) {
		return undefined;
	}
	// `isArtifact` is mandatory, so only its absence is tolerated — that is an
	// entry recorded before artifacts and references were told apart, which was
	// always an artifact. Any other value is malformed and rejects the entry.
	const isArtifact = raw['isArtifact'];
	if (isArtifact !== undefined && typeof isArtifact !== 'boolean') {
		return undefined;
	}
	const artifact: {
		id: string;
		type: SessionArtifactType;
		label: string;
		isArtifact: boolean;
		link?: string;
		uri?: string;
		commitHash?: string;
		isGitHub?: boolean;
	} = {
		id: raw['id'],
		type: raw['type'],
		label: raw['label'],
		isArtifact: isArtifact ?? true,
	};

	if (typeof raw['link'] === 'string') { artifact.link = raw['link']; }
	if (typeof raw['uri'] === 'string') { artifact.uri = raw['uri']; }
	if (typeof raw['commitHash'] === 'string') { artifact.commitHash = raw['commitHash']; }
	if (typeof raw['isGitHub'] === 'boolean') { artifact.isGitHub = raw['isGitHub']; }
	return artifact;
}

/** Reads the artifacts recorded on a session's `_meta` bag. */
export function readSessionArtifacts(meta: SessionSummaryMeta | undefined): readonly ISessionArtifact[] {
	const value = meta?.[SESSION_META_ARTIFACTS_KEY];
	if (!Array.isArray(value)) {
		return [];
	}
	const artifacts: ISessionArtifact[] = [];
	for (const entry of value) {
		const artifact = parseSessionArtifact(entry);
		if (artifact) {
			artifacts.push(artifact);
		}
	}
	return artifacts;
}

/** Returns `meta` with the artifact slot replaced, dropping it when empty. */
export function withSessionArtifacts(meta: SessionSummaryMeta | undefined, artifacts: readonly ISessionArtifact[]): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (artifacts.length > 0) {
		next[SESSION_META_ARTIFACTS_KEY] = artifacts;
	} else {
		delete next[SESSION_META_ARTIFACTS_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/** Serializes artifacts for the session database. */
export function stringifySessionArtifacts(artifacts: readonly ISessionArtifact[]): string {
	return JSON.stringify(artifacts);
}

/** The outcome of reading persisted artifacts: what was read, and what was lost. */
export interface IParsedSessionArtifacts {
	readonly artifacts: readonly ISessionArtifact[];
	/** Why nothing could be read, when the payload itself was unreadable. */
	readonly error?: Error;
	/** How many individual entries were rejected as malformed. */
	readonly dropped: number;
}

/**
 * Parses artifacts previously written by {@link stringifySessionArtifacts}.
 * Reports what could not be read rather than silently returning less, so a
 * corrupt row does not empty a session's artifacts without a trace.
 */
export function parseSessionArtifacts(value: string | undefined): IParsedSessionArtifacts {
	if (!value) {
		return { artifacts: [], dropped: 0 };
	}
	let raw: unknown;
	try {
		raw = JSON.parse(value);
	} catch (error) {
		return { artifacts: [], error: error instanceof Error ? error : new Error(String(error)), dropped: 0 };
	}
	if (!Array.isArray(raw)) {
		return { artifacts: [], error: new Error('expected an array of artifacts'), dropped: 0 };
	}
	const artifacts = readSessionArtifacts({ [SESSION_META_ARTIFACTS_KEY]: raw });
	return { artifacts, dropped: raw.length - artifacts.length };
}

/**
 * The value that identifies an entry for de-duplication: its link, resource
 * URI or commit hash, normalized for comparison.
 */
export function getSessionArtifactValue(artifact: ISessionArtifact): string {
	const value = artifact.link ?? artifact.uri ?? artifact.commitHash ?? '';
	return value.trim().toLowerCase();
}

/** Whether a pull request or issue link points at github.com or a GitHub Enterprise host. */
export function isGitHubArtifactLink(link: string): boolean {
	try {
		const { hostname } = new URL(link);
		return hostname === 'github.com' || hostname === 'www.github.com' || hostname.endsWith('.github.com') || hostname.startsWith('github.');
	} catch {
		return false;
	}
}
