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
* Supported prompt sources.
*  - `local` means the prompt is a local file.
*  - `global` means a "roamble" prompt file.
*/
type TPromptsSource = 'local' | 'global';

/**
 * Represents a prompt reference.
 */
export interface IPrompt {
	/**
	 * URI of the prompt.
	 */
	readonly uri: URI;

	/**
	 * Source of the prompt.
	 */
	readonly source: TPromptsSource;
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
	listPromptFiles(): Promise<readonly IPrompt[]>;

	/**
	 * Get a list of prompt locations for the provided source.
	 */
	getPromptsLocation(source: TPromptsSource): readonly IPrompt[];
}
