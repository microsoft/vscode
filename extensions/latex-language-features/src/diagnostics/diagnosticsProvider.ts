/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LaTeXLogParser, LaTeXDiagnostic } from './logParser';
import { LaTeXSyntaxValidator, SyntaxDiagnostic } from './syntaxValidator';
import { OutputChannelLogger } from '../utils/logger';

/**
 * Provides diagnostics (errors, warnings) for LaTeX documents
 * Combines syntax validation and log file parsing
 */
export class LaTeXDiagnosticsProvider implements vscode.Disposable {
	private diagnosticCollection: vscode.DiagnosticCollection;
	private logParser: LaTeXLogParser;
	private syntaxValidator: LaTeXSyntaxValidator;
	private disposables: vscode.Disposable[] = [];
	private pendingValidations: Map<string, vscode.Disposable> = new Map();
	private validationDelayMs = 500;

	constructor(
		private readonly logger: OutputChannelLogger,
		context: vscode.ExtensionContext
	) {
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection('latex');
		context.subscriptions.push(this.diagnosticCollection);
		this.logParser = new LaTeXLogParser();
		this.syntaxValidator = new LaTeXSyntaxValidator();

		// Register document change handler
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((e) => {
				this.triggerValidation(e.document);
			})
		);

		// Register document close handler
		this.disposables.push(
			vscode.workspace.onDidCloseTextDocument((document) => {
				this.cleanPendingValidation(document);
				this.diagnosticCollection.delete(document.uri);
			})
		);

