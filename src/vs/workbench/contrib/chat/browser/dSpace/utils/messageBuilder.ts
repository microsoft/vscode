/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { URI } from '../../../../../../base/common/uri.js';
import { basename } from '../../../../../../base/common/resources.js';
import { IRange, Range } from '../../../../../../editor/common/core/range.js';
import { ISelection } from '../../../../../../editor/common/core/selection.js';
import { IChatAgentRequest, IChatAgentHistoryEntry } from '../../../common/chatAgents.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatEditorLocationData } from '../../../common/chatService.js';
import { isPromptFileVariableEntry, isPromptTextVariableEntry } from '../../../common/chatVariableEntries.js';

export interface MessageBuilderResult {
	messages: Array<{ role: string; content: string }>;
	selections: Map<string, IRange>;
}

interface FileAttachmentResult {
	contextPart: string;
	selectedTextPart: string | null;
	selection: { uri: string; range: IRange } | null;
}

interface DirectoryAttachmentResult {
	contextPart: string;
}

/**
 * Get the language type string based on file extension
 * Returns "LaTeX" for .tex files, "Typst" for .typ files, or a generic message for other files
 */
function getLanguageTypeFromFileName(fileName: string): string {
	const extension = fileName.toLowerCase().split('.').pop();
	switch (extension) {
		case 'tex':
		case 'latex':
		case 'ltx':
		case 'sty':
		case 'cls':
		case 'bib':
			return 'LaTeX';
		case 'typ':
		case 'typst':
			return 'Typst';
		default:
			return 'code';
	}
}

/**
 * Extract text content from a chat response
 */
function extractResponseContent(response: unknown): string {
	// This is a simplified extraction - you may need to adjust based on actual response structure
	if (typeof response === 'string') {
		return response;
	}
	if (response && typeof response === 'object') {
		const obj = response as Record<string, unknown>;
		if (obj.value) {
			return String(obj.value);
		}
	}
	return '';
}

/**
 * Convert ISelection to IRange
 */
function selectionToRange(selection: ISelection): IRange {
	// ISelection has selectionStart and position, need to find min/max to create proper range
	const startLine = Math.min(selection.selectionStartLineNumber, selection.positionLineNumber);
	const endLine = Math.max(selection.selectionStartLineNumber, selection.positionLineNumber);

	let startColumn: number;
	let endColumn: number;

	if (selection.selectionStartLineNumber < selection.positionLineNumber) {
		// Forward selection
		startColumn = selection.selectionStartColumn;
		endColumn = selection.positionColumn;
	} else if (selection.selectionStartLineNumber > selection.positionLineNumber) {
		// Backward selection
		startColumn = selection.positionColumn;
		endColumn = selection.selectionStartColumn;
	} else {
		// Same line
		startColumn = Math.min(selection.selectionStartColumn, selection.positionColumn);
		endColumn = Math.max(selection.selectionStartColumn, selection.positionColumn);
	}

	return new Range(startLine, startColumn, endLine, endColumn);
}

/**
 * Extract selected text from file content based on range
 */
function extractSelectedText(fileContent: string, range: IRange): string {
	const lines = fileContent.split(/\r?\n/);
	const selectedLines: string[] = [];
	for (let lineNum = range.startLineNumber; lineNum <= range.endLineNumber; lineNum++) {
		if (lineNum >= 1 && lineNum <= lines.length) {
			const line = lines[lineNum - 1];
			if (lineNum === range.startLineNumber && lineNum === range.endLineNumber) {
				// Single line selection - extract column range
				const startCol = Math.min(range.startColumn - 1, line.length);
				const endCol = Math.min(range.endColumn - 1, line.length);
				selectedLines.push(line.substring(startCol, endCol));
			} else if (lineNum === range.startLineNumber) {
				// First line - from start column to end
				const startCol = Math.min(range.startColumn - 1, line.length);
				selectedLines.push(line.substring(startCol));
			} else if (lineNum === range.endLineNumber) {
				// Last line - from start to end column
				const endCol = Math.min(range.endColumn - 1, line.length);
				selectedLines.push(line.substring(0, endCol));
			} else {
				// Middle lines - full line
				selectedLines.push(line);
			}
		}
	}
	return selectedLines.join('\n');
}

/**
 * Process an instruction file variable
 */
async function processInstructionFile(
	fileUri: URI,
	fileService: IFileService,
	logService: ILogService
): Promise<string | null> {
	try {
		const content = await fileService.readFile(fileUri);
		const fileName = basename(fileUri);
		const fileContent = content.value.toString();
		logService.info(`[DSpaceAgent] Read instruction file: ${fileName} (${content.value.byteLength} bytes)`);
		return fileContent;
	} catch (error) {
		logService.error('[DSpaceAgent] Failed to read instruction file:', error);
		return null;
	}
}

