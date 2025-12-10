/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Note: This file is a duplicate of src/vs/platform/notebook/common/alternativeContentProvider.xml.ts
// The duplication is necessary because extensions cannot import from the VS Code platform layer.
// Any changes to this file should also be made to the platform version.

import type * as nbformat from '@jupyterlab/nbformat';

/**
 * Parses XML-formatted notebook content and converts it to standard Jupyter notebook format
 */
export function parseXMLNotebook(xmlContent: string): Partial<nbformat.INotebookContent> {
	const result: Partial<nbformat.INotebookContent> = {
		cells: [],
		metadata: {},
		nbformat: 4,
		nbformat_minor: 5
	};

	try {
		// Extract metadata section
		const metadataMatch = xmlContent.match(/<metadata>([\s\S]*?)<\/metadata>/);
		if (metadataMatch) {
			result.metadata = parseMetadata(metadataMatch[1]);
		}

		// Extract cells
		const cellsMatch = xmlContent.match(/<cells>([\s\S]*?)<\/cells>/);
		if (cellsMatch) {
			result.cells = parseCells(cellsMatch[1]);
		}

		return result;
	} catch (error) {
		throw new Error(`Failed to parse XML notebook: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function parseMetadata(metadataXml: string): nbformat.INotebookMetadata {
	const metadata: nbformat.INotebookMetadata = {};

	// Parse kernelspec
	const kernelspecMatch = metadataXml.match(/<kernelspec>([\s\S]*?)<\/kernelspec>/);
	if (kernelspecMatch) {
		metadata.kernelspec = {
			display_name: extractTagContent(kernelspecMatch[1], 'display_name') || '',
			language: extractTagContent(kernelspecMatch[1], 'language') || '',
			name: extractTagContent(kernelspecMatch[1], 'name') || ''
		};
	}

	// Parse language_info
	const languageInfoMatch = metadataXml.match(/<language_info>([\s\S]*?)<\/language_info>/);
	if (languageInfoMatch) {
		const langInfo = languageInfoMatch[1];
		metadata.language_info = {
			name: extractTagContent(langInfo, 'name') || ''
		};

		const version = extractTagContent(langInfo, 'version');
		if (version) {
			metadata.language_info.version = version;
		}

		const mimetype = extractTagContent(langInfo, 'mimetype');
		if (mimetype) {
			metadata.language_info.mimetype = mimetype;
		}

		const fileExtension = extractTagContent(langInfo, 'file_extension');
		if (fileExtension) {
			metadata.language_info.file_extension = fileExtension;
		}

		const pygmentsLexer = extractTagContent(langInfo, 'pygments_lexer');
		if (pygmentsLexer) {
			(metadata.language_info as any).pygments_lexer = pygmentsLexer;
		}

		const nbconvertExporter = extractTagContent(langInfo, 'nbconvert_exporter');
		if (nbconvertExporter) {
			(metadata.language_info as any).nbconvert_exporter = nbconvertExporter;
		}

		// Parse codemirror_mode
		const codemirrorMatch = langInfo.match(/<codemirror_mode>([\s\S]*?)<\/codemirror_mode>/);
		if (codemirrorMatch) {
			const modeName = extractTagContent(codemirrorMatch[1], 'name');
			const modeVersion = extractTagContent(codemirrorMatch[1], 'version');
			if (modeName) {
				(metadata.language_info as any).codemirror_mode = {
					name: modeName
				};
				if (modeVersion) {
					(metadata.language_info as any).codemirror_mode.version = parseInt(modeVersion, 10);
				}
			}
		}
	}

	return metadata;
}

function parseCells(cellsXml: string): nbformat.ICell[] {
	const cells: nbformat.ICell[] = [];

	// Match all VSCode.Cell elements
	const cellRegex = /<VSCode\.Cell\s+language="([^"]+)">([\s\S]*?)<\/VSCode\.Cell>/g;
	let match;

	while ((match = cellRegex.exec(cellsXml)) !== null) {
		const language = match[1];
		const content = match[2].trim();

		if (language === 'markdown') {
			cells.push({
				cell_type: 'markdown',
				metadata: {},
				source: content
			});
		} else {
			cells.push({
				cell_type: 'code',
				execution_count: null,
				metadata: {},
				outputs: [],
				source: content
			});
		}
	}

	return cells;
}

function extractTagContent(xml: string, tagName: string): string | undefined {
	// Simple regex for extracting text-only content (no nested tags)
	// This is sufficient for the metadata fields we're parsing
	const regex = new RegExp(`<${tagName}>([^<]*)<\/${tagName}>`, 'i');
	const match = xml.match(regex);
	return match ? match[1].trim() : undefined;
}

/**
 * Checks if content appears to be XML-formatted notebook
 */
export function isXMLNotebook(content: string): boolean {
	const trimmed = content.trim();
	return trimmed.startsWith('<?xml') && trimmed.includes('<notebook') && trimmed.includes('<VSCode.Cell');
}
