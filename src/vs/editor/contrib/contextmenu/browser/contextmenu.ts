/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {IAction} from 'vs/base/common/actions';
import {KeyCode, KeyMod, Keybinding} from 'vs/base/common/keyCodes';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {SortedList} from 'vs/base/common/sortedList';
import {TPromise} from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {ActionItem, Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import {IContextMenuService, IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import {EventType, ICommonCodeEditor, IEditorActionDescriptorData, IEditorContribution, MouseTargetType} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {ICodeEditor, IEditorMouseEvent} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';

interface IPosition {
	x:number;
	y:number;
}

class ContextMenuController implements IEditorContribution {

	public static ID = 'editor.contrib.contextmenu';

	private contextMenuService:IContextMenuService;
	private contextViewService: IContextViewService;
	private keybindingService: IKeybindingService;

	private _editor:ICodeEditor;
	private _toDispose:IDisposable[];
	private _contextMenuIsBeingShownCount:number;

	constructor(editor:ICodeEditor, @IContextMenuService contextMenuService: IContextMenuService, @IContextViewService contextViewService: IContextViewService, @IKeybindingService keybindingService: IKeybindingService) {
		this.contextMenuService = contextMenuService;
		this.contextViewService = contextViewService;
		this.keybindingService = keybindingService;
		this._editor = editor;

		this._toDispose = [];

		this._contextMenuIsBeingShownCount = 0;

		this._toDispose.push(this._editor.addListener2(EventType.ContextMenu, (e:IEditorMouseEvent)=>this._onContextMenu(e)));
		this._toDispose.push(this._editor.addListener2(EventType.KeyDown, (e:IKeyboardEvent)=> {
			if (e.keyCode === KeyCode.ContextMenu) {
				// Chrome is funny like that
				e.preventDefault();
				e.stopPropagation();
				this.showContextMenu();
			}
		}));
	}

	private _onContextMenu(e:IEditorMouseEvent): void {
		if (!this._editor.getConfiguration().contextmenu) {
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
		var forcedPosition:IPosition;
		if (e.target.type !== MouseTargetType.TEXTAREA) {
			forcedPosition = { x: e.event.posx, y: e.event.posy + 1 };
		}

		// Show the context menu
		this.showContextMenu(forcedPosition);
	}

	public showContextMenu(forcedPosition?:IPosition): void {
		if (!this._editor.getConfiguration().contextmenu) {
			return; // Context menu is turned off through configuration
		}

		if (!this.contextMenuService) {
			this._editor.focus();
			return;	// We need the context menu service to function
		}

		var position = this._editor.getPosition();
		var editorModel = this._editor.getModel();
		if (!position || !editorModel) {
			return;
		}

		// Find actions available for menu
		var menuActions = this._getMenuActions();

		// Show menu if we have actions to show
		if (menuActions.length > 0) {
			this._doShowContextMenu(menuActions, forcedPosition);
		}
	}

	private _getMenuActions(): IAction[] {
		var editorModel = this._editor.getModel();
		if (!editorModel) {
			return [];
		}

		var allActions = <EditorAction[]>this._editor.getActions();
		var contributedActions = allActions.filter((action)=>(typeof action.shouldShowInContextMenu === 'function') && action.shouldShowInContextMenu() && action.isSupported());

		return this._prepareActions(contributedActions);
	}

	private _prepareActions(actions:EditorAction[]):IAction[] {
		var list = new SortedList<string, SortedList<string, EditorAction>>();

		actions.forEach((action)=>{
			var groups = action.getGroupId().split('/');
			var actionsForGroup = list.getValue(groups[0]);
			if (!actionsForGroup) {
				actionsForGroup = new SortedList<string, EditorAction>();
				list.add(groups[0], actionsForGroup);
			}

			actionsForGroup.add(groups[1] || groups[0], action);
		});

		var sortedAndGroupedActions:IAction[] = [];
		var groupIterator = list.getIterator();
		while(groupIterator.moveNext()) {
			var group = groupIterator.current.value;
			var actionsIterator = group.getIterator();
			while(actionsIterator.moveNext()) {
				var action = actionsIterator.current.value;
				sortedAndGroupedActions.push(action);
			}

			if (groupIterator.hasNext()) {
				sortedAndGroupedActions.push(new Separator());
			}
		}

		return sortedAndGroupedActions;
	}

	private _doShowContextMenu(actions:IAction[], forcedPosition:IPosition = null): void {

		// Make the editor believe one of its widgets is focused
		this._editor.beginForcedWidgetFocus();

		// Disable hover
		var oldHoverSetting = this._editor.getConfiguration().hover;
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
			var editorCoords = dom.getDomNodePosition(this._editor.getDomNode());
			var posx = editorCoords.left + cursorCoords.left;
			var posy = editorCoords.top + cursorCoords.top + cursorCoords.height;

			menuPosition = { x: posx, y: posy };
		}

		// Show menu
		this.contextMenuService.showContextMenu({
			getAnchor: () => menuPosition,

			getActions: () => {
				return TPromise.as(actions);
			},

			getActionItem: (action) => {
				var keybinding = this._keybindingFor(action);
				if (keybinding) {
					return new ActionItem(action, action, { label: true, keybinding: this.keybindingService.getLabelFor(keybinding) });
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

			onHide: (wasCancelled:boolean) => {
				this._contextMenuIsBeingShownCount--;
				this._editor.focus();
				this._editor.endForcedWidgetFocus();
				this._editor.updateOptions({
					hover: oldHoverSetting
				});
			}
		});
	}

	private _keybindingFor(action: IAction): Keybinding {
		var opts = this.keybindingService.lookupKeybindings(action.id);
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
			this.contextViewService.hideContextView();
		}

		this._toDispose = disposeAll(this._toDispose);
	}
}

class ShowContextMenu extends EditorAction {

	public static ID = 'editor.action.showContextMenu';

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run(): TPromise<boolean> {
		var contribution = <ContextMenuController>this.editor.getContribution(ContextMenuController.ID);
		if (!contribution) {
			return TPromise.as(null);
		}

		contribution.showContextMenu();

		return TPromise.as(null);
	}
}

EditorBrowserRegistry.registerEditorContribution(ContextMenuController);
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ShowContextMenu, ShowContextMenu.ID, nls.localize('action.showContextMenu.label', "Show Editor Context Menu"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Shift | KeyCode.F10
}));