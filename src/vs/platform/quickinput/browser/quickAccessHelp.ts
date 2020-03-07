/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickInput, IQuickPick, IQuickPickItem, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IQuickAccessProvider, IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { CancellationToken } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { once } from 'vs/base/common/functional';

class HelpQuickAccessProvider implements IQuickAccessProvider {

	private readonly registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);

	constructor(@IQuickInputService private readonly quickInputService: IQuickInputService) { }

	async provide(picker: IQuickPick<IQuickPickItem>, token: CancellationToken): Promise<void> {
		const picks: QuickPickInput[] = [];

		for (const provider of this.registry.getQuickAccessProviders()) {
			for (const helpEntries of provider.helpEntries) {
				picks.push({
					label: helpEntries.prefix || provider.prefix,
					description: helpEntries.description
				});
			}
		}

		const disposables = new DisposableStore();
		once(token.onCancellationRequested)(() => disposables.dispose());

		disposables.add(picker.onDidAccept(() => {
			const items = picker.selectedItems;
			if (items.length === 1) {
				this.quickInputService.quickAccess.show(items[0].label);
			}
		}));

		picker.items = picks;
		picker.show();
	}
}

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: HelpQuickAccessProvider,
	prefix: '?',
	helpEntries: [{ description: localize('quickAccessHelp', "Show all Quick Access Providers"), needsEditor: false }]
});
