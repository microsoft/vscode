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
 * A per-session registry of the tools contributed by each active client,
 * keyed by `clientId` and kept in insertion order. Backs the multi-active-client
 * tool model shared by the agent-host providers (Copilot, Claude, Codex):
 * each provider stores one of these per session and exposes the
 * {@link merged} view to its SDK while routing tool calls back to the
 * {@link ownerOf | owning client}.
 *
 * Deduplication of {@link merged} is by tool `name`, first-inserted-client
 * wins, so the merged order and the owner of any given tool name are
 * deterministic regardless of how many clients contribute it.
 */
export class ActiveClientToolSet {
	private readonly _byClient = new Map<string, readonly ToolDefinition[]>();

	/** Number of clients currently contributing tools. */
	get size(): number {
		return this._byClient.size;
	}

	/** Whether `clientId` currently contributes tools. */
	has(clientId: string): boolean {
		return this._byClient.has(clientId);
	}

	/** The client ids currently contributing tools, in insertion order. */
	clientIds(): IterableIterator<string> {
		return this._byClient.keys();
	}

	/** This client's contributed tools, or an empty array when absent. */
	get(clientId: string): readonly ToolDefinition[] {
		return this._byClient.get(clientId) ?? [];
	}

	/**
	 * Replace `clientId`'s contributed tools (full replacement). A new
	 * `clientId` is appended after existing ones; re-setting an existing
	 * `clientId` keeps its insertion position so merged ordering and tool
	 * ownership stay stable across updates.
	 */
	set(clientId: string, tools: readonly ToolDefinition[]): void {
		this._byClient.set(clientId, tools);
	}

	/** Remove `clientId`'s contribution. Returns whether anything was removed. */
	delete(clientId: string): boolean {
		return this._byClient.delete(clientId);
	}

	/**
	 * The union of every client's tools, deduplicated by `name` with the
	 * first-inserted contributor winning. Order follows client insertion
	 * order, then per-client tool order.
	 */
	merged(): readonly ToolDefinition[] {
		const seen = new Set<string>();
		const result: ToolDefinition[] = [];
		for (const tools of this._byClient.values()) {
			for (const tool of tools) {
				if (seen.has(tool.name)) {
					continue;
				}
				seen.add(tool.name);
				result.push(tool);
			}
		}
		return result;
	}

	/**
	 * The `clientId` that owns the tool named `toolName`, or `undefined` when
	 * no active client provides it. When `preferredClientId` currently provides
	 * the tool it wins; otherwise the first-inserted contributor wins.
	 */
	ownerOf(toolName: string, preferredClientId?: string): string | undefined {
		if (preferredClientId && this.get(preferredClientId).some(tool => tool.name === toolName)) {
			return preferredClientId;
		}
		for (const [clientId, tools] of this._byClient) {
			if (tools.some(tool => tool.name === toolName)) {
				return clientId;
			}
		}
		return undefined;
	}

	/**
	 * Structural comparison of the current {@link merged} tools against a
	 * previously-applied snapshot (`name + description + inputSchema`,
	 * order-insensitive). Returns `true` when no SDK restart is required.
	 */
	structuralEquals(applied: readonly ToolDefinition[] | undefined): boolean {
		return structuralToolsEqual(this.merged(), applied);
	}
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
