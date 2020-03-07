/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/platform/quickinput/browser/quickAccessHelp';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IQuickAccessController, IQuickAccessProvider, IQuickAccessRegistry, Extensions, IQuickAccessProviderDescriptor } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { once } from 'vs/base/common/functional';

export class QuickAccessController extends Disposable implements IQuickAccessController {

	private readonly registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);
	private readonly mapProviderToDescriptor = new Map<IQuickAccessProviderDescriptor, IQuickAccessProvider>();

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	show(value = ''): void {

		// Find provider for the value to show
		const [provider, prefix] = this.getOrInstantiateProvider(value);

		// Create a picker for the provider to use with the initial value
		// and adjust the filtering to exclude the prefix from filtering
		const picker = this.quickInputService.createQuickPick();
		picker.value = value;
		picker.valueSelection = [value.length, value.length];
		picker.filterValue = (value: string) => value.substring(prefix.length);

		// Cleanup when picker hides
		const disposables = new DisposableStore();
		once(picker.onDidHide)(() => disposables.dispose());

		// Whenever the value changes, check if the provider has
		// changed and if so - re-create the picker from the beginning
		disposables.add(picker.onDidChangeValue(value => {
			const [providerForValue] = this.getOrInstantiateProvider(value);
			if (providerForValue !== provider) {
				this.show(value);
			}
		}));

		// Create a cancellation token source that is valid
		// as long as the picker has not been closed
		const cts = new CancellationTokenSource();
		disposables.add(toDisposable(() => cts.dispose(true)));

		// Finally ask provider to fill the picker as needed
		provider.provide(picker, cts.token);
	}

	private getOrInstantiateProvider(value: string): [IQuickAccessProvider, string /* prefix */] {
		const providerDescriptor = this.registry.getQuickAccessProvider(value) || this.registry.defaultProvider;

		let provider = this.mapProviderToDescriptor.get(providerDescriptor);
		if (!provider) {
			provider = this.instantiationService.createInstance(providerDescriptor.ctor);
			this.mapProviderToDescriptor.set(providerDescriptor, provider);
		}

		return [provider, providerDescriptor.prefix];
	}
}
