/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Base interface for all function call arguments
 */
export interface FunctionCallArgs {
	call_id?: string;
	[key: string]: any;
}

/**
 * Function call structure from AI model
 */
export interface FunctionCall {
	name: string;
	arguments: string | FunctionCallArgs; // JSON string or parsed object
	call_id: string;
	msg_id?: string | number; // Message ID for the function call
}

/**
 * Normalized function call structure
 */
export interface NormalizedFunctionCall {
	name: string;
	arguments: FunctionCallArgs;
	call_id: string;
	msg_id: string | number;
}

/**
 * Function call result types
 */
export type FunctionResult = 
	| SuccessResult 
	| ErrorResult 
	| ContinueResult
	| ContinueSilentResult;

/**
 * Success result with function_call_output
 * Handlers can return either partial or full output - depends on function type
 */
export interface SuccessResult {
	type: 'success';
	function_call_output: PartialFunctionCallOutput | FunctionCallOutput;
	function_output_id?: string | number; // Optional since some handlers don't manage IDs
	image_message_entry?: any; // For image handling
	image_msg_id?: string | number;
	file_path?: string; // For file operations
	old_string?: string; // For search_replace operations
	new_string?: string; // For search_replace operations
	is_create_append_mode?: boolean; // For search_replace create/append mode
	breakout_of_function_calls?: boolean; // For interactive functions that need user input
}

/**
 * Error result for function call failures
 */
export interface ErrorResult {
	type: 'error';
	error_message: string;
	breakout_of_function_calls: boolean;
}


export interface ContinueResult {
	type: 'continue';
	function_call_output?: FunctionCallOutput;
}

export interface ContinueSilentResult {
	type: 'continue_silent';
	function_call_output?: FunctionCallOutput;
}

/**
 * Function call output structure
 */
export interface FunctionCallOutput {
	id: string | number;
	type: 'function_call_output';
	call_id: string;
	output: string;
	related_to: string | number;
	success?: boolean;
}

/**
 * Partial function call output returned by handlers
 * Handlers only provide output text - IDs are managed by the main service
 */
export interface PartialFunctionCallOutput {
	output: string;
}

/**
 * Call context passed to function handlers
 * Contains all services and data needed by function handlers
 */
