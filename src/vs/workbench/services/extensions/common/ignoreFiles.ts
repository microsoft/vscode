/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { ExtensionsRegistry } from './extensionsRegistry.js';

export const ignoreFilesExtensionPoint = ExtensionsRegistry.registerExtensionPoint<string[]>({
	extensionPoint: 'ignoreFiles',
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.ignoreFiles', 'Contributes names of gitignore-compatible files that describe files to ignore.'),
		type: 'array',
		uniqueItems: true,
		items: {
			type: 'string',
			minLength: 1,
			pattern: '^[^/\\\\]+$',
			patternErrorMessage: nls.localize('vscode.extension.contributes.ignoreFiles.name', 'Ignore file names must not contain path separators.'),
			description: nls.localize('vscode.extension.contributes.ignoreFiles.nameDescription', 'The name of a gitignore-compatible file. For example, `.gitignore`.')
		}
	}
});
