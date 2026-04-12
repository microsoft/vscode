/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { parse as parseJSONC } from '../../../../../base/common/jsonc.js';
import { setProperty, applyEdits } from '../../../../../base/common/jsonEdit.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ChatViewId } from '../chat.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType, Target } from '../../common/promptSyntax/promptTypes.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { HOOK_METADATA, HOOKS_BY_TARGET } from '../../common/promptSyntax/hookTypes.js';
import { formatHookCommandLabel, getEffectiveCommandFieldKey } from '../../common/promptSyntax/hookSchema.js';
import { getCopilotCliHookTypeName, resolveCopilotCliHookType } from '../../common/promptSyntax/hookCopilotCliCompat.js';
import { getHookSourceFormat, HookSourceFormat, buildNewHookEntry } from '../../common/promptSyntax/hookCompatibility.js';
import { getClaudeHookTypeName, resolveClaudeHookType } from '../../common/promptSyntax/hookClaudeCompat.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { findHookCommandSelection, findHookCommandInYaml, parseAllHookFiles } from './hookUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { OS } from '../../../../../base/common/platform.js';
/**
 * Action ID for the `Configure Hooks` action.
 */
const CONFIGURE_HOOKS_ACTION_ID = 'workbench.action.chat.configure.hooks';
/**
 * Detects if existing hooks use Copilot CLI naming convention (camelCase).
 * Returns true if any existing key matches the Copilot CLI format.
 */
function usesCopilotCliNaming(hooksObj) {
    for (const key of Object.keys(hooksObj)) {
        // Check if any key resolves to a Copilot CLI hook type
        if (resolveCopilotCliHookType(key) !== undefined) {
            return true;
        }
    }
    return false;
}
/**
 * Gets the appropriate key name for a hook type based on the naming convention used in the file.
 */
function getHookTypeKeyName(hookTypeId, useCopilotCliNamingConvention) {
    if (useCopilotCliNamingConvention) {
        const copilotCliName = getCopilotCliHookTypeName(hookTypeId);
        if (copilotCliName) {
            return copilotCliName;
        }
    }
    // Fall back to PascalCase (enum value)
    return hookTypeId;
}
/**
 * Adds a hook to an existing hook file.
 */
