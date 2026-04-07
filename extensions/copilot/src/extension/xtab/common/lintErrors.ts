/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DiagnosticData } from '../../../platform/inlineEdits/common/dataTypes/diagnosticData';
import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { LintOptions, LintOptionShowCode, LintOptionWarning } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { IXtabHistoryEntry } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { ILanguageDiagnosticsService } from '../../../platform/languages/common/languageDiagnosticsService';
import { BugIndicatingError } from '../../../util/vs/base/common/errors';
import { isEqual } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { Position } from '../../../util/vs/editor/common/core/position';
import { Range } from '../../../util/vs/editor/common/core/range';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { Diagnostic, DiagnosticSeverity } from '../../../vscodeTypes';
import { PromptTags } from './tags';
import { CurrentDocument } from './xtabCurrentDocument';

export interface LintDiagnosticsContext {
	readonly diagnostics: readonly Diagnostic[];
	readonly cursorLineNumber: number;
}

export class LintErrors {

	private _previousFormttedDiagnostics: readonly DiagnosticDataWithDistance[] | undefined;

	constructor(
		private readonly _documentId: DocumentId,
		private readonly _document: CurrentDocument,
		@ILanguageDiagnosticsService private readonly _langDiagService: ILanguageDiagnosticsService,
		private readonly _xtabHistory?: readonly IXtabHistoryEntry[],
	) { }

	private _diagnostics(resource: URI | undefined): readonly DiagnosticDataWithDistance[] {
		const allDiagnostics: [URI, Diagnostic[]][] = resource ? [[resource, this._langDiagService.getDiagnostics(resource)]] : this._langDiagService.getAllDiagnostics();
		const activeDocumentUri = this._documentId.toUri();

		return allDiagnostics.map(fileDiagnostics => {
			const [uri, diagnostics] = fileDiagnostics;
			return diagnostics.map(diagnostic => {
				const range = new Range(diagnostic.range.start.line + 1, diagnostic.range.start.character + 1, diagnostic.range.end.line + 1, diagnostic.range.end.character + 1);
				const distance = isEqual(activeDocumentUri, uri) ? CursorDistance.fromPositions(range.getStartPosition(), this._document.cursorPosition) : undefined;
				return new DiagnosticDataWithDistance(
					uri,
					diagnostic.message,
					diagnostic.severity === DiagnosticSeverity.Error ? 'error' : 'warning',
					distance,
					range,
					this._document.transformer.getOffsetRange(range),
					diagnostic.code && !(typeof diagnostic.code === 'number') && !(typeof diagnostic.code === 'string') ? diagnostic.code.value : diagnostic.code,
					diagnostic.source
				);
			});
		}).flat();
	}

	private _getRelevantDiagnostics(options: LintOptions, resource: URI | undefined): readonly DiagnosticDataWithDistance[] {
		let diagnostics = this._diagnostics(resource);

		diagnostics = filterDiagnosticsByDistance(diagnostics, options.maxLineDistance);
		diagnostics = sortDiagnosticsByDistance(diagnostics);
		diagnostics = filterDiagnosticsBySeverity(diagnostics, options.warnings);

		return diagnostics.slice(0, options.maxLints);
	}

	public getFormattedLintErrors(options: LintOptions): string {
		const currentFileDiagnostics = this._getRelevantDiagnostics(options, this._documentId.toUri());

		let allDiagnostics: readonly DiagnosticDataWithDistance[];

		if (options.nRecentFiles > 0 && this._xtabHistory) {
			const recentFileUris = this._collectRecentFileUris(options.nRecentFiles);
			const recentDiagnostics = this._getRecentFileDiagnostics(recentFileUris, options);
			allDiagnostics = [...currentFileDiagnostics, ...recentDiagnostics].slice(0, options.maxLints);
		} else {
			allDiagnostics = currentFileDiagnostics;
		}

		this._previousFormttedDiagnostics = allDiagnostics;

		const activeDocUri = this._documentId.toUri();
		const formattedDiagnostics = allDiagnostics.map(d => {
			// Only show code context for diagnostics from the current file,
			// since we don't have the document lines for recent files.
			const isCurrentFile = isEqual(d.documentUri, activeDocUri);
			const effectiveOptions = isCurrentFile ? options : { ...options, showCode: LintOptionShowCode.NO };
			return formatSingleDiagnostic(d, this._document.lines, effectiveOptions);
		}).join('\n');

		const lintTag = PromptTags.createLintTag(options.tagName);
		return `${lintTag.start}\n${formattedDiagnostics}\n${lintTag.end}`;
	}

