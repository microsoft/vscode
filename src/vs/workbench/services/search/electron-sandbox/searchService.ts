/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISearchService } from '../common/search.js';
import { SearchService } from '../common/searchService.js';

registerSingleton(ISearchService, SearchService, InstantiationType.Delayed);
