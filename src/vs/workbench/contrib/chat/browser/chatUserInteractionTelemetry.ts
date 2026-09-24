/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatProgress, IChatToolInvocation } from '../common/chatService/chatService.js';
import { ChatAgentLocation, ChatPermissionLevel } from '../common/constants.js';
import { IChatProgressResponseContent } from '../common/model/chatModel.js';

export type ChatUserInteractionKind = 'turn' | 'fork';
export type ChatUserInteractionTimingResult = 'success' | 'cancelled' | 'error' | 'completedWithoutProgress' | 'notDispatched' | 'navigated' | 'timedOut' | 'disposed';

export interface IChatUserInteractionTimer {
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

export interface IChatUserInteractionTiming {
	readonly timer: IChatUserInteractionTimer;
	readonly window: Window;
	readonly elapsedMs?: number;
	readonly result?: ChatUserInteractionTimingResult;
	readonly context?: IChatUserInteractionTelemetryContext;
}

function flashMeasurementBoundary(window: Window, color: string): void {
	const body = window.document?.body;
	if (!body) {
		return;
	}
	const marker = window.document.createElement('div');
	marker.setAttribute('aria-hidden', 'true');
	marker.style.cssText = `position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:${color};`;
	body.appendChild(marker);
	window.setTimeout(() => marker.remove(), 200);
}

const telemetryPropertyTables = new WeakMap<Window, HTMLElement>();

function showTelemetryProperties(window: Window, eventName: string, data: object, writeClipboardText: (text: string) => Promise<void>): void {
	const body = window.document?.body;
	if (!body) {
		return;
	}
	telemetryPropertyTables.get(window)?.remove();

	const container = window.document.createElement('div');
	container.setAttribute('role', 'region');
	container.setAttribute('aria-label', eventName);
	container.style.cssText = 'position:fixed;top:16px;left:16px;z-index:2147483647;max-width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:12px;background-color:var(--vscode-editorWidget-background,#252526);color:var(--vscode-editorWidget-foreground,#f0f0f0);border:1px solid var(--vscode-editorWidget-border,#454545);border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,.35);font:12px var(--vscode-editor-font-family);';
	const copyButton = window.document.createElement('button');
	copyButton.type = 'button';
	copyButton.textContent = localize('chat.telemetryProperties.copyJson', "Copy JSON");
	copyButton.style.cssText = 'position:absolute;top:4px;right:32px;height:24px;padding:0 8px;border:1px solid var(--vscode-button-border,transparent);border-radius:2px;background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#fff);font:12px sans-serif;cursor:pointer;';
	copyButton.addEventListener('click', async () => {
		try {
			await writeClipboardText(JSON.stringify({ eventName, properties: data }, undefined, 2));
			copyButton.textContent = localize('chat.telemetryProperties.copied', "Copied");
		} catch {
			copyButton.textContent = localize('chat.telemetryProperties.copyFailed', "Copy Failed");
		}
		window.setTimeout(() => copyButton.textContent = localize('chat.telemetryProperties.copyJson', "Copy JSON"), 1500);
	});
	container.appendChild(copyButton);
	const closeButton = window.document.createElement('button');
	closeButton.type = 'button';
	closeButton.textContent = '×';
	closeButton.setAttribute('aria-label', localize('chat.telemetryProperties.close', "Close telemetry properties"));
	closeButton.style.cssText = 'position:absolute;top:4px;right:4px;width:24px;height:24px;padding:0;border:0;background:transparent;color:inherit;font:20px/24px sans-serif;cursor:pointer;';
	closeButton.addEventListener('click', () => {
		if (telemetryPropertyTables.get(window) === container) {
			telemetryPropertyTables.delete(window);
		}
		container.remove();
	});
	container.appendChild(closeButton);
	const table = window.document.createElement('table');
	table.style.cssText = 'border-collapse:collapse;width:100%;';
	const caption = window.document.createElement('caption');
	caption.textContent = eventName;
	caption.style.cssText = 'padding:0 104px 8px 0;text-align:left;font-weight:600;';
	table.appendChild(caption);

	for (const [property, value] of Object.entries(data)) {
		const row = table.insertRow();
		const nameCell = row.insertCell();
		nameCell.textContent = property;
		nameCell.style.cssText = 'padding:3px 12px 3px 0;vertical-align:top;font-weight:600;white-space:nowrap;';
		const valueCell = row.insertCell();
		valueCell.textContent = String(value);
		valueCell.style.cssText = 'padding:3px 0;overflow-wrap:anywhere;';
	}

	container.appendChild(table);
	body.appendChild(container);
	telemetryPropertyTables.set(window, container);
}

export function isChatFirstVisibleProgress(part: IChatProgress | IChatProgressResponseContent): boolean {
	if (part.kind === 'thinking') {
		const values = Array.isArray(part.value) ? part.value : [part.value];
		return values.some(value => typeof value === 'string' && value.trim().length > 0);
	}
	return part.kind === 'markdownContent'
		|| (part.kind === 'toolInvocation' && !IChatToolInvocation.isEffectivelyHidden(part));
}

export class ChatUserInteractionTimingTracker extends Disposable {
	private readonly _active = new WeakSet<IChatUserInteractionTimer>();
	private readonly _renderScheduled = new WeakSet<IChatUserInteractionTimer>();
	private readonly _windows = new WeakMap<IChatUserInteractionTimer, Window>();
	private readonly _contexts = new WeakMap<IChatUserInteractionTimer, IChatUserInteractionTelemetryContext>();
	private readonly _onDidComplete = this._register(new Emitter<IChatUserInteractionTiming>());
	readonly onDidComplete: Event<IChatUserInteractionTiming> = this._onDidComplete.event;
	private readonly _onDidCancel = this._register(new Emitter<IChatUserInteractionTiming>());
	readonly onDidCancel: Event<IChatUserInteractionTiming> = this._onDidCancel.event;

