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
var EditorPlaceholder_1, WorkspaceTrustRequiredPlaceholderEditor_1, ErrorPlaceholderEditor_1;
import './media/editorplaceholder.css';
import { localize } from '../../../../nls.js';
import { truncate } from '../../../../base/common/strings.js';
import Severity from '../../../../base/common/severity.js';
import { isEditorOpenError } from '../../../common/editor.js';
import { EditorPane } from './editorPane.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { size, clearNode, $, EventHelper } from '../../../../base/browser/dom.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { assertReturnsAllDefined } from '../../../../base/common/types.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWorkspaceContextService, isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { EditorOpenSource } from '../../../../platform/editor/common/editor.js';
import { computeEditorAriaLabel, EditorPaneDescriptor } from '../../editor.js';
import { ButtonBar } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { SimpleIconLabel } from '../../../../base/browser/ui/iconLabel/simpleIconLabel.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { showWindowLogActionId } from '../../../services/log/common/logConstants.js';
let EditorPlaceholder = class EditorPlaceholder extends EditorPane {
    static { EditorPlaceholder_1 = this; }
    static { this.PLACEHOLDER_LABEL_MAX_LENGTH = 1024; }
    constructor(id, group, telemetryService, themeService, storageService) {
        super(id, group, telemetryService, themeService, storageService);
        this.inputDisposable = this._register(new MutableDisposable());
    }
    createEditor(parent) {
        // Container
        this.container = $('.monaco-editor-pane-placeholder', {
            tabIndex: 0 // enable focus support from the editor part (do not remove)
        });
        this.container.style.outline = 'none';
        // Custom Scrollbars
        this.scrollbar = this._register(new DomScrollableElement(this.container, { horizontal: 1 /* ScrollbarVisibility.Auto */, vertical: 1 /* ScrollbarVisibility.Auto */ }));
        parent.appendChild(this.scrollbar.getDomNode());
    }
    async setInput(input, options, context, token) {
        await super.setInput(input, options, context, token);
        // Check for cancellation
        if (token.isCancellationRequested) {
            return;
        }
        // Render Input
        this.inputDisposable.value = await this.renderInput(input, options);
    }
    async renderInput(input, options) {
        const [container, scrollbar] = assertReturnsAllDefined(this.container, this.scrollbar);
        // Reset any previous contents
        clearNode(container);
        // Delegate to implementation for contents
        const disposables = new DisposableStore();
        const { icon, label, actions } = await this.getContents(input, options, disposables);
        const truncatedLabel = truncate(label, EditorPlaceholder_1.PLACEHOLDER_LABEL_MAX_LENGTH);
        // Icon
        const iconContainer = container.appendChild($('.editor-placeholder-icon-container'));
        const iconWidget = disposables.add(new SimpleIconLabel(iconContainer));
        iconWidget.text = icon;
        // Label
        const labelContainer = container.appendChild($('.editor-placeholder-label-container'));
        const labelWidget = $('span');
        labelWidget.textContent = truncatedLabel;
        labelContainer.appendChild(labelWidget);
        // ARIA label
        container.setAttribute('aria-label', `${computeEditorAriaLabel(input, undefined, this.group, undefined)}, ${truncatedLabel}`);
        // Buttons
        if (actions.length) {
            const actionsContainer = container.appendChild($('.editor-placeholder-buttons-container'));
            const buttons = disposables.add(new ButtonBar(actionsContainer));
            for (let i = 0; i < actions.length; i++) {
                const button = disposables.add(buttons.addButton({
                    ...defaultButtonStyles,
                    secondary: i !== 0
                }));
                button.label = actions[i].label;
                disposables.add(button.onDidClick(e => {
                    if (e) {
                        EventHelper.stop(e, true);
                    }
                    actions[i].run();
                }));
            }
        }
        // Adjust scrollbar
        scrollbar.scanDomNode();
        return disposables;
    }
    clearInput() {
        if (this.container) {
            clearNode(this.container);
        }
        this.inputDisposable.clear();
        super.clearInput();
    }
    layout(dimension) {
        const [container, scrollbar] = assertReturnsAllDefined(this.container, this.scrollbar);
        // Pass on to Container
        size(container, dimension.width, dimension.height);
        // Adjust scrollbar
        scrollbar.scanDomNode();
        // Toggle responsive class
        container.classList.toggle('max-height-200px', dimension.height <= 200);
    }
    focus() {
        super.focus();
        this.container?.focus();
    }
    dispose() {
        this.container?.remove();
        super.dispose();
    }
};
EditorPlaceholder = EditorPlaceholder_1 = __decorate([
    __param(2, ITelemetryService),
    __param(3, IThemeService),
    __param(4, IStorageService)
], EditorPlaceholder);
export { EditorPlaceholder };
let WorkspaceTrustRequiredPlaceholderEditor = class WorkspaceTrustRequiredPlaceholderEditor extends EditorPlaceholder {
    static { WorkspaceTrustRequiredPlaceholderEditor_1 = this; }
    static { this.ID = 'workbench.editors.workspaceTrustRequiredEditor'; }
    static { this.LABEL = localize('trustRequiredEditor', "Workspace Trust Required"); }
    static { this.DESCRIPTOR = EditorPaneDescriptor.create(this, this.ID, this.LABEL); }
    constructor(group, telemetryService, themeService, commandService, workspaceService, storageService) {
        super(WorkspaceTrustRequiredPlaceholderEditor_1.ID, group, telemetryService, themeService, storageService);
        this.commandService = commandService;
        this.workspaceService = workspaceService;
    }
    getTitle() {
        return WorkspaceTrustRequiredPlaceholderEditor_1.LABEL;
    }
    async getContents() {
        return {
            icon: '$(workspace-untrusted)',
            label: isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(this.workspaceService.getWorkspace())) ?
                localize('requiresFolderTrustText', "The file is not displayed in the editor because trust has not been granted to the folder.") :
                localize('requiresWorkspaceTrustText', "The file is not displayed in the editor because trust has not been granted to the workspace."),
            actions: [
                {
                    label: localize('manageTrust', "Manage Workspace Trust"),
                    run: () => this.commandService.executeCommand('workbench.trust.manage')
                }
            ]
        };
    }
};
WorkspaceTrustRequiredPlaceholderEditor = WorkspaceTrustRequiredPlaceholderEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, ICommandService),
    __param(4, IWorkspaceContextService),
    __param(5, IStorageService)
], WorkspaceTrustRequiredPlaceholderEditor);
export { WorkspaceTrustRequiredPlaceholderEditor };
let ErrorPlaceholderEditor = class ErrorPlaceholderEditor extends EditorPlaceholder {
    static { ErrorPlaceholderEditor_1 = this; }
    static { this.ID = 'workbench.editors.errorEditor'; }
    static { this.LABEL = localize('errorEditor', "Error Editor"); }
    static { this.DESCRIPTOR = EditorPaneDescriptor.create(this, this.ID, this.LABEL); }
    constructor(group, telemetryService, themeService, storageService, fileService, dialogService, commandService) {
        super(ErrorPlaceholderEditor_1.ID, group, telemetryService, themeService, storageService);
        this.fileService = fileService;
        this.dialogService = dialogService;
        this.commandService = commandService;
    }
    async getContents(input, options, disposables) {
        const resource = input.resource;
        const error = options.error;
        const isFileNotFound = error?.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */;
        // Error Label
        let label;
        if (isFileNotFound) {
            label = localize('unavailableResourceErrorEditorText', "The editor could not be opened because the file was not found.");
        }
        else if (isEditorOpenError(error) && error.forceMessage) {
            label = error.message;
        }
        else if (error) {
            label = localize('unknownErrorEditorTextWithError', "The editor could not be opened due to an unexpected error. Please consult the log for more details.");
        }
        else {
            label = localize('unknownErrorEditorTextWithoutError', "The editor could not be opened due to an unexpected error.");
        }
        // Error Icon
        let icon = '$(error)';
        if (isEditorOpenError(error)) {
            if (error.forceSeverity === Severity.Info) {
                icon = '$(info)';
            }
            else if (error.forceSeverity === Severity.Warning) {
                icon = '$(warning)';
            }
        }
        // Actions
        let actions = undefined;
        if (isEditorOpenError(error) && error.actions.length > 0) {
            actions = error.actions.map(action => {
                return {
                    label: action.label,
                    run: () => {
                        const result = action.run();
                        if (result instanceof Promise) {
                            result.catch(error => this.dialogService.error(toErrorMessage(error)));
                        }
                    }
                };
            });
        }
        else {
            actions = [
                {
                    label: localize('retry', "Try Again"),
                    run: () => this.group.openEditor(input, { ...options, source: EditorOpenSource.USER /* explicit user gesture */ })
                },
                {
                    label: localize('showLogs', "Show Logs"),
                    run: () => this.commandService.executeCommand(showWindowLogActionId)
                }
            ];
        }
        // Auto-reload when file is added
        if (isFileNotFound && resource && this.fileService.hasProvider(resource)) {
            disposables.add(this.fileService.onDidFilesChange(e => {
                if (e.contains(resource, 1 /* FileChangeType.ADDED */, 0 /* FileChangeType.UPDATED */)) {
                    this.group.openEditor(input, options);
                }
            }));
        }
        return { icon, label, actions: actions ?? [] };
    }
};
ErrorPlaceholderEditor = ErrorPlaceholderEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IFileService),
    __param(5, IDialogService),
    __param(6, ICommandService)
], ErrorPlaceholderEditor);
export { ErrorPlaceholderEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yUGxhY2Vob2xkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGxhY2Vob2xkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sK0JBQStCLENBQUM7QUFDdkMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzRCxPQUFPLEVBQXNCLGlCQUFpQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFbEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzdDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRWxHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQWEsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFN0YsT0FBTyxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLGlDQUFpQyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0RBQW9E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