/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createLocalPtyChannel } from '../../common/localPtyChannel.js';
import { ILocalPtyService } from '../../common/terminal.js';

type PtyEventData<K extends keyof ILocalPtyService> = ILocalPtyService[K] extends Event<infer T> ? T : never;

suite('LocalPtyChannel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture() {
		const processEvents = {
			onProcessData: store.add(new Emitter<PtyEventData<'onProcessData'>>()),
			onProcessReady: store.add(new Emitter<PtyEventData<'onProcessReady'>>()),
			onProcessExit: store.add(new Emitter<PtyEventData<'onProcessExit'>>()),
			onProcessReplay: store.add(new Emitter<PtyEventData<'onProcessReplay'>>()),
			onDidChangeProperty: store.add(new Emitter<PtyEventData<'onDidChangeProperty'>>()),
			onProcessOrphanQuestion: store.add(new Emitter<PtyEventData<'onProcessOrphanQuestion'>>()),
			onDidRequestDetach: store.add(new Emitter<PtyEventData<'onDidRequestDetach'>>()),
		};
		const lifecycleEvents = {
			onPtyHostStart: store.add(new Emitter<void>()),
			onPtyHostExit: store.add(new Emitter<number>()),
			onPtyHostUnresponsive: store.add(new Emitter<void>()),
			onPtyHostResponsive: store.add(new Emitter<void>()),
			onPtyHostRequestResolveVariables: store.add(new Emitter<PtyEventData<'onPtyHostRequestResolveVariables'>>()),
		};
		const service = upcastPartial<ILocalPtyService>({
			onProcessData: processEvents.onProcessData.event,
			onProcessReady: processEvents.onProcessReady.event,
			onProcessExit: processEvents.onProcessExit.event,
			onProcessReplay: processEvents.onProcessReplay.event,
			onDidChangeProperty: processEvents.onDidChangeProperty.event,
			onProcessOrphanQuestion: processEvents.onProcessOrphanQuestion.event,
			onDidRequestDetach: processEvents.onDidRequestDetach.event,
			onPtyHostStart: lifecycleEvents.onPtyHostStart.event,
			onPtyHostExit: lifecycleEvents.onPtyHostExit.event,
			onPtyHostUnresponsive: lifecycleEvents.onPtyHostUnresponsive.event,
			onPtyHostResponsive: lifecycleEvents.onPtyHostResponsive.event,
			onPtyHostRequestResolveVariables: lifecycleEvents.onPtyHostRequestResolveVariables.event,
		});
		const channel = createLocalPtyChannel(service, store.add(new DisposableStore()));
		return { processEvents, lifecycleEvents, channel };
	}

	test('does not retain subscriptions for unused process events', () => {
		const { processEvents } = createFixture();
		const received: PtyEventData<'onProcessData'>[] = [];
		const directListener = store.add(processEvents.onProcessData.event(e => received.push(e)));
		const output = { id: 1, event: 'terminal output\r\n' };
		processEvents.onProcessData.fire(output);
		directListener.dispose();

		for (let i = 0; i < 100; i++) {
			processEvents.onProcessData.fire(output);
		}

		deepStrictEqual({
			received,
			subscribedProcessEvents: Object.entries(processEvents).filter(([, emitter]) => emitter.hasListeners()).map(([name]) => name)
		}, {
			received: [output],
			subscribedProcessEvents: []
		});
	});

	test('delivers live output to local listeners without replaying earlier output', () => {
		const { processEvents, channel } = createFixture();
		const firstWindow: PtyEventData<'onProcessData'>[] = [];
		const secondWindow: PtyEventData<'onProcessData'>[] = [];
		const firstOutput = { id: 1, event: 'first' };
		const secondOutput = { id: 1, event: 'second' };

		processEvents.onProcessData.fire({ id: 1, event: 'before listening' });
		const firstListener = store.add(channel.listen<PtyEventData<'onProcessData'>>('first', 'onProcessData')(e => firstWindow.push(e)));
		const secondListener = store.add(channel.listen<PtyEventData<'onProcessData'>>('second', 'onProcessData')(e => secondWindow.push(e)));
		processEvents.onProcessData.fire(firstOutput);
		firstListener.dispose();
		processEvents.onProcessData.fire(secondOutput);
		secondListener.dispose();

		deepStrictEqual({
			firstWindow,
			secondWindow,
			hasListeners: processEvents.onProcessData.hasListeners()
		}, {
			firstWindow: [firstOutput],
			secondWindow: [firstOutput, secondOutput],
			hasListeners: false
		});
	});

	test('preserves early and live lifecycle notifications', async () => {
		const { lifecycleEvents, channel } = createFixture();
		const received: { [K in keyof typeof lifecycleEvents]: PtyEventData<K>[] } = {
			onPtyHostStart: [],
			onPtyHostExit: [],
			onPtyHostUnresponsive: [],
			onPtyHostResponsive: [],
			onPtyHostRequestResolveVariables: [],
		};
		const earlyRequest = { requestId: 1, workspaceId: 'workspace', originalText: ['${workspaceFolder}'] };
		const liveRequest = { requestId: 2, workspaceId: 'workspace', originalText: ['${env:HOME}'] };

		lifecycleEvents.onPtyHostStart.fire();
		lifecycleEvents.onPtyHostExit.fire(1);
		lifecycleEvents.onPtyHostUnresponsive.fire();
		lifecycleEvents.onPtyHostResponsive.fire();
		lifecycleEvents.onPtyHostRequestResolveVariables.fire(earlyRequest);

		store.add(channel.listen<void>('window', 'onPtyHostStart')(e => received.onPtyHostStart.push(e)));
		store.add(channel.listen<number>('window', 'onPtyHostExit')(e => received.onPtyHostExit.push(e)));
		store.add(channel.listen<void>('window', 'onPtyHostUnresponsive')(e => received.onPtyHostUnresponsive.push(e)));
		store.add(channel.listen<void>('window', 'onPtyHostResponsive')(e => received.onPtyHostResponsive.push(e)));
		store.add(channel.listen<PtyEventData<'onPtyHostRequestResolveVariables'>>('window', 'onPtyHostRequestResolveVariables')(e => received.onPtyHostRequestResolveVariables.push(e)));
		await timeout(0);

		lifecycleEvents.onPtyHostStart.fire();
		lifecycleEvents.onPtyHostExit.fire(2);
		lifecycleEvents.onPtyHostUnresponsive.fire();
		lifecycleEvents.onPtyHostResponsive.fire();
		lifecycleEvents.onPtyHostRequestResolveVariables.fire(liveRequest);

		deepStrictEqual(received, {
			onPtyHostStart: [undefined, undefined],
			onPtyHostExit: [1, 2],
			onPtyHostUnresponsive: [undefined, undefined],
			onPtyHostResponsive: [undefined, undefined],
			onPtyHostRequestResolveVariables: [earlyRequest, liveRequest],
		});
	});
});
