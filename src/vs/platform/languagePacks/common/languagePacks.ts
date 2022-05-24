/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILanguagePackService = createDecorator<ILanguagePackService>('languagePackService');
export interface ILanguagePackService {
	readonly _serviceBrand: undefined;
	getInstalledLanguages(): Promise<string[]>;
}