/**
 * Process a file attachment variable
 */
async function processFileAttachment(
	variableValue: unknown,
	fileService: IFileService,
	logService: ILogService
): Promise<FileAttachmentResult | null> {
	try {
		let fileUri: URI;
		let range: IRange | undefined;

		// Check if value is an object with uri and range, or just a URI
		if (URI.isUri(variableValue)) {
			fileUri = variableValue;
		} else if (variableValue && typeof variableValue === 'object') {
			const valueObj = variableValue as { uri?: URI; range?: IRange };
			if (valueObj.uri && URI.isUri(valueObj.uri)) {
				fileUri = valueObj.uri;
				range = valueObj.range;
			} else {
				return null;
			}
		} else {
			return null;
		}

		const content = await fileService.readFile(fileUri);
		const fileName = basename(fileUri);
		const fileContent = content.value.toString();

		let selectedTextPart: string | null = null;
		let selection: { uri: string; range: IRange } | null = null;

		// If there's a range, extract the selected text
		if (range) {
			const selectedText = extractSelectedText(fileContent, range);

			// Store the selection info
			selection = {
				uri: fileUri.toString(),
				range: range,
			};

			// Determine the language type based on file extension
			const languageType = getLanguageTypeFromFileName(fileName);

			// Add selected text prominently at the beginning
			selectedTextPart = `\n\n**SELECTED TEXT IN ${fileName} (lines ${range.startLineNumber}-${range.endLineNumber}):**\n\`\`\`\n${selectedText}\n\`\`\`\n**IMPORTANT: This is the area of interest. For structural errors (like mismatched ${languageType} environments), you may need to edit code outside this selection to properly fix the issue.**`;

			logService.info(
				`[DSpaceAgent] Attached file with selection: ${fileName} (lines ${range.startLineNumber}-${range.endLineNumber})`
			);
		}

		// Add full file content
		const contextPart = `\n\n--- Attached File: ${fileName}${range ? ` (selection: lines ${range.startLineNumber}-${range.endLineNumber})` : ''} ---\n${fileContent}\n--- End of ${fileName} ---`;

		logService.info(`[DSpaceAgent] Attached file: ${fileName} (${content.value.byteLength} bytes)`);

		return {
			contextPart,
			selectedTextPart,
			selection,
		};
	} catch (error) {
		logService.error('[DSpaceAgent] Failed to read attached file:', error);
		return null;
	}
}

/**
 * Process a directory attachment variable
 */
async function processDirectoryAttachment(
	dirUri: URI,
	fileService: IFileService,
	logService: ILogService
): Promise<DirectoryAttachmentResult | null> {
	try {
		const dirName = basename(dirUri);
		const stat = await fileService.resolve(dirUri);

		if (stat.children) {
			const fileList = stat.children.map((child) => `- ${child.name}${child.isDirectory ? '/' : ''}`).join('\n');

			const contextPart = `\n\n--- Attached Directory: ${dirName} ---\nContents:\n${fileList}\n--- End of ${dirName} ---`;

			logService.info(`[DSpaceAgent] Attached directory: ${dirName} (${stat.children.length} items)`);

			return {
				contextPart,
			};
		}

		return null;
	} catch (error) {
		logService.error('[DSpaceAgent] Failed to read attached directory:', error);
		return null;
	}
}

/**
 * Build messages array from history and current request
 */
