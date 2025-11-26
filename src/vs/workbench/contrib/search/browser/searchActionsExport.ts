/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from "../../../../nls.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import {
	joinPath,
	extname,
	dirname,
} from "../../../../base/common/resources.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import {
	ServicesAccessor,
	IInstantiationService,
} from "../../../../platform/instantiation/common/instantiation.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import {
	IFileService,
	FileOperationError,
	FileOperationResult,
} from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import {
	INotificationService,
	Severity,
} from "../../../../platform/notification/common/notification.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import * as Constants from "../common/constants.js";
import {
	Action2,
	MenuId,
	registerAction2,
} from "../../../../platform/actions/common/actions.js";
import { category, getSearchView } from "./searchActionsBase.js";
import {
	ISearchTreeFolderMatch,
	isSearchTreeFileMatch,
	isSearchTreeFolderMatch,
	ISearchResult,
} from "./searchTreeModel/searchTreeCommon.js";
import { URI } from "../../../../base/common/uri.js";
import { IAction, toAction } from "../../../../base/common/actions.js";
import { hasKey } from "../../../../base/common/types.js";
import { allFolderMatchesToString } from "./searchActionsCopy.js";
import {
	IStorageService,
	StorageScope,
	StorageTarget,
} from "../../../../platform/storage/common/storage.js";
import {
	IProgressService,
	ProgressLocation,
	IProgress,
	IProgressStep,
} from "../../../../platform/progress/common/progress.js";
import {
	CancellationToken,
	CancellationTokenSource,
} from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";

// Storage keys for export preferences
const STORAGE_KEY_LAST_FORMAT = "search.export.lastFormat";
const STORAGE_KEY_LAST_PATH = "search.export.lastPath";

// Progress threshold constants
const PROGRESS_THRESHOLD_MATCHES = 500;
const PROGRESS_THRESHOLD_FILES = 20;
const UPDATE_THROTTLE = 50; // Update every 50 matches for large exports

//#region Types

/**
 * Supported export formats for search results.
 */
export type ExportFormat = "json" | "csv" | "txt";

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
	textResults: Array<{
		folder: string;
		files: Array<{
			path: string;
			absolutePath: string;
			matches: Array<{
				line: number;
				column: number;
				text: string;
				before: string;
				after: string;
				fullLine: string;
			}>;
		}>;
	}>;
	aiResults: Array<{
		folder: string;
		files: Array<{
			path: string;
			absolutePath: string;
			matches: Array<{
				line: number;
				column: number;
				text: string;
				before: string;
				after: string;
				fullLine: string;
			}>;
		}>;
	}>;
}

//#endregion

//#region Export Execution

/**
 * Handles cancellation cleanup by deleting partial file if it exists.
 *
 * @param partialFileUri Optional URI of partial file to clean up
 * @param fileService File service for file operations
 * @param logService Log service for warnings
 */
async function handleCancellation(
	partialFileUri: URI | undefined,
	fileService: IFileService,
	logService: ILogService,
): Promise<void> {
	if (partialFileUri) {
		try {
			await fileService.del(partialFileUri);
		} catch (e) {
			// Log but don't throw (cleanup failure is not critical)
			// Note: Some file systems (especially network file systems) may not support reliable cleanup
			logService.warn("Failed to delete partial export file", e);
		}
	}
}

/**
 * Performs the actual export operation (data collection, serialization, file writing).
 *
 * This function handles:
 * - Collecting search results with progress tracking
 * - Serializing to the appropriate format
 * - Writing the file
 * - Updating preferences
 * - Showing success notification
 *
 * Supports progress tracking and cancellation throughout the process.
 *
 * @param progress Optional progress reporter for progress updates
 * @param token Optional cancellation token
 * @param searchResult The search result to export
 * @param format The export format (json, csv, txt)
 * @param fileUri The target file URI
 * @param labelService Label service for path formatting
 * @param fileService File service for file operations
 * @param storageService Storage service for preferences
 * @param notificationService Notification service for user feedback
 * @param nativeHostService Native host service for reveal action
 * @param logService Log service for error logging
 * @param nls NLS module for localization
 */
