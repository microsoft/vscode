/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const codiconHeight = registerSize('codicon.height', { default: '16px' }, nls.localize('codiconHeight', "Height"));
export const codiconWidth = registerSize('codicon.width', { default: '16px' }, nls.localize('codiconWidth', "Width"));
export const iconHeightM = registerSize('icon.height.m', { default: '16px' }, nls.localize('iconHeightM', "Height"));
export const iconHeightXl = registerSize('icon.height.xl', { default: '48px' }, nls.localize('iconHeightXl', "Height XL"));
export const iconHeightXxl = registerSize('icon.height.xxl', { default: '64px' }, nls.localize('iconHeightXxl', "Height XXL"));
export const iconWidthM = registerSize('icon.width.m', { default: '16px' }, nls.localize('iconWidthM', "Width"));
export const iconWidthXl = registerSize('icon.width.xl', { default: '48px' }, nls.localize('iconWidthXl', "Width XL"));
export const iconWidthXxl = registerSize('icon.width.xxl', { default: '64px' }, nls.localize('iconWidthXxl', "Width XXL"));
