/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { basename, dirname, isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { EditorPaneDescriptor } from '../../../../browser/editor.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { EditorExtensions } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { AI_CUSTOMIZATION_ITEM_DISABLED_KEY, AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AI_CUSTOMIZATION_ITEM_TYPE_KEY, AI_CUSTOMIZATION_ITEM_URI_KEY, AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID, AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID, AICustomizationManagementCommands, AICustomizationManagementItemMenuId, BUILTIN_STORAGE, } from './aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from './aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from './aiCustomizationManagementEditorInput.js';
//#endregion
//#region Editor Registration
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(AICustomizationManagementEditor, AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID, localize('aiCustomizationManagementEditor', "Chat Customizations Editor")), [
    // Note: Using the class directly since we use a singleton pattern
    new SyncDescriptor(AICustomizationManagementEditorInput)
]);
//#endregion
//#region Editor Serializer
class AICustomizationManagementEditorInputSerializer {
    canSerialize(editorInput) {
        return editorInput instanceof AICustomizationManagementEditorInput;
    }
    serialize(input) {
        return '';
    }
    deserialize(instantiationService) {
        return AICustomizationManagementEditorInput.getOrCreate();
    }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID, AICustomizationManagementEditorInputSerializer);
/**
 * Extracts a URI from various context formats.
 */
function extractURI(context) {
    if (URI.isUri(context)) {
        return context;
    }
    if (typeof context === 'string') {
        return URI.parse(context);
    }
    if (URI.isUri(context.uri)) {
        return context.uri;
    }
    return URI.parse(context.uri);
}
/**
 * Extracts storage type from context.
 */
function extractStorage(context) {
    if (URI.isUri(context) || typeof context === 'string') {
        return undefined;
    }
    return context.storage;
}
/**
 * Extracts prompt type from context.
 */
function extractPromptType(context) {
    if (URI.isUri(context) || typeof context === 'string') {
        return undefined;
    }
    return context.promptType;
}
/**
 * Extracts the parent plugin URI from context, if present.
 */
function extractPluginUri(context) {
    if (URI.isUri(context) || typeof context === 'string') {
        return undefined;
    }
    const raw = context.pluginUri;
    if (!raw) {
        return undefined;
    }
    return URI.isUri(raw) ? raw : typeof raw === 'string' ? URI.parse(raw) : undefined;
}
// Open file action
const OPEN_AI_CUSTOMIZATION_MGMT_FILE_ID = 'aiCustomizationManagement.openFile';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: OPEN_AI_CUSTOMIZATION_MGMT_FILE_ID,
            title: localize2('open', "Open"),
            icon: Codicon.goToFile,
        });
    }
    async run(accessor, context) {
        const editorService = accessor.get(IEditorService);
        const storage = extractStorage(context);
        const editorPane = await editorService.openEditor({
            resource: extractURI(context)
        });
        const codeEditor = getCodeEditor(editorPane?.getControl());
        if (codeEditor && (storage === PromptsStorage.extension || storage === PromptsStorage.plugin)) {
            codeEditor.updateOptions({
                readOnly: true,
                readOnlyMessage: new MarkdownString(localize('readonlyPluginFile', "This file is provided by a plugin or extension and cannot be edited.")),
            });
        }
    }
});
// Run prompt action
const RUN_PROMPT_MGMT_ID = 'aiCustomizationManagement.runPrompt';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: RUN_PROMPT_MGMT_ID,
            title: localize2('runPrompt', "Run Prompt"),
            icon: Codicon.play,
        });
    }
    async run(accessor, context) {
        const commandService = accessor.get(ICommandService);
        await commandService.executeCommand('workbench.action.chat.run.prompt.current', extractURI(context));
    }
});
// Reveal in Finder/Explorer action
const REVEAL_IN_OS_LABEL = isWindows
    ? localize2('revealInWindows', "Reveal in File Explorer")
    : isMacintosh
        ? localize2('revealInMac', "Reveal in Finder")
        : localize2('openContainer', "Open Containing Folder");
