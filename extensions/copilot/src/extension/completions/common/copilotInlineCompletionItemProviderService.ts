/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InlineCompletionItemProvider } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';

export interface ICopilotInlineCompletionItemProviderService {
	readonly _serviceBrand: undefined;

	getOrCreateInstantiationService(): IInstantiationService;
	getOrCreateProvider(): InlineCompletionItemProvider;
}

export const ICopilotInlineCompletionItemProviderService = createServiceIdentifier<ICopilotInlineCompletionItemProviderService>('ICopilotInlineCompletionItemProviderService');

export class NullCopilotInlineCompletionItemProviderService implements ICopilotInlineCompletionItemProviderService {
	readonly _serviceBrand: undefined;

	getOrCreateInstantiationService(): IInstantiationService {
		throw new Error('Not implemented');
	}
	getOrCreateProvider(): InlineCompletionItemProvider {
		throw new Error('Not implemented');
	}
}
