/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken }

/**
 * CommandMultiplexerTool - Provides access to all edit operations through a single interface
 * This wrapper tool helps bridge VS Code's architecture with our command-based approach
 */
export class CommandMultiplexerTool implements IToolImpl {
    constructor(
        @IInstantiationService private readonly instantiationService: IInstantiationService
    ) {}

    async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
        // Create EditTool instance from service
        const editTool = this.instantiationService.createInstance(EditTool);

        // Forward the invocation to EditTool
        return editTool.invoke(invocation, countTokens, token);
    }

    async prepareToolInvocation(parameters: any, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
        return {
            presentation: 'hidden'
        };
    }
}

// Registration function for tools
export function registerEditTools(instantiationService: IInstantiationService, registry: any) {
    // Register the primary edit tool with command-based operations
    registry.registerTool(EditToolId, instantiationService.createInstance(EditTool));

    // Optional: Register command multiplexer if needed in some contexts
    registry.registerTool('vscode_commandEditFile', instantiationService.createInstance(CommandMultiplexerTool));
} from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPosition, SaveReason } from '../../../../common/editor.js';
import { Range } from '../../../../common/core/range.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ICodeMapperService } from '../../common/chatCodeMapperService.js';
import { IChatEditingService } from '../../common/chatEditingService.js';
import { ChatModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ILanguageModelIgnoredFilesService } from '../../common/ignoredFiles.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolResult } from '../../common/languageModelToolsService.js';
import { IToolInputProcessor } from './tools.js';
import * as path from '../../../../../base/common/path.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ITextModelService } from '../../../../common/services/resolverService.js';
import { IModelService } from '../../../../common/services/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

// Enhanced file history tracking
interface FileHistoryEntry {
  uri: URI;
  content: string;
  timestamp: number;
}

interface FileHistoryMap {
  [uriString: string]: FileHistoryEntry[];
}

// Command operation enum
enum EditCommand {
  VIEW = 'view',
  CREATE = 'create',
  STR_REPLACE = 'str_replace',
  INSERT = 'insert',
  UNDO_EDIT = 'undo_edit'
}

const codeInstructions = `
The user is very smart and can understand how to apply your edits to their files, you just need to provide minimal hints.
Avoid repeating existing code, instead use comments to represent regions of unchanged code. The user prefers that you are as concise as possible. For example:
// ...existing code...
{ changed code }
// ...existing code...
{ changed code }
// ...existing code...

Here is an example of how you should use format an edit to an existing Person class:
class Person {
	// ...existing code...
	age: number;
	// ...existing code...
	getAge() {
		return this.age;
	}
}
`;

// Updated EditTool schema to include command-based operations
export const EditToolId = 'vscode_editFile';
export const EditToolData: IToolData = {
	id: EditToolId,
	tags: ['vscode_editing'],
	displayName: localize('chat.tools.editFile', "Edit File"),
	modelDescription: `Edit a file in the workspace. Use this tool for any file operations including viewing, creating, editing and reverting changes. ${codeInstructions}`,
	inputSchema: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				enum: ['edit', 'view', 'create', 'str_replace', 'insert', 'undo_edit'],
				description: 'The command to execute. Use "edit" for standard editing (default), "view" to display file contents, "create" for new files, "str_replace" for precise string replacement, "insert" to insert at a specific line, or "undo_edit" to revert changes.'
			},
			explanation: {
				type: 'string',
				description: 'A short explanation of the operation being performed.'
			},
			filePath: {
				type: 'string',
				description: 'An absolute path to the file to operate on, or the URI of an untitled file, such as `untitled:Untitled-1`.'
			},
			code: {
				type: 'string',
				description: 'The code for edit/create operations. ' + codeInstructions
			},
			old_str: {
				type: 'string',
				description: 'The exact string to replace (for str_replace command).'
			},
			new_str: {
				type: 'string',
				description: 'The new string to insert (for str_replace or insert commands).'
			},
			insert_line: {
				type: 'integer',
				description: 'Line number after which to insert text (for insert command).'
			},
			view_range: {
				type: 'array',
				items: {
					type: 'integer'
				},
				description: 'Optional line range [start, end] for viewing a file.'
			}
		},
		required: ['filePath']
	}
};

