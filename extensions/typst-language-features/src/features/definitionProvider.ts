/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { queryDocument, isWasmLoaded } from '../wasm';

/**
 * Provides "Go to Definition" functionality for Typst documents.
 * 
 * Uses a hybrid approach:
 * - Labels/references: Uses Typst's introspection query API (same as tinymist)
 * - Variables/functions: Uses regex-based parsing (quick win, can upgrade later)
 * - Imports: Uses file path resolution
 */
export class TypstDefinitionProvider implements vscode.DefinitionProvider {

	async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): Promise<vscode.DefinitionLink[] | undefined> {
		const line = document.lineAt(position.line);
		const lineText = line.text;
		const offset = document.offsetAt(position);

		// Check if we're on a label reference (@label)
		const labelRefMatch = this.findLabelReference(lineText, position.character);
		if (labelRefMatch) {
			const labelName = labelRefMatch[1];
			const lineStart = document.offsetAt(new vscode.Position(position.line, 0));
			const matchOffset = lineStart + labelRefMatch.index!;
			return await this.findLabelDefinition(document, labelName, matchOffset, labelRefMatch);
		}

		// Check if we're on a label definition (<label>)
		const labelDefMatch = this.findLabelDefinitionAtPosition(lineText, position.character);
		if (labelDefMatch) {
			// For label definitions, return the definition itself
			const labelStart = document.offsetAt(new vscode.Position(position.line, labelDefMatch.index!));
			const labelEnd = labelStart + labelDefMatch[0].length;
			const range = new vscode.Range(
				document.positionAt(labelStart),
				document.positionAt(labelEnd)
			);
			return [{
				targetUri: document.uri,
				targetRange: range,
				targetSelectionRange: range,
				originSelectionRange: range
			}];
		}

		// Check if we're on a variable or function name
		const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z][\w-]*/);
		if (wordRange) {
			const word = document.getText(wordRange);
			const definition = this.findVariableOrFunctionDefinition(document, word, wordRange);
			if (definition) {
				return [definition];
			}
		}

		// Check if we're on an import/include path
		const importMatch = this.findImportPath(lineText, position.character);
		if (importMatch) {
			const filePath = importMatch[1];
			const targetUri = await this.resolveImportPath(document, filePath);
			if (targetUri) {
				const importStart = document.offsetAt(new vscode.Position(position.line, importMatch.index!));
				const importEnd = importStart + importMatch[0].length;
				const originRange = new vscode.Range(
					document.positionAt(importStart),
					document.positionAt(importEnd)
				);
				return [{
					targetUri: targetUri,
					targetRange: new vscode.Range(0, 0, 0, 0),
					targetSelectionRange: new vscode.Range(0, 0, 0, 0),
					originSelectionRange: originRange
				}];
			}
		}

		return undefined;
	}

	/**
	 * Find label reference pattern: @label
	 */
	private findLabelReference(lineText: string, character: number): RegExpMatchArray | null {
		// Match @label pattern, ensuring we're on the label name part
		const labelRefPattern = /@([a-zA-Z][\w-]*)/g;
		let match: RegExpMatchArray | null;
		while ((match = labelRefPattern.exec(lineText)) !== null) {
			const start = match.index! + 1; // +1 to skip @
			const end = start + match[1].length;
			if (character >= start && character <= end) {
				return match;
			}
		}
		return null;
	}

	/**
	 * Find label definition pattern: <label>
	 */
	private findLabelDefinitionAtPosition(lineText: string, character: number): RegExpMatchArray | null {
		const labelDefPattern = /<([a-zA-Z][\w-]*)>/g;
		let match: RegExpMatchArray | null;
		while ((match = labelDefPattern.exec(lineText)) !== null) {
			if (character >= match.index! && character <= match.index! + match[0].length) {
				return match;
			}
		}
		return null;
	}

	/**
	 * Find label definition using Typst's introspection query API
	 */
	private async findLabelDefinition(
		document: vscode.TextDocument,
		labelName: string,
		offset: number,
		match: RegExpMatchArray
	): Promise<vscode.DefinitionLink[] | undefined> {
		// Try using Typst's query API first (more accurate)
		if (isWasmLoaded()) {
			try {
				// Use Typst's label selector: label(<name>)
				const selector = `label(<${labelName}>)`;
				const result = await queryDocument<Array<{ span?: { id?: number; start?: number; end?: number } }>>(
					document.getText(),
					selector
				);

				if (result && Array.isArray(result) && result.length > 0) {
					// The query returns elements with spans, but we need to parse them
					// For now, fall back to regex if query doesn't give us location info
					// TODO: Parse span information from query result when Typst query API provides it
				}
			} catch (error) {
				console.warn('[TypstDefinitionProvider] Query failed, falling back to regex:', error);
			}
		}

		// Fallback to regex-based search
		const text = document.getText();
		const labelDefPattern = new RegExp(`<${this.escapeRegex(labelName)}>`, 'g');
		let defMatch: RegExpMatchArray | null;
		while ((defMatch = labelDefPattern.exec(text)) !== null) {
			const defOffset = defMatch.index!;
			const defStart = document.positionAt(defOffset);
			const defEnd = document.positionAt(defOffset + defMatch[0].length);
			const defRange = new vscode.Range(defStart, defEnd);

			// Origin range (the reference @label)
			const line = document.positionAt(offset).line;
			const lineStart = document.offsetAt(new vscode.Position(line, 0));
			const matchOffset = lineStart + match.index!;
			const originStart = document.positionAt(matchOffset);
			const originEnd = document.positionAt(matchOffset + match[0].length);
			const originRange = new vscode.Range(originStart, originEnd);

			return [{
				targetUri: document.uri,
				targetRange: defRange,
				targetSelectionRange: defRange,
				originSelectionRange: originRange
			}];
		}

		return undefined;
	}

	/**
	 * Find variable or function definition using regex
	 * Searches backwards from the current position to find the definition
	 */
	private findVariableOrFunctionDefinition(
		document: vscode.TextDocument,
		name: string,
		wordRange: vscode.Range
	): vscode.DefinitionLink | undefined {
		const text = document.getText();
		const wordOffset = document.offsetAt(wordRange.start);

		// Pattern for function: #let name(...) =
		const funcPattern = new RegExp(`#let\\s+${this.escapeRegex(name)}\\s*\\([^)]*\\)\\s*=`, 'g');
		// Pattern for variable: #let name = (but not function)
		const varPattern = new RegExp(`#let\\s+${this.escapeRegex(name)}\\s*=(?!\\s*\\()`, 'g');

		// Collect all matches first, then find the closest one before the current position
		const funcMatches: Array<{ offset: number; match: RegExpMatchArray }> = [];
		const varMatches: Array<{ offset: number; match: RegExpMatchArray }> = [];

		let match: RegExpMatchArray | null;
		while ((match = funcPattern.exec(text)) !== null) {
			funcMatches.push({ offset: match.index!, match });
		}

		while ((match = varPattern.exec(text)) !== null) {
			varMatches.push({ offset: match.index!, match });
		}

		// Find the closest definition before the current position
		// Prefer functions over variables if both exist
		const allMatches = [
			...funcMatches.map(m => ({ ...m, isFunc: true })),
			...varMatches.map(m => ({ ...m, isFunc: false }))
		].filter(m => m.offset < wordOffset)
			.sort((a, b) => b.offset - a.offset); // Sort descending (closest first)

		if (allMatches.length === 0) {
			return undefined;
		}

		// Use the closest match (last definition before current position)
		const bestMatch = allMatches[0];
		const defOffset = bestMatch.offset;
		const matchText = bestMatch.match[0];

		const defStart = document.positionAt(defOffset);
		const defEnd = document.positionAt(defOffset + matchText.length);
		const defRange = new vscode.Range(defStart, defEnd);

		// Find the name position in the definition
		const nameInDef = matchText.indexOf(name);
		const nameStart = document.positionAt(defOffset + nameInDef);
		const nameEnd = document.positionAt(defOffset + nameInDef + name.length);
		const nameRange = new vscode.Range(nameStart, nameEnd);

		return {
			targetUri: document.uri,
			targetRange: defRange,
			targetSelectionRange: nameRange,
			originSelectionRange: wordRange
		};
	}

	/**
	 * Find import/include path at position
	 */
	private findImportPath(lineText: string, character: number): RegExpMatchArray | null {
		// Match #import "path" or #include "path"
		const importPattern = /#(?:import|include)\s*\(?\s*["']([^"']+)["']\s*\)?/g;
		let match: RegExpMatchArray | null;
		while ((match = importPattern.exec(lineText)) !== null) {
			const pathStart = match.index! + match[0].indexOf(match[1]);
			const pathEnd = pathStart + match[1].length;
			if (character >= pathStart && character <= pathEnd) {
				return match;
			}
		}
		return null;
	}

	/**
	 * Resolve import/include path to a file URI
	 */
	private async resolveImportPath(
		document: vscode.TextDocument,
		filePath: string
	): Promise<vscode.Uri | undefined> {
		const documentDir = vscode.Uri.joinPath(document.uri, '..');

		// Try with .typ extension if not present
		let targetPath = filePath;
		if (!targetPath.endsWith('.typ')) {
			targetPath = targetPath + '.typ';
		}

		const targetUri = vscode.Uri.joinPath(documentDir, targetPath);

		try {
			// Check if file exists
			await vscode.workspace.fs.stat(targetUri);
			return targetUri;
		} catch {
			// File doesn't exist, return undefined
			return undefined;
		}
	}

	/**
	 * Escape special regex characters
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}

