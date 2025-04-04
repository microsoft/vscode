/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type * from './types.js';
export { TDecorationClass, DecorationBase } from './decorationBase.js';
export { ReactiveDecorationBase, TChangedDecorator } from './reactiveDecorationBase.js';

/**
 * Convert a registered color name to a CSS variable string.
 */
export const asCssVariable = (colorName: string): string => {
	return `var(--vscode-${colorName.replaceAll('.', '-')})`;
};