const REVEAL_AI_CUSTOMIZATION_IN_OS_ID = 'aiCustomizationManagement.revealInOS';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: REVEAL_AI_CUSTOMIZATION_IN_OS_ID,
            title: REVEAL_IN_OS_LABEL,
            icon: Codicon.folderOpened,
        });
    }
    async run(accessor, context) {
        const commandService = accessor.get(ICommandService);
        const uri = extractURI(context);
        // Use existing reveal command
        await commandService.executeCommand('revealFileInOS', uri);
    }
});
// Delete action
const DELETE_AI_CUSTOMIZATION_ID = 'aiCustomizationManagement.delete';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: DELETE_AI_CUSTOMIZATION_ID,
            title: localize2('delete', "Delete"),
            icon: Codicon.trash,
        });
    }
    async run(accessor, context) {
        const fileService = accessor.get(IFileService);
        const dialogService = accessor.get(IDialogService);
        const telemetryService = accessor.get(ITelemetryService);
        const workspaceService = accessor.get(IAICustomizationWorkspaceService);
        const uri = extractURI(context);
        const storage = extractStorage(context);
        const promptType = extractPromptType(context);
        const isSkill = promptType === PromptsType.skill;
        // For skills, use the parent folder name since skills are structured as <skillname>/SKILL.md.
        const fileName = isSkill ? basename(dirname(uri)) : basename(uri);
        // Plugin-provided files: offer to uninstall the plugin
        if (storage === PromptsStorage.plugin) {
            const agentPluginService = accessor.get(IAgentPluginService);
            const plugin = agentPluginService.plugins.get().find(p => isEqualOrParent(uri, p.uri));
            if (plugin) {
                const result = await dialogService.confirm({
                    message: localize('cannotDeletePluginItem', "This item is provided by the plugin '{0}'", plugin.label),
                    detail: localize('cannotDeletePluginItemDetail', "Individual components from a plugin cannot be removed separately. Would you like to uninstall the entire plugin?"),
                    primaryButton: localize('uninstallPlugin', "Uninstall Plugin"),
                    type: 'question',
                });
                if (result.confirmed) {
                    plugin.remove();
                }
            }
            return;
        }
        // Extension and built-in files cannot be deleted
        if (storage === PromptsStorage.extension || storage === BUILTIN_STORAGE) {
            await dialogService.info(localize('cannotDeleteExtension', "Cannot Delete Extension File"), localize('cannotDeleteExtensionDetail', "Files provided by extensions cannot be deleted. You can disable the extension if you no longer want to use this customization."));
            return;
        }
        // Confirm deletion
        const message = isSkill
            ? localize('confirmDeleteSkill', "Are you sure you want to delete skill '{0}' and its folder?", fileName)
            : localize('confirmDelete', "Are you sure you want to delete '{0}'?", fileName);
        const confirmation = await dialogService.confirm({
            message,
            detail: localize('confirmDeleteDetail', "This action cannot be undone."),
            primaryButton: localize('delete', "Delete"),
            type: 'warning',
        });
        if (confirmation.confirmed) {
            try {
                telemetryService.publicLog2('chatCustomizationEditor.deleteItem', {
                    promptType: promptType ?? '',
                    storage: storage ?? '',
                });
            }
            catch {
                // Telemetry must not block deletion
            }
            // For skills, delete the parent folder (e.g. .github/skills/my-skill/)
            // since each skill is a folder containing SKILL.md.
            const deleteTarget = isSkill ? dirname(uri) : uri;
            const useTrash = fileService.hasCapability(deleteTarget, 4096 /* FileSystemProviderCapabilities.Trash */);
            await fileService.del(deleteTarget, { useTrash, recursive: isSkill });
            // Commit the deletion to git (sessions: main repo + worktree)
            if (storage === PromptsStorage.local) {
                const projectRoot = workspaceService.getActiveProjectRoot();
                if (projectRoot) {
                    await workspaceService.deleteFiles(projectRoot, [deleteTarget]);
                }
            }
        }
    }
});
// Copy path action
const COPY_AI_CUSTOMIZATION_PATH_ID = 'aiCustomizationManagement.copyPath';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: COPY_AI_CUSTOMIZATION_PATH_ID,
            title: localize2('copyPath', "Copy Path"),
            icon: Codicon.clippy,
        });
    }
    async run(accessor, context) {
        const clipboardService = accessor.get(IClipboardService);
        const uri = extractURI(context);
        const textToCopy = uri.scheme === 'file' ? uri.fsPath : uri.toString(true);
        await clipboardService.writeText(textToCopy);
    }
});
/**
 * When clause that hides an action for read-only (extension, plugin, built-in) items.
 */
const WHEN_ITEM_IS_DELETABLE = ContextKeyExpr.and(ContextKeyExpr.notEquals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, PromptsStorage.extension), ContextKeyExpr.notEquals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, PromptsStorage.plugin), ContextKeyExpr.notEquals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, BUILTIN_STORAGE));
/**
 * When clause that shows an action only for plugin items.
 */
