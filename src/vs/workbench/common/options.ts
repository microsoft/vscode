/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEditorOptions} from 'vs/editor/common/editorCommon';
import {IResourceInput} from 'vs/platform/editor/common/editor';
import {IUserFriendlyKeybinding} from 'vs/platform/keybinding/common/keybinding';

export interface IGlobalSettings {
	settings: any;
	settingsParseErrors?: string[];
	keybindings: IUserFriendlyKeybinding[];
}

export interface IOptions {

	/**
	 * Instructs the workbench to open the provided files right after startup.
	 */
	filesToOpen?: IResourceInput[];

	/**
	 * Instructs the workbench to create and open the provided files right after startup.
	 */
	filesToCreate?: IResourceInput[];

	/**
	 * Instructs the workbench to open a diff of the provided files right after startup.
	 */
	filesToDiff?: IResourceInput[];

	/**
	 * Instructs the workbench to install the extensions from the provided local paths.
	 */
	extensionsToInstall?: string[];

	/**
	 * A boolean flag indicating if the workbench is in file mode where some UI gets hidden. Does not override an existing setting by the user.
	 */
	singleFileMode?: boolean;

	/**
	 * Editor options to be used for any editor in the workbench.
	 */
	editor?: IEditorOptions;

	/**
	 * The global application settings if any.
	 */
	globalSettings?: IGlobalSettings;
}