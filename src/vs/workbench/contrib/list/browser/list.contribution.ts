/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution, WorkbenchContributionInstantiation } from 'vs/workbench/common/contributions';

export class ListContext implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.listContext';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		contextKeyService.createKey<boolean>('listSupportsTypeNavigation', true);

		// @deprecated in favor of listSupportsTypeNavigation
		contextKeyService.createKey('listSupportsKeyboardNavigation', true);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution2(ListContext.ID, ListContext, WorkbenchContributionInstantiation.BlockStartup);
