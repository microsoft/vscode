/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../../base/common/async.js';
import { DisposableStore, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';

interface IVimTerminalLike {
	readonly processName?: string;
	readonly title?: string;
	sendText(text: string, addNewLine: boolean): Promise<void> | void;
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

function _containsVimToken(value: string | undefined): boolean {
	if (!value) {
		return false;
	}
	return /(?:^|[^a-z0-9_])(n?vim|vi|view)(?:\.exe)?(?:$|[^a-z0-9_])/i.test(value);
}

export function shouldAutoExitVim(instance: IVimTerminalLike, commandLine: string): boolean {
	return _containsVimToken(instance.processName) || _containsVimToken(instance.title) || _containsVimToken(commandLine);
}

export async function tryAutoExitVim(instance: IVimTerminalLike, commandLine: string, log?: (message: string) => void): Promise<boolean> {
	if (!shouldAutoExitVim(instance, commandLine)) {
		return false;
	}

	try {
		log?.('Likely Vim state detected, sending "Esc :q Enter"');
		await Promise.resolve(instance.sendText('\x1b:q\r', false));
		return true;
	} catch (error) {
		log?.('Failed to send Vim exit sequence');
		return false;
	}
}
