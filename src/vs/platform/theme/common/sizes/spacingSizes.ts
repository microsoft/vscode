/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const baseSpacingL = registerSize('base.spacing.l', { default: '16px' }, nls.localize('baseSpacingL', "Spacing L"));
export const baseSpacingM = registerSize('base.spacing.m', { default: '12px' }, nls.localize('baseSpacingM', "Spacing M"));
export const baseSpacingNone = registerSize('base.spacing.none', { default: '0px' }, nls.localize('baseSpacingNone', "Spacing None"));
export const baseSpacingNudgeM = registerSize('base.spacing.nudge.m', { default: '10px' }, nls.localize('baseSpacingNudgeM', "Spacing MNudge"));
export const baseSpacingNudgeS = registerSize('base.spacing.nudge.s', { default: '6px' }, nls.localize('baseSpacingNudgeS', "Spacing SNudge"));
export const baseSpacingNudgeXs = registerSize('base.spacing.nudge.xs', { default: '3px' }, nls.localize('baseSpacingNudgeXs', "Spacing XSNudge"));
export const baseSpacingS = registerSize('base.spacing.s', { default: '8px' }, nls.localize('baseSpacingS', "Spacing S"));
export const baseSpacingXl = registerSize('base.spacing.xl', { default: '20px' }, nls.localize('baseSpacingXl', "Spacing XL"));
export const baseSpacingXs = registerSize('base.spacing.xs', { default: '4px' }, nls.localize('baseSpacingXs', "Spacing XS"));
export const baseSpacingXxl = registerSize('base.spacing.xxl', { default: '24px' }, nls.localize('baseSpacingXxl', "Spacing XXL"));
export const baseSpacingXxs = registerSize('base.spacing.xxs', { default: '2px' }, nls.localize('baseSpacingXxs', "Spacing XXS"));
export const baseSpacingXxxl = registerSize('base.spacing.xxxl', { default: '32px' }, nls.localize('baseSpacingXxxl', "Spacing XXXL"));
export const baseSpacingXxxs = registerSize('base.spacing.xxxs', { default: '1px' }, nls.localize('baseSpacingXxxs', "Spacing XXXS"));
