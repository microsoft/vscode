/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var IssueQuickAccess_1;
import { PickerQuickAccessProvider, TriggerAction } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { matchesFuzzy } from '../../../../base/common/filters.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IssueSource } from '../common/issue.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
let IssueQuickAccess = class IssueQuickAccess extends PickerQuickAccessProvider {
    static { IssueQuickAccess_1 = this; }
    static { this.PREFIX = 'issue '; }
    constructor(menuService, contextKeyService, commandService, extensionService, productService) {
        super(IssueQuickAccess_1.PREFIX, { canAcceptInBackground: true });
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.commandService = commandService;
        this.extensionService = extensionService;
        this.productService = productService;
    }
    _getPicks(filter) {
        const issuePicksConst = new Array();
        const issuePicksParts = new Array();
        const extensionIdSet = new Set();
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
        // gets menu actions from contributed
        const actions = this.menuService.getMenuActions(MenuId.IssueReporter, this.contextKeyService, { renderShortTitle: true }).flatMap(entry => entry[1]);
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
    _createPick(filter, action, extension) {
        const buttons = [{
                iconClass: ThemeIcon.asClassName(Codicon.info),
                tooltip: localize('contributedIssuePage', "Open Extension Page")
            }];
        let label;
        let trigger;
        let accept;
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
        }
        else if (extension) {
            label = extension.displayName ?? extension.name;
            trigger = () => {
                this.commandService.executeCommand('extension.open', extension.identifier.value);
                return TriggerAction.CLOSE_PICKER;
            };
            accept = () => {
                this.commandService.executeCommand('workbench.action.openIssueReporter', extension.identifier.value);
            };
        }
        else {
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
};
IssueQuickAccess = IssueQuickAccess_1 = __decorate([
    __param(0, IMenuService),
    __param(1, IContextKeyService),
    __param(2, ICommandService),
    __param(3, IExtensionService),
    __param(4, IProductService)
], IssueQuickAccess);
export { IssueQuickAccess };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXNzdWVRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2Jyb3dzZXIvaXNzdWVRdWlja0FjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHlCQUF5QixFQUFtRCxhQUFhLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN6SyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBcUMsTUFBTSxnREFBZ0QsQ0FBQztBQUN6SCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUV0RixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNqRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFakYsSUFBTSxnQkFBZ0IsR0FBdEIsTUFBTSxnQkFBaUIsU0FBUSx5QkFBaUQ7O2FBRS9FLFdBQU0sR0FBRyxRQUFRLEFBQVgsQ0FBWTtJQUV6QixZQUNnQyxXQUF5QixFQUNuQixpQkFBcUMsRUFDeEMsY0FBK0IsRUFDN0IsZ0JBQW1DLEVBQ3JDLGNBQStCO1FBRWpFLEtBQUssQ0FBQyxrQkFBZ0IsQ0FBQyxNQUFNLEVBQUUs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