/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';

/**
 * Sets up a recreating start marker which is resilient to prompts that clear/re-render (eg. transient
 * or powerlevel10k style prompts). The marker is recreated at the cursor position whenever the
 * existing marker is disposed. The caller is responsible for adding the startMarker to the store.
 */
export function setupRecreatingStartMarker(
	xterm: { raw: { registerMarker(): IXtermMarker | undefined } },
	startMarker: MutableDisposable<IXtermMarker>,
	fire: (marker: IXtermMarker | undefined) => void,
	store: DisposableStore,
	log?: (message: string) => void,
): void {
	const markerListener = new MutableDisposable<IDisposable>();
	const recreateStartMarker = () => {
		if (store.isDisposed) {
			return;
		}
		const marker = xterm.raw.registerMarker();
		startMarker.value = marker ?? undefined;
		fire(marker);
		if (!marker) {
			markerListener.clear();
			return;
		}
		markerListener.value = marker.onDispose(() => {
			log?.('Start marker was disposed, recreating');
			recreateStartMarker();
		});
	};
	recreateStartMarker();
	store.add(toDisposable(() => {
		markerListener.dispose();
		// TODO@meganrogge !!! does this cause disposables to be leaked?
		// Don't clear the start marker on disposal - we want it to persist
		// so terminal UI parts can still access it
		console.log('strategy disposed but keeping start marker');
		// Don't fire undefined marker event - keep the last valid marker
	}));
	// We don't register startMarker with the store to prevent it from being auto-disposed
}
