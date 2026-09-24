/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatWidget, IChatWidgetViewModelChangeEvent } from '../../browser/chat.js';
import { ChatUserInteraction, ChatUserInteractionTimingResult, IChatUserInteractionOptions } from '../../browser/chatUserInteractionTelemetry.js';
import { ChatResponseModelChangeReason, IChatModel, IChatProgressResponseContent, IChatRequestModel, IChatResponseModel, IResponse } from '../../common/model/chatModel.js';
import { IChatViewModel } from '../../common/model/chatViewModel.js';

export function createChatUserInteractionTestHarness(disposables: Pick<DisposableStore, 'add'>) {
	let now = 100;
	let visibilityState: DocumentVisibilityState = 'visible';
	let focused = true;
	let nextFrame = 0;
	let listeners = 0;
	const frames = new Map<number, FrameRequestCallback>();
	const cancelledFrames: number[] = [];
	const windowEvents = new EventTarget();
	const documentEvents = new EventTarget();
	const eventMethods = (target: EventTarget) => ({
		addEventListener: (...args: Parameters<EventTarget['addEventListener']>) => { listeners++; target.addEventListener(...args); },
		removeEventListener: (...args: Parameters<EventTarget['removeEventListener']>) => { listeners--; target.removeEventListener(...args); },
	});
	const window: Window & typeof globalThis = upcastPartial<Window & typeof globalThis>({
		get window() { return window; },
		document: upcastPartial<Document>({
			...eventMethods(documentEvents),
			get defaultView() { return window; },
			get visibilityState() { return visibilityState; },
			hasFocus: () => focused,
			createElement: () => { throw new Error('Telemetry must not create DOM elements'); },
		}),
		...eventMethods(windowEvents),
		requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
		cancelAnimationFrame: id => { cancelledFrames.push(id); frames.delete(id); },
	});
	const element = upcastPartial<HTMLElement>({ ownerDocument: window.document });
	const events: { name: string; data: Record<string, unknown> }[] = [];
	const logs: { message: string; args: unknown[] }[] = [];
	const starts: number[] = [];
	const observers: (() => boolean)[] = [];
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(ITelemetryService, {
		publicLog2: (name: string, data: Record<string, unknown> = {}) => { events.push({ name, data }); },
	});
	instantiationService.stub(ILogService, {
		trace: (message: string, ...args: unknown[]) => {
			logs.push({ message, args });
			if (message === '[ChatTTFP] start') {
				starts.push((args[0] as { interactionId: number }).interactionId);
			}
		},
	});
	const createInstance = instantiationService.createInstance.bind(instantiationService);
	stub(instantiationService, 'createInstance').callsFake((ctor, ...args) => ctor === ChatUserInteraction
		? disposables.add(createInstance(ChatUserInteraction, { ...args[0] as IChatUserInteractionOptions, now: () => now }))
		: createInstance(ctor, ...args));

	function createResponse(resource = URI.parse('agent-host-copilotcli:/session'), properties: Partial<IChatResponseModel> = {}) {
		const requestId = properties.requestId ?? `request-${resource.path}`;
		const changed = disposables.add(new Emitter<ChatResponseModelChangeReason>());
		const disposed = disposables.add(new Emitter<void>());
		let parts: IChatProgressResponseContent[] = [];
		let complete = false;
		let result: 'cancelled' | 'error' | undefined;
		const response = upcastPartial<IChatResponseModel>({
			session: upcastPartial<IChatModel>({
				sessionResource: resource, onDidDispose: disposed.event,
				getRequests: () => [upcastPartial<IChatRequestModel>({ id: requestId })],
			}),
			requestId,
			onDidChange: changed.event,
			response: upcastPartial<IResponse>({ get value() { return parts; } }),
			get isComplete() { return complete; },
			get isCanceled() { return result === 'cancelled'; },
			get result() { return result === 'error' ? { errorDetails: { message: 'request failed' } } : undefined; },
			...properties,
		});
		const hasListeners = () => changed.hasListeners() || disposed.hasListeners();
		observers.push(hasListeners);
		return {
			response, disposed, hasListeners,
			progress: (value: IChatProgressResponseContent[] = [{ kind: 'markdownContent', content: new MarkdownString('Response') }]) => {
				parts = value;
				changed.fire({ reason: 'other' });
			},
			complete: (outcome?: typeof result) => { complete = true; result = outcome; changed.fire({ reason: 'completedRequest' }); },
		};
	}

	function createWidget(response?: IChatResponseModel, progressActive = false) {
		const changed = disposables.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const hidden = disposables.add(new Emitter<void>());
		const shown = disposables.add(new Emitter<void>());
		let viewModel: IChatViewModel | undefined;
		let visible = true;
		const widget = upcastPartial<IChatWidget>({
			domNode: element,
			get visible() { return visible; },
			get viewModel() { return viewModel; },
			get isTranscriptProgressActive() { return progressActive; },
			onDidChangeViewModel: changed.event,
			onDidHide: hidden.event,
			onDidShow: shown.event,
		});
		const bind = (response: IChatResponseModel) => {
			const previousSessionResource = viewModel?.sessionResource;
			viewModel = upcastPartial<IChatViewModel>({ model: response.session, sessionResource: response.session.sessionResource });
			changed.fire({ previousSessionResource, currentSessionResource: viewModel.sessionResource });
		};
		if (response) {
			bind(response);
		}
		const hasListeners = () => changed.hasListeners() || hidden.hasListeners() || shown.hasListeners();
		observers.push(hasListeners);
		return {
			widget, bind, hasListeners,
			hide: () => { visible = false; hidden.fire(); },
			show: () => { visible = true; shown.fire(); },
			finishPreparation: () => { progressActive = false; },
		};
	}

	return {
		window, element, frames, cancelledFrames, events, logs, starts, instantiationService, createResponse, createWidget,
		createInteraction: (options: Partial<IChatUserInteractionOptions> = {}) => instantiationService.createInstance(ChatUserInteraction, { window, visible: true, ...options }),
		assertFinished: (...results: ChatUserInteractionTimingResult[]) => {
			assert.deepStrictEqual({
				results: events.map(event => event.data.result), frames: frames.size, listeners, observing: observers.some(hasListeners => hasListeners()),
			}, { results, frames: 0, listeners: 0, observing: false });
		},
		setTime: (value: number) => { now = value; },
		frame: (count = 1) => {
			for (let i = 0; i < count; i++) {
				const callbacks = [...frames.values()];
				frames.clear();
				callbacks.forEach(callback => callback(now));
			}
		},
		blur: () => { focused = false; },
		setDocumentVisible: (visible: boolean) => {
			visibilityState = visible ? 'visible' : 'hidden';
			documentEvents.dispatchEvent(new globalThis.Event('visibilitychange'));
		},
		close: () => windowEvents.dispatchEvent(new globalThis.Event('pagehide')),
	};
}
