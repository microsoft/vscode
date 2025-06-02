/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const buttonPaddingHorizontal = registerSize('spacing.button-padding-horizontal', { default: '9px' }, nls.localize('buttonPaddingHorizontal', "this is a description"));
export const buttonPaddingVertical = registerSize('spacing.button-padding-vertical', { default: '4px' }, nls.localize('buttonPaddingVertical', "Button Padding Vertical"));
export const size10 = registerSize('base.size10', { default: '10px' }, nls.localize('size10', "This is the base size for 10px"));
export const testPadding = registerSize('base.spacing.test-padding', { default: '10px' }, nls.localize('testPadding', "Test Padding"));
