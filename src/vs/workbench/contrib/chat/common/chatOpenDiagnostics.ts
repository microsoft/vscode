/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { markChat } from './chatPerf.js';

type ChatOpenSurface = 'agentsWindow' | 'editor' | 'panel';
type ChatOpenOutcome = 'completed' | 'cancelled' | 'failed' | 'hidden';
type ChatOpenMilestone = 'selectionHandled' | 'contentRequested' | 'contentReceived' | 'replayDone' | 'published' | 'modelAttached' | 'firstRender';

/** Local diagnostics for one host's load, independent of Agents-window session-open telemetry. */
export interface IChatOpen extends IDisposable {
	mark(milestone: ChatOpenMilestone): void;
	complete(visible?: boolean): void;
	fail(error: unknown): void;
	end(): void;
}

const opensByChat = new ResourceMap<Set<ChatOpenDiagnostics>>();

class ChatOpenDiagnostics extends Disposable implements IChatOpen {
	private readonly startTime = Date.now();
	private ended = false;
	private outcome: ChatOpenOutcome | undefined;
	modelWasLoaded: boolean | undefined;

	constructor(
		private readonly surface: ChatOpenSurface,
		private readonly resource: URI,
		private readonly logService: ILogService,
		token: CancellationToken,
		private readonly alreadyShown: boolean,
	) {
		super();
		let opens = opensByChat.get(resource);
		if (!opens) {
			opens = new Set();
			opensByChat.set(resource, opens);
		}
		opens.add(this);
		this._register(toDisposable(() => {
			const current = opensByChat.get(resource);
			if (current?.delete(this) && current.size === 0) {
				opensByChat.delete(resource);
			}
		}));
		markChat(resource, 'open/start');
		this.trace('start');
		this._register(token.onCancellationRequested(() => this.dispose()));
		if (token.isCancellationRequested) {
			this.dispose();
		}
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

/** The host starts and ends diagnostics in its load function; cancellation also releases shared milestone tracking. */
export function startChatOpen(surface: ChatOpenSurface, resource: URI, logService: ILogService, token: CancellationToken, alreadyShown = false): IChatOpen {
	return new ChatOpenDiagnostics(surface, resource, logService, token, alreadyShown);
}

/** Shared loading code records milestones without owning the host's lifetime. */
export function markChatOpen(resource: URI, milestone: ChatOpenMilestone): void {
	opensByChat.get(resource)?.forEach(open => open.mark(milestone));
}

export function setChatOpenModelWasLoaded(resource: URI, loaded: boolean): void {
	opensByChat.get(resource)?.forEach(open => open.modelWasLoaded ??= loaded);
}