export interface CallContext {
	relatedToId: string | number;
	requestId: string;
	functionCallMessageId?: string | number; // CRITICAL: Message ID of the function call itself
	conversationManager: {
		getPreallocatedMessageId(callId: string, index: number): string | number | null;
		getNextMessageId(): string | number;
	};
	documentManager: {
		getEffectiveFileContent(filePath: string, startLine?: number, endLine?: number): Promise<string | null>;
		getDiskFileContent(filePath: string, startLine?: number, endLine?: number): Promise<string | null>;
		isFileOpenInEditor(filePath: string): Promise<boolean>;
		getOpenDocumentContent(filePath: string): Promise<string | null>;
		getAllOpenDocuments(includeContent?: boolean): Promise<Array<{ path: string; isDirty: boolean; content: string; isActive: boolean; isSaved: boolean; }>>;
		matchTextInOpenDocuments(searchText: string, options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean; }): Promise<Array<{ path: string; line: number; column: number; text: string; }>>;
		updateOpenDocumentContent(documentId: string, newContent: string): Promise<boolean>;
		isDocumentSaved(documentId: string): boolean;
		getDocumentPath(documentId: string): string;
		checkIfFileOpenInEditor(filePath: string): boolean;
	};
	// Runtime execution functionality removed from Erdos AI


	fileSystemManager?: {
		searchForFile(query: string): Promise<string[]>;
		listDirectory(path: string): Promise<DirectoryEntry[]>;
		deleteFile(path: string): Promise<boolean>;
		grepSearch(pattern: string, includePattern?: string, excludePattern?: string): Promise<SearchResult[]>;
	};


	fileSystemUtils: {
		getCurrentWorkingDirectory(): Promise<string>;
		fileExists(filePath: string): Promise<boolean>;
		isDirectory(filePath: string): Promise<boolean>;
		getFileSize(filePath: string): Promise<number>;
		getFileStats(filePath: string): Promise<{ size?: number; isDirectory: boolean; }>;
		listFiles(directoryPath: string, options?: any): Promise<string[]>;
		listAllFiles(directoryPath: string): Promise<string[]>;
		directoryExists(directoryPath: string): Promise<boolean>;
		getFileInfo(directoryPath: string, files: string[]): Promise<Array<{ name: string; size?: number; isdir?: boolean; is_dir?: boolean; }>>;
		joinPath(dir: string, file: string): string;
		normalizePath(filePath: string): string;
		getBasename(filePath: string): string;
		getDirname(filePath: string): string;
		getFileExtension(filePath: string): string;
		resolveAbsolutePath(filePath: string): Promise<string>;
		expandTildePath(filePath: string): Promise<string>;
		convertToRelativePaths(paths: string[], baseDir: string): string[];
		formatFileSize(sizeInBytes: number): string;
		validatePathSecurity(filePath: string, allowedBaseDir?: string): Promise<{ isValid: boolean; errorMessage?: string; }>;
	};
	settingsUtils: {
		getAutoDeleteFiles(): Promise<boolean>;
		getAutoRunFiles(): Promise<boolean>;
		getAutoRunFilesAllowAnything(): Promise<boolean>;
		getAutomationList(listName: string): Promise<string[]>;
		getAutoRunFilesAllowList(): Promise<string[]>;
		getAutoRunFilesDenyList(): Promise<string[]>;
	};
	searchService?: any;

	imageProcessingManager?: {
		resizeImageForAI(imagePath: string, targetSizeKb?: number): Promise<{ success: boolean; base64_data: string; original_size_kb: number; final_size_kb: number; resized: boolean; scale_factor?: number; new_dimensions?: string; format: string; warning?: string; }>;
		validateImageFile(imagePath: string, maxSizeMb?: number): Promise<{ isValid: boolean; errorMessage?: string; }>;
		isImageFile(filePath: string): boolean;
		getSupportedFormats(): string[];
	};
	conversationUtilities?: {
		getCurrentConversationIndex(): number;
		analyzeConversationHistory(filePath: string, currentLog: any[]): Promise<{ prevReadSameFile: boolean; prevMaxLines: number; }>;
		getNextMessageId(): number;
		readConversationLog(conversationIndex?: number): Promise<any[]>;
		writeConversationLog(log: any[], conversationIndex?: number): Promise<boolean>;
		isConversationEmpty(conversationIndex?: number): Promise<boolean>;
		createNewConversation(): Promise<number>;
		switchConversation(index: number): Promise<{ success: boolean; message?: string; index?: number; }>;
	};
	rMarkdownParser?: {
		extractRCodeFromRmd(fileLines: string[]): string[];
		extractRmdCodeChunks(fileLines: string[]): Array<{ label?: string; start_line: number; end_line: number; code: string; language: string; options?: string; }>;
		extractExecutableRCode(fileContent: string[], filename: string): string[];
		isRMarkdownFile(filename: string): boolean;
		getDocumentType(filename: string): string;
		hasRMarkdownChunks(content: string): boolean;
	};
	outputLimiter?: {
		limitOutputText(outputText: string[] | string, maxTotalChars?: number, maxLines?: number, maxLineLength?: number): string[];
		limitFileContent(fileContent: string): string;
		limitConsoleOutput(output: string): string;
		limitSearchResults(results: string, maxMatches?: number): string;
		limitByContentType(content: string, contentType: 'file' | 'console' | 'terminal' | 'search' | 'image' | 'general'): string;
	};
}

/**
 * Document information structure
 * EXACTLY matches DocumentInfo from implementation plan
 */
export interface DocumentInfo {
	id: string;
	path: string;
	content: string;
	isActive: boolean;
	isSaved: boolean;
	metadata: {
		timestamp: string;
		lineCount: number;
		language: string;
		encoding?: string;
		dirty?: boolean;
		created?: number;
		lastContentUpdate?: number;
		lastKnownWriteTime?: number;
	};
}

/**
 * Match options for document searching
 */
export interface MatchOptions {
	caseSensitive?: boolean;
	wholeWord?: boolean;
	regex?: boolean;
}

/**
 * Match result from document searching
 */
export interface MatchResult {
	documentId: string;
	documentPath: string;
	line: number;
	column: number;
	matchText: string;
	contextBefore: string;
	contextAfter: string;
}



/**
 * Directory entry structure
 */
export interface DirectoryEntry {
	name: string;
	type: 'file' | 'directory';
	path: string;
	size?: number;
	modified?: Date;
}

/**
 * Search result from grep operations
 */
export interface SearchResult {
	file: string;
	line: number;
	column: number;
	match: string;
	context: string;
}

/**
 * Function handler interface
 * All function handlers must implement this interface
 */
export abstract class FunctionHandler {
	abstract execute(args: FunctionCallArgs, context: CallContext): Promise<FunctionResult>;
}