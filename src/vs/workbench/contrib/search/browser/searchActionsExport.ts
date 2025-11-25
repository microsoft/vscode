/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath, extname } from '../../../../base/common/resources.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService, FileOperationError, FileOperationResult } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import * as Constants from '../common/constants.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { category, getSearchView } from './searchActionsBase.js';
import { ISearchTreeFolderMatch, isSearchTreeFileMatch, isSearchTreeFolderMatch, ISearchResult } from './searchTreeModel/searchTreeCommon.js';
import { URI } from '../../../../base/common/uri.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { hasKey } from '../../../../base/common/types.js';
import { allFolderMatchesToString } from './searchActionsCopy.js';

//#region Types

/**
 * Supported export formats for search results.
 */
export type ExportFormat = 'json' | 'csv' | 'txt';

/**
 * Common export data structure used by all serializers.
 */
export interface ExportData {
	metadata: {
		query: string;
		caseSensitive: boolean;
		regex: boolean;
		wholeWord: boolean;
		includePattern: string | undefined;
		excludePattern: string | undefined;
		timestamp: string;
		totalMatches: number;
		totalFiles: number;
		textResultCount: number;
		aiResultCount: number;
	};
	textResults: Array<{ folder: string; files: Array<{ path: string; absolutePath: string; matches: Array<{ line: number; column: number; text: string; before: string; after: string; fullLine: string }> }> }>;
	aiResults: Array<{ folder: string; files: Array<{ path: string; absolutePath: string; matches: Array<{ line: number; column: number; text: string; before: string; after: string; fullLine: string }> }> }>;
}

//#endregion

//#region Actions

	/**
	 * Action to export search results to a file in multiple formats (JSON, CSV, Plain Text).
	 * 
	 * This action allows users to export both text and AI search results with complete metadata
	 * to a file for further analysis, sharing, or archival purposes.
	 * 
	 * Supported formats:
	 * - JSON: Structured format with complete metadata and hierarchical data
	 * - CSV: Flat format with one row per match, Excel-compatible
	 * - Plain Text: Matches existing "Copy All" format for consistency
	 * 
	 * Entry points:
	 * - Command Palette (F1 → "Export Search Results")
	 * - Context menu (right-click on search results)
	 */
