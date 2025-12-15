/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Diagnostic codes for Typst errors
 * These codes help identify specific types of errors for code actions
 */
export enum TypstDiagnosticCode {
	// Variable-related errors
	UnknownVariable = 'unknown-variable',

	// File-related errors
	FileNotFound = 'file-not-found',

	// Syntax errors
	SyntaxError = 'syntax-error',

	// Compilation errors
	CompilationError = 'compilation-error',
}

/**
 * Code Action Provider for Typst documents
 * Provides AI-powered "Fix" and "Explain" actions for Typst diagnostics,
 * plus specific quick fixes based on tinymist's code_action.rs:
 * - Heading depth adjustment (increase/decrease)
 * - Equation conversion (inline/block)
 * - Unknown variable fixes (create variable, add spaces in math)
 * - Wrap with content block
 * - Path rewriting (relative/absolute)
 */
export class TypstCodeActionProvider implements vscode.CodeActionProvider {
	// Use specific kinds to distinguish from Copilot
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix.append('typst'),
		vscode.CodeActionKind.QuickFix.append('typst').append('explain'),
		vscode.CodeActionKind.QuickFix,
		vscode.CodeActionKind.Refactor.append('rewrite'),
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

		// Get Typst-specific diagnostics if any
		const typstDiagnostics = context.diagnostics.filter(d => {
			const source = d.source?.toLowerCase() ?? '';
			return source.includes('typst');
		});

		// Always provide scoped actions (based on cursor position)
		// These work without diagnostics
		const scopedActions = this.createScopedActions(document, range);
		actions.push(...scopedActions);

		// Provide diagnostic-based actions only if there are diagnostics
		if (typstDiagnostics.length > 0) {
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

			// Create specific quick fixes based on diagnostic messages
			for (const diagnostic of typstDiagnostics) {
				const specificFixes = this.createAutofixActions(document, diagnostic);
				actions.push(...specificFixes);
			}
		}

