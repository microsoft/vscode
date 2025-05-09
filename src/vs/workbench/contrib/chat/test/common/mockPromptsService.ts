/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { PROMPT_FILE_EXTENSION } from '../../../../../platform/prompts/common/constants.js';
import { TextModelPromptParser } from '../../common/promptSyntax/parsers/textModelPromptParser.js';
import { IChatPromptSlashCommand, IMetadata, IPromptPath, IPromptsService, TCombinedToolsMetadata, TPromptsType } from '../../common/promptSyntax/service/types.js';

export class MockPromptsService implements IPromptsService {
	_serviceBrand: undefined;

	getCombinedToolsMetadata(files: readonly URI[]): Promise<TCombinedToolsMetadata> {
		throw new Error('Method not implemented.');
	}
	getAllMetadata(_files: readonly URI[]): Promise<readonly IMetadata[]> {
		throw new Error('Method not implemented.');
	}
	getSyntaxParserFor(_model: ITextModel): TextModelPromptParser & { isDisposed: false } {
		throw new Error('Method not implemented.');
	}
	listPromptFiles(_type: TPromptsType): Promise<readonly IPromptPath[]> {
		throw new Error('Method not implemented.');
	}
	getSourceFolders(_type: TPromptsType): readonly IPromptPath[] {
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
	resolvePromptSlashCommand(_data: IChatPromptSlashCommand): Promise<IPromptPath | undefined> {
		throw new Error('Method not implemented.');
	}
	findPromptSlashCommands(): Promise<IChatPromptSlashCommand[]> {
		throw new Error('Method not implemented.');
	}
	findInstructionFilesFor(_files: readonly URI[]): Promise<readonly URI[]> {
		throw new Error('Method not implemented.');
	}
	dispose(): void { }
}
