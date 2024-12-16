/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHoverDelegate, IScopedHoverDelegate } from './hoverDelegate.js';
import { Lazy } from '../../../common/lazy.js';

const nullHoverDelegateFactory = () => ({
	get delay(): number { return -1; },
	dispose: () => { },
	showHover: () => { return undefined; },
});

let hoverDelegateFactory: (placement: 'mouse' | 'element', enableInstantHover: boolean) => IScopedHoverDelegate = nullHoverDelegateFactory;
const defaultHoverDelegateMouse = new Lazy<IHoverDelegate>(() => hoverDelegateFactory('mouse', false));
const defaultHoverDelegateElement = new Lazy<IHoverDelegate>(() => hoverDelegateFactory('element', false));

// TODO: Remove when getDefaultHoverDelegate is no longer used
export function setHoverDelegateFactory(hoverDelegateProvider: ((placement: 'mouse' | 'element', enableInstantHover: boolean) => IScopedHoverDelegate)): void {
	hoverDelegateFactory = hoverDelegateProvider;
}

// TODO: Refine type for use in new IHoverService interface
export function getDefaultHoverDelegate(placement: 'mouse' | 'element'): IHoverDelegate {
	if (placement === 'element') {
		return defaultHoverDelegateElement.value;
	}
	return defaultHoverDelegateMouse.value;
}

// TODO: Create equivalent in IHoverService
export function createInstantHoverDelegate(): IScopedHoverDelegate {
	// Creates a hover delegate with instant hover enabled.
	// This hover belongs to the consumer and requires the them to dispose it.
	// Instant hover only makes sense for 'element' placement.
	return hoverDelegateFactory('element', true);
}
