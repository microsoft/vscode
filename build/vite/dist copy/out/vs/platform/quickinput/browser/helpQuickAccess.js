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
var HelpQuickAccessProvider_1;
import { localize } from '../../../nls.js';
import { Registry } from '../../registry/common/platform.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { Extensions } from '../common/quickAccess.js';
import { IQuickInputService } from '../common/quickInput.js';
let HelpQuickAccessProvider = class HelpQuickAccessProvider {
    static { HelpQuickAccessProvider_1 = this; }
    static { this.PREFIX = '?'; }
    constructor(quickInputService, keybindingService, contextKeyService) {
        this.quickInputService = quickInputService;
        this.keybindingService = keybindingService;
        this.contextKeyService = contextKeyService;
        this.registry = Registry.as(Extensions.Quickaccess);
    }
    provide(picker) {
        const disposables = new DisposableStore();
        // Open a picker with the selected value if picked
        disposables.add(picker.onDidAccept(() => {
            const [item] = picker.selectedItems;
            if (item) {
                this.quickInputService.quickAccess.show(item.prefix, { preserveValue: true });
            }
        }));
        // Also open a picker when we detect the user typed the exact
        // name of a provider (e.g. `?term` for terminals)
        disposables.add(picker.onDidChangeValue(value => {
            const providerDescriptor = this.registry.getQuickAccessProvider(value.substr(HelpQuickAccessProvider_1.PREFIX.length), this.contextKeyService);
            if (providerDescriptor?.prefix && providerDescriptor.prefix !== HelpQuickAccessProvider_1.PREFIX) {
                this.quickInputService.quickAccess.show(providerDescriptor.prefix, { preserveValue: true });
            }
        }));
        // Fill in all providers
        picker.items = this.getQuickAccessProviders().filter(p => p.prefix !== HelpQuickAccessProvider_1.PREFIX);
        return disposables;
    }
    getQuickAccessProviders() {
        const providers = this.registry
            .getQuickAccessProviders(this.contextKeyService)
            .sort((providerA, providerB) => providerA.prefix.localeCompare(providerB.prefix))
            .flatMap(provider => this.createPicks(provider));
        return providers;
    }
    createPicks(provider) {
        return provider.helpEntries.map(helpEntry => {
            const prefix = helpEntry.prefix || provider.prefix;
            const label = prefix || '\u2026' /* ... */;
            return {
                prefix,
                label,
                keybinding: helpEntry.commandId ? this.keybindingService.lookupKeybinding(helpEntry.commandId) : undefined,
                ariaLabel: localize('helpPickAriaLabel', "{0}, {1}", label, helpEntry.description),
                description: helpEntry.description
            };
        });
    }
};
HelpQuickAccessProvider = HelpQuickAccessProvider_1 = __decorate([
    __param(0, IQuickInputService),
    __param(1, IKeybindingService),
    __param(2, IContextKeyService)
], HelpQuickAccessProvider);
export { HelpQuickAccessProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGVscFF1aWNrQWNjZXNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL2hlbHBRdWlja0FjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDakYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFVBQVUsRUFBOEUsTUFBTSwwQkFBMEIsQ0FBQztBQUNsSSxPQUFPLEVBQUUsa0JBQWtCLEVBQThCLE1BQU0seUJBQXlCLENBQUM7QUFNbEYsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBdUI7O2FBRTVCLFdBQU0sR0FBRyxHQUFHLEFBQU4sQ0FBTztJQUlwQixZQUNxQixpQkFBc0QsRUFDdEQsaUJBQXNELEVBQ3RELGlCQUFzRDtRQUZyQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBQ3JDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFDckMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUwxRCxhQUFRLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBdUIsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBTWxGLENBQUM7SUFFTCxPQUFPLENBQUMsTUFBcUU7UUFDNUUsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUUxQyxrREFBa0Q7UUFDbEQsV0FBVyxDQUFDLEdBQUcsQ0FBQyxN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