/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ILocalizedString, localize2 } from '../../../../../nls.js';
import { ICommandActionTitle } from '../../../../../platform/action/common/action.js';
import { Action2, IAction2Options, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { chatEditingWidgetFileStateContextKey, ModifiedFileEntryState } from '../../common/editing/chatEditingService.js';
import { getCleanPromptName } from '../../common/promptSyntax/config/promptFileLocations.js';
import { AGENT_LANGUAGE_ID, INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID, PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { askForPromptFileName } from './pickers/askForPromptName.js';
import { askForPromptSourceFolder } from './pickers/askForPromptSourceFolder.js';

class BaseSaveAsPromptFileAction extends Action2 {
	constructor(opts: Readonly<IAction2Options>, private readonly promptType: PromptsType) {
		super(opts);
	}

	async run(accessor: ServicesAccessor, configUri?: string): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const textFileService = accessor.get(ITextFileService);
		const fileService = accessor.get(IFileService);
		const activeCodeEditor = codeEditorService.getActiveCodeEditor();
		if (!activeCodeEditor) {
			return;
		}
		const model = activeCodeEditor.getModel();
		if (!model) {
			return;
		}
		const newFolder = await instantiationService.invokeFunction(askForPromptSourceFolder, this.promptType, undefined, true);
		if (!newFolder) {
			return;
		}
		const newName = await instantiationService.invokeFunction(askForPromptFileName, this.promptType, newFolder.uri, getCleanPromptName(model.uri));
		if (!newName) {
			return;
		}
		const newFile = joinPath(newFolder.uri, newName);
		if (model.uri.scheme === Schemas.untitled) {
			await textFileService.saveAs(model.uri, newFile, { from: model.uri });
		} else {
			await fileService.copy(model.uri, newFile);
		}
		await codeEditorService.openCodeEditor({ resource: newFile }, activeCodeEditor);
	}
}

function createOptions(id: string, title: ICommandActionTitle, description: ILocalizedString, languageId: string): Readonly<IAction2Options> {
	return {
		id: id,
		title: title,
		metadata: {
			description: description,
		},
		category: CHAT_CATEGORY,
		f1: false,
		menu: {
			id: MenuId.EditorContent,
			when: ContextKeyExpr.and(
				ContextKeyExpr.equals(ResourceContextKey.Scheme.key, Schemas.untitled),
				ContextKeyExpr.equals(ResourceContextKey.LangId.key, languageId),
				ContextKeyExpr.notEquals(chatEditingWidgetFileStateContextKey.key, ModifiedFileEntryState.Modified),
			)
		}
	};
}

export const SAVE_AS_PROMPT_FILE_ACTION_ID = 'workbench.action.chat.save-as-prompt';

export class SaveAsPromptFileAction extends BaseSaveAsPromptFileAction {
	constructor() {
		super(createOptions(SAVE_AS_PROMPT_FILE_ACTION_ID, localize2('promptfile.savePromptFile', "Save As Prompt File"), localize2('promptfile.savePromptFile.description', "Save as prompt file"), PROMPT_LANGUAGE_ID), PromptsType.prompt);
	}
}

export const SAVE_AS_AGENT_FILE_ACTION_ID = 'workbench.action.chat.save-as-agent';

export class SaveAsAgentFileAction extends BaseSaveAsPromptFileAction {
	constructor() {
		super(createOptions(SAVE_AS_AGENT_FILE_ACTION_ID, localize2('promptfile.saveAgentFile', "Save As Agent File"), localize2('promptfile.saveAgentFile.description', "Save as agent file"), AGENT_LANGUAGE_ID), PromptsType.agent);
	}
}

export const SAVE_AS_INSTRUCTIONS_FILE_ACTION_ID = 'workbench.action.chat.save-as-instructions';

export class SaveAsInstructionsFileAction extends BaseSaveAsPromptFileAction {
	constructor() {
		super(createOptions(SAVE_AS_INSTRUCTIONS_FILE_ACTION_ID, localize2('promptfile.saveInstructionsFile', "Save As Instructions File"), localize2('promptfile.saveInstructionsFile.description', "Save as instructions file"), INSTRUCTIONS_LANGUAGE_ID), PromptsType.instructions);
	}
}
