/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../base/common/observable.js';
import { IAquariumService, IMountedToggleHandle } from '../../aquarium/browser/aquariumOverlay.js';

/**
 * Phone implementation of {@link IAquariumService}. The aquarium is a desktop
 * easter egg drawn behind the new-session composer; on a phone it costs
 * screen space and battery, so the phone mounts no toggle and never shows it.
 * The new-session composer requires the service in its constructor, which is
 * why a null implementation exists rather than the service being absent.
 */
export class MobileNullAquariumService extends Disposable implements IAquariumService {

	declare readonly _serviceBrand: undefined;

	readonly actionVisible: IObservable<boolean> = constObservable(false);

	mountToggle(_parent: HTMLElement): IMountedToggleHandle {
		return { setHostVisible: () => { }, dispose: () => { } };
	}

	toggleActionVisibility(): boolean {
		return false;
	}

	simulateStreak(_count: number, _alive: boolean): void { }
}
