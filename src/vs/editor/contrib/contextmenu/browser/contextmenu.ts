/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent, IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { isIOS } from 'vs/base/common/platform';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ITextModel } from 'vs/editor/common/model';
import * as nls from 'vs/nls';
import { IMenuService, MenuId, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService, isStandaloneEditorWorkspace } from 'vs/platform/workspace/common/workspace';

export class ContextMenuController implements IEditorContribution {

	public static readonly ID = 'editor.contrib.contextmenu';

	public static get(editor: ICodeEditor): ContextMenuController | null {
		return editor.getContribution<ContextMenuController>(ContextMenuController.ID);
	}

	private readonly _toDispose = new DisposableStore();
	private _contextMenuIsBeingShownCount: number = 0;
	private readonly _editor: ICodeEditor;

	constructor(
		editor: ICodeEditor,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IMenuService private readonly _menuService: IMenuService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		this._editor = editor;

		this._toDispose.add(this._editor.onContextMenu((e: IEditorMouseEvent) => this._onContextMenu(e)));
		this._toDispose.add(this._editor.onMouseWheel((e: IMouseWheelEvent) => {
			if (this._contextMenuIsBeingShownCount > 0) {
				const view = this._contextViewService.getContextViewElement();
				const target = e.srcElement as HTMLElement;

				// Event triggers on shadow root host first
				// Check if the context view is under this host before hiding it #103169
				if (!(target.shadowRoot && dom.getShadowRoot(view) === target.shadowRoot)) {
					this._contextViewService.hideContextView();
				}
			}
		}));
		this._toDispose.add(this._editor.onKeyDown((e: IKeyboardEvent) => {
			if (!this._editor.getOption(EditorOption.contextmenu)) {
				return; // Context menu is turned off through configuration
			}
			if (e.keyCode === KeyCode.ContextMenu) {
				// Chrome is funny like that
				e.preventDefault();
				e.stopPropagation();
				this.showContextMenu();
			}
		}));
	}

