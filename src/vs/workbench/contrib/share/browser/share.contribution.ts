/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { IMenuService, MenuId, MenuRegistry, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import * as nls from 'vs/nls';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

const menuIds: [MenuId, MenuId | undefined, ContextKeyExpression | undefined][] = [
	[MenuId.EditorContext, MenuId.EditorContextShare, ContextKeyExpr.and(ContextKeyExpr.notEquals('resourceScheme', 'output'), EditorContextKeys.editorTextFocus)],
	[MenuId.EditorTitleContext, MenuId.EditorTitleContextShare, undefined],
	[MenuId.ExplorerContext, MenuId.ExplorerContextShare, undefined],
	[MenuId.OpenEditorsContext, MenuId.OpenEditorsContextShare, undefined],
	[MenuId.SCMResourceContext, MenuId.SCMResourceContextShare, undefined],
	[MenuId.EditorLineNumberContext, undefined, undefined],
];

for (const [menuId, submenuId, when] of menuIds) {
	if (submenuId !== undefined) {
		MenuRegistry.appendMenuItem(menuId, { submenu: submenuId, title: { value: nls.localize('share', "Share"), original: 'Share', }, group: '11_share', order: -1, when });
	}
}

class ShareContribution {

	private readonly disposableStore = new DisposableStore();
	private readonly menu = this.menuService.createMenu(MenuId.Share, this.contextKeyService);

	constructor(
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		this.ensureActions();
		this.menu.onDidChange(() => this.ensureActions());
	}

	private ensureActions(): void {
		this.disposableStore.clear();

		const allActions = this.menu.getActions();

		for (const [_, actions] of allActions) {
			for (const action of actions) {
				if (action instanceof SubmenuItemAction || !action.enabled) {
					continue;
				}
				for (const [menuId, submenuId] of menuIds) {
					this.disposableStore.add(MenuRegistry.appendMenuItem(
						submenuId ?? menuId,
						{ command: action.item }
					));
				}
			}
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(ShareContribution, LifecyclePhase.Eventually);
