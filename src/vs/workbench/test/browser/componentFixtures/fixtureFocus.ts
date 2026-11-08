/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../base/common/observable.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';
import { UserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionServiceImpl.js';

export function createFixtureUserInteractionService(overrideFocus = true, simulateHover = false): IUserInteractionService {
	if (overrideFocus) {
		return new MockUserInteractionService(true, simulateHover);
	}
	return new class extends UserInteractionService {
		override createHoverTracker(element: Element, store: DisposableStore) {
			return simulateHover ? constObservable(true) : super.createHoverTracker(element, store);
		}
	};
}

export function applyFixtureFocus(overrideFocus: boolean, target: { focus(): void }): void {
	if (overrideFocus) {
		target.focus();
	}
}
