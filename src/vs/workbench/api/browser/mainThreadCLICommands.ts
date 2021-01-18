/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IExtensionManagementCLIService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';


// this class contains the command that the CLI server is reying on

CommandsRegistry.registerCommand('_remoteCLI.openExternal', function (accessor: ServicesAccessor, uri: UriComponents, options: { allowTunneling?: boolean }) {
	// TODO: discuss martin, ben where to put this
	const openerService = accessor.get(IOpenerService);
	openerService.open(URI.revive(uri), { openExternal: true, allowTunneling: options?.allowTunneling === true });
});

interface ManageExtensionsArgs {
	list?: { showVersions?: boolean, category?: string; };
	install?: (string | URI)[];
	uninstall?: string[];
	force?: boolean;
}

CommandsRegistry.registerCommand('_remoteCLI.manageExtensions', async function (accessor: ServicesAccessor, args: ManageExtensionsArgs) {

	const cliService = accessor.get(IExtensionManagementCLIService);

	const lines: string[] = [];
	const output = { log: lines.push.bind(lines), error: lines.push.bind(lines) };

	if (args.list) {
		await cliService.listExtensions(!!args.list.showVersions, args.list.category, output);
	} else {
		if (Array.isArray(args.install) && args.install.length) {
			try {
				await cliService.installExtensions(args.install, [], false, !!args.force, output);
			} catch (e) {
				lines.push(e.message);
			}
		}
		if (Array.isArray(args.uninstall) && args.uninstall.length) {
			try {
				await cliService.uninstallExtensions(args.uninstall, !!args.force, output);
			} catch (e) {
				lines.push(e.message);
			}
		}
	}
	return lines.join('\n');
});