export class EditTool implements IToolImpl {
    // Enhanced file history tracking
    private fileHistory: FileHistoryMap = {};
    private readonly maxHistoryEntries = 10;

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@ICodeMapperService private readonly codeMapperService: ICodeMapperService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILanguageModelIgnoredFilesService private readonly ignoredFilesService: ILanguageModelIgnoredFilesService,
		@ITextFileService private readonly textFileService: ITextFileService,
        @IFileService private readonly fileService: IFileService,
        @ILogService private readonly logService: ILogService,
        @ITextModelService private readonly textModelService: ITextModelService,
        @IModelService private readonly modelService: IModelService,
        @IInstantiationService private readonly instantiationService: IInstantiationService,
        @IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
		if (!invocation.context) {
			throw new Error('toolInvocationToken is required for this tool');
		}

		const parameters = invocation.parameters as EditToolParams;

        // Determine which command to execute
        const command = parameters.command || 'edit'; // Default to standard edit if not specified

        // Process the command
        switch (command) {
            case 'view':
                return this.handleViewCommand(parameters, invocation, token);
            case 'create':
                return this.handleCreateCommand(parameters, invocation, token);
            case 'str_replace':
                return this.handleStrReplaceCommand(parameters, invocation, token);
            case 'insert':
                return this.handleInsertCommand(parameters, invocation, token);
            case 'undo_edit':
                return this.handleUndoEditCommand(parameters, invocation, token);
            case 'edit':
            default:
                return this.handleStandardEditCommand(parameters, invocation, countTokens, token);
        }
	}

    /**
     * Handle view command - displays file contents with optional range
     */
    private async handleViewCommand(parameters: EditToolParams, invocation: IToolInvocation, token: CancellationToken): Promise<IToolResult> {
        const uri = await this.resolveAndValidatePath(parameters.file);

        if (!this.workspaceContextService.isInsideWorkspace(uri)) {
            throw new Error(`File ${uri.fsPath} can't be viewed because it's not inside the current workspace`);
        }

        try {
            // Check if path is a directory
            const stat = await this.fileService.stat(uri);

            if (stat.isDirectory) {
                // List directory contents
                const entries = await this.fileService.readdir(uri);
                const visible = entries.map(entry => entry.name).filter(name => !name.startsWith('.'));

                const model = this.chatService.getSession(invocation.context?.sessionId) as ChatModel;
                const request = model.getRequests().at(-1)!;

                model.acceptResponseProgress(request, {
                    kind: 'markdownContent',
                    content: new MarkdownString(`Directory listing for \`${uri.fsPath}\`:\n\n${visible.join('\n')}`)
                });

                return {
                    content: [{ kind: 'text', value: `Directory listing for ${uri.fsPath}` }]
                };
            } else {
                // Read file content
                const content = await this.readFile(uri);
                const lines = content.split('\n');

                let displayedContent: string;

                // Apply view range if specified
                if (parameters.view_range && parameters.view_range.length === 2) {
                    const [start, end] = parameters.view_range;
                    const total = lines.length;

                    if (start < 1 || start > total) {
                        throw new Error(`Invalid view_range: start line ${start} out of range.`);
                    }

                    const endLine = end === -1 || end > total ? total : end;
                    displayedContent = lines.slice(start - 1, endLine)
                        .map((line, i) => `${i + start}: ${line}`)
                        .join('\n');
                } else {
                    displayedContent = lines
                        .map((line, i) => `${i + 1}: ${line}`)
                        .join('\n');
                }

                const model = this.chatService.getSession(invocation.context?.sessionId) as ChatModel;
                const request = model.getRequests().at(-1)!;

                model.acceptResponseProgress(request, {
                    kind: 'markdownContent',
                    content: new MarkdownString(`File: \`${uri.fsPath}\`\n\n\`\`\`\n${displayedContent}\n\`\`\``)
                });

                return {
                    content: [{
                        kind: 'text',
                        value: `Displayed file content for ${uri.fsPath}${parameters.view_range ? ` (lines ${parameters.view_range[0]}-${parameters.view_range[1]})` : ''}`
                    }]
                };
            }
        } catch (error) {
            this.logService.error(`Error viewing path: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Error viewing path: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Handle create command - creates a new file with content
     */
    private async handleCreateCommand(parameters: EditToolParams, invocation: IToolInvocation, token: CancellationToken): Promise<IToolResult> {
        if (!parameters.code) {
            throw new Error('Parameter `code` is required for create command');
        }

        const uri = await this.resolveAndValidatePath(parameters.file);

        if (!this.workspaceContextService.isInsideWorkspace(uri)) {
            throw new Error(`File ${uri.fsPath} can't be created because it's not inside the current workspace`);
        }

        try {
            // Check if file already exists
            try {
                await this.fileService.stat(uri);
                throw new Error(`File already exists at ${uri.fsPath}`);
            } catch (err) {
                // File doesn't exist, which is what we want
            }

            // Ensure parent directory exists
            await this.ensureParentDirectoryExists(uri);

            // Create file with content
            await this.fileService.writeFile(
                uri,
                VSBuffer.fromString(parameters.code)
            );

            // Show success message in chat
            const model = this.chatService.getSession(invocation.context?.sessionId) as ChatModel;
            const request = model.getRequests().at(-1)!;

            model.acceptResponseProgress(request, {
                kind: 'markdownContent',
                content: new MarkdownString(`Created file: \`${uri.fsPath}\`\n\n\`\`\`\n${parameters.code}\n\`\`\``)
            });

            return {
                content: [{ kind: 'text', value: `File created at ${uri.fsPath}` }]
            };
        } catch (error) {
            this.logService.error(`Error creating file: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Error creating file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Handle string replace command - precisely replaces one string with another
     */
    private async handleStrReplaceCommand(parameters: EditToolParams, invocation: IToolInvocation, token: CancellationToken): Promise<IToolResult> {
        if (!parameters.old_str || !parameters.new_str) {
            throw new Error('Parameters `old_str` and `new_str` are required for str_replace command');
        }

        const uri = await this.resolveAndValidatePath(parameters.file);

        if (!this.workspaceContextService.isInsideWorkspace(uri)) {
            throw new Error(`File ${uri.fsPath} can't be edited because it's not inside the current workspace`);
        }

        try {
            // Save file to history before editing
            await this.saveFileHistory(uri);

            // Read current content
            const content = await this.readFile(uri);

            // Check if old_str exists and is unique
            const count = content.split(parameters.old_str).length - 1;
            if (count === 0) {
                throw new Error(`String to replace not found in ${uri.fsPath}`);
            }
            if (count > 1) {
                throw new Error(`Found ${count} occurrences of the string to replace in ${uri.fsPath}. Please make it unique.`);
            }

            // Replace string
            const newContent = content.replace(parameters.old_str, parameters.new_str);

            // Write updated content
            await this.fileService.writeFile(
                uri,
                VSBuffer.fromString(newContent)
            );

            // Save the file
            await this.textFileService.save(uri, {
                reason: SaveReason.AUTO,
                skipSaveParticipants: true,
            });

            // Show string replacement in chat
            const model = this.chatService.getSession(invocation.context?.sessionId) as ChatModel;
            const request = model.getRequests().at(-1)!;

            // Use diff-style format to show the change
            model.acceptResponseProgress(request, {
                kind: 'markdownContent',
                content: new MarkdownString(`Updated file: \`${uri.fsPath}\`\n\n\`\`\`diff\n- ${parameters.old_str}\n+ ${parameters.new_str}\n\`\`\``)
            });

            return {
                content: [{ kind: 'text', value: `Successfully replaced text in ${uri.fsPath}` }]
            };
        } catch (error) {
            this.logService.error(`Error replacing string: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Error replacing string: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Handle insert command - inserts text at a specific line
     */
    private async handleInsertCommand(parameters: EditToolParams, invocation: IToolInvocation, token: CancellationToken): Promise<IToolResult> {
        if (parameters.insert_line === undefined || !parameters.new_str) {
            throw new Error('Parameters `insert_line` and `new_str` are required for insert command');
        }

        const uri = await this.resolveAndValidatePath(parameters.file);

        if (!this.workspaceContextService.isInsideWorkspace(uri)) {
            throw new Error(`File ${uri.fsPath} can't be edited because it's not inside the current workspace`);
        }

        try {
            // Save file to history before editing
            await this.saveFileHistory(uri);

            // Read current content
            const content = await this.readFile(uri);
            const lines = content.split('\n');

            // Validate insert line
            if (parameters.insert_line < 0 || parameters.insert_line > lines.length) {
                throw new Error(`Invalid insert line: ${parameters.insert_line}. File has ${lines.length} lines.`);
            }

            // Insert the new line
            const newLines = [
                ...lines.slice(0, parameters.insert_line),
                parameters.new_str,
                ...lines.slice(parameters.insert_line)
            ];

            // Write updated content
            await this.fileService.writeFile(
                uri,
                VSBuffer.fromString(newLines.join('\n'))
            );

            // Save the file
            await this.textFileService.save(uri, {
                reason: SaveReason.AUTO,
                skipSaveParticipants: true,
            });

            // Show insertion in chat
            const model = this.chatService.getSession(invocation.context?.sessionId) as ChatModel;
            const request = model.getRequests().at(-1)!;

            model.acceptResponseProgress(request, {
                kind: 'markdownContent',
                content: new MarkdownString(`Inserted text at line ${parameters.insert_line} in \`${uri.fsPath}\`:\n\n\`\`\`\n${parameters.new_str}\n\`\`\``)
            });

            return {
                content: [{ kind: 'text', value: `Inserted text at line ${parameters.insert_line} in ${uri.fsPath}` }]
            };
        } catch (error) {
            this.logService.error(`Error inserting text: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Error inserting text: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Handle undo edit command - reverts last change to a file
     */
    private async handleUndoEditCommand(parameters: EditToolParams, invocation: IToolInvocation, token: CancellationToken): Promise<IToolResult> {
        const uri = await this.resolveAndValidatePath(parameters.file);

        if (!this.workspaceContextService.isInsideWorkspace(uri)) {
            throw new Error(`File ${uri.fsPath} can't be reverted because it's not inside the current workspace`);
        }

        try {
            const result = await this.undoFileEdit(uri);

            // Show undo result in chat
            const model = this.chatService.getSession(invocation.context?.sessionId) as ChatModel;
            const request = model.getRequests().at(-1)!;

            model.acceptResponseProgress(request, {
                kind: 'markdownContent',
                content: new MarkdownString(`Reverted changes to \`${uri.fsPath}\``)
            });

            return {
                content: [{ kind: 'text', value: result }]
            };
        } catch (error) {
            this.logService.error(`Error undoing edit: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Error undoing edit: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Handle standard edit command - uses VS Code's built-in editing with mapping
     */
    private async handleStandardEditCommand(
        parameters: EditToolParams,
        invocation: IToolInvocation,
        countTokens: CountTokensCallback,
        token: CancellationToken
    ): Promise<IToolResult> {
        if (!parameters.code) {
            throw new Error('Parameter `code` is required for edit command');
        }

        const uri = await this.resolveAndValidatePath(parameters.file);

        if (!this.workspaceContextService.isInsideWorkspace(uri)) {
            throw new Error(`File ${uri.fsPath} can't be edited because it's not inside the current workspace`);
        }

        if (await this.ignoredFilesService.fileIsIgnored(uri, token)) {
            throw new Error(`File ${uri.fsPath} can't be edited because it is configured to be ignored by Copilot`);
        }

        // Save original content before editing (for enhanced history management)
        try {
            await this.saveFileHistory(uri);
        } catch (error) {
            this.logService.warn(`Failed to save file history: ${error instanceof Error ? error.message : String(error)}`);
            // Continue anyway - this is non-critical functionality
        }

        const model = this.chatService.getSession(invocation.context?.sessionId) as ChatModel;
        const request = model.getRequests().at(-1)!;

        // Undo stops mark groups of response data in the output. Operations, such
        // as text edits, that happen between undo stops are all done or undone together.
        if (request.response?.response.getMarkdown().length) {
            // slightly hacky way to avoid an extra 'no-op' undo stop at the start of responses that are just edits
            model.acceptResponseProgress(request, {
                kind: 'undoStop',
                id: generateUuid(),
            });
        }

        model.acceptResponseProgress(request, {
            kind: 'markdownContent',
            content: new MarkdownString('\n````\n')
        });
        model.acceptResponseProgress(request, {
            kind: 'codeblockUri',
            uri
        });
        model.acceptResponseProgress(request, {
            kind: 'markdownContent',
            content: new MarkdownString(parameters.code + '\n````\n')
        });
        model.acceptResponseProgress(request, {
            kind: 'textEdit',
            edits: [],
            uri
        });

        const editSession = this.chatEditingService.getEditingSession(model.sessionId);
        if (!editSession) {
            throw new Error('This tool must be called from within an editing session');
        }

        const result = await this.codeMapperService.mapCode({
            codeBlocks: [{ code: parameters.code, resource: uri, markdownBeforeBlock: parameters.explanation }],
            location: 'tool',
            chatRequestId: invocation.chatRequestId
        }, {
            textEdit: (target, edits) => {
                model.acceptResponseProgress(request, { kind: 'textEdit', uri: target, edits });
            },
            notebookEdit(target, edits) {
                model.acceptResponseProgress(request, { kind: 'notebookEdit', uri: target, edits });
            },
        }, token);

        model.acceptResponseProgress(request, { kind: 'textEdit', uri, edits: [], done: true });

        if (result?.errorMessage) {
            throw new Error(result.errorMessage);
        }

        let dispose: IDisposable;
        await new Promise((resolve) => {
            // The file will not be modified until the first edits start streaming in,
            // so wait until we see that it _was_ modified before waiting for it to be done.
            let wasFileBeingModified = false;

            dispose = autorun((r) => {
                const entries = editSession.entries.read(r);
                const currentFile = entries?.find((e) => e.modifiedURI.toString() === uri.toString());
                if (currentFile) {
                    if (currentFile.isCurrentlyBeingModifiedBy.read(r)) {
                        wasFileBeingModified = true;
                    } else if (wasFileBeingModified) {
                        resolve(true);
                    }
                }
            });
        }).finally(() => {
            dispose.dispose();
        });

        await this.textFileService.save(uri, {
            reason: SaveReason.AUTO,
            skipSaveParticipants: true,
        });

        return {
            content: [{ kind: 'text', value: 'The file was edited successfully' }]
        };
    }

    /**
     * Save file content to history before editing
     * @param uri File URI
     */
    private async saveFileHistory(uri: URI): Promise<void> {
        try {
            const uriString = uri.toString();
            const fileContent = await this.readFile(uri);

            if (!this.fileHistory[uriString]) {
                this.fileHistory[uriString] = [];
            }

            // Add to history with timestamp
            this.fileHistory[uriString].push({
                uri,
                content: fileContent,
                timestamp: Date.now()
            });

            // Limit history size
            if (this.fileHistory[uriString].length > this.maxHistoryEntries) {
                this.fileHistory[uriString] = this.fileHistory[uriString].slice(-this.maxHistoryEntries);
            }

            this.logService.trace(`Saved file history for ${uri.fsPath}`);
        } catch (error) {
            this.logService.error(`Failed to save file history: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Read file content with error handling
     * @param uri File URI
     * @returns File content as string
     */
    private async readFile(uri: URI): Promise<string> {
        try {
            const content = await this.fileService.readFile(uri);
            return content.value.toString();
        } catch (error) {
            this.logService.error(`Error reading file ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Resolves and validates a file path with enhanced error handling
     * @param fileUri File URI or components
     * @returns Resolved URI
     */
    private async resolveAndValidatePath(fileUri: UriComponents): Promise<URI> {
        try {
            const uri = URI.revive(fileUri);

            // Handle different URI schemes
            if (uri.scheme === 'untitled') {
                return uri;
            } else if (uri.scheme === 'file') {
                // Normalize path
                const normalizedPath = path.normalize(uri.fsPath);
                const normalizedUri = URI.file(normalizedPath);

                // Ensure parent directories exist for file paths
                await this.ensureParentDirectoryExists(normalizedUri);

                return normalizedUri;
            } else {
                return uri; // Other schemes pass through
            }
        } catch (error) {
            this.logService.error(`Error resolving path: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Path resolution error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Ensure parent directory exists for file operations
     * @param uri File URI
     */
    private async ensureParentDirectoryExists(uri: URI): Promise<void> {
        if (uri.scheme !== 'file') {
            return; // Only applicable for file URIs
        }

        try {
            const dirUri = URI.file(path.dirname(uri.fsPath));

            // Check if directory exists
            try {
                await this.fileService.stat(dirUri);
                return; // Directory exists
            } catch {
                // Directory doesn't exist, create it
                await this.fileService.createFolder(dirUri);
                this.logService.debug(`Created parent directory: ${dirUri.fsPath}`);
            }
        } catch (error) {
            this.logService.error(`Failed to create parent directory: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Failed to create parent directory: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Restore file to previous version (undo)
     * @param uri File URI
     * @returns Success message or error
     */
    public async undoFileEdit(uri: URI): Promise<string> {
        const uriString = uri.toString();

        if (!this.fileHistory[uriString] || this.fileHistory[uriString].length === 0) {
            throw new Error(`No edit history for ${uri.fsPath}`);
        }

        try {
            // Get the most recent history entry
            const lastEntry = this.fileHistory[uriString].pop();
            if (!lastEntry) {
                throw new Error(`No edit history for ${uri.fsPath}`);
            }

            // Write the previous content back to the file
            await this.fileService.writeFile(
                uri,
                VSBuffer.fromString(lastEntry.content)
            );

            await this.textFileService.save(uri, {
                reason: SaveReason.AUTO,
                skipSaveParticipants: true,
            });

            return `Reverted last edit on ${uri.fsPath}`;
        } catch (error) {
            this.logService.error(`Error undoing edit: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Error undoing edit: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get history entries for a file
     * @param uri File URI
     * @returns Array of history entries
     */
    public getFileHistory(uri: URI): FileHistoryEntry[] {
        const uriString = uri.toString();
        return this.fileHistory[uriString] || [];
    }

	async prepareToolInvocation(parameters: any, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			presentation: 'hidden'
		};
	}
}

export interface EditToolParams {
	file: UriComponents;
	explanation?: string;
	code?: string;
    command?: EditCommand | string;
    old_str?: string;
    new_str?: string;
    insert_line?: number;
    view_range?: [number, number];
}

export interface EditToolRawParams {
	filePath: string;
	explanation?: string;
	code?: string;
    command?: string;
    old_str?: string;
    new_str?: string;
    insert_line?: number;
    view_range?: [number, number];
}

export class EditToolInputProcessor implements IToolInputProcessor {
	processInput(input: EditToolRawParams): EditToolParams {
		if (!input.filePath) {
			// Tool name collision, or input wasn't properly validated upstream
			return input as any;
		}
		const filePath = input.filePath;

        // Process command-specific parameters
        let result: EditToolParams = {
            file: filePath.startsWith('untitled:') ? URI.parse(filePath) : URI.file(filePath),
        };

        // Copy over all available parameters
        if (input.command) result.command = input.command;
        if (input.explanation) result.explanation = input.explanation;
        if (input.code) result.code = input.code;
        if (input.old_str) result.old_str = input.old_str;
        if (input.new_str) result.new_str = input.new_str;
        if (input.insert_line !== undefined) result.insert_line = input.insert_line;
        if (input.view_range) result.view_range = input.view_range;

        return result;
