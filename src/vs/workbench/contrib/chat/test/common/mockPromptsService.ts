/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../editor/common/model.js';
import { PROMPT_FILE_EXTENSION } from '../../../../../platform/prompts/common/constants.js';
import { TextModelPromptParser } from '../../common/promptSyntax/parsers/textModelPromptParser.js';
import { IChatPromptSlashData, IPromptPath, IPromptsService, TPromptsStorage, TPromptsType } from '../../common/promptSyntax/service/types.js';

export class MockPromptsService implements IPromptsService {
	_serviceBrand: undefined;
	getSyntaxParserFor(model: ITextModel): TextModelPromptParser & { disposed: false } {
		throw new Error('Method not implemented.');
	}
	listPromptFiles(type: TPromptsType): Promise<readonly IPromptPath[]> {
		throw new Error('Method not implemented.');
	}
	getSourceFolders(type: TPromptsType, storage: TPromptsStorage): readonly IPromptPath[] {
		throw new Error('Method not implemented.');
	}
	public getPromptSlashData(name: string): IChatPromptSlashData | undefined {
		if (name.endsWith(PROMPT_FILE_EXTENSION)) {
			return {
				command: name, detail: name
			};
		}
		return undefined;
	}
	resolvePromptSlashData(data: IChatPromptSlashData): Promise<IPromptPath | undefined> {
		throw new Error('Method not implemented.');
	}
	dispose(): void {
	}
}
