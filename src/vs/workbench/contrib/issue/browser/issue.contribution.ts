/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { IssueFormService } from './issueFormService.js';
import { BrowserIssueService } from './issueService.js';
import './issueTroubleshoot.js';
import { IIssueFormService, IWorkbenchIssueService } from '../common/issue.js';
import { BaseIssueContribution } from '../common/issue.contribution.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';


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
