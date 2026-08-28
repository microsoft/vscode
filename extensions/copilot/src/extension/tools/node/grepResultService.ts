/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

import { createServiceIdentifier } from '../../../util/common/services';
import { LRUCache } from '../../../util/vs/base/common/map';

export const IGrepResultService = createServiceIdentifier<IGrepResultService>('IGrepResultService');

interface FileMatch {
	uri: vscode.Uri;
	matches: vscode.TextSearchMatch2[];
}

interface MatchResult {
	files: FileMatch[];
}

export interface IGrepResultService {
	readonly _serviceBrand: undefined;

	addGrepResult(requestId: string, result: MatchResult): void;
	getGrepResult(requestId: string, uri: vscode.Uri, startLine: number, endLine: number): vscode.Range[] | undefined;
}

export class NullGrepResultService implements IGrepResultService {
	declare readonly _serviceBrand: undefined;

	addGrepResult(requestId: string, result: MatchResult): void {
		// No-op
	}

	getGrepResult(requestId: string, uri: vscode.Uri, startLine: number, endLine: number): vscode.Range[] | undefined {
		return undefined;
	}
}

interface Matches {
	files: Map<string, vscode.Range[]>;
}

export class GrepResultService implements IGrepResultService {
	readonly _serviceBrand: undefined;

	private readonly cache: LRUCache<string, Matches>;

	constructor() {
		this.cache = new LRUCache<string, Matches>(10);
	}

	addGrepResult(requestId: string, result: MatchResult): void {
		let matches: Matches | undefined = this.cache.get(requestId);
		if (matches === undefined) {
			matches = { files: new Map() };
			for (const file of result.files) {
				matches.files.set(file.uri.toString(), file.matches.map(m => m.ranges[0].sourceRange));
			}
			this.cache.set(requestId, matches);
		} else {
			for (const file of result.files) {
				const existingRanges = matches.files.get(file.uri.toString());
				if (existingRanges === undefined) {
					matches.files.set(file.uri.toString(), file.matches.map(m => m.ranges[0].sourceRange));
				} else {
					const existingRangesSet = new Set<number>(existingRanges.map(r => r.start.line));
					for (const match of file.matches) {
						const line = match.ranges[0].sourceRange.start.line;
						if (!existingRangesSet.has(line)) {
							existingRanges.push(match.ranges[0].sourceRange);
							existingRangesSet.add(line);
						}
					}
					existingRanges.sort((a, b) => a.start.line - b.start.line);
					matches.files.set(file.uri.toString(), existingRanges);
				}
			}
		}
	}

	getGrepResult(requestId: string, uri: vscode.Uri, startLine: number, endLine: number): vscode.Range[] | undefined {
		const matches = this.cache.get(requestId);
		if (!matches) {
			return undefined;
		}
		const fileMatches = matches.files.get(uri.toString());
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

		const result: vscode.Range[] = [];
		for (let i = low; i < fileMatches.length; i++) {
			const match = fileMatches[i];
			if (match.start.line > endLine) {
				break;
			}
			result.push(match);
		}

		return result;
	}
}
