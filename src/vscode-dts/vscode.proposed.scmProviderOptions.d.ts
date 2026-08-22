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
		/**
		 * Creates a new source control instance.
		 *
		 * @param id An `id` for the source control. Something short, e.g. `git`.
		 * @param label A human-readable label for the source control provider. E.g. `Git`.
		 * @param rootUri An optional Uri of the root of the source control.
		 * @param iconPath An optional icon for the source control.
		 * @param isHidden Whether the source control is hidden by default.
		 * @param parent An optional parent source control.
		 * @param name An optional human-readable name for the source control repository.
		 * @returns An instance of source control.
		 */
		export function createSourceControl(id: string, label: string, rootUri?: Uri, iconPath?: IconPath, isHidden?: boolean, parent?: SourceControl, name?: string): SourceControl;
	}
}