registerAction2(class ExportSearchResultsAction extends Action2 {

	constructor() {
		super({
			id: Constants.SearchCommandIds.ExportSearchResultsActionId,
			title: nls.localize2('exportSearchResultsLabel', "Export Search Results..."),
			category,
			f1: true,
			menu: [{
				id: MenuId.SearchContext,
				when: Constants.SearchContext.HasSearchResults,
				group: 'search_2',
				order: 4
			}]
		});
	}

	/**
	 * Executes the export action.
	 * 
	 * Flow:
	 * 1. Get search view and validate results exist
	 * 2. Collect metadata and results (text + AI)
	 * 3. Show save dialog with format filters
	 * 4. Detect format from file extension or filter selection
	 * 5. Serialize to appropriate format (JSON, CSV, or Plain Text)
	 * 6. Write file with correct extension
	 * 7. Show success notification with reveal action
	 * 
	 * @param accessor Service accessor for dependency injection
	 */
	override async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const fileDialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const labelService = accessor.get(ILabelService);
		const notificationService = accessor.get(INotificationService);
		const nativeHostService = accessor.get(INativeHostService);
		const logService = accessor.get(ILogService);

		// Get search view and results
		const searchView = getSearchView(viewsService);
		if (!searchView) {
			return;
		}

		const searchResult = searchView.searchResult;
		if (!searchResult || searchResult.isEmpty()) {
			notificationService.warn(nls.localize2('noSearchResultsToExport', "No search results to export").value);
			return;
		}

		// Collect metadata from search query and results
		const query = searchResult.query;
		// Convert IExpression to string (join all pattern keys)
		const includePatternStr = query?.includePattern
			? Object.keys(query.includePattern).filter(k => query.includePattern![k] === true).join(', ')
			: undefined;
		const excludePatternStr = query?.excludePattern
			? Object.keys(query.excludePattern).filter(k => query.excludePattern![k] === true).join(', ')
			: undefined;
		const metadata = {
			query: query?.contentPattern?.pattern || '',
			caseSensitive: query?.contentPattern?.isCaseSensitive || false,
			regex: query?.contentPattern?.isRegExp || false,
			wholeWord: query?.contentPattern?.isWordMatch || false,
			includePattern: includePatternStr,
			excludePattern: excludePatternStr,
			timestamp: new Date().toISOString(),
			totalMatches: searchResult.count() + searchResult.count(true),
			totalFiles: searchResult.fileCount(),
			textResultCount: searchResult.count(),
			aiResultCount: searchResult.count(true)
		};

		// Collect text results (pass false or no parameter for text results)
		const textResults = collectResults(searchResult.folderMatches(), labelService);

		// Collect AI results (pass true for AI results)
		const aiResults = collectResults(searchResult.folderMatches(true), labelService);

		// Build export object
		const exportData: ExportData = {
			metadata,
			textResults,
			aiResults
		};

		// Show save dialog with timestamped default filename
		// Format: search-results-YYYY-MM-DD-HHmmss.txt (default to Plain Text)
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
		const defaultFileName = `search-results-${timestamp}.txt`;
		const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);

		const result = await fileDialogService.showSaveDialog({
			defaultUri,
			filters: [
				{ name: nls.localize('plainTextFiles', "Plain Text Files"), extensions: ['txt'] },
				{ name: nls.localize('csvFiles', "CSV Files"), extensions: ['csv'] },
				{ name: nls.localize('jsonFiles', "JSON Files"), extensions: ['json'] },
				{ name: nls.localize('allFiles', "All Files"), extensions: ['*'] }
			],
			title: nls.localize2('exportSearchResultsDialogTitle', "Export Search Results").value
		});

		if (!result) {
			return; // User cancelled
		}

		// Detect format from URI (extension-based detection)
		// Note: showSaveDialog doesn't return selectedFilter, so we rely on extension
		const detectedFormat = getFormatFromPath(result);
		const expectedExtension = detectedFormat === 'json' ? '.json'
			: detectedFormat === 'csv' ? '.csv'
			: '.txt';

		// Ensure correct extension is present
		let fileUri = result;
		const currentExt = extname(fileUri).toLowerCase();
		if (currentExt !== expectedExtension) {
			// Remove existing extension if wrong, then add correct one
			if (currentExt && currentExt !== expectedExtension) {
				const pathWithoutExt = fileUri.path.slice(0, -currentExt.length);
				fileUri = fileUri.with({ path: pathWithoutExt + expectedExtension });
			} else if (!currentExt) {
				// No extension, add the correct one
				fileUri = fileUri.with({ path: fileUri.path + expectedExtension });
			}
		}

		// Serialize based on detected format
		let serializedContent: string;
		if (detectedFormat === 'txt') {
			// Plain text needs searchResult object
			serializedContent = serializeToPlainText(searchResult, labelService);
		} else {
			// JSON and CSV use exportData
			serializedContent = serializeExportData(exportData, detectedFormat, null, labelService);
		}

		// Write file
		try {
			const buffer = VSBuffer.fromString(serializedContent);
			await fileService.writeFile(fileUri, buffer);

			// Show success notification with reveal action
			const fileName = labelService.getUriLabel(fileUri, { relative: false });
			const revealLabel = isWindows
				? nls.localize2('revealInExplorer', "Reveal in File Explorer")
				: isMacintosh
				? nls.localize2('revealInFinder', "Reveal in Finder")
				: nls.localize2('revealInFileManager', "Reveal in File Manager");

			const revealAction: IAction = toAction({
				id: 'search.export.reveal',
				label: revealLabel.value,
				run: () => nativeHostService.showItemInFolder(fileUri.fsPath)
			});

			notificationService.notify({
				message: nls.localize2('exportSuccess', "Search results exported to {0}", fileName).value,
				severity: Severity.Info,
				actions: {
					primary: [revealAction]
				}
			});
		} catch (error) {
			// Log technical details for debugging
			logService.error('Failed to export search results', error);

			// Classify error and show user-friendly message
			let message: string;
			if (error instanceof FileOperationError) {
				// Use VS Code's FileOperationError for proper error classification
				if (error.fileOperationResult === FileOperationResult.FILE_PERMISSION_DENIED) {
					message = nls.localize2('exportErrorPermission', "Permission denied. Please choose a different location.").value;
				} else if (error.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
					message = nls.localize2('exportErrorDiskFull', "Disk full. Please free up space and try again.").value;
				} else {
					message = nls.localize2('exportErrorGeneric', "Failed to export search results. Please try again.").value;
				}
			} else if (error && typeof error === 'object' && error !== null) {
				// Check for Node.js error codes (EACCES, ENOSPC) without using "in" operator
				const nodeError = error as { code?: string; message?: unknown };
				if (nodeError.code === 'EACCES' || (nodeError.message && typeof nodeError.message === 'string' && nodeError.message.includes('permission'))) {
					message = nls.localize2('exportErrorPermission', "Permission denied. Please choose a different location.").value;
				} else if (nodeError.code === 'ENOSPC') {
					message = nls.localize2('exportErrorDiskFull', "Disk full. Please free up space and try again.").value;
				} else {
					message = nls.localize2('exportErrorGeneric', "Failed to export search results. Please try again.").value;
				}
			} else {
				message = nls.localize2('exportErrorGeneric', "Failed to export search results. Please try again.").value;
			}

			notificationService.error(message);
		}
	}
});

