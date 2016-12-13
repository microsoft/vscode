/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IAction } from 'vs/base/common/actions';
import { Keybinding, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { ICommonCodeEditor, IEditorContribution, MouseTargetType, EditorContextKeys, IScrollEvent } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';

export interface IPosition {
	x: number;
	y: number;
}

@editorContribution
export class ContextMenuController implements IEditorContribution {

	private static ID = 'editor.contrib.contextmenu';

	public static get(editor: ICommonCodeEditor): ContextMenuController {
		return editor.getContribution<ContextMenuController>(ContextMenuController.ID);
	}

	private _toDispose: IDisposable[] = [];
	private _contextMenuIsBeingShownCount: number = 0;
	private _editor: ICodeEditor;

	constructor(
		editor: ICodeEditor,
		@IContextMenuService private _contextMenuService: IContextMenuService,
		@IContextViewService private _contextViewService: IContextViewService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IMenuService private _menuService: IMenuService
	) {
		this._editor = editor;

		this._toDispose.push(this._editor.onContextMenu((e: IEditorMouseEvent) => this._onContextMenu(e)));
		this._toDispose.push(this._editor.onDidScrollChange((e: IScrollEvent) => {
			if (this._contextMenuIsBeingShownCount > 0) {
				this._contextViewService.hideContextView();
			}
		}));
		this._toDispose.push(this._editor.onKeyDown((e: IKeyboardEvent) => {
			if (e.keyCode === KeyCode.ContextMenu) {
				// Chrome is funny like that
				e.preventDefault();
				e.stopPropagation();
				this.showContextMenu();
			}
		}));
	}

	private _onContextMenu(e: IEditorMouseEvent): void {
		if (!this._editor.getConfiguration().contribInfo.contextmenu) {
			this._editor.focus();
			// Ensure the cursor is at the position of the mouse click
			if (e.target.position && !this._editor.getSelection().containsPosition(e.target.position)) {
				this._editor.setPosition(e.target.position);
			}
			return; // Context menu is turned off through configuration
		}

		if (e.target.type === MouseTargetType.OVERLAY_WIDGET) {
			return; // allow native menu on widgets to support right click on input field for example in find
		}

		e.event.preventDefault();

		if (e.target.type !== MouseTargetType.CONTENT_TEXT && e.target.type !== MouseTargetType.CONTENT_EMPTY && e.target.type !== MouseTargetType.TEXTAREA) {
			return; // only support mouse click into text or native context menu key for now
		}

		// Ensure the editor gets focus if it hasn't, so the right events are being sent to other contributions
		this._editor.focus();

		// Ensure the cursor is at the position of the mouse click
		if (e.target.position && !this._editor.getSelection().containsPosition(e.target.position)) {
			this._editor.setPosition(e.target.position);
		}

		// Unless the user triggerd the context menu through Shift+F10, use the mouse position as menu position
		var forcedPosition: IPosition;
		if (e.target.type !== MouseTargetType.TEXTAREA) {
			forcedPosition = { x: e.event.posx, y: e.event.posy + 1 };
		}

		// Show the context menu
		this.showContextMenu(forcedPosition);
	}

	public showContextMenu(forcedPosition?: IPosition): void {
		if (!this._editor.getConfiguration().contribInfo.contextmenu) {
			return; // Context menu is turned off through configuration
		}

		if (!this._contextMenuService) {
			this._editor.focus();
			return;	// We need the context menu service to function
		}

		// Find actions available for menu
		var menuActions = this._getMenuActions();

		// Show menu if we have actions to show
		if (menuActions.length > 0) {
			this._doShowContextMenu(menuActions, forcedPosition);
		}
	}

	private _getMenuActions(): IAction[] {
		const result: IAction[] = [];

		let contextMenu = this._menuService.createMenu(MenuId.EditorContext, this._contextKeyService);
		const groups = contextMenu.getActions(this._editor.getModel().uri);
		contextMenu.dispose();

		for (let group of groups) {
			const [, actions] = group;
			result.push(...actions);
			result.push(new Separator());
		}
		result.pop(); // remove last separator
		return result;
	}

	private _doShowContextMenu(actions: IAction[], forcedPosition: IPosition = null): void {

		// Disable hover
		var oldHoverSetting = this._editor.getConfiguration().contribInfo.hover;
		this._editor.updateOptions({
			hover: false
		});

		var menuPosition = forcedPosition;
		if (!menuPosition) {
			// Ensure selection is visible
			this._editor.revealPosition(this._editor.getPosition());

			this._editor.render();
			var cursorCoords = this._editor.getScrolledVisiblePosition(this._editor.getPosition());

			// Translate to absolute editor position
			var editorCoords = dom.getDomNodePagePosition(this._editor.getDomNode());
			var posx = editorCoords.left + cursorCoords.left;
			var posy = editorCoords.top + cursorCoords.top + cursorCoords.height;

			menuPosition = { x: posx, y: posy };
		}

		// Show menu
		this._contextMenuIsBeingShownCount++;
		this._contextMenuService.showContextMenu({
			getAnchor: () => menuPosition,

			getActions: () => {
				return TPromise.as(actions);
			},

			getActionItem: (action) => {
				var keybinding = this._keybindingFor(action);
				if (keybinding) {
					return new ActionItem(action, action, { label: true, keybinding: this._keybindingService.getLabelFor(keybinding) });
				}

				var customActionItem = <any>action;
				if (typeof customActionItem.getActionItem === 'function') {
					return customActionItem.getActionItem();
				}

				return null;
			},

			getKeyBinding: (action): Keybinding => {
				return this._keybindingFor(action);
			},

			onHide: (wasCancelled: boolean) => {
				this._contextMenuIsBeingShownCount--;
				this._editor.focus();
				this._editor.updateOptions({
					hover: oldHoverSetting
				});
			}
		});
	}

	private _keybindingFor(action: IAction): Keybinding {
		var opts = this._keybindingService.lookupKeybindings(action.id);
		if (opts.length > 0) {
			return opts[0]; // only take the first one
		}
		return null;
	}

	public getId(): string {
		return ContextMenuController.ID;
	}

	public dispose(): void {
		if (this._contextMenuIsBeingShownCount > 0) {
			this._contextViewService.hideContextView();
		}

		this._toDispose = dispose(this._toDispose);
	}
}

@editorAction
class ShowContextMenu extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.showContextMenu',
			label: nls.localize('action.showContextMenu.label', "Show Editor Context Menu"),
			alias: 'Show Editor Context Menu',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.Shift | KeyCode.F10
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		let contribution = ContextMenuController.get(editor);
		contribution.showContextMenu();
	}
}
