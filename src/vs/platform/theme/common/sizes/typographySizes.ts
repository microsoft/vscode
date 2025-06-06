/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const baseLineHeightXs = registerSize('base.line.height.xs', { default: '11px' }, nls.localize('baseLineHeightXs', "Line Height XS"));
export const baseLineHeightS = registerSize('base.line.height.s', { default: '13px' }, nls.localize('baseLineHeightS', "Line Height S"));
export const baseLineHeightM = registerSize('base.line.height.m', { default: '18px' }, nls.localize('baseLineHeightM', "Line Height M"));
export const fontBody3Size = registerSize('font.body3.size', { default: '11px' }, nls.localize('fontBody3Size', "Body3Size"));
export const fontBody1Size = registerSize('font.body1.size', { default: '13px' }, nls.localize('fontBody1Size', "Body1Size"));
export const fontBody2Size = registerSize('font.body2.size', { default: '12px' }, nls.localize('fontBody2Size', "Body2Size"));
export const fontCodiconSize = registerSize('font.codicon.size', { default: '16px' }, nls.localize('fontCodiconSize', "Codicon Size"));
export const baseLineHeightL = registerSize('base.line.height.l', { default: '22px' }, nls.localize('baseLineHeightL', "Line Height L"));