async function performExport(
	progress: IProgress<IProgressStep> | undefined,
	token: CancellationToken | undefined,
	searchResult: ISearchResult,
	format: ExportFormat,
	fileUri: URI,
	labelService: ILabelService,
	fileService: IFileService,
	storageService: IStorageService,
	notificationService: INotificationService,
	nativeHostService: INativeHostService,
	logService: ILogService,
	nls: typeof import("../../../../nls.js"),
): Promise<void> {
	// Check cancellation before starting
	checkCancellation(token);

	// Collect metadata from search query and results
	const query = searchResult.query;
	// Convert IExpression to string (join all pattern keys)
	const includePatternStr = query?.includePattern
		? Object.keys(query.includePattern)
				.filter((k) => query.includePattern![k] === true)
				.join(", ")
		: undefined;
	const excludePatternStr = query?.excludePattern
		? Object.keys(query.excludePattern)
				.filter((k) => query.excludePattern![k] === true)
				.join(", ")
		: undefined;

	const totalMatches = searchResult.count() + searchResult.count(true);
	const metadata = {
		query: query?.contentPattern?.pattern || "",
		caseSensitive: query?.contentPattern?.isCaseSensitive || false,
		regex: query?.contentPattern?.isRegExp || false,
		wholeWord: query?.contentPattern?.isWordMatch || false,
		includePattern: includePatternStr,
		excludePattern: excludePatternStr,
		timestamp: new Date().toISOString(),
		totalMatches,
		totalFiles: searchResult.fileCount(),
		textResultCount: searchResult.count(),
		aiResultCount: searchResult.count(true),
	};

	// Track progress during collection
	const matchesProcessedRef = { value: 0 };
	const lastUpdateCountRef = { value: 0 };

	// Collect text results with progress tracking
	checkCancellation(token);
	const textResults = collectResults(
		searchResult.folderMatches(),
		labelService,
		progress,
		token,
		totalMatches,
		matchesProcessedRef,
		lastUpdateCountRef,
	);

	// Collect AI results with progress tracking
	checkCancellation(token);
	const aiResults = collectResults(
		searchResult.folderMatches(true),
		labelService,
		progress,
		token,
		totalMatches,
		matchesProcessedRef,
		lastUpdateCountRef,
	);

	// Update progress to 100% after collection completes (if progress is being shown)
	if (progress && totalMatches > 0) {
		const remainingIncrement =
			((totalMatches - lastUpdateCountRef.value) / totalMatches) * 100;
		if (remainingIncrement > 0) {
			progress.report({
				message: nls.localize2(
					"exportProgressMessage",
					"{0} of {1} matches",
					totalMatches,
					totalMatches,
				).value,
				increment: Math.min(remainingIncrement, 100),
			});
		}
	}

	// Build export object
	const exportData: ExportData = {
		metadata,
		textResults,
		aiResults,
	};

	// Check cancellation before serialization
	checkCancellation(token);

	// Serialize based on detected format
	let serializedContent: string;
	if (format === "txt") {
		// Plain text: use folderMatches directly but extract them synchronously
		// to avoid any potential async accessor issues
		const textFolderMatches = searchResult.folderMatches();
		const aiFolderMatches = searchResult.folderMatches(true);
		serializedContent = serializeToPlainText(
			textFolderMatches,
			aiFolderMatches,
			labelService,
		);
	} else {
		// JSON and CSV use exportData
		serializedContent = serializeExportData(
			exportData,
			format,
			null,
			labelService,
		);
	}

	// Check cancellation before file writing
	checkCancellation(token);

	// Write file
	// Note: File URI is tracked here for cancellation cleanup
	// If cancellation occurs during write, we'll try to clean up the partial file
	const buffer = VSBuffer.fromString(serializedContent);
	await fileService.writeFile(fileUri, buffer);

	// Update format preference (use detected format, not preferred format)
	// This ensures we save what the user actually selected
	saveFormatPreference(storageService, format);

	// Update path preference (save directory, not file path)
	const exportDir = dirname(fileUri).fsPath;
	savePathPreference(storageService, exportDir);

	// Show success notification with reveal action
	const fileName = labelService.getUriLabel(fileUri, { relative: false });
	const revealLabel = isWindows
		? nls.localize2("revealInExplorer", "Reveal in File Explorer")
		: isMacintosh
			? nls.localize2("revealInFinder", "Reveal in Finder")
			: nls.localize2("revealInFileManager", "Reveal in File Manager");

	const revealAction: IAction = toAction({
		id: "search.export.reveal",
		label: revealLabel.value,
		run: () => nativeHostService.showItemInFolder(fileUri.fsPath),
	});

	notificationService.notify({
		message: nls.localize2(
			"exportSuccess",
			"Search results exported to {0}",
			fileName,
		).value,
		severity: Severity.Info,
		actions: {
			primary: [revealAction],
		},
	});
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
registerAction2(
	class ExportSearchResultsAction extends Action2 {
		constructor() {
			super({
				id: Constants.SearchCommandIds.ExportSearchResultsActionId,
				title: nls.localize2(
					"exportSearchResultsLabel",
					"Export Search Results...",
				),
				category,
				f1: true,
				menu: [
					{
						id: MenuId.SearchContext,
						when: Constants.SearchContext.HasSearchResults,
						group: "search_2",
						order: 4,
					},
				],
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
		override async run(
			accessor: ServicesAccessor,
			...args: unknown[]
		): Promise<void> {
			// Extract all services at the beginning to ensure accessor is valid
			const viewsService = accessor.get(IViewsService);
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const labelService = accessor.get(ILabelService);
			const notificationService = accessor.get(INotificationService);
			const nativeHostService = accessor.get(INativeHostService);
			const logService = accessor.get(ILogService);
			const storageService = accessor.get(IStorageService);
			const instantiationService = accessor.get(IInstantiationService);
			const progressService = accessor.get(IProgressService);

			// Get search view and results
			const searchView = getSearchView(viewsService);
			if (!searchView) {
				return;
			}

			const searchResult = searchView.searchResult;
			if (!searchResult || searchResult.isEmpty()) {
				notificationService.warn(
					nls.localize2(
						"noSearchResultsToExport",
						"No search results to export",
					).value,
				);
				return;
			}

			// Load format preference (defaults to 'txt' if not set)
			const preferredFormat = getLastFormatPreference(storageService);

			// Load path preference (last export directory)
			const lastPath = getLastPathPreference(storageService, logService);
			let defaultUri: URI | undefined;
			if (lastPath) {
				try {
					defaultUri = URI.file(lastPath);
					// Optional: Could validate path exists here, but can fail gracefully on write
				} catch (e) {
					// Invalid path string, use default
					logService.warn("Invalid last export path preference", e);
					defaultUri = undefined;
				}
			}

			// Show save dialog with timestamped default filename
			// Use preferred format for default filename extension
			const timestamp = new Date()
				.toISOString()
				.replace(/[:.]/g, "-")
				.slice(0, -5);
			const defaultFileName = `search-results-${timestamp}.${preferredFormat}`;

			// Use last path preference if available, otherwise use file dialog default
			const defaultUriForDialog = defaultUri
				? joinPath(defaultUri, defaultFileName)
				: joinPath(await fileDialogService.defaultFilePath(), defaultFileName);

			const result = await fileDialogService.showSaveDialog({
				defaultUri: defaultUriForDialog,
				filters: [
					{
						name: nls.localize("plainTextFiles", "Plain Text Files"),
						extensions: ["txt"],
					},
					{ name: nls.localize("csvFiles", "CSV Files"), extensions: ["csv"] },
					{
						name: nls.localize("jsonFiles", "JSON Files"),
						extensions: ["json"],
					},
					{ name: nls.localize("allFiles", "All Files"), extensions: ["*"] },
				],
				title: nls.localize2(
					"exportSearchResultsDialogTitle",
					"Export Search Results",
				).value,
			});

			if (!result) {
				return; // User cancelled
			}

			// Detect format from URI (extension-based detection)
			// Note: showSaveDialog doesn't return selectedFilter, so we rely on extension
			const detectedFormat = getFormatFromPath(result);
			const expectedExtension =
				detectedFormat === "json"
					? ".json"
					: detectedFormat === "csv"
						? ".csv"
						: ".txt";

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

			// Check if progress should be shown
			const showProgress = shouldShowProgress(searchResult);

			// Perform export with or without progress
			try {
				if (showProgress) {
					// Create cancellation token source
					const cancellationTokenSource = new CancellationTokenSource();

					try {
						await progressService.withProgress(
							{
								location: ProgressLocation.Notification,
								title: nls.localize2(
									"exportProgressTitle",
									"Exporting search results...",
								).value,
								cancellable: true,
							},
							async (progress) => {
								// Cancel token when user clicks cancel
								// Note: The progress service handles cancellation via onDidCancel callback
								// We'll check cancellation in performExport using the token
								await performExport(
									progress,
									cancellationTokenSource.token,
									searchResult,
									detectedFormat,
									fileUri,
									labelService,
									fileService,
									storageService,
									notificationService,
									nativeHostService,
									logService,
									nls,
								);
							},
							() => {
								// onDidCancel callback - cancel the token
								cancellationTokenSource.cancel();
							},
						);
					} finally {
						// Dispose cancellation token source
						cancellationTokenSource.dispose();
					}
				} else {
					// No progress for small exports
					await performExport(
						undefined,
						undefined,
						searchResult,
						detectedFormat,
						fileUri,
						labelService,
						fileService,
						storageService,
						notificationService,
						nativeHostService,
						logService,
						nls,
					);
				}
			} catch (error) {
				// Handle cancellation errors separately
				if (error instanceof CancellationError) {
					// Try to clean up partial file if it exists
					// Note: File URI is only set after write starts, so this may not always have a file to clean up
					await handleCancellation(fileUri, fileService, logService);
					notificationService.info(
						nls.localize2("exportCancelled", "Export cancelled").value,
					);
					return;
				}

				// Handle other errors
				// Log technical details for debugging
				logService.error("Failed to export search results", error);

				// Classify error and show user-friendly message
				const errorInfo = classifyFileError(error as Error, nls);

				const actions: IAction[] = [];
				if (errorInfo.suggestion) {
					// Add retry action when suggestion is available
					// Use instantiation service to create a fresh accessor context when retry is clicked
					const commandId =
						Constants.SearchCommandIds.ExportSearchResultsActionId;
					actions.push(
						toAction({
							id: "search.export.retry",
							label: nls.localize2("exportErrorRetry", "Retry").value,
							run: () =>
								instantiationService.invokeFunction(async (accessor) => {
									const cmdService = accessor.get(ICommandService);
									await cmdService.executeCommand(commandId);
								}),
						}),
					);
				}

				if (actions.length > 0) {
					notificationService.notify({
						message: errorInfo.message,
						severity: Severity.Error,
						actions: { primary: actions },
					});
				} else {
					notificationService.error(errorInfo.message);
				}
			}
		}
	},
);

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
export function getFormatFromPath(
	uri: URI,
	selectedFilter?: string,
): ExportFormat {
	// Check file extension (case-insensitive)
	const ext = extname(uri).toLowerCase();
	if (ext === ".json") {
		return "json";
	}
	if (ext === ".csv") {
		return "csv";
	}
	if (ext === ".txt") {
		return "txt";
	}

	// Check selected filter if extension doesn't match
	if (selectedFilter) {
		const filterLower = selectedFilter.toLowerCase();
		if (filterLower.includes("json")) {
			return "json";
		}
		if (filterLower.includes("csv")) {
			return "csv";
		}
		if (filterLower.includes("text") || filterLower.includes("plain")) {
			return "txt";
		}
	}

	// Default to Plain Text
	return "txt";
}

//#endregion

//#region Progress Threshold

/**
 * Determines whether progress indicator should be shown for an export.
 *
 * Progress is shown when export meets ANY of these conditions:
 * - More than 500 matches total (text + AI)
 * - More than 20 files with matches
 *
 * Uses early exit optimization: checks match count first (O(1)),
 * only counts files if match threshold not met.
 *
 * @param searchResult The search result to check
 * @returns True if progress should be shown, false otherwise
 */
export function shouldShowProgress(searchResult: ISearchResult): boolean {
	const textMatchCount = searchResult.count();
	const aiMatchCount = searchResult.count(true);
	const totalMatches = textMatchCount + aiMatchCount;

	// Fast path: check match count first (O(1))
	if (totalMatches > PROGRESS_THRESHOLD_MATCHES) {
		return true;
	}

	// Only count files if match count threshold not met (avoid unnecessary iteration)
	// Count unique files efficiently using Set
	const fileSet = new Set<string>();

	// Count files in text results
	for (const folderMatch of searchResult.folderMatches()) {
		for (const match of folderMatch.matches()) {
			if (isSearchTreeFileMatch(match)) {
				fileSet.add(match.resource.toString());
				// Early exit if threshold met
				if (fileSet.size > PROGRESS_THRESHOLD_FILES) {
					return true;
				}
			} else if (isSearchTreeFolderMatch(match)) {
				// Handle nested folder matches
				const nestedFiles = match.allDownstreamFileMatches();
				for (const fileMatch of nestedFiles) {
					fileSet.add(fileMatch.resource.toString());
					// Early exit if threshold met
					if (fileSet.size > PROGRESS_THRESHOLD_FILES) {
						return true;
					}
				}
			}
		}
	}

	// Count files in AI results
	for (const folderMatch of searchResult.folderMatches(true)) {
		for (const match of folderMatch.matches()) {
			if (isSearchTreeFileMatch(match)) {
				fileSet.add(match.resource.toString());
				// Early exit if threshold met
				if (fileSet.size > PROGRESS_THRESHOLD_FILES) {
					return true;
				}
			} else if (isSearchTreeFolderMatch(match)) {
				// Handle nested folder matches
				const nestedFiles = match.allDownstreamFileMatches();
				for (const fileMatch of nestedFiles) {
					fileSet.add(fileMatch.resource.toString());
					// Early exit if threshold met
					if (fileSet.size > PROGRESS_THRESHOLD_FILES) {
						return true;
					}
				}
			}
		}
	}

	return fileSet.size > PROGRESS_THRESHOLD_FILES;
}

/**
 * Checks if cancellation has been requested and throws CancellationError if so.
 *
 * @param token Cancellation token to check
 * @throws CancellationError if cancellation is requested
 */
function checkCancellation(token: CancellationToken | undefined): void {
	if (token?.isCancellationRequested) {
		throw new CancellationError();
	}
}

//#endregion

//#region Preference Management

/**
 * Reads the last used format preference from storage.
 * Validates format and defaults to 'txt' if invalid or missing.
 *
 * @param storageService Storage service instance
 * @returns Last used format or 'txt' as default
 */
function getLastFormatPreference(
	storageService: IStorageService,
): ExportFormat {
	const lastFormat =
		storageService.get(STORAGE_KEY_LAST_FORMAT, StorageScope.APPLICATION) ||
		"txt";
	// Validate format (must be one of the supported formats)
	if (lastFormat === "json" || lastFormat === "csv" || lastFormat === "txt") {
		return lastFormat;
	}
	// Invalid format, return default
	return "txt";
}

/**
 * Reads the last used export directory path from storage.
 * Returns undefined if no preference exists or path is invalid.
 *
 * @param storageService Storage service instance
 * @param logService Log service for warnings
 * @returns Last used directory path or undefined
 */
function getLastPathPreference(
	storageService: IStorageService,
	logService: ILogService,
): string | undefined {
	const lastPath = storageService.get(
		STORAGE_KEY_LAST_PATH,
		StorageScope.APPLICATION,
	);
	if (!lastPath) {
		return undefined;
	}
	// Path validation is optional - can fail gracefully on write
	// Return undefined if empty string
	return lastPath || undefined;
}

/**
 * Saves the format preference to storage.
 * Uses USER target so preference is synced across machines.
 *
 * @param storageService Storage service instance
 * @param format Format to save
 */
function saveFormatPreference(
	storageService: IStorageService,
	format: ExportFormat,
): void {
	storageService.store(
		STORAGE_KEY_LAST_FORMAT,
		format,
		StorageScope.APPLICATION,
		StorageTarget.USER,
	);
}

/**
 * Saves the export directory path preference to storage.
 * Uses MACHINE target so path is machine-specific.
 *
 * @param storageService Storage service instance
 * @param path Directory path to save
 */
function savePathPreference(
	storageService: IStorageService,
	path: string,
): void {
	storageService.store(
		STORAGE_KEY_LAST_PATH,
		path,
		StorageScope.APPLICATION,
		StorageTarget.MACHINE,
	);
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
		return "";
	}

	// Check if field needs quoting (contains comma, quote, or newline)
	if (
		field.includes(",") ||
		field.includes('"') ||
		field.includes("\n") ||
		field.includes("\r")
	) {
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
		"File Path",
		"Line Number",
		"Column",
		"Match Text",
		"Before Context",
		"After Context",
		"Full Line",
		"Result Type",
		"Rank",
	];
	return columns.map(escapeCSVField).join(",");
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
	resultType: "text" | "ai",
	rank: string,
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
		rank,
	];
	return fields.map(escapeCSVField).join(",");
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
function collectCSVData(
	exportData: ExportData,
	useAbsolutePath = false,
): Array<{
	filePath: string;
	line: number;
	column: number;
	matchText: string;
	beforeContext: string;
	afterContext: string;
	fullLine: string;
	resultType: "text" | "ai";
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
		resultType: "text" | "ai";
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
					resultType: "text",
					rank: "",
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
			const rank = hasKey(fileWithRank, { rank: true })
				? (fileWithRank as { rank: unknown }).rank
				: undefined;
			const rankString = rank !== undefined ? String(rank) : "";
			for (const match of file.matches) {
				rows.push({
					filePath: useAbsolutePath ? file.absolutePath : file.path,
					line: match.line,
					column: match.column,
					matchText: match.text,
					beforeContext: match.before,
					afterContext: match.after,
					fullLine: match.fullLine,
					resultType: "ai",
					rank: rankString,
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
		rows.push(
			buildCSVRow(
				rowData.filePath,
				rowData.line,
				rowData.column,
				rowData.matchText,
				rowData.beforeContext,
				rowData.afterContext,
				rowData.fullLine,
				rowData.resultType,
				rowData.rank,
			),
		);
	}

	// Join with CRLF line endings (Excel expects CRLF)
	const csvContent = [headerRow, ...rows].join("\r\n");

	// Prepend UTF-8 BOM for Excel compatibility (must be first character)
	return "\uFEFF" + csvContent;
}

//#endregion

//#region Plain Text Serialization

/**
 * Serializes export data to plain text format matching "Copy All" behavior.
 *
 * Uses the existing allFolderMatchesToString function to ensure format consistency.
 *
 * @param textFolderMatches Text search folder matches (pre-extracted)
 * @param aiFolderMatches AI search folder matches (pre-extracted)
 * @param labelService Label service for path formatting
 * @returns Plain text string matching copy format
 */
function serializeToPlainText(
	textFolderMatches: ISearchTreeFolderMatch[],
	aiFolderMatches: ISearchTreeFolderMatch[],
	labelService: ILabelService,
): string {
	// Get text results
	const textResults = allFolderMatchesToString(textFolderMatches, labelService);

	// Get AI results
	const aiResults = allFolderMatchesToString(aiFolderMatches, labelService);

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
	const lineDelimiter = isWindows ? "\r\n" : "\n";
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
	labelService: ILabelService,
): string {
	switch (format) {
		case "json":
			return JSON.stringify(data, null, 2);
		case "csv":
			return serializeToCSV(data);
		case "txt":
			// Plain text is handled separately in performExport to avoid accessor issues
			// This case should not be reached, but kept for type safety
			throw new Error("Plain text export should be handled separately");
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
 * Supports progress tracking and cancellation.
 *
 * @param folderMatches Array of folder matches to process
 * @param labelService Service for formatting file paths
 * @param progress Optional progress reporter for progress updates
 * @param token Optional cancellation token
 * @param totalMatches Total number of matches (for progress calculation)
 * @param matchesProcessedRef Reference to matches processed counter (will be updated)
 * @param lastUpdateCountRef Reference to last update count for throttling (will be updated)
 * @returns Array of folder results with nested file and match data
 */
function collectResults(
	folderMatches: ISearchTreeFolderMatch[],
	labelService: ILabelService,
	progress?: IProgress<IProgressStep>,
	token?: CancellationToken,
	totalMatches?: number,
	matchesProcessedRef?: { value: number },
	lastUpdateCountRef?: { value: number },
): Array<{
	folder: string;
	files: Array<{
		path: string;
		absolutePath: string;
		matches: Array<{
			line: number;
			column: number;
			text: string;
			before: string;
			after: string;
			fullLine: string;
		}>;
	}>;
}> {
	const results: Array<{
		folder: string;
		files: Array<{
			path: string;
			absolutePath: string;
			matches: Array<{
				line: number;
				column: number;
				text: string;
				before: string;
				after: string;
				fullLine: string;
			}>;
		}>;
	}> = [];

	for (const folderMatch of folderMatches) {
		// Check cancellation before processing each folder
		checkCancellation(token);

		const folderPath = folderMatch.resource
			? labelService.getUriLabel(folderMatch.resource, { noPrefix: true })
			: "";
		const files: Array<{
			path: string;
			absolutePath: string;
			matches: Array<{
				line: number;
				column: number;
				text: string;
				before: string;
				after: string;
				fullLine: string;
			}>;
		}> = [];

		for (const match of folderMatch.matches()) {
			if (isSearchTreeFileMatch(match)) {
				const fileMatch = match;
				const relativePath = labelService.getUriLabel(fileMatch.resource, {
					relative: true,
					noPrefix: true,
				});
				const absolutePath = labelService.getUriLabel(fileMatch.resource, {
					relative: false,
					noPrefix: true,
				});
				const matches: Array<{
					line: number;
					column: number;
					text: string;
					before: string;
					after: string;
					fullLine: string;
				}> = [];

				for (const searchMatch of fileMatch.matches()) {
					// Check cancellation periodically during match processing
					if (matchesProcessedRef && matchesProcessedRef.value % 10 === 0) {
						checkCancellation(token);
					}

					const range = searchMatch.range();
					const preview = searchMatch.preview();
					const fullPreviewLines = searchMatch.fullPreviewLines();

					matches.push({
						line: range.startLineNumber,
						column: range.startColumn,
						text: searchMatch.text(),
						before: preview.before,
						after: preview.after,
						fullLine: fullPreviewLines.length > 0 ? fullPreviewLines[0] : "",
					});

					// Increment matches processed counter
					if (matchesProcessedRef) {
						matchesProcessedRef.value++;

						// Update progress (throttled for large exports)
						if (progress && token && totalMatches && totalMatches > 0) {
							const shouldUpdate =
								totalMatches < 1000 ||
								matchesProcessedRef.value - lastUpdateCountRef!.value >=
									UPDATE_THROTTLE;

							if (shouldUpdate) {
								const increment =
									((matchesProcessedRef.value - lastUpdateCountRef!.value) /
										totalMatches) *
									100;
								progress.report({
									message: nls.localize2(
										"exportProgressMessage",
										"{0} of {1} matches",
										matchesProcessedRef.value,
										totalMatches,
									).value,
									increment: Math.min(increment, 100), // Cap at 100% to prevent exceeding
								});
								lastUpdateCountRef!.value = matchesProcessedRef.value;
							}
						}
					}
				}

				if (matches.length > 0) {
					files.push({
						path: relativePath,
						absolutePath,
						matches,
					});
				}
			} else if (isSearchTreeFolderMatch(match)) {
				// Handle nested folder matches: use allDownstreamFileMatches to get all files
				// This handles cases where folder matches contain subfolders
				const nestedFiles = match.allDownstreamFileMatches();
				for (const fileMatch of nestedFiles) {
					const relativePath = labelService.getUriLabel(fileMatch.resource, {
						relative: true,
						noPrefix: true,
					});
					const absolutePath = labelService.getUriLabel(fileMatch.resource, {
						relative: false,
						noPrefix: true,
					});
					const matches: Array<{
						line: number;
						column: number;
						text: string;
						before: string;
						after: string;
						fullLine: string;
					}> = [];

					for (const searchMatch of fileMatch.matches()) {
						// Check cancellation periodically during match processing
						if (matchesProcessedRef && matchesProcessedRef.value % 10 === 0) {
							checkCancellation(token);
						}

						const range = searchMatch.range();
						const preview = searchMatch.preview();
						const fullPreviewLines = searchMatch.fullPreviewLines();

						matches.push({
							line: range.startLineNumber,
							column: range.startColumn,
							text: searchMatch.text(),
							before: preview.before,
							after: preview.after,
							fullLine: fullPreviewLines.length > 0 ? fullPreviewLines[0] : "",
						});

						// Increment matches processed counter
						if (matchesProcessedRef) {
							matchesProcessedRef.value++;

							// Update progress (throttled for large exports)
							if (progress && token && totalMatches && totalMatches > 0) {
								const shouldUpdate =
									totalMatches < 1000 ||
									matchesProcessedRef.value - lastUpdateCountRef!.value >=
										UPDATE_THROTTLE;

								if (shouldUpdate) {
									const increment =
										((matchesProcessedRef.value - lastUpdateCountRef!.value) /
											totalMatches) *
										100;
									progress.report({
										message: nls.localize2(
											"exportProgressMessage",
											"{0} of {1} matches",
											matchesProcessedRef.value,
											totalMatches,
										).value,
										increment: Math.min(increment, 100), // Cap at 100% to prevent exceeding
									});
									lastUpdateCountRef!.value = matchesProcessedRef.value;
								}
							}
						}
					}

					if (matches.length > 0) {
						files.push({
							path: relativePath,
							absolutePath,
							matches,
						});
					}
				}
			}
		}

		if (files.length > 0) {
			results.push({
				folder: folderPath,
				files,
			});
		}
	}

	return results;
}

//#endregion

//#region Error Classification

/**
 * Classifies file errors and returns user-friendly messages with suggestions.
 *
 * @param error The error object
 * @param nls NLS module for localization
 * @returns Object with message and optional suggestion
 */
export function classifyFileError(
	error: Error,
	nls: typeof import("../../../../nls.js"),
): { message: string; suggestion?: string } {
	const errorMessage = error.message.toLowerCase();

	// Check for FileOperationError (VS Code's file error type)
	if (error instanceof FileOperationError) {
		if (
			error.fileOperationResult === FileOperationResult.FILE_PERMISSION_DENIED
		) {
			return {
				message: nls.localize2(
					"exportErrorPermission",
					"Permission denied. Please choose a different location or check file permissions.",
				).value,
				suggestion: nls.localize2(
					"exportErrorPermissionSuggestion",
					"Try choosing a directory in your home folder.",
				).value,
			};
		}
		if (error.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
			return {
				message: nls.localize2(
					"exportErrorDiskFull",
					"Disk full. Please free up space and try again.",
				).value,
			};
		}
	}

	// Check for Node.js error codes
	const nodeError = error as { code?: string; message?: unknown };
	if (
		nodeError.code === "EACCES" ||
		(nodeError.message &&
			typeof nodeError.message === "string" &&
			nodeError.message.includes("permission"))
	) {
		return {
			message: nls.localize2(
				"exportErrorPermission",
				"Permission denied. Please choose a different location or check file permissions.",
			).value,
			suggestion: nls.localize2(
				"exportErrorPermissionSuggestion",
				"Try choosing a directory in your home folder.",
			).value,
		};
	}

	if (nodeError.code === "ENOSPC") {
		return {
			message: nls.localize2(
				"exportErrorDiskFull",
				"Disk full. Please free up space and try again.",
			).value,
		};
	}

	if (errorMessage.includes("read-only") || errorMessage.includes("erofs")) {
		return {
			message: nls.localize2(
				"exportErrorReadOnly",
				"File is read-only. Please choose a different location.",
			).value,
			suggestion: nls.localize2(
				"exportErrorReadOnlySuggestion",
				"Try choosing a writable directory.",
			).value,
		};
	}

	if (errorMessage.includes("network") || errorMessage.includes("enotconn")) {
		return {
			message: nls.localize2(
				"exportErrorNetwork",
				"Failed to write to network location. Please try a local path.",
			).value,
			suggestion: nls.localize2(
				"exportErrorNetworkSuggestion",
				"Try saving to a local directory first.",
			).value,
		};
	}

	// Generic error
	return {
		message: nls.localize2(
			"exportErrorGeneric",
			"Failed to export search results: {0}",
			error.message,
		).value,
	};
}

//#endregion
