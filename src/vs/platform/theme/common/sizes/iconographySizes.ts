/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const codiconWidth = registerSize('codicon.width', { default: '16px' }, nls.localize('codiconWidth', "Width"));
export const codiconHeight = registerSize('codicon.height', { default: '16px' }, nls.localize('codiconHeight', "Height"));
export const iconWidth = registerSize('icon.width', { default: '16px' }, nls.localize('iconWidth', "Width"));
export const iconHeight = registerSize('icon.height', { default: '16px' }, nls.localize('iconHeight', "Height"));
