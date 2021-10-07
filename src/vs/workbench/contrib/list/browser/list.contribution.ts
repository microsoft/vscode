/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { WorkbenchListAutomaticKeyboardNavigationKey } from 'vs/platform/list/browser/listService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

export const WorkbenchListSupportsKeyboardNavigation = new RawContextKey<boolean>('listSupportsKeyboardNavigation', true);
export const WorkbenchListAutomaticKeyboardNavigation = new RawContextKey<boolean>(WorkbenchListAutomaticKeyboardNavigationKey, true);

export class ListContext implements IWorkbenchContribution {

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		WorkbenchListSupportsKeyboardNavigation.bindTo(contextKeyService);
		WorkbenchListAutomaticKeyboardNavigation.bindTo(contextKeyService);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ListContext, LifecyclePhase.Starting);
