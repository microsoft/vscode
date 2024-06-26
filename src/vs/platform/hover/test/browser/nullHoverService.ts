/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import type { IHoverService } from 'vs/platform/hover/browser/hover';

export const NullHoverService: IHoverService = {
	_serviceBrand: undefined,
	hideHover: () => undefined,
	showHover: () => undefined,
	setupManagedHover: () => Disposable.None as any,
	showAndFocusLastHover: () => undefined,
	showManagedHover: () => undefined
};
