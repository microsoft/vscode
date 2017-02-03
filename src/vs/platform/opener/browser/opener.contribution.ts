/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { OpenerService } from 'vs/platform/opener/browser/openerService';
import { IOpenerService } from 'vs/platform/opener/common/opener';

registerSingleton(IOpenerService, OpenerService);
