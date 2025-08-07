/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../common/languageModelToolsService.js';

export const ReadFileToolId = 'vscode_readFile_internal';
export const ReadFileToolData: IToolData = {
	id: ReadFileToolId,
	displayName: 'Read File',
	modelDescription: 'Reads the contents of a file from the file system. Use this tool to read text files when users ask to see file contents or when a command like "cat <file>" is used.',
	source: ToolDataSource.Internal,
	tags: ['file', 'read', 'cat'],
};

export interface ReadFileToolParams {
	uri: UriComponents;
}

export class ReadFileTool implements IToolImpl {

	constructor(
		@IFileService private readonly fileService: IFileService,
	) { }

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const parameters = invocation.parameters as ReadFileToolParams;
		const fileUri = URI.revive(parameters.uri);

		try {
			const content = await this.fileService.readFile(fileUri, undefined, token);
			const textContent = content.value.toString();

			return {
				content: [{
					kind: 'text',
					value: `File contents of ${fileUri.fsPath}:\n\n\`\`\`\n${textContent}\n\`\`\``
				}]
			};
		} catch (error) {
			return {
				content: [{
					kind: 'text',
					value: `Error reading file ${fileUri.fsPath}: ${error instanceof Error ? error.message : String(error)}`
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