/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getSessionArtifactValue, isGitHubArtifactLink, SESSION_ARTIFACT_TYPES, SessionArtifactType, type ISessionArtifact } from './sessionArtifacts.js';

/** The fields an agent supplies when adding an artifact. */
export interface ISessionArtifactInput {
	readonly type: SessionArtifactType;
	readonly label: string;
	readonly link?: string;
	readonly uri?: string;
	readonly commitHash?: string;
	readonly createdByThisSession?: boolean;
}

export interface IAddSessionArtifactResult {
	readonly artifacts: readonly ISessionArtifact[];
	readonly artifact: ISessionArtifact;
	/** `false` when an artifact with the same value already existed. */
	readonly added: boolean;
}

export interface IRemoveSessionArtifactResult {
	readonly artifacts: readonly ISessionArtifact[];
	readonly removed: ISessionArtifact | undefined;
}

const linkTypes: ReadonlySet<SessionArtifactType> = new Set([SessionArtifactType.PullRequest, SessionArtifactType.Issue, SessionArtifactType.Website, SessionArtifactType.Commit]);
const uriTypes: ReadonlySet<SessionArtifactType> = new Set([SessionArtifactType.File, SessionArtifactType.Resource]);
const gitHubTypes: ReadonlySet<SessionArtifactType> = new Set([SessionArtifactType.PullRequest, SessionArtifactType.Issue]);

function requireString(value: unknown, field: string, toolName: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
	}
	return value.trim();
}

/**
 * A link is opened externally on click, which hands it to the OS protocol
 * handler. Only web links may do that: a `file:` or custom-scheme link would
 * otherwise let an agent-labelled pill launch a local target.
 */
function requireWebLink(value: unknown, field: string, toolName: string): string {
	const link = requireString(value, field, toolName);
	let scheme: string;
	try {
		scheme = new URL(link).protocol;
	} catch {
		throw new Error(`Invalid ${toolName} input: ${field} must be an absolute http(s) URL.`);
	}
	if (scheme !== 'http:' && scheme !== 'https:') {
		throw new Error(`Invalid ${toolName} input: ${field} must be an http(s) URL, but was '${scheme}'.`);
	}
	return link;
}

/** Validates and normalizes raw `add_artifact` arguments. */
export function parseSessionArtifactInput(rawArgs: unknown, toolName: string): ISessionArtifactInput {
	if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
		throw new Error(`Invalid ${toolName} input: expected an object.`);
	}
	const args = rawArgs as Record<string, unknown>;
	const type = args['type'];
	if (typeof type !== 'string' || !(SESSION_ARTIFACT_TYPES as readonly string[]).includes(type)) {
		throw new Error(`Invalid ${toolName} input: type must be one of ${SESSION_ARTIFACT_TYPES.join(', ')}.`);
	}

	const artifactType = type as SessionArtifactType;
	const input: { type: SessionArtifactType; label: string; link?: string; uri?: string; commitHash?: string; createdByThisSession?: boolean } = {
		type: artifactType,
		label: requireString(args['label'], 'label', toolName),
	};

	if (linkTypes.has(artifactType)) {
		input.link = requireWebLink(args['link'], 'link', toolName);
	}
	if (uriTypes.has(artifactType)) {
		input.uri = requireString(args['uri'], 'uri', toolName);
	}
	if (artifactType === SessionArtifactType.Commit) {
		input.commitHash = requireString(args['commitHash'], 'commitHash', toolName);
	}
	if (artifactType === SessionArtifactType.PullRequest) {
		if (typeof args['createdByThisSession'] !== 'boolean') {
			throw new Error(`Invalid ${toolName} input: createdByThisSession must be a boolean for pull request artifacts.`);
		}
		input.createdByThisSession = args['createdByThisSession'];
	}
	return input;
}

/**
 * The artifacts recorded on a session. Immutable: mutations return the next
 * list so callers stay in control of persisting and publishing it.
 */
export class SessionArtifactCollection {

	constructor(private readonly _artifacts: readonly ISessionArtifact[] = []) { }

	get artifacts(): readonly ISessionArtifact[] {
		return this._artifacts;
	}

	/**
	 * Adds an artifact unless one with the same value already exists, in which
	 * case the existing artifact is returned unchanged.
	 */
	add(input: ISessionArtifactInput, createId: () => string): IAddSessionArtifactResult {
		const artifact = this._create(input, createId);
		const value = getSessionArtifactValue(artifact);
		const existing = this._artifacts.find(candidate => getSessionArtifactValue(candidate) === value);
		if (existing) {
			return { artifacts: this._artifacts, artifact: existing, added: false };
		}
		return { artifacts: [...this._artifacts, artifact], artifact, added: true };
	}

	remove(id: string): IRemoveSessionArtifactResult {
		const removed = this._artifacts.find(artifact => artifact.id === id);
		return {
			artifacts: removed ? this._artifacts.filter(artifact => artifact !== removed) : this._artifacts,
			removed,
		};
	}

	private _create(input: ISessionArtifactInput, createId: () => string): ISessionArtifact {
		const artifact: {
			id: string;
			type: SessionArtifactType;
			label: string;
			link?: string;
			uri?: string;
			commitHash?: string;
			isGitHub?: boolean;
			createdByThisSession?: boolean;
		} = { id: createId(), type: input.type, label: input.label };

		if (input.link !== undefined) { artifact.link = input.link; }
		if (input.uri !== undefined) { artifact.uri = input.uri; }
		if (input.commitHash !== undefined) { artifact.commitHash = input.commitHash; }
		if (input.link !== undefined && gitHubTypes.has(input.type)) { artifact.isGitHub = isGitHubArtifactLink(input.link); }
		if (input.createdByThisSession !== undefined) { artifact.createdByThisSession = input.createdByThisSession; }
		return artifact;
	}
}
