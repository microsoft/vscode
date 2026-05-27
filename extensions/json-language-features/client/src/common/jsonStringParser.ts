/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface JsonPosition {
	line: number;
	character: number;
}

export interface JsonDocumentLike {
	uri: { toString(): string };
	version: number;
	lineAt(line: number): { text: string };
}

export interface JsonDocumentChangeLike {
	range?: {
		start: {
			line: number;
		};
	};
}

interface ParseState {
	inString: boolean;
	escaped: boolean;
	inLineComment: boolean;
	inBlockComment: boolean;
}

interface SnapshotEntry {
	state: ParseState;
	version: number;
}

export interface JsonStringAnalysis {
	insideString: boolean;
	snapshotLine: number | undefined;
	snapshotVersionMatched: boolean;
	startLine: number;
	endLine: number;
	linesScanned: number;
	finalState: {
		inString: boolean;
		escaped: boolean;
		inLineComment: boolean;
		inBlockComment: boolean;
	};
}

export interface JsonCacheSummary {
	documentUri: string;
	snapshotCount: number;
	snapshotLines: number[];
	snapshotVersions: number[];
	newestSnapshotLine: number | undefined;
	oldestSnapshotLine: number | undefined;
}

function createParseState(): ParseState {
	return {
		inString: false,
		escaped: false,
		inLineComment: false,
		inBlockComment: false
	};
}

function cloneParseState(state: ParseState): ParseState {
	return {
		inString: state.inString,
		escaped: state.escaped,
		inLineComment: state.inLineComment,
		inBlockComment: state.inBlockComment
	};
}

function summarizeState(state: ParseState): JsonStringAnalysis['finalState'] {
	return {
		inString: state.inString,
		escaped: state.escaped,
		inLineComment: state.inLineComment,
		inBlockComment: state.inBlockComment
	};
}

function isStringDelimiter(character: string): boolean {
	return character === '"';
}

function isEscapeCharacter(character: string): boolean {
	return character === '\\';
}

function isLineCommentStart(first: string, second: string): boolean {
	return first === '/' && second === '/';
}

function isBlockCommentStart(first: string, second: string): boolean {
	return first === '/' && second === '*';
}

function isBlockCommentEnd(first: string, second: string): boolean {
	return first === '*' && second === '/';
}

function binarySearchLastAtOrBefore(values: number[], target: number): number {
	let low = 0;
	let high = values.length - 1;
	let result = -1;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const value = values[middle];
		if (value <= target) {
			result = middle;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}

	return result;
}

function insertSortedUnique(values: number[], value: number): void {
	const index = binarySearchLastAtOrBefore(values, value);
	if (index >= 0 && values[index] === value) {
		return;
	}
	values.splice(index + 1, 0, value);
}

function removeFromSorted(values: number[], startIndex: number): void {
	if (startIndex < values.length) {
		values.splice(startIndex, values.length - startIndex);
	}
}

function processLineCharacters(lineText: string, limit: number, state: ParseState): void {
	for (let index = 0; index < limit; index++) {
		const currentChar = lineText.charAt(index);
		const nextChar = index + 1 < lineText.length ? lineText.charAt(index + 1) : '';

		if (state.inLineComment) {
			break;
		}

		if (state.inBlockComment) {
			if (isBlockCommentEnd(currentChar, nextChar)) {
				state.inBlockComment = false;
				index++;
			}
			continue;
		}

		if (state.inString) {
			if (state.escaped) {
				state.escaped = false;
				continue;
			}

			if (isEscapeCharacter(currentChar)) {
				state.escaped = true;
				continue;
			}

			if (isStringDelimiter(currentChar)) {
				state.inString = false;
			}
			continue;
		}

		if (isLineCommentStart(currentChar, nextChar)) {
			state.inLineComment = true;
			index++;
			continue;
		}

		if (isBlockCommentStart(currentChar, nextChar)) {
			state.inBlockComment = true;
			index++;
			continue;
		}

		if (isStringDelimiter(currentChar)) {
			state.inString = true;
		}
	}
}

class ParseStateCache {
	private readonly cache = new Map<string, {
		snapshots: Map<number, SnapshotEntry>;
		lines: number[];
	}>();

	private getOrCreateDocumentCache(documentUriString: string): { snapshots: Map<number, SnapshotEntry>; lines: number[] } {
		let docCache = this.cache.get(documentUriString);
		if (!docCache) {
			docCache = {
				snapshots: new Map<number, SnapshotEntry>(),
				lines: []
			};
			this.cache.set(documentUriString, docCache);
		}
		return docCache;
	}

	getNearestSnapshot(document: JsonDocumentLike, line: number): { line: number; state: ParseState; version: number; versionMatched: boolean } | undefined {
		const docCache = this.cache.get(document.uri.toString());
		if (!docCache) {
			return undefined;
		}

		const nearestIndex = binarySearchLastAtOrBefore(docCache.lines, line);
		if (nearestIndex === -1) {
			return undefined;
		}

		let versionMatched = false;
		for (let index = nearestIndex; index >= 0; index--) {
			const cachedLine = docCache.lines[index];
			const snapshot = docCache.snapshots.get(cachedLine);
			if (!snapshot) {
				continue;
			}
			if (snapshot.version === document.version) {
				versionMatched = true;
				return {
					line: cachedLine,
					state: cloneParseState(snapshot.state),
					version: snapshot.version,
					versionMatched
				};
			}
		}

		const nearestLine = docCache.lines[nearestIndex];
		const nearestSnapshot = docCache.snapshots.get(nearestLine);
		if (!nearestSnapshot) {
			return undefined;
		}

		return {
			line: nearestLine,
			state: cloneParseState(nearestSnapshot.state),
			version: nearestSnapshot.version,
			versionMatched
		};
	}

