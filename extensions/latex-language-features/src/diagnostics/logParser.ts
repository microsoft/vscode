/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LaTeX log parser adapted from latex-workshop extension
 * Reuses the parsing logic from latex-workshop/extension/out/src/parse/parser/latexlog.js
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface LaTeXLogItem {
	type: 'error' | 'warning' | 'typesetting' | '';
	file: string;
	line: number;
	text: string;
	errorPosText?: string;
}

export interface LaTeXDiagnostic {
	severity: vscode.DiagnosticSeverity;
	message: string;
	line: number; // 0-based line number
	column?: number; // 0-based column number
	range?: vscode.Range;
	source?: string;
	code?: string | number;
}

/**
 * Parses LaTeX compilation log files to extract errors and warnings
 * Adapted from latex-workshop extension's latexlog.js parser
 */
export class LaTeXLogParser {
	private buildLog: LaTeXLogItem[] = [];

	// Regex patterns from latex-workshop
	// Pattern matches: "! LaTeX Error: message" or "file:line: Error: message" or "! message"
	private readonly latexError = /^(?:(.*):(\d+):|!)(?:\s+(.+?)\s+Error:)?\s*(.+)$/;
	private readonly latexOverfullBox = /^(Overfull \\[vh]box \([^)]*\)) in paragraph at lines (\d+)--(\d+)$/;
	private readonly latexOverfullBoxAlt = /^(Overfull \\[vh]box \([^)]*\)) detected at line (\d+)$/;
	private readonly latexOverfullBoxOutput = /^(Overfull \\[vh]box \([^)]*\)) has occurred while \\output is active(?: \[(\d+)\])?/;
	private readonly latexUnderfullBox = /^(Underfull \\[vh]box \([^)]*\)) in paragraph at lines (\d+)--(\d+)$/;
	private readonly latexUnderfullBoxAlt = /^(Underfull \\[vh]box \([^)]*\)) detected at line (\d+)$/;
	private readonly latexUnderfullBoxOutput = /^(Underfull \\[vh]box \([^)]*\)) has occurred while \\output is active(?: \[(\d+)\])?/;
	private readonly latexWarn = /^((?:(?:Class|Package|Module) \S*)|LaTeX(?: \S*)?|LaTeX3) (Warning|Info):\s+(.*?)(?: on(?: input)? line (\d+))?(\.|\?|)$/;
	private readonly latexPackageWarningExtraLines = /^\((.*)\)\s+(.*?)(?: +on input line (\d+))?(\.)?$/;
	private readonly latexMissChar = /^\s*(Missing character:.*?!)/;
	private readonly bibEmpty = /^Empty `thebibliography' environment/;
	private readonly biberWarn = /^Biber warning:.*WARN - I didn't find a database entry for '([^']+)'/;
	private readonly UNDEFINED_REFERENCE = /^LaTeX Warning: (Reference|Citation) `(.*?)' on page (?:\d+) undefined on input line (\d+).$/;
	private readonly messageLine = /^l\.\d+\s(\.\.\.)?(.*)$/;

	/**
	 * Parse a LaTeX log file and extract diagnostics
	 * @param logContent The content of the .log file
	 * @param document The LaTeX document to map errors to
	 * @returns Array of diagnostics
	 */
	parseLog(logContent: string, document: vscode.TextDocument): LaTeXDiagnostic[] {
		this.buildLog = [];
		const rootFile = document.uri.fsPath || document.fileName;

		if (!rootFile) {
			return [];
		}

		const lines = logContent.split('\n');
		const state = this.initParserState(rootFile);

		for (const line of lines) {
			this.parseLine(line, state, document);
		}

		// Push the final result
		if (state.currentResult.type !== '' && !state.currentResult.text.match(this.bibEmpty)) {
			this.buildLog.push(state.currentResult);
		}

		// Convert to VS Code diagnostics
		return this.convertToDiagnostics(this.buildLog, document);
	}

	private initParserState(rootFile: string) {
		return {
			searchEmptyLine: false,
			insideBoxWarn: false,
			insideError: false,
			currentResult: { type: '' as '', file: '', text: '', line: 1 },
			nested: 0,
			rootFile,
			fileStack: [rootFile]
		};
	}

	private parseLine(line: string, state: any, document: vscode.TextDocument): void {
		const configuration = vscode.workspace.getConfiguration('latex');
		let excludeRegexp: RegExp[] = [];
		try {
			const excludePatterns = configuration.get<string[]>('message.latexlog.exclude', []);
			excludeRegexp = excludePatterns.map(regexp => RegExp(regexp));
		} catch (e) {
			// Invalid regex, ignore
		}

		// Compose the current file
		const filename = path.resolve(path.dirname(state.rootFile), state.fileStack[state.fileStack.length - 1]);

		// Skip the first line after a box warning
		if (state.insideBoxWarn) {
			state.insideBoxWarn = false;
			return;
		}

		// Append the read line
		if (state.searchEmptyLine) {
			// Check for line number reference (l.XX ...) first when inside error
			if (state.insideError) {
				const match = this.messageLine.exec(line);
				if (match && match.length >= 2) {
					// Extract line number from "l.XX" pattern
					const lineNumMatch = line.match(/^l\.(\d+)/);
					if (lineNumMatch) {
						state.currentResult.line = parseInt(lineNumMatch[1], 10);
					}
					const subLine = match[2];
					state.currentResult.errorPosText = subLine;
					state.searchEmptyLine = false;
					state.insideError = false;
					return;
				}
			}

			// Handle continuation lines for errors (lines starting with whitespace)
			if (state.insideError && line.match(/^\s+/) && line.trim() !== '') {
				// This is a continuation of the error message
				state.currentResult.text = state.currentResult.text + ' ' + line.trim();
				return;
			}

			// Empty line or non-continuation line ends the error/warning
			if (line.trim() === '') {
				state.searchEmptyLine = false;
				state.insideError = false;
				return;
			}

			const packageExtraLineResult = line.match(this.latexPackageWarningExtraLines);
			if (packageExtraLineResult) {
				state.currentResult.text += '\n(' + packageExtraLineResult[1] + ')\t' + packageExtraLineResult[2] + (packageExtraLineResult[4] ? '.' : '');
				state.currentResult.line = packageExtraLineResult[3] ? parseInt(packageExtraLineResult[3], 10) : 1;
				state.searchEmptyLine = false;
				return;
			}

			// If we get here and we're inside an error, append the line
			if (state.insideError) {
				state.currentResult.text = state.currentResult.text + '\n' + line;
				return;
			}

			// For warnings, append continuation
			state.currentResult.text = state.currentResult.text + '\n' + line;
			return;
		}

		// Check exclude patterns
		for (const regexp of excludeRegexp) {
			if (line.match(regexp)) {
				return;
			}
		}

		if (this.parseUndefinedReference(line, filename, state)) {
			return;
		}

		const showBadBox = configuration.get<string>('message.badbox.show', 'none');
		if (this.parseBadBox(line, filename, state, showBadBox, document)) {
			return;
		}

		let result = line.match(this.latexMissChar);
		if (result) {
			if (state.currentResult.type !== '') {
				this.buildLog.push(state.currentResult);
			}
			state.currentResult = {
				type: 'warning',
				file: filename,
				line: 1,
				text: result[1]
			};
			state.searchEmptyLine = false;
			return;
		}

		result = line.match(this.latexWarn);
		if (result) {
			if (state.currentResult.type !== '') {
				this.buildLog.push(state.currentResult);
			}
			state.currentResult = {
				type: 'warning',
				file: filename,
				line: result[4] ? parseInt(result[4], 10) : 1,
				text: result[1] + ': ' + result[3] + result[5]
			};
			state.searchEmptyLine = true;
			return;
		}

		result = line.match(this.biberWarn);
		if (result) {
			if (state.currentResult.type !== '') {
				this.buildLog.push(state.currentResult);
			}
			state.currentResult = {
				type: 'warning',
				file: '',
				line: 1,
				text: `No bib entry found for '${result[1]}'`
			};
			state.searchEmptyLine = false;
			this.parseLine(line.substring(result[0].length), state, document);
			return;
		}

		result = line.match(this.latexError);
		if (result) {
			if (state.currentResult.type !== '') {
				this.buildLog.push(state.currentResult);
			}
			// Build error message - include error type if present
			// result[1] = filename (if file:line: format), or undefined if "!" format
			// result[2] = line number (if file:line: format), or undefined if "!" format
			// result[3] = error type (e.g., "LaTeX") or undefined
			// result[4] = error message (the rest of the line)
			let errorText = (result[4] || '').trim();
			if (result[3]) {
				// Include error type in message
				errorText = `${result[3]} Error: ${errorText}`;
			} else if (line.startsWith('!')) {
				// If it's just "! message" without "Error:", keep it as is
				errorText = errorText || line.substring(1).trim();
			}

			state.currentResult = {
				type: 'error',
				text: errorText,
				file: result[1] ? path.resolve(path.dirname(state.rootFile), result[1]) : filename,
				line: result[2] ? parseInt(result[2], 10) : 1 // Will be updated when we see l.XX line
			};
			state.searchEmptyLine = true;
			state.insideError = true;
			return;
		}

		state.nested = this.parseLaTeXFileStack(line, state.fileStack, state.nested);
		if (state.fileStack.length === 0) {
			state.fileStack.push(state.rootFile);
		}
	}

	private parseUndefinedReference(line: string, filename: string, state: any): boolean {
		if (line === 'LaTeX Warning: There were undefined references.') {
			return true;
		}
		const match = line.match(this.UNDEFINED_REFERENCE);
		if (match === null) {
			return false;
		}
		if (state.currentResult.type !== '') {
			this.buildLog.push(state.currentResult);
		}
		state.currentResult = {
			type: 'warning',
			file: filename,
			line: match[3] ? parseInt(match[3], 10) : 1,
			text: `Cannot find ${match[1].toLowerCase()} \`${match[2]}\`.`,
			errorPosText: match[2]
		};
		state.searchEmptyLine = false;
		return true;
	}

	private parseBadBox(line: string, filename: string, state: any, type: string | undefined, document: vscode.TextDocument): boolean {
		if (type === undefined || type === 'none') {
			return false;
		}
		const regexs: RegExp[] = [];
		if (['both', 'overfull'].includes(type)) {
			regexs.push(this.latexOverfullBox, this.latexOverfullBoxAlt, this.latexOverfullBoxOutput);
		}
		if (['both', 'underfull'].includes(type)) {
			regexs.push(this.latexUnderfullBox, this.latexUnderfullBoxAlt, this.latexUnderfullBoxOutput);
		}
		for (const regex of regexs) {
			const result = line.match(regex);
			if (result === null) {
				continue;
			}
			if (state.currentResult.type !== '') {
				this.buildLog.push(state.currentResult);
			}
			if ([this.latexOverfullBoxOutput, this.latexUnderfullBoxOutput].includes(regex)) {
				state.currentResult = {
					type: 'typesetting',
					file: filename,
					line: 1,
					text: result[2] ? `${result[1]} in page ${result[2]}` : result[1]
				};
				this.parseLine(line.substring(result[0].length), state, document);
			} else {
				state.currentResult = {
					type: 'typesetting',
					file: filename,
					line: parseInt(result[2], 10),
					text: result[1]
				};
				state.insideBoxWarn = true;
				state.searchEmptyLine = false;
			}
			return true;
		}
		return false;
	}

	private parseLaTeXFileStack(line: string, fileStack: string[], nested: number): number {
		const result = line.match(/(\(|\))/);
		if (result && result.index !== undefined && result.index > -1) {
			line = line.substring(result.index + 1);
			if (result[1] === '(') {
				const pathResult = line.match(/^"?((?:(?:[a-zA-Z]:|\.|\/)?(?:\/|\\\\?))[^"()[\]]*)/);
				const mikTeXPathResult = line.match(/^"?([^"()[\]]*\.[a-z]{3,})/);
				if (pathResult) {
					fileStack.push(pathResult[1].trim());
				} else if (mikTeXPathResult) {
					fileStack.push(`./${mikTeXPathResult[1].trim()}`);
				} else {
					nested += 1;
				}
			} else {
				if (nested > 0) {
					nested -= 1;
				} else {
					fileStack.pop();
				}
			}
			nested = this.parseLaTeXFileStack(line, fileStack, nested);
		}
		return nested;
	}

	private convertToDiagnostics(buildLog: LaTeXLogItem[], document: vscode.TextDocument): LaTeXDiagnostic[] {
		const diagnostics: LaTeXDiagnostic[] = [];
		const documentPath = document.uri.fsPath || document.fileName;

		for (const item of buildLog) {
			// Only show diagnostics for the current document
			if (item.file && item.file !== documentPath && !item.file.endsWith(path.basename(documentPath))) {
				continue;
			}

			let startChar = 0;
			let endChar = Number.MAX_SAFE_INTEGER;

			// Try to compute a more precise position
			if (item.errorPosText) {
				const content = document.getText();
				const lines = content.split('\n');
				if (lines.length >= item.line) {
					const line = lines[item.line - 1];
					let pos = line.indexOf(item.errorPosText);
					if (pos >= 0) {
						pos += item.errorPosText.length;
						const len = item.errorPosText.length - item.errorPosText.lastIndexOf(' ') - 1;
						if (len > 0) {
							startChar = pos - len;
							endChar = pos;
						}
					}
				}
			}

			const severity = item.type === 'error'
				? vscode.DiagnosticSeverity.Error
				: item.type === 'warning'
					? vscode.DiagnosticSeverity.Warning
					: vscode.DiagnosticSeverity.Information;

			diagnostics.push({
				severity,
				message: item.text.trimEnd(),
				line: item.line - 1, // Convert to 0-based
				column: startChar,
				range: new vscode.Range(
					item.line - 1,
					startChar,
					item.line - 1,
					endChar
				),
				source: 'LaTeX'
			});
		}

		return diagnostics;
	}
}
