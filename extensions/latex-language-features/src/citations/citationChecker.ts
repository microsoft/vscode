/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Citation reference found in a .tex file
 */
interface CitationReference {
	key: string;
	uri: vscode.Uri;
	range: vscode.Range;
}

/**
 * BibTeX entry found in a .bib file
 */
interface BibEntry {
	key: string;
	uri: vscode.Uri;
	range: vscode.Range;
	type: string;
}

/**
 * Results of citation check
 */
interface CitationCheckResult {
	undefinedCitations: CitationReference[];  // Citations in .tex that don't exist in .bib
	unusedEntries: BibEntry[];                // Entries in .bib that are never cited
	duplicateEntries: BibEntry[];             // Entries that appear multiple times in .bib
}

/**
 * Diagnostic collection for citation problems
 */
const citationDiagnostics = vscode.languages.createDiagnosticCollection('Citations');

/**
 * Cache for parsed citations per document
 */
const citationCache = new Map<string, CitationReference[]>();

/**
 * Cache for parsed bib entries per document
 */
const bibEntryCache = new Map<string, BibEntry[]>();

/**
 * Debounce timer for automatic checking
 */
let autoCheckTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Configuration: is automatic checking enabled?
 */
let autoCheckEnabled = true;

/**
 * Pattern to match \cite commands with various forms
 * Matches: \cite{key}, \cite{key1,key2}, \citep{key}, \citet{key}, \parencite{key}, etc.
 */
const CITE_PATTERN = /\\(?:cite|citep|citet|parencite|textcite|autocite|footcite|fullcite|nocite)(?:\[[^\]]*\])*\{([^}]+)\}/g;

/**
 * Pattern to match BibTeX entries
 */
const BIB_ENTRY_PATTERN = /@(\w+)\s*\{\s*([^,\s]+)/g;

/**
 * Extract all citation keys from a LaTeX document (with caching)
 */
function extractCitations(document: vscode.TextDocument, useCache: boolean = true): CitationReference[] {
	const docId = document.uri.toString();

	// Check cache first
	if (useCache && citationCache.has(docId)) {
		return citationCache.get(docId)!;
	}

	const citations: CitationReference[] = [];
	const text = document.getText();

	// Reset regex state
	CITE_PATTERN.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = CITE_PATTERN.exec(text)) !== null) {
		const keysString = match[1];
		const keys = keysString.split(',').map(k => k.trim());

		for (const key of keys) {
			if (key.length > 0) {
				const startPos = document.positionAt(match.index);
				const endPos = document.positionAt(match.index + match[0].length);

				citations.push({
					key,
					uri: document.uri,
					range: new vscode.Range(startPos, endPos)
				});
			}
		}
	}

	// Update cache
	citationCache.set(docId, citations);

	return citations;
}

/**
 * Extract all entries from a BibTeX document (with caching)
 */
function extractBibEntries(document: vscode.TextDocument, useCache: boolean = true): BibEntry[] {
	const docId = document.uri.toString();

	// Check cache first
	if (useCache && bibEntryCache.has(docId)) {
		return bibEntryCache.get(docId)!;
	}

	const entries: BibEntry[] = [];
	const text = document.getText();

	// Reset regex state
	BIB_ENTRY_PATTERN.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = BIB_ENTRY_PATTERN.exec(text)) !== null) {
		const type = match[1].toLowerCase();
		const key = match[2];

		// Skip @string, @preamble, @comment
		if (['string', 'preamble', 'comment'].includes(type)) {
			continue;
		}

		const startPos = document.positionAt(match.index);
		const endPos = document.positionAt(match.index + match[0].length);

		entries.push({
			key,
			uri: document.uri,
			range: new vscode.Range(startPos, endPos),
			type
		});
	}

	// Update cache
	bibEntryCache.set(docId, entries);

	return entries;
}

/**
 * Get all LaTeX documents in the workspace
 */
async function getAllLatexDocuments(): Promise<vscode.TextDocument[]> {
	const documents: vscode.TextDocument[] = [];

	// Get all open .tex documents
	for (const doc of vscode.workspace.textDocuments) {
		if (doc.languageId === 'latex' || doc.languageId === 'tex') {
			documents.push(doc);
		}
	}

	// Also search for .tex files in workspace
	const texFiles = await vscode.workspace.findFiles('**/*.tex', '**/node_modules/**');
	for (const uri of texFiles) {
		try {
			const doc = await vscode.workspace.openTextDocument(uri);
			if (!documents.find(d => d.uri.toString() === doc.uri.toString())) {
				documents.push(doc);
			}
		} catch {
			// File might not be accessible
		}
	}

	return documents;
}

/**
 * Get all BibTeX documents in the workspace
 */
async function getAllBibDocuments(): Promise<vscode.TextDocument[]> {
	const documents: vscode.TextDocument[] = [];

	// Get all open .bib documents
	for (const doc of vscode.workspace.textDocuments) {
		if (doc.languageId === 'bibtex') {
			documents.push(doc);
		}
	}

	// Also search for .bib files in workspace
	const bibFiles = await vscode.workspace.findFiles('**/*.bib', '**/node_modules/**');
	for (const uri of bibFiles) {
		try {
			const doc = await vscode.workspace.openTextDocument(uri);
			if (!documents.find(d => d.uri.toString() === doc.uri.toString())) {
				documents.push(doc);
			}
		} catch {
			// File might not be accessible
		}
	}

	return documents;
}

