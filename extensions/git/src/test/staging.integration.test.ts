/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Range, EndOfLine, Position, TextDocument, Uri } from 'vscode';
import { applyLineChanges, LineChange } from '../staging';

function mockDocument(contents: string, eol: EndOfLine): TextDocument {
	const eolStr = eol === EndOfLine.CRLF ? '\r\n' : '\n';
	const lines = contents.split(/\r\n|\n/);

	return {
		uri: Uri.file('/mock'),
		fileName: '/mock',
		isUntitled: false,
		languageId: 'plaintext',
		version: 1,
		isDirty: false,
		isClosed: false,
		encoding: 'utf8',
		eol,
		lineCount: lines.length,
		save: () => Promise.resolve(true),
		lineAt(lineOrPosition: number | Position) {
			const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
			const text = lines[line] ?? '';
			return {
				lineNumber: line,
				text,
				range: new Range(line, 0, line, text.length),
				rangeIncludingLineBreak: new Range(line, 0, line + 1, 0),
				firstNonWhitespaceCharacterIndex: text.search(/\S/) === -1 ? text.length : text.search(/\S/),
				isEmptyOrWhitespace: text.trim().length === 0,
			};
		},
		offsetAt(_position: Position) { return 0; },
		positionAt(_offset: number) { return new Position(0, 0); },
		getText(range?: Range): string {
			if (!range) {
				return lines.join(eolStr);
			}
			if (range.isEmpty) {
				return '';
			}
			const startText = lines[range.start.line]?.substring(range.start.character) ?? '';
			if (range.isSingleLine) {
				return startText.substring(0, range.end.character - range.start.character);
			}
			const result: string[] = [startText];
			for (let i = range.start.line + 1; i < range.end.line; i++) {
				result.push(lines[i]);
			}
			// range.end.line may equal lines.length (EOF), in which case there is no partial line to append
			if (range.end.line < lines.length) {
				result.push(lines[range.end.line].substring(0, range.end.character));
			}
			return result.join(eolStr);
		},
		getWordRangeAtPosition() { return undefined; },
		validateRange(range: Range) { return range; },
		validatePosition(position: Position) { return position; },
	} as unknown as TextDocument;
}

suite('applyLineChanges', () => {

	test('LF original + LF modified: no EOL change', () => {
		const original = mockDocument('a\nb\nc\nd\n', EndOfLine.LF);
		const modified = mockDocument('a\nB\nc\nd\n', EndOfLine.LF);
		const changes: LineChange[] = [
			{ originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 }
		];
		const result = applyLineChanges(original, modified, changes);
		assert.strictEqual(result, 'a\nB\nc\nd\n');
	});

	test('CRLF original + CRLF modified: preserves CRLF', () => {
		const original = mockDocument('a\r\nb\r\nc\r\nd\r\n', EndOfLine.CRLF);
		const modified = mockDocument('a\r\nB\r\nc\r\nd\r\n', EndOfLine.CRLF);
		const changes: LineChange[] = [
			{ originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 }
		];
		const result = applyLineChanges(original, modified, changes);
		assert.strictEqual(result, 'a\r\nB\r\nc\r\nd\r\n');
	});

	test('CRLF original + LF modified: normalizes modified to CRLF', () => {
		const original = mockDocument('a\r\nb\r\nc\r\nd\r\n', EndOfLine.CRLF);
		const modified = mockDocument('a\nMOD\nc\nd\n', EndOfLine.LF);
		const changes: LineChange[] = [
			{ originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 }
		];
		const result = applyLineChanges(original, modified, changes);
		assert.strictEqual(result, 'a\r\nMOD\r\nc\r\nd\r\n');
		const bareLf = (result.replace(/\r\n/g, '').match(/\n/g) || []).length;
		assert.strictEqual(bareLf, 0, 'No bare LF');
	});

	test('LF original + CRLF modified: normalizes modified to LF', () => {
		const original = mockDocument('a\nb\nc\nd\n', EndOfLine.LF);
		const modified = mockDocument('a\r\nMOD\r\nc\r\nd\r\n', EndOfLine.CRLF);
		const changes: LineChange[] = [
			{ originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 }
		];
		const result = applyLineChanges(original, modified, changes);
		assert.strictEqual(result, 'a\nMOD\nc\nd\n');
		assert.ok(!result.includes('\r'), 'No CR');
	});

	test('multiple changes with EOL mismatch', () => {
		const original = mockDocument('a\r\nb\r\nc\r\nd\r\ne\r\n', EndOfLine.CRLF);
		const modified = mockDocument('a\nB\nc\nD\ne\n', EndOfLine.LF);
		const changes: LineChange[] = [
			{ originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 },
			{ originalStartLineNumber: 4, originalEndLineNumber: 4, modifiedStartLineNumber: 4, modifiedEndLineNumber: 4 },
		];
		const result = applyLineChanges(original, modified, changes);
		assert.strictEqual(result, 'a\r\nB\r\nc\r\nD\r\ne\r\n');
	});

	test('deletion-only diff: no normalization needed', () => {
		const original = mockDocument('a\r\nb\r\nc\r\nd\r\n', EndOfLine.CRLF);
		const modified = mockDocument('a\r\nc\r\nd\r\n', EndOfLine.LF);
		const changes: LineChange[] = [
			{ originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 1, modifiedEndLineNumber: 0 }
		];
		const result = applyLineChanges(original, modified, changes);
		assert.strictEqual(result, 'a\r\nc\r\nd\r\n');
	});

	test('insertion with EOL mismatch', () => {
		const original = mockDocument('a\r\nc\r\n', EndOfLine.CRLF);
		const modified = mockDocument('a\nNEW\nc\n', EndOfLine.LF);
		const changes: LineChange[] = [
			{ originalStartLineNumber: 1, originalEndLineNumber: 0, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 }
		];
		const result = applyLineChanges(original, modified, changes);
		const bareLf = (result.replace(/\r\n/g, '').match(/\n/g) || []).length;
		assert.strictEqual(bareLf, 0, 'No bare LF after insertion');
		assert.ok(result.includes('NEW\r\n'), 'Inserted line has CRLF');
	});

	test('no trailing newline: CRLF preserved', () => {
		const original = mockDocument('a\r\nb\r\nc', EndOfLine.CRLF);
		const modified = mockDocument('a\nMOD\nc', EndOfLine.LF);
		const changes: LineChange[] = [
			{ originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 }
		];
		const result = applyLineChanges(original, modified, changes);
		assert.strictEqual(result, 'a\r\nMOD\r\nc');
	});

	test('unstaged lines are byte-identical to original', () => {
		const original = mockDocument('first\r\nsecond\r\nthird\r\nfourth\r\n', EndOfLine.CRLF);
		const modified = mockDocument('first\nCHANGED\nALSO\nfourth\n', EndOfLine.LF);
		const changes: LineChange[] = [
			{ originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 }
		];
		const result = applyLineChanges(original, modified, changes);
		assert.ok(result.startsWith('first\r\n'), 'Unstaged line 1 preserved');
		assert.ok(result.includes('CHANGED\r\n'), 'Staged line normalized');
		assert.ok(result.includes('\r\nthird\r\n'), 'Unstaged line 3 preserved');
		assert.ok(result.endsWith('fourth\r\n'), 'Unstaged line 4 preserved');
	});
});
