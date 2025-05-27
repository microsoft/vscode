/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const size10 = registerSize('size.ten', { default: '10px' },
	nls.localize('size10',
		"Overall size 10. This size is only used if not overridden by a component."));

export const size12 = registerSize('size.twelve', { default: '12px' },
	nls.localize('size12',
		"Overall size 12. This size is only used if not overridden by a component."));
