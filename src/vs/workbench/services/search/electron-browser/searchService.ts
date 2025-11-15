/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISearchService } from '../common/search.js';
import { SearchService } from '../common/searchService.js';

registerSingleton(ISearchService, SearchService, InstantiationType.Delayed);
