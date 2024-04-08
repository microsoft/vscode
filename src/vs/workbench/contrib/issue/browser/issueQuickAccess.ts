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
		@IProductService private readonly productService: IProductService
	) {
		super(IssueQuickAccess.PREFIX, { canAcceptInBackground: true });
	}

	protected override _getPicks(filter: string): Picks<IPickerQuickAccessItem> | FastAndSlowPicks<IPickerQuickAccessItem> | Promise<Picks<IPickerQuickAccessItem> | FastAndSlowPicks<IPickerQuickAccessItem>> | null {
		const issuePicksConst = new Array<IPickerQuickAccessItem | IQuickPickSeparator>();
		const issuePicksParts = new Array<IPickerQuickAccessItem | IQuickPickSeparator>();
		const extensionIdSet = new Set<string>();

		// Add default items
		const productLabel = this.productService.nameLong;
		const marketPlaceLabel = localize("reportExtensionMarketplace", "Extension Marketplace");
		const productFilter = matchesFuzzy(filter, productLabel, true);
		const marketPlaceFilter = matchesFuzzy(filter, marketPlaceLabel, true);

		// Add product pick if product filter matches
		if (productFilter) {
			issuePicksConst.push({
				label: productLabel,
				ariaLabel: productLabel,
				highlights: { label: productFilter },
				accept: () => this.commandService.executeCommand('workbench.action.openIssueReporter', { issueSource: IssueSource.VSCode })
			});
		}

		// Add marketplace pick if marketplace filter matches
		if (marketPlaceFilter) {
			issuePicksConst.push({
				label: marketPlaceLabel,
				ariaLabel: marketPlaceLabel,
				highlights: { label: marketPlaceFilter },
				accept: () => this.commandService.executeCommand('workbench.action.openIssueReporter', { issueSource: IssueSource.Marketplace })
			});
		}

		issuePicksConst.push({ type: 'separator', label: localize('extensions', "Extensions") });


		// creates menu from contributed
		const menu = this.menuService.createMenu(MenuId.IssueReporter, this.contextKeyService);

		// render menu and dispose
		const actions = menu.getActions({ renderShortTitle: true }).flatMap(entry => entry[1]);

		menu.dispose();

		// create picks from contributed menu
		actions.forEach(action => {
			if ('source' in action.item && action.item.source) {
				extensionIdSet.add(action.item.source.id);
			}

			const pick = this._createPick(filter, action);
			if (pick) {
				issuePicksParts.push(pick);
			}
		});


		// create picks from extensions
		this.extensionService.extensions.forEach(extension => {
			if (!extension.isBuiltin) {
				const pick = this._createPick(filter, undefined, extension);
				const id = extension.identifier.value;
				if (pick && !extensionIdSet.has(id)) {
					issuePicksParts.push(pick);
				}
				extensionIdSet.add(id);
			}
		});

		issuePicksParts.sort((a, b) => {
			const aLabel = a.label ?? '';
			const bLabel = b.label ?? '';
			return aLabel.localeCompare(bLabel);
		});

		return [...issuePicksConst, ...issuePicksParts];
	}

	private _createPick(filter: string, action?: MenuItemAction | SubmenuItemAction | undefined, extension?: IRelaxedExtensionDescription): IPickerQuickAccessItem | undefined {
		const buttons = [{
			iconClass: ThemeIcon.asClassName(Codicon.info),
			tooltip: localize('contributedIssuePage', "Open Extension Page")
		}];

		let label: string;
		let trigger: () => TriggerAction;
		let accept: () => void;
		if (action && 'source' in action.item && action.item.source) {
			label = action.item.source?.title;
			trigger = () => {
				if ('source' in action.item && action.item.source) {
					this.commandService.executeCommand('extension.open', action.item.source.id);
				}
				return TriggerAction.CLOSE_PICKER;
			};
			accept = () => {
				action.run();
			};

		} else if (extension) {
			label = extension.displayName ?? extension.name;
			trigger = () => {
				this.commandService.executeCommand('extension.open', extension.identifier.value);
				return TriggerAction.CLOSE_PICKER;
			};
			accept = () => {
				this.commandService.executeCommand('workbench.action.openIssueReporter', extension.identifier.value);
			};

		} else {
			return undefined;
		}

		const highlights = matchesFuzzy(filter, label, true);
		if (highlights) {
			return {
				label,
				highlights: { label: highlights },
				buttons,
				trigger,
				accept
			};
		}
		return undefined;
	}
}
