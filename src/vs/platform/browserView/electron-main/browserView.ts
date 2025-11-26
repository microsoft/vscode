/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBrowserViewService } from '../common/browserView.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IBrowserViewMainService = createDecorator<IBrowserViewMainService>('browserViewMainService');

export interface IBrowserViewMainService extends IBrowserViewService {

}
