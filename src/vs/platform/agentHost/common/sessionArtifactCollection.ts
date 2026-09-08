/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { getSessionArtifactValue, isGitHubArtifactLink, SESSION_ARTIFACT_TYPES, SessionArtifactType, type ISessionArtifact } from './sessionArtifacts.js';

/** The fields an agent supplies when adding an artifact or reference. */
export interface ISessionArtifactInput {
	readonly type: SessionArtifactType;
	readonly label: string;
	/** `true` for an artifact the session produced, `false` for a reference. */
	readonly isArtifact: boolean;
	readonly link?: string;
	readonly uri?: string;
	readonly commitHash?: string;
}

export interface IAddSessionArtifactResult {
	readonly artifacts: readonly ISessionArtifact[];
	readonly artifact: ISessionArtifact;
	/** `false` when an entry with the same value already existed. */
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

/**
 * The client opens a `uri` by parsing it strictly, so anything it cannot parse
 * would be recorded, reported as added, and then quietly appear in no pill at
 * all. Parsing it the same way here gives the agent an error it can act on
 * instead. A single-letter scheme is a Windows drive path (`C:\repo\plan.md`),
 * which parses into a nonsense URI rather than failing, so it is rejected too.
 */
function requireUri(value: unknown, field: string, toolName: string): string {
	const uri = requireString(value, field, toolName);
	let scheme: string | undefined;
	try {
		scheme = URI.parse(uri, /*strict*/ true).scheme;
	} catch {
		scheme = undefined;
	}
	if (!scheme || scheme.length === 1) {
		throw new Error(`Invalid ${toolName} input: ${field} must be an absolute URI including its scheme, such as 'file:///path/to/file' — not a plain file system path.`);
	}
	return uri;
}

/** Validates and normalizes raw `add_artifact_or_reference` arguments. */
export function parseSessionArtifactInput(rawArgs: unknown, toolName: string): ISessionArtifactInput {
	if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
		throw new Error(`Invalid ${toolName} input: expected an object.`);
	}
	const args = rawArgs as Record<string, unknown>;
	const type = args['type'];
	if (typeof type !== 'string' || !(SESSION_ARTIFACT_TYPES as readonly string[]).includes(type)) {
		throw new Error(`Invalid ${toolName} input: type must be one of ${SESSION_ARTIFACT_TYPES.join(', ')}.`);
	}
	if (typeof args['isArtifact'] !== 'boolean') {
		throw new Error(`Invalid ${toolName} input: isArtifact must be a boolean — true for an artifact, false for a reference.`);
	}

	const artifactType = type as SessionArtifactType;
	const input: { type: SessionArtifactType; label: string; isArtifact: boolean; link?: string; uri?: string; commitHash?: string } = {
		type: artifactType,
		label: requireString(args['label'], 'label', toolName),
		isArtifact: args['isArtifact'],
	};

	if (linkTypes.has(artifactType)) {
		input.link = requireWebLink(args['link'], 'link', toolName);
	}
	if (uriTypes.has(artifactType)) {
		input.uri = requireUri(args['uri'], 'uri', toolName);
	}
	if (artifactType === SessionArtifactType.Commit) {
		input.commitHash = requireString(args['commitHash'], 'commitHash', toolName);
	}
	return input;
}

/**
 * The artifacts and references recorded on a session. Immutable: mutations
 * return the next list so callers stay in control of persisting and publishing
 * it.
 */
export class SessionArtifactCollection {

	constructor(private readonly _artifacts: readonly ISessionArtifact[] = []) { }

	get artifacts(): readonly ISessionArtifact[] {
		return this._artifacts;
	}

	/**
	 * Adds an artifact or reference unless one with the same value already
	 * exists, in which case the existing entry is returned unchanged.
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
			isArtifact: boolean;
			link?: string;
			uri?: string;
			commitHash?: string;
			isGitHub?: boolean;
		} = { id: createId(), type: input.type, label: input.label, isArtifact: input.isArtifact };

		if (input.link !== undefined) { artifact.link = input.link; }
		if (input.uri !== undefined) { artifact.uri = input.uri; }
		if (input.commitHash !== undefined) { artifact.commitHash = input.commitHash; }
		if (input.link !== undefined && gitHubTypes.has(input.type)) { artifact.isGitHub = isGitHubArtifactLink(input.link); }
		return artifact;
	}
}