/**
 * Check citations across all documents
 */
async function checkCitations(): Promise<CitationCheckResult> {
	const result: CitationCheckResult = {
		undefinedCitations: [],
		unusedEntries: [],
		duplicateEntries: []
	};

	// Get all documents
	const latexDocs = await getAllLatexDocuments();
	const bibDocs = await getAllBibDocuments();

	// Extract all citations and entries
	const allCitations: CitationReference[] = [];
	const allEntries: BibEntry[] = [];

	for (const doc of latexDocs) {
		allCitations.push(...extractCitations(doc));
	}

	for (const doc of bibDocs) {
		allEntries.push(...extractBibEntries(doc));
	}

	// Build set of available entry keys
	const availableKeys = new Set<string>();
	const keyToEntry = new Map<string, BibEntry[]>();

	for (const entry of allEntries) {
		if (!keyToEntry.has(entry.key)) {
			keyToEntry.set(entry.key, []);
		}
		keyToEntry.get(entry.key)!.push(entry);
		availableKeys.add(entry.key);
	}

	// Find duplicate entries
	for (const [_key, entries] of keyToEntry) {
		if (entries.length > 1) {
			// All but the first are considered duplicates
			result.duplicateEntries.push(...entries.slice(1));
		}
	}

	// Build set of cited keys
	const citedKeys = new Set<string>();
	for (const citation of allCitations) {
		citedKeys.add(citation.key);
	}

	// Find undefined citations
	for (const citation of allCitations) {
		if (!availableKeys.has(citation.key)) {
			result.undefinedCitations.push(citation);
		}
	}

	// Find unused entries
	for (const entry of allEntries) {
		if (!citedKeys.has(entry.key)) {
			result.unusedEntries.push(entry);
		}
	}

	return result;
}

/**
 * Update diagnostics based on citation check results
 */
function updateDiagnostics(result: CitationCheckResult): void {
	citationDiagnostics.clear();

	const diagsByUri = new Map<string, vscode.Diagnostic[]>();

	// Add diagnostics for undefined citations
	for (const citation of result.undefinedCitations) {
		const uriStr = citation.uri.toString();
		if (!diagsByUri.has(uriStr)) {
			diagsByUri.set(uriStr, []);
		}

		const diag = new vscode.Diagnostic(
			citation.range,
			`Undefined citation: "${citation.key}"`,
			vscode.DiagnosticSeverity.Error
		);
		diag.source = 'LaTeX';
		diag.code = 'undefined-citation';
		diagsByUri.get(uriStr)!.push(diag);
	}

	// Add diagnostics for unused entries (as warnings)
	for (const entry of result.unusedEntries) {
		const uriStr = entry.uri.toString();
		if (!diagsByUri.has(uriStr)) {
			diagsByUri.set(uriStr, []);
		}

		const diag = new vscode.Diagnostic(
			entry.range,
			`Unused BibTeX entry: "${entry.key}"`,
			vscode.DiagnosticSeverity.Warning
		);
		diag.source = 'BibTeX';
		diag.code = 'unused-entry';
		diagsByUri.get(uriStr)!.push(diag);
	}

	// Add diagnostics for duplicate entries
	for (const entry of result.duplicateEntries) {
		const uriStr = entry.uri.toString();
		if (!diagsByUri.has(uriStr)) {
			diagsByUri.set(uriStr, []);
		}

		const diag = new vscode.Diagnostic(
			entry.range,
			`Duplicate BibTeX entry: "${entry.key}"`,
			vscode.DiagnosticSeverity.Warning
		);
		diag.source = 'BibTeX';
		diag.code = 'duplicate-entry';
		diagsByUri.get(uriStr)!.push(diag);
	}

	// Set diagnostics for each URI
	for (const [uriStr, diags] of diagsByUri) {
		citationDiagnostics.set(vscode.Uri.parse(uriStr), diags);
	}
}

/**
 * Command to check citations and show results
 */
