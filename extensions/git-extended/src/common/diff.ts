/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { getFileContent, writeTmpFile } from './file';
import { GitChangeType, RichFileChange } from './models/file';
import { Repository } from './models/repository';
import { Comment } from './models/comment';
import { DiffHunk, getDiffChangeType, DiffLine, DiffChangeType } from './models/diffHunk';

export const MODIFY_DIFF_INFO = /diff --git a\/(\S+) b\/(\S+).*\n*index.*\n*-{3}.*\n*\+{3}.*\n*((.*\n*)+)/;
export const NEW_FILE_INFO = /diff --git a\/(\S+) b\/(\S+).*\n*new file mode .*\nindex.*\n*-{3}.*\n*\+{3}.*\n*((.*\n*)+)/;
export const DELETE_FILE_INFO = /diff --git a\/(\S+) b\/(\S+).*\n*deleted file mode .*\nindex.*\n*-{3}.*\n*\+{3}.*\n*((.*\n*)+)/;
export const DIFF_HUNK_HEADER = /@@ \-(\d+)(,(\d+))?( \+(\d+)(,(\d+)?))? @@/;

export function countCarriageReturns(text: string): number {
	let count = 0;
	let index = 0;
	while ((index = text.indexOf('\r', index)) !== -1) {
		index++;
		count++;
	}

	return count;
}

export function* LineReader(text: string): IterableIterator<string> {
	let index = 0;

	while (index !== -1 && index < text.length) {
		let startIndex = index;
		index = text.indexOf('\n', index);
		let endIndex = index !== -1 ? index : text.length;
		let length = endIndex - startIndex;

		if (index !== -1) {
			if (index > 0 && text[index - 1] === '\r') {
				length--;
			}

			index++;
		}

		yield text.substr(startIndex, length);
	}
}

export function* parseDiffHunk(diffHunkPatch: string): IterableIterator<DiffHunk> {
	let lineReader = LineReader(diffHunkPatch);

	let itr = lineReader.next();
	let diffHunk: DiffHunk = null;
	let positionInHunk = -1;
	let oldLine = -1;
	let newLine = -1;

	while (!itr.done) {
		const line = itr.value;
		if (DIFF_HUNK_HEADER.test(line)) {
			if (diffHunk) {
				yield diffHunk;
				diffHunk = null;
			}

			if (positionInHunk === -1) {
				positionInHunk = 0;
			}

			const matches = DIFF_HUNK_HEADER.exec(line);
			const oriStartLine = oldLine = Number(matches[1]);
			const oriLen = Number(matches[3]) | 0;
			const newStartLine = newLine = Number(matches[5]);
			const newLen = Number(matches[7]) | 0;

			diffHunk = new DiffHunk(oriStartLine, oriLen, newStartLine, newLen, positionInHunk);
		} else if (diffHunk !== null) {
			let type = getDiffChangeType(line);

			if (type === DiffChangeType.Control) {
				if (diffHunk.diffLines && diffHunk.diffLines.length) {
					diffHunk.diffLines[diffHunk.diffLines.length - 1].endwithLineBreak = false;
				}
			} else {
				diffHunk.diffLines.push(new DiffLine(type, type !== DiffChangeType.Add ? oldLine : -1,
					type !== DiffChangeType.Delete ? newLine : -1,
					positionInHunk,
					line
				));

				let lineCount = 1 + countCarriageReturns(line);

				switch (type) {
					case DiffChangeType.Context:
						oldLine += lineCount;
						newLine += lineCount;
						break;
					case DiffChangeType.Delete:
						oldLine += lineCount;
						break;
					case DiffChangeType.Add:
						newLine += lineCount;
						break;
				}
			}
		}

		if (positionInHunk !== -1) {
			++positionInHunk;
		}
		itr = lineReader.next();
	}

	if (diffHunk) {
		yield diffHunk;
	}
}

