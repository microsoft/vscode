/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DisposableMap } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { MainThreadTimeline } from '../../browser/mainThreadTimeline.js';
import { ExtHostTimelineShape } from '../../common/extHost.protocol.js';
import { TimelineTriggerKind } from '../../../contrib/timeline/common/timeline.js';
import { TimelineService } from '../../../contrib/timeline/common/timelineService.js';
import { TestViewsService } from '../../../test/browser/workbenchTestServices.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadTimeline', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	function createCustomer() {
		const service = store.add(new TimelineService(new NullLogService(), new TestViewsService(), new TestConfigurationService(), new MockContextKeyService()));
		const proxy = new class extends mock<ExtHostTimelineShape>() {
			override async $getTimeline(id: string, uri: UriComponents | undefined) {
				return { source: id, items: [{ handle: 'item', source: id, label: uri ? 'Timeline item' : 'Workspace item', timestamp: 1 }] };
			}
		};
		const customer = store.add(new MainThreadTimeline(SingleProxyRPCProtocol(proxy), new NullLogService(), service));
		const emitters: DisposableMap<string, Emitter<readonly URI[] | undefined>> = Reflect.get(customer, '_providerEmitters');
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
		const changes: unknown[] = [];
		store.add(service.onDidChangeTimeline(event => changes.push({ id: event.id, workspace: event.workspace, uris: event.uris?.map(uri => uri.toString()) })));
		customer.$emitTimelineChangeEvent('live', undefined);
		customer.$emitTimelineChangeEvent('live', [URI.file('/timeline.txt')]);
		const token = store.add(new CancellationTokenSource());
		const result = await service.getTimeline('live', URI.file('/timeline.txt'), { triggerKind: TimelineTriggerKind.Automatic }, token)?.result;
		assert.deepStrictEqual({ changes, labels: result?.items.map(item => item.label), emitters: emitters.size }, {
			changes: [{ id: 'live', workspace: false, uris: undefined }, { id: 'live', workspace: false, uris: ['file:///timeline.txt'] }],
			labels: ['Timeline item'],
			emitters: 1
		});
		customer.$unregisterTimelineProvider('live');
	});

	test('workspace provider forwards workspace timeline requests and change events', async () => {
		const { customer, service } = createCustomer();
		customer.$registerTimelineProvider({ id: 'shared', label: 'Shared', scheme: 'file' });
		customer.$registerWorkspaceTimelineProvider({ id: 'shared', label: 'Shared' });
		const changes: unknown[] = [];
		store.add(service.onDidChangeTimeline(event => changes.push({ id: event.id, workspace: event.workspace })));
		customer.$emitWorkspaceTimelineChangeEvent('shared');
		const token = store.add(new CancellationTokenSource());
		const result = await service.getTimeline('shared', undefined, { triggerKind: TimelineTriggerKind.Automatic }, token)?.result;
		const sources = service.getSources().map(source => source.id);
		customer.$unregisterWorkspaceTimelineProvider('shared');
		assert.deepStrictEqual({ changes, labels: result?.items.map(item => item.label), sources, hasWorkspaceProviders: service.hasWorkspaceProviders(), remaining: service.getSources().map(source => source.id) }, {
			changes: [{ id: 'shared', workspace: true }],
			labels: ['Workspace item'],
			sources: ['shared'],
			hasWorkspaceProviders: false,
			remaining: ['shared'],
		});
		customer.$unregisterTimelineProvider('shared');
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
		emitter.fire(undefined);
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
