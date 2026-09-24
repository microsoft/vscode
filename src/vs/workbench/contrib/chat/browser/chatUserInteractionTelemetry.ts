/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getWindow } from '../../../../base/browser/dom.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IChatWidget } from './chat.js';
import { IChatProgress, IChatToolInvocation } from '../common/chatService/chatService.js';
import { getChatSessionTelemetryContext } from '../common/chatService/chatServiceTelemetry.js';
import { ChatAgentLocation, ChatModeKind, ChatPermissionLevel } from '../common/constants.js';
import { IChatProgressResponseContent, IChatResponseModel } from '../common/model/chatModel.js';

export type ChatUserInteractionTimingResult = 'success' | 'cancelled' | 'error' | 'completedWithoutProgress' | 'notDispatched' | 'queued' | 'navigated' | 'hidden' | 'disposed';
type ChatFirstProgressKind = 'text' | 'reasoning' | 'tool';
type ChatRequestPhase = 'first' | 'followup' | 'unknown';

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

export interface IChatUserInteractionOptions {
	readonly window: Window;
	readonly visible: boolean;
	readonly context?: IChatUserInteractionTelemetryContext;
	readonly now?: () => number;
}

export function isChatFirstVisibleProgress(part: IChatProgress | IChatProgressResponseContent): boolean {
	return getFirstProgressKind(part) !== undefined;
}

