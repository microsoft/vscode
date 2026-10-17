/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type ts from 'typescript/lib/tsserverlibrary';
import { describe, test } from 'vitest';
import { getDiagnosticLocation, getDiagnosticMessage } from './tscDiagnostics';

describe('tscDiagnostics', () => {
	test('converts regular diagnostics from one-based line offsets', () => {
		const diagnostic: ts.server.protocol.Diagnostic = {
			start: { line: 2, offset: 3 },
			end: { line: 4, offset: 5 },
			text: 'regular\r\nmessage',
			code: 2322,
			category: 'error',
		};

		assert.deepStrictEqual({
			location: getDiagnosticLocation(diagnostic, 'src/main.ts'),
			message: getDiagnosticMessage(diagnostic),
		}, {
			location: {
				file: 'src/main.ts',
				startLine: 1,
				startCharacter: 2,
				endLine: 3,
				endCharacter: 4,
			},
			message: 'regular\r\nmessage',
		});
	});

	test('converts line-position diagnostics from protocol line metadata', () => {
		const diagnostic: ts.server.protocol.DiagnosticWithLinePosition = {
			start: 14,
			length: 7,
			startLocation: { line: 3, offset: 8 },
			endLocation: { line: 5, offset: 2 },
			message: 'numeric\r\nmessage\rline',
			code: 2345,
			category: 'error',
		};

		assert.deepStrictEqual({
			location: getDiagnosticLocation(diagnostic, 'src/main.ts'),
			message: getDiagnosticMessage(diagnostic),
		}, {
			location: {
				file: 'src/main.ts',
				startLine: 2,
				startCharacter: 7,
				endLine: 4,
				endCharacter: 1,
			},
			message: 'numeric\nmessage\nline',
		});
	});

	test('converts zero-length line-position diagnostics at the first character', () => {
		const diagnostic: ts.server.protocol.DiagnosticWithLinePosition = {
			start: 0,
			length: 0,
			startLocation: { line: 1, offset: 1 },
			endLocation: { line: 1, offset: 1 },
			message: 'expected token',
			code: 1005,
			category: 'error',
		};

		assert.deepStrictEqual(getDiagnosticLocation(diagnostic, 'src/empty.ts'), {
			file: 'src/empty.ts',
			startLine: 0,
			startCharacter: 0,
			endLine: 0,
			endCharacter: 0,
		});
	});

	test('normalizes line-position diagnostic messages to match regular LF messages', () => {
		const regularDiagnostic: ts.server.protocol.Diagnostic = {
			start: { line: 1, offset: 1 },
			end: { line: 1, offset: 2 },
			text: 'same\nmessage',
			code: 2322,
			category: 'error',
		};
		const linePositionDiagnostic: ts.server.protocol.DiagnosticWithLinePosition = {
			start: 0,
			length: 1,
			startLocation: { line: 1, offset: 1 },
			endLocation: { line: 1, offset: 2 },
			message: 'same\r\nmessage',
			code: 2322,
			category: 'error',
		};

		assert.deepStrictEqual(getDiagnosticMessage(linePositionDiagnostic), getDiagnosticMessage(regularDiagnostic));
	});

	test('uses line-position metadata even when numeric offsets would resolve elsewhere', () => {
		const diagnostic: ts.server.protocol.DiagnosticWithLinePosition = {
			start: 0,
			length: 1,
			startLocation: { line: 2, offset: 4 },
			endLocation: { line: 2, offset: 5 },
			message: 'unicode line separator',
			code: 1005,
			category: 'error',
		};

		assert.deepStrictEqual(getDiagnosticLocation(diagnostic, 'src/unicode.ts'), {
			file: 'src/unicode.ts',
			startLine: 1,
			startCharacter: 3,
			endLine: 1,
			endCharacter: 4,
		});
	});

	test('fails line-position diagnostics without line metadata', () => {
		const diagnostic = {
			start: 0,
			length: 1,
			message: 'missing metadata',
			code: 1005,
			category: 'error',
		} as ts.server.protocol.DiagnosticWithLinePosition;

		assert.throws(
			() => getDiagnosticLocation(diagnostic, 'src/main.ts'),
			/TS Server diagnostic for src\/main\.ts is missing line position metadata/
		);
	});
});
