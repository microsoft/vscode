/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { computeNodeModulesCacheKey } from './cacheKeys.ts';

process.stdout.write(computeNodeModulesCacheKey(process.argv.slice(2)));