//#endregion

//#region Format Detection

/**
 * Detects export format from file URI and optional filter selection.
 * 
 * Priority:
 * 1. File extension (.json, .csv, .txt)
 * 2. Selected filter (if extension doesn't match)
 * 3. Default format (Plain Text)
 * 
 * @param uri The file URI
 * @param selectedFilter The selected filter name (optional)
 * @returns Detected export format
 */
export function getFormatFromPath(uri: URI, selectedFilter?: string): ExportFormat {
	// Check file extension (case-insensitive)
	const ext = extname(uri).toLowerCase();
	if (ext === '.json') {
		return 'json';
	}
	if (ext === '.csv') {
		return 'csv';
	}
	if (ext === '.txt') {
		return 'txt';
	}

	// Check selected filter if extension doesn't match
	if (selectedFilter) {
		const filterLower = selectedFilter.toLowerCase();
		if (filterLower.includes('json')) {
			return 'json';
		}
		if (filterLower.includes('csv')) {
			return 'csv';
		}
		if (filterLower.includes('text') || filterLower.includes('plain')) {
			return 'txt';
		}
	}

	// Default to Plain Text
	return 'txt';
}

//#endregion

//#region CSV Serialization

/**
 * Escapes a CSV field according to RFC 4180.
 * 
 * Rules:
 * - If field contains comma, quote, or newline, wrap in double quotes
 * - Escape internal double quotes as ""
 * - Return field as-is if no special characters
 * 
 * @param field The field value to escape
 * @returns Escaped CSV field
 */
export function escapeCSVField(field: string): string {
	if (!field) {
		return '';
	}

	// Check if field needs quoting (contains comma, quote, or newline)
	if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
		// Escape internal quotes by doubling them and wrap in quotes
		return `"${field.replace(/"/g, '""')}"`;
	}

	return field;
}

/**
 * Builds CSV header row with column names.
 * @returns CSV header row string
 */
export function buildCSVHeader(): string {
	const columns = [
		'File Path',
		'Line Number',
		'Column',
		'Match Text',
		'Before Context',
		'After Context',
		'Full Line',
		'Result Type',
		'Rank'
	];
	return columns.map(escapeCSVField).join(',');
}

/**
 * Builds a CSV data row from match data.
 * 
 * @param filePath Relative or absolute file path
 * @param line Line number
 * @param column Column number
 * @param matchText The matched text
 * @param beforeContext Text before match
 * @param afterContext Text after match
 * @param fullLine Complete line text
 * @param resultType Either "text" or "ai"
 * @param rank AI result rank (empty for text results)
 * @returns CSV data row string
 */
export function buildCSVRow(
	filePath: string,
	line: number,
	column: number,
	matchText: string,
	beforeContext: string,
	afterContext: string,
	fullLine: string,
	resultType: 'text' | 'ai',
	rank: string
): string {
	const fields = [
		filePath,
		line.toString(),
		column.toString(),
		matchText,
		beforeContext,
		afterContext,
		fullLine,
		resultType,
		rank
	];
	return fields.map(escapeCSVField).join(',');
}

/**
 * Collects data for CSV export in flat row structure.
 * 
 * Flattens hierarchical structure (folder → file → match) to one row per match.
 * 
 * @param exportData The export data structure
 * @param useAbsolutePath Whether to use absolute paths (default: false for relative)
 * @returns Array of CSV row data objects
 */
