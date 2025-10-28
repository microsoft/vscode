/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ILink, ILinksList, LinkProvider } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IPromptsService } from '../service/promptsService.js';
import { IChatSlashCommandService } from '../../chatSlashCommands.js';
import { Range } from '../../../../../../editor/common/core/range.js';

export class SlashCommandLinkProvider implements LinkProvider {

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@IChatSlashCommandService private readonly slashCommandService: IChatSlashCommandService,
	) { }

	async provideLinks(model: ITextModel, token: CancellationToken): Promise<ILinksList | undefined> {
		const links: ILink[] = [];
		const commands = await this.promptsService.findPromptSlashCommands();
		for (const command of commands) {
			const regex = new RegExp(`\\${command.command}`, 'g');
			for (const match of model.findMatches(regex.source, true, true, false, null, false)) {
				if (match.range) {
					const prompt = await this.promptsService.resolvePromptSlashCommand(command, token);
					if (prompt?.uri) {
						links.push({ range: match.range, url: prompt.uri });
					}
				}
			}
		}

		return { links };
	}
}
