/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, scheduleAtNextAnimationFrame } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatOpenWidgetMilestones, IChatOpenDocumentVisibility, IChatOpenRenderSource } from '../../../browser/widget/chatOpenWidgetMilestones.js';
import { ChatOpenEvent, ChatOpenTelemetryService } from '../../../common/chatOpenTelemetry.js';

suite('ChatOpenWidgetMilestones', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const chatResource = URI.parse('agent-host-copilotcli:/chat');

	function setup() {
		const events: ChatOpenEvent[] = [];
		const service = disposables.add(new ChatOpenTelemetryService(new class extends NullTelemetryServiceShape { override publicLog2(_name?: string, data?: unknown) { events.push(data as ChatOpenEvent); } }(), new NullLogService()));
		const onDidRenderFirstTranscript = disposables.add(new Emitter<URI>());
		const onDidHide = disposables.add(new Emitter<void>());
		let pendingResource: URI | undefined;
		let visible = true;
		const widget: IChatOpenRenderSource = {
			domNode: $('div'),
			get visible() { return visible; },
			onDidHide: onDidHide.event,
			onDidRenderFirstTranscript: onDidRenderFirstTranscript.event,
			isFirstTranscriptRenderPending: (resource: URI) => isEqual(resource, pendingResource),
		};
		const testDocument = new class extends EventTarget implements IChatOpenDocumentVisibility { visibilityState: DocumentVisibilityState = 'visible'; }();
		const milestones = disposables.add(new ChatOpenWidgetMilestones(widget, testDocument));
		const tracker = service.start('editor', { chatResource });
		tracker.bindChat(chatResource);
		tracker.setProgressHidden(true);
		tracker.setInputEnabled(true);
		return {
			events, milestones, tracker,
			setPending: (resource: URI | undefined) => pendingResource = resource,
			render: (resource: URI) => { pendingResource = undefined; onDidRenderFirstTranscript.fire(resource); },
			hide: () => { visible = false; onDidHide.fire(); },
			hideDocument: () => { testDocument.visibilityState = 'hidden'; testDocument.dispatchEvent(new Event('visibilitychange')); },
		};
	}

	function nextFrames(): Promise<void> {
		const store = disposables.add(new DisposableStore());
		return new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(mainWindow, () => {
			store.add(scheduleAtNextAnimationFrame(mainWindow, () => {
				store.dispose();
				resolve();
			}));
		})));
	}

	test('completes the open on the frame after the first transcript render', async () => {
		const { events, milestones, tracker, setPending, render } = setup();

		setPending(chatResource);
		milestones.modelAttached(tracker);
		await nextFrames();
		const beforeRender = events.length;
		render(chatResource);
		const synchronouslyAfterRender = events.length;
		await nextFrames();

		assert.deepStrictEqual({ beforeRender, synchronouslyAfterRender, outcomes: events.map(event => event.outcome) }, { beforeRender: 0, synchronouslyAfterRender: 0, outcomes: ['completed'] });
	});

	test('completes the open when the attached model was rendered already', async () => {
		const { events, milestones, tracker } = setup();

		milestones.modelAttached(tracker);
		await nextFrames();

		assert.deepStrictEqual(events.map(event => ({ outcome: event.outcome, rendered: event.firstRenderMs !== undefined })), [{ outcome: 'completed', rendered: true }]);
	});

	test('ends an open whose widget is hidden when the model is attached as hidden, without waiting for a render', async () => {
		const { events, milestones, tracker, setPending, hide } = setup();

		hide();
		setPending(chatResource);
		milestones.modelAttached(tracker);

		assert.deepStrictEqual(events.map(event => ({ outcome: event.outcome, attached: event.modelAttachedMs !== undefined, rendered: event.firstRenderMs !== undefined, loaded: event.loadedMs !== undefined })), [
			{ outcome: 'hidden', attached: true, rendered: false, loaded: false },
		]);
	});

	test('ends an open whose widget is hidden before its first render as hidden', async () => {
		const { events, milestones, tracker, setPending, render, hide } = setup();

		setPending(chatResource);
		milestones.modelAttached(tracker);
		hide();
		render(chatResource);
		await nextFrames();

		assert.deepStrictEqual(events.map(event => ({ outcome: event.outcome, attached: event.modelAttachedMs !== undefined, rendered: event.firstRenderMs !== undefined })), [
			{ outcome: 'hidden', attached: true, rendered: false },
		]);
	});

	test('ends an open whose window is hidden before it completed as hidden', async () => {
		const { events, milestones, tracker, hideDocument } = setup();

		milestones.modelAttached(tracker);
		hideDocument();
		await nextFrames();

		assert.deepStrictEqual(events.map(event => ({ outcome: event.outcome, rendered: event.firstRenderMs !== undefined })), [{ outcome: 'hidden', rendered: false }]);
	});
});