async function checkCitationsCommand(): Promise<void> {
	const result = await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: 'Checking citations...',
		cancellable: false
	}, async () => {
		return await checkCitations();
	});

	// Update diagnostics
	updateDiagnostics(result);

	// Show summary
	const totalProblems = result.undefinedCitations.length +
		result.unusedEntries.length +
		result.duplicateEntries.length;

	if (totalProblems === 0) {
		vscode.window.showInformationMessage('No citation problems found!');
		return;
	}

	// Show quick pick with options
	const items: vscode.QuickPickItem[] = [];

	if (result.undefinedCitations.length > 0) {
		items.push({
			label: `$(error) ${result.undefinedCitations.length} undefined citation(s)`,
			description: 'Citations in .tex files that don\'t exist in any .bib file',
			detail: result.undefinedCitations.slice(0, 5).map(c => c.key).join(', ') +
				(result.undefinedCitations.length > 5 ? '...' : '')
		});
	}

	if (result.unusedEntries.length > 0) {
		items.push({
			label: `$(warning) ${result.unusedEntries.length} unused BibTeX entries`,
			description: 'Entries in .bib files that are never cited',
			detail: result.unusedEntries.slice(0, 5).map(e => e.key).join(', ') +
				(result.unusedEntries.length > 5 ? '...' : '')
		});
	}

	if (result.duplicateEntries.length > 0) {
		items.push({
			label: `$(warning) ${result.duplicateEntries.length} duplicate entries`,
			description: 'BibTeX keys that appear multiple times',
			detail: result.duplicateEntries.slice(0, 5).map(e => e.key).join(', ') +
				(result.duplicateEntries.length > 5 ? '...' : '')
		});
	}

	const selected = await vscode.window.showQuickPick(items, {
		title: `Citation Check: ${totalProblems} problem(s) found`,
		placeHolder: 'Select a category to see details'
	});

	if (selected) {
		// Open the Problems panel to show the diagnostics
		vscode.commands.executeCommand('workbench.actions.view.problems');
	}
}

/**
 * Command to show unused citations in a quick pick for easy navigation
 */
async function showUnusedCitationsCommand(): Promise<void> {
	const result = await checkCitations();

	if (result.unusedEntries.length === 0) {
		vscode.window.showInformationMessage('No unused BibTeX entries found.');
		return;
	}

	const items = result.unusedEntries.map(entry => ({
		label: entry.key,
		description: `@${entry.type}`,
		detail: entry.uri.path.split('/').pop(),
		entry
	}));

	const selected = await vscode.window.showQuickPick(items, {
		title: 'Unused BibTeX Entries',
		placeHolder: 'Select an entry to navigate to it'
	});

	if (selected) {
		const doc = await vscode.workspace.openTextDocument(selected.entry.uri);
		const editor = await vscode.window.showTextDocument(doc);
		editor.selection = new vscode.Selection(selected.entry.range.start, selected.entry.range.start);
		editor.revealRange(selected.entry.range, vscode.TextEditorRevealType.InCenter);
	}
}

/**
 * Invalidate cache for a document
 */
function invalidateCache(uri: vscode.Uri): void {
	const docId = uri.toString();
	citationCache.delete(docId);
	bibEntryCache.delete(docId);
}

/**
 * Trigger automatic citation check with debouncing
 */
function triggerAutoCheck(): void {
	if (!autoCheckEnabled) {
		return;
	}

	// Clear existing timer
	if (autoCheckTimer) {
		clearTimeout(autoCheckTimer);
	}

	// Set new timer (1 second debounce)
	autoCheckTimer = setTimeout(async () => {
		try {
			const result = await checkCitations();
			updateDiagnostics(result);
		} catch {
			// Silently fail - don't interrupt user workflow
		}
	}, 1000);
}

/**
 * Check if a document is relevant for citation checking
 */
function isRelevantDocument(document: vscode.TextDocument): boolean {
	const languageId = document.languageId;
	return languageId === 'latex' || languageId === 'bibtex';
}

/**
 * Update configuration from settings
 */
function updateConfiguration(): void {
	const config = vscode.workspace.getConfiguration('latex');
	autoCheckEnabled = config.get<boolean>('check.citations.automatic', true);
}

/**
 * Register citation checker commands and providers
 */
export function registerCitationChecker(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Add diagnostic collection to disposables
	disposables.push(citationDiagnostics);

	// Load initial configuration
	updateConfiguration();

	// Register commands
	disposables.push(
		vscode.commands.registerCommand('latex.checkCitations', checkCitationsCommand)
	);

	disposables.push(
		vscode.commands.registerCommand('latex.showUnusedCitations', showUnusedCitationsCommand)
	);

	// Listen for configuration changes
	disposables.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('latex.check.citations.automatic')) {
				updateConfiguration();
				if (autoCheckEnabled) {
					triggerAutoCheck();
				}
			}
		})
	);

	// Listen for document changes (invalidate cache and trigger check)
	disposables.push(
		vscode.workspace.onDidChangeTextDocument(e => {
			if (isRelevantDocument(e.document)) {
				invalidateCache(e.document.uri);
				triggerAutoCheck();
			}
		})
	);

	// Listen for document open (trigger check)
	disposables.push(
		vscode.workspace.onDidOpenTextDocument(document => {
			if (isRelevantDocument(document)) {
				triggerAutoCheck();
			}
		})
	);

	// Listen for document close (clear diagnostics for that file)
	disposables.push(
		vscode.workspace.onDidCloseTextDocument(document => {
			if (isRelevantDocument(document)) {
				invalidateCache(document.uri);
				// Re-check without the closed file
				triggerAutoCheck();
			}
		})
	);

	// Initial check on activation if there are open LaTeX/BibTeX files
	const hasRelevantOpenDocs = vscode.workspace.textDocuments.some(isRelevantDocument);
	if (hasRelevantOpenDocs && autoCheckEnabled) {
		triggerAutoCheck();
	}

	return disposables;
}

