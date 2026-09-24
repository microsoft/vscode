/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, markAsSingleton, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatProgress, IChatToolInvocation } from '../common/chatService/chatService.js';
import { ChatAgentLocation, ChatPermissionLevel } from '../common/constants.js';
import { IChatProgressResponseContent } from '../common/model/chatModel.js';

export type ChatUserInteractionKind = 'turn' | 'fork';
export type ChatUserInteractionTimingResult = 'success' | 'cancelled' | 'error' | 'completedWithoutProgress' | 'notDispatched' | 'navigated' | 'hidden' | 'timedOut' | 'disposed';

export interface IChatUserInteractionTimer {
	readonly id: number;
	readonly kind: ChatUserInteractionKind;
	readonly startedAt: number;
}

export interface IChatUserInteractionTelemetryContext {
	readonly requestId?: string;
	readonly chatSessionId?: string;
	readonly agent?: string;
	readonly agentExtensionId?: string;
	readonly location?: ChatAgentLocation;
	readonly model?: string;
	readonly permissionLevel?: ChatPermissionLevel;
	readonly chatMode?: string;
	readonly sessionType?: string;
	readonly harness?: string;
}

interface IChatUserInteractionStart {
	readonly timer: IChatUserInteractionTimer;
	readonly window: Window;
}

export interface IChatUserInteractionTiming extends IChatUserInteractionStart {
	readonly elapsedMs: number;
	readonly result: ChatUserInteractionTimingResult;
	readonly context?: IChatUserInteractionTelemetryContext;
}

interface IActiveChatUserInteraction {
	readonly window: Window;
	readonly disposables: DisposableStore;
	context?: IChatUserInteractionTelemetryContext;
	renderScheduled?: boolean;
	renderDisposables?: DisposableStore;
}

export function isChatFirstVisibleProgress(part: IChatProgress | IChatProgressResponseContent): boolean {
	if (part.kind === 'thinking') {
		const values = Array.isArray(part.value) ? part.value : [part.value];
		return values.some(value => typeof value === 'string' && value.trim().length > 0);
	}
	if (part.kind === 'markdownContent') {
		return part.content.value.trim().length > 0;
	}
	return part.kind === 'toolInvocation' && !IChatToolInvocation.isEffectivelyHidden(part);
}

export class ChatUserInteractionTimingTracker extends Disposable {
	private _nextId = 0;
	private readonly _active = new Map<IChatUserInteractionTimer, IActiveChatUserInteraction>();
	private readonly _activeDisposables = this._register(new DisposableStore());
	private readonly _onDidStart = this._register(new Emitter<IChatUserInteractionStart>());
	readonly onDidStart: Event<IChatUserInteractionStart> = this._onDidStart.event;
	private readonly _onDidFinish = this._register(new Emitter<IChatUserInteractionTiming>());
	readonly onDidFinish: Event<IChatUserInteractionTiming> = this._onDidFinish.event;

	constructor(private readonly _now: () => number = () => globalThis.performance.now()) {
		super();
	}

	start(kind: ChatUserInteractionKind, window: Window, context?: IChatUserInteractionTelemetryContext, visible = true): IChatUserInteractionTimer {
		if (this._store.isDisposed) {
			throw new BugIndicatingError('Cannot start a disposed chat interaction tracker');
		}
		const timer = { id: ++this._nextId, kind, startedAt: this._now() };
		const initiallyVisible = visible && window.document.visibilityState === 'visible';
		const disposables = this._activeDisposables.add(new DisposableStore());
		this._active.set(timer, { window, disposables, context });
		disposables.add(addDisposableListener(window, 'pagehide', () => this.cancel(timer, 'disposed')));
		disposables.add(addDisposableListener(window.document, 'visibilitychange', () => {
			if (window.document.visibilityState !== 'visible') {
				this.cancel(timer, 'hidden');
			}
		}));
		this._onDidStart.fire({ timer, window });
		if (!initiallyVisible) {
			this.cancel(timer, 'hidden');
		}
		return timer;
	}

	isActive(timer: IChatUserInteractionTimer): boolean {
		return this._active.has(timer);
	}

	/** Own observations for an interaction, including observations installed after a synchronous termination. */
	addDisposable(timer: IChatUserInteractionTimer, disposable: IDisposable): void {
		const active = this._active.get(timer);
		if (active) {
			active.disposables.add(disposable);
		} else {
			disposable.dispose();
		}
	}

	setContext(timer: IChatUserInteractionTimer, context: IChatUserInteractionTelemetryContext): void {
		const active = this._active.get(timer);
		if (active) {
			active.context = { ...active.context, ...context };
		}
	}

	complete(timer: IChatUserInteractionTimer): void {
		this._finish(timer, 'success');
	}

	/** Retain the gesture when its response is deliberately transferred to another render surface. */
	resetRender(timer: IChatUserInteractionTimer): void {
		const active = this._active.get(timer);
		if (active?.renderDisposables) {
			active.disposables.delete(active.renderDisposables);
			active.renderDisposables = undefined;
			active.renderScheduled = false;
		}
	}

