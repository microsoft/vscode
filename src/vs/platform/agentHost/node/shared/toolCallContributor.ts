/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ToolCallContributorKind, type ToolCallContributor } from '../../common/state/sessionState.js';

/**
 * Pure helpers describing a tool call's contributor.
 *
 * These live outside `agentHostToolCallTracker.ts` because the turn tracker needs them too,
 * and the tool-call tracker injects the turn tracker. Keeping them here means neither
 * tracker has to import the other at runtime.
 */

/**
 * Maps a tool call's contributor to the telemetry `toolSourceKind`. A tool with
 * no contributor is provided by the agent host itself; an MCP contributor maps
 * to `mcp` and a client contributor to `client`.
 */
export function toolSourceKindFromContributor(contributor: ToolCallContributor | undefined): string {
	if (!contributor) {
		return 'agentHost';
	}
	// Widen to `string` so an unrecognized kind from a newer protocol version
	// falls through to a valid telemetry value rather than `undefined`.
	const kind: string = contributor.kind;
	switch (kind) {
		case ToolCallContributorKind.MCP:
			return 'mcp';
		case ToolCallContributorKind.Client:
			return 'client';
		default:
			return kind;
	}
}

/**
 * Whether `next` is a safe refinement of the currently recorded contributor.
 * A client contributor may only be refined by the same client, and a client
 * contributor is never replaced by a non-client one, so execution ownership
 * cannot be reassigned by a later, less specific signal.
 */
export function canRefineContributor(current: ToolCallContributor | undefined, next: ToolCallContributor): boolean {
	if (current?.kind === ToolCallContributorKind.Client) {
		return next.kind === ToolCallContributorKind.Client && next.clientId === current.clientId;
	}
	return next.kind !== ToolCallContributorKind.Client;
}
