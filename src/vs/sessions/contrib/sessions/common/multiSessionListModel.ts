/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/**
 * Identifier for the agent session lifecycle state we surface in the list.
 *
 * Mirrors the subset of `ChatSessionStatus` that's user-visible so the UI
 * never has to import workbench-internal enums and the transform stays
 * fully testable from a `common/` layer.
 */
export const enum MultiSessionListRowStatus {
	Failed = 'failed',
	Completed = 'completed',
	InProgress = 'in-progress',
	NeedsInput = 'needs-input',
}

export interface MultiSessionInputRow {
	readonly resource: URI;
	readonly label: string;
	readonly providerType: string;
	readonly status: MultiSessionListRowStatus;
	readonly archived: boolean;
	readonly description?: string;
	readonly created: number;
	readonly lastActivity?: number;
	/** Resource URI of the orchestrator/parent session that spawned this one. */
	readonly parentResource?: URI;
}

export interface MultiSessionListRow {
	readonly resource: URI;
	readonly label: string;
	readonly providerType: string;
	readonly status: MultiSessionListRowStatus;
	readonly description?: string;
	readonly elapsedMs: number;
	readonly depth: number;
	readonly hasChildren: boolean;
	readonly parentResource?: URI;
}

export interface BuildOptions {
	/** Wall-clock time used to compute `elapsedMs`. */
	readonly now: number;
	/** Maximum depth to render (inclusive). Deeper rows are flattened to the cap. */
	readonly maxDepth?: number;
	/** Maximum total rows; overflow rows are omitted (most-recent-first wins). */
	readonly limit?: number;
}

/**
 * Transform a raw agent-session list into a flat, depth-annotated list ready
 * for rendering. Pure function — no DOM, no observables — so the transform is
 * exercised entirely from `common/` tests.
 *
 * Ordering:
 *   1. Archived sessions are dropped.
 *   2. Roots (no resolvable parent) are sorted most-recent-activity first.
 *   3. For each root, its children are emitted depth-first, also most-recent
 *      first; this matches the orchestrator-then-specialists narrative.
 *
 * Children whose parent is missing (archived, filtered, or never seen) are
 * promoted to roots so they're never silently dropped.
 */
export function buildMultiSessionList(input: ReadonlyArray<MultiSessionInputRow>, options: BuildOptions): MultiSessionListRow[] {
	const live = input.filter(row => !row.archived);
	const byResource = new Map<string, MultiSessionInputRow>();
	const childrenByParent = new Map<string, MultiSessionInputRow[]>();

	for (const row of live) {
		byResource.set(row.resource.toString(), row);
	}

	const roots: MultiSessionInputRow[] = [];
	for (const row of live) {
		const parentKey = row.parentResource?.toString();
		if (parentKey && byResource.has(parentKey)) {
			const list = childrenByParent.get(parentKey) ?? [];
			list.push(row);
			childrenByParent.set(parentKey, list);
		} else {
			roots.push(row);
		}
	}

	const compareByRecency = (a: MultiSessionInputRow, b: MultiSessionInputRow): number => {
		const aTime = a.lastActivity ?? a.created;
		const bTime = b.lastActivity ?? b.created;
		return bTime - aTime;
	};

	roots.sort(compareByRecency);
	for (const list of childrenByParent.values()) {
		list.sort(compareByRecency);
	}

	const maxDepth = options.maxDepth ?? Number.MAX_SAFE_INTEGER;
	const out: MultiSessionListRow[] = [];

	const emit = (row: MultiSessionInputRow, depth: number): void => {
		if (options.limit !== undefined && out.length >= options.limit) {
			return;
		}

		const cappedDepth = Math.min(depth, maxDepth);
		const children = childrenByParent.get(row.resource.toString()) ?? [];

		out.push({
			resource: row.resource,
			label: row.label,
			providerType: row.providerType,
			status: row.status,
			description: row.description,
			elapsedMs: Math.max(0, options.now - (row.lastActivity ?? row.created)),
			depth: cappedDepth,
			hasChildren: children.length > 0,
			parentResource: row.parentResource,
		});

		for (const child of children) {
			emit(child, depth + 1);
		}
	};

	for (const root of roots) {
		emit(root, 0);
	}

	return out;
}

/**
 * Format an elapsed millisecond duration as a compact, screen-reader-safe
 * string. Examples: `12s`, `4m`, `1h 12m`, `3d`.
 */
export function formatElapsed(elapsedMs: number): string {
	if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
		return '';
	}
	const seconds = Math.floor(elapsedMs / 1_000);
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		const remMinutes = minutes - hours * 60;
		return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
	}
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

/**
 * Convention key used to record an orchestrator/parent session's resource on a
 * spawned specialist. Documented here so any agent that wants to nest itself in
 * the multi-session list emits the same metadata field.
 */
export const PARENT_SESSION_METADATA_KEY = 'parentSessionResource';
