/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Label reference with its location
 */
interface LabelReference {
	label: string;
	uri: vscode.Uri;
	range: vscode.Range;
}

/**
 * Regex patterns for finding labels in LaTeX documents
 */
const LABEL_PATTERN = /\\label\{([^}]+)\}/g;

/**
 * Diagnostic collection for duplicate labels
 */
const duplicatedLabelsDiagnostics = vscode.languages.createDiagnosticCollection('Duplicate Labels');

/**
 * Cache of labels per document
 */
const labelCache = new Map<string, LabelReference[]>();

/**
 * Extract all labels from a document
 */
function extractLabels(document: vscode.TextDocument): LabelReference[] {
	const labels: LabelReference[] = [];
	const text = document.getText();
	let match: RegExpExecArray | null;

	// Reset regex state
	LABEL_PATTERN.lastIndex = 0;

	while ((match = LABEL_PATTERN.exec(text)) !== null) {
		const label = match[1];
		const startPos = document.positionAt(match.index);
		const endPos = document.positionAt(match.index + match[0].length);
		const range = new vscode.Range(startPos, endPos);

		labels.push({
			label,
			uri: document.uri,
			range
		});
	}

	return labels;
}

/**
 * Find all duplicate labels across open LaTeX documents
 */
function findDuplicateLabels(): Map<string, LabelReference[]> {
	const allLabels = new Map<string, LabelReference[]>();

	// Collect labels from cache
	for (const [_docId, labels] of labelCache) {
		for (const labelRef of labels) {
			const existing = allLabels.get(labelRef.label) || [];
			existing.push(labelRef);
			allLabels.set(labelRef.label, existing);
		}
	}

	// Filter to only duplicates
	const duplicates = new Map<string, LabelReference[]>();
	for (const [label, refs] of allLabels) {
		if (refs.length > 1) {
			duplicates.set(label, refs);
		}
	}

	return duplicates;
}

/**
 * Update diagnostics for duplicate labels
 */
function updateDiagnostics(): void {
	const config = vscode.workspace.getConfiguration('latex');
	if (!config.get<boolean>('check.duplicatedLabels.enabled', true)) {
		duplicatedLabelsDiagnostics.clear();
		return;
	}

	const duplicates = findDuplicateLabels();

	// Clear old diagnostics
	duplicatedLabelsDiagnostics.clear();

	if (duplicates.size === 0) {
		return;
	}

	// Group diagnostics by document
	const diagsByDoc = new Map<string, vscode.Diagnostic[]>();

	for (const [label, refs] of duplicates) {
		for (const ref of refs) {
			const docId = ref.uri.toString();
			const diags = diagsByDoc.get(docId) || [];

			const diagnostic = new vscode.Diagnostic(
				ref.range,
				`Duplicate label: ${label}`,
				vscode.DiagnosticSeverity.Warning
			);
			diagnostic.source = 'LaTeX';
			diagnostic.code = 'duplicate-label';

			// Add related information pointing to other occurrences
			const relatedInfo: vscode.DiagnosticRelatedInformation[] = [];
			for (const otherRef of refs) {
				if (otherRef !== ref) {
					relatedInfo.push(new vscode.DiagnosticRelatedInformation(
						new vscode.Location(otherRef.uri, otherRef.range),
						`Also defined here`
					));
				}
			}
			diagnostic.relatedInformation = relatedInfo;

			diags.push(diagnostic);
			diagsByDoc.set(docId, diags);
		}
	}

	// Set diagnostics for each document
	for (const [docId, diags] of diagsByDoc) {
		const uri = vscode.Uri.parse(docId);
		duplicatedLabelsDiagnostics.set(uri, diags);
	}
}

/**
 * Update cache for a document and refresh diagnostics
 */
function updateDocumentCache(document: vscode.TextDocument): void {
	if (document.languageId !== 'latex' && document.languageId !== 'tex') {
		return;
	}

	const docId = document.uri.toString();
	const labels = extractLabels(document);
	labelCache.set(docId, labels);

	updateDiagnostics();
}

/**
 * Remove document from cache
 */
function removeDocumentFromCache(document: vscode.TextDocument): void {
	const docId = document.uri.toString();
	labelCache.delete(docId);
	updateDiagnostics();
}

/**
 * Initialize cache from all open documents
 */
function initializeCache(): void {
	for (const document of vscode.workspace.textDocuments) {
		if (document.languageId === 'latex' || document.languageId === 'tex') {
			const docId = document.uri.toString();
			const labels = extractLabels(document);
			labelCache.set(docId, labels);
		}
	}
	updateDiagnostics();
}

/**
 * Register the duplicate label detector
 */
export function registerDuplicateLabelDetector(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Initialize cache on activation
	initializeCache();

	// Update on document open
	disposables.push(
		vscode.workspace.onDidOpenTextDocument(doc => {
			updateDocumentCache(doc);
		})
	);

	// Update on document change
	disposables.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			updateDocumentCache(event.document);
		})
	);

	// Remove from cache on document close
	disposables.push(
		vscode.workspace.onDidCloseTextDocument(doc => {
			removeDocumentFromCache(doc);
		})
	);

	// Re-initialize when configuration changes
	disposables.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('latex.check.duplicatedLabels.enabled')) {
				updateDiagnostics();
			}
		})
	);

	// Add diagnostic collection to disposables
	disposables.push(duplicatedLabelsDiagnostics);

	// Register command to manually check for duplicates
	disposables.push(
		vscode.commands.registerCommand('latex.checkDuplicateLabels', () => {
			initializeCache();
			const duplicates = findDuplicateLabels();
			if (duplicates.size === 0) {
				vscode.window.showInformationMessage('No duplicate labels found.');
			} else {
				const count = Array.from(duplicates.values()).reduce((sum, refs) => sum + refs.length, 0);
				vscode.window.showWarningMessage(`Found ${duplicates.size} duplicate label(s) with ${count} total occurrences.`);
			}
		})
	);

	return disposables;
}
