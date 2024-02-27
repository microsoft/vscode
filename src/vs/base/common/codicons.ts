/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeIcon } from 'vs/base/common/themables';
import { codiconsCore } from 'vs/base/common/codiconsCore';
import { codiconsExtra } from 'vs/base/common/codiconsExtra';


/**
 * Only to be used by the iconRegistry.
 */
export function getAllCodicons(): ThemeIcon[] {
	return Object.values(Codicon);
}


/**
 * The Codicon library is a set of default icons that are built-in in VS Code.
 *
 * In the product (outside of base) Codicons should only be used as defaults. In order to have all icons in VS Code
 * themeable, component should define new, UI component specific icons using `iconRegistry.registerIcon`.
 * In that call a Codicon can be named as default.
 */
export const Codicon = {
	...codiconsCore,
	...codiconsExtra

} as const;