export async function buildMessages(
	history: IChatAgentHistoryEntry[],
	request: IChatAgentRequest,
	fileService: IFileService,
	logService: ILogService
): Promise<MessageBuilderResult> {
	const messages: Array<{ role: string; content: string }> = [];

	// Add history
	for (const entry of history) {
		if (entry.request) {
			messages.push({
				role: 'user',
				content: entry.request.message,
			});
		}
		if (entry.response) {
			// TODO: Extract actual content from response
			// For now, we'll use a simple text representation
			messages.push({
				role: 'assistant',
				content: extractResponseContent(entry.response),
			});
		}
	}

	// Build current message with attached context
	let currentMessage = request.message;

	// Store file selections for this request
	const selectionsForRequest = new Map<string, IRange>();

	// Process locationData first (for inline chat - this has the document and selection)
	if (request.locationData?.type === ChatAgentLocation.EditorInline) {
		const locationData = request.locationData as IChatEditorLocationData;
		const documentUri = locationData.document;
		const selection = locationData.selection;

		// Convert ISelection to IRange
		const selectionRange = selectionToRange(selection);

		logService.info(
			`[DSpaceAgent] Processing locationData for inline chat: ${documentUri.toString()}, selection: ${selectionRange.startLineNumber}-${selectionRange.endLineNumber}`
		);

		try {
			// Read the document content
			const content = await fileService.readFile(documentUri);
			const fileName = basename(documentUri);
			const fileContent = content.value.toString();

			// Extract selected text from selection range
			const selectedText = extractSelectedText(fileContent, selectionRange);

			// Store selection for tools to use
			selectionsForRequest.set(documentUri.toString(), selectionRange);

			// Determine the language type based on file extension
			const languageType = getLanguageTypeFromFileName(fileName);

			// Add selected text prominently at the beginning
			const selectedTextPart = `\n\n**SELECTED TEXT IN ${fileName} (lines ${selectionRange.startLineNumber}-${selectionRange.endLineNumber}):**\n\`\`\`\n${selectedText}\n\`\`\`\n**IMPORTANT: This is the area of interest. For structural errors (like mismatched ${languageType} environments), you may need to edit code outside this selection to properly fix the issue.**`;

			// Add full file content as context
			const fileContextPart = `\n\n--- Current File: ${fileName} (selection: lines ${selectionRange.startLineNumber}-${selectionRange.endLineNumber}) ---\n${fileContent}\n--- End of ${fileName} ---`;

			// Prepend selected text, then file context
			currentMessage = `${request.message}${selectedTextPart}${fileContextPart}`;

			logService.info(
				`[DSpaceAgent] Added inline chat context: ${fileName} with selection (${selectionRange.startLineNumber}-${selectionRange.endLineNumber})`
			);
		} catch (error) {
			logService.error('[DSpaceAgent] Failed to process locationData:', error);
		}
	}

	// Add attached files context (from variables - these are additional attachments)
	if (request.variables?.variables && request.variables.variables.length > 0) {
		logService.info(`[DSpaceAgent] Processing ${request.variables.variables.length} attached context items`);

		const contextParts: string[] = [];
		const selectedTextParts: string[] = [];
		const instructionParts: string[] = [];

		for (const variable of request.variables.variables) {
			// Handle instruction files (promptFile kind) - these should be added as system instructions
			if (isPromptFileVariableEntry(variable)) {
				const instructionContent = await processInstructionFile(variable.value, fileService, logService);
				if (instructionContent) {
					// Instructions should be added prominently, not as regular file attachments
					const fileName = basename(variable.value);
					instructionParts.push(`\n\n--- Instructions from ${fileName} ---\n${instructionContent}\n--- End of ${fileName} ---`);
					logService.info(`[DSpaceAgent] Added instruction file: ${fileName}`);
				}
			}
			// Handle prompt text instructions (inline instructions)
			else if (isPromptTextVariableEntry(variable)) {
				instructionParts.push(`\n\n--- Instructions ---\n${variable.value}\n--- End of Instructions ---`);
				logService.info(`[DSpaceAgent] Added inline instructions`);
			}
			// Handle file attachments
			else if (variable.kind === 'file') {
				const result = await processFileAttachment(variable.value, fileService, logService);
				if (result) {
					contextParts.push(result.contextPart);
					if (result.selectedTextPart) {
						selectedTextParts.push(result.selectedTextPart);
					}
					if (result.selection) {
						selectionsForRequest.set(result.selection.uri, result.selection.range);
					}
				}
			}
			// Handle directory attachments
			else if (variable.kind === 'directory' && URI.isUri(variable.value)) {
				const result = await processDirectoryAttachment(variable.value, fileService, logService);
				if (result) {
					contextParts.push(result.contextPart);
				}
			}
		}

		// Append additional context to existing message (don't overwrite locationData context)
		// Instructions should be added first, then selected text, then files
		if (instructionParts.length > 0 || selectedTextParts.length > 0 || contextParts.length > 0) {
			const instructionsSection =
				instructionParts.length > 0
					? `\n\n**PROJECT INSTRUCTIONS (follow these guidelines):**${instructionParts.join('')}`
					: '';
			const contextSection =
				selectedTextParts.length > 0
					? `\n\n**ADDITIONAL SELECTED TEXT CONTEXT:**${selectedTextParts.join('')}`
					: '';
			const filesSection =
				contextParts.length > 0 ? `\n\n**Additional attached files:**${contextParts.join('')}` : '';
			currentMessage = `${currentMessage}${instructionsSection}${contextSection}${filesSection}`;
		}
	}

	// Add current request with context
	messages.push({
		role: 'user',
		content: currentMessage,
	});

	return {
		messages,
		selections: selectionsForRequest,
	};
}
