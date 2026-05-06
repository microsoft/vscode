/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { API as GitAPI, GitExtension, Repository as GitRepository } from '../../../git/src/api/git';
import type { MarkdownPreviewLineChanges } from '../../types/previewMessaging';

interface LineChanges {
	readonly added: readonly number[];
	readonly deleted: readonly number[];
	readonly originalToModified: readonly number[];
	readonly modifiedToOriginal: readonly number[];
}

interface LineMappings {
	readonly originalToModified: number[];
	readonly modifiedToOriginal: number[];
}

interface GitUriParams {
	readonly path: string;
	readonly ref: string;
	readonly submoduleOf?: string;
}

interface GitPatch {
	readonly patch: string;
	readonly isFullRepositoryDiff: boolean;
}

export class MarkdownPreviewLineDiffProvider {

	readonly #originalDocument: vscode.TextDocument;
	readonly #modifiedDocument: vscode.TextDocument;

	#cachedOriginalVersion = -1;
	#cachedModifiedVersion = -1;
	#cachedLineChanges: Promise<LineChanges> | undefined;

	public constructor(
		originalDocument: vscode.TextDocument,
		modifiedDocument: vscode.TextDocument,
	) {
		this.#originalDocument = originalDocument;
		this.#modifiedDocument = modifiedDocument;
	}

