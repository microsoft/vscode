/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AMD2ESM migration relevant

declare global {

	var _VSCODE_WEB_PACKAGE_TTP: Pick<TrustedTypePolicy<{
		createScriptURL(value: string): string;
	}>, 'name' | 'createScriptURL'> | undefined;
}

// fake export to make global work
export { }
