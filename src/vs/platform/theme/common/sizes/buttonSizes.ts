/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';

import { registerSize } from '../sizeUtils.js';
// import { size10 } from './baseSizes.js';

export const buttonHorizontalPadding = registerSize('button.horizontal.padding', { default: '11px' },
	nls.localize('buttonHorizontalPadding', "Overall horizontal padding for buttons. This size is only used if not overridden by a component."));

export const buttonVerticalPadding = registerSize('button.vertical.padding', { default: '4px' },
	nls.localize('buttonVerticalPadding', "Overall vertical padding for buttons. This size is only used if not overridden by a component."));

// export const buttonHeight = registerSize('button.height', size10,
// 	nls.localize('buttonHeight', "Overall height for buttons. This size is only used if not overridden by a component."));
// export const buttonMinWidth = registerSize('button.min.width', { default: '50px' },
// 	nls.localize('buttonMinWidth', "Overall minimum width for buttons. This size is only used if not overridden by a component."));
