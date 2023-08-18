/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IBufferMarkCapability, TerminalCapability, IMarkProperties } from 'vs/platform/terminal/common/capabilities/capabilities';
// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { IMarker, Terminal } from 'xterm-headless';

/**
 * Manages "marks" in the buffer which are lines that are tracked when lines are added to or removed
 * from the buffer.
 */
export class BufferMarkCapability extends Disposable implements IBufferMarkCapability {

	readonly type = TerminalCapability.BufferMarkDetection;

	private _idToMarkerMap: Map<string, IMarker> = new Map();
	private _anonymousMarkers: Map<number, IMarker> = new Map();

	private readonly _onMarkAdded = this._register(new Emitter<IMarkProperties>());
	readonly onMarkAdded = this._onMarkAdded.event;

	constructor(
		private readonly _terminal: Terminal
	) {
		super();
	}

	*markers(): IterableIterator<IMarker> {
		for (const m of this._idToMarkerMap.values()) {
			yield m;
		}
		for (const m of this._anonymousMarkers.values()) {
			yield m;
		}
	}

	addMark(properties?: IMarkProperties): void {
		const marker = properties?.marker || this._terminal.registerMarker();
		const id = properties?.id;
		if (!marker) {
			return;
		}
		if (id) {
			this._idToMarkerMap.set(id, marker);
			marker.onDispose(() => this._idToMarkerMap.delete(id));
		} else {
			this._anonymousMarkers.set(marker.id, marker);
			marker.onDispose(() => this._anonymousMarkers.delete(marker.id));
		}
		this._onMarkAdded.fire({ marker, id, hidden: properties?.hidden, hoverMessage: properties?.hoverMessage });
	}

	getMark(id: string): IMarker | undefined {
		return this._idToMarkerMap.get(id);
	}
}
