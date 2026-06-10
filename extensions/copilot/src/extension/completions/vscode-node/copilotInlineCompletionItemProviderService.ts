/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineCompletionItemProvider } from 'vscode';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { createContext, setup } from '../../completions-core/vscode-node/completionsServiceBridges';
import { CopilotInlineCompletionItemProvider } from '../../completions-core/vscode-node/extension/src/vscodeInlineCompletionItemProvider';
import { ICopilotInlineCompletionItemProviderService } from '../common/copilotInlineCompletionItemProviderService';

export class CopilotInlineCompletionItemProviderService extends Disposable implements ICopilotInlineCompletionItemProviderService {
	readonly _serviceBrand: undefined;

	private _provider: InlineCompletionItemProvider | undefined;
	private _completionsInstantiationService: IInstantiationService | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	getOrCreateInstantiationService(): IInstantiationService {
		if (!this._completionsInstantiationService) {
			this._completionsInstantiationService = this._instantiationService.invokeFunction(createContext, this._store);
		}
		return this._completionsInstantiationService;
	}

	getOrCreateProvider(): InlineCompletionItemProvider {
		if (!this._provider) {
			this._completionsInstantiationService = this.getOrCreateInstantiationService();
			this._completionsInstantiationService.invokeFunction(setup, this._store);
			this._provider = this._register(this._completionsInstantiationService.createInstance(CopilotInlineCompletionItemProvider));
		}
		return this._provider;
	}
}
