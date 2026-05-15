/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, TextDocument, Disposable as VscodeDisposable } from 'vscode';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ContextItem } from '../../languageServer/common/languageContextService';
import { ILanguageContextProviderService, ProviderTarget } from './languageContextProviderService';

export class NullLanguageContextProviderService implements ILanguageContextProviderService {
	_serviceBrand: undefined;

	registerContextProvider<T extends Copilot.SupportedContextItem>(provider: Copilot.ContextProvider<T>, targets: ProviderTarget[]): VscodeDisposable {
		return Disposable.None;
	}

	getAllProviders(): readonly Copilot.ContextProvider<Copilot.SupportedContextItem>[] {
		return [];
	}

	getContextProviders(doc: TextDocument): Copilot.ContextProvider<Copilot.SupportedContextItem>[] {
		return [];
	}

	getContextItems(doc: TextDocument, request: Copilot.ResolveRequest, cancellationToken: CancellationToken): AsyncIterable<ContextItem> {
		return {
			[Symbol.asyncIterator]: async function* () {
				// No context items to provide
			}
		};
	}

	getContextItemsOnTimeout(doc: TextDocument, request: Copilot.ResolveRequest): ContextItem[] {
		return [];
	}
}
