/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ISearchTreeFileMatch, ISearchTreeMatch } from '../../search/browser/searchTreeModel/searchTreeCommon.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';

export class SearchResultHighlighter extends Disposable {
	private static readonly _scheme = 'search-highlighted';
	private readonly _highlightedFiles = new Map<string, URI>();

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();
		
		// Register a custom text model content provider for highlighted files
		this._register(this._modelService.onModelAdded((model) => {
			if (model.uri.scheme === SearchResultHighlighter._scheme) {
				this._ensureHighlightedContent(model);
			}
		}));
	}

	getHighlightedFileUri(fileMatch: ISearchTreeFileMatch): URI {
		const key = fileMatch.resource.toString();
		if (!this._highlightedFiles.has(key)) {
			const highlightedUri = URI.from({
				scheme: SearchResultHighlighter._scheme,
				path: fileMatch.resource.path,
				query: `original=${encodeURIComponent(fileMatch.resource.toString())}&matches=${fileMatch.count()}&t=${Date.now()}`
			});
			this._highlightedFiles.set(key, highlightedUri);
		}
		return this._highlightedFiles.get(key)!;
	}

	async generateHighlightedContent(fileMatch: ISearchTreeFileMatch): Promise<string> {
		try {
			// Get the original file content
			const originalUri = fileMatch.resource;
			const textFileEditorModel = await this._textFileService.files.resolve(originalUri);
			const originalContent = textFileEditorModel.textEditorModel.getValue();
			const lines = originalContent.split(/\r?\n/);

			// Get matches and create highlighted content
			const matches = fileMatch.textMatches();
			if (matches.length === 0) {
				return originalContent;
			}

			// Sort matches by line and column
			const sortedMatches = matches.slice().sort((a, b) => {
				const rangeA = a.range();
				const rangeB = b.range();
				const lineDiff = rangeA.startLineNumber - rangeB.startLineNumber;
				if (lineDiff !== 0) return lineDiff;
				return rangeA.startColumn - rangeB.startColumn;
			});

			// Apply highlights by modifying the content
			// For now, we'll use a simple approach of adding markers around matches
			const highlightedContent = this._applyHighlights(lines, sortedMatches, fileMatch);
			return highlightedContent;

		} catch (error) {
			// If we can't load the file, return empty content
			console.warn('Failed to generate highlighted content for search result:', error);
			return '';
		}
	}

	private async _ensureHighlightedContent(model: ITextModel): Promise<void> {
		const uri = model.uri;
		if (uri.scheme !== SearchResultHighlighter._scheme) {
			return;
		}

		try {
			const params = new URLSearchParams(uri.query);
			const originalUriStr = params.get('original');
			if (!originalUriStr) {
				return;
			}

			const originalUri = URI.parse(originalUriStr);
			// For now, just set the same content as the original
			// This would be improved to actually generate highlighted content
			const textFileEditorModel = await this._textFileService.files.resolve(originalUri);
			const originalContent = textFileEditorModel.textEditorModel.getValue();
			
			// Set the content with basic highlighting markers
			model.setValue(originalContent);
			
		} catch (error) {
			console.warn('Failed to load highlighted content:', error);
		}
	}

	createHighlightedModel(fileMatch: ISearchTreeFileMatch): Promise<ITextModel> {
		const highlightedUri = this.getHighlightedFileUri(fileMatch);
		
		// Check if model already exists
		const existingModel = this._modelService.getModel(highlightedUri);
		if (existingModel) {
			return Promise.resolve(existingModel);
		}

		// Create a new model
		const languageId = this._languageService.guessLanguageIdByFilepathOrFirstLine(fileMatch.resource);
		return this.generateHighlightedContent(fileMatch).then(content => {
			const model = this._modelService.createModel(content, languageId, highlightedUri);
			return model;
		});
	}

	private _applyHighlights(lines: string[], matches: ISearchTreeMatch[], fileMatch: ISearchTreeFileMatch): string {
		const highlightedLines = [...lines];

		// Work backwards through matches to avoid position shifts
		for (let i = matches.length - 1; i >= 0; i--) {
			const match = matches[i];
			const range = match.range();
			const startLine = range.startLineNumber - 1; // Convert to 0-based
			const endLine = range.endLineNumber - 1;
			const startCol = range.startColumn - 1;
			const endCol = range.endColumn - 1;

			if (startLine < 0 || startLine >= highlightedLines.length) {
				continue;
			}

			if (startLine === endLine) {
				// Single line match
				const line = highlightedLines[startLine];
				if (startCol >= 0 && endCol <= line.length) {
					const before = line.substring(0, startCol);
					const matchText = line.substring(startCol, endCol);
					const after = line.substring(endCol);
					// Add highlight markers (these will show as changes in the diff)
					highlightedLines[startLine] = before + '【' + matchText + '】' + after;
				}
			} else {
				// Multi-line match
				for (let lineNum = startLine; lineNum <= endLine && lineNum < highlightedLines.length; lineNum++) {
					const line = highlightedLines[lineNum];
					if (lineNum === startLine) {
						// First line
						const before = line.substring(0, startCol);
						const after = line.substring(startCol);
						highlightedLines[lineNum] = before + '【' + after;
					} else if (lineNum === endLine) {
						// Last line
						const before = line.substring(0, endCol);
						const after = line.substring(endCol);
						highlightedLines[lineNum] = before + '】' + after;
					} else {
						// Middle lines - wrap entire line
						highlightedLines[lineNum] = '【' + line + '】';
					}
				}
			}
		}

		// Add context lines if available
		const contextLines = this._addContextLines(highlightedLines, fileMatch.context);

		return contextLines.join('\n');
	}

	private _addContextLines(lines: string[], context: Map<number, string>): string[] {
		if (context.size === 0) {
			return lines;
		}

		// For now, just return the original lines
		// In a more sophisticated implementation, we might interleave context
		return lines;
	}

	override dispose(): void {
		super.dispose();
		this._highlightedFiles.clear();
	}
}