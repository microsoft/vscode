/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator } from '../../../../base/common/actions.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { registerEditorContribution, EditorContributionInstantiation } from '../../../../editor/browser/editorExtensions.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { TextEditorSelectionSource } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

export interface IGutterActionsGenerator {
	(context: { lineNumber: number; editor: ICodeEditor; accessor: ServicesAccessor }, result: { push(action: IAction, group?: string): void }): void;
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

		this._register(this.editor.onMouseDown((e: IEditorMouseEvent) => this.doShow(e, false)));

	}

	public show(e: IEditorMouseEvent) {
		this.doShow(e, true);
	}

	private doShow(e: IEditorMouseEvent, force: boolean) {
		const model = this.editor.getModel();

		// on macOS ctrl+click is interpreted as right click
		if (!e.event.rightButton && !(isMacintosh && e.event.leftButton && e.event.ctrlKey) && !force
			|| e.target.type !== MouseTargetType.GUTTER_LINE_NUMBERS && e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN
			|| !e.target.position || !model
		) {
			return;
		}

		const lineNumber = e.target.position.lineNumber;

		const contextKeyService = this.contextKeyService.createOverlay([['editorLineNumber', lineNumber]]);
		const menu = this.menuService.createMenu(MenuId.EditorLineNumberContext, contextKeyService);

		const allActions: [string, (IAction | MenuItemAction | SubmenuItemAction)[]][] = [];

		this.instantiationService.invokeFunction(accessor => {
			for (const generator of GutterActionsRegistry.getGutterActionsGenerators()) {
				const collectedActions = new Map<string, IAction[]>();
				generator({ lineNumber, editor: this.editor, accessor }, {
					push: (action: IAction, group: string = 'navigation') => {
						const actions = (collectedActions.get(group) ?? []);
						actions.push(action);
						collectedActions.set(group, actions);
					}
				});
				for (const [group, actions] of collectedActions.entries()) {
					allActions.push([group, actions]);
				}
			}

			allActions.sort((a, b) => a[0].localeCompare(b[0]));

			const menuActions = menu.getActions({ arg: { lineNumber, uri: model.uri }, shouldForwardArgs: true });
			allActions.push(...menuActions);

			// if the current editor selections do not contain the target line number,
			// set the selection to the clicked line number
			if (e.target.type === MouseTargetType.GUTTER_LINE_NUMBERS) {
				const currentSelections = this.editor.getSelections();
				const lineRange = {
					startLineNumber: lineNumber,
					endLineNumber: lineNumber,
					startColumn: 1,
					endColumn: model.getLineLength(lineNumber) + 1
				};
				const containsSelection = currentSelections?.some(selection => !selection.isEmpty() && selection.intersectRanges(lineRange) !== null);
				if (!containsSelection) {
					this.editor.setSelection(lineRange, TextEditorSelectionSource.PROGRAMMATIC);
				}
			}

			this.contextMenuService.showContextMenu({
				getAnchor: () => e.event,
				getActions: () => Separator.join(...allActions.map((a) => a[1])),
				onHide: () => menu.dispose(),
			});
		});
	}
}

registerEditorContribution(EditorLineNumberContextMenu.ID, EditorLineNumberContextMenu, EditorContributionInstantiation.AfterFirstRender);
