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
 *
 * Compatibility bridge, not the durable contract: `promptRequest` and
 * `permissionRequest` are raw Copilot runtime payloads, not protocol fields, so
 * their shape can change without a version bump and every client has to learn
 * Copilot internals to render an approval. Delete this file, and its use in
 * `getToolKind`, once the minimum supported host describes confirmations
 * natively.
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
	/** Write a single file. */
	Write = 'write',
}

export interface IAgentPermissionRequestMeta {
	readonly kind?: AgentPermissionRequestKind;
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

function readRequest(value: unknown): IAgentPermissionRequestMeta | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const request = value as Record<string, unknown>;
	const kind = normalizeKind(request.kind);
	if (!kind) {
		return undefined;
	}
	if (kind === AgentPermissionRequestKind.Write && typeof request.fileName === 'string' && request.fileName.trim()) {
		return { kind, fileName: request.fileName };
	}
	return { kind };
}

/**
 * Reads the recognized permission metadata from a tool call's `_meta` bag.
 *
 * Hosts echo the same request as `promptRequest` (the prompt-shaped
 * projection) and `permissionRequest` (the raw form); older hosts send only
 * the raw one.
 */
export function readPermissionRequestMeta(source: IHasPermissionRequestMeta): IAgentPermissionRequestMeta {
	const meta = source._meta;
	if (!meta) {
		return {};
	}
	return readRequest(meta.promptRequest) ?? readRequest(meta.permissionRequest) ?? {};
}

/** Adds the edit diff consumed by Copilot clients without replacing native AHP edits. */
export function withPermissionDiff(meta: Record<string, unknown> | undefined, diff: string | undefined): Record<string, unknown> | undefined {
	return diff ? { ...meta, permissionRequest: { diff } } : meta;
}
