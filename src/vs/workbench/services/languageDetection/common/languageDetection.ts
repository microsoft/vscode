/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILanguageDetectionService = createDecorator<ILanguageDetectionService>('ILanguageDetectionService');

export interface ILanguageDetectionService {
	readonly _serviceBrand: undefined;

	detectLanguage(content: string): Promise<string | undefined>;
}