	private _onContextMenu(e: IEditorMouseEvent): void {
		if (!this._editor.hasModel()) {
			return;
		}

		if (!this._editor.getOption(EditorOption.contextmenu)) {
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
		if (e.target.type === MouseTargetType.CONTENT_TEXT && e.target.detail.injectedText) {
			return; // allow native menu on injected text
		}

		e.event.preventDefault();
		e.event.stopPropagation();

		if (e.target.type === MouseTargetType.SCROLLBAR) {
			return this._showScrollbarContextMenu(e.event);
		}

		if (e.target.type !== MouseTargetType.CONTENT_TEXT && e.target.type !== MouseTargetType.CONTENT_EMPTY && e.target.type !== MouseTargetType.TEXTAREA) {
			return; // only support mouse click into text or native context menu key for now
		}

		// Ensure the editor gets focus if it hasn't, so the right events are being sent to other contributions
		this._editor.focus();

		// Ensure the cursor is at the position of the mouse click
		if (e.target.position) {
			let hasSelectionAtPosition = false;
			for (const selection of this._editor.getSelections()) {
				if (selection.containsPosition(e.target.position)) {
					hasSelectionAtPosition = true;
					break;
				}
			}

			if (!hasSelectionAtPosition) {
				this._editor.setPosition(e.target.position);
			}
		}

		// Unless the user triggerd the context menu through Shift+F10, use the mouse position as menu position
		let anchor: IMouseEvent | null = null;
		if (e.target.type !== MouseTargetType.TEXTAREA) {
			anchor = e.event;
		}

		// Show the context menu
		this.showContextMenu(anchor);
	}

	public showContextMenu(anchor?: IMouseEvent | null): void {
		if (!this._editor.getOption(EditorOption.contextmenu)) {
			return; // Context menu is turned off through configuration
		}
		if (!this._editor.hasModel()) {
			return;
		}

		// Find actions available for menu
		const menuActions = this._getMenuActions(this._editor.getModel(),
			this._editor.contextMenuId);

		// Show menu if we have actions to show
		if (menuActions.length > 0) {
			this._doShowContextMenu(menuActions, anchor);
		}
	}

	private _getMenuActions(model: ITextModel, menuId: MenuId): IAction[] {
		const result: IAction[] = [];

		// get menu groups
		const menu = this._menuService.createMenu(menuId, this._contextKeyService);
		const groups = menu.getActions({ arg: model.uri });
		menu.dispose();

		// translate them into other actions
		for (const group of groups) {
			const [, actions] = group;
			let addedItems = 0;
			for (const action of actions) {
				if (action instanceof SubmenuItemAction) {
					const subActions = this._getMenuActions(model, action.item.submenu);
					if (subActions.length > 0) {
						result.push(new SubmenuAction(action.id, action.label, subActions));
						addedItems++;
					}
				} else {
					result.push(action);
					addedItems++;
				}
			}

			if (addedItems) {
				result.push(new Separator());
			}
		}

		if (result.length) {
			result.pop(); // remove last separator
		}

		return result;
	}

	private _doShowContextMenu(actions: IAction[], event: IMouseEvent | null = null): void {
		if (!this._editor.hasModel()) {
			return;
		}

		// Disable hover
		const oldHoverSetting = this._editor.getOption(EditorOption.hover);
		this._editor.updateOptions({
			hover: {
				enabled: false
			}
		});

		let anchor: IMouseEvent | IAnchor | null = event;
		if (!anchor) {
			// Ensure selection is visible
			this._editor.revealPosition(this._editor.getPosition(), ScrollType.Immediate);

			this._editor.render();
			const cursorCoords = this._editor.getScrolledVisiblePosition(this._editor.getPosition());

			// Translate to absolute editor position
			const editorCoords = dom.getDomNodePagePosition(this._editor.getDomNode());
			const posx = editorCoords.left + cursorCoords.left;
			const posy = editorCoords.top + cursorCoords.top + cursorCoords.height;

			anchor = { x: posx, y: posy };
		}

		const useShadowDOM = this._editor.getOption(EditorOption.useShadowDOM) && !isIOS; // Do not use shadow dom on IOS #122035

		// Show menu
		this._contextMenuIsBeingShownCount++;
		this._contextMenuService.showContextMenu({
			domForShadowRoot: useShadowDOM ? this._editor.getDomNode() : undefined,

			getAnchor: () => anchor,

			getActions: () => actions,

			getActionViewItem: (action) => {
				const keybinding = this._keybindingFor(action);
				if (keybinding) {
					return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel(), isMenu: true });
				}

				const customActionViewItem = <any>action;
				if (typeof customActionViewItem.getActionViewItem === 'function') {
					return customActionViewItem.getActionViewItem();
				}

				return new ActionViewItem(action, action, { icon: true, label: true, isMenu: true });
			},

			getKeyBinding: (action): ResolvedKeybinding | undefined => {
				return this._keybindingFor(action);
			},

			onHide: (wasCancelled: boolean) => {
				this._contextMenuIsBeingShownCount--;
				this._editor.updateOptions({
					hover: oldHoverSetting
				});
			}
		});
	}

	private _showScrollbarContextMenu(anchor: IMouseEvent): void {
		if (!this._editor.hasModel()) {
			return;
		}

		if (isStandaloneEditorWorkspace(this._workspaceContextService.getWorkspace())) {
			// can't update the configuration properly in the standalone editor
			return;
		}

		const minimapOptions = this._editor.getOption(EditorOption.minimap);

		let lastId = 0;
		const createAction = (opts: { label: string; enabled?: boolean; checked?: boolean; run: () => void }): IAction => {
			return {
				id: `menu-action-${++lastId}`,
				label: opts.label,
				tooltip: '',
				class: undefined,
				enabled: (typeof opts.enabled === 'undefined' ? true : opts.enabled),
				checked: opts.checked,
				run: opts.run
			};
		};
		const createSubmenuAction = (label: string, actions: IAction[]): SubmenuAction => {
			return new SubmenuAction(
				`menu-action-${++lastId}`,
				label,
				actions,
				undefined
			);
		};
		const createEnumAction = <T>(label: string, enabled: boolean, configName: string, configuredValue: T, options: { label: string; value: T }[]): IAction => {
			if (!enabled) {
				return createAction({ label, enabled, run: () => { } });
			}
			const createRunner = (value: T) => {
				return () => {
					this._configurationService.updateValue(configName, value);
				};
			};
			const actions: IAction[] = [];
			for (const option of options) {
				actions.push(createAction({
					label: option.label,
					checked: configuredValue === option.value,
					run: createRunner(option.value)
				}));
			}
			return createSubmenuAction(
				label,
				actions
			);
		};

		const actions: IAction[] = [];
		actions.push(createAction({
			label: nls.localize('context.minimap.minimap', "Minimap"),
			checked: minimapOptions.enabled,
			run: () => {
				this._configurationService.updateValue(`editor.minimap.enabled`, !minimapOptions.enabled);
			}
		}));
		actions.push(new Separator());
		actions.push(createAction({
			label: nls.localize('context.minimap.renderCharacters', "Render Characters"),
			enabled: minimapOptions.enabled,
			checked: minimapOptions.renderCharacters,
			run: () => {
				this._configurationService.updateValue(`editor.minimap.renderCharacters`, !minimapOptions.renderCharacters);
			}
		}));
		actions.push(createEnumAction<'proportional' | 'fill' | 'fit'>(
			nls.localize('context.minimap.size', "Vertical size"),
			minimapOptions.enabled,
			'editor.minimap.size',
			minimapOptions.size,
			[{
				label: nls.localize('context.minimap.size.proportional', "Proportional"),
				value: 'proportional'
			}, {
				label: nls.localize('context.minimap.size.fill', "Fill"),
				value: 'fill'
			}, {
				label: nls.localize('context.minimap.size.fit', "Fit"),
				value: 'fit'
			}]
		));
		actions.push(createEnumAction<'always' | 'mouseover'>(
			nls.localize('context.minimap.slider', "Slider"),
			minimapOptions.enabled,
			'editor.minimap.showSlider',
			minimapOptions.showSlider,
			[{
				label: nls.localize('context.minimap.slider.mouseover', "Mouse Over"),
				value: 'mouseover'
			}, {
				label: nls.localize('context.minimap.slider.always', "Always"),
				value: 'always'
			}]
		));

		const useShadowDOM = this._editor.getOption(EditorOption.useShadowDOM) && !isIOS; // Do not use shadow dom on IOS #122035
		this._contextMenuIsBeingShownCount++;
		this._contextMenuService.showContextMenu({
			domForShadowRoot: useShadowDOM ? this._editor.getDomNode() : undefined,
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: (wasCancelled: boolean) => {
				this._contextMenuIsBeingShownCount--;
				this._editor.focus();
			}
		});
	}

	private _keybindingFor(action: IAction): ResolvedKeybinding | undefined {
		return this._keybindingService.lookupKeybinding(action.id);
	}

	public dispose(): void {
		if (this._contextMenuIsBeingShownCount > 0) {
			this._contextViewService.hideContextView();
		}

		this._toDispose.dispose();
	}
}

class ShowContextMenu extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.showContextMenu',
			label: nls.localize('action.showContextMenu.label', "Show Editor Context Menu"),
			alias: 'Show Editor Context Menu',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.Shift | KeyCode.F10,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		ContextMenuController.get(editor)?.showContextMenu();
	}
}

registerEditorContribution(ContextMenuController.ID, ContextMenuController, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(ShowContextMenu);
