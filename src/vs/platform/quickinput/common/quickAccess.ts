/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Registry } from 'vs/platform/registry/common/platform';
import { first, coalesce } from 'vs/base/common/arrays';
import { startsWith } from 'vs/base/common/strings';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';

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

export class QuickAccessRegistry implements IQuickAccessRegistry {
	private providers: IQuickAccessProviderDescriptor[] = [];
	private defaultProvider: IQuickAccessProviderDescriptor | undefined = undefined;

	registerQuickAccessProvider(provider: IQuickAccessProviderDescriptor): IDisposable {

		// Extract the default provider when no prefix is present
		if (provider.prefix.length === 0) {
			this.defaultProvider = provider;
		} else {
			this.providers.push(provider);
		}

		// sort the providers by decreasing prefix length, such that longer
		// prefixes take priority: 'ext' vs 'ext install' - the latter should win
		this.providers.sort((providerA, providerB) => providerB.prefix.length - providerA.prefix.length);

		return toDisposable(() => {
			this.providers.splice(this.providers.indexOf(provider), 1);

			if (this.defaultProvider === provider) {
				this.defaultProvider = undefined;
			}
		});
	}

	getQuickAccessProviders(): IQuickAccessProviderDescriptor[] {
		return coalesce([this.defaultProvider, ...this.providers]);
	}

	getQuickAccessProvider(prefix: string): IQuickAccessProviderDescriptor | undefined {
		const result = prefix ? (first(this.providers, provider => startsWith(prefix, provider.prefix)) || undefined) : undefined;

		return result || this.defaultProvider;
	}

	clear(): Function {
		const providers = [...this.providers];
		const defaultProvider = this.defaultProvider;

		this.providers = [];
		this.defaultProvider = undefined;

		return () => {
			this.providers = providers;
			this.defaultProvider = defaultProvider;
		};
	}
}

Registry.add(Extensions.Quickaccess, new QuickAccessRegistry());