async function addHookToFile(hookFileUri, hookTypeId, fileService, editorService, notificationService, bulkEditService, openEditorOverride) {
    // Parse existing file
    let hooksContent;
    const fileExists = await fileService.exists(hookFileUri);
    if (fileExists) {
        const existingContent = await fileService.readFile(hookFileUri);
        try {
            hooksContent = parseJSONC(existingContent.value.toString());
            // Ensure hooks object exists
            if (!hooksContent.hooks) {
                hooksContent.hooks = {};
            }
        }
        catch {
            // If parsing fails, show error and open file for user to fix
            notificationService.error(localize('commands.new.hook.parseError', "Failed to parse existing hooks file. Please fix the JSON syntax errors and try again."));
            await editorService.openEditor({ resource: hookFileUri });
            return;
        }
    }
    else {
        // Create new structure
        hooksContent = { hooks: {} };
    }
    // Detect source format from file URI
    const sourceFormat = getHookSourceFormat(hookFileUri);
    const isClaude = sourceFormat === HookSourceFormat.Claude;
    // Detect naming convention from existing keys
    const useCopilotCliNamingConvention = !isClaude && usesCopilotCliNaming(hooksContent.hooks);
    const hookTypeKeyName = isClaude
        ? (getClaudeHookTypeName(hookTypeId) ?? hookTypeId)
        : getHookTypeKeyName(hookTypeId, useCopilotCliNamingConvention);
    // Also check if there's an existing key for this hook type (with either naming)
    // Find existing key that resolves to the same hook type
    let existingKeyForType;
    for (const key of Object.keys(hooksContent.hooks)) {
        const resolvedType = isClaude
            ? resolveClaudeHookType(key)
            : resolveCopilotCliHookType(key);
        if (resolvedType === hookTypeId || key === hookTypeId) {
            existingKeyForType = key;
            break;
        }
    }
    // Use existing key if found, otherwise use the detected naming convention
    const keyToUse = existingKeyForType ?? hookTypeKeyName;
    // Determine the new hook index (append if hook type already exists)
    const newHookEntry = buildNewHookEntry(sourceFormat);
    const existingHooks = hooksContent.hooks[keyToUse];
    const newHookIndex = Array.isArray(existingHooks) ? existingHooks.length : 0;
    // Generate the new JSON content using setProperty to preserve comments
    let jsonContent;
    if (fileExists) {
        // Use setProperty to make targeted edits that preserve comments
        const originalText = (await fileService.readFile(hookFileUri)).value.toString();
        const detectedEol = originalText.includes('\r\n') ? '\r\n' : '\n';
        const formattingOptions = { tabSize: 1, insertSpaces: false, eol: detectedEol };
        const edits = setProperty(originalText, ['hooks', keyToUse, newHookIndex], newHookEntry, formattingOptions);
        jsonContent = applyEdits(originalText, edits);
    }
    else {
        // New file - use JSON.stringify since there are no comments to preserve
        const newContent = { hooks: { [keyToUse]: [newHookEntry] } };
        jsonContent = JSON.stringify(newContent, null, '\t');
    }
    // Check if the file is already open in an editor
    const existingEditor = editorService.editors.find(e => isEqual(e.resource, hookFileUri));
    if (existingEditor) {
        // File is already open - first focus the editor, then update its model directly
        await editorService.openEditor({
            resource: hookFileUri,
            options: {
                pinned: false
            }
        });
        // Get the code editor and update its content directly
        const editor = getCodeEditor(editorService.activeTextEditorControl);
        if (editor && editor.hasModel() && isEqual(editor.getModel().uri, hookFileUri)) {
            const model = editor.getModel();
            // Apply the full content replacement using executeEdits
            model.pushEditOperations([], [{
                    range: model.getFullModelRange(),
                    text: jsonContent
                }], () => null);
            // Find and apply the selection
            const selection = findHookCommandSelection(jsonContent, keyToUse, newHookIndex, 'command');
            if (selection && selection.endLineNumber !== undefined && selection.endColumn !== undefined) {
                editor.setSelection({
                    startLineNumber: selection.startLineNumber,
                    startColumn: selection.startColumn,
                    endLineNumber: selection.endLineNumber,
                    endColumn: selection.endColumn
                });
                editor.revealLineInCenter(selection.startLineNumber);
            }
        }
        else {
            // Fallback: active editor/model check failed, apply via bulk edit service
            await bulkEditService.apply([
                new ResourceTextEdit(hookFileUri, { range: new Range(1, 1, Number.MAX_SAFE_INTEGER, 1), text: jsonContent })
            ], { label: localize('addHook', "Add Hook") });
            // Find the selection for the new hook's command field
            const selection = findHookCommandSelection(jsonContent, keyToUse, newHookIndex, 'command');
            // Re-open editor with selection
            await editorService.openEditor({
                resource: hookFileUri,
                options: {
                    selection,
                    pinned: false
                }
            });
        }
    }
    else {
        // File is not currently open in an editor
        if (!fileExists) {
            // File doesn't exist - write new file directly and open
            await fileService.writeFile(hookFileUri, VSBuffer.fromString(jsonContent));
        }
        else {
            // File exists but isn't open - open it first, then use bulk edit for undo support
            await editorService.openEditor({
                resource: hookFileUri,
                options: { pinned: false }
            });
            // Apply the edit via bulk edit service for proper undo support
            await bulkEditService.apply([
                new ResourceTextEdit(hookFileUri, { range: new Range(1, 1, Number.MAX_SAFE_INTEGER, 1), text: jsonContent })
            ], { label: localize('addHook', "Add Hook") });
        }
        // Find the selection for the new hook's command field
        const selection = findHookCommandSelection(jsonContent, keyToUse, newHookIndex, 'command');
        // Open editor with selection (or re-focus if already open)
        if (openEditorOverride) {
            await openEditorOverride(hookFileUri, { selection });
        }
        else {
            await editorService.openEditor({
                resource: hookFileUri,
                options: {
                    selection,
                    pinned: false
                }
            });
        }
    }
}
/**
 * Awaits a single pick interaction on the given picker.
 * Returns the selected item, 'back' if the back button was pressed, or undefined if cancelled.
 */
