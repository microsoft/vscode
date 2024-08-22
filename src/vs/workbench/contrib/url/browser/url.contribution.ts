/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri';
import { localize, localize2 } from '../../../../nls';
import { MenuId, MenuRegistry, Action2, registerAction2 } from '../../../../platform/actions/common/actions';
import { CommandsRegistry } from '../../../../platform/commands/common/commands';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput';
import { Registry } from '../../../../platform/registry/common/platform';
import { IURLService } from '../../../../platform/url/common/url';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions';
import { ExternalUriResolverContribution } from './externalUriResolver';
import { manageTrustedDomainSettingsCommand } from './trustedDomains';
import { TrustedDomainsFileSystemProvider } from './trustedDomainsFileSystemProvider';
import { OpenerValidatorContributions } from './trustedDomainsValidator';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation';
import { Categories } from '../../../../platform/action/common/actionCommonCategories';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from '../../../common/configuration';
import { ITrustedDomainService, TrustedDomainService } from './trustedDomainService';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions';

class OpenUrlAction extends Action2 {

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

		return quickInputService.input({ prompt: localize('urlToOpen', "URL to open") }).then(input => {
			if (input) {
				const uri = URI.parse(input);
				urlService.open(uri, { originalUrl: input });
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
