/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Definition, DefinitionProvider } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { IChatModeService } from '../../chatModes.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR, getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { PromptModeMetadata } from '../parsers/promptHeader/metadata/mode.js';
import { PromptHeader } from '../parsers/promptHeader/promptHeader.js';

export class PromptHeaderDefinitionProvider extends Disposable implements DefinitionProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptHeaderHoverProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
		@IChatModeService private readonly chatModeService: IChatModeService,
	) {
		super();

		this._register(this.languageService.definitionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));
	}
	async provideDefinition(model: ITextModel, position: Position, token: CancellationToken): Promise<Definition | undefined> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType) {
			// if the model is not a prompt, we don't provide any completions
			return undefined;
		}

		const parser = this.promptsService.getSyntaxParserFor(model);
		await parser.start(token).settled();

		if (token.isCancellationRequested) {
			return undefined;
		}

		const header = parser.header;
		if (!header) {
			return undefined;
		}

		const completed = await header.settled;
		if (!completed || token.isCancellationRequested) {
			return undefined;
		}

		if (header instanceof PromptHeader) {
			const mode = header.metadataUtility.mode;
			if (mode?.range.containsPosition(position)) {
				return this.getModeDefinition(mode, position);
			}
		}
		return undefined;
	}


	private getModeDefinition(mode: PromptModeMetadata, position: Position): Definition | undefined {
		const value = mode.value;
		if (value && mode.valueRange?.containsPosition(position)) {
			const mode = this.chatModeService.findModeByName(value);
			if (mode && mode.uri) {
				return {
					uri: mode.uri.get(),
					range: new Range(1, 1, 1, 1)
				};
			}
		}
		return undefined;
	}

}
