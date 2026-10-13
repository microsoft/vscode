/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Range, TextEdit } from '../../../vscodeTypes';

export type Lines = readonly string[];

export type LineRange = { readonly firstLineIndex: number; readonly endLineIndex: number };

export class LinesEdit {
	constructor(public readonly firstLineIndex: number, readonly endLineIndex: number, public readonly lines: Lines, public readonly prefix = '', public readonly suffix = '\n') {
	}
	toTextEdit(): TextEdit {
		const text = this.lines.length > 0 ? (this.prefix + this.lines.join('\n') + this.suffix) : '';
		return TextEdit.replace(new Range(this.firstLineIndex, 0, this.endLineIndex, 0), text);
	}
	apply(lines: Lines): Lines {
		const before = lines.slice(0, this.firstLineIndex);
		const after = lines.slice(this.endLineIndex);
		return before.concat(this.lines, after);
	}
	static insert(line: number, lines: Lines) {
		return new LinesEdit(line, line, lines);
	}
	static replace(firstLineIndex: number, endLineIndex: number, lines: Lines, isLastLine = false) {
		if (isLastLine) {
			return new LinesEdit(firstLineIndex, endLineIndex, lines, '', '');
		}
		return new LinesEdit(firstLineIndex, endLineIndex, lines);
	}
}

export namespace Lines {
	export function fromString(code: string): Lines {
		if (code.length === 0) {
			return [];
		}
		return code.split(/\r\n|\r|\n/g);
	}
	export function fromDocument(doc: vscode.TextDocument): Lines {
		if (doc.lineCount === 0) {
			return [];
		}
		const result: string[] = [];
		for (let i = 0; i < doc.lineCount; i++) {
			result.push(doc.lineAt(i).text);
		}
		return result;
	}
}

export function isLines(lines: any): lines is Lines {
	return Array.isArray(lines) && typeof lines[0] === 'string';
}

export const enum EditStrategy {
	/**
	 * In case we have no hints (no code markers and no diffing heuristics)
	 * about the edits to generate, we can use a default strategy.
	 */
	FallbackToInsertAboveRange = 1,
	/**
	 * In case we have no hints (no code markers and no diffing heuristics)
	 * about the edits to generate, we can use a default strategy.
	 */
	FallbackToReplaceRange = 2,
	/**
	 * In case we have no hints (no code markers and no diffing heuristics)
	 * about the edits to generate, we can use a default strategy.
	 */
	FallbackToInsertBelowRange = 3,
	/**
	 * Code Generation: always insert at the cursor location.
	 */
	ForceInsertion = 4
}

export function trimLeadingWhitespace(str: string): string {
	return str.replace(/^\s+/g, '');
}

