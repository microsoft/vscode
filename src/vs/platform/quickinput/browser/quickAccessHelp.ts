/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickPick, IQuickPickItem, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IQuickAccessProvider, IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { CancellationToken } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { once } from 'vs/base/common/functional';

interface IQuickAccessHelpPickItem extends IQuickPickItem {
	prefix: string;
}

class HelpQuickAccessProvider implements IQuickAccessProvider {

	private readonly registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);

	constructor(@IQuickInputService private readonly quickInputService: IQuickInputService) { }

	provide(picker: IQuickPick<IQuickAccessHelpPickItem>, token: CancellationToken): void {
		const disposables = new DisposableStore();
		once(token.onCancellationRequested)(() => disposables.dispose());

		// Open a picker with the selected value if picked
		disposables.add(picker.onDidAccept(() => {
			const items = picker.selectedItems;
			if (items.length === 1) {
				this.quickInputService.quickAccess.show(`${items[0].prefix} `);
			}
		}));

		// Fill in all providers separated by editor/global scope
		const { editorProviders, globalProviders } = this.getQuickAccessProviders();
		picker.items = [
			{ label: localize('globalCommands', "global commands"), type: 'separator' },
			...globalProviders,
			{ label: localize('editorCommands', "editor commands"), type: 'separator' },
			...editorProviders
		];

		picker.show();
	}

	private getQuickAccessProviders(): { editorProviders: IQuickAccessHelpPickItem[], globalProviders: IQuickAccessHelpPickItem[] } {
		const globalProviders: IQuickAccessHelpPickItem[] = [];
		const editorProviders: IQuickAccessHelpPickItem[] = [];

		for (const provider of this.registry.getQuickAccessProviders().sort((p1, p2) => p1.prefix.localeCompare(p2.prefix))) {
			for (const helpEntry of provider.helpEntries) {
				const prefix = helpEntry.prefix || provider.prefix;
				const label = prefix || '\u2026' /* ... */;

				(helpEntry.needsEditor ? editorProviders : globalProviders).push({
					prefix,
					label,
					description: helpEntry.description,
					ariaLabel: localize('entryAriaLabel', "{0}, picker help", label)
				});
			}
		}

		return { editorProviders, globalProviders };
	}
}

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: HelpQuickAccessProvider,
	prefix: '?',
	helpEntries: [{ description: localize('quickAccessHelp', "Show all Quick Access Providers"), needsEditor: false }]
});
