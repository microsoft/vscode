/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parcelWatcher } from './testGlobals.js';

const { subscribe, writeSnapshot, getEventsSince } = parcelWatcher;

export { subscribe, writeSnapshot, getEventsSince };

export default parcelWatcher;
