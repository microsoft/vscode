/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const shadowBlurRadiusM = registerSize('shadow.blur.radius.m', { default: '6px' }, nls.localize('shadowBlurRadiusM', "Blur Radius M"));
export const shadowOffsetM = registerSize('shadow.offset.m', { default: '6px' }, nls.localize('shadowOffsetM', "Offset M"));
export const shadowOffsetNone = registerSize('shadow.offset.none', { default: '0px' }, nls.localize('shadowOffsetNone', "Offset None"));
export const shadowSpreadRadiusM = registerSize('shadow.spread.radius.m', { default: '-6px' }, nls.localize('shadowSpreadRadiusM', "Spread Radius M"));
