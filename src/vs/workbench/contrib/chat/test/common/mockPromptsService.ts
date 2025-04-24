/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../editor/common/model.js';
import { PROMPT_FILE_EXTENSION } from '../../../../../platform/prompts/common/constants.js';
import { TextModelPromptParser } from '../../common/promptSyntax/parsers/textModelPromptParser.js';
import { IChatPromptSlashCommand, IPromptPath, IPromptsService, TPromptsType } from '../../common/promptSyntax/service/types.js';

export class MockPromptsService implements IPromptsService {
	_serviceBrand: undefined;
	getSyntaxParserFor(model: ITextModel): TextModelPromptParser & { disposed: false } {
		throw new Error('Method not implemented.');
	}
	listPromptFiles(type: TPromptsType): Promise<readonly IPromptPath[]> {
		throw new Error('Method not implemented.');
	}
	getSourceFolders(type: TPromptsType): readonly IPromptPath[] {
		throw new Error('Method not implemented.');
	}
	public asPromptSlashCommand(name: string): IChatPromptSlashCommand | undefined {
		if (name.endsWith(PROMPT_FILE_EXTENSION)) {
			const command = `prompt:${name.substring(0, -PROMPT_FILE_EXTENSION.length)}`;
			return {
				command, detail: name,
			};
		}
		return undefined;
	}
	resolvePromptSlashCommand(data: IChatPromptSlashCommand): Promise<IPromptPath | undefined> {
		throw new Error('Method not implemented.');
	}
	findPromptSlashCommands(): Promise<IChatPromptSlashCommand[]> {
		throw new Error('Method not implemented.');
	}
	dispose(): void {
	}
}
