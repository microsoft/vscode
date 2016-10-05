/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as errors from 'vs/base/common/errors';
import mouse = require('vs/base/browser/mouseEvent');
import keyboard = require('vs/base/browser/keyboardEvent');
import tree = require('vs/base/parts/tree/browser/tree');
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import { MarkersModel, Marker } from 'vs/workbench/parts/markers/common/markersModel';
import Constants from 'vs/workbench/parts/markers/common/constants';
import { RangeHighlightDecorations } from 'vs/workbench/common/editor/rangeDecorations';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, IMenu, MenuId } from 'vs/platform/actions/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { Keybinding } from 'vs/base/common/keybinding';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IActionProvider } from 'vs/base/parts/tree/browser/actionsRenderer';

export class Controller extends treedefaults.DefaultController {

	private contributedContextMenu: IMenu;

	constructor(private rangeHighlightDecorations: RangeHighlightDecorations, private actionProvider: IActionProvider, @IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService private telemetryService: ITelemetryService) {
		super();

		this.contributedContextMenu = menuService.createMenu(MenuId.ExplorerContext, contextKeyService);
		this.downKeyBindingDispatcher.set(Controller.getKeybindingForCopyAction(), (tree: tree.ITree, event: any) => this.onCopy(tree, event));
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
		if (!this.actionProvider.hasSecondaryActions(tree, element)) {
			return true;
		}

		const anchor = { x: event.posx + 1, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => {
				return this.actionProvider.getSecondaryActions(tree, element).then(actions => {
					fillInActions(this.contributedContextMenu, actions);
					return actions;
				});
			},
			getActionItem: this.actionProvider.getActionItem.bind(this.actionProvider, tree, element),
			getKeyBinding: (a): Keybinding => Controller.keybindingForAction(a.id),
			getActionsContext: (event) => {
				return {
					element,
					event
				};
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
					this.rangeHighlightDecorations.highlightRange(marker, editor);
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

	private onCopy(tree: tree.ITree, event: any): boolean {
		return this.runAction(tree, Constants.MARKER_COPY_ACTION_ID);
	}

	private runAction(tree: tree.ITree, id: string): boolean {
		const element = tree.getFocus();
		if (!element) {
			return false;
		}

		if (!this.actionProvider.hasSecondaryActions(tree, element)) {
			return false;
		}

		this.actionProvider.getSecondaryActions(tree, element)
			.then(actions => {
				for (const action of actions) {
					if (action.id === id && action.enabled) {
						action.run({ element });
						return;
					}
				}
			});

		return true;
	}

	private static keybindingForAction(id: string): Keybinding {
		if (Constants.MARKER_COPY_ACTION_ID === id) {
			return new Keybinding(Controller.getKeybindingForCopyAction());
		}
	}

	private static getKeybindingForCopyAction(): number {
		return KeyMod.CtrlCmd | KeyCode.KEY_C;
	}
}