function collectCSVData(exportData: ExportData, useAbsolutePath = false): Array<{
	filePath: string;
	line: number;
	column: number;
	matchText: string;
	beforeContext: string;
	afterContext: string;
	fullLine: string;
	resultType: 'text' | 'ai';
	rank: string;
}> {
	const rows: Array<{
		filePath: string;
		line: number;
		column: number;
		matchText: string;
		beforeContext: string;
		afterContext: string;
		fullLine: string;
		resultType: 'text' | 'ai';
		rank: string;
	}> = [];

	// Process text results
	for (const folderResult of exportData.textResults) {
		for (const file of folderResult.files) {
			for (const match of file.matches) {
				rows.push({
					filePath: useAbsolutePath ? file.absolutePath : file.path,
					line: match.line,
					column: match.column,
					matchText: match.text,
					beforeContext: match.before,
					afterContext: match.after,
					fullLine: match.fullLine,
					resultType: 'text',
					rank: ''
				});
			}
		}
	}

	// Process AI results
	for (const folderResult of exportData.aiResults) {
		for (const file of folderResult.files) {
			// Extract rank if available (AI results may have rank property)
			// Use type assertion to safely check for rank property
			const fileWithRank = file as { rank?: unknown } & typeof file;
			const rank = hasKey(fileWithRank, { rank: true }) ? (fileWithRank as { rank: unknown }).rank : undefined;
			const rankString = rank !== undefined ? String(rank) : '';
			for (const match of file.matches) {
				rows.push({
					filePath: useAbsolutePath ? file.absolutePath : file.path,
					line: match.line,
					column: match.column,
					matchText: match.text,
					beforeContext: match.before,
					afterContext: match.after,
					fullLine: match.fullLine,
					resultType: 'ai',
					rank: rankString
				});
			}
		}
	}

	return rows;
}

/**
 * Serializes export data to CSV format.
 * 
 * Format:
 * - UTF-8 BOM at start for Excel compatibility
 * - CRLF line endings (\r\n)
 * - Header row with column names
 * - One data row per match
 * 
 * @param data The export data to serialize
 * @returns CSV string with BOM and CRLF line endings
 */
export function serializeToCSV(data: ExportData): string {
	const rows: string[] = [];

	// Add header row (BOM will be prepended)
	const headerRow = buildCSVHeader();

	// Collect and add data rows
	const csvData = collectCSVData(data);
	for (const rowData of csvData) {
		rows.push(buildCSVRow(
			rowData.filePath,
			rowData.line,
			rowData.column,
			rowData.matchText,
			rowData.beforeContext,
			rowData.afterContext,
			rowData.fullLine,
			rowData.resultType,
			rowData.rank
		));
	}

	// Join with CRLF line endings (Excel expects CRLF)
	const csvContent = [headerRow, ...rows].join('\r\n');

	// Prepend UTF-8 BOM for Excel compatibility (must be first character)
	return '\uFEFF' + csvContent;
}

//#endregion

//#region Plain Text Serialization

/**
 * Serializes export data to plain text format matching "Copy All" behavior.
 * 
 * Uses the existing allFolderMatchesToString function to ensure format consistency.
 * 
 * @param searchResult The search result object (needed to call folderMatches)
 * @param labelService Label service for path formatting
 * @returns Plain text string matching copy format
 */
function serializeToPlainText(searchResult: ISearchResult, labelService: ILabelService): string {
	// Get text results
	const textResults = allFolderMatchesToString(searchResult.folderMatches(), labelService);

	// Get AI results
	const aiResults = allFolderMatchesToString(searchResult.folderMatches(true), labelService);

	// Join with double line break (matching copy behavior)
	const parts: string[] = [];
	if (textResults) {
		parts.push(textResults);
	}
	if (aiResults) {
		parts.push(aiResults);
	}

	// Use platform-appropriate line endings (allFolderMatchesToString already handles this)
	// But we need double line break between text and AI results
	const lineDelimiter = isWindows ? '\r\n' : '\n';
	return parts.join(lineDelimiter + lineDelimiter);
}

//#endregion

//#region Serialization Dispatcher