		return actions;
	}

	/**
	 * Create scoped actions based on cursor position (no diagnostics needed)
	 * These are refactoring actions that work on the current context
	 */
	private createScopedActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];

		// Get the current line
		const line = document.lineAt(range.start.line);
		const lineText = line.text;

		// Heading actions (increase/decrease depth)
		const headingActions = this.createHeadingActions(document, line);
		actions.push(...headingActions);

		// Equation actions (inline/block conversion)
		const equationActions = this.createEquationActions(document, range);
		actions.push(...equationActions);

		// Wrap with content block (only if there's a selection)
		if (!range.isEmpty) {
			const wrapAction = this.createWrapAction(document, range);
			if (wrapAction) {
				actions.push(wrapAction);
			}
		}

		// Path actions (relative/absolute conversion)
		const pathActions = this.createPathActions(document, range, lineText);
		actions.push(...pathActions);

		return actions;
	}

	/**
	 * Create heading depth adjustment actions
	 * Based on tinymist's heading_actions
	 */
	private createHeadingActions(
		document: vscode.TextDocument,
		line: vscode.TextLine
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];
		const lineText = line.text;

		// Check if line starts with heading marker (=, ==, ===, etc.)
		const headingMatch = lineText.match(/^(=+)\s/);
		if (!headingMatch) {
			return actions;
		}

		const currentDepth = headingMatch[1].length;
		const markerRange = new vscode.Range(
			line.range.start,
			new vscode.Position(line.lineNumber, currentDepth)
		);

		// Decrease depth (only if depth > 1)
		if (currentDepth > 1) {
			const decreaseAction = new vscode.CodeAction(
				'Decrease heading depth',
				vscode.CodeActionKind.Refactor.append('rewrite')
			);
			decreaseAction.edit = new vscode.WorkspaceEdit();
			decreaseAction.edit.replace(document.uri, markerRange, '='.repeat(currentDepth - 1));
			actions.push(decreaseAction);
		}

		// Increase depth (limit to reasonable depth, e.g., 6 like HTML)
		if (currentDepth < 6) {
			const increaseAction = new vscode.CodeAction(
				'Increase heading depth',
				vscode.CodeActionKind.Refactor.append('rewrite')
			);
			increaseAction.edit = new vscode.WorkspaceEdit();
			increaseAction.edit.replace(document.uri, markerRange, '='.repeat(currentDepth + 1));
			actions.push(increaseAction);
		}

		return actions;
	}

	/**
	 * Create equation conversion actions
	 * Based on tinymist's equation_actions
	 * - Convert inline equation ($...$) to block ($ ... $)
	 * - Convert block equation to inline
	 * - Convert to multi-line block equation
	 */
	private createEquationActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];

		// Find equation at cursor position
		const line = document.lineAt(range.start.line);
		const lineText = line.text;
		const cursorCol = range.start.character;

		// Look for inline or block equations
		// Block equation: $ content $ (with spaces)
		// Inline equation: $content$ (no spaces)
		const equationPatterns = [
			// Block equation pattern: $ content $
			/\$\s+(.+?)\s+\$/g,
			// Inline equation pattern: $content$ (no leading/trailing space)
			/\$([^\s$][^$]*[^\s$]?)\$/g,
			// Single char inline: $x$
			/\$([^\s$])\$/g,
		];

		for (const pattern of equationPatterns) {
			let match;
			pattern.lastIndex = 0; // Reset regex state
			while ((match = pattern.exec(lineText)) !== null) {
				const startCol = match.index;
				const endCol = match.index + match[0].length;

				// Check if cursor is within this equation
				if (cursorCol >= startCol && cursorCol <= endCol) {
					const content = match[1];
					const fullMatch = match[0];
					const isBlock = fullMatch.startsWith('$ ') && fullMatch.endsWith(' $');

					const equationRange = new vscode.Range(
						new vscode.Position(line.lineNumber, startCol),
						new vscode.Position(line.lineNumber, endCol)
					);

					if (isBlock) {
						// Convert to inline equation
						const toInlineAction = new vscode.CodeAction(
							'Convert to inline equation',
							vscode.CodeActionKind.Refactor.append('rewrite')
						);
						toInlineAction.edit = new vscode.WorkspaceEdit();
						toInlineAction.edit.replace(document.uri, equationRange, `$${content.trim()}$`);
						actions.push(toInlineAction);
					} else {
						// Convert to block equation
						const toBlockAction = new vscode.CodeAction(
							'Convert to block equation',
							vscode.CodeActionKind.Refactor.append('rewrite')
						);
						toBlockAction.edit = new vscode.WorkspaceEdit();
						toBlockAction.edit.replace(document.uri, equationRange, `$ ${content} $`);
						actions.push(toBlockAction);
					}

					// Convert to multi-line block equation
					const toMultilineAction = new vscode.CodeAction(
						'Convert to multi-line block equation',
						vscode.CodeActionKind.Refactor.append('rewrite')
					);
					toMultilineAction.edit = new vscode.WorkspaceEdit();
					toMultilineAction.edit.replace(document.uri, equationRange, `$\n${content.trim()}\n$`);
					actions.push(toMultilineAction);

					// Only process the first matching equation
					return actions;
				}
			}
		}

		return actions;
	}

	/**
	 * Create wrap with content block action
	 * Based on tinymist's wrap_actions
	 * Wraps selection with #[...]
	 */
	private createWrapAction(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection
	): vscode.CodeAction | undefined {
		if (range.isEmpty) {
			return undefined;
		}

		const selectedText = document.getText(range);
		if (!selectedText.trim()) {
			return undefined;
		}

		const wrapAction = new vscode.CodeAction(
			'Wrap with content block',
			vscode.CodeActionKind.Refactor.append('rewrite')
		);
		wrapAction.edit = new vscode.WorkspaceEdit();
		wrapAction.edit.replace(document.uri, range, `#[${selectedText}]`);
		return wrapAction;
	}

	/**
	 * Create path conversion actions
	 * Based on tinymist's path_rewrite
	 * - Convert relative path to absolute
	 * - Convert absolute path to relative
	 */
	private createPathActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		lineText: string
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];
		const cursorCol = range.start.character;

		// Look for string paths in import/include/image statements
		// Patterns: #import "path", #include "path", image("path")
		const pathPatterns = [
			/#import\s+"([^"]+)"/g,
			/#include\s+"([^"]+)"/g,
			/image\s*\(\s*"([^"]+)"/g,
			/read\s*\(\s*"([^"]+)"/g,
			/csv\s*\(\s*"([^"]+)"/g,
			/json\s*\(\s*"([^"]+)"/g,
			/yaml\s*\(\s*"([^"]+)"/g,
			/toml\s*\(\s*"([^"]+)"/g,
			/xml\s*\(\s*"([^"]+)"/g,
		];

		for (const pattern of pathPatterns) {
			let match;
			pattern.lastIndex = 0;
			while ((match = pattern.exec(lineText)) !== null) {
				const fullMatch = match[0];
				const path = match[1];
				const pathStart = match.index + fullMatch.indexOf('"') + 1;
				const pathEnd = pathStart + path.length;

				// Check if cursor is within or near this path
				if (cursorCol >= match.index && cursorCol <= pathEnd + 1) {
					// Don't process package imports (@preview/...)
					if (path.startsWith('@')) {
						continue;
					}

					const pathRange = new vscode.Range(
						new vscode.Position(range.start.line, pathStart),
						new vscode.Position(range.start.line, pathEnd)
					);

					if (path.startsWith('/')) {
						// Convert absolute path to relative
						const relativePath = this.toRelativePath(document.uri, path);
						if (relativePath && relativePath !== path) {
							const toRelativeAction = new vscode.CodeAction(
								'Convert to relative path',
								vscode.CodeActionKind.Refactor.append('rewrite')
							);
							toRelativeAction.edit = new vscode.WorkspaceEdit();
							toRelativeAction.edit.replace(document.uri, pathRange, relativePath);
							actions.push(toRelativeAction);
						}
					} else {
						// Convert relative path to absolute
						const absolutePath = this.toAbsolutePath(document.uri, path);
						if (absolutePath && absolutePath !== path) {
							const toAbsoluteAction = new vscode.CodeAction(
								'Convert to absolute path',
								vscode.CodeActionKind.Refactor.append('rewrite')
							);
							toAbsoluteAction.edit = new vscode.WorkspaceEdit();
							toAbsoluteAction.edit.replace(document.uri, pathRange, absolutePath);
							actions.push(toAbsoluteAction);
						}
					}
				}
			}
		}

		return actions;
	}

	/**
	 * Convert absolute path to relative path
	 */
	private toRelativePath(documentUri: vscode.Uri, absolutePath: string): string | undefined {
		// Get document directory
		const docPath = documentUri.path;
		const docDir = docPath.substring(0, docPath.lastIndexOf('/'));

		// Remove leading / from absolute path for comparison
		const targetPath = absolutePath.startsWith('/') ? absolutePath : '/' + absolutePath;

		// Calculate relative path
		const docParts = docDir.split('/').filter(Boolean);
		const targetParts = targetPath.split('/').filter(Boolean);

		// Find common prefix
		let commonLength = 0;
		while (commonLength < docParts.length &&
			commonLength < targetParts.length &&
			docParts[commonLength] === targetParts[commonLength]) {
			commonLength++;
		}

		// Build relative path
		const upCount = docParts.length - commonLength;
		const upPath = '../'.repeat(upCount);
		const downPath = targetParts.slice(commonLength).join('/');

		return upPath + downPath || './' + downPath;
	}

	/**
	 * Convert relative path to absolute path (from workspace root)
	 */
	private toAbsolutePath(documentUri: vscode.Uri, relativePath: string): string | undefined {
		// Get document directory
		const docPath = documentUri.path;
		const docDir = docPath.substring(0, docPath.lastIndexOf('/'));

		// Resolve relative path
		const parts = docDir.split('/').filter(Boolean);

		for (const segment of relativePath.split('/')) {
			if (segment === '..') {
				parts.pop();
			} else if (segment !== '.' && segment !== '') {
				parts.push(segment);
			}
		}

		return '/' + parts.join('/');
	}

	/**
	 * Create autofix actions based on diagnostic messages
	 * Based on tinymist's autofix
	 */
	private createAutofixActions(
		document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];
		const message = diagnostic.message.toLowerCase();

		// Unknown variable: create missing variable declaration
		if (message.includes('unknown variable') || message.includes('undefined')) {
			const createVarActions = this.createUnknownVariableActions(document, diagnostic);
			actions.push(...createVarActions);
		}

		// File not found: create missing file
		if (message.includes('file not found') || message.includes('cannot find')) {
			const createFileAction = this.createMissingFileAction(document, diagnostic);
			if (createFileAction) {
				actions.push(createFileAction);
			}
		}

		// Unclosed delimiter
		if (message.includes('unclosed') || message.includes('expected')) {
			const closeActions = this.createCloseDelimiterActions(document, diagnostic);
			actions.push(...closeActions);
		}

		return actions;
	}

	/**
	 * Create actions for unknown variable errors
	 * Based on tinymist's autofix_unknown_variable
	 */
	private createUnknownVariableActions(
		document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];

		// Extract variable name from the error message or range
		const errorText = document.getText(diagnostic.range);
		const varName = errorText.trim();

		if (!varName || varName.includes(' ')) {
			return actions;
		}

		// Action 1: Create missing variable at the beginning of the document
		const createVarAction = new vscode.CodeAction(
			`Create missing variable '${varName}'`,
			vscode.CodeActionKind.QuickFix
		);
		createVarAction.edit = new vscode.WorkspaceEdit();

		// Find a good position to insert the variable declaration
		// Look for existing let declarations or insert at the start
		let insertLine = 0;
		for (let i = 0; i < Math.min(document.lineCount, 50); i++) {
			const line = document.lineAt(i).text;
			// Skip imports and comments at the start
			if (line.startsWith('#import') || line.startsWith('#include') || line.trim().startsWith('//')) {
				insertLine = i + 1;
			} else if (line.startsWith('#let') || line.startsWith('#set')) {
				insertLine = i + 1;
			}
		}

		const insertPosition = new vscode.Position(insertLine, 0);
		createVarAction.edit.insert(document.uri, insertPosition, `#let ${varName} = none\n\n`);
		createVarAction.diagnostics = [diagnostic];
		actions.push(createVarAction);

		// Action 2: If it looks like a math identifier, suggest adding spaces
		// This converts `$xyz$` suggestions to `$x y z$`
		if (varName.length > 1 && /^[a-zA-Z]+$/.test(varName)) {
			const addSpacesAction = new vscode.CodeAction(
				'Add spaces between letters (math)',
				vscode.CodeActionKind.QuickFix
			);
			addSpacesAction.edit = new vscode.WorkspaceEdit();
			const spacedText = varName.split('').join(' ');
			addSpacesAction.edit.replace(document.uri, diagnostic.range, spacedText);
			addSpacesAction.diagnostics = [diagnostic];
			actions.push(addSpacesAction);
		}

		return actions;
	}

	/**
	 * Create action for file not found errors
	 * Based on tinymist's autofix_file_not_found
	 */
	private createMissingFileAction(
		_document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic
	): vscode.CodeAction | undefined {
		// Extract file path from the error message
		const pathMatch = diagnostic.message.match(/"([^"]+)"/);
		if (!pathMatch) {
			return undefined;
		}

		const missingPath = pathMatch[1];

		// Don't create actions for package imports
		if (missingPath.startsWith('@')) {
			return undefined;
		}

		const createFileAction = new vscode.CodeAction(
			`Create missing file '${missingPath}'`,
			vscode.CodeActionKind.QuickFix
		);

		// Use command to create file since we need to calculate the full path
		createFileAction.command = {
			command: 'typst.createMissingFile',
			title: 'Create Missing File',
			arguments: [missingPath, _document.uri]
		};

		createFileAction.diagnostics = [diagnostic];
		return createFileAction;
	}

	/**
	 * Create actions for unclosed delimiter errors
	 */
	private createCloseDelimiterActions(
		document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];
		const message = diagnostic.message.toLowerCase();

		// Detect what delimiter needs to be closed
		const delimiters: { close: string; name: string }[] = [
			{ close: '}', name: 'brace' },
			{ close: ']', name: 'bracket' },
			{ close: ')', name: 'parenthesis' },
			{ close: '$', name: 'math delimiter' },
		];

		for (const { close, name } of delimiters) {
			if (message.includes(name) || message.includes(close)) {
				const closeAction = new vscode.CodeAction(
					`Add closing ${name} '${close}'`,
					vscode.CodeActionKind.QuickFix
				);
				closeAction.edit = new vscode.WorkspaceEdit();
				// Insert at end of current line
				const lineEnd = document.lineAt(diagnostic.range.end.line).range.end;
				closeAction.edit.insert(document.uri, lineEnd, close);
				closeAction.diagnostics = [diagnostic];
				actions.push(closeAction);
				break;
			}
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
