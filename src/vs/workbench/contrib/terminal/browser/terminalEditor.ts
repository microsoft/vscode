/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction } from 'vs/base/common/actions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DropdownWithPrimaryActionViewItem } from 'vs/platform/actions/browser/dropdownWithPrimaryActionViewItem';
import { IMenu, IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { ITerminalEditorService, ITerminalService, terminalEditorId } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { getTerminalActionBarArgs } from 'vs/workbench/contrib/terminal/browser/terminalMenus';
import { ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { isLinux, isMacintosh } from 'vs/base/common/platform';
import { BrowserFeatures } from 'vs/base/browser/canIUse';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { openContextMenu } from 'vs/workbench/contrib/terminal/browser/terminalContextMenu';
import { ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';

export class TerminalEditor extends EditorPane {

	private _editorInstanceElement: HTMLElement | undefined;
	private _overflowGuardElement: HTMLElement | undefined;

	private _editorInput?: TerminalEditorInput = undefined;

	private _lastDimension?: dom.Dimension;

	private readonly _dropdownMenu: IMenu;

	private readonly _instanceMenu: IMenu;

	private _cancelContextMenu: boolean = false;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@IWorkbenchLayoutService private readonly _workbenchLayoutService: IWorkbenchLayoutService
	) {
		super(terminalEditorId, telemetryService, themeService, storageService);
		this._dropdownMenu = this._register(menuService.createMenu(MenuId.TerminalNewDropdownContext, contextKeyService));
		this._instanceMenu = this._register(menuService.createMenu(MenuId.TerminalInstanceContext, contextKeyService));
	}

	override async setInput(newInput: TerminalEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken) {
		this._editorInput?.terminalInstance?.detachFromElement();
		this._editorInput = newInput;
		await super.setInput(newInput, options, context, token);
		this._editorInput.terminalInstance?.attachToElement(this._overflowGuardElement!);
		if (this._lastDimension) {
			this.layout(this._lastDimension);
		}
		this._editorInput.terminalInstance?.setVisible(this.isVisible() && this._workbenchLayoutService.isVisible(Parts.EDITOR_PART));
		if (this._editorInput.terminalInstance) {
			// since the editor does not monitor focus changes, for ex. between the terminal
			// panel and the editors, this is needed so that the active instance gets set
			// when focus changes between them.
			this._register(this._editorInput.terminalInstance.onDidFocus(() => this._setActiveInstance()));
			this._editorInput.setCopyLaunchConfig(this._editorInput.terminalInstance.shellLaunchConfig);
		}
	}

	override clearInput(): void {
		super.clearInput();
		this._editorInput?.terminalInstance?.detachFromElement();
		this._editorInput = undefined;
	}

	private _setActiveInstance(): void {
		if (!this._editorInput?.terminalInstance) {
			return;
		}
		this._terminalEditorService.setActiveInstance(this._editorInput.terminalInstance);
	}

	override focus() {
		this._editorInput?.terminalInstance?.focus();
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	protected createEditor(parent: HTMLElement): void {
		this._editorInstanceElement = parent;
		this._overflowGuardElement = dom.$('.terminal-overflow-guard.terminal-editor');
		this._editorInstanceElement.appendChild(this._overflowGuardElement);
		this._registerListeners();
	}

	private _registerListeners(): void {
		if (!this._editorInstanceElement) {
			return;
		}
		this._register(dom.addDisposableListener(this._editorInstanceElement, 'mousedown', async (event: MouseEvent) => {
			if (this._terminalEditorService.instances.length === 0) {
				return;
			}

			if (event.which === 2 && isLinux) {
				// Drop selection and focus terminal on Linux to enable middle button paste when click
				// occurs on the selection itself.
				const terminal = this._terminalEditorService.activeInstance;
				terminal?.focus();
			} else if (event.which === 3) {
				const rightClickBehavior = this._terminalService.configHelper.config.rightClickBehavior;
				if (rightClickBehavior === 'nothing') {
					if (!event.shiftKey) {
						this._cancelContextMenu = true;
					}
					return;
				}
				else if (rightClickBehavior === 'copyPaste' || rightClickBehavior === 'paste') {
					const terminal = this._terminalEditorService.activeInstance;
					if (!terminal) {
						return;
					}

					// copyPaste: Shift+right click should open context menu
					if (rightClickBehavior === 'copyPaste' && event.shiftKey) {
						openContextMenu(event, this._editorInput?.terminalInstance, this._instanceMenu, this._contextMenuService);
						return;
					}

					if (rightClickBehavior === 'copyPaste' && terminal.hasSelection()) {
						await terminal.copySelection();
						terminal.clearSelection();
					} else {
						if (BrowserFeatures.clipboard.readText) {
							terminal.paste();
						} else {
							this._notificationService.info(`This browser doesn't support the clipboard.readText API needed to trigger a paste, try ${isMacintosh ? '⌘' : 'Ctrl'}+V instead.`);
						}
					}
					// Clear selection after all click event bubbling is finished on Mac to prevent
					// right-click selecting a word which is seemed cannot be disabled. There is a
					// flicker when pasting but this appears to give the best experience if the
					// setting is enabled.
					if (isMacintosh) {
						setTimeout(() => {
							terminal.clearSelection();
						}, 0);
					}
					this._cancelContextMenu = true;
				}
			}
		}));
		this._register(dom.addDisposableListener(this._editorInstanceElement, 'contextmenu', (event: MouseEvent) => {
			const rightClickBehavior = this._terminalService.configHelper.config.rightClickBehavior;
			if (rightClickBehavior === 'nothing' && !event.shiftKey) {
				event.preventDefault();
				event.stopImmediatePropagation();
				this._cancelContextMenu = false;
				return;
			}
			else
				if (!this._cancelContextMenu && rightClickBehavior !== 'copyPaste' && rightClickBehavior !== 'paste') {
					if (!this._cancelContextMenu) {
						openContextMenu(event, this._editorInput?.terminalInstance, this._instanceMenu, this._contextMenuService);
					}
					event.preventDefault();
					event.stopImmediatePropagation();
					this._cancelContextMenu = false;
				}
		}));
	}

	layout(dimension: dom.Dimension): void {
		this._editorInput?.terminalInstance?.layout(dimension);
		this._lastDimension = dimension;
	}

	override setVisible(visible: boolean, group?: IEditorGroup): void {
		super.setVisible(visible, group);
		this._editorInput?.terminalInstance?.setVisible(visible && this._workbenchLayoutService.isVisible(Parts.EDITOR_PART));
	}

	override getActionViewItem(action: IAction): IActionViewItem | undefined {
		switch (action.id) {
			case TerminalCommandId.CreateTerminalEditor: {
				if (action instanceof MenuItemAction) {
					const location = { viewColumn: ACTIVE_GROUP };
					const actions = getTerminalActionBarArgs(location, this._terminalProfileService.availableProfiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu);
					const button = this._instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, actions.dropdownAction, actions.dropdownMenuActions, actions.className, this._contextMenuService, {});
					return button;
				}
			}
		}
		return super.getActionViewItem(action);
	}

	private _getDefaultProfileName(): string {
		let defaultProfileName;
		try {
			defaultProfileName = this._terminalProfileService.getDefaultProfileName();
		} catch (e) {
			defaultProfileName = this._terminalProfileResolverService.defaultProfileName;
		}
		return defaultProfileName!;
	}
}