/**
 * Serializes export data to the specified format.
 * 
 * @param data Export data (for JSON and CSV)
 * @param format Target export format
 * @param searchResult Search result object (for plain text, may be null for other formats)
 * @param labelService Label service (for plain text)
 * @returns Serialized string
 */
function serializeExportData(
	data: ExportData,
	format: ExportFormat,
	searchResult: ISearchResult | null,
	labelService: ILabelService
): string {
	switch (format) {
		case 'json':
			return JSON.stringify(data, null, 2);
		case 'csv':
			return serializeToCSV(data);
		case 'txt':
			if (!searchResult) {
				throw new Error('Search result required for plain text export');
			}
			return serializeToPlainText(searchResult, labelService);
		default:
			throw new Error(`Unsupported export format: ${format}`);
	}
}

//#endregion

//#region Helpers

/**
 * Collects search results from folder matches into the export format.
 * 
 * This function iterates through folder matches and extracts:
 * - Folder paths
 * - File paths (relative and absolute)
 * - Match details (line, column, text, context)
 * 
 * Handles both direct file matches and nested folder matches recursively.
 * 
 * @param folderMatches Array of folder matches to process
 * @param labelService Service for formatting file paths
 * @returns Array of folder results with nested file and match data
 */
function collectResults(folderMatches: ISearchTreeFolderMatch[], labelService: ILabelService): Array<{ folder: string; files: Array<{ path: string; absolutePath: string; matches: Array<{ line: number; column: number; text: string; before: string; after: string; fullLine: string }> }> }> {
	const results: Array<{ folder: string; files: Array<{ path: string; absolutePath: string; matches: Array<{ line: number; column: number; text: string; before: string; after: string; fullLine: string }> }> }> = [];

	for (const folderMatch of folderMatches) {
		const folderPath = folderMatch.resource ? labelService.getUriLabel(folderMatch.resource, { noPrefix: true }) : '';
		const files: Array<{ path: string; absolutePath: string; matches: Array<{ line: number; column: number; text: string; before: string; after: string; fullLine: string }> }> = [];

		for (const match of folderMatch.matches()) {
			if (isSearchTreeFileMatch(match)) {
				const fileMatch = match;
				const relativePath = labelService.getUriLabel(fileMatch.resource, { relative: true, noPrefix: true });
				const absolutePath = labelService.getUriLabel(fileMatch.resource, { relative: false, noPrefix: true });
				const matches: Array<{ line: number; column: number; text: string; before: string; after: string; fullLine: string }> = [];

				for (const searchMatch of fileMatch.matches()) {
					const range = searchMatch.range();
					const preview = searchMatch.preview();
					const fullPreviewLines = searchMatch.fullPreviewLines();

					matches.push({
						line: range.startLineNumber,
						column: range.startColumn,
						text: searchMatch.text(),
						before: preview.before,
						after: preview.after,
						fullLine: fullPreviewLines.length > 0 ? fullPreviewLines[0] : ''
					});
				}

				if (matches.length > 0) {
					files.push({
						path: relativePath,
						absolutePath,
						matches
					});
				}
			} else if (isSearchTreeFolderMatch(match)) {
				// Handle nested folder matches: use allDownstreamFileMatches to get all files
				// This handles cases where folder matches contain subfolders
				const nestedFiles = match.allDownstreamFileMatches();
				for (const fileMatch of nestedFiles) {
					const relativePath = labelService.getUriLabel(fileMatch.resource, { relative: true, noPrefix: true });
					const absolutePath = labelService.getUriLabel(fileMatch.resource, { relative: false, noPrefix: true });
					const matches: Array<{ line: number; column: number; text: string; before: string; after: string; fullLine: string }> = [];

					for (const searchMatch of fileMatch.matches()) {
						const range = searchMatch.range();
						const preview = searchMatch.preview();
						const fullPreviewLines = searchMatch.fullPreviewLines();

						matches.push({
							line: range.startLineNumber,
							column: range.startColumn,
							text: searchMatch.text(),
							before: preview.before,
							after: preview.after,
							fullLine: fullPreviewLines.length > 0 ? fullPreviewLines[0] : ''
						});
					}

					if (matches.length > 0) {
						files.push({
							path: relativePath,
							absolutePath,
							matches
						});
					}
				}
			}
		}

		if (files.length > 0) {
			results.push({
				folder: folderPath,
				files
			});
		}
	}

	return results;
}

//#endregion

