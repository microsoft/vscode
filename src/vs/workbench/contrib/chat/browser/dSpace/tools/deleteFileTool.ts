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

export class DeleteFileTool implements IToolImpl {
	static readonly TOOL_ID = 'dSpace_deleteFile';

	static getToolData(): IToolData {
		return {
			id: DeleteFileTool.TOOL_ID,
			displayName: localize('dSpaceTool.deleteFile.displayName', 'Delete File'),
			modelDescription: 'Delete a file. IMPORTANT: Use with caution and only when explicitly requested.',
			userDescription: 'Delete a file',
			source: ToolDataSource.Internal,
			inputSchema: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'Absolute path to the file to delete'
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
			await this.fileService.del(uri, { recursive: false });
			return {
				content: [{
					kind: 'text',
					value: JSON.stringify({
						success: true,
						message: `File deleted: ${uri.fsPath}`,
						path: uri.fsPath
					})
				}]
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete file';
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

