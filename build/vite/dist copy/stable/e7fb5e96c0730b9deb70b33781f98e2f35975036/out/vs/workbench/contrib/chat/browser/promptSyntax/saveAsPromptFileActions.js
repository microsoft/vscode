/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { chatEditingWidgetFileStateContextKey } from '../../common/editing/chatEditingService.js';
import { getCleanPromptName } from '../../common/promptSyntax/config/promptFileLocations.js';
import { AGENT_LANGUAGE_ID, INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID, PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { askForPromptFileName } from './pickers/askForPromptName.js';
import { askForPromptSourceFolder } from './pickers/askForPromptSourceFolder.js';
class BaseSaveAsPromptFileAction extends Action2 {
    constructor(opts, promptType) {
        super(opts);
        this.promptType = promptType;
    }
    async run(accessor, configUri) {
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
        }
        else {
            await fileService.copy(model.uri, newFile);
        }
        await codeEditorService.openCodeEditor({ resource: newFile }, activeCodeEditor);
    }
}
function createOptions(id, title, description, languageId) {
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
            when: ContextKeyExpr.and(ContextKeyExpr.equals(ResourceContextKey.Scheme.key, Schemas.untitled), ContextKeyExpr.equals(ResourceContextKey.LangId.key, languageId), ContextKeyExpr.notEquals(chatEditingWidgetFileStateContextKey.key, 0 /* ModifiedFileEntryState.Modified */))
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2F2ZUFzUHJvbXB0RmlsZUFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvcHJvbXB0U3ludGF4L3NhdmVBc1Byb21wdEZpbGVBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFbkUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDakcsT0FBTyxFQUFvQixTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVwRSxPQUFPLEVBQUUsT0FBTyxFQUFtQixNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxvQ0FBb0MsRUFBMEIsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsd0JBQXdCLEVBQUUsa0JBQWtCLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzFELE9B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