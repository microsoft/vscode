/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator } from 'vs/base/common/actions';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';

export interface IGutterActionsGenerator {
	(context: { lineNumber: number; editor: ICodeEditor; accessor: ServicesAccessor }, result: { push(action: IAction): void }): void;
}

export class GutterActionsRegistryImpl {
	private _registeredGutterActionsGenerators: Set<IGutterActionsGenerator> = new Set();

	/**
	 *
	 * This exists solely to allow the debug and test contributions to add actions to the gutter context menu
	 * which cannot be trivially expressed using when clauses and therefore cannot be statically registered.
	 * If you want an action to show up in the gutter context menu, you should generally use MenuId.EditorLineNumberMenu instead.
	 */
	public registerGutterActionsGenerator(gutterActionsGenerator: IGutterActionsGenerator): IDisposable {
		this._registeredGutterActionsGenerators.add(gutterActionsGenerator);
		return {
			dispose: () => {
				this._registeredGutterActionsGenerators.delete(gutterActionsGenerator);
			}
		};
	}

	public getGutterActionsGenerators(): IGutterActionsGenerator[] {
		return Array.from(this._registeredGutterActionsGenerators.values());
	}
}

Registry.add('gutterActionsRegistry', new GutterActionsRegistryImpl());
export const GutterActionsRegistry: GutterActionsRegistryImpl = Registry.as('gutterActionsRegistry');

export class EditorLineNumberContextMenu extends Disposable implements IEditorContribution {
	static readonly ID = 'workbench.contrib.editorLineNumberContextMenu';

	constructor(
		private readonly editor: ICodeEditor,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(this.editor.onContextMenu((e: IEditorMouseEvent) => this.show(e)));

	}

	public show(e: IEditorMouseEvent) {
		const menu = this.menuService.createMenu(MenuId.EditorLineNumberContext, this.contextKeyService);

		const model = this.editor.getModel();
		if (!e.target.position || !model || e.target.type !== MouseTargetType.GUTTER_LINE_NUMBERS && e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN) {
			return;
		}

		const anchor = { x: e.event.posx, y: e.event.posy };
		const lineNumber = e.target.position.lineNumber;

		const actions: IAction[][] = [];

		this.instantiationService.invokeFunction(accessor => {
			for (const generator of GutterActionsRegistry.getGutterActionsGenerators()) {
				const collectedActions: IAction[] = [];
				generator({ lineNumber, editor: this.editor, accessor }, { push: (action: IAction) => collectedActions.push(action) });
				actions.push(collectedActions);
			}

			const menuActions = menu.getActions({ arg: { lineNumber, uri: model.uri }, shouldForwardArgs: true });
			actions.push(...menuActions.map(a => a[1]));

			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => Separator.join(...actions),
				menuActionOptions: { shouldForwardArgs: true },
				getActionsContext: () => ({ lineNumber, uri: model.uri }),
				onHide: () => menu.dispose(),
			});
		});
	}
}

registerEditorContribution(EditorLineNumberContextMenu.ID, EditorLineNumberContextMenu, EditorContributionInstantiation.AfterFirstRender);
