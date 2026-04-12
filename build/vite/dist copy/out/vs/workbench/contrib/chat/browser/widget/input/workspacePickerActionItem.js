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
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { basename } from '../../../../../../base/common/resources.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatInputPickerActionViewItem } from './chatInputPickerActionItem.js';
/**
 * Action view item for selecting a target workspace in the chat interface.
 * This picker allows selecting a recent workspace to run the chat request in,
 * which is useful for empty window contexts.
 */
let WorkspacePickerActionItem = class WorkspacePickerActionItem extends ChatInputPickerActionViewItem {
    constructor(action, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, commandService, telemetryService) {
        const actionProvider = {
            getActions: () => {
                const currentWorkspace = this.delegate.getSelectedWorkspace();
                const workspaces = this.delegate.getWorkspaces();
                const actions = workspaces.map(workspace => ({
                    ...action,
                    id: `workspace.${workspace.uri.toString()}`,
                    label: workspace.label,
                    checked: currentWorkspace?.uri.toString() === workspace.uri.toString(),
                    icon: workspace.isFolder ? { id: 'folder' } : { id: 'file-symlink-directory' },
                    enabled: true,
                    tooltip: workspace.uri.fsPath,
                    run: async () => {
                        this.delegate.setSelectedWorkspace(workspace);
                        if (this.element) {
                            this.renderLabel(this.element);
                        }
                    },
                }));
                // Add "Open Folder..." option
                actions.push({
                    ...action,
                    id: 'workspace.openFolder',
                    label: localize('openFolder', "Open Folder..."),
                    checked: false,
                    enabled: true,
                    tooltip: localize('openFolderTooltip', "Open Folder..."),
                    run: async () => {
                        this.commandService.executeCommand(this.delegate.openFolderCommand);
                    },
                });
                return actions;
            }
        };
        const actionBarActionProvider = {
            getActions: () => []
        };
        const workspacePickerOptions = {
            actionProvider,
            actionBarActionProvider,
            showItemKeybindings: false,
            reporter: { id: 'ChatWorkspacePicker', name: 'ChatWorkspacePicker', includeOptions: false },
        };
        super(action, workspacePickerOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
        this.delegate = delegate;
        this.commandService = commandService;
        this._register(this.delegate.onDidChangeSelectedWorkspace(() => {
            if (this.element) {
                this.renderLabel(this.element);
            }
        }));
        this._register(this.delegate.onDidChangeWorkspaces(() => {
            // Re-render when workspaces list changes
            if (this.element) {
                this.renderLabel(this.element);
            }
        }));
    }
    renderLabel(element) {
        this.setAriaLabelAttributes(element);
        const currentWorkspace = this.delegate.getSelectedWorkspace();
        const labelElements = [];
        if (currentWorkspace) {
            // Show the workspace label or folder name
            const label = currentWorkspace.label || basename(currentWorkspace.uri);
            labelElements.push(...renderLabelWithIcons(`$(folder)`));
            labelElements.push(dom.$('span.chat-input-picker-label', undefined, label));
        }
        else {
            labelElements.push(...renderLabelWithIcons(`$(folder)`));
            labelElements.push(dom.$('span.chat-input-picker-label', undefined, localize('selectWorkspace', "Workspace")));
        }
        if (!this.pickerOptions.hideChevrons.get()) {
            labelElements.push(...renderLabelWithIcons(`$(chevron-down)`));
        }
        dom.reset(element, ...labelElements);
        return null;
    }
};
WorkspacePickerActionItem = __decorate([
    __param(3, IActionWidgetService),
    __param(4, IKeybindingService),
    __param(5, IContextKeyService),
    __param(6, ICommandService),
    __param(7, ITelemetryService)
], WorkspacePickerActionItem);
export { WorkspacePickerActionItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlUGlja2VyQWN0aW9uSXRlbS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvd29ya3NwYWNlUGlja2VyQWN0aW9uSXRlbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBR2pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFcEQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFFdkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSw2QkFBNkIsRUFBMkIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUl4Rzs7OztHQUlHO0FBQ0ksSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBMEIsU0FBUSw2QkFBNkI7SUFFM0UsWUFDQyxNQUFzQixFQUNMLFFBQWtDLEVBQ25ELGFBQXNDLEVBQ2hCLG1CQUF5QyxFQUMzQyxpQkFBcUMsRUFDckMsaUJBQXFDLEVBQ3ZCLGNBQStCLEVBQzlDLGdCQUFtQztRQUV0RCxNQUFNLGNBQWMsR0FBd0M7WUFDM0QsVUFBVSxFQUFFLEdBQUcsRUFBRTtnQkFDaEIs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