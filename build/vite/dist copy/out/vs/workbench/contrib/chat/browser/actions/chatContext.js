var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isElectron } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { UntitledTextEditorInput } from '../../../../services/untitled/common/untitledTextEditorInput.js';
import { FileEditorInput } from '../../../files/browser/editors/fileEditorInput.js';
import { NotebookEditorInput } from '../../../notebook/common/notebookEditorInput.js';
import { IChatContextPickService } from '../attachments/chatContextPickService.js';
import { toToolSetVariableEntry, toToolVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { isToolSet, ToolDataSource } from '../../common/tools/languageModelToolsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { imageToHash, isImage } from '../widget/input/editor/chatPasteProviders.js';
import { convertBufferToScreenshotVariable } from '../attachments/chatScreenshotContext.js';
import { ChatInstructionsPickerPick } from '../promptSyntax/attachInstructionsAction.js';
import { createDebugEventsAttachment } from '../chatDebug/chatDebugAttachment.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { getAgentSessionProviderIcon, AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
/**
 * Command ID that extensions can call to enable debug tools for the current
 * chat session. Sets the context key and immediately flushes tool updates so
 * that newly-enabled tools are visible on the next `vscode.lm.tools` read.
 */
export const EnableChatDebugToolsCommandId = 'chat.enableDebugTools';
let ChatContextContributions = class ChatContextContributions extends Disposable {
    static { this.ID = 'chat.contextContributions'; }
    constructor(instantiationService, contextPickService) {
        super();
        // ###############################################################################################
        //
        // Default context picks/values which are "native" to chat. This is NOT the complete list
        // and feature area specific context, like for notebooks, problems, etc, should be contributed
        // by the feature area.
        //
        // ###############################################################################################
        this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ToolsContextPickerPick)));
        this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ChatInstructionsPickerPick)));
        this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(OpenEditorContextValuePick)));
        this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ClipboardImageContextValuePick)));
        this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ScreenshotContextValuePick)));
        this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(DebugEventsSnapshotContextValuePick)));
        this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(SessionReferenceContextPickerPick)));
    }
};
ChatContextContributions = __decorate([
    __param(0, IInstantiationService),
    __param(1, IChatContextPickService)
], ChatContextContributions);
export { ChatContextContributions };
class ToolsContextPickerPick {
    constructor() {
        this.type = 'pickerPick';
        this.label = localize('chatContext.tools', 'Tools...');
        this.icon = Codicon.tools;
        this.ordinal = -500;
    }
    isEnabled(widget) {
        return !!widget.attachmentCapabilities.supportsToolAttachments;
    }
    asPicker(widget) {
        const items = [];
        for (const [entry, enabled] of widget.input.selectedToolsModel.entriesMap.get()) {
            if (enabled) {
                if (isToolSet(entry)) {
                    items.push({
                        toolInfo: ToolDataSource.classify(entry.source),
                        label: entry.referenceName,
                        description: entry.description,
                        asAttachment: () => toToolSetVariableEntry(entry)
                    });
                }
                else {
                    items.push({
                        toolInfo: ToolDataSource.classify(entry.source),
                        label: entry.toolReferenceName ?? entry.displayName,
                        description: entry.userDescription ?? entry.modelDescription,
                        asAttachment: () => toToolVariableEntry(entry)
                    });
                }
            }
        }
        items.sort((a, b) => {
            let res = a.toolInfo.ordinal - b.toolInfo.ordinal;
            if (res === 0) {
                res = a.toolInfo.label.localeCompare(b.toolInfo.label);
            }
            if (res === 0) {
                res = a.label.localeCompare(b.label);
            }
            return res;
        });
        let lastGroupLabel;
        const picks = [];
        for (const item of items) {
            if (lastGroupLabel !== item.toolInfo.label) {
                picks.push({ type: 'separator', label: item.toolInfo.label });
                lastGroupLabel = item.toolInfo.label;
            }
            picks.push(item);
        }
        return {
            placeholder: localize('chatContext.tools.placeholder', 'Select a tool'),
            picks: Promise.resolve(picks)
        };
    }
}
let OpenEditorContextValuePick = class OpenEditorContextValuePick {
    constructor(_editorService, _labelService) {
        this._editorService = _editorService;
        this._labelService = _labelService;
        this.type = 'valuePick';
        this.label = localize('chatContext.editors', 'Open Editors');
        this.icon = Codicon.file;
        this.ordinal = 800;
    }
    isEnabled() {
        return this._editorService.editors.filter(e => e instanceof FileEditorInput || e instanceof DiffEditorInput || e instanceof UntitledTextEditorInput).length > 0;
    }
    async asAttachment() {
        const result = [];
        for (const editor of this._editorService.editors) {
            if (!(editor instanceof FileEditorInput || editor instanceof DiffEditorInput || editor instanceof UntitledTextEditorInput || editor instanceof NotebookEditorInput)) {
                continue;
            }
            const uri = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
            if (!uri) {
                continue;
            }
            result.push({
                kind: 'file',
                id: uri.toString(),
                value: uri,
                name: this._labelService.getUriBasenameLabel(uri),
            });
        }
        return result;
    }
};
OpenEditorContextValuePick = __decorate([
    __param(0, IEditorService),
    __param(1, ILabelService)
], OpenEditorContextValuePick);
let ClipboardImageContextValuePick = class ClipboardImageContextValuePick {
    constructor(_clipboardService) {
        this._clipboardService = _clipboardService;
        this.type = 'valuePick';
        this.label = localize('imageFromClipboard', 'Image from Clipboard');
        this.icon = Codicon.fileMedia;
    }
    async isEnabled(widget) {
        if (!widget.attachmentCapabilities.supportsImageAttachments) {
            return false;
        }
        if (!widget.input.selectedLanguageModel.get()?.metadata.capabilities?.vision) {
            return false;
        }
        const imageData = await this._clipboardService.readImage();
        return isImage(imageData);
    }
    async asAttachment() {
        const fileBuffer = await this._clipboardService.readImage();
        return {
            id: await imageToHash(fileBuffer),
            name: localize('pastedImage', 'Pasted Image'),
            fullName: localize('pastedImage', 'Pasted Image'),
            value: fileBuffer,
            kind: 'image',
        };
    }
};
ClipboardImageContextValuePick = __decorate([
    __param(0, IClipboardService)
], ClipboardImageContextValuePick);
let TerminalContext = class TerminalContext {
    constructor(_resource, _terminalService) {
        this._resource = _resource;
        this._terminalService = _terminalService;
        this.type = 'valuePick';
        this.icon = Codicon.terminal;
        this.label = localize('terminal', 'Terminal');
    }
    isEnabled(widget) {
        const terminal = this._terminalService.getInstanceFromResource(this._resource);
        return !!widget.attachmentCapabilities.supportsTerminalAttachments && terminal?.isDisposed === false;
    }
    async asAttachment(widget) {
        const terminal = this._terminalService.getInstanceFromResource(this._resource);
        if (!terminal) {
            return;
        }
        const params = new URLSearchParams(this._resource.query);
        const command = terminal.capabilities.get(2 /* TerminalCapability.CommandDetection */)?.commands.find(cmd => cmd.id === params.get('command'));
        if (!command) {
            return;
        }
        const attachment = {
            kind: 'terminalCommand',
            id: `terminalCommand:${Date.now()}}`,
            value: this.asValue(command),
            name: command.command,
            command: command.command,
            output: command.getOutput(),
            exitCode: command.exitCode,
            resource: this._resource
        };
        const cleanup = new DisposableStore();
        let disposed = false;
        const disposeCleanup = () => {
            if (disposed) {
                return;
            }
            disposed = true;
            cleanup.dispose();
        };
        cleanup.add(widget.attachmentModel.onDidChange(e => {
            if (e.deleted.includes(attachment.id)) {
                disposeCleanup();
            }
        }));
        cleanup.add(terminal.onDisposed(() => {
            widget.attachmentModel.delete(attachment.id);
            widget.refreshParsedInput();
            disposeCleanup();
        }));
        return attachment;
    }
    asValue(command) {
        let value = `Command: ${command.command}`;
        const output = command.getOutput();
        if (output) {
            value += `\nOutput:\n${output}`;
        }
        if (typeof command.exitCode === 'number') {
            value += `\nExit Code: ${command.exitCode}`;
        }
        return value;
    }
};
TerminalContext = __decorate([
    __param(1, ITerminalService)
], TerminalContext);
export { TerminalContext };
let ScreenshotContextValuePick = class ScreenshotContextValuePick {
    constructor(_hostService) {
        this._hostService = _hostService;
        this.type = 'valuePick';
        this.icon = Codicon.deviceCamera;
        this.label = (isElectron
            ? localize('chatContext.attachScreenshot.labelElectron.Window', 'Screenshot Window')
            : localize('chatContext.attachScreenshot.labelWeb', 'Screenshot'));
    }
    async isEnabled(widget) {
        return !!widget.attachmentCapabilities.supportsImageAttachments && !!widget.input.selectedLanguageModel.get()?.metadata.capabilities?.vision;
    }
    async asAttachment() {
        const blob = await this._hostService.getScreenshot();
        return blob && convertBufferToScreenshotVariable(blob);
    }
};
ScreenshotContextValuePick = __decorate([
    __param(0, IHostService)
], ScreenshotContextValuePick);
let DebugEventsSnapshotContextValuePick = class DebugEventsSnapshotContextValuePick {
    constructor(_chatDebugService) {
        this._chatDebugService = _chatDebugService;
        this.type = 'valuePick';
        this.icon = Codicon.output;
        this.label = localize('chatContext.debugEventsSnapshot', 'Debug Events Snapshot');
        this.ordinal = -600;
    }
    isEnabled(widget) {
        const sessionResource = widget.viewModel?.sessionResource;
        return !!sessionResource && this._chatDebugService.getEvents(sessionResource).length > 0;
    }
    async asAttachment(widget) {
        const sessionResource = widget.viewModel?.sessionResource;
        if (!sessionResource) {
            return undefined;
        }
        return createDebugEventsAttachment(sessionResource, this._chatDebugService);
    }
};
DebugEventsSnapshotContextValuePick = __decorate([
    __param(0, IChatDebugService)
], DebugEventsSnapshotContextValuePick);
let SessionReferenceContextPickerPick = class SessionReferenceContextPickerPick {
    constructor(_chatSessionsService) {
        this._chatSessionsService = _chatSessionsService;
        this.type = 'pickerPick';
        this.icon = Codicon.comment;
        this.label = localize('chatContext.sessions', 'Sessions...');
        this.ordinal = -400;
    }
    isEnabled(widget) {
        return widget.location === ChatAgentLocation.Chat;
    }
    asPicker(widget) {
        const currentSessionResource = widget.viewModel?.sessionResource;
        return {
            placeholder: localize('chatContext.sessions.placeholder', 'Select a session'),
            picks: (async () => {
                const picks = [];
                const sessionProviderFilter = [AgentSessionProviders.Local, AgentSessionProviders.Background, AgentSessionProviders.Claude];
                for await (const group of this._chatSessionsService.getChatSessionItems(sessionProviderFilter, CancellationToken.None)) {
                    const providerIcon = getAgentSessionProviderIcon(group.chatSessionType);
                    for (const item of group.items) {
                        if (currentSessionResource && item.resource.toString() === currentSessionResource.toString()) {
                            continue;
                        }
                        const sessionResource = item.resource;
                        const icon = item.iconPath ?? providerIcon;
                        picks.push({
                            label: item.label,
                            description: new Date(item.timing.lastRequestEnded ?? item.timing.created).toLocaleString(),
                            asAttachment: () => ({
                                kind: 'sessionReference',
                                id: sessionResource.toString(),
                                name: item.label,
                                value: sessionResource,
                                icon,
                            })
                        });
                    }
                }
                picks.sort((a, b) => (b.description ?? '').localeCompare(a.description ?? ''));
                return picks;
            })()
        };
    }
};
SessionReferenceContextPickerPick = __decorate([
    __param(0, IChatSessionsService)
], SessionReferenceContextPickerPick);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbnRleHQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0Q29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUc5RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN4RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDcEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDdEYsT0FBTyxF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