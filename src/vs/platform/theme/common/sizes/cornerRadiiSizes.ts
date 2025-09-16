/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const baseCornerRadiusCircular = registerSize('base.corner.radius.circular', { default: '10000px' }, nls.localize('baseCornerRadiusCircular', "Corner Radius Circular"));
export const baseCornerRadiusL = registerSize('base.corner.radius.l', { default: '6px' }, nls.localize('baseCornerRadiusL', "Corner Radius L"));
export const baseCornerRadiusM = registerSize('base.corner.radius.m', { default: '4px' }, nls.localize('baseCornerRadiusM', "Corner Radius M"));
export const baseCornerRadiusNone = registerSize('base.corner.radius.none', { default: '0px' }, nls.localize('baseCornerRadiusNone', "Corner Radius None"));
export const baseCornerRadiusS = registerSize('base.corner.radius.s', { default: '3px' }, nls.localize('baseCornerRadiusS', "Corner Radius S"));
export const baseCornerRadiusXl = registerSize('base.corner.radius.xl', { default: '8px' }, nls.localize('baseCornerRadiusXl', "Corner Radius XL"));
export const baseCornerRadiusXs = registerSize('base.corner.radius.xs', { default: '2px' }, nls.localize('baseCornerRadiusXs', "Corner Radius XS"));
export const baseCornerRadiusXxl = registerSize('base.corner.radius.xxl', { default: '10px' }, nls.localize('baseCornerRadiusXxl', "Corner Radius XXL"));
export const baseCornerRadiusXxxl = registerSize('base.corner.radius.xxxl', { default: '12px' }, nls.localize('baseCornerRadiusXxxl', "Corner Radius XXL"));