export function getDiffLineByPosition(prPatch: string, diffLineNumber: number): DiffLine {
	let prDiffReader = parseDiffHunk(prPatch);
	let prDiffIter = prDiffReader.next();

	while (!prDiffIter.done) {
		let diffHunk = prDiffIter.value;
		for (let i = 0; i < diffHunk.diffLines.length; i++) {
			if (diffHunk.diffLines[i].positionInHunk === diffLineNumber) {
				return diffHunk.diffLines[i];
			}
		}

		prDiffIter = prDiffReader.next();
	}

	return null;
}

export function mapHeadLineToDiffHunkPosition(prPatch: string, localDiff: string, line: number): number {
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

	let prDiffReader = parseDiffHunk(prPatch);
	let prDiffIter = prDiffReader.next();

	let positionInDiffHunk = -1;

	while (!prDiffIter.done) {
		let diffHunk = prDiffIter.value;
		if (diffHunk.newLineNumber <= lineInPRDiff && diffHunk.newLineNumber + diffHunk.newLength - 1 >= lineInPRDiff) {
			positionInDiffHunk = lineInPRDiff - diffHunk.newLineNumber + diffHunk.positionInHunk + 1;
			break;
		}

		prDiffIter = prDiffReader.next();
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
			continue;
		} else if (diffHunk.oldLineNumber + diffHunk.oldLength - 1 < line) {
			delta = diffHunk.newLength - diffHunk.oldLength;
		} else {
			return line + delta;
		}

		diffIter = diffReader.next();
	}

	return line + delta;
}

async function parseModifiedHunkComplete(originalContent, patch, a, b) {
	let left = originalContent.split(/\r|\n|\r\n/);
	let diffHunkReader = parseDiffHunk(patch);
	let diffHunkIter = diffHunkReader.next();

	let right = [];
	let lastCommonLine = 0;
	while (!diffHunkIter.done) {
		let diffHunk = diffHunkIter.value;

		let oriStartLine = diffHunk.oldLineNumber;

		for (let j = lastCommonLine + 1; j < oriStartLine; j++) {
			right.push(left[j - 1]);
		}

		lastCommonLine = oriStartLine + diffHunk.oldLength - 1;

		for (let j = 0; j < diffHunk.diffLines.length; j++) {
			let diffLine = diffHunk.diffLines[j];
			if (diffLine.type === DiffChangeType.Delete) {
			} else if (diffLine.type === DiffChangeType.Add) {
				right.push(diffLine.text);
			} else {
				let codeInFirstLine = diffLine.text;
				right.push(codeInFirstLine);
			}
		}

		diffHunkIter = diffHunkReader.next();
	}

	if (lastCommonLine < left.length) {
		for (let j = lastCommonLine + 1; j <= left.length; j++) {
			right.push(left[j - 1]);
		}
	}

	let contentPath = await writeTmpFile(right.join('\n'), path.extname(b));
	let originalContentPath = await writeTmpFile(left.join('\n'), path.extname(a));

	return new RichFileChange(contentPath, originalContentPath, GitChangeType.MODIFY, b, patch);
}

async function parseModifiedHunkFast(modifyDiffInfo, a, b) {
	let left = [];
	let right = [];

	let diffHunks = modifyDiffInfo.split('\n');
	diffHunks.pop(); // there is one additional line break at the end of the diff ??

	for (let i = 0; i < diffHunks.length; i++) {
		let line = diffHunks[i];
		if (/@@ \-(\d+)(,(\d+))?( \+(\d+)(,(\d+)?))? @@/.test(line)) {
			// let changeInfo = /@@ \-(\d+)(,(\d+))?( \+(\d+)(,(\d+)?))? @@/.exec(line);
			left.push(line);
			right.push(line);
		} else if (/^\-/.test(line)) {
			left.push(line.substr(1));
		} else if (/^\+/.test(line)) {
			right.push(line.substr(1));
		} else {
			let codeInFirstLine = line.substr(1);
			left.push(codeInFirstLine);
			right.push(codeInFirstLine);
		}
	}

	let contentPath = await writeTmpFile(right.join('\n'), path.extname(b));
	let originalContentPath = await writeTmpFile(left.join('\n'), path.extname(a));

	return new RichFileChange(contentPath, originalContentPath, GitChangeType.MODIFY, b, modifyDiffInfo);
}

