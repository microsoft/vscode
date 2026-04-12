/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { ChatViewId } from '../chat.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { PromptFilePickers } from './pickers/promptFilePickers.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getCleanPromptName } from '../../common/promptSyntax/config/promptFileLocations.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { compare } from '../../../../../base/common/strings.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
/**
 * Action ID for the `Attach Instruction` action.
 */
export const ATTACH_INSTRUCTIONS_ACTION_ID = 'workbench.action.chat.attach.instructions';
/**
 * Action ID for the `Configure Instruction` action.
 */
export const CONFIGURE_INSTRUCTIONS_ACTION_ID = 'workbench.action.chat.configure.instructions';
class ManageInstructionsFilesAction extends Action2 {
    constructor() {
        super({
            id: CONFIGURE_INSTRUCTIONS_ACTION_ID,
            title: localize2('configure-instructions', "Configure Instructions & Rules..."),
            shortTitle: localize2('configure-instructions.short', "Instructions & Rules"),
            icon: Codicon.bookmark,
            f1: true,
            precondition: ChatContextKeys.enabled,
            category: CHAT_CATEGORY,
            menu: {
                id: CHAT_CONFIG_MENU_ID,
                when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
                order: 10,
                group: '1_level'
            }
        });
    }
    async run(accessor) {
        const openerService = accessor.get(IOpenerService);
        const instaService = accessor.get(IInstantiationService);
        const pickers = instaService.createInstance(PromptFilePickers);
        const placeholder = localize('commands.prompt.manage-dialog.placeholder', 'Select the instructions file to open');
        const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.instructions, optionEdit: false });
        if (result !== undefined) {
            await openerService.open(result.promptFile);
        }
    }
}
/**
 * Helper to register the `Attach Prompt` action.
 */
export function registerAttachPromptActions() {
    registerAction2(ManageInstructionsFilesAction);
}
let ChatInstructionsPickerPick = class ChatInstructionsPickerPick {
    constructor(promptsService) {
        this.promptsService = promptsService;
        this.type = 'pickerPick';
        this.label = localize('chatContext.attach.instructions.label', 'Instructions...');
        this.icon = Codicon.bookmark;
        this.commandId = ATTACH_INSTRUCTIONS_ACTION_ID;
    }
    isEnabled(widget) {
        return !!widget.attachmentCapabilities.supportsInstructionAttachments;
    }
    asPicker() {
        const picks = this.promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None).then(value => {
            const result = [];
            value = value.slice(0).sort((a, b) => compare(a.storage, b.storage));
            let storageType;
            for (const promptsPath of value) {
                if (storageType !== promptsPath.storage) {
                    storageType = promptsPath.storage;
                    result.push({
                        type: 'separator',
                        label: this.promptsService.getPromptLocationLabel(promptsPath)
                    });
                }
                result.push({
                    label: promptsPath.name ?? getCleanPromptName(promptsPath.uri),
                    asAttachment: () => {
                        return toPromptFileVariableEntry(promptsPath.uri, PromptFileVariableKind.Instruction);
                    }
                });
            }
            return result;
        });
        return {
            placeholder: localize('placeholder', 'Select instructions files to attach'),
            picks,
            configure: {
                label: localize('configureInstructions', 'Configure Instructions...'),
                commandId: CONFIGURE_INSTRUCTIONS_ACTION_ID
            }
        };
    }
};
ChatInstructionsPickerPick = __decorate([
    __param(0, IPromptsService)
], ChatInstructionsPickerPick);
export { ChatInstructionsPickerPick };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXR0YWNoSW5zdHJ1Y3Rpb25zQWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3Byb21wdFN5bnRheC9hdHRhY2hJbnN0cnVjdGlvbnNBY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLFlBQVksQ0FBQztBQUNyRCxPQUFPLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDL0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFHdEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDdkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBNEIsc0JBQXNCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM5SSxP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