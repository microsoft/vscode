/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IHostColorSchemeService = createDecorator<IHostColorSchemeService>('hostColorSchemeService');

export interface IHostColorSchemeService {

	readonly _serviceBrand: undefined;

	readonly dark: boolean;
	readonly highContrast: boolean;
	readonly onDidChangeColorScheme: Event<void>;

}
