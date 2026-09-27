/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

import { createServiceIdentifier } from '../../../util/common/services';
import { binarySearch2 } from '../../../util/vs/base/common/arrays';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { LRUCache } from '../../../util/vs/base/common/map';

export const MAX_GREP_RESULT_SESSIONS = 16;

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
	readonly onDidRemoveGrepResult: Event<{ sessionUri: vscode.Uri; requestId: string }>;

	addGrepResult(sessionUri: vscode.Uri, requestId: string, result: MatchResult): void;
	getGrepResult(sessionUri: vscode.Uri, uri: vscode.Uri, startLine: number, endLine: number): vscode.Range[] | undefined;
}

export class NullGrepResultService implements IGrepResultService {
	declare readonly _serviceBrand: undefined;
	readonly onDidRemoveGrepResult = Event.None;

	addGrepResult(sessionUri: vscode.Uri, requestId: string, result: MatchResult): void {
		// No-op
	}

	getGrepResult(sessionUri: vscode.Uri, uri: vscode.Uri, startLine: number, endLine: number): vscode.Range[] | undefined {
		return undefined;
	}
}

interface FileMatches {
	ranges: vscode.Range[];
	prefixMaxEndLines: number[];
}

interface GrepResult {
	requestId: string;
	matches: Map<string, FileMatches>;
}

class SessionMatches {

	// Keep maximum of `maxMatches` grep results per session.
	// The results are used to adjust read line calls. If no
	// match is found the original values are used so the line
	//  bounds remain accurate. Capping the value helps to
	// limit memory usage.
	private static readonly maxMatches = 16;

	public readonly sessionUri: vscode.Uri;
	private readonly matches: GrepResult[];

	constructor(sessionUri: vscode.Uri) {
		this.sessionUri = sessionUri;
		this.matches = [];
	}

	add(result: GrepResult): string | undefined {
		this.matches.push(result);
		if (this.matches.length > SessionMatches.maxMatches) {
			return this.matches.shift()?.requestId;
		}
		return undefined;
	}

	getRequestIds(): string[] {
		return this.matches.map(match => match.requestId);
	}

	get(uri: vscode.Uri, startLine: number, endLine: number): vscode.Range[] {
		const result: vscode.Range[] = [];
		const seen = new Set<string>();
		const uriKey = uri.toString();

		for (let i = this.matches.length - 1; i >= 0; i--) {
			const fileMatches = this.matches[i].matches.get(uriKey);
			if (!fileMatches) {
				continue;
			}

			const startIndex = ~binarySearch2(fileMatches.ranges.length, index => fileMatches.prefixMaxEndLines[index] < startLine ? -1 : 1);
			const endIndex = ~binarySearch2(fileMatches.ranges.length, index => fileMatches.ranges[index].start.line <= endLine ? -1 : 1);
			for (let matchIndex = startIndex; matchIndex < endIndex; matchIndex++) {
				const match = fileMatches.ranges[matchIndex];
				if (match.end.line < startLine || match.start.line > endLine) {
					continue;
				}

				const key = `${match.start.line}:${match.start.character}-${match.end.line}:${match.end.character}`;
				if (!seen.has(key)) {
					seen.add(key);
					result.push(match);
				}
			}
		}

		return result;
	}
}

export class GrepResultService extends Disposable implements IGrepResultService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRemoveGrepResult = this._register(new Emitter<{ sessionUri: vscode.Uri; requestId: string }>());
	readonly onDidRemoveGrepResult = this._onDidRemoveGrepResult.event;

	private readonly cache: LRUCache<string, SessionMatches>;

	constructor() {
		super();
		this.cache = new LRUCache<string, SessionMatches>(MAX_GREP_RESULT_SESSIONS);
	}

	addGrepResult(sessionUri: vscode.Uri, requestId: string, result: MatchResult): void {
		const key = sessionUri.toString();
		let sessionMatches = this.cache.get(key);
		if (sessionMatches === undefined) {
			const evictedSessionMatches = this.cache.size >= this.cache.limit ? this.cache.first : undefined;
			sessionMatches = new SessionMatches(sessionUri);
			this.cache.set(key, sessionMatches);
			if (evictedSessionMatches !== undefined) {
				for (const evictedRequestId of evictedSessionMatches.getRequestIds()) {
					this._onDidRemoveGrepResult.fire({ sessionUri: evictedSessionMatches.sessionUri, requestId: evictedRequestId });
				}
			}
		}

		const matches = new Map<string, FileMatches>();
		for (const file of result.files) {
			const ranges = file.matches.map(match => match.ranges[0].sourceRange);
			const prefixMaxEndLines: number[] = [];
			let maxEndLine = -1;
			for (const range of ranges) {
				maxEndLine = Math.max(maxEndLine, range.end.line);
				prefixMaxEndLines.push(maxEndLine);
			}
			matches.set(file.uri.toString(), { ranges, prefixMaxEndLines });
		}
		const removedRequestId = sessionMatches.add({ requestId, matches });
		if (removedRequestId !== undefined) {
			this._onDidRemoveGrepResult.fire({ sessionUri, requestId: removedRequestId });
		}
	}

	getGrepResult(sessionUri: vscode.Uri, uri: vscode.Uri, startLine: number, endLine: number): vscode.Range[] | undefined {
		const matches = this.cache.get(sessionUri.toString());
		if (!matches) {
			return undefined;
		}
		return matches.get(uri, startLine, endLine);
	}
}