export async function parseDiff(reviews: any[], repository: Repository, parentCommit: string): Promise<RichFileChange[]> {
	let richFileChanges: RichFileChange[] = [];
	for (let i = 0; i < reviews.length; i++) {
		let review = reviews[i];
		if (review.status === 'modified') {
			let fileName = review.filename;

			try {
				let originalContent = await getFileContent(repository.path, parentCommit, fileName);
				let richFileChange = await parseModifiedHunkComplete(originalContent, review.patch, fileName, fileName);
				richFileChange.blobUrl = review.blob_url;
				richFileChanges.push(richFileChange);
			} catch (e) {
				let richFileChange = await parseModifiedHunkFast(review.patch, fileName, fileName);
				richFileChange.blobUrl = review.blob_url;
				richFileChanges.push(richFileChange);
			}
		} else if (review.status === 'removed') {
			let fileName = review.filename;
			let diffHunks = review.patch.split('\n');
			let contentArray = [];
			for (let i = 0; i < diffHunks.length; i++) {
				if (/@@ \-(\d+)(,(\d+))?( \+(\d+)(,(\d+)?))? @@$/.test(diffHunks[i])) {
					continue;
				} else if (/@@ \-(\d+)(,(\d+))?( \+(\d+)(,(\d+)?))? @@ /.test(diffHunks[i])) {
					contentArray.push(diffHunks[i].replace(/@@ \-(\d+)(,(\d+))?( \+(\d+)(,(\d+)?))? @@ /, ''));
				} else if (/^\-/.test(diffHunks[i])) {
					contentArray.push(diffHunks[i].substr(1));
				}
			}
			let originalFilePath = await writeTmpFile(contentArray.join('\n'), path.extname(fileName));
			let filePath = await writeTmpFile('', path.extname(fileName));
			let richFileChange = new RichFileChange(filePath, originalFilePath, GitChangeType.DELETE, fileName, review.patch);
			richFileChange.blobUrl = review.blob_url;
			richFileChanges.push(richFileChange);
		} else {
			// added
			let fileName = review.filename;
			let diffHunks = review.patch.split('\n');
			let contentArray = [];
			for (let i = 0; i < diffHunks.length; i++) {
				if (/@@ \-(\d+)(,(\d+))?( \+(\d+)(,(\d+)?))? @@$/.test(diffHunks[i])) {
					continue;
				} else if (/@@ \-(\d+)(,(\d+))?( \+(\d+)(,(\d+)?))? @@ /.test(diffHunks[i])) {
					contentArray.push(diffHunks[i].replace(/@@ \-(\d+)(,(\d+))?( \+(\d+)(,(\d+)?))? @@ /, ''));
				} else if (/^\+/.test(diffHunks[i])) {
					contentArray.push(diffHunks[i].substr(1));
				}
			}
			let oriFilePath = await writeTmpFile('', path.extname(fileName));
			let filePath = await writeTmpFile(contentArray.join('\n'), path.extname(fileName));
			let richFileChange = new RichFileChange(filePath, oriFilePath, GitChangeType.ADD, fileName, review.patch);
			richFileChange.blobUrl = review.blob_url;
			richFileChanges.push(richFileChange);
		}
	}
	return richFileChanges;
}

export function mapCommentsToHead(prPatch: string, localDiff: string, comments: Comment[]) {
	for (let i = 0; i < comments.length; i++) {
		let comment = comments[i];

		let diffLine = getDiffLineByPosition(prPatch, comment.position);
		let positionInPr = diffLine.newLineNumber;
		let newPosition = mapOldPositionToNew(localDiff, positionInPr);
		comment.absolutePosition = newPosition;
	}

	return comments;
}