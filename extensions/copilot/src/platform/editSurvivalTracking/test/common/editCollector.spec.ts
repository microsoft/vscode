/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { Position, Range, TextEdit } from '../../../../vscodeTypes';
import { OffsetBasedTextDocument } from '../../common/editCollector';

suite('OffsetBasedTextDocument', function () {
	test('document with \\n', async () => {
		const content = [
			'line0\n',
			'line1\n',
			'line2\n',
			'line3\n',
		];
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 0), '|')]);
			expect(document.getValue()).toBe('|line0\nline1\nline2\nline3\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 1), '|')]);
			expect(document.getValue()).toBe('l|ine0\nline1\nline2\nline3\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 2), '|')]);
			expect(document.getValue()).toBe('li|ne0\nline1\nline2\nline3\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 5), '|')]);
			expect(document.getValue()).toBe('line0|\nline1\nline2\nline3\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 6), '|')]);
			expect(document.getValue()).toBe('line0|\nline1\nline2\nline3\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 7), '|')]);
			expect(document.getValue()).toBe('line0|\nline1\nline2\nline3\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 0), '|')]);
			expect(document.getValue()).toBe('line0\nline1\nline2\n|line3\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 5), '|')]);
			expect(document.getValue()).toBe('line0\nline1\nline2\nline3|\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 6), '|')]);
			expect(document.getValue()).toBe('line0\nline1\nline2\nline3|\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(4, 0), '|')]);
			expect(document.getValue()).toBe('line0\nline1\nline2\nline3\n|');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(4, 4), '|')]);
			expect(document.getValue()).toBe('line0\nline1\nline2\nline3\n|');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(5, 4), '|')]);
			expect(document.getValue()).toBe('line0\nline1\nline2\nline3\n|');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.delete(new Range(1, 0, 2, 0))]);
			expect(document.getValue()).toBe('line0\nline2\nline3\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.replace(new Range(3, 0, 3, 5), 'lineX\n')]);
			expect(document.getValue()).toBe('line0\nline1\nline2\nlineX\n\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.replace(new Range(3, 0, 4, 0), 'lineX\n')]);
			expect(document.getValue()).toBe('line0\nline1\nline2\nlineX\n');
		}
	});

	test('document with \\r\\n', async () => {
		const content = [
			'line0\r\n',
			'line1\r\n',
			'line2\r\n',
			'line3\r\n',
		];
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 0), '|')]);
			expect(document.getValue()).toBe('|line0\r\nline1\r\nline2\r\nline3\r\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 1), '|')]);
			expect(document.getValue()).toBe('l|ine0\r\nline1\r\nline2\r\nline3\r\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 2), '|')]);
			expect(document.getValue()).toBe('li|ne0\r\nline1\r\nline2\r\nline3\r\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 5), '|')]);
			expect(document.getValue()).toBe('line0|\r\nline1\r\nline2\r\nline3\r\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 6), '|')]);
			expect(document.getValue()).toBe('line0|\r\nline1\r\nline2\r\nline3\r\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 7), '|')]);
			expect(document.getValue()).toBe('line0|\r\nline1\r\nline2\r\nline3\r\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 0), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\n|line3\r\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 5), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3|\r\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 6), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3|\r\n');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(4, 0), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3\r\n|');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(4, 4), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3\r\n|');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(5, 4), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3\r\n|');
		}
	});

	test('document with \\r\\n, last line no line delimiter', async () => {
		const content = [
			'line0\r\n',
			'line1\r\n',
			'line2\r\n',
			'line3\r\n',
			'line4'
		];
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 0), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\n|line3\r\nline4');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 5), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3|\r\nline4');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 6), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3|\r\nline4');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(4, 0), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3\r\n|line4');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(4, 4), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3\r\nline|4');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(4, 5), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3\r\nline4|');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(4, 6), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3\r\nline4|');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(5, 4), '|')]);
			expect(document.getValue()).toBe('line0\r\nline1\r\nline2\r\nline3\r\nline4|');
		}
	});

	test('document with \\r', async () => {
		const content = [
			'line0\r',
			'line1\r',
			'line2\r',
			'line3\r',
		];
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 0), '|')]);
			expect(document.getValue()).toBe('|line0\rline1\rline2\rline3\r');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 1), '|')]);
			expect(document.getValue()).toBe('l|ine0\rline1\rline2\rline3\r');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 2), '|')]);
			expect(document.getValue()).toBe('li|ne0\rline1\rline2\rline3\r');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 5), '|')]);
			expect(document.getValue()).toBe('line0|\rline1\rline2\rline3\r');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 6), '|')]);
			expect(document.getValue()).toBe('line0|\rline1\rline2\rline3\r');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(0, 7), '|')]);
			expect(document.getValue()).toBe('line0|\rline1\rline2\rline3\r');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 0), '|')]);
			expect(document.getValue()).toBe('line0\rline1\rline2\r|line3\r');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 5), '|')]);
			expect(document.getValue()).toBe('line0\rline1\rline2\rline3|\r');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(3, 6), '|')]);
			expect(document.getValue()).toBe('line0\rline1\rline2\rline3|\r');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(4, 0), '|')]);
			expect(document.getValue()).toBe('line0\rline1\rline2\rline3\r|');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(4, 4), '|')]);
			expect(document.getValue()).toBe('line0\rline1\rline2\rline3\r|');
		}
		{
			const document = new OffsetBasedTextDocument(content.join(''));
			document.applyTextEdits([TextEdit.insert(new Position(5, 4), '|')]);
			expect(document.getValue()).toBe('line0\rline1\rline2\rline3\r|');
		}
	});
});
