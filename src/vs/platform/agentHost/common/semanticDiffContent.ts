/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { ISemanticDiffAnalysis, ISemanticDiffFile, SemanticDiffComparison } from './semanticDiff.js';

/**
 * Scheme of the content references the agent host serves for one side of a
 * file in a semantic group. Read with `resourceRead`, never resolved.
 */
export const SEMANTIC_DIFF_CONTENT_SCHEME = 'semantic-diff-content';

/**
 * A zero-context Git hunk header: one-based starts, where a zero count means
 * an insertion (old side) or deletion (new side) after the start line.
 */
export interface ISemanticDiffHunkRange {
	readonly oldStart: number;
	readonly oldCount: number;
	readonly newStart: number;
	readonly newCount: number;
}

/**
 * One side of one file of a semantic group. The agent host computes the
 * content when it is read: the original side is the file at the base
 * revision, and the modified side is that file with only the group's hunks
 * applied, taken from the comparison's current target.
 */
export interface ISemanticDiffContentRequest {
	readonly sessionUri: string;
	readonly comparison: SemanticDiffComparison;
	readonly baseRevision: string;
	/** Set only for {@link SemanticDiffComparison} `commitRange`. */
	readonly targetRevision: string | null;
	readonly side: 'original' | 'modified';
	readonly path: string;
	readonly oldPath: string | null;
	readonly status: ISemanticDiffFile['status'];
	/** The group's hunks in this file, in source order. */
	readonly hunks: readonly ISemanticDiffHunkRange[];
}

type SerializedHunk = [number, number, number, number];

type SerializedContentRequest = Omit<ISemanticDiffContentRequest, 'hunks'> & { readonly hunks: readonly SerializedHunk[] };

/**
 * Builds the content reference for one side of a file. `displayPath` becomes
 * the URI path so editors show a recognizable file name; the agent host never
 * uses it to locate content.
 */
export function buildSemanticDiffContentUri(request: ISemanticDiffContentRequest, displayPath: string): URI {
	const serialized: SerializedContentRequest = {
		...request,
		hunks: request.hunks.map(hunk => [hunk.oldStart, hunk.oldCount, hunk.newStart, hunk.newCount]),
	};
	return URI.from({ scheme: SEMANTIC_DIFF_CONTENT_SCHEME, path: displayPath, query: JSON.stringify(serialized) });
}

/** Parses a reference built by {@link buildSemanticDiffContentUri}, rejecting anything malformed. */
export function parseSemanticDiffContentUri(uri: URI): ISemanticDiffContentRequest | undefined {
	if (uri.scheme !== SEMANTIC_DIFF_CONTENT_SCHEME || !uri.query) {
		return undefined;
	}
	let value: Partial<Record<keyof SerializedContentRequest, unknown>>;
	try {
		value = JSON.parse(uri.query);
	} catch {
		return undefined;
	}
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}
	const { sessionUri, comparison, baseRevision, targetRevision, side, path, oldPath, status, hunks } = value;
	if (typeof sessionUri !== 'string'
		|| (comparison !== 'staged' && comparison !== 'workingTree' && comparison !== 'commitRange')
		|| !isRevision(baseRevision)
		|| (comparison === 'commitRange' ? !isRevision(targetRevision) : targetRevision !== null)
		|| (side !== 'original' && side !== 'modified')
		|| !isRepositoryPath(path) || (oldPath !== null && !isRepositoryPath(oldPath))
		|| (status !== 'added' && status !== 'modified' && status !== 'deleted' && status !== 'renamed')
		|| !Array.isArray(hunks) || hunks.length === 0 || hunks.length > 500) {
		return undefined;
	}
	const ranges: ISemanticDiffHunkRange[] = [];
	for (const hunk of hunks) {
		if (!Array.isArray(hunk) || hunk.length !== 4 || !hunk.every(value => Number.isSafeInteger(value) && value >= 0)) {
			return undefined;
		}
		const [oldStart, oldCount, newStart, newCount] = hunk as SerializedHunk;
		ranges.push({ oldStart, oldCount, newStart, newCount });
	}
	return { sessionUri, comparison, baseRevision, targetRevision: isRevision(targetRevision) ? targetRevision : null, side, path, oldPath, status, hunks: ranges };
}

function isRevision(value: unknown): value is string {
	return typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
}

function isRepositoryPath(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 4096
		&& !/[\0\\\r\n]/.test(value) && !value.startsWith('/') && !/^[a-zA-Z]:/.test(value)
		&& value === posix.normalize(value) && !value.split('/').some(segment => segment === '..' || segment === '.' || segment.length === 0);
}

/** One file of a semantic group with only the hunks the group owns. */
export interface ISemanticDiffGroupFile {
	readonly file: ISemanticDiffFile;
	readonly hunks: readonly ISemanticDiffHunkRange[];
}

/** Selects the files of a group, preserving submission order. */
export function getSemanticDiffGroupFiles(analysis: ISemanticDiffAnalysis, groupId: string): readonly ISemanticDiffGroupFile[] {
	const result: ISemanticDiffGroupFile[] = [];
	for (const file of analysis.files) {
		const hunks = analysis.hunks
			.filter(hunk => hunk.fileId === file.id && hunk.classification.groupId === groupId)
			.map(hunk => ({ oldStart: hunk.oldRange.start, oldCount: hunk.oldRange.count, newStart: hunk.newRange.start, newCount: hunk.newRange.count }));
		if (hunks.length) {
			result.push({ file, hunks });
		}
	}
	return result;
}

/** Splits text into lines, each keeping its own terminator so content round-trips exactly. */
function splitLines(text: string): string[] {
	return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Zero-based index of the first line a range covers, or the insertion point of an empty range. */
function lineOffset(start: number, count: number): number {
	return count === 0 ? start : start - 1;
}

/**
 * Rebuilds the modified side of a file with only `hunks` applied to `base`,
 * taking each hunk's new lines from `target`. Hunks are zero-context hunk
 * ranges between `base` and `target`, in source order.
 */
export function projectSemanticDiffContent(base: string, target: string, hunks: readonly ISemanticDiffHunkRange[]): string {
	const baseLines = splitLines(base);
	const targetLines = splitLines(target);
	const parts: string[] = [];
	let position = 0;
	for (const hunk of hunks) {
		const oldOffset = lineOffset(hunk.oldStart, hunk.oldCount);
		const newOffset = lineOffset(hunk.newStart, hunk.newCount);
		if (oldOffset < position || oldOffset + hunk.oldCount > baseLines.length || newOffset + hunk.newCount > targetLines.length) {
			throw new Error('Hunks must be ordered, non-overlapping, and within both files.');
		}
		parts.push(...baseLines.slice(position, oldOffset), ...targetLines.slice(newOffset, newOffset + hunk.newCount));
		position = oldOffset + hunk.oldCount;
	}
	parts.push(...baseLines.slice(position));
	return parts.join('');
}
