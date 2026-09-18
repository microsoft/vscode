/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemProvider } from '../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../base/browser/ui/actionbar/actionViewItems.js';
import { ClickAnimation } from '../../base/browser/ui/animations/animations.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../platform/actions/common/actions.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ARCHIVE_SESSION_COMMAND_ID } from '../common/sessionCommands.js';

export function getSessionArchiveActionViewItemOptions(options: IActionViewItemOptions, configurationService: IConfigurationService): IMenuEntryActionViewItemOptions {
	return {
		...options,
		get onClickAnimation() {
			return configurationService.getValue<boolean>(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING)
				? ClickAnimation.Confetti
				: undefined;
		}
	};
}

export function createSessionActionViewItemProvider(instantiationService: IInstantiationService, configurationService: IConfigurationService): IActionViewItemProvider {
	return (action, options) => {
		if (action instanceof MenuItemAction && action.id === ARCHIVE_SESSION_COMMAND_ID) {
			return instantiationService.createInstance(MenuEntryActionViewItem, action, getSessionArchiveActionViewItemOptions(options, configurationService));
		}
		return undefined;
	};
}
