/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PickerQuickAccessProvider, IPickerQuickAccessItem, FastAndSlowPicks, Picks, TriggerAction } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { matchesFuzzy } from 'vs/base/common/filters';
import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ThemeIcon } from 'vs/base/common/themables';
import { Codicon } from 'vs/base/common/codicons';
import { IssueSource } from 'vs/platform/issue/common/issue';
import { IProductService } from 'vs/platform/product/common/productService';

export class IssueQuickAccess extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'issue ';

	constructor(
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService
	) {
		super(IssueQuickAccess.PREFIX, { canAcceptInBackground: true });
	}

	protected override _getPicks(filter: string): Picks<IPickerQuickAccessItem> | FastAndSlowPicks<IPickerQuickAccessItem> | Promise<Picks<IPickerQuickAccessItem> | FastAndSlowPicks<IPickerQuickAccessItem>> | null {
		if (this.configurationService.getValue<string>('extensions.experimental.quickAcessExtensions')) {
			const issuePicks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];
			const extensionIdList: Array<string> = [];

			// add regular open issue reporter button
			const createTerminalLabel1 = this.productService.quality === 'stable' ? localize("workbench.action.openIssueReporter", "Visual Studio Code") : localize("workbench.action.openIssueReporterInsiders", "Visual Studio Code: Insiders");
			issuePicks.push({
				label: `$(plus) ${createTerminalLabel1}`,
				ariaLabel: createTerminalLabel1,
				accept: () => this.commandService.executeCommand('workbench.action.openIssueReporter', { issueSource: IssueSource.VSCode })
			});

			if (issuePicks.length > 0) {
				issuePicks.push({ type: 'separator' });
			}

			const createTerminalLabel2 = localize("workbench.action.openIssueReporter2", "Extension Marketplace");
			issuePicks.push({
				label: `$(plus) ${createTerminalLabel2}`,
				ariaLabel: createTerminalLabel2,
				accept: () => this.commandService.executeCommand('workbench.action.openIssueReporter', { issueSource: IssueSource.Marketplace })
			});



			if (issuePicks.length > 0) {
				issuePicks.push({ type: 'separator', label: localize('extensions', "Extensions: Custom Reporting") });
			}
			// creates menu from contributed
			const menu = this.menuService.createMenu(MenuId.IssueReporter, this.contextKeyService);

			// render menu and dispose
			const actions = menu.getActions({ renderShortTitle: true }).flatMap(entry => entry[1]);


			// create picks from contributed menu
			actions.forEach(action => {
				if ('source' in action.item && action.item.source) {
					extensionIdList.push(action.item?.source?.id);
				}

				const pick = this._createPick(filter, action);
				if (pick) {
					issuePicks.push(pick);
				}
			});

			if (issuePicks.length > 0) {
				issuePicks.push({ type: 'separator', label: localize('otherExtensions', "Other Extensions") });
			}

			// create picks from extensions
			this.extensionService.extensions.forEach(extension => {
				if (!extension.isBuiltin) {
					const pick = this._createPick(filter, undefined, extension);
					const id = extension.identifier.value;
					if (pick) {
						if (extensionIdList.includes(id)) {
							return;
						}
						else {
							issuePicks.push(pick);
						}
					}
					extensionIdList.push(id);
				}
			});

			return issuePicks;
		}
		return null;
	}

	private _createPick(filter: string, action?: MenuItemAction | SubmenuItemAction | undefined, extension?: IRelaxedExtensionDescription): IPickerQuickAccessItem | undefined {
		if (action && 'source' in action.item && action.item.source) {
			const label = action.item.source?.title;
			const highlights = matchesFuzzy(filter, label, true);
			if (highlights) {
				return {
					label,
					highlights: { label: highlights },
					buttons: [{
						iconClass: ThemeIcon.asClassName(Codicon.info),
						tooltip: localize('contributedIssuePage', "Open Extension Page")
					}],
					trigger: () => {
						if ('source' in action.item && action.item.source) {
							this.commandService.executeCommand('extension.open', action.item.source.id);
						}
						return TriggerAction.CLOSE_PICKER;
					},
					accept: (keyMod, event) => {
						action.run();
					}
				};
			}
		} else if (extension && extension.displayName && extension.identifier.value) {
			const highlights = matchesFuzzy(filter, extension.displayName, true);
			if (highlights) {
				return {
					label: extension.displayName,
					highlights: { label: highlights },
					buttons: [{
						iconClass: ThemeIcon.asClassName(Codicon.info),
						tooltip: localize('contributedIssuePage', "Open Extension Page")
					}],
					trigger: () => {
						this.commandService.executeCommand('extension.open', extension.identifier.value);
						return TriggerAction.CLOSE_PICKER;
					},
					accept: (keyMod, event) => {
						this.commandService.executeCommand('workbench.action.openIssueReporter', extension.identifier.value);
					}

				};
			}
		}
		return undefined;
	}
}
