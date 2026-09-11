/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemProvider } from '../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../base/browser/ui/actionbar/actionViewItems.js';
import { ClickAnimation } from '../../base/browser/ui/animations/animations.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ARCHIVE_SESSION_COMMAND_ID } from '../common/sessionCommands.js';

export const SESSIONS_ARCHIVE_SESSION_CONFETTI_SETTING = 'sessions.archiveSessionConfetti';

export function getSessionArchiveActionViewItemOptions(options: IActionViewItemOptions, configurationService: IConfigurationService): IMenuEntryActionViewItemOptions | undefined {
	return configurationService.getValue<boolean>(SESSIONS_ARCHIVE_SESSION_CONFETTI_SETTING)
		? { ...options, onClickAnimation: ClickAnimation.Confetti }
		: undefined;
}

export function createSessionActionViewItemProvider(instantiationService: IInstantiationService, configurationService: IConfigurationService): IActionViewItemProvider {
	return (action, options) => {
		if (action instanceof MenuItemAction && action.id === ARCHIVE_SESSION_COMMAND_ID) {
			const archiveOptions = getSessionArchiveActionViewItemOptions(options, configurationService);
			if (archiveOptions) {
				return instantiationService.createInstance(MenuEntryActionViewItem, action, archiveOptions);
			}
		}
		return undefined;
	};
}
