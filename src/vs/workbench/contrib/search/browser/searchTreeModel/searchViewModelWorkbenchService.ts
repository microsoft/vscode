/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISearchModel } from './searchTreeCommon.js';

export const ISearchViewModelWorkbenchService = createDecorator<ISearchViewModelWorkbenchService>('searchViewModelWorkbenchService');

export interface ISearchViewModelWorkbenchService {
	readonly _serviceBrand: undefined;

	searchModel: ISearchModel;
}
