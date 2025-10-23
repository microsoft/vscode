/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IManagedHoverContent, IManagedHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import type { IHoverService } from '../../browser/hover.js';

export const NullHoverService: IHoverService = {
	_serviceBrand: undefined,
	hideHover: () => undefined,
	showInstantHover: () => undefined,
	showDelayedHover: () => undefined,
	setupDelayedHover: () => Disposable.None,
	setupDelayedHoverAtMouse: () => Disposable.None,
	setupManagedHover: () => ({
		dispose: () => { },
		show: (focus?: boolean) => { },
		hide: () => { },
		update: (tooltip: IManagedHoverContent, options?: IManagedHoverOptions) => { }
	}),
	showAndFocusLastHover: () => undefined,
	showManagedHover: () => undefined
};
