/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Definition, DefinitionProvider } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';

export class PromptBodyDefinitionProvider implements DefinitionProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptBodyDefinitionProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
	}

	async provideDefinition(model: ITextModel, position: Position, token: CancellationToken): Promise<Definition | undefined> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType) {
			// if the model is not a prompt, we don't provide any definitions
			return undefined;
		}

		const parser = this.promptsService.getParsedPromptFile(model);
		const body = parser.body;
		if (!body) {
			return undefined;
		}

		// Check for slash command references
		for (const ref of body.slashCommandReferences) {
			if (ref.range.containsPosition(position)) {
				const command = ref.command;
				const slashCommands = await this.promptsService.findPromptSlashCommands();
				const slashCommand = slashCommands.find(cmd => cmd.command === command);
				if (slashCommand && slashCommand.promptPath) {
					return {
						uri: slashCommand.promptPath.uri,
						range: new Range(1, 1, 1, 1)
					};
				}
			}
		}

		return undefined;
	}

}
