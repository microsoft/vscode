/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ColorScheme } from 'vs/platform/theme/common/theme';

export const IHostColorSchemeService = createDecorator<IHostColorSchemeService>('hostColorSchemeService');

export interface IHostColorSchemeService {

	readonly _serviceBrand: undefined;

	readonly colorScheme: ColorScheme;
	readonly onDidChangeColorScheme: Event<void>;

}
