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

export class ListFilesTool implements IToolImpl {
	static readonly TOOL_ID = 'dSpace_listFiles';

	static getToolData(): IToolData {
		return {
			id: ListFilesTool.TOOL_ID,
			displayName: localize('dSpaceTool.listFiles.displayName', 'List Files'),
			modelDescription: 'List all files and directories in a directory. No confirmation needed - this is a safe, read-only operation.',
			userDescription: 'List directory contents',
			source: ToolDataSource.Internal,
			inputSchema: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'Absolute path to the directory to list'
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
			const stat = await this.fileService.resolve(uri);
			if (!stat.children) {
				return {
					content: [{
						kind: 'text',
						value: JSON.stringify({
							success: false,
							error: 'Not a directory',
							path: uri.fsPath
						})
					}]
				};
			}

			const files = stat.children.map(child => ({
				name: child.name,
				isDirectory: child.isDirectory,
				path: child.resource.fsPath
			}));

			return {
				content: [{
					kind: 'text',
					value: JSON.stringify({
						success: true,
						files,
						count: files.length,
						path: uri.fsPath
					})
				}]
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to list files';
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

