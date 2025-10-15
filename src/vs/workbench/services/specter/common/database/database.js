/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BugB-Tech. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IDatabaseService } from './databaseService.js';

/**
 * Service identifier for dependency injection
 */
export const ISpecterDatabaseService = createDecorator<IDatabaseService>('specterDatabaseService');
