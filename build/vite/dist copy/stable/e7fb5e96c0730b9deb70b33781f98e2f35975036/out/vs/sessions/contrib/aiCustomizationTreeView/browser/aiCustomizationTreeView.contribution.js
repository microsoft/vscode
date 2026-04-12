/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { AI_CUSTOMIZATION_VIEW_ID, AICustomizationItemMenuId } from './aiCustomizationTreeView.js';
import { AICustomizationItemDisabledContextKey, AICustomizationItemStorageContextKey, AICustomizationItemTypeContextKey } from './aiCustomizationTreeViewViews.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { BUILTIN_STORAGE } from '../../chat/common/builtinPromptsStorage.js';
/**
 * Extracts a URI from various context formats.
 * Context can be a URI, string, or an object with uri property.
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
//#endregion
//#region Context Menu Actions
// Open file action
const OPEN_AI_CUSTOMIZATION_FILE_ID = 'aiCustomization.openFile';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: OPEN_AI_CUSTOMIZATION_FILE_ID,
            title: localize2('open', "Open"),
            icon: Codicon.goToFile,
        });
    }
    async run(accessor, context) {
        const editorService = accessor.get(IEditorService);
        await editorService.openEditor({
            resource: extractURI(context)
        });
    }
});
// Run prompt action
const RUN_PROMPT_FROM_VIEW_ID = 'aiCustomization.runPrompt';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: RUN_PROMPT_FROM_VIEW_ID,
            title: localize2('runPrompt', "Run Prompt"),
            icon: Codicon.play,
        });
    }
    async run(accessor, context) {
        const commandService = accessor.get(ICommandService);
        await commandService.executeCommand('workbench.action.chat.run.prompt.current', extractURI(context));
    }
});
// Delete file action
const DELETE_AI_CUSTOMIZATION_FILE_ID = 'aiCustomization.deleteFile';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: DELETE_AI_CUSTOMIZATION_FILE_ID,
            title: localize2('delete', "Delete"),
            icon: Codicon.trash,
        });
    }
    async run(accessor, context) {
        const fileService = accessor.get(IFileService);
        const dialogService = accessor.get(IDialogService);
        const uri = extractURI(context);
        const name = typeof context === 'object' && !URI.isUri(context) ? context.name ?? '' : '';
        if (uri.scheme !== 'file') {
            return;
        }
        const confirmation = await dialogService.confirm({
            message: localize('confirmDelete', "Are you sure you want to delete '{0}'?", name || uri.path),
            primaryButton: localize('delete', "Delete"),
        });
        if (confirmation.confirmed) {
            const useTrash = fileService.hasCapability(uri, 4096 /* FileSystemProviderCapabilities.Trash */);
            await fileService.del(uri, { useTrash, recursive: true });
        }
    }
});
// Copy path action
const COPY_AI_CUSTOMIZATION_PATH_ID = 'aiCustomization.copyPath';
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
// Register context menu items
// Inline hover actions (shown as icon buttons on hover)
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
    command: { id: DELETE_AI_CUSTOMIZATION_FILE_ID, title: localize('delete', "Delete"), icon: Codicon.trash },
    group: 'inline',
    order: 10,
});
// Context menu items (shown on right-click)
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
    command: { id: OPEN_AI_CUSTOMIZATION_FILE_ID, title: localize('open', "Open") },
    group: '1_open',
    order: 1,
});
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
    command: { id: RUN_PROMPT_FROM_VIEW_ID, title: localize('runPrompt', "Run Prompt"), icon: Codicon.play },
    group: '2_run',
    order: 1,
    when: ContextKeyExpr.equals(AICustomizationItemTypeContextKey.key, PromptsType.prompt),
});
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
    command: { id: COPY_AI_CUSTOMIZATION_PATH_ID, title: localize('copyPath', "Copy Path") },
    group: '3_modify',
    order: 1,
});
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
    command: { id: DELETE_AI_CUSTOMIZATION_FILE_ID, title: localize('delete', "Delete") },
    group: '3_modify',
    order: 10,
});
// Disable item action
const DISABLE_AI_CUSTOMIZATION_ITEM_ID = 'aiCustomization.disableItem';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: DISABLE_AI_CUSTOMIZATION_ITEM_ID,
            title: localize2('disable', "Disable"),
            icon: Codicon.eyeClosed,
        });
    }
    async run(accessor, context) {
        if (typeof context !== 'object' || URI.isUri(context)) {
            return;
        }
        const promptsService = accessor.get(IPromptsService);
        const viewsService = accessor.get(IViewsService);
        const uri = extractURI(context);
        const promptType = context.promptType;
        if (!promptType) {
            return;
        }
        const disabled = promptsService.getDisabledPromptFiles(promptType);
        disabled.add(uri);
        promptsService.setDisabledPromptFiles(promptType, disabled);
        const view = viewsService.getActiveViewWithId(AI_CUSTOMIZATION_VIEW_ID);
        view?.refresh();
    }
});
// Enable item action
const ENABLE_AI_CUSTOMIZATION_ITEM_ID = 'aiCustomization.enableItem';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: ENABLE_AI_CUSTOMIZATION_ITEM_ID,
            title: localize2('enable', "Enable"),
            icon: Codicon.eye,
        });
    }
    async run(accessor, context) {
        if (typeof context !== 'object' || URI.isUri(context)) {
            return;
        }
        const promptsService = accessor.get(IPromptsService);
        const viewsService = accessor.get(IViewsService);
        const uri = extractURI(context);
        const promptType = context.promptType;
        if (!promptType) {
            return;
        }
        const disabled = promptsService.getDisabledPromptFiles(promptType);
        disabled.delete(uri);
        promptsService.setDisabledPromptFiles(promptType, disabled);
        const view = viewsService.getActiveViewWithId(AI_CUSTOMIZATION_VIEW_ID);
        view?.refresh();
    }
});
// Context menu: Disable (shown when builtin item is enabled)
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
    command: { id: DISABLE_AI_CUSTOMIZATION_ITEM_ID, title: localize('disable', "Disable") },
    group: '4_toggle',
    order: 1,
    when: ContextKeyExpr.and(ContextKeyExpr.equals(AICustomizationItemDisabledContextKey.key, false), ContextKeyExpr.equals(AICustomizationItemStorageContextKey.key, BUILTIN_STORAGE), ContextKeyExpr.equals(AICustomizationItemTypeContextKey.key, PromptsType.skill)),
});
// Context menu: Enable (shown when builtin item is disabled)
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
    command: { id: ENABLE_AI_CUSTOMIZATION_ITEM_ID, title: localize('enable', "Enable") },
    group: '4_toggle',
    order: 1,
    when: ContextKeyExpr.and(ContextKeyExpr.equals(AICustomizationItemDisabledContextKey.key, true), ContextKeyExpr.equals(AICustomizationItemStorageContextKey.key, BUILTIN_STORAGE), ContextKeyExpr.equals(AICustomizationItemTypeContextKey.key, PromptsType.skill)),
});
// Inline hover: Disable (shown when builtin item is enabled)
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
    command: { id: DISABLE_AI_CUSTOMIZATION_ITEM_ID, title: localize('disable', "Disable"), icon: Codicon.eyeClosed },
    group: 'inline',
    order: 5,
    when: ContextKeyExpr.and(ContextKeyExpr.equals(AICustomizationItemDisabledContextKey.key, false), ContextKeyExpr.equals(AICustomizationItemStorageContextKey.key, BUILTIN_STORAGE), ContextKeyExpr.equals(AICustomizationItemTypeContextKey.key, PromptsType.skill)),
});
// Inline hover: Enable (shown when builtin item is disabled)
MenuRegistry.appendMenuItem(AICustomizationItemMenuId, {
    command: { id: ENABLE_AI_CUSTOMIZATION_ITEM_ID, title: localize('enable', "Enable"), icon: Codicon.eye },
    group: 'inline',
    order: 5,
    when: ContextKeyExpr.and(ContextKeyExpr.equals(AICustomizationItemDisabledContextKey.key, true), ContextKeyExpr.equals(AICustomizationItemStorageContextKey.key, BUILTIN_STORAGE), ContextKeyExpr.equals(AICustomizationItemTypeContextKey.key, PromptsType.skill)),
});
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uVHJlZVZpZXcuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9haUN1c3RvbWl6YXRpb25UcmVlVmlldy9icm93c2VyL2FpQ3VzdG9taXphdGlvblRyZWVWaWV3LmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUV0RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNuRyxPQUFPLEVBQUUscUNBQXFDLEVBQUUsb0NBQW9DLEVBQUUsaUNBQWlDLEVBQTJCLE1BQU0sbUNBQW1DLENBQUM7QUFDNUwsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUMvRixPQUFPLEVBQUUsWUFBWSxFQUFrQyxNQUFNLDRDQUE0QyxDQUFDO0FBQzFHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixP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