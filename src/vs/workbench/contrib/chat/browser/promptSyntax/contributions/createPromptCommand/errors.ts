/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';

/**
 * Base class for all prompt creation errors.
 */
class BaseCreatePromptError extends Error { }

/**
 * Error for when a folder already exists at the provided
 * prompt file path.
 */
export class FolderExists extends BaseCreatePromptError {
	constructor(path: string) {
		super(localize(
			'workbench.command.prompts.create.error.folder-exists',
			"Folder already exists at '{0}'.",
			path,
		));
	}
}

/**
 * Error for when an invalid prompt file name is provided.
 */
export class InvalidPromptName extends BaseCreatePromptError {
	constructor(name: string) {
		super(localize(
			'workbench.command.prompts.create.error.invalid-prompt-name',
			"Invalid prompt file name '{0}'.",
			name,
		));
	}
}
