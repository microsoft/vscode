/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as mouse from 'vs/base/browser/mouseEvent';
import * as tree from 'vs/base/parts/tree/browser/tree';
import { MarkersModel, Marker, ResourceMarkers } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IAction, Action } from 'vs/base/common/actions';
import { ActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchTree, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { applyCodeAction } from 'vs/editor/contrib/codeAction/codeActionCommands';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IEditorService, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';

export class Controller extends WorkbenchTreeController {

	constructor(
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IMenuService private menuService: IMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@IBulkEditService private bulkEditService: IBulkEditService,
		@ICommandService private commandService: ICommandService,
		@IEditorService private editorService: IEditorService
	) {
		super({}, configurationService);
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
			const quickFixActions = await this._getQuickFixActions(tree, element);
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

	private async _getQuickFixActions(tree: WorkbenchTree, element: Marker): Promise<IAction[]> {
		const parent = tree.getNavigator(element).parent();
		if (parent instanceof ResourceMarkers) {
			const codeActions = await parent.getFixes(element);
			return codeActions.map(codeAction => new Action(
				codeAction.command ? codeAction.command.id : codeAction.title,
				codeAction.title,
				void 0,
				true,
				() => {
					return this.openFileAtMarker(element)
						.then(() => applyCodeAction(codeAction, this.bulkEditService, this.commandService));
				}));
		}
		return [];
	}

	public openFileAtMarker(element: Marker): TPromise<void> {
		const { resource, selection } = { resource: element.resource, selection: element.range };
		return this.editorService.openEditor({
			resource,
			options: {
				selection,
				preserveFocus: true,
				pinned: false,
				revealIfVisible: true
			},
		}, ACTIVE_GROUP).then(() => null);
	}
}
