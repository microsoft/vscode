/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as errors from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import * as mouse from 'vs/base/browser/mouseEvent';
import keyboard = require('vs/base/browser/keyboardEvent');
import tree = require('vs/base/parts/tree/browser/tree');
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import { MarkersModel, Marker } from 'vs/workbench/parts/markers/common/markersModel';
import { RangeHighlightDecorations } from 'vs/workbench/common/editor/rangeDecorations';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, IMenu, MenuId } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { Keybinding } from 'vs/base/common/keyCodes';
import { IActionProvider } from 'vs/base/parts/tree/browser/actionsRenderer';
import { ActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';

export class Controller extends treedefaults.DefaultController {

	private contextMenu: IMenu;

	constructor(private rangeHighlightDecorations: RangeHighlightDecorations, private actionProvider: IActionProvider, @IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@ITelemetryService private telemetryService: ITelemetryService) {
		super();

		this.contextMenu = menuService.createMenu(MenuId.ProblemsPanelContext, contextKeyService);
	}

	protected onLeftClick(tree: tree.ITree, element: any, event: mouse.IMouseEvent): boolean {
		let currentFoucssed = tree.getFocus();
		if (super.onLeftClick(tree, element, event)) {
			if (this.openFileAtElement(element, event.detail !== 2, event.ctrlKey || event.metaKey, event.detail === 2)) {
				return true;
			}
			if (element instanceof MarkersModel) {
				if (currentFoucssed) {
					tree.setFocus(currentFoucssed);
				} else {
					tree.focusFirst();
				}
				return true;
			}
		}
		return false;
	}

	protected onEnter(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		if (super.onEnter(tree, event)) {
			return this.openFileAtElement(tree.getFocus(), false, event.ctrlKey || event.metaKey, true);
		}
		return false;
	}

	protected onSpace(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		let element = tree.getFocus();
		if (element instanceof Marker) {
			tree.setSelection([element]);
			return this.openFileAtElement(tree.getFocus(), true, false, false);
		} else {
			this.rangeHighlightDecorations.removeHighlightRange();
		}
		return super.onSpace(tree, event);
	}

	public onContextMenu(tree: tree.ITree, element: any, event: tree.ContextMenuEvent): boolean {
		tree.setFocus(element);
		const actions = this._getMenuActions();
		if (!actions.length) {
			return true;
		}
		const anchor = { x: event.posx + 1, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,

			getActions: () => {
				return TPromise.as(actions);
			},

			getActionItem: (action) => {
				const keybinding = this._keybindingFor(action);
				if (keybinding) {
					return new ActionItem(action, action, { label: true, keybinding: this._keybindingService.getLabelFor(keybinding) });
				}
				return null;
			},

			getKeyBinding: (action): Keybinding => {
				return this._keybindingFor(action);
			},

			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.DOMFocus();
				}
			}
		});

		return true;
	}

	private openFileAtElement(element: any, preserveFocus: boolean, sideByside: boolean, pinned: boolean): boolean {
		if (element instanceof Marker) {
			const marker: Marker = element;
			this.telemetryService.publicLog('problems.marker.opened', { source: marker.marker.source });
			this.editorService.openEditor({
				resource: marker.resource,
				options: {
					selection: marker.range,
					preserveFocus,
					pinned,
					revealIfVisible: true
				},
			}, sideByside).done((editor) => {
				if (preserveFocus) {
					this.rangeHighlightDecorations.highlightRange(marker, <ICommonCodeEditor>editor.getControl());
				} else {
					this.rangeHighlightDecorations.removeHighlightRange();
				}
			}, errors.onUnexpectedError);
			return true;
		} else {
			this.rangeHighlightDecorations.removeHighlightRange();
		}
		return false;
	}

	private _getMenuActions(): IAction[] {
		const result: IAction[] = [];
		const groups = this.contextMenu.getActions();

		for (let group of groups) {
			const [, actions] = group;
			result.push(...actions);
			result.push(new Separator());
		}
		result.pop(); // remove last separator
		return result;
	}

	private _keybindingFor(action: IAction): Keybinding {
		var opts = this._keybindingService.lookupKeybindings(action.id);
		if (opts.length > 0) {
			return opts[0]; // only take the first one
		}
		return null;
	}
}