	/**
	 * Collects URIs of the N most recently edited/viewed files from xtab history,
	 * excluding the current document. Files are selected in recency order.
	 */
	private _collectRecentFileUris(nRecentFiles: number): URI[] {
		if (!this._xtabHistory) {
			return [];
		}

		const result: URI[] = [];
		const seenDocuments = new Set<DocumentId>();
		const activeDocId = this._documentId;

		// Iterate from most recent (end) to least recent (start)
		for (let i = this._xtabHistory.length - 1; i >= 0; --i) {
			const entry = this._xtabHistory[i];

			if (entry.docId === activeDocId || seenDocuments.has(entry.docId)) {
				continue;
			}

			result.push(entry.docId.toUri());
			seenDocuments.add(entry.docId);

			if (result.length >= nRecentFiles) {
				break;
			}
		}

		return result;
	}

	/**
	 * Collects diagnostics from recent files, maintaining the file recency order.
	 * Within each file, diagnostics are sorted by line number.
	 */
	private _getRecentFileDiagnostics(recentFileUris: readonly URI[], options: LintOptions): readonly DiagnosticDataWithDistance[] {
		const result: DiagnosticDataWithDistance[] = [];

		for (const uri of recentFileUris) {
			let fileDiags = this._diagnostics(uri);
			fileDiags = filterDiagnosticsBySeverity(fileDiags, options.warnings);
			// Sort by line number within each file
			fileDiags = fileDiags.slice().sort((a, b) => a.documentRange.startLineNumber - b.documentRange.startLineNumber);
			result.push(...fileDiags);
		}

		return result;
	}

	public lineNumberInPreviousFormattedPrompt(options: LintOptions, lineNumber: number): boolean {
		if (!this._previousFormttedDiagnostics) {
			throw new BugIndicatingError('No previous formatted diagnostics available to check line number against.');
		}

		const activeDocUri = this._documentId.toUri();

		for (const diagnostic of this._previousFormttedDiagnostics) {
			// Only consider diagnostics from the current file
			if (!isEqual(diagnostic.documentUri, activeDocUri)) {
				continue;
			}

			// Convert diagnostic position (1-based) to 0-based for comparison with formatted output
			if (diagnostic.documentRange.getStartPosition().lineNumber - 1 === lineNumber) {
				return true;
			}

			if (options.showCode === LintOptionShowCode.NO) {
				continue;
			}

			const lineRange = diagnosticsToCodeLineRange(diagnostic.documentRange, options);
			if (lineRange.contains(lineNumber)) {
				return true;
			}
		}

		return false;
	}

	public getData(): string {
		// Create options with everything enabled for comprehensive telemetry
		const telemetryOptions: LintOptions = {
			tagName: 'telemetry',
			warnings: LintOptionWarning.YES,
			showCode: LintOptionShowCode.NO,
			maxLints: Number.MAX_SAFE_INTEGER,
			maxLineDistance: Number.MAX_SAFE_INTEGER, // Include all diagnostics regardless of distance
			nRecentFiles: 0,
		};

		let diagnostics = this._diagnostics(undefined);
		diagnostics = filterDiagnosticsBySeverity(diagnostics, LintOptionWarning.YES);
		diagnostics = sortDiagnosticsByDistance(diagnostics);
		diagnostics = diagnostics.slice(0, 20);

		const telemetryDiagnostics = diagnostics.map(diagnostic => ({
			uri: diagnostic.documentUri.toString(),
			line: diagnostic.documentRange.startLineNumber,
			column: diagnostic.documentRange.startColumn,
			endLine: diagnostic.documentRange.endLineNumber,
			endColumn: diagnostic.documentRange.endColumn,
			severity: diagnostic.severity,
			message: diagnostic.message,
			code: diagnostic.code,
			source: diagnostic.source,
			lineDistance: diagnostic.distance?.lineDistance,
			formatted: formatSingleDiagnostic(diagnostic, this._document.lines, telemetryOptions),
			formattedCode: formatSingleDiagnostic(diagnostic, this._document.lines, { ...telemetryOptions, showCode: LintOptionShowCode.YES }),
			formattedCodeWithSurrounding: formatSingleDiagnostic(diagnostic, this._document.lines, { ...telemetryOptions, showCode: LintOptionShowCode.YES_WITH_SURROUNDING }),
		}));

		return JSON.stringify(telemetryDiagnostics);
	}
}

/**
 * Formats a single diagnostic with optional code context.
 */
function formatSingleDiagnostic(
	diagnostic: DiagnosticDataWithDistance,
	documentLines: readonly string[],
	lintOptions: LintOptions
): string {
	const headerLine = formatDiagnosticMessage(diagnostic, diagnostic.documentRange);

	if (lintOptions.showCode === LintOptionShowCode.NO) {
		return headerLine;
	}

	const codeLines = formatCodeLines(diagnostic.documentRange, lintOptions, documentLines);
	return headerLine + '\n' + codeLines.join('\n');
}

