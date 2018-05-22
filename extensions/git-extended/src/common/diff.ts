/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { getFileContent, writeTmpFile } from './file';
import { GitChangeType, RichFileChange } from '../models/file';
import { Repository } from '../models/repository';
import { DiffHunk, getDiffChangeType, DiffLine, DiffChangeType } from '../models/diffHunk';

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

async function parseModifiedHunkComplete(originalContent, patch, a, b) {
	let left = originalContent.split(/\r|\n|\r\n/);
	let diffHunkReader = parseDiffHunk(patch);
	let diffHunkIter = diffHunkReader.next();
	let diffHunks = [];

	let right = [];
	let lastCommonLine = 0;
	while (!diffHunkIter.done) {
		let diffHunk = diffHunkIter.value;
		diffHunks.push(diffHunk);

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

	return new RichFileChange(contentPath, originalContentPath, GitChangeType.MODIFY, b, diffHunks);
}

async function parseModifiedHunkFast(modifyDiffInfo, a, b) {
	let left = [];
	let right = [];

	let diffHunkReader = parseDiffHunk(modifyDiffInfo);
	let diffHunkIter = diffHunkReader.next();
	let diffHunks = [];

	while (!diffHunkIter.done) {
		let diffHunk = diffHunkIter.value;
		diffHunks.push(diffHunk);
		for (let i = 0, len = diffHunk.diffLines.length; i < len; i++) {
			let diffLine = diffHunk.diffLines[i];
			if (diffLine.type === DiffChangeType.Add) {
				right.push(diffLine.text);
			} else if (diffLine.type === DiffChangeType.Delete) {
				left.push(diffLine.text);
			} else {
				left.push(diffLine.text);
				right.push(diffLine.text);
			}
		}
	}

	let contentPath = await writeTmpFile(right.join('\n'), path.extname(b));
	let originalContentPath = await writeTmpFile(left.join('\n'), path.extname(a));

	return new RichFileChange(contentPath, originalContentPath, GitChangeType.MODIFY, b, diffHunks);
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
		} else if (review.status === 'removed' || review.status === 'added' || review.status === 'renamed') {
			if (!review.patch) {
				continue;
			}

			let gitChangeType = GitChangeType.UNKNOWN;
			switch (review.status) {
				case 'removed':
					gitChangeType = GitChangeType.DELETE;
					break;
				case 'added':
					gitChangeType = GitChangeType.ADD;
					break;
				case 'renamed':
					gitChangeType = GitChangeType.RENAME;
					break;
				default:
					break;
			}

			let contentArray = [];
			let fileName = review.filename;
			let prDiffReader = parseDiffHunk(review.patch);
			let prDiffIter = prDiffReader.next();
			let diffHunks = [];

			while (!prDiffIter.done) {
				let diffHunk = prDiffIter.value;
				diffHunks.push(diffHunk);
				for (let j = 0, len = diffHunk.diffLines.length; j < len; j++) {
					let diffLine = diffHunk.diffLines[j];
					if (diffLine.type !== DiffChangeType.Control) {
						contentArray.push(diffLine.text);
					}
				}
				prDiffIter = prDiffReader.next();
			}

			let contentFilePath = await writeTmpFile(contentArray.join('\n'), path.extname(fileName));
			let emptyContentFilePath = await writeTmpFile('', path.extname(fileName));
			let richFileChange = review.status === 'removed' ?
				new RichFileChange(emptyContentFilePath, contentFilePath, gitChangeType, fileName, diffHunks) :
				new RichFileChange(contentFilePath, emptyContentFilePath, gitChangeType, fileName, diffHunks);
			richFileChange.blobUrl = review.blob_url;
			richFileChanges.push(richFileChange);
		}
	}
	return richFileChanges;
}

