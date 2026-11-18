/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { isSessionInProgressStatus, SessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { IChatSessionTranscriptSink, IChatSessionTranscriptSource } from '../../common/sessionObserver/chatSessionObserver.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { ChatModelProjector } from './chatModelTranscriptSource.js';

/** How often a cloud session is reloaded with no sign of new activity: while it works, and while it waits. */
export const CLOUD_BACKSTOP_MS = { working: 15_000, waiting: 5 * 60_000 } as const;

/**
 * Cloud agent sessions: their record lives on the server and reaches VS Code through the
 * session's content provider. A turn in flight streams into the session's model through the
 * provider's active response, so it is live while the source holds the model. A turn the
 * server starts later (a pull request comment, a follow-up from the web) reaches a model only
 * when it is loaded again, so the source reloads it when the sessions list shows new activity,
 * and on a backstop. Reloaded models mint new request IDs, so the projector keys events by
 * position and content. Lossy: the provider's own summary of the run, per-turn timestamps.
 */
export class CloudSessionTranscriptSource extends Disposable implements IChatSessionTranscriptSource {
	readonly id = 'cloud';
	readonly priority = 30;

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	canObserve(resource: URI): boolean {
		return resource.scheme === SessionType.CopilotCloud || resource.scheme === SessionType.CloudSandbox;
	}

	async observe(resource: URI, sink: IChatSessionTranscriptSink): Promise<IDisposable> {
		const store = new DisposableStore();
		const held = store.add(new MutableDisposable<DisposableStore>());
		let projector: ChatModelProjector | undefined;
		let model: IChatModel | undefined;
		let reloading: Promise<void> | undefined;

		const hold = async () => {
			const ref = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None, 'chatSessionObserver.cloud');
			if (!ref) {
				throw new Error(`No chat model for ${resource.toString()}`);
			}
			if (store.isDisposed) {
				ref.dispose();
				return;
			}
			const s = new DisposableStore();
			s.add(ref);
			const m = model = ref.object;
			const p = projector ??= new ChatModelProjector(m, sink, () => [], { indexIds: true });
			p.setModel(m);
			const scheduler = s.add(new RunOnceScheduler(() => p.flush(), 150));
			const responses = s.add(new DisposableMap<string>());
			const watchResponses = () => {
				for (const r of m.getRequests()) {
					if (r.response && !responses.has(r.id)) {
						responses.set(r.id, r.response.onDidChange(() => scheduler.schedule()));
					}
				}
			};
			watchResponses();
			s.add(m.onDidChange(() => {
				watchResponses();
				scheduler.schedule();
			}));
			s.add(m.onDidChangePendingRequests(() => scheduler.schedule()));
			held.value = s;
			p.flush();
		};

		// Releasing the model lets it go only once no one else holds it (an open editor keeps it
		// live anyway); disposal is asynchronous, and acquiring before it ends revives the old one.
		const reload = () => reloading ??= (async () => {
			try {
				if (model?.hasActiveRequest.get()) {
					return;
				}
				const old = model;
				const disposed = old ? Event.toPromise(Event.filter(this.chatService.onDidDisposeSession, e => e.sessionResources.some(r => isEqual(r, resource)))) : Promise.resolve();
				held.clear();
				await Promise.race([disposed, timeout(2_000)]);
				if (!store.isDisposed) {
					await hold();
				}
			} catch (e) {
				this.logService.warn(`[chatSessionObserver] reloading cloud session ${resource.toString()} failed`, e);
			} finally {
				reloading = undefined;
			}
		})();

		await hold();

		// New activity in the sessions list (a turn started or ended on the server) reloads at once.
		let seen = this.activityOf(resource);
		const soon = store.add(new RunOnceScheduler(() => void reload(), 1_000));
		store.add(this.agentSessionsService.model.onDidChangeSessions(() => {
			const now = this.activityOf(resource);
			if (now !== seen) {
				seen = now;
				soon.schedule();
			}
		}));
		const backstop = store.add(new RunOnceScheduler(() => {
			void reload().finally(() => backstop.schedule(this.isWorking(resource) ? CLOUD_BACKSTOP_MS.working : CLOUD_BACKSTOP_MS.waiting));
		}, this.isWorking(resource) ? CLOUD_BACKSTOP_MS.working : CLOUD_BACKSTOP_MS.waiting));
		backstop.schedule();

		sink.patchInfo({ fidelity: { reasoning: 'summary', toolOutput: 'truncated', diffs: 'perTurn', timestamps: 'perTurn', modelCalls: false, liveWithoutWidget: true, liveLatencyMs: 5_000 } });
		return toDisposable(() => store.dispose());
	}

	private activityOf(resource: URI): string {
		const s = this.agentSessionsService.model.getSession(resource);
		return s ? `${s.status}:${s.timing.lastRequestStarted ?? 0}:${s.timing.lastRequestEnded ?? 0}` : '';
	}

	private isWorking(resource: URI): boolean {
		const s = this.agentSessionsService.model.getSession(resource);
		return !!s && isSessionInProgressStatus(s.status);
	}
}
