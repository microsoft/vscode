/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const baseLineWidthNone = registerSize('base.line.width.none', { default: '0px' }, nls.localize('baseLineWidthNone', "Line Width None"));
export const baseLineWidthS = registerSize('base.line.width.s', { default: '1px' }, nls.localize('baseLineWidthS', "Line Width S"));
