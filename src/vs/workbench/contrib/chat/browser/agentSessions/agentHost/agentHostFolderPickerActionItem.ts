/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IActionProvider } from '../../../../../../base/browser/ui/dropdown/dropdown.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import type { IChatWidget } from '../../chat.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from '../../widget/input/chatInputPickerActionItem.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';

/**
 * Folder picker for agent-host sessions in multi-root windows. An agent-host
 * session runs in a single working directory chosen at creation time, so before
 * the session starts this chip lets the user pick which root folder the session
 * will run in. The choice is recorded in {@link IAgentHostNewSessionFolderService},
 * keyed by the (untitled) chat session resource, where the working-directory
 * resolution sites pick it up. Once the session has started its working
 * directory is fixed, so the chip stays visible (showing the chosen folder)
 * but is disabled via the action's precondition.
 */
export class AgentHostFolderPickerActionItem extends ChatInputPickerActionViewItem {

	constructor(
		action: MenuItemAction,
		private readonly _widget: IChatWidget,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
	) {
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const selected = this._selectedFolder();
				return this._workspaceContextService.getWorkspace().folders.map(folder => ({
					...action,
					id: `agentHostFolder.${folder.uri.toString()}`,
					label: folder.name,
					checked: selected?.toString() === folder.uri.toString(),
					icon: { id: 'folder' },
					enabled: true,
					tooltip: folder.uri.fsPath,
					run: async () => {
						const sessionResource = this._sessionResource();
						if (sessionResource) {
							this._newSessionFolderService.setFolder(sessionResource, folder.uri);
						}
						if (this.element) {
							this.renderLabel(this.element);
						}
					},
				} satisfies IActionWidgetDropdownAction));
			}
		};

		const actionBarActionProvider: IActionProvider = {
			getActions: () => []
		};

		const folderPickerOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider,
			actionBarActionProvider,
			showItemKeybindings: false,
			reporter: { id: 'AgentHostFolderPicker', name: 'AgentHostFolderPicker', includeOptions: false },
		};

		super(action, folderPickerOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);

		this._register(this._newSessionFolderService.onDidChangeFolder(() => {
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
		this._register(this._widget.onDidChangeViewModel(() => {
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	private _sessionResource(): URI | undefined {
		return this._widget.viewModel?.sessionResource;
	}

	private _selectedFolder(): URI | undefined {
		const folders = this._workspaceContextService.getWorkspace().folders;
		const sessionResource = this._sessionResource();
		const stored = sessionResource ? this._newSessionFolderService.getFolder(sessionResource) : undefined;
		if (stored) {
			if (folders.some(folder => folder.uri.toString() === stored.toString())) {
				return stored;
			}
			// The stored folder is no longer part of the workspace (folders
			// changed); drop the stale selection and fall back to the first folder.
			this._newSessionFolderService.clear(sessionResource!);
		}
		return folders[0]?.uri;
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);
		const selected = this._selectedFolder();
		const folder = selected && this._workspaceContextService.getWorkspace().folders.find(f => f.uri.toString() === selected.toString());
		const label = folder ? folder.name : (selected ? basename(selected) : localize('agentHost.selectFolder', "Folder"));
		dom.reset(
			element,
			...renderLabelWithIcons(`$(folder)`),
			dom.$('span.chat-input-picker-label', undefined, label),
		);
		return null;
	}
}
