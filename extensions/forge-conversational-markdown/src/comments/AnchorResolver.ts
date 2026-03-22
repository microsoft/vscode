/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseForgeMarkerRanges } from '../markdown/forgeMarkers';
import type {
	BlockAnchor,
	CommentThreadRecord,
	RenderableBlock,
	SelectionAnchor,
	ThreadAnchor,
	ThreadStatus,
} from '../protocol/types';
import type { MutableCommentThreadRecord } from './ThreadModel';

export interface ResolvedThread {
	readonly thread: CommentThreadRecord;
	readonly blockIndex: number | null;
	readonly updatedStatus: ThreadStatus;
	readonly updatedAnchor: ThreadAnchor;
}

function headingPathKey(path: readonly string[]): string {
	return path.join('\u0001');
}

function pathsEqual(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	return a.every((v, i) => v === b[i]);
}

/**
 * Match persisted threads to current blocks. Updates anchors when matched.
 * Unmatched threads stay visible with status `outdated` (except resolved selection threads stay resolved).
 */
export function resolveThreadsToBlocks(
	threads: readonly CommentThreadRecord[],
	blocks: readonly RenderableBlock[],
	source: string,
): ResolvedThread[] {
	const results: ResolvedThread[] = [];
	for (const thread of threads) {
		if (thread.anchor.kind === 'selection') {
			results.push(resolveSelectionThread(thread, blocks, source));
		} else {
			results.push(resolveBlockThread(thread, blocks));
		}
	}
	return results;
}

function resolveSelectionThread(
	thread: CommentThreadRecord,
	blocks: readonly RenderableBlock[],
	source: string,
): ResolvedThread {
	const anchor = thread.anchor as SelectionAnchor;
	const ranges = parseForgeMarkerRanges(source);
	const mid = anchor.markerId.toLowerCase();
	const hit = ranges.find(r => r.markerId === mid);
	if (!hit) {
		const updatedStatus: ThreadStatus = thread.status === 'resolved' ? 'resolved' : 'outdated';
		return {
			thread,
			blockIndex: null,
			updatedStatus,
			updatedAnchor: anchor,
		};
	}
	let blockIdx: number | null = null;
	for (let i = 0; i < blocks.length; i++) {
		const b = blocks[i]!;
		if (hit.startMarkerLine >= b.startLine && hit.startMarkerLine < b.endLine) {
			blockIdx = b.blockIndex;
			break;
		}
	}
	const updatedAnchor: SelectionAnchor = {
		kind: 'selection',
		markerId: mid,
		quotedText: hit.quotedText,
		anchorLine: hit.startMarkerLine,
	};
	const updatedStatus: ThreadStatus = thread.status === 'resolved' ? 'resolved' : 'open';
	return { thread, blockIndex: blockIdx, updatedStatus, updatedAnchor };
}

function resolveBlockThread(thread: CommentThreadRecord, blocks: readonly RenderableBlock[]): ResolvedThread {
	const anchor = thread.anchor as BlockAnchor;
	const match = findBestBlock(anchor, blocks);
	if (match !== null) {
		const b = blocks[match]!;
		const updatedAnchor: BlockAnchor = {
			...anchor,
			startLine: b.startLine,
			endLine: b.endLine,
			blockType: b.blockType,
			headingPath: [...b.headingPath],
			ordinal: b.ordinal,
			textFingerprint: b.textFingerprint,
			previewText: b.previewText.slice(0, 200),
		};
		const updatedStatus: ThreadStatus = thread.status === 'resolved' ? 'resolved' : 'open';
		return {
			thread,
			blockIndex: match,
			updatedStatus,
			updatedAnchor,
		};
	}
	const updatedStatus: ThreadStatus = thread.status === 'resolved' ? 'resolved' : 'outdated';
	return {
		thread,
		blockIndex: null,
		updatedStatus,
		updatedAnchor: anchor,
	};
}

function findBestBlock(anchor: BlockAnchor, blocks: readonly RenderableBlock[]): number | null {
	if (blocks.length === 0) {
		return null;
	}

	const hKey = headingPathKey(anchor.headingPath);
	for (let i = 0; i < blocks.length; i++) {
		const b = blocks[i]!;
		if (
			b.textFingerprint === anchor.textFingerprint
			&& headingPathKey(b.headingPath) === hKey
			&& b.ordinal === anchor.ordinal
		) {
			return i;
		}
	}

	const fpHeading: number[] = [];
	for (let i = 0; i < blocks.length; i++) {
		const b = blocks[i]!;
		if (b.textFingerprint === anchor.textFingerprint && pathsEqual(b.headingPath, anchor.headingPath)) {
			fpHeading.push(i);
		}
	}
	if (fpHeading.length === 1) {
		return fpHeading[0]!;
	}

	const fpOnly: number[] = [];
	for (let i = 0; i < blocks.length; i++) {
		if (blocks[i]!.textFingerprint === anchor.textFingerprint) {
			fpOnly.push(i);
		}
	}
	if (fpOnly.length === 1) {
		return fpOnly[0]!;
	}

	let bestIdx = -1;
	let bestDist = Number.POSITIVE_INFINITY;
	for (let i = 0; i < blocks.length; i++) {
		const b = blocks[i]!;
		const dist = Math.abs(b.startLine - anchor.startLine);
		if (dist < bestDist) {
			bestDist = dist;
			bestIdx = i;
		}
	}
	if (bestIdx >= 0 && bestDist <= 12) {
		return bestIdx;
	}

	return null;
}

export function applyResolvedAnchors(threads: MutableCommentThreadRecord[], resolved: readonly ResolvedThread[]): void {
	const byId = new Map(resolved.map(r => [r.thread.id, r] as const));
	for (let i = 0; i < threads.length; i++) {
		const r = byId.get(threads[i]!.id);
		if (!r) {
			continue;
		}
		threads[i] = {
			...threads[i]!,
			status: r.updatedStatus,
			anchor: r.updatedAnchor,
		};
	}
}
