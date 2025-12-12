/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Code Action Provider for Typst documents
 * Provides AI-powered "Fix" and "Explain" actions for Typst diagnostics
 * Uses specific CodeActionKinds to distinguish from GitHub Copilot's actions
 */
export class TypstCodeActionProvider implements vscode.CodeActionProvider {
	// Use specific kinds to distinguish from Copilot
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix.append('typst'),
		vscode.CodeActionKind.QuickFix.append('typst').append('explain'),
	];

	private static readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: TypstCodeActionProvider.providedCodeActionKinds,
	};

	/**
	 * Register the code action provider for Typst documents
	 */
	public static register(_context: vscode.ExtensionContext): vscode.Disposable {
		const selector: vscode.DocumentSelector = [
			{ language: 'typst', scheme: '*' }
		];

		return vscode.languages.registerCodeActionsProvider(
			selector,
			new TypstCodeActionProvider(),
			TypstCodeActionProvider.metadata
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

		// Filter diagnostics that are from our Typst extension
		const typstDiagnostics = context.diagnostics.filter(d => {
			const source = d.source?.toLowerCase() ?? '';
			return source.includes('typst');
		});

		if (typstDiagnostics.length === 0) {
			return actions;
		}

		// Create "Fix with AI" action
		const fixAction = this.createFixAction(document, typstDiagnostics, range);
		if (fixAction) {
			actions.push(fixAction);
		}

		// Create "Explain" action
		const explainAction = this.createExplainAction(document, typstDiagnostics);
		if (explainAction) {
			actions.push(explainAction);
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
		const fixAction = new vscode.CodeAction('Fix', vscode.CodeActionKind.QuickFix.append('typst'));
		fixAction.isPreferred = true;
		// Mark as AI action to show sparkle icon (requires codeActionAI API proposal in package.json)
		(fixAction as unknown as { isAI?: boolean }).isAI = true;

		// Use inline chat command to fix the issue
		fixAction.command = {
			command: 'inlineChat.start',
			title: 'Fix Typst with DSpace AI',
			arguments: [{
				message: `Fix this Typst error: ${messages}`,
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
		const explainAction = new vscode.CodeAction('Explain', vscode.CodeActionKind.QuickFix.append('typst').append('explain'));
		// Mark as AI action to show sparkle icon (requires codeActionAI API proposal in package.json)
		(explainAction as unknown as { isAI?: boolean }).isAI = true;

		// Build context about the Typst error
		const errorContext = this.buildErrorContext(document, diagnostics);

		// Use chat open command to explain the issue
		explainAction.command = {
			command: 'workbench.action.chat.open',
			title: 'Explain Typst with DSpace AI',
			arguments: [{
				query: `@workspace /explain I have the following Typst error(s):\n\n${messages}\n\nPlease explain what this error means, why it occurs, and how to fix it.\n\nContext:\n${errorContext}`,
				isPartialQuery: false
			}]
		};

		explainAction.diagnostics = diagnostics;
		return explainAction;
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
}

