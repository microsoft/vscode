/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ChannelClient, ChannelServer, IMessagePassingProtocol, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewEvent, IBrowserViewInfo, IBrowserViewNavigationEvent, IBrowserViewService, reviveBrowserViewInfo, serializeBrowserViewInfo } from '../../common/browserView.js';

class QueuedProtocol extends Disposable implements IMessagePassingProtocol {
	private readonly messages = this._register(new Emitter<VSBuffer>());
	readonly onMessage = this.messages.event;
	readonly pending: VSBuffer[] = [];
	peer!: QueuedProtocol;

	send(buffer: VSBuffer): void {
		this.peer.pending.push(buffer);
	}

	flush(): void {
		while (this.pending.length) {
			this.messages.fire(this.pending.shift()!);
		}
	}
}

class TestBrowserViewService extends Disposable {
	private readonly events = this._register(new DisposableMap<number, Emitter<BrowserViewEvent>>());

	constructor(private readonly views: IBrowserViewInfo[] = []) {
		super();
	}

	onDynamicBrowserViewEvent(windowId: number): Event<BrowserViewEvent> {
		let emitter = this.events.get(windowId);
		if (!emitter) {
			emitter = new Emitter<BrowserViewEvent>();
			this.events.set(windowId, emitter);
		}
		const event = emitter.event;
		return (listener, thisArgs, disposables) => {
			const views = this.views.filter(info => info.host.windowId === windowId).map(serializeBrowserViewInfo);
			const subscription = event(listener, thisArgs, disposables);
			listener.call(thisArgs, [{ type: 'snapshot', windowId, views: views.map(([info]) => info) }, views.map(([, screenshot]) => screenshot)]);
			return subscription;
		};
	}

	emit(event: BrowserViewEvent): void {
		this.events.get(event[0].windowId)?.fire(event);
	}
}

