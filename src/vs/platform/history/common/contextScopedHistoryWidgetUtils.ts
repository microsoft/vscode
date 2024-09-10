/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';

export const historyNavigationVisible = new RawContextKey<boolean>('suggestWidgetVisible', false, localize('suggestWidgetVisible', "Whether suggestion are visible"));
