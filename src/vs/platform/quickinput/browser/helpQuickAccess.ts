/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { Registry } from '../../registry/common/platform.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { Extensions, IQuickAccessProvider, IQuickAccessProviderDescriptor, IQuickAccessRegistry } from '../common/quickAccess.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../common/quickInput.js';

interface IHelpQuickAccessPickItem extends IQuickPickItem {
	readonly prefix: string;
}

export class HelpQuickAccessProvider implements IQuickAccessProvider {

	static PREFIX = '?';

	private readonly registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) { }

	provide(picker: IQuickPick<IHelpQuickAccessPickItem, { useSeparators: true }>): IDisposable {
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
			const providerDescriptor = this.registry.getQuickAccessProvider(value.substr(HelpQuickAccessProvider.PREFIX.length), this.contextKeyService);
			if (providerDescriptor?.prefix && providerDescriptor.prefix !== HelpQuickAccessProvider.PREFIX) {
				this.quickInputService.quickAccess.show(providerDescriptor.prefix, { preserveValue: true });
			}
		}));

		// Fill in all providers
		picker.items = this.getQuickAccessProviders().filter(p => p.prefix !== HelpQuickAccessProvider.PREFIX);

		return disposables;
	}

	getQuickAccessProviders(): IHelpQuickAccessPickItem[] {
		const providers: IHelpQuickAccessPickItem[] = this.registry
			.getQuickAccessProviders(this.contextKeyService)
			.sort((providerA, providerB) => providerA.prefix.localeCompare(providerB.prefix))
			.flatMap(provider => this.createPicks(provider));

		return providers;
	}

	private createPicks(provider: IQuickAccessProviderDescriptor): IHelpQuickAccessPickItem[] {
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
}
