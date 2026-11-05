/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Owns the toggle button(s), the persisted on/off preference, and the active
 * aquarium. Hosts call {@link IAquariumService.mountToggle} to attach a button
 * as a child of their container; the active aquarium itself is mounted inside
 * the chat bar part so the chat input naturally paints on top of the water.
 */
export const IAquariumService = createDecorator<IAquariumService>('aquariumService');

export interface IAquariumService {
	readonly _serviceBrand: undefined;
	/** Whether the aquarium action is visible on its mounted hosts. */
	readonly actionVisible: IObservable<boolean>;

	/**
	 * Mount a toggle button into `parent`. Returns a handle that exposes a
	 * {@link IMountedToggleHandle.setHostVisible} hook so callers can keep the
	 * aquarium tied to their own visibility (e.g. a view pane). Disposing the
	 * handle removes the button and tears down the active aquarium if it was
	 * the last mount.
	 */
	mountToggle(parent: HTMLElement): IMountedToggleHandle;

	/** Toggles and persists the aquarium action visibility. */
	toggleActionVisibility(): boolean;

	/**
	 * Development/demo hook: force the persisted feeding streak into a specific
	 * state and refresh the toggle tooltip(s) live. When `alive` is false the
	 * streak is parked as a died/revivable streak and the revival prompt is
	 * offered (when an aquarium is active). A `count` of 0 clears the streak.
	 */
	simulateStreak(count: number, alive: boolean): void;
}

export interface IMountedToggleHandle extends IDisposable {
	/**
	 * Inform the service whether this mount's host is currently visible. The
	 * aquarium is only considered active when at least one mount is visible;
	 * when the last visible mount goes invisible the aquarium is disposed
	 * synchronously (no fade-out) so it cannot flash behind a sibling view.
	 * Hosts that don't care can leave this alone — mounts default to visible.
	 */
	setHostVisible(visible: boolean): void;
}
