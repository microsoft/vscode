/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IStringDictionary } from '../../../../base/common/collections.js';

export const ILanguageModelsConfigurationService = createDecorator<ILanguageModelsConfigurationService>('ILanguageModelsConfigurationService');

export interface ConfigureLanguageModelsOptions {
	group: ILanguageModelsProviderGroup;
	snippet?: string;
}

export interface ILanguageModelsConfigurationService {
	readonly _serviceBrand: undefined;

	readonly configurationFile: URI;

	readonly onDidChangeLanguageModelGroups: Event<readonly ILanguageModelsProviderGroup[]>;

	getLanguageModelsProviderGroups(): readonly ILanguageModelsProviderGroup[];

	addLanguageModelsProviderGroup(languageModelsProviderGroup: ILanguageModelsProviderGroup): Promise<ILanguageModelsProviderGroup>;

	updateLanguageModelsProviderGroup(from: ILanguageModelsProviderGroup, to: ILanguageModelsProviderGroup): Promise<ILanguageModelsProviderGroup>;

	removeLanguageModelsProviderGroup(languageModelGroup: ILanguageModelsProviderGroup): Promise<void>;

	configureLanguageModels(options?: ConfigureLanguageModelsOptions): Promise<void>;
}

export interface ILanguageModelsProviderGroup extends IStringDictionary<unknown> {
	readonly name: string;
	readonly vendor: string;
	readonly range?: IRange;
}
