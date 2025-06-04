/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const baseSpacingNone = registerSize('base.spacing.none', { default: '0px' }, nls.localize('baseSpacingNone', "Spacing None"));
export const baseSpacingXxs = registerSize('base.spacing.xxs', { default: '2px' }, nls.localize('baseSpacingXxs', "Spacing XXS"));
export const baseSpacingXs = registerSize('base.spacing.xs', { default: '4px' }, nls.localize('baseSpacingXs', "Spacing XS"));
export const baseSpacingSNudge = registerSize('base.spacing.s.nudge', { default: '6px' }, nls.localize('baseSpacingSNudge', "Spacing SNudge"));
export const baseSpacingS = registerSize('base.spacing.s', { default: '8px' }, nls.localize('baseSpacingS', "Spacing S"));
export const baseSpacingMNudge = registerSize('base.spacing.m.nudge', { default: '10px' }, nls.localize('baseSpacingMNudge', "Spacing MNudge"));
export const baseSpacingM = registerSize('base.spacing.m', { default: '12px' }, nls.localize('baseSpacingM', "Spacing M"));
export const baseSpacingL = registerSize('base.spacing.l', { default: '16px' }, nls.localize('baseSpacingL', "Spacing L"));
export const baseSpacingXl = registerSize('base.spacing.xl', { default: '20px' }, nls.localize('baseSpacingXl', "Spacing XL"));
export const baseSpacingXxl = registerSize('base.spacing.xxl', { default: '24px' }, nls.localize('baseSpacingXxl', "Spacing XXL"));
export const baseSpacingXxxl = registerSize('base.spacing.xxxl', { default: '32px' }, nls.localize('baseSpacingXxxl', "Spacing XXXL"));
