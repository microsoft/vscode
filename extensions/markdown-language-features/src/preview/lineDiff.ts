/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
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
	const diff = vscode.workspace.getTextDiff(originalDocument, modifiedDocument, {
		ignoreTrimWhitespace: false,
		maxComputationTimeMs: 5000,
	});

	const originalLineCount = originalDocument.lineCount;
	const modifiedLineCount = modifiedDocument.lineCount;
	const added: number[] = [];
	const deleted: number[] = [];
	const mappings = createEmptyLineMappings(originalLineCount, modifiedLineCount);

	let lastOriginalEnd = 0;
	let lastModifiedEnd = 0;

	for await (const change of diff.changes) {
		const origStart = change.originalRange.start.line;
		const origEnd = change.originalRange.end.line;
		const modStart = change.modifiedRange.start.line;
		const modEnd = change.modifiedRange.end.line;

		// Map unchanged lines before this change
		fillUnchangedLineMappings(mappings, lastOriginalEnd, origStart, lastModifiedEnd, modStart);

		// Mark deleted and added lines within this change
		for (let i = origStart; i < origEnd; ++i) {
			deleted.push(i);
			mappings.originalToModified[i] = clampLine(modStart, modifiedLineCount);
		}
		for (let i = modStart; i < modEnd; ++i) {
			added.push(i);
			mappings.modifiedToOriginal[i] = clampLine(origStart, originalLineCount);
		}

		lastOriginalEnd = origEnd;
		lastModifiedEnd = modEnd;
	}

	// Map unchanged lines after the last change
	fillUnchangedLineMappings(mappings, lastOriginalEnd, originalLineCount, lastModifiedEnd, modifiedLineCount);
	fillMissingLineMappings(mappings);

	return { added, deleted, ...mappings };
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
