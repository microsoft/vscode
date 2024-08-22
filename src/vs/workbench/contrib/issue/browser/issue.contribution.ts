/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls';
import { CommandsRegistry } from '../../../../platform/commands/common/commands';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IProductService } from '../../../../platform/product/common/productService';
import { Registry } from '../../../../platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions';
import { IssueFormService } from './issueFormService';
import { BrowserIssueService } from './issueService';
import './issueTroubleshoot';
import { IIssueFormService, IWorkbenchIssueService } from '../common/issue';
import { BaseIssueContribution } from '../common/issue.contribution';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle';


class WebIssueContribution extends BaseIssueContribution {
	constructor(@IProductService productService: IProductService, @IConfigurationService configurationService: IConfigurationService) {
		super(productService, configurationService);
		Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
			properties: {
				'issueReporter.experimental.webReporter': {
					type: 'boolean',
					default: productService.quality !== 'stable',
					description: 'Enable experimental issue reporter for web.',
				},
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(WebIssueContribution, LifecyclePhase.Restored);

registerSingleton(IWorkbenchIssueService, BrowserIssueService, InstantiationType.Delayed);
registerSingleton(IIssueFormService, IssueFormService, InstantiationType.Delayed);

CommandsRegistry.registerCommand('_issues.getSystemStatus', (accessor) => {
	return nls.localize('statusUnsupported', "The --status argument is not yet supported in browsers.");
});