function getFirstProgressKind(part: IChatProgress | IChatProgressResponseContent): ChatFirstProgressKind | undefined {
	if (part.kind === 'thinking') {
		const values = Array.isArray(part.value) ? part.value : [part.value];
		return values.some(value => typeof value === 'string' && value.trim().length > 0) ? 'reasoning' : undefined;
	}
	if (part.kind === 'markdownContent') {
		return part.content.value.trim().length > 0 ? 'text' : undefined;
	}
	return (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && !IChatToolInvocation.isEffectivelyHidden(part) ? 'tool' : undefined;
}

/** One submission owns its clock, response observation, render acknowledgement and reporting. */
export class ChatUserInteraction extends Disposable {
	private static _nextId = 0;
	readonly id = ++ChatUserInteraction._nextId;
	readonly startedAt: number;
	private readonly _now: () => number;
	private readonly _onDidFinish = this._register(new Emitter<void>());
	readonly onDidFinish = this._onDidFinish.event;
	private readonly _render = this._register(new MutableDisposable());
	private _active = true;
	private _context: IChatUserInteractionTelemetryContext;
	private _response: IChatResponseModel | undefined;
	private _requestPhase: ChatRequestPhase = 'unknown';
	private _getWidget: (() => IChatWidget | undefined) | undefined;
	private _renderWidget: IChatWidget | undefined;

	constructor(
		private readonly _options: IChatUserInteractionOptions,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._now = _options.now ?? (() => globalThis.performance.now());
		this.startedAt = this._now();
		this._context = _options.context ?? {};
		this._register(addDisposableListener(_options.window, 'pagehide', () => this.cancel('disposed')));
		this._register(addDisposableListener(_options.window.document, 'visibilitychange', () => {
			if (_options.window.document.visibilityState !== 'visible') {
				this.cancel('hidden');
			}
		}));
		this._logService.trace('[ChatTTFP] start', { interactionId: this.id, interactionKind: 'turn' });
		if (!_options.visible || _options.window.document.visibilityState !== 'visible') {
			this.cancel('hidden');
		}
	}

	get isActive(): boolean { return this._active; }

	addDisposable(disposable: IDisposable): void {
		if (this._active) {
			this._register(disposable);
		} else {
			disposable.dispose();
		}
	}

	setContext(context: IChatUserInteractionTelemetryContext): void {
		this._context = { ...this._context, ...context };
	}

	/** Accept only the response created for this submission; never infer it from focus or prompt text. */
	observeResponse(response: IChatResponseModel | undefined, getWidget: () => IChatWidget | undefined): void {
		if (!this._active || this._response) {
			return;
		}
		if (!response || response.isHiddenFromTranscript) {
			this.cancel('notDispatched');
			return;
		}
		this._response = response;
		const requestIndex = response.session.getRequests().findIndex(request => request.id === response.requestId);
		this._requestPhase = requestIndex === 0 ? 'first' : requestIndex > 0 ? 'followup' : 'unknown';
		this._getWidget = getWidget;
		this._register(response.onDidChange(() => this.checkResponse()));
		this._register(response.session.onDidDispose(() => this.cancel('disposed')));
		this.checkResponse();
	}

	resetRender(): void {
		this._render.clear();
		this._renderWidget = undefined;
	}

	/** Shared by existing chat widgets and the Agents composer's response-view handoff. */
	checkResponse(): void {
		const response = this._response;
		if (!this._active || !response) {
			return;
		}
		if (response.isCanceled || response.result?.errorDetails) {
			this.cancel(response.isCanceled ? 'cancelled' : 'error');
			return;
		}
		const firstProgress = response.response.value.find(isChatFirstVisibleProgress);
		const firstProgressKind = firstProgress && getFirstProgressKind(firstProgress);
		if (!firstProgressKind && response.isComplete) {
			this.cancel('completedWithoutProgress');
			return;
		}
		const widget = this._getWidget?.();
		if (widget !== this._renderWidget) {
			this.resetRender();
		}
		if (!widget) {
			return;
		}
		if (widget.viewModel?.model !== response.session) {
			this.cancel('navigated');
		} else if (!widget.visible || getWindow(widget.domNode).document.visibilityState !== 'visible') {
			this.cancel('hidden');
		} else if (firstProgressKind && !widget.isTranscriptProgressActive && !this._renderWidget) {
			this._renderWidget = widget;
			const window = getWindow(widget.domNode);
			let frame: number | undefined;
			const render = new DisposableStore();
			this._render.value = render;
			render.add(toDisposable(() => { if (frame !== undefined) { window.cancelAnimationFrame(frame); } }));
			if (window !== this._options.window) {
				render.add(addDisposableListener(window, 'pagehide', () => this.cancel('disposed')));
				render.add(addDisposableListener(window.document, 'visibilitychange', () => {
					if (window.document.visibilityState !== 'visible') { this.cancel('hidden'); }
				}));
			}
			const nextFrame = (complete: boolean) => {
				frame = undefined;
				if (!this._active) {
					return;
				}
				const currentProgress = response.response.value.find(isChatFirstVisibleProgress);
				if (this._getWidget?.() !== widget || !widget.visible || widget.viewModel?.model !== response.session
					|| window.document.visibilityState !== 'visible' || widget.isTranscriptProgressActive
					|| response.isCanceled || response.result?.errorDetails || !currentProgress || getFirstProgressKind(currentProgress) !== firstProgressKind) {
					this.resetRender();
					this.checkResponse();
				} else if (complete) {
					this._finish('success', firstProgressKind);
				} else {
					frame = window.requestAnimationFrame(() => nextFrame(true));
				}
			};
			frame = window.requestAnimationFrame(() => nextFrame(false));
		}
	}

	cancel(result: Exclude<ChatUserInteractionTimingResult, 'success'>): void {
		this._finish(result);
	}

	private _finish(result: ChatUserInteractionTimingResult, firstProgressKind?: ChatFirstProgressKind): void {
		if (!this._active) {
			return;
		}
		this._active = false;
		const elapsedMs = this._now() - this.startedAt;
		const response = this._response;
		if (response) {
			// Participant detection and session adoption can update attribution after response creation.
			this.setContext({
				...getChatSessionTelemetryContext(response.session.sessionResource),
				requestId: response.requestId,
				agent: response.agent?.id,
				agentExtensionId: response.agent?.extensionId.value,
				model: response.request?.modelId,
				permissionLevel: response.request?.modeInfo?.kind === ChatModeKind.Ask ? undefined : response.request?.modeInfo?.permissionLevel,
				chatMode: response.request?.modeInfo?.telemetryModeName ?? response.request?.modeInfo?.telemetryModeId,
			});
		}
		this.resetRender();
		this._response = undefined;
		this._getWidget = undefined;
		const data: ChatUserPerceivedTimeToFirstProgressEvent = {
			...this._context,
			timeToFirstProgress: result === 'success' ? elapsedMs : undefined,
			timeToTermination: result === 'success' ? undefined : elapsedMs,
			result,
			requestPhase: this._requestPhase,
			...(result === 'success' ? { firstProgressKind } : {}),
			interactionKind: 'turn',
			windowVisible: this._options.window.document.visibilityState === 'visible',
			windowFocused: this._options.window.document.hasFocus(),
		};
		this._logService.trace('[ChatTTFP] end', { interactionId: this.id, ...data });
		this._telemetryService.publicLog2<ChatUserPerceivedTimeToFirstProgressEvent, ChatUserPerceivedTimeToFirstProgressClassification>('chat.userPerceivedTimeToFirstProgress', data);
		this._onDidFinish.fire();
		super.dispose();
	}

	override dispose(): void {
		this.cancel('disposed');
		super.dispose();
	}
}

type ChatUserPerceivedTimeToFirstProgressEvent = IChatUserInteractionTelemetryContext & {
	timeToFirstProgress: number | undefined;
	timeToTermination: number | undefined;
	result: ChatUserInteractionTimingResult;
	requestPhase: ChatRequestPhase;
	firstProgressKind?: ChatFirstProgressKind;
	interactionKind: 'turn';
	windowVisible: boolean;
	windowFocused: boolean;
};

type ChatUserPerceivedTimeToFirstProgressClassification = {
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from UI submission through two animation frames after meaningful progress is observed while the chat remains continuously visible. This is a render-boundary approximation, not a physical paint timestamp.' };
	timeToTermination: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from UI submission until the interaction ended without rendering meaningful progress. Undefined on success.' };
	result: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether first progress rendered or why the interaction ended before rendering progress.' };
	requestPhase: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether this is the first request in the chat history or a followup; unknown if no response was created or its request cannot be located. Does not imply a cold or warm provider process.' };
	firstProgressKind?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Kind of meaningful progress that triggered the successful render acknowledgement: text, reasoning, or tool. Absent on unsuccessful observations.' };
	interactionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat interaction kind. This event measures turn submissions, not fork navigation.' };
	requestId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The chat request identifier, when created. For Agent Host turns, this matches agentHost.turnCompleted turnId.' };
	chatSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The non-content chat session identifier. Remote Agent Host connection authorities are excluded.' };
	agent?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat agent handling the request.' };
	agentExtensionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that contributed the chat agent.' };
	location?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The location where the chat interaction occurred.' };
	model?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The selected language model identifier. For Auto, this is the Auto identifier rather than the resolved model.' };
	permissionLevel?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool auto-approval permission level selected for the request.' };
	chatMode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat mode used for the request.' };
	sessionType?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The normalized chat session type.' };
	harness?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For remote Agent Host sessions, the underlying harness/provider. Undefined for non-remote sessions.' };
	windowVisible: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the source window was visible when the interaction ended.' };
	windowFocused: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the source window was focused when the interaction ended.' };
	owner: 'roblourens';
	comment: 'Measures user-perceived time from UI submission until first meaningful progress is rendered.';
};
