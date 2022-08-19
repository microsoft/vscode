/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IBufferMarkDetectionCapability, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
// Importing types is safe in any layer
// eslint-disable-next-line code-import-patterns
import type { IMarker, Terminal } from 'xterm-headless';

/**
 * Stores marks to be added to the buffer
 * anonymous marks are those that have no ID
 */
export class BufferMarkCapability implements IBufferMarkDetectionCapability {

	readonly type = TerminalCapability.BufferMarkDetection;

	private _idToMarkerMap: Map<string, IMarker> = new Map();
	private _anonymousMarkers: IMarker[] = [];

	private readonly _onMarkAdded = new Emitter<{ marker: IMarker; id?: string; hidden?: boolean }>();
	readonly onMarkAdded = this._onMarkAdded.event;

	constructor(
		private readonly _terminal: Terminal
	) {
	}

	markers(): IMarker[] { return Array.from(this._idToMarkerMap.values()).concat(this._anonymousMarkers); }

	addMark(id?: string, marker?: IMarker, hidden?: boolean): void {
		marker = marker || this._terminal.registerMarker();
		if (!marker) {
			return;
		}
		if (id) {
			this._idToMarkerMap.set(id, marker);
			marker.onDispose(() => this._idToMarkerMap.delete(id));
		} else {
			this._anonymousMarkers.push(marker);
			marker.onDispose(() => this._anonymousMarkers.filter(m => m !== marker));
		}
		this._onMarkAdded.fire({ marker, id, hidden });
	}

	getMark(id: string): IMarker | undefined {
		return this._idToMarkerMap.get(id);
	}
}
