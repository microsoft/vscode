/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/254910

	export interface SourceControl {
		/**
		 * Context value of the source control. This can be used to contribute source control specific actions.
		 * For example, if a source control is given a context value of `repository`, when contributing actions to `scm/sourceControl/context`
		 * using `menus` extension point, you can specify context value for key `scmProviderContext` in `when` expressions, like `scmProviderContext == repository`.
		 * ```json
		 * "contributes": {
		 *   "menus": {
		 *     "scm/sourceControl/context": [
		 *       {
		 *         "command": "extension.gitAction",
		 *         "when": "scmProviderContext == repository"
		 *       }
		 *     ]
		 *   }
		 * }
		 * ```
		 * This will show action `extension.gitAction` only for source controls with `contextValue` equal to `repository`.
		 */
		contextValue?: string;

		/**
		 * Fired when the parent source control is disposed.
		 */
		readonly onDidDisposeParent: Event<void>;
	}

	export namespace scm {
		export function createSourceControl(id: string, label: string, rootUri?: Uri, iconPath?: IconPath, isHidden?: boolean, parent?: SourceControl): SourceControl;
	}
}
