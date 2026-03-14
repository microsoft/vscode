/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../../base/common/async.js';
import { DisposableStore, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';

/**
 * Picks the best start marker for output capture: prefer non-disposed over disposed,
 * then earliest line.
 */
export function getPreferredOutputStartMarker(
	startMarker: IXtermMarker | undefined,
	commandMarker: IXtermMarker | undefined,
	executedMarker: IXtermMarker | undefined,
	log?: (message: string) => void,
): IXtermMarker | undefined {
	let best: IXtermMarker | undefined;
	for (const marker of [startMarker, commandMarker, executedMarker]) {
		if (!marker || marker.line < 0) {
			continue;
		}
		if (!best || (!marker.isDisposed && best.isDisposed) || (!best.isDisposed === !marker.isDisposed && marker.line < best.line)) {
			best = marker;
		}
	}
	if (best && best !== startMarker) {
		log?.(`Using ${best === commandMarker ? 'command' : 'executed'} marker as output start (line ${best.line})`);
	}
	return best;
}

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
	let earliestStartLine = startMarker.value && startMarker.value.line >= 0 ? startMarker.value.line : undefined;
	const recreateStartMarker = () => {
		if (store.isDisposed) {
			return;
		}
		const marker = xterm.raw.registerMarker();
		if (!marker) {
			log?.('Failed to create start marker');
			markerListener.clear();
			if (!startMarker.value) {
				fire(undefined);
			}
			return;
		}

		const candidateLine = marker.line >= 0 ? marker.line : undefined;
		if (earliestStartLine !== undefined && candidateLine !== undefined && candidateLine > earliestStartLine) {
			log?.(`Start marker recreation at line ${candidateLine} is past earliest known line ${earliestStartLine}, skipping`);
			if (startMarker.value && (startMarker.value.isDisposed || startMarker.value.line < 0)) {
				startMarker.clear();
				fire(undefined);
			}
		} else {
			startMarker.value = marker;
			fire(marker);
			if (candidateLine !== undefined) {
				earliestStartLine = earliestStartLine === undefined ? candidateLine : Math.min(earliestStartLine, candidateLine);
			}
		}

		// Always listen even on rejected markers so the chain keeps running
		markerListener.value = marker.onDispose(() => {
			log?.('Start marker was disposed, recreating');
			recreateStartMarker();
		});
	};
	recreateStartMarker();
	store.add(toDisposable(() => {
		markerListener.dispose();
		startMarker.clear();
		fire(undefined);
	}));
	store.add(startMarker);
}

export function createAltBufferPromise(
	xterm: { raw: { buffer: { active: unknown; alternate: unknown; onBufferChange: (callback: () => void) => IDisposable } } },
	store: DisposableStore,
	log?: (message: string) => void,
): Promise<void> {
	const deferred = new DeferredPromise<void>();
	const complete = () => {
		if (!deferred.isSettled) {
			log?.('Detected alternate buffer entry');
			deferred.complete();
		}
	};

	if (xterm.raw.buffer.active === xterm.raw.buffer.alternate) {
		complete();
	} else {
		store.add(xterm.raw.buffer.onBufferChange(() => {
			if (xterm.raw.buffer.active === xterm.raw.buffer.alternate) {
				complete();
			}
		}));
	}

	return deferred.p;
}
