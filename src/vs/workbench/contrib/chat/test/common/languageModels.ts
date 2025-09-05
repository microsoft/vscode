/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IChatMessage, ILanguageModelChatMetadata, ILanguageModelChatProvider, ILanguageModelChatResponse, ILanguageModelChatSelector, ILanguageModelsService, IUserFriendlyLanguageModel } from '../../common/languageModels.js';

export class NullLanguageModelsService implements ILanguageModelsService {
	_serviceBrand: undefined;

	registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider): IDisposable {
		return Disposable.None;
	}

	onDidChangeLanguageModels = Event.None;

	updateModelPickerPreference(modelIdentifier: string, showInModelPicker: boolean): void {
		return;
	}

	getVendors(): IUserFriendlyLanguageModel[] {
		return [];
	}

	getLanguageModelIds(): string[] {
		return [];
	}

	lookupLanguageModel(identifier: string): ILanguageModelChatMetadata | undefined {
		return undefined;
	}

	async selectLanguageModels(selector: ILanguageModelChatSelector): Promise<string[]> {
		return [];
	}

	sendChatRequest(identifier: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse> {
		throw new Error('Method not implemented.');
	}

	computeTokenLength(identifier: string, message: string | IChatMessage, token: CancellationToken): Promise<number> {
		throw new Error('Method not implemented.');
	}
}