	completeAfterRender(timer: IChatUserInteractionTimer, window: Window, isVisible: () => boolean): void {
		const active = this._active.get(timer);
		if (!active || active.renderScheduled) {
			return;
		}
		active.renderScheduled = true;
		const renderDisposables = active.renderDisposables = active.disposables.add(new DisposableStore());
		let frame: number | undefined;
		renderDisposables.add(toDisposable(() => {
			if (frame !== undefined) {
				window.cancelAnimationFrame(frame);
			}
		}));
		if (window !== active.window) {
			renderDisposables.add(addDisposableListener(window, 'pagehide', () => this.cancel(timer, 'disposed')));
			renderDisposables.add(addDisposableListener(window.document, 'visibilitychange', () => {
				if (window.document.visibilityState !== 'visible') {
					this.cancel(timer, 'hidden');
				}
			}));
		}
		const checkVisibility = (): boolean => {
			if (!this._active.has(timer)) {
				return false;
			}
			if (window.document.visibilityState !== 'visible' || !isVisible()) {
				this.cancel(timer, 'hidden');
				return false;
			}
			return true;
		};
		if (checkVisibility()) {
			frame = window.requestAnimationFrame(() => {
				frame = undefined;
				if (checkVisibility()) {
					frame = window.requestAnimationFrame(() => {
						frame = undefined;
						if (checkVisibility()) {
							this.complete(timer);
						}
					});
				}
			});
		}
	}

	cancel(timer: IChatUserInteractionTimer, result: Exclude<ChatUserInteractionTimingResult, 'success'> = 'cancelled'): void {
		this._finish(timer, result);
	}

	private _finish(timer: IChatUserInteractionTimer, result: ChatUserInteractionTimingResult): void {
		const active = this._active.get(timer);
		if (!active) {
			return;
		}
		const elapsedMs = this._now() - timer.startedAt;
		this._active.delete(timer);
		this._activeDisposables.delete(active.disposables);
		this._onDidFinish.fire({ timer, window: active.window, elapsedMs, result, context: active.context });
	}

	override dispose(): void {
		for (const timer of this._active.keys()) {
			this.cancel(timer, 'disposed');
		}
		super.dispose();
	}
}

type ChatUserPerceivedTimeToFirstProgressEvent = {
	timeToFirstProgress: number | undefined;
	timeToTermination: number | undefined;
	result: ChatUserInteractionTimingResult;
	interactionKind: ChatUserInteractionKind;
	requestId: string | undefined;
	chatSessionId: string | undefined;
	agent: string | undefined;
	agentExtensionId: string | undefined;
	location: ChatAgentLocation | undefined;
	model: string | undefined;
	permissionLevel: ChatPermissionLevel | undefined;
	chatMode: string | undefined;
	sessionType: string | undefined;
	harness: string | undefined;
	windowVisible: boolean;
	windowFocused: boolean;
};

type ChatUserPerceivedTimeToFirstProgressClassification = {
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from UI submission or fork entry through two animation frames after meaningful progress is observed while the chat remains continuously visible. This is a render-boundary approximation, not a physical paint timestamp.' };
	timeToTermination: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from the user gesture until the interaction ended without rendering meaningful progress. Undefined on success.' };
	result: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether first progress rendered or why the interaction ended before rendering progress.' };
	interactionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of chat interaction initiated by the user.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The chat request identifier, when the interaction created a request. For Agent Host turns, this matches agentHost.turnCompleted turnId.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The non-content chat session identifier. Remote Agent Host connection authorities are excluded.' };
	agent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat agent handling the request.' };
	agentExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that contributed the chat agent.' };
	location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The location where the chat interaction occurred.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language model identifier selected for the request. For Auto, this is the Auto identifier rather than the resolved model.' };
	permissionLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool auto-approval permission level selected for the request.' };
	chatMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat mode used for the request.' };
	sessionType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The normalized chat session type.' };
	harness: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For remote Agent Host sessions, the underlying harness/provider. Undefined for non-remote sessions.' };
	windowVisible: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the source window was visible when the interaction ended.' };
	windowFocused: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the source window was focused when the interaction ended.' };
	owner: 'roblourens';
	comment: 'Measures user-perceived end-to-end time from a chat gesture until first meaningful progress is rendered.';
};

export const chatUserInteractionTimingTracker = markAsSingleton(new ChatUserInteractionTimingTracker());

export class ChatUserInteractionTelemetryReporter extends Disposable {
	constructor(
		tracker: ChatUserInteractionTimingTracker,
		private readonly _telemetryService: ITelemetryService,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(tracker.onDidStart(({ timer }) => {
			this._logService.trace('[ChatTTFP] start', { interactionId: timer.id, interactionKind: timer.kind });
		}));
		this._register(tracker.onDidFinish(timing => this._report(timing)));
	}

	private _report(timing: IChatUserInteractionTiming): void {
		const { elapsedMs, result } = timing;
		const context = timing.context;
		const data: ChatUserPerceivedTimeToFirstProgressEvent = {
			timeToFirstProgress: result === 'success' ? elapsedMs : undefined,
			timeToTermination: result === 'success' ? undefined : elapsedMs,
			result,
			interactionKind: timing.timer.kind,
			requestId: context?.requestId,
			chatSessionId: context?.chatSessionId,
			agent: context?.agent,
			agentExtensionId: context?.agentExtensionId,
			location: context?.location,
			model: context?.model,
			permissionLevel: context?.permissionLevel,
			chatMode: context?.chatMode,
			sessionType: context?.sessionType,
			harness: context?.harness,
			windowVisible: timing.window.document.visibilityState === 'visible',
			windowFocused: timing.window.document.hasFocus(),
		};
		this._logService.trace('[ChatTTFP] end', { interactionId: timing.timer.id, ...data });
		this._telemetryService.publicLog2<ChatUserPerceivedTimeToFirstProgressEvent, ChatUserPerceivedTimeToFirstProgressClassification>('chat.userPerceivedTimeToFirstProgress', data);
	}
}

export class ChatUserInteractionTelemetryContribution extends ChatUserInteractionTelemetryReporter implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatUserInteractionTelemetry';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
	) {
		super(chatUserInteractionTimingTracker, telemetryService, logService);
	}
}
