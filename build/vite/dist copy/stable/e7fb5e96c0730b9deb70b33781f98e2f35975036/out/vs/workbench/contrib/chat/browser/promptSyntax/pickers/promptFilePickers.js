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
import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { AgentInstructionFileType, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { basename, dirname, extUri, joinPath } from '../../../../../../base/common/resources.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { getCleanPromptName, getSkillFolderName } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType, INSTRUCTIONS_DOCUMENTATION_URL, AGENT_DOCUMENTATION_URL, PROMPT_DOCUMENTATION_URL, SKILL_DOCUMENTATION_URL, HOOK_DOCUMENTATION_URL } from '../../../common/promptSyntax/promptTypes.js';
import { NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_AGENT_COMMAND_ID, NEW_SKILL_COMMAND_ID } from '../newPromptFileActions.js';
import { GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID, GENERATE_PROMPT_COMMAND_ID, GENERATE_SKILL_COMMAND_ID, GENERATE_AGENT_COMMAND_ID } from '../../actions/chatActions.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { askForPromptFileName } from './askForPromptName.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { askForPromptSourceFolder } from './askForPromptSourceFolder.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { PromptFileRewriter } from '../promptFileRewriter.js';
import { isOrganizationPromptFile } from '../../../common/promptSyntax/utils/promptsServiceUtils.js';
import { assertNever } from '../../../../../../base/common/assert.js';
/**
 * Button that opens the documentation.
 */
function newHelpButton(type) {
    const iconClass = ThemeIcon.asClassName(Codicon.question);
    switch (type) {
        case PromptsType.prompt:
            return {
                tooltip: localize('help.prompt', "Show help on prompt files"),
                helpURI: URI.parse(PROMPT_DOCUMENTATION_URL),
                iconClass
            };
        case PromptsType.instructions:
            return {
                tooltip: localize('help.instructions', "Show help on instruction files"),
                helpURI: URI.parse(INSTRUCTIONS_DOCUMENTATION_URL),
                iconClass
            };
        case PromptsType.agent:
            return {
                tooltip: localize('help.agent', "Show help on custom agent files"),
                helpURI: URI.parse(AGENT_DOCUMENTATION_URL),
                iconClass
            };
        case PromptsType.skill:
            return {
                tooltip: localize('help.skill', "Show help on skill files"),
                helpURI: URI.parse(SKILL_DOCUMENTATION_URL),
                iconClass
            };
        case PromptsType.hook:
            return {
                tooltip: localize('help.hook', "Show help on hook files"),
                helpURI: URI.parse(HOOK_DOCUMENTATION_URL),
                iconClass
            };
    }
}
function isHelpButton(button) {
    return button.helpURI !== undefined;
}
function isPromptFileItem(item) {
    return item.type === 'item' && !!item.promptFileUri;
}
/**
 * Type guard for extension prompt paths.
 */
function isExtensionPromptPath(prompt) {
    return prompt.storage === PromptsStorage.extension && !!prompt.extension;
}
/**
 * A quick pick item that starts the 'New Prompt File' command.
 */
const NEW_PROMPT_FILE_OPTION = {
    type: 'item',
    label: `$(plus) ${localize('commands.new-promptfile.select-dialog.label', 'New prompt file...')}`,
    pickable: false,
    alwaysShow: true,
    buttons: [newHelpButton(PromptsType.prompt)],
    commandId: NEW_PROMPT_COMMAND_ID,
};
/**
 * A quick pick item that starts the 'New Instructions File' command.
 */
const NEW_INSTRUCTIONS_FILE_OPTION = {
    type: 'item',
    label: `$(plus) ${localize('commands.new-instructionsfile.select-dialog.label', 'New instruction file...')}`,
    pickable: false,
    alwaysShow: true,
    buttons: [newHelpButton(PromptsType.instructions)],
    commandId: NEW_INSTRUCTIONS_COMMAND_ID,
};
/**
 * A quick pick item that starts the 'Generate Agent Instructions' command.
 */
const GENERATE_AGENT_INSTRUCTIONS_OPTION = {
    type: 'item',
    label: `$(sparkle) ${localize('commands.generate-agent-instructions.select-dialog.label', 'Generate agent instructions...')}`,
    pickable: false,
    alwaysShow: true,
    buttons: [newHelpButton(PromptsType.instructions)],
    commandId: GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
};
/**
 * A quick pick item that starts the 'Generate On-demand Instructions' command.
 */
const GENERATE_ON_DEMAND_INSTRUCTIONS_OPTION = {
    type: 'item',
    label: `$(sparkle) ${localize('commands.generate-on-demand-instructions.select-dialog.label', 'Generate on-demand instructions...')}`,
    pickable: false,
    alwaysShow: true,
    buttons: [newHelpButton(PromptsType.instructions)],
    commandId: GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
};
/**
 * A quick pick item that starts the 'New Agent File' command.
 */
const NEW_AGENT_FILE_OPTION = {
    type: 'item',
    label: `$(plus) ${localize('commands.new-agentfile.select-dialog.label', 'Create new custom agent...')}`,
    pickable: false,
    alwaysShow: true,
    buttons: [newHelpButton(PromptsType.agent)],
    commandId: NEW_AGENT_COMMAND_ID,
};
/**
 * A quick pick item that starts the 'New Skill' command.
 */
const NEW_SKILL_FILE_OPTION = {
    type: 'item',
    label: `$(plus) ${localize('commands.new-skill.select-dialog.label', 'New skill...')}`,
    pickable: false,
    alwaysShow: true,
    buttons: [newHelpButton(PromptsType.skill)],
    commandId: NEW_SKILL_COMMAND_ID,
};
/**
 * A quick pick item that generates a prompt file with agent.
 */
const GENERATE_PROMPT_OPTION = {
    type: 'item',
    label: `$(sparkle) ${localize('commands.generate-prompt.select-dialog.label', 'Generate prompt...')}`,
    pickable: false,
    alwaysShow: true,
    buttons: [newHelpButton(PromptsType.prompt)],
    commandId: GENERATE_PROMPT_COMMAND_ID,
};
/**
 * A quick pick item that generates a skill with agent.
 */
const GENERATE_SKILL_OPTION = {
    type: 'item',
    label: `$(sparkle) ${localize('commands.generate-skill.select-dialog.label', 'Generate skill...')}`,
    pickable: false,
    alwaysShow: true,
    buttons: [newHelpButton(PromptsType.skill)],
    commandId: GENERATE_SKILL_COMMAND_ID,
};
/**
 * A quick pick item that generates a custom agent with agent.
 */
const GENERATE_AGENT_OPTION = {
    type: 'item',
    label: `$(sparkle) ${localize('commands.generate-agent.select-dialog.label', 'Generate agent...')}`,
    pickable: false,
    alwaysShow: true,
    buttons: [newHelpButton(PromptsType.agent)],
    commandId: GENERATE_AGENT_COMMAND_ID,
};
/**
 * Button that opens a prompt file in the editor.
 */
const EDIT_BUTTON = {
    tooltip: localize('open', "Open in Editor"),
    iconClass: ThemeIcon.asClassName(Codicon.fileCode),
};
/**
 * Button that deletes a prompt file.
 */
const DELETE_BUTTON = {
    tooltip: localize('delete', "Delete"),
    iconClass: ThemeIcon.asClassName(Codicon.trash),
};
/**
 * Button that renames a prompt file.
 */
const RENAME_BUTTON = {
    tooltip: localize('rename', "Move and/or Rename"),
    iconClass: ThemeIcon.asClassName(Codicon.replace),
};
/**
 * Button that copies a prompt file.
 */
const COPY_BUTTON = {
    tooltip: localize('makeACopy', "Make a Copy"),
    iconClass: ThemeIcon.asClassName(Codicon.copy),
};
/**
 * Button that sets a prompt file to be visible.
 */
const MAKE_VISIBLE_BUTTON = {
    tooltip: localize('makeVisible', "Hidden from chat view agent picker. Click to show."),
    iconClass: ThemeIcon.asClassName(Codicon.eyeClosed),
    alwaysVisible: true,
};
/**
 * Button that sets a prompt file to be invisible.
 */
const MAKE_INVISIBLE_BUTTON = {
    tooltip: localize('makeInvisible', "Shown in chat view agent picker. Click to hide."),
    iconClass: ThemeIcon.asClassName(Codicon.eye),
};
const RUN_IN_CHAT_BUTTON = {
    tooltip: localize('runInChat', "Run in Chat View"),
    iconClass: ThemeIcon.asClassName(Codicon.play),
};
let PromptFilePickers = class PromptFilePickers {
    constructor(_quickInputService, _openerService, _fileService, _dialogService, _commandService, _instaService, _promptsService, _labelService, _productService) {
        this._quickInputService = _quickInputService;
        this._openerService = _openerService;
        this._fileService = _fileService;
        this._dialogService = _dialogService;
        this._commandService = _commandService;
        this._instaService = _instaService;
        this._promptsService = _promptsService;
        this._labelService = _labelService;
        this._productService = _productService;
    }
    /**
     * Shows the prompt file selection dialog to the user that allows to run a prompt file(s).
     *
     * If {@link ISelectOptions.resource resource} is provided, the dialog will have
     * the resource pre-selected in the prompts list.
     */
    async selectPromptFile(options) {
        const cts = new CancellationTokenSource();
        const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
        quickPick.busy = true;
        quickPick.placeholder = localize('searching', 'Searching file system...');
        try {
            const fileOptions = await this._createPromptPickItems(options, cts.token);
            const activeItem = options.resource && fileOptions.find(f => f.type === 'item' && extUri.isEqual(f.promptFileUri, options.resource));
            if (activeItem) {
                quickPick.activeItems = [activeItem];
            }
            quickPick.placeholder = options.placeholder;
            quickPick.matchOnDescription = true;
            quickPick.items = fileOptions;
        }
        finally {
            quickPick.busy = false;
        }
        return new Promise(resolve => {
            const disposables = new DisposableStore();
            let isResolved = false;
            let isClosed = false;
            disposables.add(quickPick);
            disposables.add(cts);
            const refreshItems = async () => {
                const active = quickPick.activeItems;
                const newItems = await this._createPromptPickItems(options, CancellationToken.None);
                quickPick.items = newItems;
                quickPick.activeItems = active;
            };
            // handle the prompt `accept` event
            disposables.add(quickPick.onDidAccept(async () => {
                const { selectedItems } = quickPick;
                const { keyMods } = quickPick;
                const selectedItem = selectedItems[0];
                if (isPromptFileItem(selectedItem)) {
                    resolve({ promptFile: selectedItem.promptFileUri, keyMods: { ...keyMods } });
                    isResolved = true;
                }
                else {
                    if (selectedItem.commandId) {
                        await this._commandService.executeCommand(selectedItem.commandId);
                        return;
                    }
                }
                quickPick.hide();
            }));
            // handle the `button click` event on a list item (edit, delete, etc.)
            disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
                const shouldRefresh = await this._handleButtonClick(quickPick, e, options);
                if (!isClosed && shouldRefresh) {
                    await refreshItems();
                }
            }));
            disposables.add(quickPick.onDidHide(() => {
                if (!quickPick.ignoreFocusOut) {
                    disposables.dispose();
                    isClosed = true;
                    if (!isResolved) {
                        resolve(undefined);
                        isResolved = true;
                    }
                }
            }));
            // finally, reveal the dialog
            quickPick.show();
        });
    }
    async _createPromptPickItems(options, token) {
        const buttons = [];
        if (options.type === PromptsType.prompt && options.optionRun !== false) {
            buttons.push(RUN_IN_CHAT_BUTTON);
        }
        if (options.optionEdit !== false) {
            buttons.push(EDIT_BUTTON);
        }
        if (options.optionCopy !== false) {
            buttons.push(COPY_BUTTON);
        }
        if (options.optionRename !== false) {
            buttons.push(RENAME_BUTTON);
        }
        if (options.optionDelete !== false) {
            buttons.push(DELETE_BUTTON);
        }
        const result = [];
        if (options.optionNew !== false) {
            result.push(...this._getNewItems(options.type));
        }
        let getVisibility = () => undefined;
        if (options.optionVisibility) {
            const disabled = this._promptsService.getDisabledPromptFiles(options.type);
            getVisibility = p => !disabled.has(p.uri);
        }
        const sortByLabel = (items) => items.sort((a, b) => a.label.localeCompare(b.label));
        const locals = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.local, token);
        if (locals.length) {
            result.push({ type: 'separator', label: localize('separator.workspace', "Workspace") });
            result.push(...sortByLabel(await Promise.all(locals.map(l => this._createPromptPickItem(l, buttons, getVisibility(l), token)))));
        }
        // Agent instruction files (copilot-instructions.md and AGENTS.md) are added here and not included in the output of
        // listPromptFilesForStorage() because that function only handles *.instructions.md files (under `.github/instructions/`, etc.)
        let agentInstructionFiles = [];
        if (options.type === PromptsType.instructions) {
            const agentInstructionUris = await this._promptsService.listAgentInstructions(token);
            agentInstructionFiles = agentInstructionUris.map(agentInstructionFile => {
                const folderName = this._labelService.getUriLabel(dirname(agentInstructionFile.uri), { relative: true });
                // Don't show the folder path for files under .github folder (namely, copilot-instructions.md) since that is only defined once per repo.
                return {
                    uri: agentInstructionFile.uri,
                    description: agentInstructionFile.type !== AgentInstructionFileType.copilotInstructionsMd ? folderName : undefined,
                    storage: PromptsStorage.local,
                    type: options.type
                };
            });
        }
        if (agentInstructionFiles.length) {
            const agentButtons = buttons.filter(b => b !== RENAME_BUTTON);
            result.push({ type: 'separator', label: localize('separator.workspace-agent-instructions', "Agent Instructions") });
            result.push(...sortByLabel(await Promise.all(agentInstructionFiles.map(l => this._createPromptPickItem(l, agentButtons, getVisibility(l), token)))));
        }
        const exts = (await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.extension, token)).filter(isExtensionPromptPath);
        if (exts.length) {
            const extButtons = [];
            if (options.type === PromptsType.prompt && options.optionRun !== false) {
                extButtons.push(RUN_IN_CHAT_BUTTON);
            }
            if (options.optionEdit !== false) {
                extButtons.push(EDIT_BUTTON);
            }
            if (options.optionCopy !== false) {
                extButtons.push(COPY_BUTTON);
            }
            const groupedExts = new Map();
            for (const ext of exts) {
                const groupLabel = this._getExtensionGroupLabel(ext);
                if (!groupedExts.has(groupLabel)) {
                    groupedExts.set(groupLabel, []);
                }
                groupedExts.get(groupLabel).push(ext);
            }
            const sortedGroupedExts = Array.from(groupedExts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            for (const [groupLabel, groupExts] of sortedGroupedExts) {
                result.push({ type: 'separator', label: groupLabel });
                result.push(...sortByLabel(await Promise.all(groupExts.map(e => this._createPromptPickItem(e, extButtons, getVisibility(e), token)))));
            }
        }
        const users = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.user, token);
        if (users.length) {
            result.push({ type: 'separator', label: localize('separator.user', "User Data") });
            result.push(...sortByLabel(await Promise.all(users.map(u => this._createPromptPickItem(u, buttons, getVisibility(u), token)))));
        }
        // Plugin files are read-only so only copy button is available
        const plugins = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.plugin, token);
        if (plugins.length) {
            const pluginButtons = [];
            if (options.optionCopy !== false) {
                pluginButtons.push(COPY_BUTTON);
            }
            result.push({ type: 'separator', label: localize('separator.plugins', "Plugins") });
            result.push(...sortByLabel(await Promise.all(plugins.map(p => this._createPromptPickItem(p, pluginButtons, getVisibility(p), token)))));
        }
        return result;
    }
    _getExtensionGroupLabel(extPath) {
        if (isOrganizationPromptFile(extPath.uri, extPath.extension.identifier, this._productService)) {
            return localize('separator.organization', "Organization");
        }
        // By default, extension prompt files are grouped under "Extensions"
        return localize('separator.extensions', "Extensions");
    }
    _getNewItems(type) {
        switch (type) {
            case PromptsType.prompt:
                return [NEW_PROMPT_FILE_OPTION, GENERATE_PROMPT_OPTION];
            case PromptsType.instructions:
                return [NEW_INSTRUCTIONS_FILE_OPTION, GENERATE_ON_DEMAND_INSTRUCTIONS_OPTION, GENERATE_AGENT_INSTRUCTIONS_OPTION];
            case PromptsType.agent:
                return [NEW_AGENT_FILE_OPTION, GENERATE_AGENT_OPTION];
            case PromptsType.skill:
                return [NEW_SKILL_FILE_OPTION, GENERATE_SKILL_OPTION];
            default:
                throw new Error(`Unknown prompt type '${type}'.`);
        }
    }
    async _createPromptPickItem(promptFile, buttons, visibility, token) {
        const parsedPromptFile = await this._promptsService.parseNew(promptFile.uri, token).catch(() => undefined);
        let promptName = (parsedPromptFile?.header?.name ?? promptFile.name) || (promptFile.type === PromptsType.skill ? getSkillFolderName(promptFile.uri) : getCleanPromptName(promptFile.uri));
        const promptDescription = parsedPromptFile?.header?.description ?? promptFile.description;
        let tooltip;
        switch (promptFile.storage) {
            case PromptsStorage.extension:
                tooltip = promptFile.extension.displayName ?? promptFile.extension.id;
                break;
            case PromptsStorage.local:
                tooltip = this._labelService.getUriLabel(dirname(promptFile.uri), { relative: true });
                break;
            case PromptsStorage.user:
                tooltip = undefined;
                break;
            case PromptsStorage.plugin:
                tooltip = promptFile.name;
                break;
            default:
                assertNever(promptFile);
        }
        let iconClass;
        if (visibility === false) {
            buttons = (buttons ?? []).concat(MAKE_VISIBLE_BUTTON);
            promptName = localize('hiddenLabelInfo', "{0} (hidden)", promptName);
            tooltip = localize('hiddenInAgentPicker', "Hidden from chat view agent picker");
        }
        else if (visibility === true) {
            buttons = (buttons ?? []).concat(MAKE_INVISIBLE_BUTTON);
        }
        return {
            id: promptFile.uri.toString(),
            type: 'item',
            label: promptName,
            description: promptDescription,
            iconClass,
            tooltip,
            promptFileUri: promptFile.uri,
            buttons,
        };
    }
    async keepQuickPickOpen(quickPick, work) {
        const previousIgnoreFocusOut = quickPick.ignoreFocusOut;
        quickPick.ignoreFocusOut = true;
        try {
            return await work();
        }
        finally {
            quickPick.ignoreFocusOut = previousIgnoreFocusOut;
            quickPick.show();
        }
    }
    async _handleButtonClick(quickPick, context, options) {
        const { item, button } = context;
        if (!isPromptFileItem(item)) {
            if (isHelpButton(button)) {
                await this._openerService.open(button.helpURI);
                return false;
            }
            throw new Error(`Unknown button '${JSON.stringify(button)}'.`);
        }
        const value = item.promptFileUri;
        if (button === RUN_IN_CHAT_BUTTON) {
            const commandId = quickPick.keyMods.ctrlCmd === true
                ? 'workbench.action.chat.run-in-new-chat.prompt.current'
                : 'workbench.action.chat.run.prompt.current';
            await this._commandService.executeCommand(commandId, value);
            quickPick.hide();
            return false;
        }
        // `edit` button was pressed, open the prompt file in editor
        if (button === EDIT_BUTTON) {
            await this._openerService.open(value);
            return false;
        }
        // `copy` button was pressed, make a copy of the prompt file, open the copy in editor
        if (button === RENAME_BUTTON || button === COPY_BUTTON) {
            return await this.keepQuickPickOpen(quickPick, async () => {
                const currentFolder = dirname(value);
                const isMove = button === RENAME_BUTTON && quickPick.keyMods.ctrlCmd;
                const newFolder = await this._instaService.invokeFunction(askForPromptSourceFolder, options.type, currentFolder, isMove);
                if (!newFolder) {
                    return false;
                }
                const newName = await this._instaService.invokeFunction(askForPromptFileName, options.type, newFolder.uri, item.label);
                if (!newName) {
                    return false;
                }
                const newFile = joinPath(newFolder.uri, newName);
                if (isMove) {
                    await this._fileService.move(value, newFile);
                }
                else {
                    await this._fileService.copy(value, newFile);
                }
                await this._openerService.open(newFile);
                await this._instaService.createInstance(PromptFileRewriter).openAndRewriteName(newFile, getCleanPromptName(newFile), CancellationToken.None);
                return true;
            });
        }
        // `delete` button was pressed, delete the prompt file
        if (button === DELETE_BUTTON) {
            // don't close the main prompt selection dialog by the confirmation dialog
            return await this.keepQuickPickOpen(quickPick, async () => {
                const isSkill = options.type === PromptsType.skill;
                // For skills, use the parent folder name as the display name
                // since skills are structured as <skillname>/SKILL.md.
                const filename = isSkill ? basename(dirname(value)) : item.label;
                const message = isSkill
                    ? localize('commands.prompts.use.select-dialog.delete-skill.confirm.message', "Are you sure you want to delete skill '{0}' and its folder?", filename)
                    : localize('commands.prompts.use.select-dialog.delete-prompt.confirm.message', "Are you sure you want to delete '{0}'?", filename);
                const { confirmed } = await this._dialogService.confirm({ message });
                // if prompt deletion was not confirmed, nothing to do
                if (!confirmed) {
                    return false;
                }
                // For skills, delete the parent folder (e.g. .github/skills/my-skill/)
                // since each skill is a folder containing SKILL.md.
                const deleteTarget = isSkill ? dirname(value) : value;
                await this._fileService.del(deleteTarget, { recursive: isSkill, useTrash: true });
                return true;
            });
        }
        if (button === MAKE_VISIBLE_BUTTON || button === MAKE_INVISIBLE_BUTTON) {
            const disabled = this._promptsService.getDisabledPromptFiles(options.type);
            if (button === MAKE_VISIBLE_BUTTON) {
                disabled.delete(value);
            }
            else {
                disabled.add(value);
            }
            this._promptsService.setDisabledPromptFiles(options.type, disabled);
            return true;
        }
        throw new Error(`Unknown button '${JSON.stringify(button)}'.`);
    }
    // --- Enablement Configuration -------------------------------------------------------
    /**
     * Shows a multi-select (checkbox) quick pick to configure which prompt files of the given
     * type are enabled. Currently only used for agent prompt files.
     */
    async managePromptFiles(type, placeholder) {
        const cts = new CancellationTokenSource();
        const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
        quickPick.placeholder = placeholder;
        quickPick.canSelectMany = true;
        quickPick.matchOnDescription = true;
        quickPick.sortByLabel = false;
        quickPick.busy = true;
        const options = {
            placeholder: '',
            type,
            optionNew: true,
            optionEdit: true,
            optionDelete: true,
            optionRename: true,
            optionCopy: true,
            optionVisibility: false,
            optionRun: false
        };
        try {
            const items = await this._createPromptPickItems(options, cts.token);
            quickPick.items = items;
        }
        finally {
            quickPick.busy = false;
        }
        return new Promise(resolve => {
            const disposables = new DisposableStore();
            disposables.add(quickPick);
            disposables.add(cts);
            let isClosed = false;
            let isResolved = false;
            const refreshItems = async () => {
                const active = quickPick.activeItems;
                const newItems = await this._createPromptPickItems(options, CancellationToken.None);
                quickPick.items = newItems;
                quickPick.activeItems = active;
            };
            disposables.add(quickPick.onDidAccept(async () => {
                const clickedItem = quickPick.activeItems;
                if (clickedItem.length === 1 && clickedItem[0].commandId) {
                    const commandId = clickedItem[0].commandId;
                    await this.keepQuickPickOpen(quickPick, async () => {
                        await this._commandService.executeCommand(commandId);
                    });
                    if (!isClosed) {
                        await refreshItems();
                    }
                    return;
                }
                isResolved = true;
                resolve(true);
                quickPick.hide();
            }));
            disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
                const shouldRefresh = await this._handleButtonClick(quickPick, e, options);
                if (!isClosed && shouldRefresh) {
                    await refreshItems();
                }
            }));
            disposables.add(quickPick.onDidHide(() => {
                if (!quickPick.ignoreFocusOut) {
                    disposables.dispose();
                    isClosed = true;
                    if (!isResolved) {
                        resolve(false);
                        isResolved = true;
                    }
                }
            }));
            quickPick.show();
        });
    }
};
PromptFilePickers = __decorate([
    __param(0, IQuickInputService),
    __param(1, IOpenerService),
    __param(2, IFileService),
    __param(3, IDialogService),
    __param(4, ICommandService),
    __param(5, IInstantiationService),
    __param(6, IPromptsService),
    __param(7, ILabelService),
    __param(8, IProductService)
], PromptFilePickers);
export { PromptFilePickers };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZVBpY2tlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvcHJvbXB0U3ludGF4L3BpY2tlcnMvcHJvbXB0RmlsZVBpY2tlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx3QkFBd0IsRUFBcUMsZUFBZSxFQUFFLGNBQWMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3RLLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3BILE9BQU8sRUFBRSxXQUFXLEVBQUUsOEJBQThCLEVBQUUsdUJBQXVCLEVBQUUsd0JBQXdCLEVBQUUsdUJBQXVCLEVBQUUsc0JBQXNCLEVB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