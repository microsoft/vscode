/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DomActivityTracker } from './domActivityTracker';
import { userActivityRegistry } from '../common/userActivityRegistry';

userActivityRegistry.add(DomActivityTracker);
