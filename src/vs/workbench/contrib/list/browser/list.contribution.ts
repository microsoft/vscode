/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class ListContext implements IWorkbenchContribution {

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		contextKeyService.createKey<boolean>('listSupportsTypeNavigation', true);

		// @deprecated in favor of listSupportsTypeNavigation
		contextKeyService.createKey('listSupportsKeyboardNavigation', true);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ListContext, 'ListContext', LifecyclePhase.Starting);
