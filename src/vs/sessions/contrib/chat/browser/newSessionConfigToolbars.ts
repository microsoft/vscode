/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Menus } from '../../../browser/menus.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';

/** Creates the provider-owned control toolbar shared by New Session configuration surfaces. */
export function createNewSessionControlToolbar(container: HTMLElement, instantiationService: IInstantiationService, ariaLabel?: string, hoverDelegate?: IHoverDelegate): MenuWorkbenchToolBar {
	return instantiationService.createInstance(MenuWorkbenchToolBar, container, Menus.NewSessionControl, {
		ariaLabel,
		hoverDelegate,
		hiddenItemStrategy: HiddenItemStrategy.NoHide,
	});
}
