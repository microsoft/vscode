/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { IToolImpl, IToolInvocation, IToolResult, CountTokensCallback, ToolProgress, IToolData, ToolDataSource } from '../../../common/languageModelToolsService.js';
import { localize } from '../../../../../../nls.js';
import { resolveFilePath } from '../utils/filePathUtils.js';

export class WriteFileTool implements IToolImpl {
	static readonly TOOL_ID = 'dSpace_writeFile';

	static getToolData(): IToolData {
		return {
			id: WriteFileTool.TOOL_ID,
			displayName: localize('dSpaceTool.writeFile.displayName', 'Write File'),
			modelDescription: 'CRITICAL: Use ONLY for creating brand NEW files that do not exist yet. NEVER use this tool if the file already exists - it will overwrite and delete all existing content. For existing files, ALWAYS use dSpace_readFile first to read the current content, then use dSpace_editFile to make changes. This tool will reject attempts to write to existing files. This is a LaTeX editor, so by default: (1) If no file extension is specified in the path, default to .tex extension. (2) If no content is provided or content is empty, generate a basic LaTeX document template (\\documentclass{article}, \\begin{document}, etc.).',
			userDescription: 'Create a new file with content',
			source: ToolDataSource.Internal,
			inputSchema: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'Absolute path to the NEW file to create. The file must NOT exist yet. If the file exists, this operation will be rejected.'
					},
					content: {
						type: 'string',
						description: 'Complete content for the new file. If empty or not provided, generate a basic LaTeX document template.'
					}
				},
				required: ['path', 'content']
			}
		};
	}
	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as { path: string; content: string };
		const uri = resolveFilePath(args.path, this.workspaceContextService);

		try {
			// Check if file already exists
			try {
				const stat = await this.fileService.stat(uri);
				if (stat) {
					// File exists - reject the operation
					return {
						content: [{
							kind: 'text',
							value: JSON.stringify({
								success: false,
								error: `File already exists: ${uri.fsPath}. Use dSpace_writeFile ONLY for creating new files. For existing files, you must: (1) First read the file with dSpace_readFile to see its current content, (2) Then use dSpace_editFile to make changes. This prevents accidentally deleting existing content.`,
								path: args.path,
								fileExists: true,
								suggestion: 'Use dSpace_readFile to read the file, then dSpace_editFile to modify it'
							})
						}]
					};
				}
			} catch (statError) {
				// File doesn't exist, which is what we want - continue with creation
			}

			// File doesn't exist, safe to create
			await this.fileService.writeFile(uri, VSBuffer.fromString(args.content));
			return {
				content: [{
					kind: 'text',
					value: JSON.stringify({
						success: true,
						message: `File created: ${uri.fsPath}`,
						path: uri.fsPath
					})
				}]
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				content: [{
					kind: 'text',
					value: JSON.stringify({
						success: false,
						error: errorMessage,
						path: args.path
					})
				}]
			};
		}
	}
}