suite('BrowserView event IPC', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function connect(source: object, windowId = 1) {
		const renderer = store.add(new QueuedProtocol());
		const main = store.add(new QueuedProtocol());
		renderer.peer = main;
		main.peer = renderer;
		const server = store.add(new ChannelServer(main, `window:${windowId}`));
		server.registerChannel('browserView', ProxyChannel.fromService(source, store.add(new DisposableStore())));
		const client = store.add(new ChannelClient(renderer));
		renderer.flush();
		const service = ProxyChannel.toService<IBrowserViewService>(client.getChannel('browserView'));
		return { renderer, main, service, client };
	}

	function info(id: string, windowId = 1, lastScreenshot?: VSBuffer): IBrowserViewInfo {
		return upcastPartial<IBrowserViewInfo>({
			id, host: { windowId }, owner: { type: 'user' },
			state: upcastPartial<IBrowserViewInfo['state']>({ url: 'https://example.com/', lastScreenshot })
		});
	}

	test('forwards immediate browser events without any per-browser subscription requests', () => {
		const source = store.add(new TestBrowserViewService());
		const { service, renderer, main } = connect(source);
		const received: string[] = [];
		store.add(service.onDynamicBrowserViewEvent(1)(([event]) => {
			received.push(event.type === 'changed' ? event.event : event.type);
		}));
		main.flush();
		renderer.flush();
		const [created, screenshot] = serializeBrowserViewInfo(info('page'));
		source.emit([{ type: 'created', windowId: 1, data: { info: created, initialUrl: 'https://example.com/', editorOpenRequest: { background: true } } }, [screenshot]]);
		source.emit([{
			type: 'changed', windowId: 1, id: 'page', event: 'onDidNavigate', data: {
				url: 'https://example.com/', title: 'Example', canGoBack: false, canGoForward: false, certificateError: undefined
			}
		}, []]);
		source.emit([{ type: 'changed', windowId: 1, id: 'page', event: 'onDidChangeTitle', data: { title: 'Example' } }, []]);
		source.emit([{ type: 'changed', windowId: 1, id: 'page', event: 'onDidChangeLoadingState', data: { loading: false } }, []]);
		source.emit([{ type: 'changed', windowId: 1, id: 'page', event: 'onDidClose', data: undefined }, []]);
		renderer.flush();

		assert.deepStrictEqual({ received, reverseMessages: main.pending.length }, {
			received: ['snapshot', 'created', 'onDidNavigate', 'onDidChangeTitle', 'onDidChangeLoadingState', 'onDidClose'],
			reverseMessages: 0
		});
	});

	test('orders restored snapshots before live changes and isolates workbench windows', () => {
		const source = store.add(new TestBrowserViewService([info('one'), info('two', 2)]));
		const first = connect(source);
		const second = connect(source, 2);
		const received: string[][] = [[], []];
		for (const [index, connection] of [first, second].entries()) {
			store.add(connection.service.onDynamicBrowserViewEvent(index + 1)(([event]) => {
				if (event.type === 'snapshot') {
					received[index].push(...event.views.map(info => info.id));
				} else if (event.type === 'changed' && event.event === 'onDidChangeTitle') {
					received[index].push(event.data.title);
				}
			}));
		}
		first.main.flush();
		second.main.flush();
		source.emit([{ type: 'changed', windowId: 1, id: 'one', event: 'onDidChangeTitle', data: { title: 'newer than snapshot' } }, []]);
		first.renderer.flush();
		second.renderer.flush();
		assert.deepStrictEqual(received, [['one', 'newer than snapshot'], ['two']]);
	});

	test('sends a fresh snapshot only to the new subscriber without an initialization RPC', () => {
		const views = [info('one')];
		const source = store.add(new TestBrowserViewService(views));
		const { service, main, renderer } = connect(source);
		const received: string[][] = [[], []];
		const event = service.onDynamicBrowserViewEvent(1);
		const first = store.add(event(([event]) => {
			if (event.type === 'snapshot') {
				received[0].push(...event.views.map(info => info.id));
			}
		}));
		main.flush();
		renderer.flush();
		views.push(info('two'));
		store.add(service.onDynamicBrowserViewEvent(1)(([event]) => {
			if (event.type === 'snapshot') {
				received[1].push(...event.views.map(info => info.id));
			}
		}));
		main.flush();
		renderer.flush();
		first.dispose();
		main.flush();
		views.push(info('three'));
		const resubscribed: string[] = [];
		store.add(event(([event]) => {
			if (event.type === 'snapshot') {
				resubscribed.push(...event.views.map(info => info.id));
			}
		}));
		main.flush();
		renderer.flush();
		assert.deepStrictEqual({ received, resubscribed, reverseMessages: main.pending.length }, {
			received: [['one'], ['one', 'two']],
			resubscribed: ['one', 'two', 'three'],
			reverseMessages: 0
		});
	});

	test('preserves screenshot buffers and creation metadata through the standard proxy', () => {
		const source = store.add(new TestBrowserViewService([info('restored', 1, VSBuffer.fromString('snapshot'))]));
		const { service, main, renderer } = connect(source);
		const received: object[] = [];
		store.add(service.onDynamicBrowserViewEvent(1)(([event, screenshots]) => {
			if (event.type === 'snapshot') {
				const restored = reviveBrowserViewInfo(event.views[0], screenshots[0]);
				received.push({ id: restored.id, buffer: restored.state.lastScreenshot instanceof VSBuffer, screenshot: restored.state.lastScreenshot?.toString() });
			} else if (event.type === 'created') {
				const created = reviveBrowserViewInfo(event.data.info, screenshots[0]);
				received.push({ id: created.id, buffer: created.state.lastScreenshot instanceof VSBuffer, screenshot: created.state.lastScreenshot?.toString(), editor: event.data.editorOpenRequest });
			}
		}));
		main.flush();
		const [created, screenshot] = serializeBrowserViewInfo(info('created', 1, VSBuffer.fromString('creation')));
		source.emit([{ type: 'created', windowId: 1, data: { info: created, editorOpenRequest: { background: true } } }, [screenshot]]);
		renderer.flush();
		assert.deepStrictEqual(received, [
			{ id: 'restored', buffer: true, screenshot: 'snapshot' },
			{ id: 'created', buffer: true, screenshot: 'creation', editor: { background: true } }
		]);
	});

	test('does not replay transient events to a reconnected workbench', () => {
		const source = store.add(new TestBrowserViewService([info('page')]));
		const first = connect(source);
		const received: string[] = [];
		const listener = store.add(first.service.onDynamicBrowserViewEvent(1)(([event]) => received.push(event.type)));
		first.main.flush();
		listener.dispose();
		first.main.flush();
		source.emit([{ type: 'changed', windowId: 1, id: 'page', event: 'onDidPickArea', data: undefined }, []]);

		const reconnected = connect(source);
		store.add(reconnected.service.onDynamicBrowserViewEvent(1)(([event]) => received.push(event.type)));
		reconnected.main.flush();
		reconnected.renderer.flush();
		assert.deepStrictEqual(received, ['snapshot']);
	});

	test('demonstrates the old per-browser subscription gap with delayed reverse traffic', () => {
		class Source extends Disposable {
			readonly navigation = this._register(new Emitter<IBrowserViewNavigationEvent>());
			onDynamicDidNavigate(_id: string): Event<IBrowserViewNavigationEvent> {
				return this.navigation.event;
			}
		}
		const source = store.add(new Source());
		const { main, renderer, client } = connect(source);
		const proxy = ProxyChannel.toService<Pick<Source, 'onDynamicDidNavigate'>>(client.getChannel('browserView'));
		const received: string[] = [];
		store.add(proxy.onDynamicDidNavigate('page')(e => received.push(e.url)));
		const navigation = { url: 'lost', title: '', canGoBack: false, canGoForward: false, certificateError: undefined };
		source.navigation.fire(navigation);
		main.flush();
		source.navigation.fire({ ...navigation, url: 'delivered' });
		renderer.flush();
		assert.deepStrictEqual(received, ['delivered']);
	});
});
