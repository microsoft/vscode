/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const activeSessionHasChangesContextKey = new RawContextKey<boolean>('activeSessionHasChanges', false, localize('activeSessionHasChanges', "Whether the active session has changes."));
