/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';
import { ICodeMapperService } from '../../prompts/node/codeMapper/codeMapperService';

export class AIMappedEditsProvider2 implements vscode.MappedEditsProvider2 {

	constructor(
		@ICodeMapperService private readonly _codeMapperService: ICodeMapperService,
	) {
	}

	async provideMappedEdits(
		request: vscode.MappedEditsRequest,
		response: vscode.MappedEditsResponseStream,
		token: vscode.CancellationToken
	): Promise<vscode.MappedEditsResult | null | undefined> {

		const errorMessages: string[] = [];
		for (const codeBlock of request.codeBlocks) {

			if (token.isCancellationRequested) {
				return undefined;
			}

			const result = await this._codeMapperService.mapCode({ codeBlock, location: request.location }, response, {
				isAgent: request.location === 'tool',
				chatRequestId: request.chatRequestId,
				chatSessionId: request.chatSessionId,
				chatRequestSource: `api_${request.location}`,
				chatRequestModel: request.chatRequestModel,
			}, token);
			if (result) {
				if (result.errorDetails) {
					errorMessages.push(result.errorDetails.message);
				}
			}
		}
		if (errorMessages.length) {
			return { errorMessage: errorMessages.join('\n') };
		}
		return {};
	}
}
