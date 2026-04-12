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
import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, isDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { DefaultQuickAccessFilterValue, Extensions } from '../common/quickAccess.js';
import { IQuickInputService, ItemActivation } from '../common/quickInput.js';
import { Registry } from '../../registry/common/platform.js';
let QuickAccessController = class QuickAccessController extends Disposable {
    constructor(quickInputService, instantiationService, contextKeyService) {
        super();
        this.quickInputService = quickInputService;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.registry = Registry.as(Extensions.Quickaccess);
        this.mapProviderToDescriptor = new Map();
        this.lastAcceptedPickerValues = new Map();
        this.visibleQuickAccess = undefined;
        this._register(toDisposable(() => {
            for (const provider of this.mapProviderToDescriptor.values()) {
                if (isDisposable(provider)) {
                    provider.dispose();
                }
            }
            this.visibleQuickAccess?.picker.dispose();
        }));
    }
    pick(value = '', options) {
        return this.doShowOrPick(value, true, options);
    }
    show(value = '', options) {
        this.doShowOrPick(value, false, options);
    }
    doShowOrPick(value, pick, options) {
        // Find provider for the value to show
        const [provider, descriptor] = this.getOrInstantiateProvider(value, options?.enabledProviderPrefixes);
        // Return early if quick access is already showing on that same prefix
        const visibleQuickAccess = this.visibleQuickAccess;
        const visibleDescriptor = visibleQuickAccess?.descriptor;
        if (visibleQuickAccess && descriptor && visibleDescriptor === descriptor) {
            // Apply value only if it is more specific than the prefix
            // from the provider and we are not instructed to preserve
            if (value !== descriptor.prefix && !options?.preserveValue) {
                visibleQuickAccess.picker.value = value;
            }
            // Always adjust selection
            this.adjustValueSelection(visibleQuickAccess.picker, descriptor, options);
            return;
        }
        // Rewrite the filter value based on certain rules unless disabled
        if (descriptor && !options?.preserveValue) {
            let newValue = undefined;
            // If we have a visible provider with a value, take it's filter value but
            // rewrite to new provider prefix in case they differ
            if (visibleQuickAccess && visibleDescriptor && visibleDescriptor !== descriptor) {
                const newValueCandidateWithoutPrefix = visibleQuickAccess.value.substr(visibleDescriptor.prefix.length);
                if (newValueCandidateWithoutPrefix) {
                    newValue = `${descriptor.prefix}${newValueCandidateWithoutPrefix}`;
                }
            }
            // Otherwise, take a default value as instructed
            if (!newValue) {
                const defaultFilterValue = provider?.defaultFilterValue;
                if (defaultFilterValue === DefaultQuickAccessFilterValue.LAST) {
                    newValue = this.lastAcceptedPickerValues.get(descriptor);
                }
                else if (typeof defaultFilterValue === 'string') {
                    newValue = `${descriptor.prefix}${defaultFilterValue}`;
                }
            }
            if (typeof newValue === 'string') {
                value = newValue;
            }
        }
        // Store the existing selection if there was one.
        const visibleSelection = visibleQuickAccess?.picker?.valueSelection;
        const visibleValue = visibleQuickAccess?.picker?.value;
        // Create a picker for the provider to use with the initial value
        // and adjust the filtering to exclude the prefix from filtering
        const disposables = new DisposableStore();
        const picker = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
        picker.value = value;
        this.adjustValueSelection(picker, descriptor, options);
        picker.placeholder = options?.placeholder ?? descriptor?.placeholder;
        picker.quickNavigate = options?.quickNavigateConfiguration;
        picker.hideInput = !!picker.quickNavigate && !visibleQuickAccess; // only hide input if there was no picker opened already
        if (typeof options?.itemActivation === 'number' || options?.quickNavigateConfiguration) {
            picker.itemActivation = options?.itemActivation ?? ItemActivation.SECOND /* quick nav is always second */;
        }
        picker.contextKey = descriptor?.contextKey;
        picker.filterValue = (value) => value.substring(descriptor ? descriptor.prefix.length : 0);
        // Pick mode: setup a promise that can be resolved
        // with the selected items and prevent execution
        let pickPromise = undefined;
        if (pick) {
            pickPromise = new DeferredPromise();
            disposables.add(Event.once(picker.onWillAccept)(e => {
                e.veto();
                picker.hide();
            }));
        }
        // Register listeners
        disposables.add(this.registerPickerListeners(picker, provider, descriptor, value, options));
        // Ask provider to fill the picker as needed if we have one
        // and pass over a cancellation token that will indicate when
        // the picker is hiding without a pick being made.
        const cts = disposables.add(new CancellationTokenSource());
        if (provider) {
            disposables.add(provider.provide(picker, cts.token, options?.providerOptions));
        }
        // Finally, trigger disposal and cancellation when the picker
        // hides depending on items selected or not.
        Event.once(picker.onDidHide)(() => {
            if (picker.selectedItems.length === 0) {
                cts.cancel();
            }
            // Start to dispose once picker hides
            disposables.dispose();
            // Resolve pick promise with selected items
            pickPromise?.complete(picker.selectedItems.slice(0));
        });
        // Finally, show the picker. This is important because a provider
        // may not call this and then our disposables would leak that rely
        // on the onDidHide event.
        picker.show();
        // If the previous picker had a selection and the value is unchanged, we should set that in the new picker.
        if (visibleSelection && visibleValue === value) {
            picker.valueSelection = visibleSelection;
        }
        // Pick mode: return with promise
        if (pick) {
            return pickPromise?.p;
        }
    }
    adjustValueSelection(picker, descriptor, options) {
        let valueSelection;
        // Preserve: just always put the cursor at the end
        if (options?.preserveValue) {
            valueSelection = [picker.value.length, picker.value.length];
        }
        // Otherwise: select the value up until the prefix
        else {
            valueSelection = [descriptor?.prefix.length ?? 0, picker.value.length];
        }
        picker.valueSelection = valueSelection;
    }
    registerPickerListeners(picker, provider, descriptor, value, options) {
        const disposables = new DisposableStore();
        // Remember as last visible picker and clean up once picker get's disposed
        const visibleQuickAccess = this.visibleQuickAccess = { picker, descriptor, value };
        disposables.add(toDisposable(() => {
            if (visibleQuickAccess === this.visibleQuickAccess) {
                this.visibleQuickAccess = undefined;
            }
        }));
        // Whenever the value changes, check if the provider has
        // changed and if so - re-create the picker from the beginning
        disposables.add(picker.onDidChangeValue(value => {
            const [providerForValue] = this.getOrInstantiateProvider(value, options?.enabledProviderPrefixes);
            if (providerForValue !== provider) {
                this.show(value, {
                    enabledProviderPrefixes: options?.enabledProviderPrefixes,
                    // do not rewrite value from user typing!
                    preserveValue: true,
                    // persist the value of the providerOptions from the original showing
                    providerOptions: options?.providerOptions
                });
            }
            else {
                visibleQuickAccess.value = value; // remember the value in our visible one
            }
        }));
        // Remember picker input for future use when accepting
        if (descriptor) {
            disposables.add(picker.onDidAccept(() => {
                this.lastAcceptedPickerValues.set(descriptor, picker.value);
            }));
        }
        return disposables;
    }
    getOrInstantiateProvider(value, enabledProviderPrefixes) {
        const providerDescriptor = this.registry.getQuickAccessProvider(value, this.contextKeyService);
        if (!providerDescriptor || enabledProviderPrefixes && !enabledProviderPrefixes?.includes(providerDescriptor.prefix)) {
            return [undefined, undefined];
        }
        let provider = this.mapProviderToDescriptor.get(providerDescriptor);
        if (!provider) {
            provider = this.instantiationService.createInstance(providerDescriptor.ctor);
            this.mapProviderToDescriptor.set(providerDescriptor, provider);
        }
        return [provider, providerDescriptor];
    }
};
QuickAccessController = __decorate([
    __param(0, IQuickInputService),
    __param(1, IInstantiationService),
    __param(2, IContextKeyService)
], QuickAccessController);
export { QuickAccessController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tBY2Nlc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcXVpY2tBY2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDM0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLFVBQVUsRUFBMkgsTUFBTSwwQkFBMEIsQ0FBQztBQUM5TSxPQUFPLEVBQUUsa0JBQWtCLEVBQThCLGNBQWMsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV0RCxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFzQixTQUFRLFVBQVU7SUFhcEQsWUFDcUIsaUJBQXNELEVBQ25ELG9CQUE0RCxFQUMvRCxpQkFBc0Q7UUFFMUUsS0FBSyxFQUFFLENBQUM7UUFKNkIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUNsQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQzlDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFkMUQsYUFBUSxHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQXVCLFVBQVUsQ0FB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