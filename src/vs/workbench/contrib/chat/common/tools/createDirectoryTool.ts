/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../common/languageModelToolsService.js';

export const CreateDirectoryToolId = 'vscode_createDirectory_internal';
export const CreateDirectoryToolData: IToolData = {
	id: CreateDirectoryToolId,
	displayName: 'Create Directory',
	modelDescription: 'Creates a new directory in the file system. Use this tool when users want to create directories or when a command like "mkdir <dir>" is used.',
	source: ToolDataSource.Internal,
	tags: ['file', 'directory', 'mkdir'],
};

export interface CreateDirectoryToolParams {
	uri: UriComponents;
}

export class CreateDirectoryTool implements IToolImpl {

	constructor(
		@IFileService private readonly fileService: IFileService,
	) { }

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const parameters = invocation.parameters as CreateDirectoryToolParams;
		const directoryUri = URI.revive(parameters.uri);

		try {
			await this.fileService.createFolder(directoryUri);

			return {
				content: [{
					kind: 'text',
					value: `Directory created successfully: ${directoryUri.fsPath}`
				}]
			};
		} catch (error) {
			return {
				content: [{
					kind: 'text',
					value: `Error creating directory ${directoryUri.fsPath}: ${error instanceof Error ? error.message : String(error)}`
				}]
			};
		}
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			presentation: 'hidden'
		};
	}
}