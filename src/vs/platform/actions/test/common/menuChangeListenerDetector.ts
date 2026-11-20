/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MenuRegistry } from '../../common/actions.js';

/** The number of listeners of `MenuRegistry.onDidChangeMenu`. */
export function getMenuChangeListenerCount(): number {
	// The registry only exposes the event, so read the size of the emitter behind it.
	return (MenuRegistry as unknown as { readonly _onDidChangeMenu: { readonly _size: number } })._onDidChangeMenu._size;
}

/**
 * Menus that a suite created and did not dispose, for the isolation check in `vs/base/test/browser/isolationCheck.ts`.
 *
 * Every menu that `IMenuService` creates listens to `MenuRegistry.onDidChangeMenu` until it is disposed. A leaked menu keeps
 * rebuilding its actions, and the toolbar that shows them, whenever a later suite registers a menu item, so one suite's toolbar
 * can take focus or change layout in another suite's test.
 */
export const menuChangeListenerDetector = {
	kind: 'menuListeners',
	snapshot: (): number => getMenuChangeListenerCount(),
	check: (before: number): string[] => {
		const added = getMenuChangeListenerCount() - before;
		return added > 0 ? [`left ${added} MenuRegistry.onDidChangeMenu listener(s), from menus that were not disposed`] : [];
	},
};
