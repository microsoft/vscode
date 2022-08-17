/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IBufferMark, IBufferMarkDetectionCapability, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
// Importing types is safe in any layer
// eslint-disable-next-line code-import-patterns
import type { IMarker, Terminal } from 'xterm-headless';

export class BufferMarkCapability implements IBufferMarkDetectionCapability {

	readonly type = TerminalCapability.BufferMarkDetection;

	private _marks: Map<string, IMarker> = new Map();

	private _anonymousMarks: IMarker[] = [];
	private readonly _onMarkAdded = new Emitter<{ id?: string; marker: IMarker; hidden?: boolean; height?: number }>();
	readonly onMarkAdded = this._onMarkAdded.event;
	private readonly _onDidRequestMarkDecoration = new Emitter<IBufferMark>();
	readonly onDidRequestMarkDecoration = this._onMarkAdded.event;

	constructor(
		private readonly _terminal: Terminal,
		@ILogService private readonly _logService: ILogService
	) {
	}
	marks(): IMarker[] { return Array.from(this._marks.values()).concat(this._anonymousMarks); }
	addMark(id?: string, marker?: IMarker, hidden?: boolean): void {
		marker = marker || this._terminal.registerMarker();
		if (!marker) {
			return;
		}
		if (id) {
			this._marks.set(id, marker);
			marker.onDispose(() => this._marks.delete(id));
		} else {
			this._anonymousMarks.push(marker);
			marker.onDispose(() => this._anonymousMarks.filter(m => m !== marker));
		}
		this._onMarkAdded.fire({ id, marker, hidden });
		this._logService.trace('Added mark', id, marker.line);
	}

	getMark(id: string): IMarker | undefined {
		this._logService.trace('Got mark', id, this._marks.get(id));
		return this._marks.get(id);
	}

	scrollToMarkAndDecorate(startMarkId: string, endMarkId?: string, highlight?: boolean): void {
		const startMarker = this.getMark(startMarkId);
		const endMarker = endMarkId ? this.getMark(endMarkId) : startMarker;
		if (!startMarker) {
			return;
		}
		this._terminal.scrollToLine(startMarker.line);
		if (highlight) {
			this._onDidRequestMarkDecoration.fire({ id: startMarkId, marker: startMarker, endMarker });
		}
	}
}
