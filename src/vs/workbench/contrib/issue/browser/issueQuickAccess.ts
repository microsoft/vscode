/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PickerQuickAccessProvider, IPickerQuickAccessItem, FastAndSlowPicks, Picks } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { matchesFuzzy } from 'vs/base/common/filters';
import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class IssueQuickAccess extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'issue ';

	constructor(
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(IssueQuickAccess.PREFIX, { canAcceptInBackground: true });
	}

	protected override _getPicks(filter: string): Picks<IPickerQuickAccessItem> | FastAndSlowPicks<IPickerQuickAccessItem> | Promise<Picks<IPickerQuickAccessItem> | FastAndSlowPicks<IPickerQuickAccessItem>> | null {

		const issuePicks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];

		// creates menu from contributed
		const menu = this.menuService.createMenu(MenuId.IssueReporter, this.contextKeyService);

		// render menu and dispose
		const actions = menu.getActions({ renderShortTitle: true }).flatMap(entry => entry[1]);
		actions.forEach(action => {
			const pick = this._createPick(action, filter);
			if (pick) {
				issuePicks.push(pick);
			}
		});

		if (issuePicks.length > 0) {
			issuePicks.push({ type: 'separator' });
		}

		const createTerminalLabel = localize("workbench.action.openIssueReporter", "Open Issue Reporter");
		issuePicks.push({
			label: `$(plus) ${createTerminalLabel}`,
			ariaLabel: createTerminalLabel,
			accept: () => this.commandService.executeCommand('workbench.action.openIssueReporter')
		});
		return issuePicks;
	}

	private _createPick(action: MenuItemAction | SubmenuItemAction, filter: string): IPickerQuickAccessItem | undefined {
		if (action.item && 'source' in action.item && action.item.source?.title) {
			const label = action.item.source?.title;
			const highlights = matchesFuzzy(filter, label, true);
			if (highlights) {
				return {
					label,
					highlights: { label: highlights },
					accept: (keyMod, event) => {
						action.run();
					}
				};
			}
		}
		return undefined;
	}

}
