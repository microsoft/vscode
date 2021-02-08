/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { isString } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CLIOutput, IExtensionGalleryService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementCLIService } from 'vs/platform/extensionManagement/common/extensionManagementCLIService';
import { getExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { canExecuteOnWorkspace } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { IExtensionManifest } from 'vs/workbench/workbench.web.api';


// this class contains the commands that the CLI server is reying on

CommandsRegistry.registerCommand('_remoteCLI.openExternal', function (accessor: ServicesAccessor, uri: UriComponents | string) {
	const openerService = accessor.get(IOpenerService);
	openerService.open(isString(uri) ? uri : URI.revive(uri), { openExternal: true, allowTunneling: true });
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
	const remoteExtensionManagementService = extensionManagementServerService.remoteExtensionManagementServer?.extensionManagementService;
	if (!remoteExtensionManagementService) {
		return;
	}

	const cliService = instantiationService.createChild(new ServiceCollection([IExtensionManagementService, remoteExtensionManagementService])).createInstance(RemoteExtensionCLIManagementService);

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

class RemoteExtensionCLIManagementService extends ExtensionManagementCLIService {

	private _location: string | undefined;

	constructor(
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IProductService private readonly productService: IProductService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@ILocalizationsService localizationsService: ILocalizationsService,
		@ILabelService labelService: ILabelService,
		@IWorkbenchEnvironmentService envService: IWorkbenchEnvironmentService
	) {
		super(extensionManagementService, extensionGalleryService, localizationsService);

		const remoteAuthority = envService.remoteAuthority;
		this._location = remoteAuthority ? labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority) : undefined;
	}

	protected get location(): string | undefined {
		return this._location;
	}

	protected validateExtensionKind(manifest: IExtensionManifest, output: CLIOutput): boolean {
		if (!canExecuteOnWorkspace(manifest, this.productService, this.configurationService)) {
			output.log(localize('cannot be installed', "Cannot install the '{0}' extension because it is declared to not run in this setup.", getExtensionId(manifest.publisher, manifest.name)));
			return false;
		}
		return true;
	}
}
