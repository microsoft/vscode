/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import type { IHoverService } from '../../browser/hover.js';

export const NullHoverService: IHoverService = {
	_serviceBrand: undefined,
	hideHover: () => undefined,
	showInstantHover: () => undefined,
	showDelayedHover: () => undefined,
	setupDelayedHover: () => Disposable.None,
	setupDelayedHoverAtMouse: () => Disposable.None,
	setupManagedHover: () => Disposable.None as any,
	showAndFocusLastHover: () => undefined,
	showManagedHover: () => undefined
};
