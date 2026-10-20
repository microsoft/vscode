/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IManagedHover, IManagedHoverContentOrFactory } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

export function setupNewChatPickerHover(hoverService: IHoverService, target: HTMLElement, content: IManagedHoverContentOrFactory): IManagedHover {
	return hoverService.setupManagedHover({
		delay: 0,
		placement: 'element',
		showHover: (options, focus) => hoverService.showInstantHover({
			...options,
			appearance: { ...options.appearance, compact: true, skipFadeInAnimation: true },
			persistence: { hideOnKeyDown: true },
		}, focus),
	}, target, content);
}
