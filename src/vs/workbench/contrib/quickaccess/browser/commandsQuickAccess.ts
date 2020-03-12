/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ICommandQuickPick } from 'vs/platform/quickinput/browser/commandsQuickAccess';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { timeout } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { DisposableStore, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { AbstractEditorCommandsQuickAccessProvider } from 'vs/editor/contrib/quickAccess/commandsQuickAccess';
import { IEditor } from 'vs/editor/common/editorCommon';
import { Language } from 'vs/base/common/platform';

export class CommandsQuickAccessProvider extends AbstractEditorCommandsQuickAccessProvider {

	// If extensions are not yet registered, we wait for a little moment to give them
	// a chance to register so that the complete set of commands shows up as result
	// We do not want to delay functionality beyond that time though to keep the commands
	// functional.
	private readonly extensionRegistrationRace = Promise.race([
		timeout(800),
		this.extensionService.whenInstalledExtensionsRegistered()
	]);

	get activeTextEditorControl(): IEditor | undefined { return this.editorService.activeTextEditorControl; }

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IMenuService private readonly menuService: IMenuService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IEnvironmentService readonly environmentService: IEnvironmentService
	) {
		super({
			alias: {

				// Show alias only when not running in english
				enable: !Language.isDefaultVariant(),

				// Print a warning if the alias does not match the english label
				verify: !environmentService.isBuilt && Language.isDefaultVariant(),
			}
		});
	}

	protected async getCommandPicks(disposables: DisposableStore, token: CancellationToken): Promise<Array<ICommandQuickPick>> {

		// wait for extensions registration or 800ms once
		await this.extensionRegistrationRace;

		if (token.isCancellationRequested) {
			return [];
		}

		return [
			...this.getCodeEditorCommandPicks(),
			...this.getGlobalCommandPicks(disposables)
		];
	}

	private getGlobalCommandPicks(disposables: DisposableStore): ICommandQuickPick[] {
		const globalCommandPicks: ICommandQuickPick[] = [];

		const globalCommandsMenu = this.editorService.invokeWithinEditorContext(accessor =>
			this.menuService.createMenu(MenuId.CommandPalette, accessor.get(IContextKeyService))
		);

		const globalCommandsMenuActions = globalCommandsMenu.getActions()
			.reduce((r, [, actions]) => [...r, ...actions], <Array<MenuItemAction | SubmenuItemAction | string>>[])
			.filter(action => action instanceof MenuItemAction) as MenuItemAction[];

		for (const action of globalCommandsMenuActions) {

			// Label
			let label = (typeof action.item.title === 'string' ? action.item.title : action.item.title.value) || action.item.id;

			// Category
			const category = typeof action.item.category === 'string' ? action.item.category : action.item.category?.value;
			if (category) {
				label = localize('commandWithCategory', "{0}: {1}", category, label);
			}

			// Alias
			const aliasTitle = typeof action.item.title !== 'string' ? action.item.title.original : undefined;
			const aliasCategory = (category && action.item.category && typeof action.item.category !== 'string') ? action.item.category.original : undefined;
			let alias = this.verifyAlias((aliasTitle && category) ?
				aliasCategory ? `${aliasCategory}: ${aliasTitle}` : `${category}: ${aliasTitle}` :
				aliasTitle, label, action.item.id);

			globalCommandPicks.push({
				label,
				commandId: action.item.id,
				detail: alias
			});
		}

		// Cleanup
		globalCommandsMenu.dispose();
		disposables.add(toDisposable(() => dispose(globalCommandsMenuActions)));

		return globalCommandPicks;
	}
}
