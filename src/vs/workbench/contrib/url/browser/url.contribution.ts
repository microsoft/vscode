/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, MenuRegistry, Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ExternalUriResolverContribution } from './externalUriResolver.js';
import { manageTrustedDomainSettingsCommand } from './trustedDomains.js';
import { TrustedDomainsFileSystemProvider } from './trustedDomainsFileSystemProvider.js';
import { OpenerValidatorContributions } from './trustedDomainsValidator.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { ITrustedDomainService, TrustedDomainService } from './trustedDomainService.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

class OpenUrlAction extends Action2 {

	static readonly STORAGE_KEY = 'workbench.action.url.openUrl.lastInput';

	constructor() {
		super({
			id: 'workbench.action.url.openUrl',
			title: localize2('openUrl', 'Open URL'),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const urlService = accessor.get(IURLService);
		const storageService = accessor.get(IStorageService);

		const value = storageService.get(OpenUrlAction.STORAGE_KEY, StorageScope.WORKSPACE, '');

		return quickInputService.input({ prompt: localize('urlToOpen', "URL to open"), value }).then(input => {
			if (input) {
				const uri = URI.parse(input);
				urlService.open(uri, { originalUrl: input });
				storageService.store(OpenUrlAction.STORAGE_KEY, input, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			}
		});
	}
}

registerAction2(OpenUrlAction);

/**
 * Trusted Domains Contribution
 */

CommandsRegistry.registerCommand(manageTrustedDomainSettingsCommand);
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: manageTrustedDomainSettingsCommand.id,
		title: manageTrustedDomainSettingsCommand.description.description
	}
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	OpenerValidatorContributions,
	LifecyclePhase.Restored
);
registerWorkbenchContribution2(
	TrustedDomainsFileSystemProvider.ID,
	TrustedDomainsFileSystemProvider,
	WorkbenchPhase.BlockRestore // registration only
);
registerWorkbenchContribution2(
	ExternalUriResolverContribution.ID,
	ExternalUriResolverContribution,
	WorkbenchPhase.BlockRestore // registration only
);


const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.trustedDomains.promptInTrustedWorkspace': {
			scope: ConfigurationScope.APPLICATION,
			type: 'boolean',
			default: false,
			description: localize('workbench.trustedDomains.promptInTrustedWorkspace', "When enabled, trusted domain prompts will appear when opening links in trusted workspaces.")
		}
	}
});

registerSingleton(ITrustedDomainService, TrustedDomainService, InstantiationType.Delayed);