function awaitPick(picker, backButton) {
    return new Promise(resolve => {
        let resolved = false;
        const done = (value) => {
            if (!resolved) {
                resolved = true;
                disposables.dispose();
                resolve(value);
            }
        };
        const disposables = new DisposableStore();
        disposables.add(picker.onDidAccept(() => {
            done(picker.activeItems[0]);
        }));
        disposables.add(picker.onDidTriggerButton(button => {
            if (button === backButton) {
                done('back');
            }
        }));
        disposables.add(picker.onDidHide(() => {
            done(undefined);
        }));
    });
}
var Step;
(function (Step) {
    Step[Step["SelectHookType"] = 1] = "SelectHookType";
    Step[Step["SelectHook"] = 2] = "SelectHook";
    Step[Step["SelectFile"] = 3] = "SelectFile";
    Step[Step["SelectFolder"] = 4] = "SelectFolder";
    Step[Step["EnterFilename"] = 5] = "EnterFilename";
})(Step || (Step = {}));
/**
 * Shows the Configure Hooks quick pick UI, allowing the user to view,
 * open, or create hooks. Can be called from the action or slash command.
 */
export async function showConfigureHooksQuickPick(accessor, options) {
    const promptsService = accessor.get(IPromptsService);
    const quickInputService = accessor.get(IQuickInputService);
    const fileService = accessor.get(IFileService);
    const labelService = accessor.get(ILabelService);
    const editorService = accessor.get(IEditorService);
    const workspaceService = accessor.get(IWorkspaceContextService);
    const pathService = accessor.get(IPathService);
    const notificationService = accessor.get(INotificationService);
    const bulkEditService = accessor.get(IBulkEditService);
    const remoteAgentService = accessor.get(IRemoteAgentService);
    // Get the remote OS (or fall back to local OS)
    const remoteEnv = await remoteAgentService.getEnvironment();
    const targetOS = remoteEnv?.os ?? OS;
    // Get workspace root and user home for path resolution
    const workspaceFolder = workspaceService.getWorkspace().folders[0];
    const workspaceRootUri = workspaceFolder?.uri;
    const userHomeUri = await pathService.userHome();
    const userHome = userHomeUri.fsPath ?? userHomeUri.path;
    // Parse all hook files upfront to count hooks per type
    const hookEntries = await parseAllHookFiles(promptsService, fileService, labelService, workspaceRootUri, userHome, targetOS, CancellationToken.None, { includeAgentHooks: true });
    // Count hooks per type
    const hookCountByType = new Map();
    for (const entry of hookEntries) {
        hookCountByType.set(entry.hookType, (hookCountByType.get(entry.hookType) ?? 0) + 1);
    }
    // Create a single picker instance reused across all steps
    const store = new DisposableStore();
    const picker = store.add(quickInputService.createQuickPick({ useSeparators: true }));
    const backButton = quickInputService.backButton;
    picker.show();
    let step = 1 /* Step.SelectHookType */;
    let selectedHookType;
    let selectedHook;
    let selectedFile;
    let selectedFolder;
    // Track steps that were actually shown to the user, so Back
    // skips over auto-executed steps and returns to the last visible one.
    const stepHistory = [];
    const goBack = () => stepHistory.pop();
    try {
        while (true) {
            switch (step) {
                case 1 /* Step.SelectHookType */: {
                    // Step 1: Show lifecycle events with hook counts, filtered by target
                    const makeItem = ([hookType, meta]) => {
                        const count = hookCountByType.get(hookType) ?? 0;
                        const countLabel = count > 0 ? ` (${count})` : '';
                        return {
                            label: `${meta.label}${countLabel}`,
                            description: meta.description,
                            hookType,
                            hookTypeMeta: meta
                        };
                    };
                    let pickerItems;
                    if (options?.target) {
                        // Filtered to a specific target
                        const targetHookTypes = new Set(Object.values(HOOKS_BY_TARGET[options.target]));
                        pickerItems = Object.entries(HOOK_METADATA)
                            .filter(([hookType]) => targetHookTypes.has(hookType))
                            .map(makeItem);
                    }
                    else {
                        // No target: group into Default (shared), VS Code Only, Copilot CLI Only
                        const vscodeTypes = new Set(Object.values(HOOKS_BY_TARGET[Target.VSCode]));
                        const copilotTypes = new Set(Object.values(HOOKS_BY_TARGET[Target.GitHubCopilot]));
                        const allEntries = Object.entries(HOOK_METADATA);
                        const shared = allEntries.filter(([h]) => vscodeTypes.has(h) && copilotTypes.has(h));
                        const vscodeOnly = allEntries.filter(([h]) => vscodeTypes.has(h) && !copilotTypes.has(h));
                        const copilotOnly = allEntries.filter(([h]) => !vscodeTypes.has(h) && copilotTypes.has(h));
                        pickerItems = [];
                        if (shared.length > 0) {
                            pickerItems.push({ type: 'separator', label: localize('hookSection.default', "Local/Copilot CLI Agents") });
                            pickerItems.push(...shared.map(makeItem));
                        }
                        if (vscodeOnly.length > 0) {
                            pickerItems.push({ type: 'separator', label: localize('hookSection.vscodeOnly', "Local Agents") });
                            pickerItems.push(...vscodeOnly.map(makeItem));
                        }
                        if (copilotOnly.length > 0) {
                            pickerItems.push({ type: 'separator', label: localize('hookSection.copilotCliOnly', "Copilot CLI Agents") });
                            pickerItems.push(...copilotOnly.map(makeItem));
                        }
                    }
                    picker.items = pickerItems;
                    picker.value = '';
                    picker.placeholder = localize('commands.hooks.selectEvent.placeholder', 'Select a lifecycle event');
                    picker.title = localize('commands.hooks.title', 'Hooks');
                    picker.buttons = [];
                    const result = await awaitPick(picker, backButton);
                    if (!result || result === 'back') {
                        return;
                    }
                    selectedHookType = result;
                    stepHistory.push(1 /* Step.SelectHookType */);
                    step = 2 /* Step.SelectHook */;
                    break;
                }
                case 2 /* Step.SelectHook */: {
                    // Filter hooks by the selected type
                    const hooksOfType = hookEntries.filter(h => h.hookType === selectedHookType.hookType);
                    // Separate hooks by source
                    const fileHooks = hooksOfType.filter(h => !h.agentName);
                    const agentHooks = hooksOfType.filter(h => h.agentName);
                    // Step 2: Show "Add new hook" + existing hooks of this type
                    const hookItems = [];
                    // Add "Add new hook" option at the top
                    hookItems.push({
                        label: `$(plus) ${localize('commands.addNewHook.label', 'Add new hook...')}`,
                        isAddNewHook: true,
                        alwaysShow: true
                    });
                    // Add existing file-based hooks
                    if (fileHooks.length > 0) {
                        hookItems.push({
                            type: 'separator',
                            label: localize('existingHooks', "Existing Hooks")
                        });
                        for (const entry of fileHooks) {
                            const description = labelService.getUriLabel(entry.fileUri, { relative: true });
                            hookItems.push({
                                label: entry.commandLabel,
                                description,
                                hookEntry: entry
                            });
                        }
                    }
                    // Add agent-defined hooks grouped by agent name
                    if (agentHooks.length > 0) {
                        const agentNames = [...new Set(agentHooks.map(h => h.agentName))];
                        for (const agentName of agentNames) {
                            hookItems.push({
                                type: 'separator',
                                label: localize('agentHooks', "Agent: {0}", agentName)
                            });
                            for (const entry of agentHooks.filter(h => h.agentName === agentName)) {
                                const description = labelService.getUriLabel(entry.fileUri, { relative: true });
                                hookItems.push({
                                    label: entry.commandLabel,
                                    description,
                                    hookEntry: entry
                                });
                            }
                        }
                    }
                    // Auto-execute if only "Add new hook" is available (no existing hooks)
                    if (hooksOfType.length === 0) {
                        selectedHook = hookItems[0];
                    }
                    else {
                        picker.items = hookItems;
                        picker.value = '';
                        picker.placeholder = localize('commands.hooks.selectHook.placeholder', 'Select a hook to open or add a new one');
                        picker.title = selectedHookType.hookTypeMeta.label;
                        picker.buttons = [backButton];
                        const result = await awaitPick(picker, backButton);
                        if (result === 'back') {
                            step = goBack() ?? 1 /* Step.SelectHookType */;
                            break;
                        }
                        if (!result) {
                            return;
                        }
                        selectedHook = result;
                        stepHistory.push(2 /* Step.SelectHook */);
                    }
                    // Handle clicking on existing hook (focus into command)
                    if (selectedHook.hookEntry) {
                        const entry = selectedHook.hookEntry;
                        let selection;
                        if (entry.agentName) {
                            // Agent hook: search the YAML frontmatter for the command
                            try {
                                const content = await fileService.readFile(entry.fileUri);
                                const commandText = formatHookCommandLabel(entry.command, targetOS);
                                if (commandText) {
                                    selection = findHookCommandInYaml(content.value.toString(), commandText);
                                }
                            }
                            catch {
                                // Ignore errors and just open without selection
                            }
                        }
                        else {
                            // File hook: use JSON-based selection finder
                            const commandFieldName = getEffectiveCommandFieldKey(entry.command, targetOS);
                            if (commandFieldName) {
                                try {
                                    const content = await fileService.readFile(entry.fileUri);
                                    selection = findHookCommandSelection(content.value.toString(), entry.originalHookTypeId, entry.index, commandFieldName);
                                }
                                catch {
                                    // Ignore errors and just open without selection
                                }
                            }
                        }
                        if (options?.openEditor) {
                            await options.openEditor(entry.fileUri, { selection });
                        }
                        else {
                            await editorService.openEditor({
                                resource: entry.fileUri,
                                options: {
                                    selection,
                                    pinned: false
                                }
                            });
                        }
                        return;
                    }
                    // "Add new hook" was selected
                    step = 3 /* Step.SelectFile */;
                    break;
                }
                case 3 /* Step.SelectFile */: {
                    // Step 3: Handle "Add new hook" - show create new file + existing hook files
                    // Get existing hook files (local storage only, not User Data)
                    const hookFiles = await promptsService.listPromptFilesForStorage(PromptsType.hook, PromptsStorage.local, CancellationToken.None);
                    const fileItems = [];
                    // Add "Create new hook config file" option at the top
                    fileItems.push({
                        label: `$(new-file) ${localize('commands.createNewHookFile.label', 'Create new hook config file...')}`,
                        isCreateNewFile: true,
                        alwaysShow: true
                    });
                    // Add existing hook files
                    if (hookFiles.length > 0) {
                        fileItems.push({
                            type: 'separator',
                            label: localize('existingHookFiles', "Existing Hook Files")
                        });
                        for (const hookFile of hookFiles) {
                            const relativePath = labelService.getUriLabel(hookFile.uri, { relative: true });
                            fileItems.push({
                                label: relativePath,
                                fileUri: hookFile.uri
                            });
                        }
                    }
                    // Auto-execute if no existing hook files
                    if (hookFiles.length === 0) {
                        selectedFile = fileItems[0];
                    }
                    else {
                        picker.items = fileItems;
                        picker.value = '';
                        picker.placeholder = localize('commands.hooks.selectFile.placeholder', 'Select a hook file or create a new one');
                        picker.title = localize('commands.hooks.addHook.title', 'Add Hook');
                        picker.buttons = [backButton];
                        const result = await awaitPick(picker, backButton);
                        if (result === 'back') {
                            step = goBack() ?? 2 /* Step.SelectHook */;
                            break;
                        }
                        if (!result) {
                            return;
                        }
                        selectedFile = result;
                        stepHistory.push(3 /* Step.SelectFile */);
                    }
                    // Handle adding hook to existing file
                    if (selectedFile.fileUri) {
                        await addHookToFile(selectedFile.fileUri, selectedHookType.hookType, fileService, editorService, notificationService, bulkEditService, options?.openEditor);
                        return;
                    }
                    // "Create new hook config file" was selected
                    step = 4 /* Step.SelectFolder */;
                    break;
                }
                case 4 /* Step.SelectFolder */: {
                    // Get source folders for hooks
                    const allFolders = await promptsService.getSourceFolders(PromptsType.hook);
                    const localFolders = allFolders.filter(f => f.storage === PromptsStorage.local);
                    if (localFolders.length === 0) {
                        notificationService.error(localize('commands.hook.noLocalFolders', "Please open a workspace folder to configure hooks."));
                        return;
                    }
                    // Auto-select if only one folder, otherwise show picker
                    selectedFolder = localFolders[0];
                    if (localFolders.length > 1) {
                        const folderItems = localFolders.map(folder => ({
                            label: labelService.getUriLabel(folder.uri, { relative: true }),
                            folder
                        }));
                        picker.items = folderItems;
                        picker.value = '';
                        picker.placeholder = localize('commands.hook.selectFolder.placeholder', 'Select a location for the hook file');
                        picker.title = localize('commands.hook.selectFolder.title', 'Hook File Location');
                        picker.buttons = [backButton];
                        const result = await awaitPick(picker, backButton);
                        if (result === 'back') {
                            step = goBack() ?? 3 /* Step.SelectFile */;
                            break;
                        }
                        if (!result) {
                            return;
                        }
                        selectedFolder = result.folder;
                        stepHistory.push(4 /* Step.SelectFolder */);
                    }
                    step = 5 /* Step.EnterFilename */;
                    break;
                }
                case 5 /* Step.EnterFilename */: {
                    // Hide the picker and show an input box for the filename
                    picker.hide();
                    const fileNameResult = await new Promise(resolve => {
                        let resolved = false;
                        const done = (value) => {
                            if (!resolved) {
                                resolved = true;
                                inputDisposables.dispose();
                                resolve(value);
                            }
                        };
                        const inputDisposables = new DisposableStore();
                        const inputBox = inputDisposables.add(quickInputService.createInputBox());
                        inputBox.prompt = localize('commands.hook.filename.prompt', "Enter hook file name");
                        inputBox.placeholder = localize('commands.hook.filename.placeholder', "e.g., hooks, diagnostics, security");
                        inputBox.title = localize('commands.hook.filename.title', "Hook File Name");
                        inputBox.buttons = [backButton];
                        inputBox.ignoreFocusOut = true;
                        inputDisposables.add(inputBox.onDidAccept(async () => {
                            const value = inputBox.value;
                            if (!value || !value.trim()) {
                                inputBox.validationMessage = localize('commands.hook.filename.required', "File name is required");
                                return;
                            }
                            const name = value.trim();
                            if (/[/\\:*?"<>|]/.test(name)) {
                                inputBox.validationMessage = localize('commands.hook.filename.invalidChars', "File name contains invalid characters");
                                return;
                            }
                            done(name);
                        }));
                        inputDisposables.add(inputBox.onDidChangeValue(() => {
                            inputBox.validationMessage = undefined;
                        }));
                        inputDisposables.add(inputBox.onDidTriggerButton(button => {
                            if (button === backButton) {
                                done('back');
                            }
                        }));
                        inputDisposables.add(inputBox.onDidHide(() => {
                            done(undefined);
                        }));
                        inputBox.show();
                    });
                    if (fileNameResult === 'back') {
                        // Re-show the picker for the previous step
                        picker.show();
                        step = goBack() ?? 4 /* Step.SelectFolder */;
                        break;
                    }
                    if (!fileNameResult) {
                        return;
                    }
                    // Create the hooks folder if it doesn't exist
                    await fileService.createFolder(selectedFolder.uri);
                    // Use user-provided filename with .json extension
                    const hookFileName = fileNameResult.endsWith('.json') ? fileNameResult : `${fileNameResult}.json`;
                    const hookFileUri = URI.joinPath(selectedFolder.uri, hookFileName);
                    // Check if file already exists
                    if (await fileService.exists(hookFileUri)) {
                        // File exists - add hook to it instead of creating new
                        await addHookToFile(hookFileUri, selectedHookType.hookType, fileService, editorService, notificationService, bulkEditService, options?.openEditor);
                        return;
                    }
                    // Detect if new file is a Claude hooks file based on its path
                    const newFileFormat = getHookSourceFormat(hookFileUri);
                    const isClaudeNewFile = newFileFormat === HookSourceFormat.Claude;
                    const isCopilotCliOnly = !isClaudeNewFile
                        && !new Set(Object.values(HOOKS_BY_TARGET[Target.VSCode])).has(selectedHookType.hookType)
                        && new Set(Object.values(HOOKS_BY_TARGET[Target.GitHubCopilot])).has(selectedHookType.hookType);
                    const hookTypeKey = isClaudeNewFile
                        ? (getClaudeHookTypeName(selectedHookType.hookType) ?? selectedHookType.hookType)
                        : isCopilotCliOnly
                            ? (getCopilotCliHookTypeName(selectedHookType.hookType) ?? selectedHookType.hookType)
                            : selectedHookType.hookType;
                    const newFileHookEntry = isCopilotCliOnly
                        ? { type: 'command', [targetOS === 1 /* OperatingSystem.Windows */ ? 'powershell' : 'bash']: '' }
                        : buildNewHookEntry(newFileFormat);
                    const commandFieldKey = isCopilotCliOnly
                        ? (targetOS === 1 /* OperatingSystem.Windows */ ? 'powershell' : 'bash')
                        : 'command';
                    // Create new hook file with the selected hook type
                    const hooksContent = {
                        ...(isCopilotCliOnly ? { version: 1 } : {}),
                        hooks: {
                            [hookTypeKey]: [
                                newFileHookEntry
                            ]
                        }
                    };
                    const jsonContent = JSON.stringify(hooksContent, null, '\t');
                    await fileService.writeFile(hookFileUri, VSBuffer.fromString(jsonContent));
                    options?.onHookFileCreated?.(hookFileUri);
                    // Find the selection for the new hook's command field
                    const selection = findHookCommandSelection(jsonContent, hookTypeKey, 0, commandFieldKey);
                    // Open editor with selection
                    if (options?.openEditor) {
                        await options.openEditor(hookFileUri, { selection });
                    }
                    else {
                        await editorService.openEditor({
                            resource: hookFileUri,
                            options: {
                                selection,
                                pinned: false
                            }
                        });
                    }
                    return;
                }
            }
        }
    }
    finally {
        store.dispose();
    }
}
class ManageHooksAction extends Action2 {
    constructor() {
        super({
            id: CONFIGURE_HOOKS_ACTION_ID,
            title: localize2('configure-hooks', "Configure Hooks..."),
            shortTitle: localize2('configure-hooks.short', "Hooks"),
            icon: Codicon.zap,
            f1: true,
            precondition: ChatContextKeys.enabled,
            category: CHAT_CATEGORY,
            menu: {
                id: CHAT_CONFIG_MENU_ID,
                when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
                order: 12,
                group: '1_level'
            }
        });
    }
    async run(accessor) {
        return showConfigureHooksQuickPick(accessor);
    }
}
/**
 * Helper to register the `Manage Hooks` action.
 */
export function registerHookActions() {
    registerAction2(ManageHooksAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va0FjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvcHJvbXB0U3ludGF4L2hvb2tBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLElBQUksVUFBVSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUN4QyxPQUFPLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDL0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFMUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLEVB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