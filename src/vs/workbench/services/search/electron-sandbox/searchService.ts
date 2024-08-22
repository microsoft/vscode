/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { ISearchService } from '../common/search';
import { SearchService } from '../common/searchService';

registerSingleton(ISearchService, SearchService, InstantiationType.Delayed);