	setSnapshot(document: JsonDocumentLike, line: number, state: ParseState): void {
		const docCache = this.getOrCreateDocumentCache(document.uri.toString());
		docCache.snapshots.set(line, { state: cloneParseState(state), version: document.version });
		insertSortedUnique(docCache.lines, line);
	}

	invalidate(documentUriString: string): void {
		this.cache.delete(documentUriString);
	}

	invalidateFromLine(documentUriString: string, line: number): void {
		const docCache = this.cache.get(documentUriString);
		if (!docCache) {
			return;
		}

		const startIndex = binarySearchLastAtOrBefore(docCache.lines, line - 1) + 1;
		for (let index = startIndex; index < docCache.lines.length; index++) {
			docCache.snapshots.delete(docCache.lines[index]);
		}
		removeFromSorted(docCache.lines, startIndex);
	}

	getSnapshotLines(documentUriString: string): number[] {
		const docCache = this.cache.get(documentUriString);
		if (!docCache) {
			return [];
		}
		return docCache.lines.slice();
	}

	getDocumentSummary(documentUriString: string): JsonCacheSummary | undefined {
		const docCache = this.cache.get(documentUriString);
		if (!docCache) {
			return undefined;
		}

		return {
			documentUri: documentUriString,
			snapshotCount: docCache.lines.length,
			snapshotLines: docCache.lines.slice(),
			snapshotVersions: docCache.lines.map(line => docCache.snapshots.get(line)?.version ?? -1),
			oldestSnapshotLine: docCache.lines[0],
			newestSnapshotLine: docCache.lines[docCache.lines.length - 1]
		};
	}

	clear(): void {
		this.cache.clear();
	}
}

export class JsonParserService {
	private readonly cache = new ParseStateCache();

	constructor(private readonly cacheInterval = 50) { }

	analyzePosition(document: JsonDocumentLike, position: JsonPosition): JsonStringAnalysis {
		const snapshot = this.cache.getNearestSnapshot(document, position.line);
		const state = snapshot ? cloneParseState(snapshot.state) : createParseState();
		const startLine = snapshot ? snapshot.line + 1 : 0;
		let linesScanned = 0;

		for (let line = startLine; line <= position.line; line++) {
			const lineText = document.lineAt(line).text;
			const characterLimit = line === position.line ? position.character : lineText.length;
			processLineCharacters(lineText, characterLimit, state);
			state.inLineComment = false;
			linesScanned++;

			if ((line + 1) % this.cacheInterval === 0) {
				this.cache.setSnapshot(document, line, state);
			}
		}

		return {
			insideString: state.inString,
			snapshotLine: snapshot?.line,
			snapshotVersionMatched: snapshot?.versionMatched ?? false,
			startLine,
			endLine: position.line,
			linesScanned,
			finalState: summarizeState(state)
		};
	}

	isInsideJsonString(document: JsonDocumentLike, position: JsonPosition): boolean {
		return this.analyzePosition(document, position).insideString;
	}

	onDidChangeTextDocument(document: JsonDocumentLike, contentChanges: readonly JsonDocumentChangeLike[]): void {
		if (!contentChanges.length) {
			this.cache.invalidate(document.uri.toString());
			return;
		}

		let earliestLine = Number.POSITIVE_INFINITY;
		for (const contentChange of contentChanges) {
			if (!contentChange.range) {
				earliestLine = 0;
				break;
			}
			earliestLine = Math.min(earliestLine, contentChange.range.start.line);
		}

		if (!Number.isFinite(earliestLine)) {
			this.cache.invalidate(document.uri.toString());
			return;
		}

		this.cache.invalidateFromLine(document.uri.toString(), earliestLine);
	}

	onDidCloseTextDocument(document: JsonDocumentLike): void {
		this.cache.invalidate(document.uri.toString());
	}

	getSnapshotLinesForTesting(documentUriString: string): number[] {
		return this.cache.getSnapshotLines(documentUriString);
	}

	getCacheSummaryForTesting(documentUriString: string): JsonCacheSummary | undefined {
		return this.cache.getDocumentSummary(documentUriString);
	}

	getAnalysisSummary(document: JsonDocumentLike, position: JsonPosition): JsonStringAnalysis {
		return this.analyzePosition(document, position);
	}

	warmCache(document: JsonDocumentLike, endLine: number): void {
		if (endLine < 0) {
			return;
		}

		try {
			const fakePosition = { line: endLine, character: document.lineAt(endLine).text.length };
			this.analyzePosition(document, fakePosition);
		} catch {
			return;
		}
	}

	clearCache(): void {
		this.cache.clear();
	}
}
