/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Definition, DefinitionProvider } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IChatModeService } from '../../chatModes.js';
import { getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';

export class PromptHeaderDefinitionProvider implements DefinitionProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptHeaderDefinitionProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
	) {
	}

	async provideDefinition(model: ITextModel, position: Position, token: CancellationToken): Promise<Definition | undefined> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType) {
			// if the model is not a prompt, we don't provide any definitions
			return undefined;
		}

		const parser = this.promptsService.getParsedPromptFile(model);
		const header = parser.header;
		if (!header) {
			return undefined;
		}

		const modeAttr = header.getAttribute('mode');
		if (modeAttr && modeAttr.value.type === 'string' && modeAttr.range.containsPosition(position)) {
			const mode = this.chatModeService.findModeByName(modeAttr.value.value);
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
