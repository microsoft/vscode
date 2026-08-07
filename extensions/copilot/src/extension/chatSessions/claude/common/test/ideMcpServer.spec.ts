/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { TestLanguageDiagnosticsService } from '../../../../../platform/languages/common/testLanguageDiagnosticsService';
import { URI } from '../../../../../util/vs/base/common/uri';
import { DiagnosticSeverity, Range } from '../../../../../vscodeTypes';
import { getDiagnosticsHandler } from '../mcpServers/ideMcpServer';

describe('getDiagnosticsHandler', () => {
	let diagnosticsService: TestLanguageDiagnosticsService;

	const fileA = URI.file('/workspace/src/fileA.ts');
	const fileB = URI.file('/workspace/src/fileB.ts');
	const fileC = URI.file('/workspace/src/fileC.ts');

	beforeEach(() => {
		diagnosticsService = new TestLanguageDiagnosticsService();
	});

	it('returns all diagnostics when no uri is provided', () => {
		diagnosticsService.setDiagnostics(fileA, [
			{ message: 'error in A', range: new Range(0, 0, 0, 5), severity: DiagnosticSeverity.Error },
		]);
		diagnosticsService.setDiagnostics(fileB, [
			{ message: 'warning in B', range: new Range(1, 0, 1, 10), severity: DiagnosticSeverity.Warning },
		]);

		const result = getDiagnosticsHandler(diagnosticsService, {});

		expect(result).toHaveLength(2);
		expect(result[0].diagnostics[0].message).toBe('error in A');
		expect(result[1].diagnostics[0].message).toBe('warning in B');
	});

	it('scopes to a single file when uri is provided', () => {
		diagnosticsService.setDiagnostics(fileA, [
			{ message: 'error in A', range: new Range(0, 0, 0, 5), severity: DiagnosticSeverity.Error },
		]);
		diagnosticsService.setDiagnostics(fileB, [
			{ message: 'warning in B', range: new Range(1, 0, 1, 10), severity: DiagnosticSeverity.Warning },
		]);

		const result = getDiagnosticsHandler(diagnosticsService, { uri: fileA.toString() });

		expect(result).toHaveLength(1);
		expect(result[0].uri).toBe(fileA.toString());
		expect(result[0].diagnostics[0].message).toBe('error in A');
	});

	it('returns empty array when no diagnostics exist', () => {
		const result = getDiagnosticsHandler(diagnosticsService, {});
		expect(result).toHaveLength(0);
	});

	it('filters out files with zero diagnostics', () => {
		diagnosticsService.setDiagnostics(fileA, []);
		diagnosticsService.setDiagnostics(fileB, [
			{ message: 'warning', range: new Range(0, 0, 0, 1), severity: DiagnosticSeverity.Warning },
		]);

		const result = getDiagnosticsHandler(diagnosticsService, {});

		expect(result).toHaveLength(1);
		expect(result[0].uri).toBe(fileB.toString());
	});

	it('returns empty array for a file with no diagnostics when scoped by uri', () => {
		diagnosticsService.setDiagnostics(fileC, []);

		const result = getDiagnosticsHandler(diagnosticsService, { uri: fileC.toString() });

		expect(result).toHaveLength(0);
	});

	it('maps all severity levels correctly', () => {
		diagnosticsService.setDiagnostics(fileA, [
			{ message: 'err', range: new Range(0, 0, 0, 1), severity: DiagnosticSeverity.Error },
			{ message: 'warn', range: new Range(1, 0, 1, 1), severity: DiagnosticSeverity.Warning },
			{ message: 'info', range: new Range(2, 0, 2, 1), severity: DiagnosticSeverity.Information },
			{ message: 'hint', range: new Range(3, 0, 3, 1), severity: DiagnosticSeverity.Hint },
		]);

		const result = getDiagnosticsHandler(diagnosticsService, { uri: fileA.toString() });

		expect(result).toHaveLength(1);
		const severities = result[0].diagnostics.map(d => d.severity);
		expect(severities).toEqual(['error', 'warning', 'information', 'hint']);
	});

	it('includes range, source, and code in output', () => {
		diagnosticsService.setDiagnostics(fileA, [
			{
				message: 'unused variable',
				range: new Range(5, 8, 5, 12),
				severity: DiagnosticSeverity.Warning,
				source: 'typescript',
				code: 6133,
			},
		]);

		const result = getDiagnosticsHandler(diagnosticsService, { uri: fileA.toString() });

		const diag = result[0].diagnostics[0];
		expect(diag.range).toEqual({
			start: { line: 5, character: 8 },
			end: { line: 5, character: 12 },
		});
		expect(diag.source).toBe('typescript');
		expect(diag.code).toBe(6133);
	});

	it('extracts code value from object-style codes', () => {
		diagnosticsService.setDiagnostics(fileA, [
			{
				message: 'some lint error',
				range: new Range(0, 0, 0, 1),
				severity: DiagnosticSeverity.Error,
				code: { value: 'no-unused-vars', target: URI.parse('https://eslint.org/rules/no-unused-vars') },
			},
		]);

		const result = getDiagnosticsHandler(diagnosticsService, { uri: fileA.toString() });

		expect(result[0].diagnostics[0].code).toBe('no-unused-vars');
	});

	it('includes filePath in output', () => {
		diagnosticsService.setDiagnostics(fileA, [
			{ message: 'err', range: new Range(0, 0, 0, 1), severity: DiagnosticSeverity.Error },
		]);

		const result = getDiagnosticsHandler(diagnosticsService, { uri: fileA.toString() });

		expect(result[0].filePath).toBe(fileA.fsPath);
	});

	it('handles multiple diagnostics in a single file', () => {
		diagnosticsService.setDiagnostics(fileA, [
			{ message: 'first', range: new Range(0, 0, 0, 1), severity: DiagnosticSeverity.Error },
			{ message: 'second', range: new Range(1, 0, 1, 1), severity: DiagnosticSeverity.Warning },
			{ message: 'third', range: new Range(2, 0, 2, 1), severity: DiagnosticSeverity.Hint },
		]);

		const result = getDiagnosticsHandler(diagnosticsService, { uri: fileA.toString() });

		expect(result).toHaveLength(1);
		expect(result[0].diagnostics).toHaveLength(3);
		expect(result[0].diagnostics.map(d => d.message)).toEqual(['first', 'second', 'third']);
	});

	it('treats empty string uri as no filter', () => {
		diagnosticsService.setDiagnostics(fileA, [
			{ message: 'err', range: new Range(0, 0, 0, 1), severity: DiagnosticSeverity.Error },
		]);

		const result = getDiagnosticsHandler(diagnosticsService, { uri: '' });

		expect(result).toHaveLength(1);
		expect(result[0].diagnostics[0].message).toBe('err');
	});

	it('accepts a non-file scheme URI', () => {
		const result = getDiagnosticsHandler(diagnosticsService, { uri: 'untitled:Untitled-1' });
		expect(result).toHaveLength(0);
	});

	it('accepts an absolute unix path', () => {
		const result = getDiagnosticsHandler(diagnosticsService, { uri: '/workspace/src/fileA.ts' });
		expect(result).toHaveLength(0);
	});

	it('accepts a file:// URI', () => {
		const result = getDiagnosticsHandler(diagnosticsService, { uri: 'file:///workspace/src/fileA.ts' });
		expect(result).toHaveLength(0);
	});
});
