/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerUserActivitySource } from '../../../services/userActivity/common/userActivityCapture.js';
import { BrowserViewUserActivitySource } from './browserViewUserActivitySource.js';

// Proposed API `userActivity`: the integrated browser's pages. Created only while capture runs.
registerUserActivitySource(BrowserViewUserActivitySource);
