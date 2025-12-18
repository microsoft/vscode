/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IToolImpl, IToolInvocation, IToolResult, CountTokensCallback, ToolProgress, IToolData, ToolDataSource } from '../../../common/languageModelToolsService.js';
import { localize } from '../../../../../../nls.js';
import { resolveFilePath } from '../utils/filePathUtils.js';

export class ReadFileTool implements IToolImpl {
	static readonly TOOL_ID = 'dSpace_readFile';

	static getToolData(): IToolData {
		return {
			id: ReadFileTool.TOOL_ID,
			displayName: localize('dSpaceTool.readFile.displayName', 'Read File'),
			modelDescription: 'Read the contents of a file. No confirmation needed - this is a safe, read-only operation.',
			userDescription: 'Read the contents of a file',
			source: ToolDataSource.Internal,
			inputSchema: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'Absolute path to the file to read'
					}
				},
				required: ['path']
			}
		};
	}
	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as { path: string };
		const uri = resolveFilePath(args.path, this.workspaceContextService);

		try {
			const content = await this.fileService.readFile(uri, undefined, token);
			const fileContent = content.value.toString();
			const isEmpty = fileContent.length === 0;

			return {
				content: [{
					kind: 'text',
					value: JSON.stringify({
						success: true,
						content: fileContent,
						path: uri.fsPath,
						isEmpty: isEmpty,
						...(isEmpty && {
							hint: 'This file is empty. To add content, use dSpace_editFile with oldText: "" (empty string) and newText containing the content you want to add.'
						})
					})
				}]
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to read file';
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

