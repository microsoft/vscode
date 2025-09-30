/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISearchReplaceCommandHandler } from '../common/searchReplaceCommandHandler.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { filterDiffForDisplay as filterDiff, diffStorage as diffStore } from '../../erdosAiUtils/browser/diffUtils.js';
import { fileChangesStorage } from '../../erdosAiUtils/browser/fileChangesUtils.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { IDocumentManager } from '../../erdosAiDocument/common/documentManager.js';
import { IJupytextService } from '../../erdosAiIntegration/common/jupytextService.js';
import { IFileResolverService } from '../../erdosAiUtils/common/fileResolverService.js';
import { IFileChangeTracker } from '../../erdosAi/common/fileChangeTracker.js';
import { INotebookEditorModelResolverService } from '../../../contrib/notebook/common/notebookEditorModelResolverService.js';

export class SearchReplaceCommandHandler extends Disposable implements ISearchReplaceCommandHandler {
	readonly _serviceBrand: undefined;
	
	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IModelService private readonly modelService: IModelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@IDocumentManager private readonly documentManager: IDocumentManager,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IJupytextService private readonly jupytextService: IJupytextService,
		@IFileResolverService private readonly fileResolverService: IFileResolverService,
		@IFileChangeTracker private readonly fileChangeTracker: IFileChangeTracker,
		@INotebookEditorModelResolverService private readonly notebookEditorModelResolverService: INotebookEditorModelResolverService,
	) {
		super();
	}

	async acceptSearchReplaceCommand(messageId: number, content: string, requestId: string): Promise<{status: string, data: any}> {
		try {			
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = conversation.messages.find((m: any) => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			if (functionCallMessage.function_call.name !== 'search_replace') {
				throw new Error(`Expected search_replace function call, but got ${functionCallMessage.function_call.name}`);
			}
			
			const args = JSON.parse(functionCallMessage.function_call.arguments || '{}');
			const filePath = args.file_path;
			const oldString = args.old_string;
			const newString = args.new_string;
						
			if (!filePath || oldString === null || oldString === undefined || newString === null || newString === undefined) {
				throw new Error('Missing required arguments: file_path, old_string, or new_string');
			}
			
			const cleanOldString = this.removeLineNumbers(oldString);
			const cleanNewString = this.removeLineNumbers(newString);
			
			const callId = functionCallMessage.function_call.call_id;
			
			await this.applySearchReplaceOperation(messageId, callId, filePath, cleanOldString, cleanNewString, requestId);
			
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				const targetMessage = currentConversation.messages.find((entry: any) => 
					entry.type === 'function_call_output' && 
					entry.call_id === functionCallMessage.function_call?.call_id &&
					entry.output === "Response pending..."
				);

				if (targetMessage) {
					targetMessage.output = "Search and replace completed successfully.";
					targetMessage.timestamp = new Date().toISOString();
					await this.conversationManager.saveConversationLog(currentConversation);
				}
			}
			
			await this.saveToWorkspaceHistory(filePath);
			
			// Always continue after successful search replace command
			const relatedToId = functionCallMessage.related_to || messageId;
			
			return {
				status: 'continue_silent',
				data: {
					message: 'Search replace command accepted - returning control to orchestrator',
					related_to_id: relatedToId,
					request_id: requestId
				}
			};
			
		} catch (error) {
			this.logService.error('Failed to accept search replace command:', error);
			
			return {
				status: 'error',
				data: {
					error: error instanceof Error ? error.message : String(error),
					related_to_id: messageId,
					request_id: requestId
				}
			};
		}
	}

	async cancelSearchReplaceCommand(messageId: number, requestId: string): Promise<{status: string, data: any}> {
		try {
			
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				throw new Error('No active conversation');
			}
			
			const functionCallMessage = conversation.messages.find((m: any) => m.id === messageId);
			if (!functionCallMessage?.function_call?.call_id) {
				throw new Error(`Function call message with ID ${messageId} not found or missing call_id`);
			}
			
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				const targetMessage = currentConversation.messages.find((entry: any) => 
					entry.type === 'function_call_output' && 
					entry.call_id === functionCallMessage.function_call?.call_id &&
					entry.output === "Response pending..."
				);

				if (targetMessage) {
					targetMessage.output = "Search and replace cancelled.";
					targetMessage.timestamp = new Date().toISOString();
					await this.conversationManager.saveConversationLog(currentConversation);
				}
			}
			
			// Always continue after search replace command cancellation
			const relatedToId = functionCallMessage.related_to || messageId;
			
			return {
				status: 'continue_silent',
				data: {
					message: 'Search replace command cancelled - returning control to orchestrator',
					related_to_id: relatedToId,
					request_id: requestId
				}
			};
			
		} catch (error) {
			this.logService.error('Failed to cancel search replace command:', error);
			
			return {
				status: 'error',
				data: {
					error: error instanceof Error ? error.message : String(error),
					related_to_id: messageId,
					request_id: requestId
				}
			};
		}
	}

	extractAndProcessSearchReplaceContent(accumulatedContent: string, callId: string): { content: string; isComplete: boolean } {
		const filenameMatch = accumulatedContent.match(/"file_path"\s*:\s*"([^"]*)"/);
		const filename = filenameMatch ? filenameMatch[1] : '';
		const commentSyntax = this.getCommentSyntax(filename);
		
		let result = '';
		
		const oldStringStartPattern = /"old_string"\s*:\s*"/;
		const oldStringStartMatch = accumulatedContent.match(oldStringStartPattern);
		
		if (oldStringStartMatch) {
			result += `${commentSyntax}Old content\n`;
			
			const oldStringStartPos = oldStringStartMatch.index! + oldStringStartMatch[0].length;
			const newStringPattern = /"\s*,\s*"new_string"/;
			const newStringMatch = accumulatedContent.substring(oldStringStartPos).match(newStringPattern);
			
			if (newStringMatch) {
				const oldStringEndPos = oldStringStartPos + newStringMatch.index!;
				const rawOldString = accumulatedContent.substring(oldStringStartPos, oldStringEndPos);
				const processedOldString = this.unescapeJsonString(rawOldString);
				const cleanedOldString = this.removeLineNumbers(processedOldString);
				result += cleanedOldString;
				
				result += `\n\n${commentSyntax}New content\n`;
				
				const newStringStartPattern = /"new_string"\s*:\s*"/;
				const newStringStartMatch = accumulatedContent.substring(oldStringEndPos).match(newStringStartPattern);
				
				if (newStringStartMatch) {
					const newStringStartPos = oldStringEndPos + newStringStartMatch.index! + newStringStartMatch[0].length;
					
					const newStringEndPattern = /"\s*}/;
					const newStringEndMatch = accumulatedContent.substring(newStringStartPos).match(newStringEndPattern);
					
					if (newStringEndMatch) {
						const newStringEndPos = newStringStartPos + newStringEndMatch.index!;
						const rawNewString = accumulatedContent.substring(newStringStartPos, newStringEndPos);
						const processedNewString = this.unescapeJsonString(rawNewString);
						const cleanedNewString = this.removeLineNumbers(processedNewString);
						result += cleanedNewString;
						
						return { content: result, isComplete: true };
					} else {
						const partialNewString = accumulatedContent.substring(newStringStartPos);
						if (partialNewString.length > 20) {
							const processedPartial = this.unescapeJsonString(partialNewString.substring(0, partialNewString.length - 20));
							const cleanedPartial = this.removeLineNumbers(processedPartial);
							result += cleanedPartial;
						}
					}
				}
			} else {
				const partialOldString = accumulatedContent.substring(oldStringStartPos);
				if (partialOldString.length > 20) {
					const processedPartial = this.unescapeJsonString(partialOldString.substring(0, partialOldString.length - 20));
					const cleanedPartial = this.removeLineNumbers(processedPartial);
					result += cleanedPartial;
				}
			}
		}
		
		return { content: result, isComplete: false };
	}

	private async applySearchReplaceOperation(
		messageId: number, 
		callId: string, 
		filePath: string, 
		oldString: string, 
		newString: string, 
		requestId: string
	): Promise<void> {
		let modificationMade = false;
		let fileWritten = false;
		
		try {
			let currentContent = '';
			let newContent = '';
			let uri: any;
			
			let isCreateMode = false;
			let isAppendMode = false;
			
			if (oldString === '') {
				const effectiveContent = await this.documentManager.getEffectiveFileContent(filePath);
				
				if (effectiveContent !== null) {
					isAppendMode = true;
					currentContent = effectiveContent;
					
					// For .ipynb files, handle jupytext conversion for append mode
					const isNotebookAppend = this.commonUtils.getFileExtension(filePath).toLowerCase() === 'ipynb';
					let workingContent = currentContent;
					
					if (isNotebookAppend) {
						try {
							// Convert original JSON to jupytext format for appending
							const jupytextContent = this.jupytextService.convertNotebookToText(
								currentContent, 
								{ extension: '.py', format_name: 'percent' }
							);
							workingContent = jupytextContent;
						} catch (error) {
							this.logService.error('Failed to convert notebook to jupytext for append:', error);
							// Continue with original content if conversion fails
						}
					}
					
					if (workingContent.length > 0 && !workingContent.endsWith('\n')) {
						newContent = workingContent + '\n' + newString;
					} else {
						newContent = workingContent + newString;
					}
					
					const resolverContext = this.fileResolverService.createResolverContext();
					const fileResult = await this.commonUtils.resolveFile(filePath, resolverContext);
					if (!fileResult.found || !fileResult.uri) {
						throw new Error(`Could not resolve existing file: ${filePath}`);
					}
					uri = fileResult.uri;
				} else {
					isCreateMode = true;
					currentContent = '';
					newContent = newString;
					
					// For .ipynb files in create mode, newString should be jupytext format
					// No additional conversion needed here since reverse conversion happens later
					
					const resolverContext = this.fileResolverService.createResolverContext();
					const workspaceRoot = await resolverContext.getCurrentWorkingDirectory();
					const resolvedPath = this.commonUtils.resolvePath(filePath, workspaceRoot);
					uri = URI.file(resolvedPath);
				}
			} else {
				const effectiveContent = await this.documentManager.getEffectiveFileContent(filePath);
				
				if (effectiveContent === null) {
					return;
				} else {
					currentContent = effectiveContent;
					
					const resolverContext = this.fileResolverService.createResolverContext();
					const fileResult = await this.commonUtils.resolveFile(filePath, resolverContext);
					if (!fileResult.found || !fileResult.uri) {
						throw new Error(`Could not resolve existing file: ${filePath}`);
					}
					uri = fileResult.uri;
				}
				
				// For .ipynb files, we need to work with jupytext format for the search/replace
				// but keep the original JSON for storage
				const isNotebook = this.commonUtils.getFileExtension(filePath).toLowerCase() === 'ipynb';
				let workingContent = currentContent;
				
				if (isNotebook) {
					try {
						// Convert original JSON to jupytext format for processing
						const jupytextContent = this.jupytextService.convertNotebookToText(
							currentContent, 
							{ extension: '.py', format_name: 'percent' }
						);
						workingContent = jupytextContent;
					} catch (error) {
						console.error(`[SEARCH_REPLACE_COMMAND_DEBUG] Failed to convert notebook to jupytext:`, error);
						this.logService.error('Failed to convert notebook to jupytext for search/replace:', error);
						// Continue with original content if conversion fails
					}
				}
				
				const flexiblePattern = this.createFlexibleWhitespacePattern(oldString);
				const regex = new RegExp(flexiblePattern, 'g');
				// Use custom replacement that preserves metadata from matched content
				newContent = workingContent.replace(regex, (match: string) => {
					return this.preserveMetadataInReplacement(match, newString);
				});
			}

			// For .ipynb files, convert jupytext back to notebook JSON and apply to model
			let processedContent = newContent;
			const isNotebookConvert = this.commonUtils.getFileExtension(filePath).toLowerCase() === 'ipynb';
			
			if (isNotebookConvert) {
				// For notebooks, newContent is in jupytext format - convert to notebook structure
				const notebookJson = this.jupytextService.convertTextToNotebook(
					newContent, 
					{ extension: '.py', format_name: 'percent' }
				);
				processedContent = notebookJson;
				
				if (isCreateMode) {
					const parentDir = URI.joinPath(uri, '..');
					if (parentDir.path && parentDir.path !== uri.path) {
						await this.fileService.createFolder(parentDir);
					}
				}
			
				// For notebooks, apply changes to the model and let VS Code serialize properly
				// Get or create the notebook model
				let modelRef;
				if (isCreateMode) {
					// For CREATE MODE, use untitled resource with associated file path
					modelRef = await this.notebookEditorModelResolverService.resolve(
						{ untitledResource: uri },
						'jupyter-notebook'
					);
				} else {
					// For existing files, resolve normally
					modelRef = await this.notebookEditorModelResolverService.resolve(uri, 'jupyter-notebook');
				}
				const notebookModel = modelRef.object.notebook;
				
				// Parse the new notebook structure
				const newNotebook = JSON.parse(notebookJson);
					
				// Convert cells to VS Code format
				const newCells = newNotebook.cells.map((cell: any, cellIndex: number) => {
					const vscodeMetadata: any = {};
					if (cell.cell_type === 'code' && cell.execution_count !== undefined) {
						vscodeMetadata.execution_count = cell.execution_count;
					}
					if (cell.metadata) {
						vscodeMetadata.metadata = cell.metadata;
					}
							
					const newCellData = {
						cellKind: cell.cell_type === 'markdown' ? 1 : 2,
						source: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
						language: cell.cell_type === 'code' ? 'python' : 'markdown',
						mime: cell.cell_type === 'markdown' ? 'text/markdown' : 'text/x-python',
						metadata: vscodeMetadata,
						outputs: cell.outputs || []
					};
					return newCellData;
				});
				
				// Replace all cells in the model
				notebookModel.applyEdits([{
					editType: 1,
					index: 0,
					count: notebookModel.cells.length,
					cells: newCells
				}], true, undefined, () => undefined, undefined, true);
				
				// Save the model using VS Code's proper serialization
				await modelRef.object.save();
				
				// Dispose the model reference
				modelRef.dispose();
				
				fileWritten = true;
				modificationMade = true;
			} else {
				// For regular files, write directly
				if (isCreateMode) {
					const parentDir = URI.joinPath(uri, '..');
					if (parentDir.path && parentDir.path !== uri.path) {
						await this.fileService.createFolder(parentDir);
					}
				}
				
				await this.fileService.writeFile(uri, VSBuffer.fromString(processedContent));
				fileWritten = true;
				modificationMade = true;
			}
			
			if (isCreateMode) {
				// For file creation, record the final processed content (JSON for .ipynb)
				await this.recordFileCreation(filePath, processedContent, messageId);
			} else {
				const wasUnsaved = false;
				// For .ipynb files, we need to record the original JSON formats in file_changes.json
				// but the jupytext versions were used for the diff display
				const isNotebook = this.commonUtils.getFileExtension(filePath).toLowerCase() === 'ipynb';
				
				let oldContentForStorage = currentContent;
				let newContentForStorage = processedContent; // This is the JSON format after conversion
				
				if (isNotebook) {
					// currentContent should already be original JSON from getEffectiveFileContent
					// processedContent is the converted JSON format - this is what we want to store
					oldContentForStorage = currentContent;
					newContentForStorage = processedContent;
				}
				
				await this.recordFileModificationWithDiff(filePath, oldContentForStorage, newContentForStorage, messageId, wasUnsaved);
			}
			
			const completionMessage = isCreateMode
				? `Successfully created: ${this.commonUtils.getBasename(filePath)}`
				: isAppendMode 
					? `Content appended successfully to: ${this.commonUtils.getBasename(filePath)}`
					: 'Search and replace completed successfully.';
			
			const currentConversation = this.conversationManager.getCurrentConversation();
			if (currentConversation) {
				const existingOutputMessage = currentConversation.messages.find((m: any) => 
					m.type === 'function_call_output' && 
					m.call_id === callId &&
					m.output === "Response pending..."
				);
				
				if (existingOutputMessage && 'success' in existingOutputMessage) {
					existingOutputMessage.output = completionMessage;
					existingOutputMessage.timestamp = new Date().toISOString();
					existingOutputMessage.success = true;
					
					await this.conversationManager.saveConversationLog(currentConversation);
				}
			}
			
		if (modificationMade && fileWritten) {
			// For regular files (not notebooks), open in editor to refresh
			// Notebooks were already handled above with proper model updates
			const isNotebook = this.commonUtils.getFileExtension(filePath).toLowerCase() === 'ipynb';
			if (!isNotebook) {
				await this.openDocumentInEditor(filePath);
			} else {
				// For notebooks, just open the editor to show the updated model
				await this.editorService.openEditor({ 
					resource: uri,
					options: {
						preserveFocus: false,
						revealIfVisible: true
					}
				});
			}
			
			// Trigger diff highlighting after successful search_replace
			const conversation = this.conversationManager.getCurrentConversation();
			if (conversation) {
				try {
					await this.fileChangeTracker.initializeFileChangeTracking(conversation.info.id);
				} catch (error) {
					this.logService.error('Failed to trigger diff highlighting:', error);
				}
			}
		}
			
		} catch (error) {
			const conversationForError = this.conversationManager.getCurrentConversation();
			if (conversationForError) {
				const existingOutputMessage = conversationForError.messages.find((m: any) => 
					m.type === 'function_call_output' && 
					m.call_id === callId &&
					m.output === "Response pending..."
				);
				
				if (existingOutputMessage && 'success' in existingOutputMessage) {
					existingOutputMessage.output = `Failed to apply search replace: ${error instanceof Error ? error.message : String(error)}`;
					existingOutputMessage.timestamp = new Date().toISOString();
					existingOutputMessage.success = false;
					
					await this.conversationManager.saveConversationLog(conversationForError);
				}
			}
			
			throw error;
		}
	}

	private removeLineNumbers(text: string): string {
		if (!text) {
			return text;
		}
		
		const lines = text.split('\n');
		const cleanedLines = lines.map(line => {
			return line.replace(/^\s*\d+[\|\:\s]\s*/, '');
		});
		
		return cleanedLines.join('\n');
	}

	private preserveMetadataInReplacement(matchedContent: string, replacementString: string): string {
		// For deletion operations (empty replacement string), return the replacement as-is
		if (replacementString === '') {
			return replacementString;
		}
		
		// Extract metadata from the matched content and apply it to the replacement string
		const matchedLines = matchedContent.split('\n');
		const replacementLines = replacementString.split('\n');
		
		const result: string[] = [];
		
		for (let i = 0; i < replacementLines.length; i++) {
			const replacementLine = replacementLines[i];
			const matchedLine = i < matchedLines.length ? matchedLines[i] : '';
			
			// Check if this is a notebook cell header line (handles [markdown], execution_count, etc.)
			if (replacementLine.match(/^# %%/) && matchedLine.match(/^# %%/)) {
				// Extract metadata from matched content
				const matchedMetadata = matchedLine.match(/metadata=(\{.*\})/);
				
				// Check if replacement line has metadata placeholder
				const replacementMetadata = replacementLine.match(/metadata=(\{.*\})/);
				
				if (matchedMetadata) {
					if (replacementMetadata) {
						// Replace the metadata in the replacement line with the matched metadata
						const preservedLine = replacementLine.replace(
							/metadata=\{.*\}/,
							`metadata=${matchedMetadata[1]}`
						);
						result.push(preservedLine);
					} else {
						// Add metadata to replacement line that doesn't have it
						const preservedLine = replacementLine + ` metadata=${matchedMetadata[1]}`;
						result.push(preservedLine);
					}
				} else {
					result.push(replacementLine);
				}
			} else {
				result.push(replacementLine);
			}
		}
		
		return result.join('\n');
	}

	private createFlexibleWhitespacePattern(text: string): string {
		if (!text) {
			return '';
		}
		
		let escapedText = text.replace(/[.^$*+?{}[\]|()\\]/g, '\\$&');
		
		const lines = escapedText.split('\n');
		
		const flexibleLines = lines.map(line => {
			const lineTrimmed = line.replace(/[ \t]*$/, '');
			
			// Handle notebook cell headers with flexible attribute and metadata matching
			// Pattern: # %% [cell_type] [attributes...] metadata={...}
			if (lineTrimmed.match(/^# %% \w+/)) {
				// Check if this line has metadata
				const metadataMatch = lineTrimmed.match(/^(# %% \w+)(.*)(\s+metadata=)\\\{.*\\\}(.*)$/);
				if (metadataMatch) {
					const cellTypePrefix = metadataMatch[1]; // "# %% execution_count"
					// const attributes = metadataMatch[2]; // " id=\"51ac2ebf\"" (not used - handled by .*)
					const metadataPrefix = metadataMatch[3]; // " metadata="
					const suffix = metadataMatch[4] || ''; // anything after metadata
					
					// Make attributes and metadata content flexible
					// This allows any attributes (id, etc.) and any metadata content
					return cellTypePrefix + '.*' + metadataPrefix + '\\{.*\\}' + suffix + '[ \\t]*';
				}
			}
			
			return lineTrimmed + '[ \\t]*';
		});
		
		return flexibleLines.join('\n');
	}

	private unescapeJsonString(str: string): string {
		return str
			.replace(/\\\\\\\\/g, '<<<BS>>>')
			.replace(/\\\\\\\"/g, '<<<DQ>>>')
			.replace(/\\\\\\t/g, '<<<TAB>>>')
			.replace(/\\\\\\n/g, '<<<NL>>>')
			.replace(/\\\"/g, '<<<DQ>>>')
			.replace(/\\t/g, '<<<TAB>>>')
			.replace(/\\n/g, '<<<NL>>>')
			.replace(/\\\\/g, '<<<BS>>>')
			.replace(/<<<BS>>>/g, '\\')
			.replace(/<<<DQ>>>/g, '"')
			.replace(/<<<TAB>>>/g, '\t')
			.replace(/<<<NL>>>/g, '\n');
	}

	private getCommentSyntax(filename: string): string {
		return this.commonUtils.getCommentSyntax(filename);
	}

	private async recordFileCreation(filePath: string, content: string, messageId: number): Promise<void> {
		fileChangesStorage.setConversationManager(this.conversationManager);
		await fileChangesStorage.recordFileCreation(filePath, content, messageId);
	}

	private async recordFileModificationWithDiff(filePath: string, oldContent: string, newContent: string, messageId: number, wasUnsaved: boolean = false): Promise<void> {
		// Store JSON content in file_changes.json (no diff needed - stores full content)
		fileChangesStorage.setConversationManager(this.conversationManager);
		await fileChangesStorage.recordFileModification(filePath, oldContent, newContent, messageId, wasUnsaved);
		
		// Check if diff already exists from streaming (avoid double diff computation)
		const existingDiff = diffStore.getStoredDiffEntry(messageId.toString());
		if (existingDiff) {
			return;
		}
		
		// Only compute diff if it doesn't already exist (fallback for non-streaming operations)
		await this.computeAndStoreDiff(oldContent, newContent, messageId, filePath);
	}

	/**
	 * Shared diff computation logic used by both streaming diff and conversation diff
	 * Routes to notebook-specific or regular diff computation based on file type
	 */
	private async computeAndStoreDiff(oldContent: string, newContent: string, messageId: number, filePath: string, oldString?: string, newString?: string, replaceAll?: boolean): Promise<void> {		
		// Set conversation manager for file persistence
		diffStore.setConversationManager(this.conversationManager);
		
		const isNotebook = this.commonUtils.getFileExtension(filePath).toLowerCase() === 'ipynb';
		
		if (isNotebook && oldString && newString) {
			// Use notebook-specific diff computation from diffStorage
			await diffStore.storeNotebookDiff(
				oldString, 
				newString, 
				messageId.toString(), 
				filePath,
				oldContent,
				replaceAll || false
			);
		} else {
			// Regular diff computation for non-notebook files
			const { computeLineDiff } = await import('../../erdosAiUtils/browser/diffUtils.js');
			
			// Handle empty content correctly - split('') returns [''] instead of []
			const oldLines = oldContent === '' ? [] : oldContent.split('\n');
			const newLines = newContent === '' ? [] : newContent.split('\n');
			const diffResult = computeLineDiff(oldLines, newLines);
			
			// Filter diff before storage to prevent storing entire files
			const filteredDiff = filterDiff(diffResult.diff);
			
			// Store filtered diff data for later retrieval
			diffStore.storeDiffData(
				messageId.toString(),
				filteredDiff,
				oldContent,
				newContent,
				{ is_start_edit: false, is_end_edit: false },
				filePath,
				oldString,
				newString
			);
		}
	}

	public async openDocumentInEditor(filePath: string): Promise<void> {
		const resolverContext = this.fileResolverService.createResolverContext();
		const pathResult = await this.commonUtils.resolveFile(filePath, resolverContext);
		if (!pathResult.found || !pathResult.uri) {
			throw new Error(`Could not resolve file: ${filePath}`);
		}

		const uri = pathResult.uri;
		
		// Handle notebook models differently from regular text models
		const fileExtension = this.commonUtils.getFileExtension(filePath);
		const lowerExt = fileExtension.toLowerCase();
		const isNotebook = lowerExt === 'ipynb';
		
		if (isNotebook) {			
			// For notebooks, get model reference and force load from disk
			const modelRef = await this.notebookEditorModelResolverService.resolve(uri, 'jupyter-notebook');
			
			// Force reload from disk with load() - revert()'s externalResolver doesn't properly pass force:true!
			await modelRef.object.load({ forceReadFromFile: true });
			
			// Now do a soft revert to clear dirty state and fire events without reloading again
			await modelRef.object.revert({ soft: true });
			
			// Now open the editor (model is already up to date and clean)
			await this.editorService.openEditor({ 
				resource: uri,
				options: {
					preserveFocus: false,
					revealIfVisible: true
				}
			});
		} else {
			// Handle regular text models
			const existingModel = this.modelService.getModel(uri);
			
			if (existingModel) {
				const fileContent = await this.fileService.readFile(uri);
				const diskContent = fileContent.value.toString();
				
				const currentContent = existingModel.getValue();
				if (currentContent !== diskContent) {
					const textFileModel = this.textFileService.files.get(uri);
					
					if (textFileModel) {
						// Set internal flag to prevent dirty state change during setValue
						if ('ignoreDirtyOnModelContentChange' in textFileModel) {
							(textFileModel as { ignoreDirtyOnModelContentChange: boolean }).ignoreDirtyOnModelContentChange = true;
						}
						
						existingModel.setValue(diskContent);
						
						if ('ignoreDirtyOnModelContentChange' in textFileModel) {
							(textFileModel as { ignoreDirtyOnModelContentChange: boolean }).ignoreDirtyOnModelContentChange = false;
						}
						
						if (textFileModel.isDirty() && 'setDirty' in textFileModel) {
							(textFileModel as { setDirty: (dirty: boolean) => void }).setDirty(false);
						}
						
					} else {
						existingModel.setValue(diskContent);
					}
				}
			}
			
			await this.editorService.openEditor({ 
				resource: uri,
				options: {
					preserveFocus: false,
					revealIfVisible: true
				}
			});
		}
	}

	private async saveToWorkspaceHistory(filePath: string): Promise<void> {
		try {
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			if (!workspaceFolder) return;
			
			const historyDir = URI.joinPath(workspaceFolder.uri, '.vscode', 'erdosai');
			const historyFile = URI.joinPath(historyDir, 'script_history.json');
			
			await this.fileService.createFolder(historyDir);
			
			let history: any[] = [];
			const content = await this.fileService.readFile(historyFile);
			history = JSON.parse(content.value.toString());
			
			const entry = {
				file_path: filePath,
				timestamp: new Date().toISOString(),
				workspace: workspaceFolder.name
			};
			
			history.push(entry);
			
			if (history.length > 100) {
				history = history.slice(-100);
			}
			
			await this.fileService.writeFile(historyFile, VSBuffer.fromString(JSON.stringify(history, null, 2)));
		} catch (error) {
			this.logService.error('Failed to save to workspace history:', error);
		}
	}



	async validateAndProcessSearchReplace(functionCall: any, messageId: number, relatedToId: number, requestId: string): Promise<{success: boolean, errorMessage?: string}> {
		try {
			// Parse arguments safely (like Rao's safe_parse_function_arguments)
			let args: any;
			try {
				args = JSON.parse(functionCall.arguments || '{}');
			} catch (error) {
				const errorMsg = 'Invalid JSON in search_replace arguments';
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			const filePath = args.file_path;
			let oldString = args.old_string;
			let newString = args.new_string;
			const replaceAll = args.replace_all || false;

			// Validate required arguments
			// Note: oldString can be empty string for file creation, so check for null/undefined only
			if (!filePath || oldString === null || oldString === undefined || newString === null || newString === undefined) {
				const errorMsg = 'Missing required arguments: file_path, old_string, and new_string are all required';
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			// Remove line numbers (like Rao lines 859-866)
			oldString = this.removeLineNumbers(oldString);
			newString = this.removeLineNumbers(newString);

			// Validate old_string != new_string (like Rao lines 868-891)
			if (oldString === newString) {
				const errorMsg = 'Your old_string and new_string were the same. They must be different.';
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			// Handle special case: empty old_string means create/append to file (like Rao lines 919-1066)
			if (oldString === '') {
				// For empty old_string, we allow creating new files or appending to existing ones
				let effectiveContent = await this.documentManager.getEffectiveFileContent(filePath);
				
				// Convert .ipynb files to jupytext format for create/append mode processing
				const isNotebook = this.commonUtils.getFileExtension(filePath).toLowerCase() === 'ipynb';
				
				if (effectiveContent && isNotebook) {
					try {
						const convertedContent = this.jupytextService.convertNotebookToText(
							effectiveContent, 
							{ extension: '.py', format_name: 'percent' }
						);
						effectiveContent = convertedContent;
					} catch (error) {
						// If conversion fails, include error info but continue with raw content
						effectiveContent = `# Jupytext conversion failed: ${error instanceof Error ? error.message : error}\n\n${effectiveContent}`;
					}
				}
				
				// For empty old_string, we create new file or append to existing file
				let currentContent = effectiveContent || '';
				
				// Append new content to existing content (like Rao's create/append logic)
				const newContent = currentContent + (currentContent ? '\n' : '') + newString;
				
				// Compute diff and store it (reusing existing diff computation logic)
				const { computeLineDiff } = await import('../../erdosAiUtils/browser/diffUtils.js');
				
				// Set conversation manager for file persistence
				diffStore.setConversationManager(this.conversationManager);
				
				const oldLines = currentContent === '' ? [] : currentContent.split('\n');
				const newLines = newContent === '' ? [] : newContent.split('\n');
				const diffResult = computeLineDiff(oldLines, newLines);
			
				// Filter diff before storage to prevent storing entire files (like Rao's pattern)
				const filteredDiff = filterDiff(diffResult.diff);
				
				// Store filtered diff data for later retrieval
				diffStore.storeDiffData(
					messageId.toString(),
					filteredDiff,
					currentContent,
					newContent,
					{ is_start_edit: false, is_end_edit: false },
					filePath,
					'',
					newString
				);
				
				return { success: true };
			}

			// For normal search_replace mode, validate that file exists (like Rao lines 1069-1094)
			let effectiveContent = await this.documentManager.getEffectiveFileContent(filePath);
			
			if (!effectiveContent && effectiveContent !== '') {
				const errorMsg = `File not found: ${filePath}. Please check the file path or read the current file structure.`;
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			// Convert .ipynb files to jupytext format for pattern matching (same as SearchReplaceHandler)
			const isNotebook = this.commonUtils.getFileExtension(filePath).toLowerCase() === 'ipynb';
			
			if (isNotebook) {
				try {
					const convertedContent = this.jupytextService.convertNotebookToText(
						effectiveContent, 
						{ extension: '.py', format_name: 'percent' }
					);
					effectiveContent = convertedContent;
				} catch (error) {
					console.error(`[VALIDATE_SEARCH_REPLACE_DEBUG] Jupytext conversion failed:`, error);
					// If conversion fails, include error info but continue with raw content
					effectiveContent = `# Jupytext conversion failed: ${error instanceof Error ? error.message : error}\n\n${effectiveContent}`;
				}
			}

			// CRITICAL: Do match counting validation immediately (like Rao lines 1096-1143)
			// Count occurrences of old_string in the file, allowing flexible trailing whitespace
			const flexiblePattern = this.createFlexibleWhitespacePattern(oldString);
			const oldStringMatches = [...effectiveContent.matchAll(new RegExp(flexiblePattern, 'g'))];
			const matchCount = oldStringMatches.length;

			// Handle different match scenarios - return errors that trigger continue (like Rao lines 1102-1191)
			if (matchCount === 0) {
				// Perform fuzzy search when no exact matches are found (like Rao lines 1104-1143)
				const fileLines = effectiveContent.split('\n');
				const fuzzyResults = this.performFuzzySearchInContent(oldString, fileLines);
				
				let errorMsg: string;
				if (fuzzyResults.length > 0) {
					// Create match details directly from fuzzy results (like Rao lines 1109-1119)
					const matchDetails = fuzzyResults.map((result, i) => 
						`Match ${i + 1} (${result.similarity}% similar, around line ${result.line}):\n\`\`\`\n${result.text}\n\`\`\``
					);
					
					errorMsg = `The old_string was not found exactly in the file ${filePath}. However, here are similar content matches that might be what you're looking for. If this is what you wanted, please use the exact text from one of these matches:\n\n${matchDetails.join('\n\n')}`;
				} else {
					errorMsg = 'The old_string does not exist in the file and no similar content was found. Read the content and try again with the exact text.';
				}
				
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			if (matchCount > 1 && !replaceAll) {
				// Multiple matches found - provide unique context for each match (like Rao lines 1145-1191)
				// But only error if replace_all is not true
				const fileLines = effectiveContent.split('\n');
				
				// Find line numbers for each match (like Rao lines 1149-1163)
				const matchLineNums: number[] = [];
				for (let i = 0; i < matchCount; i++) {
					const matchPos = oldStringMatches[i].index!;
					let charCount = 0;
					let lineNum = 1;
					for (const line of fileLines) {
						charCount += line.length + 1; // +1 for newline
						if (charCount >= matchPos) {
							break;
						}
						lineNum++;
					}
					matchLineNums[i] = lineNum;
				}
				
				// Generate unique context for each match
				const matchDetails = this.generateUniqueContexts(fileLines, matchLineNums);
				
				const errorMsg = `The old_string was found ${matchCount} times in the file ${filePath}. Please provide a more specific old_string that matches exactly one location, or use replace_all=true to replace all occurrences. Here are all the matches with context:\n\n${matchDetails.join('\n\n')}`;
				
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
				}
			
			// Simulate the replacement to get new content
			const newContent = replaceAll ? 
				effectiveContent.replace(new RegExp(flexiblePattern, 'g'), (match: string) => this.preserveMetadataInReplacement(match, newString)) :
				effectiveContent.replace(new RegExp(flexiblePattern), (match: string) => this.preserveMetadataInReplacement(match, newString));				
			
			// Check if this is a notebook file - use special notebook diff algorithm
			if (isNotebook) {
				// Use notebook-specific diff computation from diffStorage
				diffStore.setConversationManager(this.conversationManager);
				await diffStore.storeNotebookDiff(oldString, newString, messageId.toString(), filePath, effectiveContent, replaceAll);
			} else {
				// Use the shared diff computation logic
				await this.computeAndStoreDiff(effectiveContent, newContent, messageId, filePath, oldString, newString, replaceAll);
			}

			// Save successful function_call_output
			await this.saveSearchReplaceSuccess(functionCall.call_id, messageId);

			return { success: true };

		} catch (error) {
			this.logService.error(`[SEARCH_REPLACE] Error during validation:`, error);
			const errorMsg = `Search and replace operation failed: ${error instanceof Error ? error.message : String(error)}`;
			await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
			return { success: false, errorMessage: errorMsg };
		}
	}

	private async saveSearchReplaceError(callId: string, messageId: number, errorMessage: string): Promise<void> {
		try {
			// Replace the pending function_call_output with error
			await this.conversationManager.replacePendingFunctionCallOutput(callId, errorMessage, false); // success = false
			
			// Update conversation display immediately to replace widget with error message
			await this.conversationManager.updateConversationDisplay();
		} catch (error) {
			this.logService.error(`[SEARCH_REPLACE] Failed to save error:`, error);
		}
	}

	private async saveSearchReplaceSuccess(callId: string, messageId: number): Promise<void> {
		try {
			const successMessage = 'Response pending...';
			await this.conversationManager.replacePendingFunctionCallOutput(callId, successMessage, true); // success = true
		} catch (error) {
			this.logService.error(`[SEARCH_REPLACE] Failed to save success:`, error);
		}
	}

	// Missing methods from SearchReplaceHandler
	private performFuzzySearchInContent(searchString: string, fileLines: string[]): Array<{text: string, similarity: number, line: number}> {
		
		if (!searchString || searchString.trim().length === 0 || !fileLines || fileLines.length === 0) {
			return [];
		}
		
		searchString = searchString.trim();
		
		const fileText = fileLines.join('\n');
		
		const searchLen = searchString.length;
		const fileLen = fileText.length;
		
		if (searchLen < 3 || fileLen < searchLen) {
			return [];
		}
		
		const searchLines = searchString.split('\n');
		const seeds: string[] = [];
		const seedPositions: number[] = [];
		
		for (let i = 0; i < searchLines.length; i++) {
			const line = searchLines[i];
			const trimmedLine = line.trim();
			
			if (trimmedLine.length > 0) {
				const seedMatch = searchString.indexOf(trimmedLine);
				if (seedMatch !== -1) {
					seeds.push(trimmedLine);
					seedPositions.push(seedMatch);
				}
			}
		}
		
		const candidatePositions: Array<{filePos: number, seedMatchPos: number, seedInSearch: number}> = [];
		
		for (let j = 0; j < seeds.length; j++) {
			const seed = seeds[j];
			const seedPos = seedPositions[j];
			
			let searchStart = 0;
			while (true) {
				const matchPos = fileText.indexOf(seed, searchStart);
				if (matchPos === -1) break;
				
				const alignStart = matchPos - seedPos + 1;
				candidatePositions.push({
					filePos: alignStart,
					seedMatchPos: matchPos,
					seedInSearch: seedPos
				});
				
				searchStart = matchPos + 1;
			}
		}
		
		if (candidatePositions.length === 0) {
			return [];
		}
		
		candidatePositions.sort((a, b) => a.filePos - b.filePos);
		
		const alignments: Array<{text: string, similarity: number, line: number, distance: number, filePos: number}> = [];
		const processedPositions: number[] = [];
		
		for (const candidate of candidatePositions) {
			const filePos = candidate.filePos;
			
			if (processedPositions.some(pos => Math.abs(pos - filePos) < 10)) {
				continue;
			}
			
			const alignStart = Math.max(0, filePos - 1);
			const alignEnd = Math.min(fileLen, alignStart + searchLen);
			
			if (alignEnd > alignStart + 2) {
				const alignedText = fileText.substring(alignStart, alignEnd);
				const actualLen = alignedText.length;
				
				const compareLen = Math.min(searchLen, actualLen);
				if (compareLen >= 3) {
					const searchSubstr = searchString.substring(0, compareLen);
					const alignedSubstr = alignedText.substring(0, compareLen);
					
					const distance = this.editDistance(searchSubstr, alignedSubstr);
					const similarity = Math.round((1 - distance / compareLen) * 100 * 10) / 10;
					
					if (similarity >= 50) {
						const textBefore = fileText.substring(0, alignStart);
						const lineNum = textBefore.split('\n').length;
						
						alignments.push({
							text: alignedText,
							similarity: similarity,
							line: lineNum,
							distance: distance,
							filePos: alignStart
						});
						
						processedPositions.push(filePos);
					}
				}
			}
		}
		
		if (alignments.length === 0) {
			return [];
		}
		
		alignments.sort((a, b) => b.similarity - a.similarity);
		
		const results: Array<{text: string, similarity: number, line: number}> = [];
		const usedLineRanges: Array<{start: number, end: number}> = [];
		
		for (const alignment of alignments) {
			const startLine = alignment.line;
			const matchLines = alignment.text.split('\n');
			const endLine = startLine + matchLines.length - 1;
			
			const hasOverlap = usedLineRanges.some(usedRange => 
				!(endLine < usedRange.start || startLine > usedRange.end)
			);
			
			if (hasOverlap) {
				continue;
			}
			
			results.push({
				text: alignment.text,
				similarity: alignment.similarity,
				line: alignment.line
			});
			usedLineRanges.push({start: startLine, end: endLine});
			
			if (results.length >= 5) {
				break;
			}
		}
		
		return results;
	}

	private editDistance(str1: string, str2: string): number {
		const m = str1.length;
		const n = str2.length;
		
		const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
		
		for (let i = 0; i <= m; i++) {
			dp[i][0] = i;
		}
		for (let j = 0; j <= n; j++) {
			dp[0][j] = j;
		}
		
		for (let i = 1; i <= m; i++) {
			for (let j = 1; j <= n; j++) {
				if (str1[i - 1] === str2[j - 1]) {
					dp[i][j] = dp[i - 1][j - 1];
				} else {
					dp[i][j] = 1 + Math.min(
						dp[i - 1][j],
						dp[i][j - 1],
						dp[i - 1][j - 1]
					);
				}
			}
		}
		
		return dp[m][n];
	}

	private generateUniqueContexts(fileLines: string[], matchLineNums: number[]): string[] {
		
		if (matchLineNums.length <= 1) {
			return [];
		}
		
		const maxContext = 10;
		
		for (let contextSize = 1; contextSize <= maxContext; contextSize++) {
			const currentContexts: Array<{context: string, display: string}> = [];
			
			for (let i = 0; i < matchLineNums.length; i++) {
				const lineNum = matchLineNums[i];
				
				const startLine = Math.max(1, lineNum - contextSize);
				const endLine = Math.min(fileLines.length, lineNum + contextSize);
				const contextLines = fileLines.slice(startLine - 1, endLine);
				
				const contextStr = contextLines.join('\n');
				const display = `Match ${i + 1} (around line ${lineNum}):\n\`\`\`\n${contextStr}\n\`\`\``;
				
				currentContexts[i] = {
					context: contextStr,
					display: display
				};
			}
			
			const contextStrings = currentContexts.map(x => x.context);
			const uniqueContexts = [...new Set(contextStrings)];
			if (uniqueContexts.length === contextStrings.length) {
				return currentContexts.map(x => x.display);
			}
		}
		
		const finalContexts: string[] = [];
		for (let i = 0; i < matchLineNums.length; i++) {
			const lineNum = matchLineNums[i];
			const startLine = Math.max(1, lineNum - maxContext);
			const endLine = Math.min(fileLines.length, lineNum + maxContext);
			const contextLines = fileLines.slice(startLine - 1, endLine);
			
			finalContexts[i] = `Match ${i + 1} (around line ${lineNum}):\n\`\`\`\n${contextLines.join('\n')}\n\`\`\``;
		}
		
		return finalContexts;
	}

	// Function execution method compatible with FunctionCallService
	async executeSearchReplace(args: any, context: any): Promise<any> {
		try {
			const filePath = args.file_path;
			let oldString = args.old_string;
			let newString = args.new_string;
			const replaceAll = args.replace_all || false;

			if (oldString) {
				oldString = this.removeLineNumbers(oldString);
			}
			if (newString) {
				newString = this.removeLineNumbers(newString);
			}

			if (oldString && newString && oldString === newString) {
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: 'Your old_string and new_string were the same. They must be different.',
					related_to: context.functionCallMessageId!,
					success: false,
					procedural: false
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					status: 'continue_silent'
				};
			}

			if (!filePath || oldString === null || oldString === undefined || newString === null || newString === undefined) {
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: 'Error: Missing required arguments (file_path, old_string, or new_string)',
					related_to: context.functionCallMessageId!,
					success: false,
					procedural: false
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					status: 'continue_silent'
				};
			}

			if (oldString === '') {
				let effectiveContent = await context.documentManager.getEffectiveFileContent(filePath);
				let originalContent = effectiveContent;
				const isNewFile = effectiveContent === null;
				
				const isNotebook = context.commonUtils.getFileExtension(filePath).toLowerCase() === 'ipynb';
				
				if (effectiveContent !== null && isNotebook) {
					try {
						const convertedContent = context.jupytextService.convertNotebookToText(
							effectiveContent, 
							{ extension: '.py', format_name: 'percent' }
						);
						effectiveContent = convertedContent;
					} catch (error) {
						console.error(`Jupytext conversion failed in create/append mode:`, error);
						effectiveContent = `# Jupytext conversion failed: ${error instanceof Error ? error.message : error}\n\n${effectiveContent}`;
					}
				}
				
				let newContentForDiff: string;
				let finalFileContent: string;
				
				if (isNewFile) {
					newContentForDiff = newString;
					finalFileContent = newString;
				} else {
					const fileContent = effectiveContent || '';
					if (fileContent.length > 0 && !fileContent.endsWith('\n')) {
						finalFileContent = fileContent + '\n' + newString;
					} else {
						finalFileContent = fileContent + newString;
					}
					newContentForDiff = newString;
				}
				
				try {
					const { computeLineDiff } = await import('../../erdosAiUtils/browser/diffUtils.js');
					const { filterDiffForDisplay } = await import('../../erdosAiUtils/browser/diffUtils.js');
					const { diffStorage } = await import('../../erdosAiUtils/browser/diffUtils.js');
					
					const oldLines: string[] = [];
					const newLines = newContentForDiff.split('\n');
					
					const diffResult = computeLineDiff(oldLines, newLines);
					
					if (!isNewFile) {
						const existingLineCount = (effectiveContent || '').split('\n').length;
						
						for (let i = 0; i < diffResult.diff.length; i++) {
							const diffItem = diffResult.diff[i];
							if (diffItem.new_line !== undefined && diffItem.new_line !== null) {
								diffItem.new_line = diffItem.new_line + existingLineCount;
							}
						}
					}
					
					filterDiffForDisplay(diffResult.diff);
					
					const oldContentForStorage = isNotebook ? (effectiveContent || '') : (originalContent || '');
					const newContentForStorage = isNotebook ? finalFileContent : finalFileContent;
					
					diffStorage.storeDiffData(
						context.functionCallMessageId?.toString() || '0',
						diffResult.diff,
						oldContentForStorage,
						newContentForStorage,
						{ is_start_edit: false, is_end_edit: false },
						filePath,
						oldString,
						newString
					);
					
				} catch (error) {
					console.error(` Error computing/storing create/append diff data:`, error);
				}
				
				const outputMessage = isNewFile 
					? `Ready to create new file: ${context.commonUtils.getBasename(filePath)}` 
					: `Ready to append to: ${context.commonUtils.getBasename(filePath)}`;

				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: outputMessage,
					related_to: context.functionCallMessageId!,
					success: true
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					file_path: filePath,
					old_string: oldString,
					new_string: newString,
					is_create_append_mode: true,
				};
			}

			let effectiveContent = await context.documentManager.getEffectiveFileContent(filePath);
			let originalContent = effectiveContent;
			
			const isNotebook = context.commonUtils.getFileExtension(filePath).toLowerCase() === 'ipynb';
			
			if (effectiveContent !== null && isNotebook) {
				try {
					const convertedContent = context.jupytextService.convertNotebookToText(
						effectiveContent, 
						{ extension: '.py', format_name: 'percent' }
					);
					effectiveContent = convertedContent;
				} catch (error) {
					console.error(`Jupytext conversion failed:`, error);
					effectiveContent = `# Jupytext conversion failed: ${error instanceof Error ? error.message : error}\n\n${effectiveContent}`;
				}
			}
			
			if (effectiveContent === null) {
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: `File not found: ${filePath}. Please check the file path or read the current file structure.`,
					related_to: context.functionCallMessageId!,
					success: false,
					procedural: false
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					status: 'continue_silent'
				};
			}

			const flexiblePattern = this.createFlexibleWhitespacePattern(oldString);
			
			const regex = new RegExp(flexiblePattern, 'g');
			const oldStringMatches: RegExpExecArray[] = [];
			let match;
			while ((match = regex.exec(effectiveContent)) !== null) {
				oldStringMatches.push(match);
				if (!regex.global) break;
			}
			const matchCount = oldStringMatches.length;

			if (matchCount === 0) {
				const fileLines = effectiveContent.split('\n');
				const fuzzyResults = this.performFuzzySearchInContent(oldString, fileLines);
				
				let errorMessage: string;
				if (fuzzyResults.length > 0) {
					const matchDetails = fuzzyResults.map((result, i) => {
						return `Match ${i + 1} (${result.similarity}% similar, around line ${result.line}):\n\`\`\`\n${result.text}\n\`\`\``;
					});
					
					errorMessage = `The old_string was not found exactly in the file ${filePath}. However, here are similar content matches that might be what you're looking for. If this is what you wanted, please use the exact text from one of these matches:\n\n${matchDetails.join('\n\n')}`;
				} else {
					errorMessage = `The old_string does not exist in the file and no similar content was found. Read the content and try again with the exact text.`;
				}
				
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: errorMessage,
					related_to: context.functionCallMessageId!,
					success: false,
					procedural: false
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					status: 'continue_silent'
				};
			}

			if (matchCount > 1 && !replaceAll) {
				const fileLines = effectiveContent.split('\n');
				
				const matchLineNums: number[] = [];
				for (let i = 0; i < matchCount; i++) {
					const matchPos = oldStringMatches[i].index!;
					let charCount = 0;
					let lineNum = 1;
					for (const line of fileLines) {
						charCount += line.length + 1;
						if (charCount >= matchPos) {
							break;
						}
						lineNum++;
					}
					matchLineNums[i] = lineNum;
				}
				
				const matchDetails = this.generateUniqueContexts(fileLines, matchLineNums);
				
				const errorMessage = `The old_string was found ${matchCount} times in the file ${filePath}. Please provide a more specific old_string that matches exactly one location, or use replace_all=true to replace all occurrences. Here are all the matches with context:\n\n${matchDetails.join('\n\n')}`;
				
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: errorMessage,
					related_to: context.functionCallMessageId!,
					success: false,
					procedural: false
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					status: 'continue_silent'
				};
			}

			const newContent = replaceAll ? 
			effectiveContent.replace(new RegExp(flexiblePattern, 'g'), (match: string) => this.preserveMetadataInReplacement(match, newString)) :
			effectiveContent.replace(new RegExp(flexiblePattern), (match: string) => this.preserveMetadataInReplacement(match, newString));
			
			try {
				const { diffStorage } = await import('../../erdosAiUtils/browser/diffUtils.js');
				
				if (isNotebook) {					
					await diffStorage.storeNotebookDiff(
						oldString, 
						newString, 
						context.functionCallMessageId?.toString() || '0',
						filePath,
						effectiveContent
					);
				} else {
					const { computeLineDiff } = await import('../../erdosAiUtils/browser/diffUtils.js');
					const { filterDiffForDisplay } = await import('../../erdosAiUtils/browser/diffUtils.js');
					
					const oldLines = effectiveContent === '' ? [] : effectiveContent.split('\n');
					const newLines = newContent === '' ? [] : newContent.split('\n');
					
					const diffResult = computeLineDiff(oldLines, newLines);
					
					filterDiffForDisplay(diffResult.diff);
					
					const oldContentForStorage = originalContent || effectiveContent;
					const newContentForStorage = newContent;
					
					diffStorage.storeDiffData(
						context.functionCallMessageId?.toString() || '0',
						diffResult.diff,
						oldContentForStorage,
						newContentForStorage,
						{ is_start_edit: false, is_end_edit: false },
						filePath,
						oldString,
						newString
					);
				}
								
			} catch (error) {
				console.error(` Error computing/storing diff data:`, error);
			}
			
			const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (functionOutputId === null) {
				throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
			}

			const functionCallOutput = {
				id: functionOutputId,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: 'Response pending...',
				related_to: context.functionCallMessageId!,
				procedural: true
			};

			return {
				type: 'success',
				function_call_output: functionCallOutput,
				function_output_id: functionOutputId,
				file_path: filePath,
				old_string: oldString,
				new_string: newString,
			};

		} catch (error) {
			console.error(` Error processing search_replace:`, error);
			return {
				type: 'error',
				error_message: `Search and replace operation failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

}
