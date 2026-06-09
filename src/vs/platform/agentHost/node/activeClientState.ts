/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/objects.js';
import type { ToolDefinition } from '../common/state/protocol/state.js';

/**
 * Structural view of the active client's contributions that, when changed,
 * requires the underlying SDK session to be restarted / rebound. The
 * `clientId` is deliberately excluded — a window reload that produces a new
 * `clientId` with an identical tool list does NOT require a restart.
 */
export interface IActiveClientStructuralSnapshot {
	readonly tools: readonly ToolDefinition[];
}

/**
 * Deep-equal two client-tool snapshots on `name + description + inputSchema`.
 * `undefined` and `[]` compare equal. Order-insensitive.
 *
 * Single shared implementation for the agent-host providers — previously
 * duplicated as `snapshotsEqual` (Claude client-tools model) and an inline
 * loop in the Copilot `ActiveClient` staleness check.
 */
export function structuralToolsEqual(
	a: readonly ToolDefinition[] | undefined,
	b: readonly ToolDefinition[] | undefined,
): boolean {
	const aa = a ?? [];
	const bb = b ?? [];
	if (aa.length !== bb.length) {
		return false;
	}
	const byName = new Map<string, ToolDefinition>();
	for (const t of aa) {
		byName.set(t.name, t);
	}
	for (const t of bb) {
		const prev = byName.get(t.name);
		if (!prev) {
			return false;
		}
		if (prev.description !== t.description) {
			return false;
		}
		if (!equals(prev.inputSchema, t.inputSchema)) {
			return false;
		}
	}
	return true;
}

/**
 * Live, mutable holder for the active client's identity (`clientId`) and the
 * structural tool snapshot it contributes. Shared between the Copilot and
 * Claude providers so a single long-lived instance per session URI survives
 * SDK-session dispose / resume cycles.
 *
 * The `clientId` is read at tool-call **stamp time** (not cached per turn) so
 * that a window reload — which connects with a new `clientId` and re-pushes an
 * identical tool list — stamps subsequent client tool calls with the new,
 * live `clientId` instead of a frozen one baked in at session creation.
 */
export class ActiveClientState {
	private _clientId: string | undefined = undefined;
	private _tools: readonly ToolDefinition[] = [];

	/** Live owning client id, or `undefined` when no client is currently connected. */
	get clientId(): string | undefined {
		return this._clientId;
	}

	/** Structural state (tool definitions). Changing these requires an SDK restart/rebind. */
	get tools(): readonly ToolDefinition[] {
		return this._tools;
	}

	/**
	 * Replace the owning `clientId` (`undefined` when no client is connected)
	 * and the contributed tool list. A `clientId`-only change does NOT mark
	 * structural dirt (see {@link structuralEquals}).
	 */
	update(clientId: string | undefined, tools: readonly ToolDefinition[]): void {
		this._clientId = clientId;
		this._tools = tools;
	}

	/**
	 * Structural comparison of the live tools against a previously-applied
	 * snapshot (`name + description + inputSchema`, order-insensitive).
	 * Returns `true` when no SDK restart is required.
	 */
	structuralEquals(applied: IActiveClientStructuralSnapshot): boolean {
		return structuralToolsEqual(this._tools, applied.tools);
	}
}
