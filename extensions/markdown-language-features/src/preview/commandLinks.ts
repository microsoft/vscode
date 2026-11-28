/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from 'vscode-uri';

type UriComponents = Parameters<typeof URI.from>[0];

const uriComponentFields = ['authority', 'path', 'query', 'fragment'] as const;
const uriComponentKeys = new Set<string>(['scheme', ...uriComponentFields]);

type PreviewCommandPermission = 'allowed' | 'untrustedWorkspace' | 'invalidConfiguration' | 'notAllowed';

/**
 * Authorize only the requested command ID using a fresh User/Remote User value.
 * Accept the inspection result rather than an effective setting: repository-controlled
 * Workspace and Folder values must never be able to grant command execution.
 */
export function getPreviewCommandPermission(commandId: string, isTrusted: boolean, setting: { readonly globalValue?: unknown } | undefined): PreviewCommandPermission {
	if (!isTrusted) {
		return 'untrustedWorkspace';
	}

	const allowed: unknown = setting?.globalValue === undefined ? [] : setting.globalValue;
	// Settings JSON can violate its schema. Fail closed for the entire list rather
	// than partially accepting a malformed permission configuration.
	if (!Array.isArray(allowed) || !allowed.every(id => typeof id === 'string' && /^[^\s\p{Cc}]+$/u.test(id))) {
		return 'invalidConfiguration';
	}

	// Exact matching gives '*' no wildcard meaning. An allowed composite such as
	// runCommands may invoke other commands; its arguments are not sandboxed here.
	return allowed.includes(commandId) ? 'allowed' : 'notAllowed';
}

/** Native editor operations supplied by the preview after checking the message's source. */
interface PreviewCommandHost {
	createUri(components: UriComponents): unknown;
	getPermission(commandId: string): PreviewCommandPermission;
	executeCommand(commandId: string, ...args: unknown[]): PromiseLike<unknown>;
}

type PreviewCommandResult = 'executed' | 'invalidLink' | 'invalidArguments' | 'invalidUri' | 'failed' | Exclude<PreviewCommandPermission, 'allowed'>;

/**
 * Parse the encoded command URL, revive URI arguments, then authorize and dispatch.
 * The injected host keeps parsing testable without an extension host. Only fixed
 * result codes cross back to the UI; URLs, arguments, command results and raw
 * exceptions may contain private data and must not become notification content.
 */
export async function dispatchPreviewCommand(href: unknown, host: PreviewCommandHost): Promise<PreviewCommandResult> {
	if (typeof href !== 'string' || /\p{Cc}/u.test(href)) {
		return 'invalidLink';
	}

	// Parse before URI normalization so an empty query remains different from no
	// query. Authorities and fragments do not describe a command invocation.
	const match = /^command:(?<id>[^?#]+)(?:\?(?<query>[^#]*))?$/i.exec(href);
	if (!match?.groups || match.groups.id.startsWith('//')) {
		return 'invalidLink';
	}

	let commandId: string;
	try {
		commandId = decodeURIComponent(match.groups.id);
	} catch {
		return 'invalidLink';
	}
	if (/[\s\p{Cc}]/u.test(commandId)) {
		return 'invalidLink';
	}

	let args: unknown[] = [];
	if (match.groups.query !== undefined) {
		try {
			// The query is one percent-encoded JSON value, not form data. Decode it
			// once so '+' stays '+' and a literal '%20' does not become a space.
			const parsed: unknown = JSON.parse(decodeURIComponent(match.groups.query));
			if (!Array.isArray(parsed)) {
				return 'invalidArguments';
			}
			args = parsed;
		} catch {
			return 'invalidArguments';
		}
	}

	try {
		// Commands such as vscode.open require real Uri instances. Revive only
		// top-level URI arguments, preserving nested command payloads and ordinary
		// objects. Copy known fields rather than trusting serialized URI internals.
		args = args.map(arg => {
			if (!arg || typeof arg !== 'object' || Array.isArray(arg)) {
				return arg;
			}
			const record = arg as Record<string, unknown>;
			const hasMarker = Object.hasOwn(record, '$mid');
			// A serialized Uri explicitly opts in with $mid: 1. Without that marker,
			// accept only scheme/path objects containing standard URI components, as
			// used by the documented {scheme, path} example. Additional properties
			// indicate ordinary command data and must not be silently discarded.
			const isMarkedUri = hasMarker && record.$mid === 1;
			const isUnmarkedUri = !hasMarker && typeof record.scheme === 'string'
				&& Object.hasOwn(record, 'path') && Object.keys(record).every(key => uriComponentKeys.has(key));
			if (!isMarkedUri && !isUnmarkedUri) {
				return arg;
			}
			if (typeof record.scheme !== 'string' || !/^[a-z][a-z0-9+.-]*$/i.test(record.scheme)) {
				throw new Error();
			}
			const components: UriComponents = { scheme: record.scheme };
			for (const field of uriComponentFields) {
				if (record[field] !== undefined) {
					if (typeof record[field] !== 'string') {
						throw new Error();
					}
					components[field] = record[field];
				}
			}
			return host.createUri(components);
		});
	} catch {
		return 'invalidUri';
	}

	try {
		// Read permissions at the last possible moment, with no await between
		// authorization and dispatch. Revoking a grant affects the next click.
		const permission = host.getPermission(commandId);
		if (permission !== 'allowed') {
			return permission;
		}
		await host.executeCommand(commandId, ...args);
		return 'executed';
	} catch {
		return 'failed';
	}
}
