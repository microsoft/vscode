/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { LintOptions, LintOptionShowCode, LintOptionWarning } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { IXtabHistoryEntry } from '../../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { TestLanguageDiagnosticsService } from '../../../../platform/languages/common/testLanguageDiagnosticsService';
import { Position } from '../../../../util/vs/editor/common/core/position';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { ensureDependenciesAreSet } from '../../../../util/vs/editor/common/core/text/positionToOffset';
import { DiagnosticSeverity, Range } from '../../../../vscodeTypes';
import { LintErrors } from '../../common/lintErrors';
import { CurrentDocument } from '../../common/xtabCurrentDocument';

describe('LintErrors', () => {
	let diagnosticsService: TestLanguageDiagnosticsService;

	const fileUri = DocumentId.create('file:///test/file.ts').toUri();
	const documentId = DocumentId.create('file:///test/file.ts');

	const defaultLintOptions: LintOptions = {
		tagName: 'linter diagnostics',
		warnings: LintOptionWarning.YES,
		showCode: LintOptionShowCode.NO,
		maxLints: 5,
		maxLineDistance: 10,
		nRecentFiles: 0,
	};

	function createDocument(lines: string[], cursorLine: number, cursorColumn: number): CurrentDocument {
		const content = new StringText(lines.join('\n'));
		return new CurrentDocument(content, new Position(cursorLine, cursorColumn));
	}

	function createLintErrors(document: CurrentDocument): LintErrors {
		return new LintErrors(
			documentId,
			document,
			diagnosticsService
		);
	}

	beforeEach(() => {
		ensureDependenciesAreSet();
		diagnosticsService = new TestLanguageDiagnosticsService();
	});

	describe('getFormattedLintErrors', () => {
		it('should return empty string when no diagnostics', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, []);

			const lintErrors = createLintErrors(document);

			expect(lintErrors.getFormattedLintErrors(defaultLintOptions)).toBe('<|linter diagnostics|>\n\n<|/linter diagnostics|>');
		});

		it('should format single error diagnostic without code context', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Missing semicolon',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Error
				}
			]);

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);
			expect(result).toContain('<|linter diagnostics|>');
			expect(result).toContain('0:0 - error: Missing semicolon');
			expect(result).toContain('<|/linter diagnostics|>');
		});

		it('should format diagnostic with code and source', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Variable is never read',
					range: new Range(0, 6, 0, 7),
					severity: DiagnosticSeverity.Error,
					code: { value: '6133', target: 'file:///test' as unknown as import('vscode').Uri },
					source: 'ts'
				}
			]);

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);
			expect(result).toContain('TS6133');
		});

		it('should format diagnostic with numeric code', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Numeric code error',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Error,
					code: 1234
				}
			]);

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);
			expect(result).toContain('1234');
		});

		it('should format diagnostic with string code', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'String code error',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Error,
					code: 'E001'
				}
			]);

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);
			expect(result).toContain('E001');
		});

		it('should include code line when showCode is YES', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;', 'const z = 3;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Missing semicolon',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithCode: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsWithCode);
			expect(result).toContain('0|const x = 1;');
		});

		it('should include surrounding lines when showCode is YES_WITH_SURROUNDING', () => {
			const document = createDocument(['line1', 'line2', 'line3', 'line4', 'line5'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error on line 3',
					range: new Range(2, 0, 2, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithSurrounding: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES_WITH_SURROUNDING
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsWithSurrounding);
			expect(result).toContain('1|line2'); // line before
			expect(result).toContain('2|line3'); // diagnostic line
			expect(result).toContain('3|line4'); // line after
		});

		it('should handle diagnostic at first line with YES_WITH_SURROUNDING', () => {
			const document = createDocument(['line1', 'line2', 'line3'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error on first line',
					range: new Range(0, 0, 0, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithSurrounding: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES_WITH_SURROUNDING
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsWithSurrounding);
			expect(result).toContain('0|line1');
			expect(result).toContain('1|line2');
		});

		it('should handle diagnostic at last line with YES_WITH_SURROUNDING', () => {
			const document = createDocument(['line1', 'line2', 'line3'], 3, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error on last line',
					range: new Range(2, 0, 2, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithSurrounding: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES_WITH_SURROUNDING
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsWithSurrounding);
			expect(result).toContain('1|line2');
			expect(result).toContain('2|line3');
		});

		it('should filter warnings when warnings option is NO', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'This is an error',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'This is a warning',
					range: new Range(1, 0, 1, 12),
					severity: DiagnosticSeverity.Warning
				}
			]);

			const optionsNoWarnings: LintOptions = {
				...defaultLintOptions,
				warnings: LintOptionWarning.NO
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsNoWarnings);
			expect(result).toContain('This is an error');
			expect(result).not.toContain('This is a warning');
		});

		it('should include warnings when warnings option is YES', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'This is an error',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'This is a warning',
					range: new Range(1, 0, 1, 12),
					severity: DiagnosticSeverity.Warning
				}
			]);

			const optionsWithWarnings: LintOptions = {
				...defaultLintOptions,
				warnings: LintOptionWarning.YES
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsWithWarnings);
			expect(result).toContain('This is an error');
			expect(result).toContain('This is a warning');
		});

		it('should only include errors when warnings option is YES_IF_NO_ERRORS and errors exist', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'This is an error',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'This is a warning',
					range: new Range(1, 0, 1, 12),
					severity: DiagnosticSeverity.Warning
				}
			]);

			const optionsYesIfNoErrors: LintOptions = {
				...defaultLintOptions,
				warnings: LintOptionWarning.YES_IF_NO_ERRORS
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsYesIfNoErrors);
			expect(result).toContain('This is an error');
			expect(result).not.toContain('This is a warning');
		});

		it('should include warnings when warnings option is YES_IF_NO_ERRORS and no errors exist', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'This is a warning',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Warning
				}
			]);

			const optionsYesIfNoErrors: LintOptions = {
				...defaultLintOptions,
				warnings: LintOptionWarning.YES_IF_NO_ERRORS
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsYesIfNoErrors);
			expect(result).toContain('This is a warning');
		});

		it('should filter diagnostics by distance', () => {
			// Cursor at line 1, diagnostic at line 20 (distance 19)
			const lines = Array(25).fill('line');
			const document = createDocument(lines, 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Near error',
					range: new Range(0, 0, 0, 4),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'Far error',
					range: new Range(19, 0, 19, 4),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsSmallDistance: LintOptions = {
				...defaultLintOptions,
				maxLineDistance: 5
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsSmallDistance);
			expect(result).toContain('Near error');
			expect(result).not.toContain('Far error');
		});

		it('should respect maxLints limit', () => {
			const document = createDocument(['line1', 'line2', 'line3', 'line4'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error 1',
					range: new Range(0, 0, 0, 5),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'Error 2',
					range: new Range(1, 0, 1, 5),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'Error 3',
					range: new Range(2, 0, 2, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsMaxLints: LintOptions = {
				...defaultLintOptions,
				maxLints: 2
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsMaxLints);
			// Should include Error 3 (closest to cursor at line 2) and one other
			// but not all three
			const errorCount = (result.match(/Error \d/g) || []).length;
			expect(errorCount).toBe(2);
		});

		it('should sort diagnostics by distance (closest first)', () => {
			const document = createDocument(['line1', 'line2', 'line3', 'line4', 'line5'], 3, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Far error',
					range: new Range(0, 0, 0, 5),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'Close error',
					range: new Range(2, 0, 2, 5),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'Medium error',
					range: new Range(4, 0, 4, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);
			const closeIndex = result.indexOf('Close error');
			const farIndex = result.indexOf('Far error');
			const mediumIndex = result.indexOf('Medium error');

			// Close error should appear before far error
			expect(closeIndex).toBeLessThan(farIndex);
			expect(closeIndex).toBeLessThan(mediumIndex);
		});

		it('should handle multi-line diagnostics', () => {
			const document = createDocument(['line1', 'line2', 'line3', 'line4', 'line5'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Multi-line error',
					range: new Range(1, 0, 3, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithSurrounding: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES_WITH_SURROUNDING
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsWithSurrounding);
			// Should include line before diagnostic start (line1), diagnostic lines (line2-line4), and line after diagnostic end (line5)
			expect(result).toContain('0|line1');
			expect(result).toContain('1|line2');
			expect(result).toContain('4|line5');
		});

		it('should handle multi-line diagnostics with YES_WITH_SURROUNDING', () => {
			const document = createDocument(['function foo() {', 'const x = 1;', 'const y = 2;', 'const z = 3;', '}'], 2, 10);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Multi-line scope error',
					range: new Range(1, 0, 3, 15),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithSurrounding: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES_WITH_SURROUNDING
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsWithSurrounding);
			// Should include line before (0|function foo() {), all diagnostic lines, and line after (4|})
			expect(result).toContain('0|function foo() {');
			expect(result).toContain('1|const x = 1;');
			expect(result).toContain('2|const y = 2;');
			expect(result).toContain('3|const z = 3;');
			expect(result).toContain('4|}');
		});

		it('should handle multi-line diagnostics with YES', () => {
			const document = createDocument(['function foo() {', 'const x = 1;', 'const y = 2;', 'const z = 3;', '}'], 2, 10);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Multi-line scope error',
					range: new Range(1, 0, 3, 15),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithCode: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsWithCode);
			// Should include all diagnostic lines when YES is set
			expect(result).toContain('1|const x = 1;');
			expect(result).toContain('2|const y = 2;');
			expect(result).toContain('3|const z = 3;');
			// Should include the error location and message
			expect(result).toContain('Multi-line scope error');
		});

		it('should use custom tag name', () => {
			const document = createDocument(['const x = 1;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsCustomTag: LintOptions = {
				...defaultLintOptions,
				tagName: 'custom lint tag'
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsCustomTag);
			expect(result).toContain('<|custom lint tag|>');
			expect(result).toContain('<|/custom lint tag|>');
		});

		it('should handle warning severity correctly', () => {
			const document = createDocument(['const x = 1;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Warning message',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Warning
				}
			]);

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);
			expect(result).toContain('warning: Warning message');
		});

		it('should sort by column distance when line distance is equal', () => {
			const document = createDocument(['line with many characters'], 1, 15);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Far column error',
					range: new Range(0, 0, 0, 4),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'Close column error',
					range: new Range(0, 14, 0, 18),
					severity: DiagnosticSeverity.Error
				}
			]);

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);
			const closeIndex = result.indexOf('Close column error');
			const farIndex = result.indexOf('Far column error');

			// Close column error should appear before far column error
			expect(closeIndex).toBeLessThan(farIndex);
		});

		it('should handle diagnostic without source', () => {
			const document = createDocument(['const x = 1;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error without source',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Error,
					code: { value: 'E001', target: 'file:///test' as unknown as import('vscode').Uri }
				}
			]);

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);
			expect(result).toContain('E001');
			expect(result).toContain('Error without source');
		});

		it('should format exact string with code shown NO', () => {
			const document = createDocument([
				'const x = 1;',     // line 0
				'const y = 2;',     // line 1
				'const z = 3;',     // line 2
				'const w = 4;',     // line 3
				'const v = 5;',     // line 4
				'const u = 6;'      // line 5
			], 3, 5);

			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Type mismatch in assignment',
					range: new Range(1, 8, 2, 10),
					severity: DiagnosticSeverity.Error,
					code: { value: '2322', target: 'file:///test' as unknown as import('vscode').Uri },
					source: 'ts'
				},
				{
					message: 'Unused variable',
					range: new Range(3, 6, 4, 10),
					severity: DiagnosticSeverity.Warning,
					code: { value: '6133', target: 'file:///test' as unknown as import('vscode').Uri },
					source: 'ts'
				}
			]);

			const options: LintOptions = {
				tagName: 'linter diagnostics',
				warnings: LintOptionWarning.YES,
				showCode: LintOptionShowCode.NO,
				maxLints: 10,
				maxLineDistance: 20,
				nRecentFiles: 0,
			};

			const lintErrors = createLintErrors(document);
			const result = lintErrors.getFormattedLintErrors(options);

			const expected = `<|linter diagnostics|>
3:6 - warning TS6133: Unused variable
1:8 - error TS2322: Type mismatch in assignment
<|/linter diagnostics|>`;

			expect(result).toBe(expected);
		});

		it('should format exact string with multiple multi-line diagnostics, code, source, and YES_WITH_SURROUNDING', () => {
			const document = createDocument([
				'const x = 1;',     // line 0
				'const y = 2;',     // line 1
				'const z = 3;',     // line 2
				'const w = 4;',     // line 3
				'const v = 5;',     // line 4
				'const u = 6;'      // line 5
			], 3, 5);

			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Type mismatch in assignment',
					range: new Range(1, 8, 2, 10),
					severity: DiagnosticSeverity.Error,
					code: { value: '2322', target: 'file:///test' as unknown as import('vscode').Uri },
					source: 'ts'
				},
				{
					message: 'Unused variable',
					range: new Range(3, 6, 4, 10),
					severity: DiagnosticSeverity.Warning,
					code: { value: '6133', target: 'file:///test' as unknown as import('vscode').Uri },
					source: 'ts'
				}
			]);

			const options: LintOptions = {
				tagName: 'linter diagnostics',
				warnings: LintOptionWarning.YES,
				showCode: LintOptionShowCode.YES_WITH_SURROUNDING,
				maxLints: 10,
				maxLineDistance: 20,
				nRecentFiles: 0,
			};

			const lintErrors = createLintErrors(document);
			const result = lintErrors.getFormattedLintErrors(options);

			const expected = `<|linter diagnostics|>
3:6 - warning TS6133: Unused variable
2|const z = 3;
3|const w = 4;
4|const v = 5;
5|const u = 6;
1:8 - error TS2322: Type mismatch in assignment
0|const x = 1;
1|const y = 2;
2|const z = 3;
3|const w = 4;
<|/linter diagnostics|>`;

			expect(result).toBe(expected);
		});

		it('should handle stale diagnostic referencing lines beyond document length', () => {
			const document = createDocument(['line1', 'line2'], 1, 1);
			// Diagnostic references line 10 which doesn't exist in a 2-line document
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Stale diagnostic',
					range: new Range(10, 0, 10, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithCode: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES
			};

			const lintErrors = createLintErrors(document);

			// Should not throw, should gracefully handle stale diagnostic
			const result = lintErrors.getFormattedLintErrors(optionsWithCode);
			expect(result).toContain('Stale diagnostic');
		});

		it('should handle stale diagnostic with YES_WITH_SURROUNDING beyond document length', () => {
			const document = createDocument(['line1', 'line2'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Stale diagnostic',
					range: new Range(10, 0, 10, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithSurrounding: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES_WITH_SURROUNDING
			};

			const lintErrors = createLintErrors(document);

			const result = lintErrors.getFormattedLintErrors(optionsWithSurrounding);
			expect(result).toContain('Stale diagnostic');
		});
	});

	describe('lineNumberInPreviousFormattedPrompt', () => {
		it('should throw error when called before getFormattedLintErrors', () => {
			const document = createDocument(['const x = 1;'], 1, 1);
			const lintErrors = createLintErrors(document);

			expect(() => lintErrors.lineNumberInPreviousFormattedPrompt(defaultLintOptions, 1)).toThrow('No previous formatted diagnostics available to check line number against.');
		});

		it('should return true for line number at diagnostic start position', () => {
			const document = createDocument(['line1', 'line2', 'line3'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error on line 2',
					range: new Range(1, 0, 1, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const lintErrors = createLintErrors(document);
			lintErrors.getFormattedLintErrors(defaultLintOptions);

			// Diagnostic is on array index 1 (line2)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(defaultLintOptions, 1)).toBe(true);
		});

		it('should return false for line number not in any diagnostic', () => {
			const document = createDocument(['line1', 'line2', 'line3', 'line4'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error on line 2',
					range: new Range(1, 0, 1, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const lintErrors = createLintErrors(document);
			lintErrors.getFormattedLintErrors(defaultLintOptions);

			// Diagnostic is at index 1, so index 3 should not be in any diagnostic
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(defaultLintOptions, 3)).toBe(false);
		});

		it('should return false for code lines when showCode is NO', () => {
			const document = createDocument(['line1', 'line2', 'line3'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error on line 2',
					range: new Range(1, 0, 1, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsNoCode: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.NO
			};

			const lintErrors = createLintErrors(document);
			lintErrors.getFormattedLintErrors(optionsNoCode);

			// Diagnostic is at index 1, but index 0 should not be in range when showCode is NO
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsNoCode, 0)).toBe(false);
		});

		it('should return true for code lines when showCode is YES', () => {
			const document = createDocument(['line1', 'line2', 'line3'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error on line 2',
					range: new Range(1, 0, 1, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithCode: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES
			};

			const lintErrors = createLintErrors(document);
			lintErrors.getFormattedLintErrors(optionsWithCode);

			// Diagnostic at index 1 (line2) should be in the code range
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithCode, 1)).toBe(true);
		});

		it('should return true for surrounding lines when showCode is YES_WITH_SURROUNDING', () => {
			const document = createDocument(['line1', 'line2', 'line3', 'line4'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error on line 2',
					range: new Range(1, 0, 1, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithSurrounding: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES_WITH_SURROUNDING
			};

			const lintErrors = createLintErrors(document);
			lintErrors.getFormattedLintErrors(optionsWithSurrounding);

			// Line before diagnostic (line1 at index 0)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithSurrounding, 0)).toBe(true);
			// Diagnostic line (line2 at index 1)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithSurrounding, 1)).toBe(true);
			// Line after diagnostic (line3 at index 2)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithSurrounding, 2)).toBe(true);
			// Line not in range (line4 at index 3)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithSurrounding, 3)).toBe(false);
		});

		it('should handle multi-line diagnostics with YES', () => {
			const document = createDocument(['line1', 'line2', 'line3', 'line4', 'line5'], 3, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Multi-line error',
					range: new Range(1, 0, 3, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithCode: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES
			};

			const lintErrors = createLintErrors(document);
			lintErrors.getFormattedLintErrors(optionsWithCode);

			// Line before multi-line diagnostic (index 0)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithCode, 0)).toBe(false);
			// Start line of diagnostic (index 1)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithCode, 1)).toBe(true);
			// Middle line of diagnostic (index 2)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithCode, 2)).toBe(true);
			// End line of diagnostic (index 3)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithCode, 3)).toBe(true);
			// Line after multi-line diagnostic (index 4)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithCode, 4)).toBe(false);
		});

		it('should handle multi-line diagnostics with YES_WITH_SURROUNDING', () => {
			const document = createDocument(['line0', 'line1', 'line2', 'line3', 'line4', 'line5'], 3, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Multi-line error',
					range: new Range(1, 0, 3, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithSurrounding: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES_WITH_SURROUNDING
			};

			const lintErrors = createLintErrors(document);
			lintErrors.getFormattedLintErrors(optionsWithSurrounding);

			// Line before multi-line diagnostic (line0 at index 0)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithSurrounding, 0)).toBe(true);
			// Start line of diagnostic (line1 at index 1)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithSurrounding, 1)).toBe(true);
			// Middle line of diagnostic (line2 at index 2)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithSurrounding, 2)).toBe(true);
			// End line of diagnostic (line3 at index 3)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithSurrounding, 3)).toBe(true);
			// Line after multi-line diagnostic (line4 at index 4)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithSurrounding, 4)).toBe(true);
			// Line outside range (line5 at index 5)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithSurrounding, 5)).toBe(false);
		});

		it('should handle multiple diagnostics', () => {
			const document = createDocument(['line1', 'line2', 'line3', 'line4', 'line5'], 3, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error 1',
					range: new Range(0, 0, 0, 5),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'Error 2',
					range: new Range(3, 0, 3, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsWithCode: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES
			};

			const lintErrors = createLintErrors(document);
			lintErrors.getFormattedLintErrors(optionsWithCode);

			// First diagnostic line (index 0)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithCode, 0)).toBe(true);
			// Line between diagnostics (indices 1 and 2)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithCode, 1)).toBe(false);
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithCode, 2)).toBe(false);
			// Second diagnostic line (index 3)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsWithCode, 3)).toBe(true);
		});

		it('should return false when no diagnostics in previous formatted prompt', () => {
			const document = createDocument(['line1', 'line2', 'line3'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, []);

			const lintErrors = createLintErrors(document);
			lintErrors.getFormattedLintErrors(defaultLintOptions);

			expect(lintErrors.lineNumberInPreviousFormattedPrompt(defaultLintOptions, 0)).toBe(false);
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(defaultLintOptions, 1)).toBe(false);
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(defaultLintOptions, 2)).toBe(false);
		});

		it('should handle diagnostics filtered by maxLints', () => {
			const document = createDocument(['line1', 'line2', 'line3', 'line4'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Close error',
					range: new Range(1, 0, 1, 5),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'Far error',
					range: new Range(3, 0, 3, 5),
					severity: DiagnosticSeverity.Error
				}
			]);

			const optionsMaxLints: LintOptions = {
				...defaultLintOptions,
				showCode: LintOptionShowCode.NO,
				maxLints: 1
			};

			const lintErrors = createLintErrors(document);
			lintErrors.getFormattedLintErrors(optionsMaxLints);

			// Only the closest diagnostic should be in the formatted output (index 1)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsMaxLints, 1)).toBe(true);
			// The far error should not be included due to maxLints (index 3)
			expect(lintErrors.lineNumberInPreviousFormattedPrompt(optionsMaxLints, 3)).toBe(false);
		});

		it('should handle diagnostic without any code', () => {
			const document = createDocument(['const x = 1;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Error without code',
					range: new Range(0, 0, 0, 12),
					severity: DiagnosticSeverity.Error
				}
			]);

			const lintErrors = createLintErrors(document);
			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);

			expect(result).toContain('Error without code');
			expect(result).not.toContain('undefined');
		});

		it('should handle non-Error severity levels', () => {
			const document = createDocument(['line1', 'line2'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{
					message: 'Information message',
					range: new Range(0, 0, 0, 5),
					severity: DiagnosticSeverity.Information
				},
				{
					message: 'Hint message',
					range: new Range(1, 0, 1, 5),
					severity: DiagnosticSeverity.Hint
				}
			]);

			const lintErrors = createLintErrors(document);
			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);

			// Non-error severities should be treated as warnings
			expect(result).toContain('warning: Information message');
			expect(result).toContain('warning: Hint message');
		});
	});

	describe('nRecentFiles', () => {
		const otherFileId = DocumentId.create('file:///test/other.ts');
		const otherFileUri = otherFileId.toUri();
		const thirdFileId = DocumentId.create('file:///test/third.ts');
		const thirdFileUri = thirdFileId.toUri();

		function createHistoryEntry(docId: DocumentId): IXtabHistoryEntry {
			return {
				kind: 'visibleRanges',
				docId,
				visibleRanges: [new OffsetRange(0, 100)],
				documentContent: new StringText(''),
			};
		}

		function createLintErrorsWithHistory(document: CurrentDocument, history: readonly IXtabHistoryEntry[]): LintErrors {
			return new LintErrors(
				documentId,
				document,
				diagnosticsService,
				history,
			);
		}

		it('should include diagnostics from recent files when nRecentFiles is set', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{ message: 'Current file error', range: new Range(0, 0, 0, 12), severity: DiagnosticSeverity.Error }
			]);
			diagnosticsService.setDiagnostics(otherFileUri, [
				{ message: 'Other file error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error }
			]);

			const history: IXtabHistoryEntry[] = [createHistoryEntry(otherFileId)];
			const lintErrors = createLintErrorsWithHistory(document, history);

			const result = lintErrors.getFormattedLintErrors({ ...defaultLintOptions, nRecentFiles: 1 });
			expect(result).toContain('Current file error');
			expect(result).toContain('Other file error');
		});

		it('should not include recent file diagnostics when nRecentFiles is undefined', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{ message: 'Current file error', range: new Range(0, 0, 0, 12), severity: DiagnosticSeverity.Error }
			]);
			diagnosticsService.setDiagnostics(otherFileUri, [
				{ message: 'Other file error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error }
			]);

			const history: IXtabHistoryEntry[] = [createHistoryEntry(otherFileId)];
			const lintErrors = createLintErrorsWithHistory(document, history);

			const result = lintErrors.getFormattedLintErrors(defaultLintOptions);
			expect(result).toContain('Current file error');
			expect(result).not.toContain('Other file error');
		});

		it('should not include recent file diagnostics when nRecentFiles is 0', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(otherFileUri, [
				{ message: 'Other file error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error }
			]);

			const history: IXtabHistoryEntry[] = [createHistoryEntry(otherFileId)];
			const lintErrors = createLintErrorsWithHistory(document, history);

			const result = lintErrors.getFormattedLintErrors({ ...defaultLintOptions, nRecentFiles: 0 });
			expect(result).not.toContain('Other file error');
		});

		it('should exclude the current file from recent files', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{ message: 'Current file error', range: new Range(0, 0, 0, 12), severity: DiagnosticSeverity.Error }
			]);

			// History contains the current document itself
			const history: IXtabHistoryEntry[] = [createHistoryEntry(documentId)];
			const lintErrors = createLintErrorsWithHistory(document, history);

			const result = lintErrors.getFormattedLintErrors({ ...defaultLintOptions, nRecentFiles: 1 });
			// Should only contain the error once (from current file processing, not from recent files)
			const errorCount = (result.match(/Current file error/g) || []).length;
			expect(errorCount).toBe(1);
		});

		it('should respect nRecentFiles limit', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(otherFileUri, [
				{ message: 'Other file error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error }
			]);
			diagnosticsService.setDiagnostics(thirdFileUri, [
				{ message: 'Third file error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error }
			]);

			// History: third file most recent, other file least recent
			const history: IXtabHistoryEntry[] = [
				createHistoryEntry(otherFileId),
				createHistoryEntry(thirdFileId),
			];
			const lintErrors = createLintErrorsWithHistory(document, history);

			// Only request 1 recent file - should pick the most recent (third file)
			const result = lintErrors.getFormattedLintErrors({ ...defaultLintOptions, nRecentFiles: 1 });
			expect(result).toContain('Third file error');
			expect(result).not.toContain('Other file error');
		});

		it('should order recent file diagnostics by file recency', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, []);
			diagnosticsService.setDiagnostics(otherFileUri, [
				{ message: 'Other file error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error }
			]);
			diagnosticsService.setDiagnostics(thirdFileUri, [
				{ message: 'Third file error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error }
			]);

			// History: other file first (least recent), third file last (most recent)
			const history: IXtabHistoryEntry[] = [
				createHistoryEntry(otherFileId),
				createHistoryEntry(thirdFileId),
			];
			const lintErrors = createLintErrorsWithHistory(document, history);

			const result = lintErrors.getFormattedLintErrors({ ...defaultLintOptions, nRecentFiles: 2 });
			const thirdIdx = result.indexOf('Third file error');
			const otherIdx = result.indexOf('Other file error');
			// Most recent file (third) should appear before least recent (other)
			expect(thirdIdx).toBeLessThan(otherIdx);
		});

		it('should place current file diagnostics before recent file diagnostics', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{ message: 'Current file error', range: new Range(0, 0, 0, 12), severity: DiagnosticSeverity.Error }
			]);
			diagnosticsService.setDiagnostics(otherFileUri, [
				{ message: 'Other file error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error }
			]);

			const history: IXtabHistoryEntry[] = [createHistoryEntry(otherFileId)];
			const lintErrors = createLintErrorsWithHistory(document, history);

			const result = lintErrors.getFormattedLintErrors({ ...defaultLintOptions, nRecentFiles: 1 });
			const currentIdx = result.indexOf('Current file error');
			const otherIdx = result.indexOf('Other file error');
			expect(currentIdx).toBeLessThan(otherIdx);
		});

		it('should respect maxLints across current and recent files', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;', 'const z = 3;'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{ message: 'Current error 1', range: new Range(0, 0, 0, 12), severity: DiagnosticSeverity.Error },
				{ message: 'Current error 2', range: new Range(1, 0, 1, 12), severity: DiagnosticSeverity.Error },
			]);
			diagnosticsService.setDiagnostics(otherFileUri, [
				{ message: 'Other error 1', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error },
				{ message: 'Other error 2', range: new Range(1, 0, 1, 10), severity: DiagnosticSeverity.Error },
			]);

			const history: IXtabHistoryEntry[] = [createHistoryEntry(otherFileId)];
			const lintErrors = createLintErrorsWithHistory(document, history);

			const result = lintErrors.getFormattedLintErrors({ ...defaultLintOptions, maxLints: 3, nRecentFiles: 1 });
			// Should have 2 current + 1 recent = 3 total (maxLints)
			expect(result).toContain('Current error 1');
			expect(result).toContain('Current error 2');
			expect(result).toContain('Other error 1');
			expect(result).not.toContain('Other error 2');
		});

		it('should apply severity filter to recent file diagnostics', () => {
			const document = createDocument(['const x = 1;'], 1, 1);
			diagnosticsService.setDiagnostics(otherFileUri, [
				{ message: 'Other error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error },
				{ message: 'Other warning', range: new Range(1, 0, 1, 10), severity: DiagnosticSeverity.Warning },
			]);

			const history: IXtabHistoryEntry[] = [createHistoryEntry(otherFileId)];
			const lintErrors = createLintErrorsWithHistory(document, history);

			const result = lintErrors.getFormattedLintErrors({
				...defaultLintOptions,
				warnings: LintOptionWarning.NO,
				nRecentFiles: 1,
			});
			expect(result).toContain('Other error');
			expect(result).not.toContain('Other warning');
		});

		it('should deduplicate documents in history', () => {
			const document = createDocument(['const x = 1;'], 1, 1);
			diagnosticsService.setDiagnostics(otherFileUri, [
				{ message: 'Other error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error },
			]);

			// Same document appears twice in history
			const history: IXtabHistoryEntry[] = [
				createHistoryEntry(otherFileId),
				createHistoryEntry(otherFileId),
			];
			const lintErrors = createLintErrorsWithHistory(document, history);

			const result = lintErrors.getFormattedLintErrors({ ...defaultLintOptions, nRecentFiles: 2 });
			// Should only include the diagnostic once
			const errorCount = (result.match(/Other error/g) || []).length;
			expect(errorCount).toBe(1);
		});

		it('should work when no xtab history is provided', () => {
			const document = createDocument(['const x = 1;'], 1, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{ message: 'Current file error', range: new Range(0, 0, 0, 12), severity: DiagnosticSeverity.Error }
			]);

			// No history passed (backward compat)
			const lintErrors = createLintErrors(document);
			const result = lintErrors.getFormattedLintErrors({ ...defaultLintOptions, nRecentFiles: 5 });
			expect(result).toContain('Current file error');
		});

		it('should not show code context for recent file diagnostics', () => {
			const document = createDocument(['current line 0', 'current line 1', 'current line 2'], 2, 1);
			diagnosticsService.setDiagnostics(fileUri, [
				{ message: 'Current error', range: new Range(0, 0, 0, 14), severity: DiagnosticSeverity.Error }
			]);
			diagnosticsService.setDiagnostics(otherFileUri, [
				{ message: 'Other error', range: new Range(0, 0, 0, 10), severity: DiagnosticSeverity.Error }
			]);

			const history: IXtabHistoryEntry[] = [createHistoryEntry(otherFileId)];
			const lintErrors = createLintErrorsWithHistory(document, history);

			const result = lintErrors.getFormattedLintErrors({
				...defaultLintOptions,
				showCode: LintOptionShowCode.YES_WITH_SURROUNDING,
				nRecentFiles: 1,
			});
			// Current file diagnostic should have code context
			expect(result).toContain('current line 0');
			// Recent file diagnostic should NOT show current file lines as code context
			expect(result).toContain('Other error');
			// Only one occurrence of current file content (from the current file diagnostic, not from recent)
			const currentLineCount = (result.match(/current line 0/g) || []).length;
			expect(currentLineCount).toBe(1);
		});
	});
});
