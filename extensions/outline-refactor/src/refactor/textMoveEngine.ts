/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MoveSymbolRequest, MoveValidationResult, SymbolMoveEngine } from './types';

export class TextMoveEngine implements SymbolMoveEngine {
	public canMove(request: MoveSymbolRequest): MoveValidationResult {
		const sourceRange = this.expandToWholeLines(
			request.document,
			request.source.range
		);

		const targetRange = this.expandToWholeLines(
			request.document,
			request.target.range
		);

		if (sourceRange.contains(targetRange.start) || sourceRange.contains(targetRange.end)) {
			return {
				allowed: false,
				reason: 'Cannot move a symbol into itself.'
			};
		}

		return { allowed: true };
	}

	public buildEdit(request: MoveSymbolRequest): vscode.WorkspaceEdit | undefined {
		const { document, source, target, dropPosition } = request;

		const sourceRange = this.expandToWholeLines(document, source.range);
		const targetRange = this.expandToWholeLines(document, target.range);

		const originalText = document.getText();

		const sourceStart = document.offsetAt(sourceRange.start);
		const sourceEnd = document.offsetAt(sourceRange.end);

		const targetStart = document.offsetAt(targetRange.start);
		const targetEnd = document.offsetAt(targetRange.end);

		const movedText = this.outdentMovedText(originalText.slice(sourceStart, sourceEnd));

		const textWithoutSource =
			originalText.slice(0, sourceStart) +
			originalText.slice(sourceEnd);

		const removedLength = sourceEnd - sourceStart;

		let insertionOffset: number;

		if (dropPosition === 'before') {
			insertionOffset =
				targetStart > sourceStart
					? targetStart - removedLength
					: targetStart;
		} else {
			insertionOffset =
				targetEnd > sourceStart
					? targetEnd - removedLength
					: targetEnd;
		}

		const newText = this.insertWithBlankLines(
			textWithoutSource,
			insertionOffset,
			movedText,
			this.getEOL(document)
		);

		const edit = new vscode.WorkspaceEdit();

		const fullDocumentRange = new vscode.Range(
			document.positionAt(0),
			document.positionAt(originalText.length)
		);

		edit.replace(document.uri, fullDocumentRange, newText);

		return edit;
	}

	private getEOL(document: vscode.TextDocument): string {
		return document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
	}

	private insertWithBlankLines(
		text: string,
		offset: number,
		insertedText: string,
		eol: string
	): string {
		const before = text
			.slice(0, offset)
			.replace(/[ \t]*(\r\n|\r|\n)+[ \t]*$/g, '');

		const after = text
			.slice(offset)
			.replace(/^[ \t]*(\r\n|\r|\n)+[ \t]*/g, '');

		const normalizedInsertedText = insertedText
			.replace(/^[ \t]*(\r\n|\r|\n)+/g, '')
			.replace(/(\r\n|\r|\n)+[ \t]*$/g, '');

		const prefix = before.length > 0 ? eol + eol : '';
		const suffix = after.length > 0 ? eol + eol : eol;

		return before + prefix + normalizedInsertedText + suffix + after;
	}

	protected expandToWholeLines(
		document: vscode.TextDocument,
		range: vscode.Range
	): vscode.Range {
		const start = new vscode.Position(range.start.line, 0);

		const endLine =
			range.end.character === 0
				? range.end.line
				: range.end.line + 1;

		if (endLine < document.lineCount) {
			return new vscode.Range(
				start,
				new vscode.Position(endLine, 0)
			);
		}

		return new vscode.Range(
			start,
			document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end
		);
	}

	private outdentMovedText(text: string): string {
		const eol = text.includes('\r\n') ? '\r\n' : '\n';
		const hasFinalEol = text.endsWith('\n');
		const lines = text.split(/\r\n|\r|\n/);

		if (hasFinalEol) {
			lines.pop();
		}

		const firstCodeLine = lines.find(line => line.trim().length > 0);
		const indent = firstCodeLine?.match(/^\s*/)?.[0] ?? '';

		if (!indent) {
			return text;
		}

		const outdented = lines.map(line =>
			line.startsWith(indent) ? line.slice(indent.length) : line
		);

		return outdented.join(eol) + (hasFinalEol ? eol : '');
	}
}
