/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addStandardDisposableListener } from '../../../../base/browser/dom.js';
import { IManagedHover, IManagedHoverContentOrFactory } from '../../../../base/browser/ui/hover/hover.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

export function setupNewChatPickerHover(hoverService: IHoverService, target: HTMLElement, content: IManagedHoverContentOrFactory): IManagedHover {
	const store = new DisposableStore();
	const hover = store.add(hoverService.setupManagedHover({
		delay: 0,
		placement: 'element',
		showHover: (options, focus) => hoverService.showInstantHover({
			...options,
			appearance: { ...options.appearance, compact: true, skipFadeInAnimation: true },
			persistence: { hideOnKeyDown: true },
		}, focus),
	}, target, content));
	store.add(addStandardDisposableListener(target, 'keydown', event => {
		if (event.equals(KeyCode.Escape)) {
			hover.hide();
		}
	}));
	return {
		...hover,
		dispose: () => store.dispose(),
	};
}
