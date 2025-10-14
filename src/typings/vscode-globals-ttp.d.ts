/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AMD2ESM migration relevant

import type { TrustedTypePolicy } from 'trusted-types/lib/index.js';

declare global {

	var _VSCODE_WEB_PACKAGE_TTP: Pick<TrustedTypePolicy, 'name' | 'createScriptURL'> | undefined;
}

// fake export to make global work
export { };

