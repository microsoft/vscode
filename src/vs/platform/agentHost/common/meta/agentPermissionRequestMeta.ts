/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Reader for the permission metadata a remote agent host echoes onto a tool
 * call that is waiting for approval.
 *
 * A remote host describes the pending decision (run a command, read a file, …)
 * but does not stamp the `_meta.toolKind` rendering hint local agent adapters
 * provide, so the kind is recovered from here instead.
 */

interface IHasPermissionRequestMeta {
	readonly _meta?: Record<string, unknown>;
}

/**
 * The permission kinds that carry a rendering consequence. A remote host
 * reports more kinds than these; the rest are left unrecognized so they fall
 * through to the generic tool presentation.
 */
export const enum AgentPermissionRequestKind {
	/** Execute a shell command. */
	Commands = 'commands',
	/** Read a single file. */
	Read = 'read',
	/** Write to a single file. */
	Write = 'write',
}

export interface IAgentPermissionRequestMeta {
	readonly kind?: AgentPermissionRequestKind;
	/** Absolute path of the file a write request targets. */
	readonly fileName?: string;
}

/**
 * Normalizes a wire `kind`. A shell request arrives as `"commands"` on the
 * projected payload and `"shell"` on the raw one.
 *
 * A path-batched request (`"path"`, whose own `accessKind` may be `"shell"`) is
 * not a command: its subject is a list of paths, not a command line.
 */
function normalizeKind(value: unknown): AgentPermissionRequestKind | undefined {
	switch (value) {
		case 'commands':
		case 'shell':
			return AgentPermissionRequestKind.Commands;
		case 'read':
			return AgentPermissionRequestKind.Read;
		case 'write':
			return AgentPermissionRequestKind.Write;
		default:
			return undefined;
	}
}

function readRequest(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;
}

/**
 * Reads the recognized permission metadata from a tool call's `_meta` bag.
 *
 * Hosts echo the same request as `promptRequest` (the prompt-shaped
 * projection) and `permissionRequest` (the raw form); older hosts send only
 * the raw one.
 */
export function readAgentPermissionRequestMeta(source: IHasPermissionRequestMeta): IAgentPermissionRequestMeta {
	const meta = source._meta;
	if (!meta) {
		return {};
	}
	const prompt = readRequest(meta['promptRequest']);
	const permission = readRequest(meta['permissionRequest']);
	const kind = normalizeKind(prompt?.['kind']) ?? normalizeKind(permission?.['kind']);
	if (!kind) {
		return {};
	}
	const fileName = prompt?.['fileName'] ?? permission?.['fileName'];
	return typeof fileName === 'string' && fileName
		? { kind, fileName }
		: { kind };
}
