/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorIdentifier } from '../../../../../../../../../../../platform/theme/common/colorUtils.js';

/**
 * Convert a registered color to a CSS variable string.
 */
export const asCssVariable = (color: ColorIdentifier): string => {
	return `var(--vscode-${color.replaceAll('.', '-')})`;
};

export type * from './types.js';
export { DecorationBase, type TDecorationClass } from './decorationBase.js';
export { ReactiveDecorationBase, type TChangedDecorator } from './reactiveDecorationBase.js';

