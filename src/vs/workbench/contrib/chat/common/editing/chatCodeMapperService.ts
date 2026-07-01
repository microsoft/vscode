/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';

export interface ICodeMapperResponse {
	textEdit: (resource: URI, textEdit: TextEdit[]) => void;
	notebookEdit: (resource: URI, edit: ICellEditOperation[]) => void;
}

export interface ICodeMapperCodeBlock {
	readonly code: string;
	readonly resource: URI;
	readonly markdownBeforeBlock?: string;
}

export interface ICodeMapperRequest {
	readonly codeBlocks: ICodeMapperCodeBlock[];
	readonly chatRequestId?: string;
	readonly chatRequestModel?: string;
	readonly chatSessionResource?: URI;
	readonly location?: string;
}

export interface ICodeMapperResult {
	readonly errorMessage?: string;
}

export interface ICodeMapperProvider {
	readonly displayName: string;
	mapCode(request: ICodeMapperRequest, response: ICodeMapperResponse, token: CancellationToken): Promise<ICodeMapperResult | undefined>;
}

export const ICodeMapperService = createDecorator<ICodeMapperService>('codeMapperService');

export interface ICodeMapperService {
	readonly _serviceBrand: undefined;
	readonly providers: ICodeMapperProvider[];
	registerCodeMapperProvider(handle: number, provider: ICodeMapperProvider): IDisposable;
	mapCode(request: ICodeMapperRequest, response: ICodeMapperResponse, token: CancellationToken): Promise<ICodeMapperResult | undefined>;
}

export class CodeMapperService implements ICodeMapperService {
	_serviceBrand: undefined;

	public readonly providers: ICodeMapperProvider[] = [];

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
			if (token.isCancellationRequested) {
				return undefined;
			}
			return result;
		}
		return undefined;
	}
}
