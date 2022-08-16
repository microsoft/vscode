/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IBufferMarkDetectionCapability, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
// Importing types is safe in any layer
// eslint-disable-next-line code-import-patterns
import type { IMarker, Terminal } from 'xterm-headless';

export class BufferMarkCapability implements IBufferMarkDetectionCapability {
	readonly type = TerminalCapability.BufferMarkDetection;
	private _customMarks: Map<string, IMarker> = new Map();
	private _genericMarks: IMarker[] = [];
	private readonly _onMarkAdded = new Emitter<{ id?: string; marker: IMarker; hidden?: boolean }>();
	readonly onMarkAdded = this._onMarkAdded.event;
	constructor(
		private readonly _terminal: Terminal,
		@ILogService private readonly _logService: ILogService
	) {
	}

	getMarks(): IMarker[] { return this._customMarks.size ? Array.from(this._customMarks.values()) : this._genericMarks; }
	addMark(id?: string, marker?: IMarker, hidden?: boolean): void {
		marker = marker || this._terminal.registerMarker();
		if (marker && id) {
			this._customMarks.set(id, marker);
			marker.onDispose(() => this._customMarks.delete(id));
		} else if (marker) {
			this._genericMarks.push(marker);
			marker.onDispose(() => this._genericMarks.filter(m => m !== marker));
		} else {
			this._logService.warn('No marker registered for ID:', id);
			return;
		}
		this._onMarkAdded.fire({ id, marker, hidden });
	}

	getMarker(id: string): IMarker | undefined {
		return this._customMarks.get(id);
	}
}
