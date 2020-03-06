/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { first } from 'vs/base/common/arrays';
import { startsWith } from 'vs/base/common/strings';
import { assertIsDefined } from 'vs/base/common/types';

export interface IQuickAccessController {

	/**
	 * Open the quick access picker with the optional prefix.
	 */
	show(prefix?: string): Promise<void>;
}

export interface IQuickAccessProvider {

	/**
	 * Called whenever a prefix was typed into quick pick that matches the provider.
	 *
	 * @param service the service to use to drive the quick input widget
	 * @param token cancellation support
	 */
	provide(service: IQuickInputService, token: CancellationToken): Promise<void>;
}

export interface QuickAccessProviderHelp {

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
	readonly ctor: IConstructorSignature0<IQuickAccessProvider>;
	readonly prefix: string;
	readonly helpEntries: QuickAccessProviderHelp[];
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
	registerQuickAccessProvider(provider: IQuickAccessProviderDescriptor): void;

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

	registerQuickAccessProvider(provider: IQuickAccessProviderDescriptor): void {
		this.providers.push(provider);

		// sort the providers by decreasing prefix length, such that longer
		// prefixes take priority: 'ext' vs 'ext install' - the latter should win
		this.providers.sort((providerA, providerB) => providerB.prefix.length - providerA.prefix.length);
	}

	getQuickAccessProviders(): IQuickAccessProviderDescriptor[] {
		return this.providers.slice(0);
	}

	getQuickAccessProvider(prefix: string): IQuickAccessProviderDescriptor | undefined {
		return prefix ? (first(this.providers, provider => startsWith(prefix, provider.prefix)) || undefined) : undefined;
	}
}

Registry.add(Extensions.Quickaccess, new QuickAccessRegistry());