function formatDiagnosticMessage(diagnostic: DiagnosticDataWithDistance, diagnosticRange: Range): string {
	// Format: "line:column - severity CODE: message"
	let codeStr = '';
	if (diagnostic.code) {
		const source = diagnostic.source ? diagnostic.source.toUpperCase() : '';
		codeStr = ` ${source}${diagnostic.code}`;
	}

	const diagnosticStartPosition = diagnosticRange.getStartPosition();
	const headerLine = `${diagnosticStartPosition.lineNumber - 1}:${diagnosticStartPosition.column - 1} - ${diagnostic.severity}${codeStr}: ${diagnostic.message}`;
	return headerLine;
}

function formatCodeLines(diagnosticRange: Range, lintOptions: LintOptions, documentLines: readonly string[]): string[] {
	const lineRangeToInclude = diagnosticsToCodeLineRange(diagnosticRange, lintOptions);

	const lineRange = lineRangeToInclude.intersect(new OffsetRange(0, documentLines.length));
	if (!lineRange) {
		// Diagnostic refers to lines that no longer exist (stale diagnostic after document edit)
		return [];
	}

	const codeLines: string[] = [];
	for (let i = lineRange.start; i < lineRange.endExclusive; i++) {
		codeLines.push(formatCodeLine(i, documentLines[i] ?? ''));
	}
	return codeLines;
}

function diagnosticsToCodeLineRange(diagnosticRange: Range, lintOptions: LintOptions): OffsetRange {
	const diagnosticStartLine = diagnosticRange.getStartPosition().lineNumber - 1; // 0-based for rendering and array access
	const diagnosticEndLine = diagnosticRange.getEndPosition().lineNumber - 1; // 0-based for rendering and array access

	let lineRangeToInclude = new OffsetRange(diagnosticStartLine, diagnosticEndLine + 1);
	if (lintOptions.showCode === LintOptionShowCode.YES_WITH_SURROUNDING) {
		lineRangeToInclude = lineRangeToInclude.deltaStart(-1).deltaEnd(1);
	}

	return lineRangeToInclude;
}

function formatCodeLine(lineNumber: number, lineContent: string): string {
	return `${lineNumber}|${lineContent}`;
}

function filterDiagnosticsByDistance(diagnostics: readonly DiagnosticDataWithDistance[], distance: number): readonly DiagnosticDataWithDistance[] {
	return diagnostics.filter(d => d.distance?.lineDistance !== undefined && d.distance.lineDistance <= distance);
}

function sortDiagnosticsByDistance(diagnostics: readonly DiagnosticDataWithDistance[]): readonly DiagnosticDataWithDistance[] {
	return diagnostics.slice().sort((a, b) => {
		if (a.distance === undefined && b.distance === undefined) {
			return 0;
		}
		if (a.distance === undefined) {
			return 1;
		}
		if (b.distance === undefined) {
			return -1;
		}
		return CursorDistance.compareFn(a.distance, b.distance);
	});
}

function filterDiagnosticsBySeverity(diagnostics: readonly DiagnosticDataWithDistance[], warnings: LintOptionWarning): readonly DiagnosticDataWithDistance[] {
	switch (warnings) {
		case LintOptionWarning.NO:
			return diagnostics.filter(d => d.severity === 'error');
		case LintOptionWarning.YES: {
			return diagnostics.filter(d => d.severity === 'error' || d.severity === 'warning');
		}
		case LintOptionWarning.YES_IF_NO_ERRORS: {
			const errorDiagnostics = diagnostics.filter(d => d.severity === 'error');
			return errorDiagnostics.length > 0
				? errorDiagnostics
				: diagnostics.filter(d => d.severity === 'error' || d.severity === 'warning');
		}
	}
}

class CursorDistance {

	static compareFn(a: CursorDistance, b: CursorDistance): number {
		if (a.lineDistance !== b.lineDistance) {
			return a.lineDistance - b.lineDistance;
		}
		return a.columnDistance - b.columnDistance;
	}

	static fromPositions(pos1: Position, pos2: Position): CursorDistance {
		return new CursorDistance(
			Math.abs(pos1.lineNumber - pos2.lineNumber),
			Math.abs(pos1.column - pos2.column)
		);
	}

	constructor(
		public lineDistance: number,
		public columnDistance: number
	) { }
}

class DiagnosticDataWithDistance extends DiagnosticData {

	constructor(
		documentUri: URI,
		message: string,
		severity: 'error' | 'warning',
		public distance: CursorDistance | undefined,
		public documentRange: Range,
		range: OffsetRange,
		code: string | number | undefined,
		source: string | undefined,
	) {
		super(documentUri, message, severity, range, code, source);
	}

}
