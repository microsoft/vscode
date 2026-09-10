/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
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
	readonly onDidRemoveGrepResult: Event<string>;

	addGrepResult(sessionUri: vscode.Uri, requestId: string, result: MatchResult): void;
	getGrepResult(sessionUri: vscode.Uri, requestId: string, uri: vscode.Uri, startLine: number, endLine: number): vscode.Range[] | undefined;
}

export class NullGrepResultService implements IGrepResultService {
	declare readonly _serviceBrand: undefined;
	readonly onDidRemoveGrepResult = Event.None;

	addGrepResult(sessionUri: vscode.Uri, requestId: string, result: MatchResult): void {
		// No-op
	}

	getGrepResult(sessionUri: vscode.Uri, requestId: string, uri: vscode.Uri, startLine: number, endLine: number): vscode.Range[] | undefined {
		return undefined;
	}
}

interface GrepResult {
	requestId: string;
	matches: Map<string, vscode.Range[]>;
}

class SessionMatches {
	private static readonly maxMatches = 16;

	private readonly matches: GrepResult[];

	constructor() {
		this.matches = [];
	}

	add(result: GrepResult): string | undefined {
		this.matches.push(result);
		if (this.matches.length > SessionMatches.maxMatches) {
			return this.matches.shift()?.requestId;
		}
		return undefined;
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

			for (const match of fileMatches) {
				if (match.start.line < startLine || match.start.line > endLine) {
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
	readonly _serviceBrand: undefined;

	private readonly _onDidRemoveGrepResult = this._register(new Emitter<string>());
	readonly onDidRemoveGrepResult = this._onDidRemoveGrepResult.event;

	private readonly cache: LRUCache<string, SessionMatches>;

	constructor() {
		super();
		this.cache = new LRUCache<string, SessionMatches>(10);
	}

	addGrepResult(sessionUri: vscode.Uri, requestId: string, result: MatchResult): void {
		const key = sessionUri.toString();
		let sessionMatches = this.cache.get(key);
		if (sessionMatches === undefined) {
			sessionMatches = new SessionMatches();
			this.cache.set(key, sessionMatches);
		}

		const matches = new Map<string, vscode.Range[]>();
		for (const file of result.files) {
			matches.set(file.uri.toString(), file.matches.map(m => m.ranges[0].sourceRange));
		}
		const removedRequestId = sessionMatches.add({ requestId, matches });
		if (removedRequestId !== undefined) {
			this._onDidRemoveGrepResult.fire(removedRequestId);
		}
	}

	getGrepResult(sessionUri: vscode.Uri, requestId: string, uri: vscode.Uri, startLine: number, endLine: number): vscode.Range[] | undefined {
		const matches = this.cache.get(sessionUri.toString());
		if (!matches) {
			return undefined;
		}
		return matches.get(uri, startLine, endLine);
	}
}
