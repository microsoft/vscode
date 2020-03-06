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

export interface IQuickOmniController {

	/**
	 * Open the quick omni picker with the optional prefix.
	 */
	show(prefix?: string): Promise<void>;
}

export interface IQuickOmniProvider {

	/**
	 * Called whenever a prefix was typed into quick pick that matches the provider.
	 *
	 * @param service the service to use to drive the quick input widget
	 * @param token cancellation support
	 */
	provide(service: IQuickInputService, token: CancellationToken): Promise<void>;
}

export interface QuickOmniProviderHelp {

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

export interface IQuickOmniProviderDescriptor {
	readonly ctor: IConstructorSignature0<IQuickOmniProvider>;
	readonly prefix: string;
	readonly contextKey: string | undefined;
	readonly helpEntries: QuickOmniProviderHelp[];
}

export const Extensions = {
	Quickomni: 'workbench.contributions.quickomni'
};

export interface IQuickOmniRegistry {

	/**
	 * Registers a quick omni provider to the platform.
	 */
	registerQuickOmniProvider(provider: IQuickOmniProviderDescriptor): void;

	/**
	 * Get all registered quick omni providers.
	 */
	getQuickOmniProviders(): IQuickOmniProviderDescriptor[];

	/**
	 * Get a specific quick omni provider for a given prefix.
	 */
	getQuickOmniProvider(prefix: string): IQuickOmniProviderDescriptor | undefined;
}

class QuickOmniRegistry implements IQuickOmniRegistry {
	private providers: IQuickOmniProviderDescriptor[] = [];

	registerQuickOmniProvider(provider: IQuickOmniProviderDescriptor): void {
		this.providers.push(provider);

		// sort the providers by decreasing prefix length, such that longer
		// prefixes take priority: 'ext' vs 'ext install' - the latter should win
		this.providers.sort((providerA, providerB) => providerB.prefix.length - providerA.prefix.length);
	}

	getQuickOmniProviders(): IQuickOmniProviderDescriptor[] {
		return this.providers.slice(0);
	}

	getQuickOmniProvider(text: string): IQuickOmniProviderDescriptor | undefined {
		return text ? (first(this.providers, provider => startsWith(text, provider.prefix)) || undefined) : undefined;
	}
}

Registry.add(Extensions.Quickomni, new QuickOmniRegistry());
