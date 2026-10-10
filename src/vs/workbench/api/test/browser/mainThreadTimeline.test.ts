/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DisposableMap } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { MainThreadTimeline } from '../../browser/mainThreadTimeline.js';
import { ExtHostTimelineShape } from '../../common/extHost.protocol.js';
import { TimelineChangeEvent } from '../../../contrib/timeline/common/timeline.js';
import { TimelineService } from '../../../contrib/timeline/common/timelineService.js';
import { TestViewsService } from '../../../test/browser/workbenchTestServices.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadTimeline', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	function createCustomer() {
		const service = store.add(new TimelineService(new NullLogService(), new TestViewsService(), new TestConfigurationService(), new MockContextKeyService()));
		const proxy = new class extends mock<ExtHostTimelineShape>() {
			override async $getTimeline(id: string) {
				return { source: id, items: [{ handle: 'item', source: id, label: 'Timeline item', timestamp: 1 }] };
			}
		};
		const customer = store.add(new MainThreadTimeline(SingleProxyRPCProtocol(proxy), new NullLogService(), service));
		const emitters: DisposableMap<string, Emitter<TimelineChangeEvent>> = Reflect.get(customer, '_providerEmitters');
		// Cleanup the unfixed allocations after red assertions, without hiding their observed lifetime.
		store.add({ dispose: () => { for (const emitter of emitters.values()) { emitter.dispose(); } } });
		return { customer, service, emitters };
	}

	function register(customer: MainThreadTimeline, id: string): void {
		customer.$registerTimelineProvider({ id, label: id, scheme: 'file' });
	}

	test('live provider forwards timeline requests and change events', async () => {
		const { customer, service, emitters } = createCustomer();
		register(customer, 'live');
		const changes: string[] = [];
		store.add(service.onDidChangeTimeline(event => changes.push(event.id)));
		customer.$emitTimelineChangeEvent({ id: 'live', uri: undefined, reset: true });
		const token = store.add(new CancellationTokenSource());
		const result = await service.getTimeline('live', URI.file('/timeline.txt'), {}, token)?.result;
		assert.deepStrictEqual({ changes, labels: result?.items.map(item => item.label), emitters: emitters.size }, { changes: ['live'], labels: ['Timeline item'], emitters: 1 });
		customer.$unregisterTimelineProvider('live');
	});

	test('unregister releases its change emitter', () => {
		const { customer, service, emitters } = createCustomer();
		register(customer, 'retired');
		customer.$unregisterTimelineProvider('retired');
		assert.deepStrictEqual({ sources: service.getSources(), emitters: emitters.size }, { sources: [], emitters: 0 });
	});

	test('unregister disposes observers of its emitter', () => {
		const { customer, emitters } = createCustomer();
		register(customer, 'retired');
		const emitter = emitters.get('retired')!;
		let calls = 0;
		store.add(emitter.event(() => calls++));
		customer.$unregisterTimelineProvider('retired');
		emitter.fire({ id: 'retired', uri: undefined, reset: true });
		assert.strictEqual(calls, 0);
	});

	test('unregister leaves another live provider intact', () => {
		const { customer, service, emitters } = createCustomer();
		register(customer, 'retired');
		register(customer, 'live');
		const liveEmitter = emitters.get('live');
		customer.$unregisterTimelineProvider('retired');
		assert.deepStrictEqual({ sources: service.getSources().map(source => source.id), keys: [...emitters.keys()], sameLive: emitters.get('live') === liveEmitter }, { sources: ['live'], keys: ['live'], sameLive: true });
		customer.$unregisterTimelineProvider('live');
	});

	test('repeated and unknown unregister preserve live providers', () => {
		const { customer, service, emitters } = createCustomer();
		register(customer, 'live');
		customer.$unregisterTimelineProvider('missing');
		customer.$unregisterTimelineProvider('missing');
		assert.deepStrictEqual({ sources: service.getSources().map(source => source.id), keys: [...emitters.keys()] }, { sources: ['live'], keys: ['live'] });
		customer.$unregisterTimelineProvider('live');
	});

	test('successive disposed providers do not accumulate emitters', () => {
		const { customer, service, emitters } = createCustomer();
		for (let index = 0; index < 37; index++) {
			const id = `retired-${index}`;
			register(customer, id);
			customer.$unregisterTimelineProvider(id);
		}
		assert.deepStrictEqual({ sources: service.getSources(), emitters: emitters.size }, { sources: [], emitters: 0 });
	});

	test('re-registering a retired id uses a fresh emitter', () => {
		const { customer, emitters } = createCustomer();
		register(customer, 'reused');
		const retired = emitters.get('reused');
		customer.$unregisterTimelineProvider('reused');
		register(customer, 'reused');
		assert.notStrictEqual(emitters.get('reused'), retired);
		customer.$unregisterTimelineProvider('reused');
	});

	test('customer disposal unregisters its providers and releases emitters', () => {
		const { customer, service, emitters } = createCustomer();
		register(customer, 'first');
		register(customer, 'second');
		customer.dispose();
		assert.deepStrictEqual({ sources: service.getSources(), emitters: emitters.size }, { sources: [], emitters: 0 });
		service.unregisterTimelineProvider('first');
		service.unregisterTimelineProvider('second');
	});

	test('customer disposal preserves providers owned by another customer', () => {
		const { customer, service, emitters } = createCustomer();
		const other = store.add(service.registerTimelineProvider({ id: 'other', label: 'Other', scheme: 'file', provideTimeline: async () => ({ source: 'other', items: [] }), dispose() { } }));
		register(customer, 'retired');
		customer.dispose();
		assert.deepStrictEqual({ sources: service.getSources().map(source => source.id), emitters: emitters.size }, { sources: ['other'], emitters: 0 });
		other.dispose();
	});
});
