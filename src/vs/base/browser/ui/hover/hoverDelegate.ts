/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHoverDelegate, IScopedHoverDelegate } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { Lazy } from 'vs/base/common/lazy';

const nullHoverDelegateFactory = () => ({
	get delay(): number { return -1; },
	dispose: () => { },
	showHover: () => { return undefined; },
});

let hoverDelegateFactory: (placement: 'mouse' | 'element', enableInstantHover: boolean) => IScopedHoverDelegate = nullHoverDelegateFactory;
const defaultHoverDelegateMouse = new Lazy<IHoverDelegate>(() => hoverDelegateFactory('mouse', false));
const defaultHoverDelegateElement = new Lazy<IHoverDelegate>(() => hoverDelegateFactory('element', false));

export function setHoverDelegateFactory(hoverDelegateProvider: ((placement: 'mouse' | 'element', enableInstantHover: boolean) => IScopedHoverDelegate)): void {
	hoverDelegateFactory = hoverDelegateProvider;
}

export function getDefaultHoverDelegate(placement: 'mouse' | 'element'): IHoverDelegate;
export function getDefaultHoverDelegate(placement: 'element', enableInstantHover: true): IScopedHoverDelegate;
export function getDefaultHoverDelegate(placement: 'mouse' | 'element', enableInstantHover?: boolean): IHoverDelegate | IScopedHoverDelegate {
	if (enableInstantHover) {
		// If instant hover is enabled, the consumer is responsible for disposing the hover delegate
		return hoverDelegateFactory(placement, true);
	}

	if (placement === 'element') {
		return defaultHoverDelegateElement.value;
	}
	return defaultHoverDelegateMouse.value;
}