	public async getOriginalLineChanges(): Promise<MarkdownPreviewLineChanges | undefined> {
		const deleted = (await this.#getLineChanges()).deleted;
		return deleted.length ? { deleted } : undefined;
	}

	public async getModifiedLineChanges(): Promise<MarkdownPreviewLineChanges | undefined> {
		const added = (await this.#getLineChanges()).added;
		return added.length ? { added } : undefined;
	}

	public async translateOriginalLineToModified(line: number): Promise<number> {
		return translateLine(line, (await this.#getLineChanges()).originalToModified, this.#modifiedDocument.lineCount);
	}

	public async translateModifiedLineToOriginal(line: number): Promise<number> {
		return translateLine(line, (await this.#getLineChanges()).modifiedToOriginal, this.#originalDocument.lineCount);
	}

	#getLineChanges(): Promise<LineChanges> {
		if (!this.#cachedLineChanges || this.#cachedOriginalVersion !== this.#originalDocument.version || this.#cachedModifiedVersion !== this.#modifiedDocument.version) {
			this.#cachedOriginalVersion = this.#originalDocument.version;
			this.#cachedModifiedVersion = this.#modifiedDocument.version;
			this.#cachedLineChanges = computeLineChanges(this.#originalDocument, this.#modifiedDocument);
		}

		return this.#cachedLineChanges;
	}
}

async function computeLineChanges(originalDocument: vscode.TextDocument, modifiedDocument: vscode.TextDocument): Promise<LineChanges> {
	return await computeGitLineChanges(originalDocument, modifiedDocument)
		?? computeContentLineChanges(getDocumentLines(originalDocument), getDocumentLines(modifiedDocument));
}

async function computeGitLineChanges(originalDocument: vscode.TextDocument, modifiedDocument: vscode.TextDocument): Promise<LineChanges | undefined> {
	const gitApi = await getGitApi();
	if (!gitApi) {
		return undefined;
	}

	const originalUri = originalDocument.uri;
	const modifiedUri = modifiedDocument.uri;
	const originalGitUri = fromGitUri(originalUri);
	const modifiedGitUri = fromGitUri(modifiedUri);
	const filePath = originalGitUri?.path ?? modifiedGitUri?.path ?? (modifiedUri.scheme === 'file' ? modifiedUri.fsPath : undefined);
	if (!filePath || originalGitUri?.submoduleOf || modifiedGitUri?.submoduleOf) {
		return undefined;
	}

	const repository = gitApi.getRepository(vscode.Uri.file(filePath));
	if (!repository) {
		return undefined;
	}

	const diff = await getGitPatch(repository, filePath, originalUri, originalGitUri, modifiedUri, modifiedGitUri);
	if (!diff) {
		return undefined;
	}

	const relativePath = diff.isFullRepositoryDiff ? getRepositoryRelativePath(repository.rootUri, filePath) : undefined;
	return diff.isFullRepositoryDiff && relativePath === undefined ? undefined : parseGitPatchLineChanges(diff.patch, relativePath, originalDocument.lineCount, modifiedDocument.lineCount);
}

async function getGitApi(): Promise<GitAPI | undefined> {
	const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
	if (!gitExtension) {
		return undefined;
	}

	try {
		return (gitExtension.isActive ? gitExtension.exports : await gitExtension.activate()).getAPI(1);
	} catch {
		return undefined;
	}
}

async function getGitPatch(
	repository: GitRepository,
	filePath: string,
	originalUri: vscode.Uri,
	originalGitUri: GitUriParams | undefined,
	modifiedUri: vscode.Uri,
	modifiedGitUri: GitUriParams | undefined,
): Promise<GitPatch | undefined> {
	try {
		if (originalGitUri && !modifiedGitUri && modifiedUri.scheme === 'file' && samePath(originalGitUri.path, modifiedUri.fsPath)) {
			if (originalGitUri.ref === '~') {
				return { patch: await repository.diff(false), isFullRepositoryDiff: true };
			}
			if (originalGitUri.ref === 'HEAD') {
				return { patch: await repository.diffWithHEAD(filePath), isFullRepositoryDiff: false };
			}
			return { patch: await repository.diffWith(originalGitUri.ref, filePath), isFullRepositoryDiff: false };
		}

		if (originalGitUri && modifiedGitUri && samePath(originalGitUri.path, modifiedGitUri.path)) {
			if (modifiedGitUri.ref === '') {
				return {
					patch: originalGitUri.ref === 'HEAD'
						? await repository.diffIndexWithHEAD(filePath)
						: await repository.diffIndexWith(originalGitUri.ref, filePath),
					isFullRepositoryDiff: false
				};
			}

			return { patch: await repository.diffBetween(originalGitUri.ref, modifiedGitUri.ref, filePath), isFullRepositoryDiff: false };
		}

		if (!originalGitUri && modifiedGitUri && originalUri.scheme === 'file' && samePath(originalUri.fsPath, modifiedGitUri.path)) {
			return {
				patch: modifiedGitUri.ref === 'HEAD'
					? await repository.diffWithHEAD(filePath)
					: await repository.diffWith(modifiedGitUri.ref, filePath),
				isFullRepositoryDiff: false
			};
		}
	} catch {
		return undefined;
	}

	return undefined;
}

function fromGitUri(uri: vscode.Uri): GitUriParams | undefined {
	if (uri.scheme !== 'git') {
		return undefined;
	}

	try {
		const value = JSON.parse(uri.query) as GitUriParams;
		return typeof value.path === 'string' && typeof value.ref === 'string' ? value : undefined;
	} catch {
		return undefined;
	}
}

function getRepositoryRelativePath(rootUri: vscode.Uri, filePath: string): string | undefined {
	const root = normalizePath(rootUri.fsPath).replace(/\/+$/, '');
	const file = normalizePath(filePath);
	if (file === root) {
		return '';
	}

	return file.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? file.slice(root.length + 1) : undefined;
}

function samePath(a: string, b: string): boolean {
	return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

function normalizePath(value: string): string {
	return value.replace(/\\/g, '/');
}

function getDocumentLines(document: vscode.TextDocument): string[] {
	const lines: string[] = [];
	for (let i = 0; i < document.lineCount; ++i) {
		lines.push(document.lineAt(i).text);
	}
	return lines;
}

function computeContentLineChanges(originalLines: readonly string[], modifiedLines: readonly string[]): LineChanges {
	let start = 0;
	while (start < originalLines.length && start < modifiedLines.length && originalLines[start] === modifiedLines[start]) {
		++start;
	}

	let originalEnd = originalLines.length;
	let modifiedEnd = modifiedLines.length;
	while (originalEnd > start && modifiedEnd > start && originalLines[originalEnd - 1] === modifiedLines[modifiedEnd - 1]) {
		--originalEnd;
		--modifiedEnd;
	}

	const originalCount = originalEnd - start;
	const modifiedCount = modifiedEnd - start;
	if (!originalCount && !modifiedCount) {
		return createIdentityLineChanges(originalLines.length, modifiedLines.length);
	}

	if (originalCount * modifiedCount > 500_000) {
		return computeFallbackLineChanges(originalLines, modifiedLines, start, originalEnd, modifiedEnd);
	}

	return computeLcsLineChanges(originalLines, modifiedLines, start, originalEnd, modifiedEnd);
}

function parseGitPatchLineChanges(patch: string, relativePath: string | undefined, originalLineCount: number, modifiedLineCount: number): LineChanges {
	const added: number[] = [];
	const deleted: number[] = [];
	const mappings = createEmptyLineMappings(originalLineCount, modifiedLineCount);
	const lines = patch.split(/\r?\n/);
	let originalLine = 0;
	let modifiedLine = 0;
	let inHunk = false;
	let fileMatches = !relativePath;
	let matchedFile = !relativePath;
	let oldPath: string | undefined;
	let deletedBlockStart: number | undefined;

	const finishFile = () => {
		if (fileMatches && matchedFile) {
			fillUnchangedLineMappings(mappings, originalLine, originalLineCount, modifiedLine, modifiedLineCount);
		}
	};

	for (const line of lines) {
		if (line.startsWith('diff --git ')) {
			finishFile();
			inHunk = false;
			fileMatches = !relativePath;
			matchedFile = !relativePath;
			originalLine = 0;
			modifiedLine = 0;
			oldPath = undefined;
			deletedBlockStart = undefined;
			continue;
		}

		if (!inHunk && line.startsWith('--- ')) {
			oldPath = parseGitDiffPath(line.slice(4));
			continue;
		}

		if (!inHunk && line.startsWith('+++ ')) {
			const newPath = parseGitDiffPath(line.slice(4));
			fileMatches = !relativePath || oldPath === relativePath || newPath === relativePath;
			matchedFile = matchedFile || fileMatches;
			continue;
		}

		const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
		if (hunkMatch) {
			inHunk = true;
			const nextOriginalLine = Math.max(0, Number(hunkMatch[1]) - 1);
			const nextModifiedLine = Math.max(0, Number(hunkMatch[2]) - 1);
			if (fileMatches) {
				fillUnchangedLineMappings(mappings, originalLine, nextOriginalLine, modifiedLine, nextModifiedLine);
			}
			originalLine = nextOriginalLine;
			modifiedLine = nextModifiedLine;
			deletedBlockStart = undefined;
			continue;
		}

		if (!inHunk || !fileMatches || !line) {
			continue;
		}

		switch (line[0]) {
			case ' ':
				deletedBlockStart = undefined;
				mappings.originalToModified[originalLine] = clampLine(modifiedLine, modifiedLineCount);
				mappings.modifiedToOriginal[modifiedLine] = clampLine(originalLine, originalLineCount);
				++originalLine;
				++modifiedLine;
				break;
			case '-':
				deletedBlockStart ??= originalLine;
				mappings.originalToModified[originalLine] = clampLine(modifiedLine, modifiedLineCount);
				deleted.push(originalLine++);
				break;
			case '+':
				mappings.modifiedToOriginal[modifiedLine] = clampLine(deletedBlockStart ?? originalLine, originalLineCount);
				added.push(modifiedLine++);
				break;
			case '\\':
				break;
		}
	}
	finishFile();
	fillMissingLineMappings(mappings);

	return { added, deleted, ...mappings };
}

function parseGitDiffPath(rawPath: string): string | undefined {
	if (rawPath === '/dev/null') {
		return undefined;
	}

	const path = rawPath.startsWith('"') && rawPath.endsWith('"') ? rawPath.slice(1, -1) : rawPath;
	return path.startsWith('a/') || path.startsWith('b/') ? path.slice(2) : path;
}

function computeLcsLineChanges(originalLines: readonly string[], modifiedLines: readonly string[], start: number, originalEnd: number, modifiedEnd: number): LineChanges {
	const originalCount = originalEnd - start;
	const modifiedCount = modifiedEnd - start;
	const mappings = createEmptyLineMappings(originalLines.length, modifiedLines.length);
	fillUnchangedLineMappings(mappings, 0, start, 0, start);
	fillUnchangedLineMappings(mappings, originalEnd, originalLines.length, modifiedEnd, modifiedLines.length);
	const lcsLengths: Uint32Array[] = [];
	for (let i = 0; i <= originalCount; ++i) {
		lcsLengths.push(new Uint32Array(modifiedCount + 1));
	}

	for (let i = originalCount - 1; i >= 0; --i) {
		for (let j = modifiedCount - 1; j >= 0; --j) {
			lcsLengths[i][j] = originalLines[start + i] === modifiedLines[start + j]
				? lcsLengths[i + 1][j + 1] + 1
				: Math.max(lcsLengths[i + 1][j], lcsLengths[i][j + 1]);
		}
	}

	const added: number[] = [];
	const deleted: number[] = [];
	let originalIndex = 0;
	let modifiedIndex = 0;
	let deletedBlockStart: number | undefined;
	let addedBlockStart: number | undefined;
	while (originalIndex < originalCount || modifiedIndex < modifiedCount) {
		if (originalIndex < originalCount && modifiedIndex < modifiedCount && originalLines[start + originalIndex] === modifiedLines[start + modifiedIndex]) {
			deletedBlockStart = undefined;
			addedBlockStart = undefined;
			mappings.originalToModified[start + originalIndex] = clampLine(start + modifiedIndex, modifiedLines.length);
			mappings.modifiedToOriginal[start + modifiedIndex] = clampLine(start + originalIndex, originalLines.length);
			++originalIndex;
			++modifiedIndex;
		} else if (modifiedIndex < modifiedCount && (originalIndex === originalCount || lcsLengths[originalIndex][modifiedIndex + 1] >= lcsLengths[originalIndex + 1][modifiedIndex])) {
			added.push(start + modifiedIndex);
			addedBlockStart ??= start + modifiedIndex;
			mappings.modifiedToOriginal[start + modifiedIndex] = clampLine(deletedBlockStart ?? start + originalIndex, originalLines.length);
			++modifiedIndex;
		} else {
			deleted.push(start + originalIndex);
			deletedBlockStart ??= start + originalIndex;
			mappings.originalToModified[start + originalIndex] = clampLine(addedBlockStart ?? start + modifiedIndex, modifiedLines.length);
			++originalIndex;
		}
	}
	fillMissingLineMappings(mappings);

	return { added, deleted, ...mappings };
}

function computeFallbackLineChanges(originalLines: readonly string[], modifiedLines: readonly string[], start: number, originalEnd: number, modifiedEnd: number): LineChanges {
	const added: number[] = [];
	const deleted: number[] = [];
	const mappings = createEmptyLineMappings(originalLines.length, modifiedLines.length);
	fillUnchangedLineMappings(mappings, 0, start, 0, start);
	fillUnchangedLineMappings(mappings, originalEnd, originalLines.length, modifiedEnd, modifiedLines.length);
	const sharedCount = Math.min(originalEnd - start, modifiedEnd - start);
	for (let i = 0; i < sharedCount; ++i) {
		mappings.originalToModified[start + i] = clampLine(start + i, modifiedLines.length);
		mappings.modifiedToOriginal[start + i] = clampLine(start + i, originalLines.length);
		if (originalLines[start + i] !== modifiedLines[start + i]) {
			deleted.push(start + i);
			added.push(start + i);
		}
	}

	for (let i = start + sharedCount; i < originalEnd; ++i) {
		deleted.push(i);
		mappings.originalToModified[i] = clampLine(modifiedEnd, modifiedLines.length);
	}
	for (let i = start + sharedCount; i < modifiedEnd; ++i) {
		added.push(i);
		mappings.modifiedToOriginal[i] = clampLine(originalEnd, originalLines.length);
	}
	fillMissingLineMappings(mappings);

	return { added, deleted, ...mappings };
}

function createIdentityLineChanges(originalLineCount: number, modifiedLineCount: number): LineChanges {
	const mappings = createEmptyLineMappings(originalLineCount, modifiedLineCount);
	fillUnchangedLineMappings(mappings, 0, originalLineCount, 0, modifiedLineCount);
	fillMissingLineMappings(mappings);
	return { added: [], deleted: [], ...mappings };
}

function createEmptyLineMappings(originalLineCount: number, modifiedLineCount: number): LineMappings {
	return {
		originalToModified: new Array<number>(originalLineCount),
		modifiedToOriginal: new Array<number>(modifiedLineCount),
	};
}

function fillUnchangedLineMappings(mappings: LineMappings, originalStart: number, originalEnd: number, modifiedStart: number, modifiedEnd: number): void {
	const count = Math.min(originalEnd - originalStart, modifiedEnd - modifiedStart);
	for (let i = 0; i < count; ++i) {
		mappings.originalToModified[originalStart + i] = clampLine(modifiedStart + i, mappings.modifiedToOriginal.length);
		mappings.modifiedToOriginal[modifiedStart + i] = clampLine(originalStart + i, mappings.originalToModified.length);
	}
}

function fillMissingLineMappings(mappings: LineMappings): void {
	for (let i = 0; i < mappings.originalToModified.length; ++i) {
		if (typeof mappings.originalToModified[i] !== 'number') {
			mappings.originalToModified[i] = clampLine(i, mappings.modifiedToOriginal.length);
		}
	}
	for (let i = 0; i < mappings.modifiedToOriginal.length; ++i) {
		if (typeof mappings.modifiedToOriginal[i] !== 'number') {
			mappings.modifiedToOriginal[i] = clampLine(i, mappings.originalToModified.length);
		}
	}
}

function translateLine(line: number, mappings: readonly number[], targetLineCount: number): number {
	const sourceLine = Math.floor(line);
	const progress = line - sourceLine;
	const mappedLine = mappings[sourceLine] ?? line;
	if (progress <= 0) {
		return clampLine(mappedLine, targetLineCount);
	}

	const nextMappedLine = mappings[sourceLine + 1];
	if (typeof nextMappedLine !== 'number') {
		return clampLine(mappedLine + progress, targetLineCount);
	}

	return clampLine(mappedLine + ((nextMappedLine - mappedLine) * progress), targetLineCount);
}

function clampLine(line: number, lineCount: number): number {
	return Math.max(0, Math.min(line, lineCount - 1));
}
