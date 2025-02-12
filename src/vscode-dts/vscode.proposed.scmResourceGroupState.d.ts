/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/192009

	export interface SourceControlResourceGroup {

		/**
		 * Context value of the resource group. This can be used to contribute resource group specific actions.
		 * For example, if a resource group is given a context value of `exportable`, when contributing actions to `scm/resourceGroup/context`
		 * using `menus` extension point, you can specify context value for key `scmResourceGroupState` in `when` expressions, like `scmResourceGroupState == exportable`.
		 * ```json
		 * "contributes": {
		 *   "menus": {
		 *     "scm/resourceGroup/context": [
		 *       {
		 *         "command": "extension.export",
		 *         "when": "scmResourceGroupState == exportable"
		 *       }
		 *     ]
		 *   }
		 * }
		 * ```
		 * This will show action `extension.export` only for resource groups with `contextValue` equal to `exportable`.
		 */
		contextValue?: string;
	}
}
