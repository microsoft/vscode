/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as mouse from 'vs/base/browser/mouseEvent';
import * as tree from 'vs/base/parts/tree/browser/tree';
import { MarkersModel, Marker } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { ActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchTree, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { QuickFixAction } from 'vs/workbench/parts/markers/electron-browser/markersPanelActions';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';

export class Controller extends WorkbenchTreeController {

	constructor(
		private readonly onType: () => any,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IMenuService private menuService: IMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super({}, configurationService);
	}

	onKeyDown(tree: tree.ITree, event: IKeyboardEvent) {
		let handled = super.onKeyDown(tree, event);
		if (handled) {
			return true;
		}
		if (this.upKeyBindingDispatcher.has(event.keyCode)) {
			return false;
		}
		if (this._keybindingService.mightProducePrintableCharacter(event)) {
			this.onType();
			return true;
		}
		return false;
	}

	protected onLeftClick(tree: tree.ITree, element: any, event: mouse.IMouseEvent): boolean {
		let currentFoucssed = tree.getFocus();
		if (super.onLeftClick(tree, element, event)) {
			if (element instanceof MarkersModel) {
				if (currentFoucssed) {
					tree.setFocus(currentFoucssed);
				} else {
					tree.focusFirst();
				}
			}
			return true;
		}
		return false;
	}

	public onContextMenu(tree: WorkbenchTree, element: any, event: tree.ContextMenuEvent): boolean {
		tree.setFocus(element, { preventOpenOnFocus: true });

		const anchor = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,

			getActions: () => TPromise.wrap(this._getMenuActions(tree, element)),

			getActionItem: (action) => {
				const keybinding = this._keybindingService.lookupKeybinding(action.id);
				if (keybinding) {
					return new ActionItem(action, action, { label: true, keybinding: keybinding.getLabel() });
				}
				return null;
			},

			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.domFocus();
				}
			}
		});

		return true;
	}

	private async _getMenuActions(tree: WorkbenchTree, element: any): Promise<IAction[]> {
		const result: IAction[] = [];

		if (element instanceof Marker) {
			const quickFixAction = this.instantiationService.createInstance(QuickFixAction, element);
			const quickFixActions = await quickFixAction.getQuickFixActions();
			if (quickFixActions.length) {
				result.push(...quickFixActions);
				result.push(new Separator());
			}
		}

		const menu = this.menuService.createMenu(MenuId.ProblemsPanelContext, tree.contextKeyService);
		const groups = menu.getActions();
		menu.dispose();

		for (let group of groups) {
			const [, actions] = group;
			result.push(...actions);
			result.push(new Separator());
		}

		result.pop(); // remove last separator
		return result;
	}
}
