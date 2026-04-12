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
import * as dom from '../../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { basename, joinPath } from '../../../../../../base/common/resources.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../../../files/browser/fileConstants.js';
import { getAttachableImageExtension } from '../../../common/model/chatModel.js';
import { ChatAttachmentsContentPart } from './chatAttachmentsContentPart.js';
/**
 * Delay in milliseconds before decoding base64 image data.
 * This avoids expensive decode operations during scrolling.
 */
const IMAGE_DECODE_DELAY_MS = 100;
/**
 * A reusable widget for rendering a group of resource data parts (files, images)
 * with attachment pills and a toolbar with save actions.
 *
 * Used by ChatToolOutputContentSubPart and ChatMcpAppSubPart (for download resources).
 */
let ChatResourceGroupWidget = class ChatResourceGroupWidget extends Disposable {
    constructor(parts, _instantiationService, _contextMenuService, _fileService) {
        super();
        this._instantiationService = _instantiationService;
        this._contextMenuService = _contextMenuService;
        this._fileService = _fileService;
        this._onDidChangeHeight = this._register(new Emitter());
        this.onDidChangeHeight = this._onDidChangeHeight.event;
        const el = dom.h('.chat-collapsible-io-resource-group', [
            dom.h('.chat-collapsible-io-resource-items@items'),
            dom.h('.chat-collapsible-io-resource-actions@actions'),
        ]);
        this.domNode = el.root;
        this._fillInResourceGroup(parts, el.items, el.actions);
    }
    async _fillInResourceGroup(parts, itemsContainer, actionsContainer) {
        // First pass: create entries immediately, using file placeholders for base64 images
        const entries = [];
        const deferredImageParts = [];
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.mimeType && getAttachableImageExtension(part.mimeType)) {
                if (part.base64Value) {
                    // Defer base64 decode - use file placeholder for now
                    entries.push({ kind: 'file', id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
                    deferredImageParts.push({ index: i, part });
                }
                else if (part.value) {
                    entries.push({ kind: 'image', id: generateUuid(), name: basename(part.uri), value: part.value, mimeType: part.mimeType, isURL: false, references: [{ kind: 'reference', reference: part.uri }] });
                }
                else {
                    const value = await this._fileService.readFile(part.uri).then(f => f.value.buffer, () => undefined);
                    if (!value) {
                        entries.push({ kind: 'file', id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
                    }
                    else {
                        entries.push({ kind: 'image', id: generateUuid(), name: basename(part.uri), value, mimeType: part.mimeType, isURL: false, references: [{ kind: 'reference', reference: part.uri }] });
                    }
                }
            }
            else {
                entries.push({ kind: 'file', id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
            }
        }
        if (this._store.isDisposed) {
            return;
        }
        // Render attachments immediately with placeholders
        const attachments = this._register(this._instantiationService.createInstance(ChatAttachmentsContentPart, {
            variables: entries,
            limit: 5,
            contentReferences: undefined,
            domNode: undefined
        }));
        attachments.contextMenuHandler = (attachment, event) => {
            const index = entries.indexOf(attachment);
            const part = parts[index];
            if (part) {
                event.preventDefault();
                event.stopPropagation();
                this._contextMenuService.showContextMenu({
                    menuId: MenuId.ChatToolOutputResourceContext,
                    menuActionOptions: { shouldForwardArgs: true },
                    getAnchor: () => ({ x: event.pageX, y: event.pageY }),
                    getActionsContext: () => ({ parts: [part] }),
                });
            }
        };
        itemsContainer.appendChild(attachments.domNode);
        this._onDidChangeHeight.fire();
        const toolbar = this._register(this._instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, MenuId.ChatToolOutputResourceToolbar, {
            menuOptions: {
                shouldForwardArgs: true,
            },
        }));
        toolbar.context = { parts };
        // Second pass: decode base64 images asynchronously and update in place
        if (deferredImageParts.length > 0) {
            this._register(disposableTimeout(() => {
                for (const { index, part } of deferredImageParts) {
                    try {
                        const value = decodeBase64(part.base64Value).buffer;
                        entries[index] = { kind: 'image', id: generateUuid(), name: basename(part.uri), value, mimeType: part.mimeType, isURL: false, references: [{ kind: 'reference', reference: part.uri }] };
                    }
                    catch {
                        // Keep the file placeholder on decode failure
                    }
                }
                // Update attachments in place
                attachments.updateVariables(entries);
                this._onDidChangeHeight.fire();
            }, IMAGE_DECODE_DELAY_MS));
        }
    }
};
ChatResourceGroupWidget = __decorate([
    __param(1, IInstantiationService),
    __param(2, IContextMenuService),
    __param(3, IFileService)
], ChatResourceGroupWidget);
export { ChatResourceGroupWidget };
class SaveResourcesAction extends Action2 {
    static { this.ID = 'chat.toolOutput.save'; }
    constructor() {
        super({
            id: SaveResourcesAction.ID,
            title: localize2('chat.saveResources', "Save..."),
            icon: Codicon.cloudDownload,
            menu: [{
                    id: MenuId.ChatToolOutputResourceToolbar,
                    group: 'navigation',
                    order: 1
                }, {
                    id: MenuId.ChatToolOutputResourceContext,
                }]
        });
    }
    async run(accessor, context) {
        const fileDialog = accessor.get(IFileDialogService);
        const fileService = accessor.get(IFileService);
        const notificationService = accessor.get(INotificationService);
        const progressService = accessor.get(IProgressService);
        const workspaceContextService = accessor.get(IWorkspaceContextService);
        const commandService = accessor.get(ICommandService);
        const labelService = accessor.get(ILabelService);
        const defaultFilepath = await fileDialog.defaultFilePath();
        const savePart = async (part, isFolder, uri) => {
            const target = isFolder ? joinPath(uri, basename(part.uri)) : uri;
            try {
                if (part.kind === 'data') {
                    await fileService.copy(part.uri, target, true);
                }
                else {
                    // MCP doesn't support streaming data, so no sense trying
                    const contents = await fileService.readFile(part.uri);
                    await fileService.writeFile(target, contents.value);
                }
            }
            catch (e) {
                notificationService.error(localize('chat.saveResources.error', "Failed to save {0}: {1}", basename(part.uri), e));
            }
        };
        const withProgress = async (thenReveal, todo) => {
            await progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                delay: 5_000,
                title: localize('chat.saveResources.progress', "Saving resources..."),
            }, async (report) => {
                for (const task of todo) {
                    await task();
                    report.report({ increment: 1, total: todo.length });
                }
            });
            if (workspaceContextService.isInsideWorkspace(thenReveal)) {
                commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, thenReveal);
            }
            else {
                notificationService.info(localize('chat.saveResources.reveal', "Saved resources to {0}", labelService.getUriLabel(thenReveal)));
            }
        };
        if (context.parts.length === 1) {
            const part = context.parts[0];
            const uri = await fileDialog.pickFileToSave(joinPath(defaultFilepath, basename(part.uri)));
            if (!uri) {
                return;
            }
            await withProgress(uri, [() => savePart(part, false, uri)]);
        }
        else {
            const uris = await fileDialog.showOpenDialog({
                title: localize('chat.saveResources.title', "Pick folder to save resources"),
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri: workspaceContextService.getWorkspace().folders[0]?.uri,
            });
            if (!uris?.length) {
                return;
            }
            await withProgress(uris[0], context.parts.map(part => () => savePart(part, true, uris[0])));
        }
    }
}
registerAction2(SaveResourcesAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFJlc291cmNlR3JvdXBXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdFJlc291cmNlR3JvdXBXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUVoRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN4RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDekYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDcEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYs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