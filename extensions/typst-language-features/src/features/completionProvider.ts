/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Provides completion items for Typst documents.
 *
 * Features:
 * - Code completions (functions, keywords) after #
 * - Math completions (greek letters, symbols) inside $ $
 * - Label reference completion after @
 * - Citation completion after @ (when bibliography exists)
 * - File path completion inside #include(), #image(), #bibliography()
 */
export class TypstCompletionProvider implements vscode.CompletionItemProvider {

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
		_context: vscode.CompletionContext
	): Promise<vscode.CompletionItem[]> {
		const line = document.lineAt(position.line).text;
		const prefix = line.substring(0, position.character);

		// Check context and provide appropriate completions
		if (prefix.endsWith('#')) {
			return this.getCodeCompletions();
		}

		if (prefix.match(/\$[^$]*$/)) {
			return this.getMathCompletions();
		}

		// Check for @ reference (labels and citations)
		const refMatch = prefix.match(/@([\w:-]*)$/);
		if (refMatch) {
			const partialRef = refMatch[1];
			return await this.getReferenceCompletions(document, partialRef);
		}

		// Check for file path completion inside #include(), #image(), #bibliography()
		const filePathContext = this.getFilePathContext(prefix);
		if (filePathContext) {
			return await this.getFilePathCompletions(document, filePathContext.partial, filePathContext.type);
		}

		return [];
	}

	/**
	 * Check if cursor is inside a file path string for include/image/bibliography
	 */
	private getFilePathContext(prefix: string): { partial: string; type: 'include' | 'image' | 'bibliography' } | null {
		// Match #include("partial or include("partial
		const includeMatch = prefix.match(/#?include\s*\(\s*["']([^"']*)$/);
		if (includeMatch) {
			return { partial: includeMatch[1], type: 'include' };
		}

		// Match #image("partial or image("partial
		const imageMatch = prefix.match(/#?image\s*\(\s*["']([^"']*)$/);
		if (imageMatch) {
			return { partial: imageMatch[1], type: 'image' };
		}

		// Match #bibliography("partial or bibliography("partial
		const bibMatch = prefix.match(/#?bibliography\s*\(\s*["']([^"']*)$/);
		if (bibMatch) {
			return { partial: bibMatch[1], type: 'bibliography' };
		}

		return null;
	}

	/**
	 * Get completions for @ references (labels and citations)
	 */
	private async getReferenceCompletions(document: vscode.TextDocument, partial: string): Promise<vscode.CompletionItem[]> {
		const items: vscode.CompletionItem[] = [];
		const text = document.getText();

		// 1. Get label definitions from the document
		const labels = this.extractLabels(text);
		for (const label of labels) {
			if (label.name.startsWith(partial)) {
				const item = new vscode.CompletionItem(label.name, vscode.CompletionItemKind.Reference);
				item.detail = `Label: ${label.context || label.name}`;
				item.documentation = label.context ? new vscode.MarkdownString(`Reference to: ${label.context}`) : undefined;
				item.sortText = `0_${label.name}`; // Labels first
				items.push(item);
			}
		}

		// 2. Get citations from bibliography files
		const bibliographyPath = this.extractBibliographyPath(text);
		if (bibliographyPath) {
			const citations = await this.loadBibliographyCitations(document, bibliographyPath);
			for (const citation of citations) {
				if (citation.key.startsWith(partial)) {
					const item = new vscode.CompletionItem(citation.key, vscode.CompletionItemKind.Value);
					item.detail = `Citation: ${citation.title || citation.key}`;
					if (citation.author || citation.year) {
						const docParts: string[] = [];
						if (citation.author) {
							docParts.push(`**Author:** ${citation.author}`);
						}
						if (citation.year) {
							docParts.push(`**Year:** ${citation.year}`);
						}
						if (citation.title) {
							docParts.push(`**Title:** ${citation.title}`);
						}
						item.documentation = new vscode.MarkdownString(docParts.join('\n\n'));
					}
					item.sortText = `1_${citation.key}`; // Citations after labels
					items.push(item);
				}
			}
		}

		return items;
	}

	/**
	 * Extract labels from document text
	 * Matches: <label-name> pattern
	 */
	private extractLabels(text: string): Array<{ name: string; context?: string }> {
		const labels: Array<{ name: string; context?: string }> = [];
		const lines = text.split('\n');

		// Pattern for label definitions: <label-name>
		const labelPattern = /<([\w:-]+)>/g;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			let match: RegExpExecArray | null;

			while ((match = labelPattern.exec(line)) !== null) {
				const labelName = match[1];

				// Get context: check previous line for heading or figure
				let context: string | undefined;

				// Check if on same line as heading
				const headingMatch = line.match(/^(=+)\s+(.+?)(?:\s*<[\w:-]+>)?$/);
				if (headingMatch) {
					const level = headingMatch[1].length;
					context = `${'='.repeat(level)} ${headingMatch[2]}`;
				}

				// Check if this is inside a figure or equation
				if (!context && i > 0) {
					const prevLine = lines[i - 1];
					if (prevLine.match(/\$[^$]+\$/)) {
						context = 'Equation';
					} else if (prevLine.match(/#figure/)) {
						context = 'Figure';
					} else if (prevLine.match(/#table/)) {
						context = 'Table';
					}
				}

				// Check for equation label patterns like $ ... $ <eq:name>
				const eqMatch = line.match(/\$[^$]+\$\s*<[\w:-]+>/);
				if (eqMatch) {
					context = 'Equation';
				}

				labels.push({ name: labelName, context });
			}
		}

		return labels;
	}

	/**
	 * Extract bibliography file path from document
	 */
	private extractBibliographyPath(text: string): string | null {
		const bibMatch = text.match(/#?bibliography\s*\(\s*["']([^"']+)["']/);
		return bibMatch ? bibMatch[1] : null;
	}

	/**
	 * Load citations from a bibliography file (.bib, .yaml, .yml, .json)
	 */
	private async loadBibliographyCitations(
		document: vscode.TextDocument,
		bibPath: string
	): Promise<Array<{ key: string; title?: string; author?: string; year?: string }>> {
		const citations: Array<{ key: string; title?: string; author?: string; year?: string }> = [];

		try {
			const documentDir = vscode.Uri.joinPath(document.uri, '..');
			const bibUri = vscode.Uri.joinPath(documentDir, bibPath);

			const bibContent = await vscode.workspace.fs.readFile(bibUri);
			const bibText = new TextDecoder().decode(bibContent);

			// Determine format by extension
			if (bibPath.endsWith('.bib')) {
				return this.parseBibTeX(bibText);
			} else if (bibPath.endsWith('.yaml') || bibPath.endsWith('.yml')) {
				return this.parseYamlBib(bibText);
			} else if (bibPath.endsWith('.json')) {
				return this.parseJsonBib(bibText);
			}
		} catch (error) {
			console.warn('[TypstCompletionProvider] Failed to load bibliography:', error);
		}

		return citations;
	}

	/**
	 * Parse BibTeX format (.bib files)
	 */
	private parseBibTeX(text: string): Array<{ key: string; title?: string; author?: string; year?: string }> {
		const citations: Array<{ key: string; title?: string; author?: string; year?: string }> = [];

		// Match @type{key, ... }
		const entryPattern = /@\w+\s*\{\s*([\w:-]+)\s*,([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
		let match: RegExpExecArray | null;

		while ((match = entryPattern.exec(text)) !== null) {
			const key = match[1];
			const content = match[2];

			const citation: { key: string; title?: string; author?: string; year?: string } = { key };

			// Extract fields
			const titleMatch = content.match(/title\s*=\s*\{([^}]+)\}/i);
			if (titleMatch) {
				citation.title = titleMatch[1].trim();
			}

			const authorMatch = content.match(/author\s*=\s*\{([^}]+)\}/i);
			if (authorMatch) {
				citation.author = authorMatch[1].trim();
			}

			const yearMatch = content.match(/year\s*=\s*\{?(\d{4})\}?/i);
			if (yearMatch) {
				citation.year = yearMatch[1];
			}

			citations.push(citation);
		}

		return citations;
	}

	/**
	 * Parse YAML bibliography format
	 */
	private parseYamlBib(text: string): Array<{ key: string; title?: string; author?: string; year?: string }> {
		const citations: Array<{ key: string; title?: string; author?: string; year?: string }> = [];

		// Simple YAML parsing - entries start with "- id:" or "key:"
		const lines = text.split('\n');
		let currentEntry: { key: string; title?: string; author?: string; year?: string } | null = null;

		for (const line of lines) {
			// Check for new entry
			const idMatch = line.match(/^-?\s*id:\s*(.+)$/);
			if (idMatch) {
				if (currentEntry) {
					citations.push(currentEntry);
				}
				currentEntry = { key: idMatch[1].trim() };
				continue;
			}

			if (currentEntry) {
				const titleMatch = line.match(/^\s*title:\s*(.+)$/);
				if (titleMatch) {
					currentEntry.title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
				}

				const authorMatch = line.match(/^\s*author:\s*(.+)$/);
				if (authorMatch) {
					currentEntry.author = authorMatch[1].trim().replace(/^["']|["']$/g, '');
				}

				const yearMatch = line.match(/^\s*(?:year|issued|date):\s*(\d{4})/);
				if (yearMatch) {
					currentEntry.year = yearMatch[1];
				}
			}
		}

		if (currentEntry) {
			citations.push(currentEntry);
		}

		return citations;
	}

	/**
	 * Parse JSON bibliography format (CSL-JSON)
	 */
	private parseJsonBib(text: string): Array<{ key: string; title?: string; author?: string; year?: string }> {
		const citations: Array<{ key: string; title?: string; author?: string; year?: string }> = [];

		try {
			const data = JSON.parse(text);
			const entries = Array.isArray(data) ? data : [data];

			for (const entry of entries) {
				if (entry.id) {
					const citation: { key: string; title?: string; author?: string; year?: string } = {
						key: entry.id
					};

					if (entry.title) {
						citation.title = entry.title;
					}

					if (entry.author && Array.isArray(entry.author)) {
						const authors = entry.author.map((a: { family?: string; given?: string }) =>
							a.family ? (a.given ? `${a.given} ${a.family}` : a.family) : ''
						).filter(Boolean);
						if (authors.length > 0) {
							citation.author = authors.join(', ');
						}
					}

					if (entry.issued && entry.issued['date-parts']) {
						const year = entry.issued['date-parts'][0]?.[0];
						if (year) {
							citation.year = String(year);
						}
					}

					citations.push(citation);
				}
			}
		} catch {
			console.warn('[TypstCompletionProvider] Failed to parse JSON bibliography');
		}

		return citations;
	}

	/**
	 * Get file path completions for include/image/bibliography
	 */
	private async getFilePathCompletions(
		document: vscode.TextDocument,
		partial: string,
		type: 'include' | 'image' | 'bibliography'
	): Promise<vscode.CompletionItem[]> {
		const items: vscode.CompletionItem[] = [];

		try {
			const documentDir = vscode.Uri.joinPath(document.uri, '..');

			// Determine the directory to list
			let searchDir = documentDir;
			let pathPrefix = '';

			if (partial.includes('/')) {
				const lastSlash = partial.lastIndexOf('/');
				pathPrefix = partial.substring(0, lastSlash + 1);
				searchDir = vscode.Uri.joinPath(documentDir, pathPrefix);
			}

			const entries = await vscode.workspace.fs.readDirectory(searchDir);

			// Define allowed extensions by type
			const allowedExtensions: Record<string, string[]> = {
				include: ['.typ'],
				image: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.webp'],
				bibliography: ['.bib', '.yaml', '.yml', '.json']
			};

			const extensions = allowedExtensions[type];
			const partialName = partial.substring(partial.lastIndexOf('/') + 1).toLowerCase();

			for (const [name, fileType] of entries) {
				// For directories, allow navigation
				if (fileType === vscode.FileType.Directory) {
					if (name.toLowerCase().startsWith(partialName) && !name.startsWith('.')) {
						const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Folder);
						item.insertText = pathPrefix + name + '/';
						item.command = {
							command: 'editor.action.triggerSuggest',
							title: 'Re-trigger completions'
						};
						items.push(item);
					}
				}
				// For files, filter by extension
				else if (fileType === vscode.FileType.File) {
					const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
					if (extensions.includes(ext) && name.toLowerCase().startsWith(partialName)) {
						const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.File);
						item.insertText = pathPrefix + name;
						item.detail = this.getFileTypeDetail(ext);
						items.push(item);
					}
				}
			}
		} catch (error) {
			console.warn('[TypstCompletionProvider] Failed to list files:', error);
		}

		return items;
	}

	/**
	 * Get detail description for file type
	 */
	private getFileTypeDetail(ext: string): string {
		const details: Record<string, string> = {
			'.typ': 'Typst file',
			'.png': 'PNG image',
			'.jpg': 'JPEG image',
			'.jpeg': 'JPEG image',
			'.gif': 'GIF image',
			'.svg': 'SVG image',
			'.pdf': 'PDF file',
			'.webp': 'WebP image',
			'.bib': 'BibTeX bibliography',
			'.yaml': 'YAML bibliography',
			'.yml': 'YAML bibliography',
			'.json': 'JSON bibliography (CSL)'
		};
		return details[ext] || 'File';
	}

	private getCodeCompletions(): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];

		// Keywords
		const keywords = [
			{ label: 'set', snippet: 'set $1($2)', detail: 'Set element properties' },
			{ label: 'show', snippet: 'show $1: $2', detail: 'Transform elements' },
			{ label: 'let', snippet: 'let $1 = $2', detail: 'Define variable' },
			{ label: 'if', snippet: 'if $1 {\n\t$2\n}', detail: 'Conditional' },
			{ label: 'else', snippet: 'else {\n\t$1\n}', detail: 'Else branch' },
			{ label: 'for', snippet: 'for $1 in $2 {\n\t$3\n}', detail: 'For loop' },
			{ label: 'while', snippet: 'while $1 {\n\t$2\n}', detail: 'While loop' },
			{ label: 'import', snippet: 'import "$1"', detail: 'Import module' },
			{ label: 'include', snippet: 'include "$1"', detail: 'Include file' },
			{ label: 'return', snippet: 'return $1', detail: 'Return value' },
			{ label: 'break', snippet: 'break', detail: 'Break loop' },
			{ label: 'continue', snippet: 'continue', detail: 'Continue loop' },
		];

		for (const kw of keywords) {
			const item = new vscode.CompletionItem(kw.label, vscode.CompletionItemKind.Keyword);
			item.insertText = new vscode.SnippetString(kw.snippet);
			item.detail = kw.detail;
			items.push(item);
		}

		// Functions
		const functions = [
			{ label: 'heading', snippet: 'heading(level: ${1:1})[$2]', detail: 'Create heading' },
			{ label: 'text', snippet: 'text($1)[$2]', detail: 'Style text' },
			{ label: 'emph', snippet: 'emph[$1]', detail: 'Emphasize' },
			{ label: 'strong', snippet: 'strong[$1]', detail: 'Bold text' },
			{ label: 'link', snippet: 'link("$1")[$2]', detail: 'Hyperlink' },
			{ label: 'image', snippet: 'image("$1", width: ${2:100%})', detail: 'Include image' },
			{ label: 'figure', snippet: 'figure(\n\t$1,\n\tcaption: [$2],\n)', detail: 'Figure with caption' },
			{ label: 'table', snippet: 'table(\n\tcolumns: ${1:2},\n\t$2\n)', detail: 'Create table' },
			{ label: 'grid', snippet: 'grid(\n\tcolumns: ${1:(1fr, 1fr)},\n\t$2\n)', detail: 'Grid layout' },
			{ label: 'align', snippet: 'align(${1:center})[$2]', detail: 'Align content' },
			{ label: 'block', snippet: 'block($1)[$2]', detail: 'Block element' },
			{ label: 'box', snippet: 'box($1)[$2]', detail: 'Inline box' },
			{ label: 'stack', snippet: 'stack(dir: ${1:ttb}, $2)', detail: 'Stack elements' },
			{ label: 'v', snippet: 'v(${1:1em})', detail: 'Vertical space' },
			{ label: 'h', snippet: 'h(${1:1em})', detail: 'Horizontal space' },
			{ label: 'pagebreak', snippet: 'pagebreak()', detail: 'Page break' },
			{ label: 'lorem', snippet: 'lorem(${1:50})', detail: 'Placeholder text' },
			{ label: 'cite', snippet: 'cite(<$1>)', detail: 'Citation' },
			{ label: 'bibliography', snippet: 'bibliography("$1")', detail: 'Bibliography' },
			{ label: 'footnote', snippet: 'footnote[$1]', detail: 'Footnote' },
			{ label: 'raw', snippet: 'raw("$1", lang: "$2")', detail: 'Code/raw text' },
			{ label: 'enum', snippet: 'enum(\n\t[$1],\n\t[$2],\n)', detail: 'Numbered list' },
			{ label: 'list', snippet: 'list(\n\t[$1],\n\t[$2],\n)', detail: 'Bullet list' },
			{ label: 'terms', snippet: 'terms(\n\t[$1]: [$2],\n)', detail: 'Term list' },
			{ label: 'rect', snippet: 'rect($1)[$2]', detail: 'Rectangle' },
			{ label: 'circle', snippet: 'circle($1)[$2]', detail: 'Circle' },
			{ label: 'ellipse', snippet: 'ellipse($1)[$2]', detail: 'Ellipse' },
			{ label: 'line', snippet: 'line(start: $1, end: $2)', detail: 'Line' },
			{ label: 'path', snippet: 'path($1)', detail: 'Path' },
			{ label: 'polygon', snippet: 'polygon($1)', detail: 'Polygon' },
			{ label: 'place', snippet: 'place(${1:top + right})[$2]', detail: 'Place element' },
			{ label: 'rotate', snippet: 'rotate(${1:45deg})[$2]', detail: 'Rotate' },
			{ label: 'scale', snippet: 'scale(${1:50%})[$2]', detail: 'Scale' },
			{ label: 'move', snippet: 'move(dx: $1, dy: $2)[$3]', detail: 'Move element' },
			{ label: 'pad', snippet: 'pad($1)[$2]', detail: 'Padding' },
			{ label: 'repeat', snippet: 'repeat[$1]', detail: 'Repeat content' },
			{ label: 'hide', snippet: 'hide[$1]', detail: 'Hide content' },
			{ label: 'strike', snippet: 'strike[$1]', detail: 'Strikethrough' },
			{ label: 'underline', snippet: 'underline[$1]', detail: 'Underline' },
			{ label: 'overline', snippet: 'overline[$1]', detail: 'Overline' },
			{ label: 'highlight', snippet: 'highlight[$1]', detail: 'Highlight' },
			{ label: 'smallcaps', snippet: 'smallcaps[$1]', detail: 'Small caps' },
			{ label: 'sub', snippet: 'sub[$1]', detail: 'Subscript' },
			{ label: 'super', snippet: 'super[$1]', detail: 'Superscript' },
			{ label: 'upper', snippet: 'upper[$1]', detail: 'Uppercase' },
			{ label: 'lower', snippet: 'lower[$1]', detail: 'Lowercase' },
			{ label: 'range', snippet: 'range(${1:10})', detail: 'Number range' },
			{ label: 'counter', snippet: 'counter(${1:heading})', detail: 'Counter' },
			{ label: 'state', snippet: 'state("$1", ${2:0})', detail: 'State variable' },
			{ label: 'locate', snippet: 'locate(loc => $1)', detail: 'Locate position' },
			{ label: 'query', snippet: 'query(${1:heading}, loc)', detail: 'Query elements' },
			{ label: 'document', snippet: 'document($1)', detail: 'Document metadata' },
			{ label: 'page', snippet: 'page($1)', detail: 'Page settings' },
			{ label: 'par', snippet: 'par[$1]', detail: 'Paragraph' },
		];

		for (const fn of functions) {
			const item = new vscode.CompletionItem(fn.label, vscode.CompletionItemKind.Function);
			item.insertText = new vscode.SnippetString(fn.snippet);
			item.detail = fn.detail;
			items.push(item);
		}

		return items;
	}

	private getMathCompletions(): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];

		// Greek letters
		const greekLetters = [
			'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
			'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi',
			'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
			'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
			'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi',
			'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega',
		];

		for (const letter of greekLetters) {
			const item = new vscode.CompletionItem(letter, vscode.CompletionItemKind.Constant);
			item.detail = 'Greek letter';
			items.push(item);
		}

		// Math functions
		const mathFunctions = [
			{ label: 'frac', snippet: 'frac($1, $2)', detail: 'Fraction' },
			{ label: 'sqrt', snippet: 'sqrt($1)', detail: 'Square root' },
			{ label: 'root', snippet: 'root($1, $2)', detail: 'nth root' },
			{ label: 'sum', snippet: 'sum', detail: 'Summation' },
			{ label: 'prod', snippet: 'prod', detail: 'Product' },
			{ label: 'integral', snippet: 'integral', detail: 'Integral' },
			{ label: 'lim', snippet: 'lim', detail: 'Limit' },
			{ label: 'sin', snippet: 'sin', detail: 'Sine' },
			{ label: 'cos', snippet: 'cos', detail: 'Cosine' },
			{ label: 'tan', snippet: 'tan', detail: 'Tangent' },
			{ label: 'log', snippet: 'log', detail: 'Logarithm' },
			{ label: 'ln', snippet: 'ln', detail: 'Natural log' },
			{ label: 'exp', snippet: 'exp', detail: 'Exponential' },
			{ label: 'vec', snippet: 'vec($1)', detail: 'Vector' },
			{ label: 'mat', snippet: 'mat(\n\t$1\n)', detail: 'Matrix' },
			{ label: 'cases', snippet: 'cases(\n\t$1\n)', detail: 'Piecewise' },
			{ label: 'binom', snippet: 'binom($1, $2)', detail: 'Binomial' },
		];

		for (const fn of mathFunctions) {
			const item = new vscode.CompletionItem(fn.label, vscode.CompletionItemKind.Function);
			if (fn.snippet.includes('$')) {
				item.insertText = new vscode.SnippetString(fn.snippet);
			}
			item.detail = fn.detail;
			items.push(item);
		}

		// Symbols
		// allow-any-unicode-next-line
		const symbols = [
			{ label: 'infinity', detail: '\u221E' },
			{ label: 'partial', detail: '\u2202' },
			{ label: 'nabla', detail: '\u2207' },
			{ label: 'approx', detail: '\u2248' },
			{ label: 'neq', detail: '\u2260' },
			{ label: 'leq', detail: '\u2264' },
			{ label: 'geq', detail: '\u2265' },
			{ label: 'subset', detail: '\u2282' },
			{ label: 'supset', detail: '\u2283' },
			{ label: 'in', detail: '\u2208' },
			{ label: 'forall', detail: '\u2200' },
			{ label: 'exists', detail: '\u2203' },
			{ label: 'times', detail: '\u00D7' },
			{ label: 'div', detail: '\u00F7' },
			{ label: 'pm', detail: '\u00B1' },
			{ label: 'mp', detail: '\u2213' },
			{ label: 'cdot', detail: '\u00B7' },
			{ label: 'dots', detail: '\u2026' },
			{ label: 'arrow.r', detail: '\u2192' },
			{ label: 'arrow.l', detail: '\u2190' },
			{ label: 'arrow.t', detail: '\u2191' },
			{ label: 'arrow.b', detail: '\u2193' },
			{ label: 'implies', detail: '\u27F9' },
			{ label: 'iff', detail: '\u27FA' },
		];

		for (const sym of symbols) {
			const item = new vscode.CompletionItem(sym.label, vscode.CompletionItemKind.Constant);
			item.detail = sym.detail;
			items.push(item);
		}

		return items;
	}
}
