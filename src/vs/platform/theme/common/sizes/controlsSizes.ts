/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const checkboxWidth = registerSize('checkbox.width', { default: '18px' }, nls.localize('checkboxWidth', "Width"));
export const checkboxHeight = registerSize('checkbox.height', { default: '18px' }, nls.localize('checkboxHeight', "Height"));
export const dropdownCornerRadius = registerSize('dropdown.corner.radius', { default: '5px' }, nls.localize('dropdownCornerRadius', "Corner Radius"));
export const dropdownLineHeight = registerSize('dropdown.line.height', { default: '16px' }, nls.localize('dropdownLineHeight', "Line Height"));
export const progressHeight = registerSize('progress.height', { default: '2px' }, nls.localize('progressHeight', "Height"));
export const hoverMenubarHorizontalSpacing = registerSize('hover.menubar.horizontal.spacing', { default: '5px' }, nls.localize('hoverMenubarHorizontalSpacing', "Horizontal Spacing"));
export const hoverMenubarCornerRadius = registerSize('hover.menubar.corner.radius', { default: '5px' }, nls.localize('hoverMenubarCornerRadius', "Corner Radius"));
export const hoverMenubarToggleWidth = registerSize('hover.menubar.toggle.width', { default: '22px' }, nls.localize('hoverMenubarToggleWidth', "Width"));
export const hoverMenubarToggleHeight = registerSize('hover.menubar.toggle.height', { default: '22px' }, nls.localize('hoverMenubarToggleHeight', "Height"));
export const chatMessageCornerRadius = registerSize('chat.message.corner.radius', { default: '4px' }, nls.localize('chatMessageCornerRadius', "Corner Radius"));
export const chatMessagePadding = registerSize('chat.message.padding', { default: '8px' }, nls.localize('chatMessagePadding', "Padding"));
export const chatPadding = registerSize('chat.padding', { default: '16px' }, nls.localize('chatPadding', "Padding"));
export const buttonLineHeight = registerSize('button.line.height', { default: '18px' }, nls.localize('buttonLineHeight', "Line Height"));
export const buttonPaddingHorizontal = registerSize('button.padding.horizontal', { default: '4px' }, nls.localize('buttonPaddingHorizontal', "Padding Horizontal"));
export const buttonPaddingVertical = registerSize('button.padding.vertical', { default: '4px' }, nls.localize('buttonPaddingVertical', "Padding Vertical"));
export const buttonCornerRadius = registerSize('button.corner.radius', { default: '2px' }, nls.localize('buttonCornerRadius', "Corner Radius"));
export const buttonFocusOutlineOffset = registerSize('button.focus.outline.offset', { default: '4px' }, nls.localize('buttonFocusOutlineOffset', "Focus Outline Offset"));
export const checkboxCornerRadius = registerSize('checkbox.corner.radius', { default: '3px' }, nls.localize('checkboxCornerRadius', "Corner Radius"));
export const checkboxFontSize = registerSize('checkbox.font.size', { default: '12px' }, nls.localize('checkboxFontSize', "Font Size"));
export const dropdownFontSize = registerSize('dropdown.font.size', { default: '12px' }, nls.localize('dropdownFontSize', "Font Size"));
export const toggleCorderRadius = registerSize('toggle.corder.radius', { default: '3px' }, nls.localize('toggleCorderRadius', "Corder Radius"));
export const toggleWidth = registerSize('toggle.width', { default: '20px' }, nls.localize('toggleWidth', "Width"));
export const toggleHeight = registerSize('toggle.height', { default: '20px' }, nls.localize('toggleHeight', "Height"));
export const hoverMenubarVerticalSpacing = registerSize('hover.menubar.vertical.spacing', { default: '4px' }, nls.localize('hoverMenubarVerticalSpacing', "Vertical Spacing"));
export const hoverMarkupcontentHoriztonalSpacing = registerSize('hover.markupcontent.horiztonal.spacing', { default: '20px' }, nls.localize('hoverMarkupcontentHoriztonalSpacing', "Horiztonal Spacing"));
export const hoverStatusbarHorizontalSpacing = registerSize('hover.statusbar.horizontal.spacing', { default: '8px' }, nls.localize('hoverStatusbarHorizontalSpacing', "Horizontal Spacing"));
export const hoverContentHorizontalSpacing = registerSize('hover.content.horizontal.spacing', { default: '0px' }, nls.localize('hoverContentHorizontalSpacing', "Horizontal Spacing"));
export const hoverContentVerticalSpacing = registerSize('hover.content.vertical.spacing', { default: '8px' }, nls.localize('hoverContentVerticalSpacing', "Vertical Spacing"));
export const hoverTooltipHorizontalSpacing = registerSize('hover.tooltip.horizontal.spacing', { default: '8px' }, nls.localize('hoverTooltipHorizontalSpacing', "Horizontal Padding"));
export const hoverTooltipVerticalSpacing = registerSize('hover.tooltip.vertical.spacing', { default: '4px' }, nls.localize('hoverTooltipVerticalSpacing', "Vertical Padding"));
