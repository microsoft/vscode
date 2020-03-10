/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Registry } from 'vs/platform/registry/common/platform';
import { first } from 'vs/base/common/arrays';
import { startsWith } from 'vs/base/common/strings';
import { assertIsDefined } from 'vs/base/common/types';
import { IDisposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IQuickPickSeparator } from 'vs/base/parts/quickinput/common/quickInput';

export interface IQuickAccessController {

	/**
	 * Open the quick access picker with the optional value prefilled.
	 */
	show(value?: string): void;
}

export interface IQuickAccessProvider {

	/**
	 * Called whenever a prefix was typed into quick pick that matches the provider.
	 *
	 * @param picker the picker to use for showing provider results. The picker is
	 * automatically shown after the method returns, no need to call `show()`.
	 * @param token providers have to check the cancellation token everytime after
	 * a long running operation or from event handlers because it could be that the
	 * picker has been closed or changed meanwhile. The token can be used to find out
	 * that the picker was closed without picking an entry (e.g. was canceled by the user).
	 * @return a disposable that will automatically be disposed when the picker
	 * closes or is replaced by another picker.
	 */
	provide(picker: IQuickPick<IQuickPickItem>, token: CancellationToken): IDisposable;
}

export interface IQuickAccessProviderHelp {

	/**
	 * The prefix to show for the help entry. If not provided,
	 * the prefix used for registration will be taken.
	 */
	prefix?: string;

	/**
	 * A description text to help understand the intent of the provider.
	 */
	description: string;

	/**
	 * Separation between provider for editors and global ones.
	 */
	needsEditor: boolean;
}

export interface IQuickAccessProviderDescriptor {

	/**
	 * The actual provider that will be instantiated as needed.
	 */
	readonly ctor: { new(...services: any /* TS BrandedService but no clue how to type this properly */[]): IQuickAccessProvider };

	/**
	 * The prefix for quick access picker to use the provider for.
	 */
	readonly prefix: string;

	/**
	 * A placeholder to use for the input field when the provider is active.
	 * This will also be read out by screen readers and thus helps for
	 * accessibility.
	 */
	readonly placeholder?: string;

	/**
	 * Documentation for the provider in the quick access help.
	 */
	readonly helpEntries: IQuickAccessProviderHelp[];

	/**
	 * A context key that will be set automatically when the
	 * picker for the provider is showing.
	 */
	readonly contextKey?: string;
}

export const Extensions = {
	Quickaccess: 'workbench.contributions.quickaccess'
};

export interface IQuickAccessRegistry {

	/**
	 * The default provider to use when no other provider matches.
	 */
	defaultProvider: IQuickAccessProviderDescriptor;

	/**
	 * Registers a quick access provider to the platform.
	 */
	registerQuickAccessProvider(provider: IQuickAccessProviderDescriptor): IDisposable;

	/**
	 * Get all registered quick access providers.
	 */
	getQuickAccessProviders(): IQuickAccessProviderDescriptor[];

	/**
	 * Get a specific quick access provider for a given prefix.
	 */
	getQuickAccessProvider(prefix: string): IQuickAccessProviderDescriptor | undefined;
}

class QuickAccessRegistry implements IQuickAccessRegistry {
	private providers: IQuickAccessProviderDescriptor[] = [];

	private _defaultProvider: IQuickAccessProviderDescriptor | undefined = undefined;
	get defaultProvider(): IQuickAccessProviderDescriptor { return assertIsDefined(this._defaultProvider); }
	set defaultProvider(provider: IQuickAccessProviderDescriptor) { this._defaultProvider = provider; }

	registerQuickAccessProvider(provider: IQuickAccessProviderDescriptor): IDisposable {
		this.providers.push(provider);

		// sort the providers by decreasing prefix length, such that longer
		// prefixes take priority: 'ext' vs 'ext install' - the latter should win
		this.providers.sort((providerA, providerB) => providerB.prefix.length - providerA.prefix.length);

		return toDisposable(() => this.providers.splice(this.providers.indexOf(provider), 1));
	}

	getQuickAccessProviders(): IQuickAccessProviderDescriptor[] {
		return [this.defaultProvider, ...this.providers];
	}

	getQuickAccessProvider(prefix: string): IQuickAccessProviderDescriptor | undefined {
		return prefix ? (first(this.providers, provider => startsWith(prefix, provider.prefix)) || undefined) : undefined;
	}
}

Registry.add(Extensions.Quickaccess, new QuickAccessRegistry());

//#region Helper class for simple picker based providers

export interface IPickerQuickAccessItem extends IQuickPickItem {

	/**
	* A method that will be executed when the pick item is accepted from
	* the picker. The picker will close automatically before running this.
	*/
	accept?(): void;

	/**
	 * A method that will be executed when a button of the pick item was
	 * clicked on. The picker will only close if `true` is returned.
	 *
	 * @param buttonIndex index of the button of the item that
	 * was clicked.
	 *
	 * @returns a valud indicating if the picker should close or not.
	 */
	trigger?(buttonIndex: number): boolean;
}

export abstract class PickerQuickAccessProvider<T extends IPickerQuickAccessItem> implements IQuickAccessProvider {

	constructor(private prefix: string) { }

	provide(picker: IQuickPick<T>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Disable filtering & sorting, we control the results
		picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;

		// Set initial picks and update on type
		let picksCts: CancellationTokenSource | undefined = undefined;
		const updatePickerItems = async () => {

			// Cancel any previous ask for picks and busy
			picksCts?.dispose(true);
			picker.busy = false;

			// Create new cancellation source for this run
			picksCts = new CancellationTokenSource(token);

			// Collect picks and support both long running and short
			const res = this.getPicks(picker.value.substr(this.prefix.length).trim(), picksCts.token);
			if (Array.isArray(res)) {
				picker.items = res;
			} else {
				picker.busy = true;
				try {
					picker.items = await res;
				} finally {
					picker.busy = false;
				}
			}

			this.getPicks(picker.value.substr(this.prefix.length).trim(), picksCts.token);
		};
		disposables.add(picker.onDidChangeValue(() => updatePickerItems()));
		updatePickerItems();

		// Accept the pick on accept and hide picker
		disposables.add(picker.onDidAccept(() => {
			const [item] = picker.selectedItems;
			if (typeof item?.accept === 'function') {
				picker.hide();
				item.accept();
			}
		}));

		// Trigger the pick with button index if button triggered
		disposables.add(picker.onDidTriggerItemButton(({ button, item }) => {
			if (typeof item.trigger === 'function') {
				const buttonIndex = item.buttons?.indexOf(button) ?? -1;
				if (buttonIndex >= 0) {
					const hide = item.trigger(buttonIndex);
					if (hide !== false) {
						picker.hide();
					}
				}
			}
		}));

		return disposables;
	}

	/**
	 * Returns an array of picks and separators as needed. If the picks are resolved
	 * long running, the provided cancellation token should be used to cancel the
	 * operation when the token signals this.
	 *
	 * The implementor is responsible for filtering and sorting the picks given the
	 * provided `filter`.
	 */
	protected abstract getPicks(filter: string, token: CancellationToken): Array<T | IQuickPickSeparator> | Promise<Array<T | IQuickPickSeparator>>;
}

//#endregion
