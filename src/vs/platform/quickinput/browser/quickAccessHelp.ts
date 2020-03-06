/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickInputService, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { IQuickAccessProvider, IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { CancellationToken } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';

class HelpQuickAccessProvider implements IQuickAccessProvider {

	private readonly registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);

	async provide(service: IQuickInputService, token: CancellationToken): Promise<void> {
		const picks: QuickPickInput[] = [];

		for (const provider of this.registry.getQuickAccessProviders()) {
			for (const helpEntries of provider.helpEntries) {
				picks.push({
					label: helpEntries.prefix || provider.prefix,
					description: helpEntries.description
				});
			}
		}

		await service.pick(picks);
	}
}

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: HelpQuickAccessProvider,
	prefix: '?',
	helpEntries: [{ description: localize('quickAccessHelp', "Show all Quick Access Providers"), needsEditor: false }]
});
