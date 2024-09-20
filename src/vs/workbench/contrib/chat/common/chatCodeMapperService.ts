/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';


export interface ICodeMapperResponse {
	textEdit: (resource: URI, textEdit: TextEdit[]) => void;
}

export interface ICodeMapperCodeBlock {
	code: string;
	resource: URI;
}

export interface ConversationRequest {
	readonly type: 'request';
	readonly message: string;
}

export interface ConversationResponse {
	readonly type: 'response';
	readonly message: string;
	// readonly references?: DocumentContextItem[];
}

export interface ICodeMapperRequest {
	codeBlocks: ICodeMapperCodeBlock[];
	conversation: (ConversationRequest | ConversationResponse)[];
}

export interface ICodeMapperResult {
	errorMessage?: string;
}

export interface ICodeMapperProvider {
	mapCode(request: ICodeMapperRequest, response: ICodeMapperResponse, token: CancellationToken): Promise<ICodeMapperResult | undefined>;
}

export const ICodeMapperService = createDecorator<ICodeMapperService>('codeMapperService');

export interface ICodeMapperService {
	readonly _serviceBrand: undefined;
	registerCodeMapperProvider(handle: number, provider: ICodeMapperProvider): IDisposable;
	mapCode(request: ICodeMapperRequest, response: ICodeMapperResponse, token: CancellationToken): Promise<ICodeMapperResult | undefined>;
}

export class CodeMapperService implements ICodeMapperService {
	_serviceBrand: undefined;

	private readonly providers: ICodeMapperProvider[] = [];

	registerCodeMapperProvider(handle: number, provider: ICodeMapperProvider): IDisposable {
		this.providers.push(provider);
		return {
			dispose: () => {
				const index = this.providers.indexOf(provider);
				if (index >= 0) {
					this.providers.splice(index, 1);
				}
			}
		};
	}

	async mapCode(request: ICodeMapperRequest, response: ICodeMapperResponse, token: CancellationToken) {
		for (const provider of this.providers) {
			const result = await provider.mapCode(request, response, token);
			if (result) {
				return result;
			}
		}
		return undefined;
	}
}
