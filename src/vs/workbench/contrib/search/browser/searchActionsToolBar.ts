/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ToolBar } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { IAction } from '../../../../base/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createActionViewItem, getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenu, IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService, IScopedContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';

/**
 * Renderer-scoped helper that owns a single `IMenu` for `MenuId.SearchActionMenu`
 * and fans out menu changes to many lightweight per-row `ToolBar` instances.
 *
 * Background: search result trees instantiate a renderer per row "kind"
 * (folder match / file match / match) and each renderer's `renderTemplate`
 * previously created a per-row `MenuWorkbenchToolBar`. That in turn created a
 * per-row `IMenu` and a per-row scoped `IContextKeyService`. With ~175+ visible
 * rows the lazy listeners those Menus attach to the context-key service tripped
 * the global leak threshold (issue #308255).
 *
 * This helper instead creates ONE menu, ONE scoped context-key service, and ONE
 * scoped instantiation service per renderer; per-row `renderTemplate` then asks
 * the pool for a lightweight `ToolBar`. A single `menu.onDidChange` subscription
 * fans out updates to every live toolbar.
 *
 * Trade-off: per-row context-key bindings (e.g. `IsEditableItemKey`) used to filter
 * action visibility per row are no longer supported. For `MenuId.SearchActionMenu`
 * this means inline replace icons may show on rows whose underlying match is
 * read-only when replace mode is active. The action's `run()` is responsible for
 * a no-op in that case (read-only matches cannot be modified anyway).
 */
export class SearchActionsMenuPool extends Disposable {

	private readonly _scopedContextKeyService: IScopedContextKeyService;
	readonly scopedInstantiationService: IInstantiationService;

	private readonly _menu: IMenu;
	private readonly _toolbars = new Set<ToolBar>();

	private _primary: IAction[] = [];
	private _secondary: IAction[] = [];

	constructor(
		parentContextKeyService: IContextKeyService,
		parentInstantiationService: IInstantiationService,
		setupContextKeys: (scopedContextKeyService: IContextKeyService) => void,
		menuService: IMenuService,
	) {
		super();

		// Detached sentinel element: createScoped requires an IContextKeyServiceTarget.
		// We don't want this scope tied to any tree row, so use a free-standing element.
		// Keybinding-context DOM traversal won't find it (intentional); each row's
		// keyboard interactions still flow through the row's own focused element.
		const sentinel = document.createElement('div');
		this._scopedContextKeyService = this._register(parentContextKeyService.createScoped(sentinel));
		setupContextKeys(this._scopedContextKeyService);

		this.scopedInstantiationService = this._register(parentInstantiationService.createChild(
			new ServiceCollection([IContextKeyService, this._scopedContextKeyService])
		));

		this._menu = this._register(menuService.createMenu(MenuId.SearchActionMenu, this._scopedContextKeyService, { emitEventsForSubmenuChanges: true }));
		this._refreshActions();
		this._register(this._menu.onDidChange(() => {
			this._refreshActions();
			for (const toolbar of this._toolbars) {
				toolbar.setActions(this._primary, this._secondary);
			}
		}));
	}

	private _refreshActions(): void {
		const { primary, secondary } = getActionBarActions(
			this._menu.getActions({ shouldForwardArgs: true }),
			(g: string) => /^inline/.test(g)
		);
		this._primary = primary;
		this._secondary = secondary;
	}

	/**
	 * Create a lightweight per-row `ToolBar` populated with the shared menu's actions.
	 * Caller owns the returned toolbar and must call `dispose()` (which removes it
	 * from the pool and disposes it) when the row template is disposed.
	 */
	createToolBar(container: HTMLElement): { toolbar: ToolBar; dispose: () => void } {
		const toolbar = this.scopedInstantiationService.invokeFunction(accessor => {
			const contextMenuService = accessor.get(IContextMenuService);
			const keybindingService = accessor.get(IKeybindingService);
			return new ToolBar(container, contextMenuService, {
				actionViewItemProvider: (action, options) => createActionViewItem(this.scopedInstantiationService, action, options),
				getKeyBinding: (action) => keybindingService.lookupKeybinding(action.id) ?? undefined,
			});
		});
		toolbar.setActions(this._primary, this._secondary);
		this._toolbars.add(toolbar);
		const dispose = () => {
			this._toolbars.delete(toolbar);
			toolbar.dispose();
		};
		return { toolbar, dispose };
	}
}
