/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService, LogLevel } from '../../../../../platform/log/common/log.js';

export type ChatLayoutTraceMethod = 'renderElement' | 'disposeElement' | 'renderChatTreeItem' | 'doNextProgressiveRender' | 'getNextProgressiveRenderContent';

interface ILayoutTraceCount {
	count: number;
	firstIndex?: number;
	lastIndex?: number;
	readonly samples: string[];
}

/** Bounded layout diagnostics, including when a busy renderer cannot run timers. */
export class ChatLayoutTrace extends Disposable {
	private static nextId = 0;
	private readonly id = ++ChatLayoutTrace.nextId;
	private readonly counts = new Map<ChatLayoutTraceMethod, ILayoutTraceCount>();
	private startedAt = 0;
	private readonly scheduler = this._register(new RunOnceScheduler(() => this.flush(), 1000));

	constructor(private readonly now: () => number, private readonly logService: ILogService) {
		super();
	}

	trace(method: ChatLayoutTraceMethod, message: () => string, index?: number): void {
		if (this._store.isDisposed || this.logService.getLevel() !== LogLevel.Trace) {
			return;
		}
		const now = this.now();
		if (this.counts.size && now - this.startedAt >= 1000) {
			this.flush();
		}
		if (!this.counts.size) {
			this.startedAt = now;
			this.scheduler.schedule();
		}
		let entry = this.counts.get(method);
		if (!entry) {
			entry = { count: 0, samples: [] };
			this.counts.set(method, entry);
		}
		entry.count++;
		if (index !== undefined) {
			entry.firstIndex = Math.min(entry.firstIndex ?? index, index);
			entry.lastIndex = Math.max(entry.lastIndex ?? index, index);
		}
		if (entry.samples.length < 2) {
			entry.samples.push(message().slice(0, 180));
		}
	}

	private flush(): void {
		this.scheduler.cancel();
		if (this.counts.size && this.logService.getLevel() === LogLevel.Trace) {
			this.logService.trace(`ChatListItemRenderer#layout: renderer=${this.id} elapsedMs=${Math.round(this.now() - this.startedAt)} ${JSON.stringify(Object.fromEntries(this.counts))}`);
		}
		this.counts.clear();
	}

	override dispose(): void {
		this.flush();
		super.dispose();
	}
}
