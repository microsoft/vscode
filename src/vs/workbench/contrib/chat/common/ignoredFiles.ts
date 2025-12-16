/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface ILanguageModelIgnoredFileProvider {
	isFileIgnored(uri: URI, token: CancellationToken): Promise<boolean>;
}

export const ILanguageModelIgnoredFilesService = createDecorator<ILanguageModelIgnoredFilesService>('languageModelIgnoredFilesService');
export interface ILanguageModelIgnoredFilesService {
	_serviceBrand: undefined;

	fileIsIgnored(uri: URI, token: CancellationToken): Promise<boolean>;
	registerIgnoredFileProvider(provider: ILanguageModelIgnoredFileProvider): IDisposable;
}

export class LanguageModelIgnoredFilesService implements ILanguageModelIgnoredFilesService {
	_serviceBrand: undefined;

	private readonly _providers = new Set<ILanguageModelIgnoredFileProvider>();

	async fileIsIgnored(uri: URI, token: CancellationToken): Promise<boolean> {
		// Just use the first provider
		const provider = this._providers.values().next().value;
		return provider ?
			provider.isFileIgnored(uri, token) :
			false;
	}

	registerIgnoredFileProvider(provider: ILanguageModelIgnoredFileProvider): IDisposable {
		this._providers.add(provider);
		return toDisposable(() => {
			this._providers.delete(provider);
		});
	}
}
