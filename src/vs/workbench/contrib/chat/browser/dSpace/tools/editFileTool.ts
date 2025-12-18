/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import {
	IToolImpl,
	IToolInvocation,
	IToolInvocationContext,
	IToolResult,
	CountTokensCallback,
	ToolProgress,
	IToolData,
	ToolDataSource,
} from '../../../common/languageModelToolsService.js';
import { localize } from '../../../../../../nls.js';
import { resolveFilePath } from '../utils/filePathUtils.js';
import { IChatService } from '../../../common/chatService.js';
import { ChatModel } from '../../../common/chatModel.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { TextEdit } from '../../../../../../editor/common/languages.js';
import { IRange, Range } from '../../../../../../editor/common/core/range.js';

export class EditFileTool implements IToolImpl {
	static readonly TOOL_ID = 'dSpace_editFile';

	static getToolData(): IToolData {
		return {
			id: EditFileTool.TOOL_ID,
			displayName: localize('dSpaceTool.editFile.displayName', 'Edit File'),
			modelDescription:
				'Edit existing file with search/replace. PREFERRED method for modifying files. Include enough context (3-5 lines) in oldText to make it unique. TIP: Use oldText: "" (empty string) to INSERT content at the BEGINNING of the file - works for both empty and non-empty files.',
			userDescription: 'Edit an existing file with search/replace',
			source: ToolDataSource.Internal,
			inputSchema: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'Absolute path to the file to edit',
					},
					edits: {
						type: 'array',
						description: 'Array of edit operations to apply',
						items: {
							type: 'object',
							properties: {
								oldText: {
									type: 'string',
									description:
										'Exact text to find and replace. Include enough context (3-5 lines) to make it unique.',
								},
								newText: {
									type: 'string',
									description: 'Text to replace oldText with',
								},
							},
							required: ['oldText', 'newText'],
						},
					},
				},
				required: ['path', 'edits'],
			},
		};
	}
	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IChatService private readonly chatService: IChatService,
		@ITextModelService private readonly textModelService: ITextModelService
	) { }

	async invoke(
		invocation: IToolInvocation,
		_countTokens: CountTokensCallback,
		_progress: ToolProgress,
		token: CancellationToken
	): Promise<IToolResult> {
		const args = invocation.parameters as { path: string; edits: Array<{ oldText: string; newText: string }> };
		const uri = resolveFilePath(args.path, this.workspaceContextService);

		// Get selected range from context if available
		const contextWithRange = invocation.context as IToolInvocationContext & { fileRange?: IRange };
		const selectedRange = contextWithRange?.fileRange;

		try {
			// Try to use the chat editing session if available
			if (invocation.context?.sessionResource) {
				const chatModel = this.chatService.getSession(
					invocation.context.sessionResource
				) as ChatModel | undefined;

				if (chatModel) {
					// Ensure editing session exists
					if (!chatModel.editingSession) {
						chatModel.startEditingSession(true);
					}

					const editSession = chatModel.editingSession;
					if (editSession) {
						// Get the text model for the file
						const modelRef = await this.textModelService.createModelReference(uri);
						try {
							const textModel = modelRef.object.textEditorModel;
							const request = chatModel.getRequests().at(-1);

							if (request) {
								// Signal start of text edits
								chatModel.acceptResponseProgress(request, {
									kind: 'textEdit',
									uri,
									edits: [],
								});

								// Convert string replacements to TextEdit[]
								const textEdits: TextEdit[] = [];
								let editsApplied = 0;
								const failedEdits: string[] = [];

								// Check if file is empty - special handling for empty files
								const fileContent = textModel.getValue();
								const isFileEmpty = fileContent.length === 0;

								for (const edit of args.edits) {
									// Special case: empty oldText = insert at beginning of file
									// Works for both empty files and files with existing content
									if (edit.oldText === '') {
										textEdits.push({
											range: new Range(1, 1, 1, 1),
											text: edit.newText,
										});
										editsApplied++;
										continue;
									}

									let matches: Array<{ range: Range }> = [];

									// If there's a selected range, prioritize matches within that range
									if (selectedRange) {
										// First, try to find matches within the selected range
										const searchRange = new Range(
											selectedRange.startLineNumber,
											selectedRange.startColumn,
											selectedRange.endLineNumber,
											selectedRange.endColumn
										);
										// Use the overload that accepts searchScope (IRange | IRange[])
										matches = textModel.findMatches(
											edit.oldText,
											searchRange, // searchScope: IRange
											false, // isRegex
											true, // matchCase
											null, // wordSeparators
											false, // captureMatches
											1 // limitResultCount - only first match
										);
									}

									// If no match found in selected range, search the whole file
									if (matches.length === 0) {
										// Use the overload that accepts searchOnlyEditableRange (boolean)
										matches = textModel.findMatches(
											edit.oldText,
											false, // searchOnlyEditableRange
											false, // isRegex
											true, // matchCase
											null, // wordSeparators
											false, // captureMatches
											1 // limitResultCount - only first match
										);
									}

									if (matches.length > 0) {
										const match = matches[0];
										const range = match.range;
										// TextEdit is an interface, create object directly
										textEdits.push({
											range: range,
											text: edit.newText,
										});
										editsApplied++;
									} else {
										failedEdits.push(
											edit.oldText.substring(0, 50) + (edit.oldText.length > 50 ? '...' : '')
										);
									}
								}

								if (textEdits.length > 0) {
									// Send the edits as progress
									chatModel.acceptResponseProgress(request, {
										kind: 'textEdit',
										uri,
										edits: textEdits,
									});

									// Signal end
									chatModel.acceptResponseProgress(request, {
										kind: 'textEdit',
										uri,
										edits: [],
										done: true,
									});

									if (editsApplied < args.edits.length) {
										return {
											content: [
												{
													kind: 'text',
													value: JSON.stringify({
														success: true,
														message: `File edited: ${uri.fsPath}. Warning: Only ${editsApplied} of ${args.edits.length} edits were applied. Review the changes in the diff view.`,
														path: uri.fsPath,
														editsApplied: editsApplied,
														totalEdits: args.edits.length,
														failedEdits: failedEdits,
													}),
												},
											],
										};
									}

									return {
										content: [
											{
												kind: 'text',
												value: JSON.stringify({
													success: true,
													message: `File edited: ${uri.fsPath}. Review the changes in the diff view.`,
													path: uri.fsPath,
													editsApplied: editsApplied,
												}),
											},
										],
									};
								} else {
									// Signal end even if no edits
									chatModel.acceptResponseProgress(request, {
										kind: 'textEdit',
										uri,
										edits: [],
										done: true,
									});

									// Provide guidance when edits fail
									const errorMessage = `No edits were applied. The specified text was not found in the file. TIP: Use oldText: "" to insert at the beginning.`;

									return {
										content: [
											{
												kind: 'text',
												value: JSON.stringify({
													success: false,
													error: errorMessage,
													path: uri.fsPath,
													editsApplied: 0,
													totalEdits: args.edits.length,
													failedEdits: failedEdits,
													isFileEmpty: isFileEmpty,
												}),
											},
										],
									};
								}
							}
						} finally {
							modelRef.dispose();
						}
					}
				}
			}

			// Fallback to direct file editing if no chat session
			const content = await this.fileService.readFile(uri, undefined, token);
			let text = content.value.toString();
			let editsApplied = 0;
			const failedEdits: string[] = [];
			const isFileEmpty = text.length === 0;

			// If there's a selected range, prioritize edits within that range
			if (selectedRange) {
				const lines = text.split(/\r?\n/);
				const selectedLines: string[] = [];
				for (let lineNum = selectedRange.startLineNumber; lineNum <= selectedRange.endLineNumber; lineNum++) {
					if (lineNum >= 1 && lineNum <= lines.length) {
						selectedLines.push(lines[lineNum - 1]);
					}
				}
				const selectedText = selectedLines.join('\n');

				// Try to apply edits to selected text first
				for (const edit of args.edits) {
					// Special case: empty oldText = insert at beginning of file
					if (edit.oldText === '') {
						text = edit.newText + text;
						editsApplied++;
						continue;
					}

					if (selectedText.includes(edit.oldText)) {
						const beforeText = text;
						// Find the position in the full text
						const selectedStartLine = selectedRange.startLineNumber;
						const selectedStartCol = selectedRange.startColumn;
						// Calculate offset in full text
						let offset = 0;
						for (let i = 1; i < selectedStartLine; i++) {
							offset += lines[i - 1].length + 1; // +1 for newline
						}
						offset += selectedStartCol - 1;

						// Find the match in the selected region
						const selectedMatchIndex = selectedText.indexOf(edit.oldText);
						if (selectedMatchIndex >= 0) {
							const fullMatchIndex = offset + selectedMatchIndex;
							text = text.substring(0, fullMatchIndex) + edit.newText + text.substring(fullMatchIndex + edit.oldText.length);
							if (text !== beforeText) {
								editsApplied++;
							}
						} else {
							failedEdits.push(edit.oldText.substring(0, 50) + (edit.oldText.length > 50 ? '...' : ''));
						}
					} else {
						// Try in full text as fallback
						const beforeText = text;
						text = text.replace(edit.oldText, edit.newText);
						if (text !== beforeText) {
							editsApplied++;
						} else {
							failedEdits.push(edit.oldText.substring(0, 50) + (edit.oldText.length > 50 ? '...' : ''));
						}
					}
				}
			} else {
				// No selection, apply edits to full text
				for (const edit of args.edits) {
					// Special case: empty oldText = insert at beginning of file
					if (edit.oldText === '') {
						text = edit.newText + text;
						editsApplied++;
						continue;
					}

					const beforeText = text;
					text = text.replace(edit.oldText, edit.newText);
					if (text !== beforeText) {
						editsApplied++;
					} else {
						failedEdits.push(edit.oldText.substring(0, 50) + (edit.oldText.length > 50 ? '...' : ''));
					}
				}
			}

			// Only write if at least one edit was applied
			if (editsApplied > 0) {
				await this.fileService.writeFile(uri, VSBuffer.fromString(text));
			}

			if (editsApplied === 0) {
				// Provide guidance when edits fail
				const errorMessage = `No edits were applied. The specified text was not found in the file. TIP: Use oldText: "" to insert at the beginning.`;

				return {
					content: [
						{
							kind: 'text',
							value: JSON.stringify({
								success: false,
								error: errorMessage,
								path: uri.fsPath,
								editsApplied: 0,
								totalEdits: args.edits.length,
								failedEdits: failedEdits,
								isFileEmpty: isFileEmpty,
							}),
						},
					],
				};
			}

			if (editsApplied < args.edits.length) {
				return {
					content: [
						{
							kind: 'text',
							value: JSON.stringify({
								success: true,
								message: `File edited: ${uri.fsPath}. Warning: Only ${editsApplied} of ${args.edits.length} edits were applied.`,
								path: uri.fsPath,
								editsApplied: editsApplied,
								totalEdits: args.edits.length,
								failedEdits: failedEdits,
							}),
						},
					],
				};
			}

			return {
				content: [
					{
						kind: 'text',
						value: JSON.stringify({
							success: true,
							message: `File edited: ${uri.fsPath}`,
							editsApplied: editsApplied,
							path: uri.fsPath,
						}),
					},
				],
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to edit file';
			return {
				content: [
					{
						kind: 'text',
						value: JSON.stringify({
							success: false,
							error: errorMessage,
							path: args.path,
						}),
					},
				],
			};
		}
	}
}
