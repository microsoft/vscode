/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const buttonTestExampleValue = registerSize('button.test.example.value', { default: '0px' }, nls.localize('buttonTestExampleValue', "Example Value"));
export const chatMessageCornerRadius = registerSize('chat.message.corner.radius', { default: '6px' }, nls.localize('chatMessageCornerRadius', "Corner Radius"));
export const chatMessagePadding = registerSize('chat.message.padding', { default: '8px' }, nls.localize('chatMessagePadding', "Padding"));
export const buttonLineHeight = registerSize('button.line.height', { default: '18px' }, nls.localize('buttonLineHeight', "Line Height"));
export const buttonPaddingHorizontal = registerSize('button.padding.horizontal', { default: '4px' }, nls.localize('buttonPaddingHorizontal', "Padding Horizontal"));
export const buttonPaddingVertical = registerSize('button.padding.vertical', { default: '4px' }, nls.localize('buttonPaddingVertical', "Padding Vertical"));
export const buttonCornerRadius = registerSize('button.corner.radius', { default: '2px' }, nls.localize('buttonCornerRadius', "Corner Radius"));
export const buttonFocusOutlineOffset = registerSize('button.focus.outline.offset', { default: '4px' }, nls.localize('buttonFocusOutlineOffset', "Focus Outline Offset"));
export const chatPadding = registerSize('chat.padding', { default: '16px' }, nls.localize('chatPadding', "Padding"));
