/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IQuickAccessController, IQuickAccessProvider, IQuickAccessRegistry, Extensions, IQuickAccessProviderDescriptor, IQuickAccessOptions, DefaultQuickAccessFilterValue } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { once } from 'vs/base/common/functional';

interface IInternalQuickAccessOptions extends IQuickAccessOptions {

	/**
	 * Internal option to not rewrite the filter value at all but use it as is.
	 */
	preserveFilterValue?: boolean;
}

export class QuickAccessController extends Disposable implements IQuickAccessController {

	private readonly registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);
	private readonly mapProviderToDescriptor = new Map<IQuickAccessProviderDescriptor, IQuickAccessProvider>();

	private readonly lastAcceptedPickerValues = new Map<IQuickAccessProviderDescriptor, string>();

	private visibleQuickAccess: { picker: IQuickPick<IQuickPickItem>, descriptor: IQuickAccessProviderDescriptor | undefined, value: string } | undefined = undefined;

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	show(value = '', options?: IInternalQuickAccessOptions): void {

		// Find provider for the value to show
		const [provider, descriptor] = this.getOrInstantiateProvider(value);

		// Rewrite the filter value based on certain rules unless disabled
		if (descriptor && !options?.preserveFilterValue) {
			let newValue: string | undefined = undefined;

			// If we have a visible provider with a value, take it's filter value but
			// rewrite to new provider prefix in case they differ
			if (this.visibleQuickAccess?.descriptor && this.visibleQuickAccess.descriptor !== descriptor) {
				const newValueCandidateWithoutPrefix = this.visibleQuickAccess.value.substr(this.visibleQuickAccess.descriptor.prefix.length);
				if (newValueCandidateWithoutPrefix) {
					newValue = `${descriptor.prefix}${newValueCandidateWithoutPrefix}`;
				}
			}

			// If the new provider wants to preserve the filter, take it's last remembered value
			// If the new provider wants to define the filter, take it as is
			if (!newValue) {
				const defaultFilterValue = provider?.defaultFilterValue;
				if (defaultFilterValue === DefaultQuickAccessFilterValue.LAST) {
					newValue = this.lastAcceptedPickerValues.get(descriptor);
				} else if (typeof defaultFilterValue === 'string') {
					newValue = `${descriptor.prefix}${defaultFilterValue}`;
				}
			}

			if (typeof newValue === 'string') {
				value = newValue;
			}
		}

		// Return early if quick access is already showing and
		// simply take over the filter value and select it for
		// the user to be able to type over
		if (descriptor && this.visibleQuickAccess?.descriptor === descriptor) {
			this.visibleQuickAccess.picker.value = value;
			this.visibleQuickAccess.picker.valueSelection = [descriptor.prefix.length, value.length];

			return;
		}

		// Create a picker for the provider to use with the initial value
		// and adjust the filtering to exclude the prefix from filtering
		const disposables = new DisposableStore();
		const picker = disposables.add(this.quickInputService.createQuickPick());
		picker.placeholder = descriptor?.placeholder;
		picker.value = value;
		picker.quickNavigate = options?.quickNavigateConfiguration;
		picker.hideInput = !!picker.quickNavigate && !this.visibleQuickAccess; // only hide input if there was no picker opened already
		picker.autoFocusSecondEntry = !!options?.quickNavigateConfiguration || !!options?.autoFocus?.autoFocusSecondEntry;
		picker.valueSelection = [descriptor?.prefix.length ?? 0, value.length]; // always allow to type over value after prefix
		picker.contextKey = descriptor?.contextKey;
		picker.filterValue = (value: string) => value.substring(descriptor ? descriptor.prefix.length : 0);

		// Register listeners
		const cancellationToken = this.registerPickerListeners(disposables, picker, provider, descriptor, value);

		// Ask provider to fill the picker as needed if we have one
		if (provider) {
			disposables.add(provider.provide(picker, cancellationToken));
		}

		// Finally, show the picker. This is important because a provider
		// may not call this and then our disposables would leak that rely
		// on the onDidHide event.
		picker.show();
	}

	private registerPickerListeners(disposables: DisposableStore, picker: IQuickPick<IQuickPickItem>, provider: IQuickAccessProvider | undefined, descriptor: IQuickAccessProviderDescriptor | undefined, value: string): CancellationToken {

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
			const [providerForValue] = this.getOrInstantiateProvider(value);
			if (providerForValue !== provider) {
				this.show(value, { preserveFilterValue: true } /* do not rewrite value from user typing! */);
			} else {
				visibleQuickAccess.value = value; // remember the value in our visible one
			}
		}));

		// Remember picker input for future use when accepting
		if (descriptor) {
			disposables.add(picker.onDidAccept(() => {
				this.lastAcceptedPickerValues.set(descriptor, picker.value);
			}));
		}

		// Create a cancellation token source that is valid as long as the
		// picker has not been closed without picking an item
		const cts = disposables.add(new CancellationTokenSource());
		once(picker.onDidHide)(() => {
			if (picker.selectedItems.length === 0) {
				cts.cancel();
			}

			// Start to dispose once picker hides
			disposables.dispose();
		});

		return cts.token;
	}

	private getOrInstantiateProvider(value: string): [IQuickAccessProvider | undefined, IQuickAccessProviderDescriptor | undefined] {
		const providerDescriptor = this.registry.getQuickAccessProvider(value);
		if (!providerDescriptor) {
			return [undefined, undefined];
		}

		let provider = this.mapProviderToDescriptor.get(providerDescriptor);
		if (!provider) {
			provider = this.instantiationService.createInstance(providerDescriptor.ctor);
			this.mapProviderToDescriptor.set(providerDescriptor, provider);
		}

		return [provider, providerDescriptor];
	}
}
