/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { RemoteExtensionCLIManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagementService';


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

	const instantiationService = accessor.get(IInstantiationService);
	const extensionManagementServerService = accessor.get(IExtensionManagementServerService);
	if (!extensionManagementServerService.remoteExtensionManagementServer) {
		return;
	}

	const cliService = instantiationService.createChild(new ServiceCollection([IExtensionManagementService, extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService])).createInstance(RemoteExtensionCLIManagementService);

	const lines: string[] = [];
	const output = { log: lines.push.bind(lines), error: lines.push.bind(lines) };

	if (args.list) {
		await cliService.listExtensions(!!args.list.showVersions, args.list.category, output);
	} else {
		const revive = (inputs: (string | UriComponents)[]) => inputs.map(input => isString(input) ? input : URI.revive(input));
		if (Array.isArray(args.install) && args.install.length) {
			try {
				await cliService.installExtensions(revive(args.install), [], true, !!args.force, output);
			} catch (e) {
				lines.push(e.message);
			}
		}
		if (Array.isArray(args.uninstall) && args.uninstall.length) {
			try {
				await cliService.uninstallExtensions(revive(args.uninstall), !!args.force, output);
			} catch (e) {
				lines.push(e.message);
			}
		}
	}
	return lines.join('\n');
});

