/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHoverDelegate } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { Lazy } from 'vs/base/common/lazy';

let hoverDelegateFactory: (placement: 'mouse' | 'element', enableInstantHover: boolean) => IHoverDelegate;
const defaultHoverDelegateMouse = new Lazy<IHoverDelegate>(() => hoverDelegateFactory('mouse', false));
const defaultHoverDelegateElement = new Lazy<IHoverDelegate>(() => hoverDelegateFactory('element', false));

export function setHoverDelegateFactory(hoverDelegateProvider: ((placement: 'mouse' | 'element', enableInstantHover: boolean) => IHoverDelegate)): void {
	hoverDelegateFactory = hoverDelegateProvider;
}

export function getDefaultHoverDelegate(placement: 'mouse' | 'element', enableInstantHover?: true): IHoverDelegate {
	if (enableInstantHover) {
		return hoverDelegateFactory(placement, true);
	}

	if (placement === 'element') {
		return defaultHoverDelegateElement.value;
	}
	return defaultHoverDelegateMouse.value;
}
