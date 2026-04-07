/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { PromptFileParser } from '../../../util/vs/workbench/contrib/chat/common/promptSyntax/promptFileParser';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { IPromptsService, ParsedPromptFile } from './promptsService';

export class PromptsServiceImpl implements IPromptsService {
	declare _serviceBrand: undefined;
	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileService: IFileSystemService,
	) { }

	public async parseFile(uri: URI, token: CancellationToken): Promise<ParsedPromptFile> {
		// a temporary workaround to avoid creating a text document to read the file content, which triggers the validation of the file in core (fixed in 1.114)
		const getTextContent = async (uri: URI) => {
			const existingDoc = this.workspaceService.textDocuments.find(doc => extUriBiasedIgnorePathCase.isEqual(doc.uri, uri));
			if (!existingDoc) {
				// if the document is not already open in the workspace, check if the file exists on disk before trying to open it, to avoid triggering unwanted "file not found" errors from the text document service
				const bytes = await this.fileService.readFile(uri);
				return new TextDecoder().decode(bytes);
			} else {
				return existingDoc.getText();
			}
		};
		const text = await raceCancellationError(getTextContent(uri), token);
		return new PromptFileParser().parse(uri, text);
	}
}