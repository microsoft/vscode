/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { PROMPT_LANGUAGE_ID, PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { askForPromptFileName } from './pickers/askForPromptName.js';
import { askForPromptSourceFolder } from './pickers/askForPromptSourceFolder.js';

export const SAVE_AS_PROMPT_FILE_ACTION_ID = 'workbench.action.chat.save-as-prompt';

export class SaveAsPromptFileAction extends Action2 {
	constructor() {
		super({
			id: SAVE_AS_PROMPT_FILE_ACTION_ID,
			title: localize2('promptfile.savePromptFile', "Save As Prompt File..."),
			metadata: {
				description: localize2('promptfile.savePromptFile.description', "Save as prompt file"),
			},
			category: CHAT_CATEGORY,
			f1: false,
			menu: {
				id: MenuId.EditorContent,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(ResourceContextKey.Scheme.key, 'untitled'),
					ContextKeyExpr.equals(ResourceContextKey.LangId.key, PROMPT_LANGUAGE_ID)
				)
			}
		});
	}

	async run(accessor: ServicesAccessor, configUri?: string): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const instantiationService = accessor.get(IInstantiationService);

		const type = PromptsType.prompt;
		const newFolder = await instantiationService.invokeFunction(askForPromptSourceFolder, type, undefined, true);
		if (!newFolder) {
			return;
		}
		const newName = await instantiationService.invokeFunction(askForPromptFileName, type, newFolder.uri, '');
		if (!newName) {
			return;
		}
		const newFile = joinPath(newFolder.uri, newName);
		if (isMove) {
			await this._fileService.move(value, newFile);
		} else {
			await this._fileService.copy(value, newFile);
		}
	}
}
