/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Diagnostic codes for LaTeX syntax errors
 * These codes help identify specific types of errors for code actions
 */
export enum LaTeXDiagnosticCode {
	// Environment-related errors
	ExtraEnd = 'extra-end',
	EnvironmentMismatch = 'environment-mismatch',
	UnclosedEnvironment = 'unclosed-environment',

	// Brace-related errors
	ExtraBrace = 'extra-brace',
	UnclosedBrace = 'unclosed-brace',

	// Math-related errors
	UnmatchedDollar = 'unmatched-dollar',

	// Common errors
	CommonTypo = 'common-typo',

	// Compilation errors (from log parser)
	CompilationError = 'compilation-error',
	CompilationWarning = 'compilation-warning',
}

/**
 * Code Action Provider for LaTeX documents
 * Provides AI-powered "Fix" and "Explain" actions for LaTeX diagnostics
 * Uses specific CodeActionKinds to distinguish from GitHub Copilot's actions
 */
export class LaTeXCodeActionProvider implements vscode.CodeActionProvider {
	// Use specific kinds to distinguish from Copilot
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix.append('latex'),
		vscode.CodeActionKind.QuickFix.append('latex').append('explain'),
		vscode.CodeActionKind.QuickFix, // Also provide generic QuickFix for specific fixes
	];

	private static readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: LaTeXCodeActionProvider.providedCodeActionKinds,
	};

	/**
	 * Register the code action provider for LaTeX documents
	 */
	public static register(_context: vscode.ExtensionContext): vscode.Disposable {
		const selector: vscode.DocumentSelector = [
			{ language: 'latex', scheme: '*' },
			{ language: 'tex', scheme: '*' }
		];

		return vscode.languages.registerCodeActionsProvider(
			selector,
			new LaTeXCodeActionProvider(),
			LaTeXCodeActionProvider.metadata
		);
	}

	/**
	 * Provide code actions for the given document and range
	 */
	public provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		const actions: vscode.CodeAction[] = [];

		// Only provide actions if there are diagnostics in the context
		if (context.diagnostics.length === 0) {
			return actions;
		}

		// Filter diagnostics that are from our LaTeX extension
		// Use flexible matching to handle different source formats
		const latexDiagnostics = context.diagnostics.filter(d => {
			const source = d.source?.toLowerCase() ?? '';
			return source.includes('latex') || source.includes('tex');
		});

		if (latexDiagnostics.length === 0) {
			return actions;
		}

		// Create "Fix with AI" action
		const fixAction = this.createFixAction(document, latexDiagnostics, range);
		if (fixAction) {
			actions.push(fixAction);
		}

		// Create "Explain" action
		const explainAction = this.createExplainAction(document, latexDiagnostics);
		if (explainAction) {
			actions.push(explainAction);
		}

		// Create specific quick fixes based on diagnostic codes
		for (const diagnostic of latexDiagnostics) {
			const specificFixes = this.createSpecificFixes(document, diagnostic);
			actions.push(...specificFixes);
		}

		return actions;
	}

	/**
	 * Create "Fix with DSpace AI" action that invokes inline chat
	 * Uses a specific kind to distinguish from Copilot's actions
	 */
	private createFixAction(
		_document: vscode.TextDocument,
		diagnostics: vscode.Diagnostic[],
		_range: vscode.Range | vscode.Selection
	): vscode.CodeAction | undefined {
		if (diagnostics.length === 0) {
			return undefined;
		}

		const messages = diagnostics.map(d => d.message).join('; ');

		// Use a specific CodeActionKind to distinguish from Copilot
		const fixAction = new vscode.CodeAction('Fix', vscode.CodeActionKind.QuickFix.append('latex'));
		fixAction.isPreferred = true;
		// Mark as AI action to show sparkle icon
		// eslint-disable-next-line local/code-no-any-casts
		(fixAction as any).isAI = true;

		// Use inline chat command to fix the issue
		// Note: Only pass message and autoSend - other parameters like initialSelection
		// use internal VS Code types that aren't compatible with extension API types
		fixAction.command = {
			command: 'inlineChat.start',
			title: 'Fix LaTeX with DSpace AI',
			arguments: [{
				message: `Fix this LaTeX error: ${messages}`,
				autoSend: true
			}]
		};

		fixAction.diagnostics = diagnostics;
		return fixAction;
	}

	/**
	 * Create "Explain" action that opens chat with explanation request
	 * Uses a specific kind to distinguish from Copilot's actions
	 */
	private createExplainAction(
		document: vscode.TextDocument,
		diagnostics: vscode.Diagnostic[]
	): vscode.CodeAction | undefined {
		if (diagnostics.length === 0) {
			return undefined;
		}

		const messages = diagnostics.map(d => d.message).join('; ');

		// Use a specific CodeActionKind to distinguish from Copilot
		const explainAction = new vscode.CodeAction('Explain', vscode.CodeActionKind.QuickFix.append('latex').append('explain'));
		// Mark as AI action to show sparkle icon
		// eslint-disable-next-line local/code-no-any-casts
		(explainAction as any).isAI = true;

		// Build context about the LaTeX error
		const errorContext = this.buildErrorContext(document, diagnostics);

		// Use chat open command to explain the issue
		explainAction.command = {
			command: 'workbench.action.chat.open',
			title: 'Explain LaTeX with DSpace AI',
			arguments: [{
				query: `@workspace /explain I have the following LaTeX error(s):\n\n${messages}\n\nPlease explain what this error means, why it occurs, and how to fix it.\n\nContext:\n${errorContext}`,
				isPartialQuery: false
			}]
		};

		explainAction.diagnostics = diagnostics;
		return explainAction;
	}

	/**
	 * Create specific quick fixes based on diagnostic codes
	 */
	private createSpecificFixes(
		document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];
		const code = diagnostic.code?.toString();

		switch (code) {
			case LaTeXDiagnosticCode.UnclosedEnvironment: {
				// Suggest adding the closing \end{...}
				const envMatch = diagnostic.message.match(/\\begin\{([^}]+)\}/);
				if (envMatch) {
					const envName = envMatch[1];
					const closeEnvAction = new vscode.CodeAction(
						`Add \\end{${envName}}`,
						vscode.CodeActionKind.QuickFix
					);
					closeEnvAction.edit = new vscode.WorkspaceEdit();
					// Insert at the end of the document or appropriate location
					const insertPosition = this.findBestInsertPosition(document, diagnostic.range.start.line);
					closeEnvAction.edit.insert(document.uri, insertPosition, `\\end{${envName}}\n`);
					closeEnvAction.diagnostics = [diagnostic];
					actions.push(closeEnvAction);
				}
				break;
			}

			case LaTeXDiagnosticCode.ExtraEnd: {
				// Suggest removing the extra \end
				const removeEndAction = new vscode.CodeAction(
					'Remove extra \\end',
					vscode.CodeActionKind.QuickFix
				);
				removeEndAction.edit = new vscode.WorkspaceEdit();
				removeEndAction.edit.delete(document.uri, this.expandRangeToFullLine(document, diagnostic.range));
				removeEndAction.diagnostics = [diagnostic];
				actions.push(removeEndAction);
				break;
			}

			case LaTeXDiagnosticCode.EnvironmentMismatch:
				// This requires AI assistance - suggest using the AI fix
				break;

			case LaTeXDiagnosticCode.UnclosedBrace: {
				// Suggest adding closing brace
				const closeBraceAction = new vscode.CodeAction(
					'Add closing brace }',
					vscode.CodeActionKind.QuickFix
				);
				closeBraceAction.edit = new vscode.WorkspaceEdit();
				const bracePosition = document.lineAt(diagnostic.range.start.line).range.end;
				closeBraceAction.edit.insert(document.uri, bracePosition, '}');
				closeBraceAction.diagnostics = [diagnostic];
				actions.push(closeBraceAction);
				break;
			}

			case LaTeXDiagnosticCode.ExtraBrace: {
				// Suggest removing the extra brace
				const removeBraceAction = new vscode.CodeAction(
					'Remove extra brace',
					vscode.CodeActionKind.QuickFix
				);
				removeBraceAction.edit = new vscode.WorkspaceEdit();
				removeBraceAction.edit.delete(document.uri, diagnostic.range);
				removeBraceAction.diagnostics = [diagnostic];
				actions.push(removeBraceAction);
				break;
			}

			case LaTeXDiagnosticCode.UnmatchedDollar: {
				// Suggest adding matching $
				const matchDollarAction = new vscode.CodeAction(
					'Add matching $',
					vscode.CodeActionKind.QuickFix
				);
				matchDollarAction.edit = new vscode.WorkspaceEdit();
				const dollarPosition = document.lineAt(diagnostic.range.start.line).range.end;
				matchDollarAction.edit.insert(document.uri, dollarPosition, '$');
				matchDollarAction.diagnostics = [diagnostic];
				actions.push(matchDollarAction);
				break;
			}

			case LaTeXDiagnosticCode.CommonTypo: {
				// Handle common typos like \beging -> \begin
				if (diagnostic.message.includes('\\beging')) {
					const fixTypoAction = new vscode.CodeAction(
						'Fix typo: \\beging → \\begin',
						vscode.CodeActionKind.QuickFix
					);
					fixTypoAction.isPreferred = true;
					fixTypoAction.edit = new vscode.WorkspaceEdit();
					const line = document.lineAt(diagnostic.range.start.line);
					const lineText = line.text;
					const fixedLine = lineText.replace('\\beging', '\\begin');
					fixTypoAction.edit.replace(document.uri, line.range, fixedLine);
					fixTypoAction.diagnostics = [diagnostic];
					actions.push(fixTypoAction);
				}
				break;
			}
		}

		return actions;
	}

	/**
	 * Build error context for AI assistance
	 */
	private buildErrorContext(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): string {
		const lines: string[] = [];

		for (const diagnostic of diagnostics) {
			const startLine = Math.max(0, diagnostic.range.start.line - 2);
			const endLine = Math.min(document.lineCount - 1, diagnostic.range.end.line + 2);

			lines.push(`--- Error at line ${diagnostic.range.start.line + 1} ---`);
			for (let i = startLine; i <= endLine; i++) {
				const lineText = document.lineAt(i).text;
				const marker = i === diagnostic.range.start.line ? '>>> ' : '    ';
				lines.push(`${marker}${i + 1}: ${lineText}`);
			}
			lines.push('');
		}

		return lines.join('\n');
	}

	/**
	 * Find the best position to insert content after a given line
	 */
	private findBestInsertPosition(document: vscode.TextDocument, afterLine: number): vscode.Position {
		// Look for the end of the current logical block
		for (let i = afterLine + 1; i < document.lineCount; i++) {
			const line = document.lineAt(i).text.trim();
			// Insert before another \begin or at an empty line
			if (line.startsWith('\\begin{') || line === '') {
				return new vscode.Position(i, 0);
			}
		}
		// If not found, insert at the end of document
		return new vscode.Position(document.lineCount, 0);
	}

	/**
	 * Expand a range to include the full line
	 */
	private expandRangeToFullLine(document: vscode.TextDocument, range: vscode.Range): vscode.Range {
		const line = document.lineAt(range.start.line);
		return new vscode.Range(
			line.range.start,
			new vscode.Position(range.start.line + 1, 0)
		);
	}
}

