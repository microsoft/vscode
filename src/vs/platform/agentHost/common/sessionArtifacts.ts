/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionSummaryMeta } from './state/sessionState.js';

/**
 * Artifact kinds an agent can record on its session. Each kind carries the one
 * field the client needs to open it, plus a label.
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

/** A session artifact as stored by the host and published to clients. */
export interface ISessionArtifact {
	readonly id: string;
	readonly type: SessionArtifactType;
	readonly label: string;
	/** Link for pull request, issue, commit and website artifacts. */
	readonly link?: string;
	/** Resource URI for file and resource artifacts. */
	readonly uri?: string;
	/** Commit hash for commit artifacts. */
	readonly commitHash?: string;
	/** Whether a pull request or issue link points at GitHub. Host-computed. */
	readonly isGitHub?: boolean;
	/** Whether this session created the pull request, rather than only referencing it. */
	readonly createdByThisSession?: boolean;
}

/**
 * Reserved key under {@link SessionSummaryMeta} holding the session's agent-set
 * artifacts. VS Code convention layered on the protocol's generic `_meta` bag.
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
	const artifact: {
		id: string;
		type: SessionArtifactType;
		label: string;
		link?: string;
		uri?: string;
		commitHash?: string;
		isGitHub?: boolean;
		createdByThisSession?: boolean;
	} = { id: raw['id'], type: raw['type'], label: raw['label'] };

	if (typeof raw['link'] === 'string') { artifact.link = raw['link']; }
	if (typeof raw['uri'] === 'string') { artifact.uri = raw['uri']; }
	if (typeof raw['commitHash'] === 'string') { artifact.commitHash = raw['commitHash']; }
	if (typeof raw['isGitHub'] === 'boolean') { artifact.isGitHub = raw['isGitHub']; }
	if (typeof raw['createdByThisSession'] === 'boolean') { artifact.createdByThisSession = raw['createdByThisSession']; }
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

/** Parses artifacts previously written by {@link stringifySessionArtifacts}. */
export function parseSessionArtifacts(value: string | undefined): readonly ISessionArtifact[] {
	if (!value) {
		return [];
	}
	try {
		return readSessionArtifacts({ [SESSION_META_ARTIFACTS_KEY]: JSON.parse(value) });
	} catch {
		return [];
	}
}

/**
 * The value that identifies an artifact for de-duplication: its link, resource
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