const WHEN_ITEM_IS_PLUGIN = ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, PromptsStorage.plugin);
// Register context menu items
// Inline hover actions (shown as icon buttons on hover)
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: COPY_AI_CUSTOMIZATION_PATH_ID, title: localize('copyPath', "Copy Path"), icon: Codicon.clippy },
    group: 'inline',
    order: 1,
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: DELETE_AI_CUSTOMIZATION_ID, title: localize('delete', "Delete"), icon: Codicon.trash },
    group: 'inline',
    order: 10,
    when: WHEN_ITEM_IS_DELETABLE,
});
// Context menu items (shown on right-click)
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: OPEN_AI_CUSTOMIZATION_MGMT_FILE_ID, title: localize('open', "Open") },
    group: '1_open',
    order: 1,
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: RUN_PROMPT_MGMT_ID, title: localize('runPrompt', "Run Prompt"), icon: Codicon.play },
    group: '2_run',
    order: 1,
    when: ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.prompt),
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: REVEAL_AI_CUSTOMIZATION_IN_OS_ID, title: REVEAL_IN_OS_LABEL.value },
    group: '3_file',
    order: 1,
    when: ContextKeyExpr.or(ContextKeyExpr.regex(AI_CUSTOMIZATION_ITEM_URI_KEY, new RegExp(`^${Schemas.file}:`)), ContextKeyExpr.regex(AI_CUSTOMIZATION_ITEM_URI_KEY, new RegExp(`^${Schemas.vscodeUserData}:`))),
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: DELETE_AI_CUSTOMIZATION_ID, title: localize('delete', "Delete") },
    group: '4_modify',
    order: 1,
    when: WHEN_ITEM_IS_DELETABLE,
});
// Uninstall Plugin action - shown for plugin-provided items
const UNINSTALL_PLUGIN_AI_CUSTOMIZATION_ID = 'aiCustomizationManagement.uninstallPlugin';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: UNINSTALL_PLUGIN_AI_CUSTOMIZATION_ID,
            title: localize2('uninstallPlugin', "Uninstall Plugin"),
            icon: Codicon.trash,
        });
    }
    async run(accessor, context) {
        const agentPluginService = accessor.get(IAgentPluginService);
        const dialogService = accessor.get(IDialogService);
        const uri = extractURI(context);
        const plugin = agentPluginService.plugins.get().find(p => isEqualOrParent(uri, p.uri));
        if (!plugin) {
            return;
        }
        const result = await dialogService.confirm({
            message: localize('confirmUninstallPlugin', "This item is provided by the plugin '{0}'", plugin.label),
            detail: localize('confirmUninstallPluginDetail', "Individual components from a plugin cannot be removed separately. Would you like to uninstall the entire plugin?"),
            primaryButton: localize('uninstallPluginBtn', "Uninstall Plugin"),
            type: 'question',
        });
        if (result.confirmed) {
            plugin.remove();
        }
    }
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: UNINSTALL_PLUGIN_AI_CUSTOMIZATION_ID, title: localize('uninstallPlugin', "Uninstall Plugin"), icon: Codicon.trash },
    group: 'inline',
    order: 10,
    when: WHEN_ITEM_IS_PLUGIN,
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: UNINSTALL_PLUGIN_AI_CUSTOMIZATION_ID, title: localize('uninstallPlugin', "Uninstall Plugin") },
    group: '4_modify',
    order: 1,
    when: WHEN_ITEM_IS_PLUGIN,
});
// Show Plugin action - navigates to the parent plugin detail page
const SHOW_PLUGIN_AI_CUSTOMIZATION_ID = 'aiCustomizationManagement.showPlugin';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: SHOW_PLUGIN_AI_CUSTOMIZATION_ID,
            title: localize2('showPlugin', "Show Plugin"),
        });
    }
    async run(accessor, context) {
        const agentPluginService = accessor.get(IAgentPluginService);
        const editorService = accessor.get(IEditorService);
        const pluginUri = extractPluginUri(context);
        if (!pluginUri) {
            return;
        }
        const plugin = agentPluginService.plugins.get().find(p => p.uri.toString() === pluginUri.toString());
        if (!plugin) {
            return;
        }
        const item = {
            kind: "installed" /* AgentPluginItemKind.Installed */,
            name: plugin.label,
            description: plugin.fromMarketplace?.description ?? '',
            marketplace: plugin.fromMarketplace?.marketplace,
            plugin,
        };
        // Try to show within the active AI Customization editor (with back navigation)
        const input = AICustomizationManagementEditorInput.getOrCreate();
        const pane = await editorService.openEditor(input, { pinned: true });
        if (pane instanceof AICustomizationManagementEditor) {
            await pane.showPluginDetail(item);
        }
    }
});
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: SHOW_PLUGIN_AI_CUSTOMIZATION_ID, title: localize('showPlugin', "Show Plugin") },
    group: '1_open',
    order: 2,
    when: WHEN_ITEM_IS_PLUGIN,
});
// Disable item action
const DISABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID = 'aiCustomizationManagement.disableItem';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: DISABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID,
            title: localize2('disable', "Disable"),
            icon: Codicon.eyeClosed,
        });
    }
    async run(accessor, context) {
        const promptsService = accessor.get(IPromptsService);
        const uri = extractURI(context);
        const promptType = extractPromptType(context);
        if (!promptType) {
            return;
        }
        const disabled = promptsService.getDisabledPromptFiles(promptType);
        disabled.add(uri);
        promptsService.setDisabledPromptFiles(promptType, disabled);
    }
});
// Enable item action
const ENABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID = 'aiCustomizationManagement.enableItem';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: ENABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID,
            title: localize2('enable', "Enable"),
            icon: Codicon.eye,
        });
    }
    async run(accessor, context) {
        const promptsService = accessor.get(IPromptsService);
        const uri = extractURI(context);
        const promptType = extractPromptType(context);
        if (!promptType) {
            return;
        }
        const disabled = promptsService.getDisabledPromptFiles(promptType);
        disabled.delete(uri);
        promptsService.setDisabledPromptFiles(promptType, disabled);
    }
});
// Context menu: Disable (shown when builtin item is enabled)
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: DISABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID, title: localize('disable', "Disable") },
    group: '5_toggle',
    order: 1,
    when: ContextKeyExpr.and(ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_DISABLED_KEY, false), ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, BUILTIN_STORAGE), ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.skill)),
});
// Context menu: Enable (shown when builtin item is disabled)
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: ENABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID, title: localize('enable', "Enable") },
    group: '5_toggle',
    order: 1,
    when: ContextKeyExpr.and(ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_DISABLED_KEY, true), ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, BUILTIN_STORAGE), ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.skill)),
});
// Inline hover: Disable (shown when builtin item is enabled)
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: DISABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID, title: localize('disable', "Disable"), icon: Codicon.eyeClosed },
    group: 'inline',
    order: 5,
    when: ContextKeyExpr.and(ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_DISABLED_KEY, false), ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, BUILTIN_STORAGE), ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.skill)),
});
// Inline hover: Enable (shown when builtin item is disabled)
MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
    command: { id: ENABLE_AI_CUSTOMIZATION_MGMT_ITEM_ID, title: localize('enable', "Enable"), icon: Codicon.eye },
    group: 'inline',
    order: 5,
    when: ContextKeyExpr.and(ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_DISABLED_KEY, true), ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_STORAGE_KEY, BUILTIN_STORAGE), ContextKeyExpr.equals(AI_CUSTOMIZATION_ITEM_TYPE_KEY, PromptsType.skill)),
});
//#endregion
//#region Actions
class AICustomizationManagementActionsContribution extends Disposable {
    static { this.ID = 'workbench.contrib.aiCustomizationManagementActions'; }
    constructor() {
        super();
        this.registerActions();
    }
    registerActions() {
        // Open AI Customizations Editor
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: AICustomizationManagementCommands.OpenEditor,
                    title: localize2('openAICustomizations', "Open Customizations (Preview)"),
                    shortTitle: localize2('aiCustomizations', "Customizations (Preview)"),
                    category: CHAT_CATEGORY,
                    precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(`config.${ChatConfiguration.ChatCustomizationMenuEnabled}`)),
                    f1: true,
                });
            }
            async run(accessor, section) {
                const editorService = accessor.get(IEditorService);
                const input = AICustomizationManagementEditorInput.getOrCreate();
                const pane = await editorService.openEditor(input, { pinned: true });
                if (section && pane instanceof AICustomizationManagementEditor) {
                    pane.selectSectionById(section);
                }
            }
        }));
        // Generate Debug Report
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: AICustomizationManagementCommands.GenerateDebugReport,
                    title: localize2('generateDebugReport', "Generate Customization Debug Report"),
                    category: Categories.Developer,
                    precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(`config.${ChatConfiguration.ChatCustomizationMenuEnabled}`)),
                    f1: true,
                });
            }
            async run(accessor) {
                const editorService = accessor.get(IEditorService);
                // Open the customizations editor if not already open
                const input = AICustomizationManagementEditorInput.getOrCreate();
                const pane = await editorService.openEditor(input, { pinned: true });
                if (!(pane instanceof AICustomizationManagementEditor)) {
                    return;
                }
                const report = await pane.generateDebugReport();
                await editorService.openEditor({
                    resource: undefined,
                    contents: report,
                    languageId: 'plaintext',
                });
            }
        }));
    }
}
registerWorkbenchContribution2(AICustomizationManagementActionsContribution.ID, AICustomizationManagementActionsContribution, 3 /* WorkbenchPhase.AfterRestored */);
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDN0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDM0csT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDakcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxj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