	start(kind: ChatUserInteractionKind, window: Window): IChatUserInteractionTimer {
		const timer = { kind, startedAt: globalThis.performance.now() };
		flashMeasurementBoundary(window, 'rgba(255, 191, 0, 0.35)');
		this._active.add(timer);
		this._windows.set(timer, window);
		return timer;
	}

	setContext(timer: IChatUserInteractionTimer, context: IChatUserInteractionTelemetryContext): void {
		if (this._active.has(timer)) {
			this._contexts.set(timer, { ...this._contexts.get(timer), ...context });
		}
	}

	complete(timer: IChatUserInteractionTimer): void {
		this._finish(timer, 'success', this._onDidComplete);
	}

	completeAfterRender(timer: IChatUserInteractionTimer, window: Window): void {
		if (!this._active.has(timer) || this._renderScheduled.has(timer)) {
			return;
		}
		this._renderScheduled.add(timer);
		window.requestAnimationFrame(() => window.requestAnimationFrame(() => this.complete(timer)));
	}

	cancel(timer: IChatUserInteractionTimer, result: Exclude<ChatUserInteractionTimingResult, 'success'> = 'cancelled'): void {
		this._finish(timer, result, this._onDidCancel);
	}

	private _finish(timer: IChatUserInteractionTimer, result: ChatUserInteractionTimingResult, emitter: Emitter<IChatUserInteractionTiming>): void {
		if (!this._active.delete(timer)) {
			return;
		}
		const window = this._windows.get(timer);
		if (window) {
			const endedAt = globalThis.performance.now();
			flashMeasurementBoundary(window, 'rgba(0, 200, 83, 0.35)');
			emitter.fire({
				timer,
				window,
				elapsedMs: endedAt - timer.startedAt,
				result,
				context: this._contexts.get(timer),
			});
		}
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
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from the user gesture until the first meaningful chat progress has been painted by the workbench.' };
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

export const chatUserInteractionTimingTracker = new ChatUserInteractionTimingTracker();

export class ChatUserInteractionTelemetryReporter extends Disposable {
	constructor(
		tracker: ChatUserInteractionTimingTracker,
		private readonly _telemetryService: ITelemetryService,
		private readonly _writeClipboardText: (text: string) => Promise<void> = text => globalThis.navigator.clipboard.writeText(text),
	) {
		super();
		this._register(tracker.onDidComplete(timing => this._report(timing)));
		this._register(tracker.onDidCancel(timing => this._report(timing)));
	}

	private _report(timing: IChatUserInteractionTiming): void {
		const elapsedMs = timing.elapsedMs ?? 0;
		const result = timing.result ?? 'cancelled';
		const context = timing.context;
		const eventName = 'chat.userPerceivedTimeToFirstProgress';
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
		this._telemetryService.publicLog2<ChatUserPerceivedTimeToFirstProgressEvent, ChatUserPerceivedTimeToFirstProgressClassification>(eventName, data);
		flashMeasurementBoundary(timing.window, 'rgba(0, 122, 204, 0.35)');
		showTelemetryProperties(timing.window, eventName, data, this._writeClipboardText);
	}
}

export class ChatUserInteractionTelemetryContribution extends ChatUserInteractionTelemetryReporter implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatUserInteractionTelemetry';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IClipboardService clipboardService: IClipboardService,
	) {
		super(chatUserInteractionTimingTracker, telemetryService, text => clipboardService.writeText(text));
	}
}
