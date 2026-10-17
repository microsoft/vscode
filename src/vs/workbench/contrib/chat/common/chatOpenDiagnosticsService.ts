/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { markChat } from './chatPerf.js';

export type ChatOpenSurface = 'agentsWindow' | 'editor' | 'panel';
export type ChatOpenMilestone = 'selectionHandled' | 'contentRequested' | 'contentReceived' | 'replayDone' | 'published' | 'modelAttached' | 'firstRender';
type ChatOpenOutcome = 'completed' | 'cancelled' | 'failed' | 'hidden';

/** Local diagnostics for one host's load of a chat. Disposing it ends the load. */
export interface IChatOpen extends IDisposable {
	mark(milestone: ChatOpenMilestone): void;
	complete(visible?: boolean): void;
	fail(error: unknown): void;
	end(): void;
}

export interface IChatOpenDiagnosticsService {
	readonly _serviceBrand: undefined;

	/** Starts diagnostics for a host's load; the host ends them, and cancellation or disposal also ends them. */
	startOpen(surface: ChatOpenSurface, resource: URI, token: CancellationToken, alreadyShown?: boolean): IChatOpen;
	/** Records a milestone of the loads of the chat in flight; shared loading code never starts or ends a load. */
	mark(resource: URI, milestone: ChatOpenMilestone): void;
	/** Records whether the chat model was in memory when the loads of the chat in flight requested it. */
	setModelWasLoaded(resource: URI, loaded: boolean): void;
}

export const IChatOpenDiagnosticsService = createDecorator<IChatOpenDiagnosticsService>('chatOpenDiagnosticsService');

class ChatOpen extends Disposable implements IChatOpen {
	private readonly startTime = Date.now();
	private ended = false;
	private outcome: ChatOpenOutcome | undefined;
	modelWasLoaded: boolean | undefined;

	constructor(
		private readonly surface: ChatOpenSurface,
		private readonly resource: URI,
		private readonly alreadyShown: boolean,
		token: CancellationToken,
		onDidEnd: () => void,
		private readonly logService: ILogService,
	) {
		super();
		markChat(resource, 'open/start');
		this.trace('start');
		this._register(toDisposable(onDidEnd));
		this._register(token.onCancellationRequested(() => this.dispose()));
	}

	private trace(milestone: string): void {
		this.logService.trace(`[ChatOpen] ${this.surface} ${milestone} +${this.elapsed()}ms resource=${this.resource.toString()}`);
	}

	private elapsed(): number {
		return Math.max(0, Date.now() - this.startTime);
	}

	mark(milestone: ChatOpenMilestone): void {
		if (!this.ended) {
			markChat(this.resource, `open/${milestone}`);
			this.trace(milestone);
		}
	}

	complete(visible = true): void {
		if (!this.ended && !this.outcome) {
			markChat(this.resource, 'open/loaded');
			this.trace('loaded');
			this.outcome = visible ? 'completed' : 'hidden';
		}
	}

	fail(error: unknown): void {
		if (!this.ended && !this.outcome) {
			this.outcome = isCancellationError(error) ? 'cancelled' : 'failed';
		}
	}

	end(): void {
		this.dispose();
	}

	override dispose(): void {
		if (!this.ended) {
			this.ended = true;
			this.logService.info(`[ChatOpen] ${this.surface} ${this.outcome ?? 'cancelled'} total=${this.elapsed()}ms modelWasLoaded=${this.modelWasLoaded} alreadyShown=${this.alreadyShown}`);
		}
		super.dispose();
	}
}

export class ChatOpenDiagnosticsService extends Disposable implements IChatOpenDiagnosticsService {
	declare readonly _serviceBrand: undefined;

	private readonly _opensByChat = new ResourceMap<Set<ChatOpen>>();

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const opens of [...this._opensByChat.values()]) {
				opens.forEach(open => open.dispose());
			}
			this._opensByChat.clear();
		}));
	}

	startOpen(surface: ChatOpenSurface, resource: URI, token: CancellationToken, alreadyShown = false): IChatOpen {
		const open: ChatOpen = new ChatOpen(surface, resource, alreadyShown, token, () => {
			const current = this._opensByChat.get(resource);
			if (current?.delete(open) && current.size === 0) {
				this._opensByChat.delete(resource);
			}
		}, this.logService);
		let opens = this._opensByChat.get(resource);
		if (!opens) {
			opens = new Set();
			this._opensByChat.set(resource, opens);
		}
		opens.add(open);
		if (token.isCancellationRequested) {
			open.dispose();
		}
		return open;
	}

	mark(resource: URI, milestone: ChatOpenMilestone): void {
		this._opensByChat.get(resource)?.forEach(open => open.mark(milestone));
	}

	setModelWasLoaded(resource: URI, loaded: boolean): void {
		this._opensByChat.get(resource)?.forEach(open => open.modelWasLoaded ??= loaded);
	}
}

registerSingleton(IChatOpenDiagnosticsService, ChatOpenDiagnosticsService, InstantiationType.Delayed);
