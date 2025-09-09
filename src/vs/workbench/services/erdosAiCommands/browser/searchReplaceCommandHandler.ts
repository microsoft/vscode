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
import { ISearchAnalyzer } from '../common/searchAnalyzer.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { filterDiffForDisplay as filterDiff, diffStorage as diffStore } from '../../erdosAiUtils/browser/diffUtils.js';
import { fileChangesStorage } from '../../erdosAiUtils/browser/fileChangesUtils.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { IDocumentManager } from '../../erdosAiDocument/common/documentManager.js';
import { IPathService } from '../../../services/path/common/pathService.js';

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
		@ISearchAnalyzer private readonly searchAnalyzer: ISearchAnalyzer,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IPathService private readonly pathService: IPathService
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
					if (currentContent.length > 0 && !currentContent.endsWith('\n')) {
						newContent = currentContent + '\n' + newString;
					} else {
						newContent = currentContent + newString;
					}
					
					const resolverContext = this.createResolverContext();
					const fileResult = await this.commonUtils.resolveFile(filePath, resolverContext);
					if (!fileResult.found || !fileResult.uri) {
						throw new Error(`Could not resolve existing file: ${filePath}`);
					}
					uri = fileResult.uri;
				} else {
					isCreateMode = true;
					currentContent = '';
					newContent = newString;
					
					const resolverContext = this.createResolverContext();
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
					
					const resolverContext = this.createResolverContext();
					const fileResult = await this.commonUtils.resolveFile(filePath, resolverContext);
					if (!fileResult.found || !fileResult.uri) {
						throw new Error(`Could not resolve existing file: ${filePath}`);
					}
					uri = fileResult.uri;
				}
				
				const flexiblePattern = this.createFlexibleWhitespacePattern(oldString);
				const regex = new RegExp(flexiblePattern, 'g');
				newContent = currentContent.replace(regex, newString);
			}
			
			const conversation = this.conversationManager.getCurrentConversation();
			const conversationDir = conversation ? URI.parse(this.conversationManager.getConversationPaths(conversation.info.id).conversationDir).fsPath : undefined;

			const processedContent = await this.documentManager.processContentForWriting(filePath, newContent, conversationDir);
			
			if (isCreateMode) {
				try {
					const parentDir = URI.joinPath(uri, '..');
					if (parentDir.path && parentDir.path !== uri.path) {
						await this.fileService.createFolder(parentDir);
					}
				} catch (error) {
				}
			}
			
			await this.fileService.writeFile(uri, VSBuffer.fromString(processedContent));
			fileWritten = true;
			modificationMade = true;
			
			if (isCreateMode) {
				await this.recordFileCreation(filePath, newContent, messageId);
			} else {
				const wasUnsaved = false;
				await this.recordFileModificationWithDiff(filePath, currentContent, newContent, messageId, wasUnsaved);
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
				
				if (existingOutputMessage) {
					existingOutputMessage.output = completionMessage;
					existingOutputMessage.timestamp = new Date().toISOString();
					(existingOutputMessage as any).success = true;
					
					await this.conversationManager.saveConversationLog(currentConversation);
				}
			}
			
			if (modificationMade && fileWritten) {
				await this.openDocumentInEditor(filePath);
			}
			
		} catch (error) {
			const conversationForError = this.conversationManager.getCurrentConversation();
			if (conversationForError) {
				const existingOutputMessage = conversationForError.messages.find((m: any) => 
					m.type === 'function_call_output' && 
					m.call_id === callId &&
					m.output === "Response pending..."
				);
				
				if (existingOutputMessage) {
					existingOutputMessage.output = `Failed to apply search replace: ${error instanceof Error ? error.message : String(error)}`;
					existingOutputMessage.timestamp = new Date().toISOString();
					(existingOutputMessage as any).success = false;
					
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

	private createFlexibleWhitespacePattern(text: string): string {
		if (!text) {
			return '';
		}
		
		let escapedText = text.replace(/[.^$*+?{}[\]|()\\]/g, '\\$&');
		
		const lines = escapedText.split('\n');
		
		const flexibleLines = lines.map(line => {
			const lineTrimmed = line.replace(/[ \t]*$/, '');
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

	private createResolverContext() {
		return {
			getAllOpenDocuments: async () => {
				const docs = await this.documentManager.getAllOpenDocuments(true);
				return docs.map((doc: any) => ({
					path: doc.path,
					content: doc.content,
					isDirty: !doc.isSaved,
					isActive: doc.isActive,
					isSaved: doc.isSaved
				}));
			},
			getCurrentWorkingDirectory: async () => {
				const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
				if (workspaceFolder) {
					const workspaceRoot = workspaceFolder.uri.fsPath;
					return workspaceRoot;
				}
				
				// Follow VSCode's pattern: fall back to user home directory when no workspace
				const userHome = await this.pathService.userHome();
				const userHomePath = userHome.fsPath;
				return userHomePath;
			},
			fileExists: async (path: string) => {
				try {
					const uri = URI.file(path);
					return await this.fileService.exists(uri);
				} catch {
					return false;
				}
			},
			joinPath: (base: string, ...parts: string[]) => {
				return parts.reduce((acc, part) => acc + '/' + part, base);
			},
			getFileContent: async (uri: URI) => {
				const fileContent = await this.documentManager.getEffectiveFileContent(uri.fsPath);
				return fileContent || '';
			}
		};
	}

	private async recordFileCreation(filePath: string, content: string, messageId: number): Promise<void> {
		fileChangesStorage.setConversationManager(this.conversationManager);
		
		await fileChangesStorage.recordFileCreation(filePath, content, messageId);
		
	}

	private async recordFileModificationWithDiff(filePath: string, oldContent: string, newContent: string, messageId: number, wasUnsaved: boolean = false): Promise<void> {
		fileChangesStorage.setConversationManager(this.conversationManager);
		
		await fileChangesStorage.recordFileModification(filePath, oldContent, newContent, messageId, wasUnsaved);
		
		const { diffStorage, computeLineDiff, filterDiffForDisplay } = await import('../../erdosAiUtils/browser/diffUtils.js');
		
		const oldLines = oldContent.split('\n');
		const newLines = newContent.split('\n');
		const diffResult = computeLineDiff(oldLines, newLines);

		const filteredDiff = filterDiffForDisplay(diffResult.diff);
		
		diffStorage.storeDiffData(
			messageId.toString(),
			filteredDiff,
			oldContent,
			newContent,
			{ is_start_edit: false, is_end_edit: false },
			filePath
		);

	}

	private async openDocumentInEditor(filePath: string): Promise<void> {
		try {
			const resolverContext = this.createResolverContext();
			const pathResult = await this.commonUtils.resolveFilePathToUri(filePath, resolverContext);
			if (!pathResult.found || !pathResult.uri) {
				throw new Error(`Could not resolve file: ${filePath}`);
			}

			const uri = pathResult.uri;
			
			const existingModel = this.modelService.getModel(uri);
			
			if (existingModel) {
				try {
					const fileContent = await this.fileService.readFile(uri);
					const diskContent = fileContent.value.toString();
					
					const currentContent = existingModel.getValue();
					if (currentContent !== diskContent) {
						const textFileModel = this.textFileService.files.get(uri);
						
						if (textFileModel) {
							(textFileModel as any).ignoreDirtyOnModelContentChange = true;
							
							existingModel.setValue(diskContent);
							
							(textFileModel as any).ignoreDirtyOnModelContentChange = false;
							
							if (textFileModel.isDirty()) {
								(textFileModel as any).setDirty(false);
							}
							
						} else {
							existingModel.setValue(diskContent);
						}
					}
				} catch (error) {
					this.logService.error('Failed to refresh file content:', error);
				}
			}
			
			await this.editorService.openEditor({ 
				resource: uri,
				options: {
					preserveFocus: false,
					revealIfVisible: true
				}
			});
			
		} catch (error) {
			this.logService.error('Failed to open document in editor:', error);
		}
	}

	private async saveToWorkspaceHistory(filePath: string): Promise<void> {
		try {
			const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
			if (!workspaceFolder) return;
			
			const historyDir = URI.joinPath(workspaceFolder.uri, '.vscode', 'erdosai');
			const historyFile = URI.joinPath(historyDir, 'script_history.json');
			
			try {
				await this.fileService.createFolder(historyDir);
			} catch (error) {
			}
			
			let history: any[] = [];
			try {
				const content = await this.fileService.readFile(historyFile);
				history = JSON.parse(content.value.toString());
			} catch (error) {
			}
			
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

			// Validate required arguments (like Rao lines 894-948)
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
				const effectiveContent = await this.documentManager.getEffectiveFileContent(filePath);
				// For empty old_string, we create new file or append to existing file
				let currentContent = effectiveContent || '';
				
				// Append new content to existing content (like Rao's create/append logic)
				const newContent = currentContent + (currentContent ? '\n' : '') + newString;
				
				// Compute diff and store it (reusing existing diff computation logic)
				const { computeLineDiff } = await import('../../erdosAiUtils/browser/diffUtils.js');
				
				// Set conversation manager for file persistence
				diffStore.setConversationManager(this.conversationManager);
				
				const oldLines = currentContent.split('\n');
				const newLines = newContent.split('\n');
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
		const effectiveContent = await this.documentManager.getEffectiveFileContent(filePath);
		
		if (!effectiveContent && effectiveContent !== '') {
			const errorMsg = `File not found: ${filePath}. Please check the file path or read the current file structure.`;
			await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
			return { success: false, errorMessage: errorMsg };
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
				const fuzzyResults = this.searchAnalyzer.performFuzzySearchInContent(oldString, fileLines);
				
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

			if (matchCount > 1) {
				// Multiple matches found - provide unique context for each match (like Rao lines 1145-1191)
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
				const matchDetails = this.searchAnalyzer.generateUniqueContexts(fileLines, matchLineNums);
				
				const errorMsg = `The old_string was found ${matchCount} times in the file ${filePath}. Please provide a more specific old_string that matches exactly one location. Here are all the matches with context:\n\n${matchDetails.join('\n\n')}`;
				
				await this.saveSearchReplaceError(functionCall.call_id, messageId, errorMsg);
				return { success: false, errorMessage: errorMsg };
			}

			// SUCCESS: Exactly one match found - compute and store diff data
			
			// Simulate the replacement to get new content
			const newContent = effectiveContent.replace(new RegExp(flexiblePattern), newString);
			
			// Compute diff and store it (reusing existing diff computation logic)
			const { computeLineDiff } = await import('../../erdosAiUtils/browser/diffUtils.js');
			
			// Set conversation manager for file persistence
			diffStore.setConversationManager(this.conversationManager);
			
			const oldLines = effectiveContent.split('\n');
			const newLines = newContent.split('\n');
			const diffResult = computeLineDiff(oldLines, newLines);
		
			// Filter diff before storage to prevent storing entire files
			const filteredDiff = filterDiff(diffResult.diff);
			
			// Store filtered diff data for later retrieval
			diffStore.storeDiffData(
				messageId.toString(),
				filteredDiff,
				effectiveContent,
				newContent,
				{ is_start_edit: false, is_end_edit: false },
				filePath,
				oldString,
				newString
			);

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
}
