/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IToolImpl, IToolInvocation, IToolResult, CountTokensCallback, ToolProgress, IToolData, ToolDataSource } from '../../../common/languageModelToolsService.js';
import { localize } from '../../../../../../nls.js';
import { resolveFilePath } from '../utils/filePathUtils.js';

export class OpenFileTool implements IToolImpl {
	static readonly TOOL_ID = 'dSpace_openFile';

	static getToolData(): IToolData {
		return {
			id: OpenFileTool.TOOL_ID,
			displayName: localize('dSpaceTool.openFile.displayName', 'Open File'),
			modelDescription: 'Open a file in the VS Code editor. Use this after creating or editing files to show them to the user. No confirmation needed.',
			userDescription: 'Open a file in the editor',
			source: ToolDataSource.Internal,
			inputSchema: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'Absolute path to the file to open'
					}
				},
				required: ['path']
			}
		};
	}
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as { path: string };
		const uri = resolveFilePath(args.path, this.workspaceContextService);

		try {
			const exists = await this.fileService.exists(uri);
			if (!exists) {
				return {
					content: [{
						kind: 'text',
						value: JSON.stringify({
							success: false,
							error: `File does not exist: ${uri.fsPath}`,
							path: uri.fsPath
						})
					}]
				};
			}

			await this.editorService.openEditor({
				resource: uri,
				options: {
					pinned: false,
					preserveFocus: false
				}
			});

			return {
				content: [{
					kind: 'text',
					value: JSON.stringify({
						success: true,
						message: `File opened: ${uri.fsPath}`,
						path: uri.fsPath
					})
				}]
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to open file';
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

