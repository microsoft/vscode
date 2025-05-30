/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const spacingNone = registerSize('base.spacingNone', { default: '0px' }, nls.localize('spacingNone', "Spacing None"));
export const spacingXXS = registerSize('base.spacingXXS', { default: '2px' }, nls.localize('spacingXXS', "Spacing XXS"));
export const spacingXS = registerSize('base.spacingXS', { default: '4px' }, nls.localize('spacingXS', "Spacing XS"));
export const spacingSNudge = registerSize('base.spacingSNudge', { default: '6px' }, nls.localize('spacingSNudge', "Spacing SNudge"));
export const spacingS = registerSize('base.spacingS', { default: '8px' }, nls.localize('spacingS', "Spacing S"));
export const spacingMNudge = registerSize('base.spacingMNudge', { default: '10px' }, nls.localize('spacingMNudge', "Spacing MNudge"));
export const spacingM = registerSize('base.spacingM', { default: '12px' }, nls.localize('spacingM', "Spacing M"));
export const spacingL = registerSize('base.spacingL', { default: '16px' }, nls.localize('spacingL', "Spacing L"));
export const spacingXL = registerSize('base.spacingXL', { default: '20px' }, nls.localize('spacingXL', "Spacing XL"));
export const spacingXXL = registerSize('base.spacingXXL', { default: '24px' }, nls.localize('spacingXXL', "Spacing XXL"));
export const spacingXXXL = registerSize('base.spacingXXXL', { default: '32px' }, nls.localize('spacingXXXL', "Spacing XXXL"));
