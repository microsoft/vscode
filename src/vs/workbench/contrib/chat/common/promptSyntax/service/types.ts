/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { TextModelPromptParser } from '../parsers/textModelPromptParser.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * Provides prompt services.
 */
export const IPromptsService = createDecorator<IPromptsService>('IPromptsService');

/**
* Supported prompt types.
*  - `local` means the prompt is a local file.
*  - `global` means a "roamble" prompt file (similar to snippets).
*/
type TPromptsType = 'local' | 'global';

/**
 * Represents a prompt path with its type.
 * This is used for both prompt files and prompt source folders.
 */
export interface IPromptPath {
	/**
	 * URI of the prompt.
	 */
	readonly uri: URI;

	/**
	 * Type of the prompt.
	 */
	readonly type: TPromptsType;
}

/**
 * Provides prompt services.
 */
export interface IPromptsService extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Get a prompt syntax parser for the provided text model.
	 * See {@link TextModelPromptParser} for more info on the parser API.
	 */
	getSyntaxParserFor(
		model: ITextModel,
	): TextModelPromptParser & { disposed: false };

	/**
	 * List all available prompt files.
	 */
	listPromptFiles(): Promise<readonly IPromptPath[]>;

	/**
	 * Get a list of prompt source folders based on the provided prompt type.
	 */
	getSourceFolders(type: TPromptsType): readonly IPromptPath[];
}
