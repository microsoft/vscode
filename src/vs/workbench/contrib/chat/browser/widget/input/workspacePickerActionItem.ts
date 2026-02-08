/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';

import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../../base/common/resources.js';
import { localize } from '../../../../../../nls.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { IWorkspacePickerDelegate } from '../../chat.js';
import { IActionProvider } from '../../../../../../base/browser/ui/dropdown/dropdown.js';

/**
 * Action view item for selecting a target workspace in the chat interface.
 * This picker allows selecting a recent workspace to run the chat request in,
 * which is useful for empty window contexts.
 */
export class WorkspacePickerActionItem extends ChatInputPickerActionViewItem {

	constructor(
		action: MenuItemAction,
		private readonly delegate: IWorkspacePickerDelegate,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const currentWorkspace = this.delegate.getSelectedWorkspace();
				const workspaces = this.delegate.getWorkspaces();

				const actions: IActionWidgetDropdownAction[] = workspaces.map(workspace => ({
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

		const actionBarActionProvider: IActionProvider = {
			getActions: () => []
		};

		const workspacePickerOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider,
			actionBarActionProvider,
			showItemKeybindings: false,
			reporter: { id: 'ChatWorkspacePicker', name: 'ChatWorkspacePicker', includeOptions: false },
		};

		super(action, workspacePickerOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);

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

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);
		const currentWorkspace = this.delegate.getSelectedWorkspace();

		const labelElements: (string | HTMLElement)[] = [];

		if (currentWorkspace) {
			// Show the workspace label or folder name
			const label = currentWorkspace.label || basename(currentWorkspace.uri);
			labelElements.push(...renderLabelWithIcons(`$(folder)`));
			labelElements.push(dom.$('span.chat-input-picker-label', undefined, label));
		} else {
			labelElements.push(...renderLabelWithIcons(`$(folder)`));
			labelElements.push(dom.$('span.chat-input-picker-label', undefined, localize('selectWorkspace', "Workspace")));
		}

		labelElements.push(...renderLabelWithIcons(`$(chevron-down)`));

		dom.reset(element, ...labelElements);

		return null;
	}
}
