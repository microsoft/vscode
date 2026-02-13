/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../../../base/common/collections.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IChatMessage, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelChatProvider, ILanguageModelChatResponse, ILanguageModelChatSelector, ILanguageModelProviderDescriptor, ILanguageModelsGroup, ILanguageModelsService, IUserFriendlyLanguageModel } from '../../common/languageModels.js';
import { ILanguageModelsProviderGroup } from '../../common/languageModelsConfiguration.js';

export class NullLanguageModelsService implements ILanguageModelsService {
	_serviceBrand: undefined;

	registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider): IDisposable {
		return Disposable.None;
	}

	deltaLanguageModelChatProviderDescriptors(added: IUserFriendlyLanguageModel[], removed: IUserFriendlyLanguageModel[]): void {
	}

	onDidChangeLanguageModels = Event.None;
	onDidChangeLanguageModelVendors = Event.None;

	updateModelPickerPreference(modelIdentifier: string, showInModelPicker: boolean): void {
		return;
	}

	getVendors(): ILanguageModelProviderDescriptor[] {
		return [];
	}

	getLanguageModelIds(): string[] {
		return [];
	}

	lookupLanguageModel(identifier: string): ILanguageModelChatMetadata | undefined {
		return undefined;
	}

	lookupLanguageModelByQualifiedName(qualifiedName: string) {
		return undefined;
	}

	getLanguageModels(): ILanguageModelChatMetadataAndIdentifier[] {
		return [];
	}

	setContributedSessionModels(): void {
		return;
	}

	clearContributedSessionModels(): void {
		return;
	}

	getLanguageModelGroups(vendor: string): ILanguageModelsGroup[] {
		return [];
	}

	async selectLanguageModels(selector: ILanguageModelChatSelector): Promise<string[]> {
		return [];
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sendChatRequest(identifier: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, token: CancellationToken): Promise<ILanguageModelChatResponse> {
		throw new Error('Method not implemented.');
	}

	computeTokenLength(identifier: string, message: string | IChatMessage, token: CancellationToken): Promise<number> {
		throw new Error('Method not implemented.');
	}

	async configureLanguageModelsProviderGroup(vendorId: string, name?: string): Promise<void> {

	}

	async addLanguageModelsProviderGroup(name: string, vendorId: string, configuration: IStringDictionary<unknown> | undefined): Promise<void> {

	}

	async removeLanguageModelsProviderGroup(vendorId: string, providerGroupName: string): Promise<void> {
	}

	async migrateLanguageModelsProviderGroup(languageModelsProviderGroup: ILanguageModelsProviderGroup): Promise<void> { }
}
