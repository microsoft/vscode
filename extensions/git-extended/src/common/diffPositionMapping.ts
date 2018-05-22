/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DiffLine, DiffHunk } from '../models/diffHunk';
import { parseDiffHunk } from './diff';
import { Comment } from '../models/comment';
export function getLastDiffLine(prPatch: string): DiffLine {
	let lastDiffLine = null;
	let prDiffReader = parseDiffHunk(prPatch);
	let prDiffIter = prDiffReader.next();

	while (!prDiffIter.done) {
		let diffHunk = prDiffIter.value;
		lastDiffLine = diffHunk.diffLines[diffHunk.diffLines.length - 1];

		prDiffIter = prDiffReader.next();
	}

	return lastDiffLine;
}

export function getDiffLineByPosition(diffHunks: DiffHunk[], diffLineNumber: number): DiffLine {
	for (let i = 0; i < diffHunks.length; i++) {
		let diffHunk = diffHunks[i];
		for (let i = 0; i < diffHunk.diffLines.length; i++) {
			if (diffHunk.diffLines[i].positionInHunk === diffLineNumber) {
				return diffHunk.diffLines[i];
			}
		}
	}

	return null;
}

export function mapHeadLineToDiffHunkPosition(diffHunks: DiffHunk[], localDiff: string, line: number): number {
	let delta = 0;

	let localDiffReader = parseDiffHunk(localDiff);
	let localDiffIter = localDiffReader.next();
	let lineInPRDiff = line;

	while (!localDiffIter.done) {
		let diffHunk = localDiffIter.value;
		if (diffHunk.newLineNumber + diffHunk.newLength - 1 < line) {
			delta += diffHunk.oldLength - diffHunk.newLength;
		} else {
			lineInPRDiff = line + delta;
			break;
		}

		localDiffIter = localDiffReader.next();
	}

	let positionInDiffHunk = -1;

	for (let i = 0; i < diffHunks.length; i++) {
		let diffHunk = diffHunks[i];

		if (diffHunk.newLineNumber <= lineInPRDiff && diffHunk.newLineNumber + diffHunk.newLength - 1 >= lineInPRDiff) {
			positionInDiffHunk = lineInPRDiff - diffHunk.newLineNumber + diffHunk.positionInHunk + 1;
			break;
		}
	}

	return positionInDiffHunk;
}

export function mapOldPositionToNew(patch: string, line: number): number {
	let diffReader = parseDiffHunk(patch);
	let diffIter = diffReader.next();

	let delta = 0;
	while (!diffIter.done) {
		let diffHunk = diffIter.value;

		if (diffHunk.oldLineNumber > line) {
			// No-op
		} else if (diffHunk.oldLineNumber + diffHunk.oldLength - 1 < line) {
			delta += diffHunk.newLength - diffHunk.oldLength;
		} else {
			delta += diffHunk.newLength - diffHunk.oldLength;
			return line + delta;
		}

		diffIter = diffReader.next();
	}

	return line + delta;
}

export function mapCommentsToHead(diffHunks: DiffHunk[], localDiff: string, comments: Comment[]) {
	for (let i = 0; i < comments.length; i++) {
		const comment = comments[i];

		// Diff line is null when the original line the comment was on has been removed
		const diffLine = getDiffLineByPosition(diffHunks, comment.position | comment.original_position);
		if (diffLine) {
			const positionInPr = diffLine.newLineNumber;
			const newPosition = mapOldPositionToNew(localDiff, positionInPr);
			comment.absolutePosition = newPosition;
		}
	}

	return comments;
}