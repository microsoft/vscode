/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const staticCornerRadiusNone = registerSize('static.corner.radius.none', { default: '0px' }, nls.localize('staticCornerRadiusNone', "Corner Radius None"));
export const staticLineWidthNone = registerSize('static.line.width.none', { default: '0px' }, nls.localize('staticLineWidthNone', "Line Width None"));
export const staticSpacingNone = registerSize('static.spacing.none', { default: '0px' }, nls.localize('staticSpacingNone', "Spacing None"));
