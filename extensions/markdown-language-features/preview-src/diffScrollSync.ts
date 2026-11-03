/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DiffScrollSyncData } from '../types/previewMessaging';

export class DiffScrollSyncManager {

	readonly #previewId = Math.random().toString(36).slice(2, 10);
	readonly #onIncomingScroll: (line: number) => void;

	#syncData: DiffScrollSyncData;
	readonly #channel: BroadcastChannel;
	#ignoreIncomingScrollUntil = 0;

	constructor(sync: DiffScrollSyncData, onIncomingScroll: (line: number) => void) {
		this.#onIncomingScroll = onIncomingScroll;
		this.#syncData = sync;
		this.#channel = new BroadcastChannel(sync.channelName);
		this.#channel.onmessage = (event) => {
			const { line, sender } = event.data;
			if (sender === this.#previewId) {
				return;
			}
			if (typeof line !== 'number' || isNaN(line)) {
				return;
			}

			const mappedLine = translateLineWithMappings(line, this.#syncData.lineMappings);
			this.#ignoreIncomingScrollUntil = Date.now() + 100;
			this.#onIncomingScroll(mappedLine);
		};
	}

	update(sync: DiffScrollSyncData): void {
		this.#syncData = sync;
	}

	broadcastScroll(line: number): void {
		if (!this.#channel || Date.now() < this.#ignoreIncomingScrollUntil) {
			return;
		}
		this.#channel.postMessage({ line, sender: this.#previewId });
	}
}

function translateLineWithMappings(line: number, mappings: readonly number[] | undefined): number {
	if (!mappings?.length) {
		return line;
	}
	const sourceLine = Math.floor(line);
	const progress = line - sourceLine;
	const mappedLine = mappings[sourceLine] ?? line;
	if (progress <= 0) {
		return Math.max(0, mappedLine);
	}
	const nextMappedLine = mappings[sourceLine + 1];
	if (typeof nextMappedLine !== 'number') {
		return Math.max(0, mappedLine + progress);
	}
	return Math.max(0, mappedLine + ((nextMappedLine - mappedLine) * progress));
}
