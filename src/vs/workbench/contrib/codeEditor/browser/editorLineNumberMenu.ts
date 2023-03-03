/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator } from 'vs/base/common/actions';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IBreakpointEditorContribution, BREAKPOINT_EDITOR_CONTRIBUTION_ID } from 'vs/workbench/contrib/debug/common/debug';

export class EditorLineNumberContextMenu extends Disposable implements IEditorContribution {
	static readonly ID = 'workbench.contrib.editorLineNumberContextMenu';

	constructor(
		private readonly editor: ICodeEditor,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this.registerListeners();

	}

	private registerListeners(): void {
		this._register(this.editor.onContextMenu((e) => {
			const menu = this.menuService.createMenu(MenuId.EditorLineNumberContext, this.contextKeyService);

			const model = this.editor.getModel();
			if (!e.target.position || !model || e.target.type !== MouseTargetType.GUTTER_LINE_NUMBERS) {
				return;
			}

			const anchor = { x: e.event.posx, y: e.event.posy };
			const lineNumber = e.target.position.lineNumber;

			let actions: IAction[] = [];

			// TODO@joyceerhl refactor breakpoint and testing actions to statically contribute to this menu
			const contribution = this.editor.getContribution<IBreakpointEditorContribution>(BREAKPOINT_EDITOR_CONTRIBUTION_ID);
			if (contribution) {
				actions.push(...contribution.getContextMenuActionsAtPosition(lineNumber, model));
			}
			const menuActions = menu.getActions({ arg: { lineNumber, uri: model.uri }, shouldForwardArgs: true });
			if (menuActions.length > 0) {
				actions = Separator.join(...[actions], ...menuActions.map(a => a[1]));
			}

			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => actions,
				menuActionOptions: { shouldForwardArgs: true },
				getActionsContext: () => ({ lineNumber, uri: model.uri }),
				onHide: () => menu.dispose(),
			});
		}));
	}
}

registerEditorContribution(EditorLineNumberContextMenu.ID, EditorLineNumberContextMenu, EditorContributionInstantiation.AfterFirstRender);
