/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import type * as vscode from 'vscode';
import { LRUCache } from '../../../util/vs/base/common/map';

export const IGrepResultService = createServiceIdentifier<IGrepResultService>('grepResultService');

interface FileMatch {
	path: string;
	matches: vscode.TextSearchMatch2[];
}

interface MatchResult {
	files: FileMatch[];
}

export interface IGrepResultService {
	addGrepResult(requestId: string, result: MatchResult): void;
	getGrepResult(requestId: string, path: string, startLine: number, endLine: number): { line: number } | undefined;
}

export class NullGrepResultService implements IGrepResultService {
	addGrepResult(requestId: string, result: MatchResult): void {
		// No-op
	}

	getGrepResult(requestId: string, path: string, startLine: number, endLine: number): { line: number } | undefined {
		return undefined;
	}
}

interface Matches {
	files: Map<string, vscode.Range[]>;
}

export class GrepResultService implements IGrepResultService {
	private readonly cache: LRUCache<string, Matches>;

	constructor() {
		this.cache = new LRUCache<string, Matches>(10);
	}
	addGrepResult(requestId: string, result: MatchResult): void {
		const matches: Matches = { files: new Map() };
		for (const file of result.files) {
			matches.files.set(file.path, file.matches.map(m => m.ranges[0].sourceRange));
		}
		this.cache.set(requestId, matches);
	}

	getGrepResult(requestId: string, path: string, startLine: number, endLine: number): { line: number } | undefined {
		const matches = this.cache.get(requestId);
		if (!matches) {
			return undefined;
		}
		const fileMatches = matches.files.get(path);
		if (!fileMatches) {
			return undefined;
		}

		let low = 0;
		let high = fileMatches.length;
		while (low < high) {
			const mid = low + Math.floor((high - low) / 2);
			if (fileMatches[mid].start.line < startLine) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}

		const middleLine = startLine + (endLine - startLine) / 2;
		let closestLine: number | undefined;
		let closestDistance = Number.POSITIVE_INFINITY;
		for (let i = low; i < fileMatches.length; i++) {
			const line = fileMatches[i].start.line;
			if (line > endLine) {
				break;
			}

			const distance = Math.abs(line - middleLine);
			if (distance < closestDistance) {
				closestLine = line;
				closestDistance = distance;
			}
		}

		return closestLine === undefined ? undefined : { line: closestLine };
	}
}
