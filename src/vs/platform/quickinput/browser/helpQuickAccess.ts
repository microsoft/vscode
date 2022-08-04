/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Extensions, IQuickAccessProvider, IQuickAccessRegistry } from 'vs/platform/quickinput/common/quickAccess';
import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';

interface IHelpQuickAccessPickItem extends IQuickPickItem {
	prefix: string;
}

export class HelpQuickAccessProvider implements IQuickAccessProvider {

	static PREFIX = '?';

	private readonly registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) { }

	provide(picker: IQuickPick<IHelpQuickAccessPickItem>): IDisposable {
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
			const providerDescriptor = this.registry.getQuickAccessProvider(value.substr(HelpQuickAccessProvider.PREFIX.length));
			if (providerDescriptor && providerDescriptor.prefix && providerDescriptor.prefix !== HelpQuickAccessProvider.PREFIX) {
				this.quickInputService.quickAccess.show(providerDescriptor.prefix, { preserveValue: true });
			}
		}));

		// Fill in all providers
		picker.items = this.getQuickAccessProviders();

		return disposables;
	}

	private getQuickAccessProviders(): IHelpQuickAccessPickItem[] {
		const providers: IHelpQuickAccessPickItem[] = [];

		for (const provider of this.registry.getQuickAccessProviders().sort((providerA, providerB) => providerA.prefix.localeCompare(providerB.prefix))) {
			if (provider.prefix === HelpQuickAccessProvider.PREFIX) {
				continue; // exclude help which is already active
			}

			for (const helpEntry of provider.helpEntries) {
				const prefix = helpEntry.prefix || provider.prefix;
				const label = prefix || '\u2026' /* ... */;

				providers.push({
					prefix,
					label,
					keybinding: helpEntry.commandId ? this.keybindingService.lookupKeybinding(helpEntry.commandId) : undefined,
					ariaLabel: localize('helpPickAriaLabel', "{0}, {1}", label, helpEntry.description),
					description: helpEntry.description
				});
			}
		}

		return providers;
	}
}