		// Register document open handler
		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument((document) => {
				if (this.isLaTeXDocument(document)) {
					this.triggerValidation(document);
				}
			})
		);

		// Validate all open LaTeX documents
		vscode.workspace.textDocuments.forEach((document) => {
			if (this.isLaTeXDocument(document)) {
				this.triggerValidation(document);
			}
		});
	}

	/**
	 * Update diagnostics from a compilation log
	 * @param document The LaTeX document
	 * @param logContent The content of the compilation log
	 */
	updateFromLog(document: vscode.TextDocument, logContent: string): void {
		try {
			this.logger.info(`Parsing log content (length: ${logContent.length}) for ${document.fileName}`);
			const logDiagnostics = this.logParser.parseLog(logContent, document);
			this.logger.info(`Log parser found ${logDiagnostics.length} diagnostics`);
			const syntaxDiagnostics = this.syntaxValidator.validate(document);

			// Combine diagnostics - log parser already returns VS Code diagnostics
			const allDiagnostics: vscode.Diagnostic[] = [
				...logDiagnostics.map(d => this.convertToVSCodeDiagnostic(d)),
				...this.convertSyntaxDiagnostics(syntaxDiagnostics)
			];

			// Remove duplicates (same line and message)
			const uniqueDiagnostics = this.removeDuplicates(allDiagnostics);

			this.diagnosticCollection.set(document.uri, uniqueDiagnostics);
			this.logger.info(`Updated diagnostics for ${document.fileName}: ${uniqueDiagnostics.length} issues found`);

			// Log diagnostic details for debugging
			if (uniqueDiagnostics.length > 0) {
				uniqueDiagnostics.forEach((diag, idx) => {
					this.logger.info(`Diagnostic ${idx + 1}: ${diag.message} at line ${diag.range.start.line + 1}`);
				});
			} else {
				this.logger.warn(`No diagnostics found in log. Log content preview: ${logContent.substring(0, 200)}...`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error updating diagnostics from log: ${message}`);
			if (error instanceof Error && error.stack) {
				this.logger.error(`Stack trace: ${error.stack}`);
			}
		}
	}

	/**
	 * Get diagnostics for a document
	 * @param uri The document URI
	 * @returns Array of diagnostics for the document
	 */
	getDiagnostics(uri: vscode.Uri): readonly vscode.Diagnostic[] {
		return this.diagnosticCollection.get(uri) || [];
	}

	/**
	 * Add a compilation error diagnostic when compilation fails
	 * This is a fallback when log parsing doesn't produce diagnostics
	 * @param document The LaTeX document
	 * @param errorMessage The error message from compilation
	 */
	addCompilationError(document: vscode.TextDocument, errorMessage: string): void {
		try {
			// Only add fallback error if we don't already have diagnostics
			// This prevents overwriting real errors with generic ones
			const existing = this.diagnosticCollection.get(document.uri) || [];
			if (existing.length > 0) {
				this.logger.info(`Skipping fallback error - ${existing.length} existing diagnostics found`);
				return;
			}

			// Create a diagnostic at the start of the document
			// This ensures the error is visible even if we can't parse the log
			const errorRange = new vscode.Range(0, 0, 0, 0);
			const diagnostic = new vscode.Diagnostic(
				errorRange,
				errorMessage,
				vscode.DiagnosticSeverity.Error
			);
			diagnostic.source = 'LaTeX Compilation';

			// Get existing diagnostics and add this one
			this.diagnosticCollection.set(document.uri, [...existing, diagnostic]);
			this.logger.info(`Added compilation error diagnostic for ${document.fileName}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error adding compilation error diagnostic: ${message}`);
		}
	}

	/**
	 * Validate document syntax and update diagnostics
	 */
	private validateDocument(document: vscode.TextDocument): void {
		try {
			const syntaxDiagnostics = this.syntaxValidator.validate(document);
			const vsDiagnostics = this.convertSyntaxDiagnostics(syntaxDiagnostics);
			this.diagnosticCollection.set(document.uri, vsDiagnostics);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error validating document: ${message}`);
		}
	}

	private triggerValidation(document: vscode.TextDocument): void {
		if (!this.isLaTeXDocument(document)) {
			return;
		}

		this.cleanPendingValidation(document);

		const disposable = {
			dispose: () => { }
		};

		// Use setTimeout for debouncing
		const timeoutHandle = setTimeout(() => {
			if (this.pendingValidations.get(document.uri.toString()) === disposable) {
				this.validateDocument(document);
				this.pendingValidations.delete(document.uri.toString());
			}
		}, this.validationDelayMs);

		disposable.dispose = () => {
			clearTimeout(timeoutHandle);
		};

		this.pendingValidations.set(document.uri.toString(), disposable);
	}

	private cleanPendingValidation(document: vscode.TextDocument): void {
		const disposable = this.pendingValidations.get(document.uri.toString());
		if (disposable) {
			disposable.dispose();
			this.pendingValidations.delete(document.uri.toString());
		}
	}

	private isLaTeXDocument(document: vscode.TextDocument): boolean {
		return document.languageId === 'latex' || document.languageId === 'tex';
	}

	private convertToVSCodeDiagnostic(d: LaTeXDiagnostic): vscode.Diagnostic {
		const range = d.range || new vscode.Range(
			d.line,
			d.column || 0,
			d.line,
			Number.MAX_SAFE_INTEGER
		);

		const diagnostic = new vscode.Diagnostic(range, d.message, d.severity);
		if (d.source) {
			diagnostic.source = d.source;
		}
		if (d.code !== undefined) {
			diagnostic.code = d.code;
		}
		return diagnostic;
	}

	private convertSyntaxDiagnostics(diagnostics: SyntaxDiagnostic[]): vscode.Diagnostic[] {
		return diagnostics.map(d => {
			const diagnostic = new vscode.Diagnostic(d.range, d.message, d.severity);
			diagnostic.source = d.source;
			if (d.code !== undefined) {
				diagnostic.code = d.code;
			}
			return diagnostic;
		});
	}

	private removeDuplicates(diagnostics: vscode.Diagnostic[]): vscode.Diagnostic[] {
		const seen = new Set<string>();
		const unique: vscode.Diagnostic[] = [];

		for (const diagnostic of diagnostics) {
			const key = `${diagnostic.range.start.line}:${diagnostic.range.start.character}:${diagnostic.message}`;
			if (!seen.has(key)) {
				seen.add(key);
				unique.push(diagnostic);
			}
		}

		return unique;
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.pendingValidations.forEach(d => d.dispose());
		this.pendingValidations.clear();
		this.diagnosticCollection.dispose();
	}
}

