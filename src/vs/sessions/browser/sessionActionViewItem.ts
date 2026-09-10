/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemProvider } from '../../base/browser/ui/actionbar/actionbar.js';
import { ClickAnimation } from '../../base/browser/ui/animations/animations.js';
import { MenuEntryActionViewItem } from '../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ARCHIVE_SESSION_COMMAND_ID } from '../common/sessionCommands.js';

export const SESSIONS_ARCHIVE_SESSION_CONFETTI_SETTING = 'sessions.archiveSessionConfetti';

export function createSessionActionViewItemProvider(instantiationService: IInstantiationService, configurationService: IConfigurationService): IActionViewItemProvider {
	return (action, options) => {
		if (action instanceof MenuItemAction && action.id === ARCHIVE_SESSION_COMMAND_ID && configurationService.getValue<boolean>(SESSIONS_ARCHIVE_SESSION_CONFETTI_SETTING)) {
			return instantiationService.createInstance(MenuEntryActionViewItem, action, { ...options, onClickAnimation: ClickAnimation.Confetti });
		}
		return undefined;
	};
}
