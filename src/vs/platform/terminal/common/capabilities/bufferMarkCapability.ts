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
	readonly marks: Map<string, IMarker> = new Map();
	private readonly _onMarkAdded = new Emitter<{ id: string; marker: IMarker; hidden?: boolean }>();
	readonly onMarkAdded = this._onMarkAdded.event;
	constructor(
		private readonly _terminal: Terminal,
		@ILogService private readonly _logService: ILogService
	) {
	}
	addMark(id: string, marker?: IMarker, hidden?: boolean): void {
		marker = marker || this._terminal.registerMarker();
		if (marker) {
			this.marks.set(id, marker);
		} else {
			this._logService.warn('No marker registered for ID:', id);
		}
	}

	getMarker(id: string): IMarker | undefined {
		return this.marks.get(id);
	}
}
