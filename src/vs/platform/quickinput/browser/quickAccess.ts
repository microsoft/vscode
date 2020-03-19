/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IQuickAccessController, IQuickAccessProvider, IQuickAccessRegistry, Extensions, IQuickAccessProviderDescriptor, IQuickAccessOptions } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { once } from 'vs/base/common/functional';

export class QuickAccessController extends Disposable implements IQuickAccessController {

	private readonly registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);
	private readonly mapProviderToDescriptor = new Map<IQuickAccessProviderDescriptor, IQuickAccessProvider>();

	private lastActivePicker: IQuickPick<IQuickPickItem> | undefined = undefined;

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	show(value = '', options?: IQuickAccessOptions): void {
		const disposables = new DisposableStore();

		// Hide any previous picker if any
		this.lastActivePicker?.hide();

		// Find provider for the value to show
		const [provider, descriptor] = this.getOrInstantiateProvider(value);

		// Create a picker for the provider to use with the initial value
		// and adjust the filtering to exclude the prefix from filtering
		const picker = disposables.add(this.quickInputService.createQuickPick());
		picker.placeholder = descriptor?.placeholder;
		picker.value = value;
		picker.quickNavigate = options?.quickNavigateConfiguration;
		picker.valueSelection = options?.inputSelection ? [options.inputSelection.start, options.inputSelection.end] : [value.length, value.length];
		picker.contextKey = descriptor?.contextKey;
		picker.filterValue = (value: string) => value.substring(descriptor ? descriptor.prefix.length : 0);

		// Remember as last active picker and clean up once picker get's disposed
		this.lastActivePicker = picker;
		disposables.add(toDisposable(() => {
			if (picker === this.lastActivePicker) {
				this.lastActivePicker = undefined;
			}
		}));

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

		// Whenever the value changes, check if the provider has
		// changed and if so - re-create the picker from the beginning
		disposables.add(picker.onDidChangeValue(value => {
			const [providerForValue] = this.getOrInstantiateProvider(value);
			if (providerForValue !== provider) {
				this.show(value);
			}
		}));

		// Ask provider to fill the picker as needed if we have one
		if (provider) {
			disposables.add(provider.provide(picker, cts.token));
		}

		// Finally, show the picker. This is important because a provider
		// may not call this and then our disposables would leak that rely
		// on the onDidHide event.
		picker.show();
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
