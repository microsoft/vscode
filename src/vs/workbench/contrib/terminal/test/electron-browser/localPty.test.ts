/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { Client as MessagePortClient } from '../../../../../base/parts/ipc/common/ipc.mp.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IPtyHostProcessReplayEvent } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { createLocalPtyChannel } from '../../../../../platform/terminal/common/localPtyChannel.js';
import { ILocalPtyService, IPtyService, TerminalIpcChannels } from '../../../../../platform/terminal/common/terminal.js';
import { LocalPty } from '../../electron-browser/localPty.js';

suite('LocalPty replay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reattachment replays once over the direct channel and completes after the renderer write', async () => {
		const output = store.add(new Emitter<{ id: number; event: string }>());
		const replay = store.add(new Emitter<{ id: number; event: IPtyHostProcessReplayEvent }>());
		const mainReplay = store.add(new Emitter<{ id: number; event: IPtyHostProcessReplayEvent }>());
		store.add(replay.event(e => mainReplay.fire(e)));
		createLocalPtyChannel(upcastPartial<ILocalPtyService>({ onProcessReplay: mainReplay.event }), store.add(new DisposableStore()));

		const recorded: string[] = [];
		const calls: string[] = [];
		let started = false;
		const hostService = {
			onProcessData: output.event,
			onProcessReplay: replay.event,
			async attachToProcess() { calls.push('attach'); },
			async detachFromProcess() { calls.push('detach'); },
			async start() {
				calls.push('start');
				if (started) {
					replay.fire({
						id: 1,
						event: {
							events: [{ cols: 80, rows: 24, data: recorded.join('') }],
							commands: { isWindowsPty: false, hasRichCommandDetection: false, commands: [], promptInputModel: undefined }
						}
					});
				}
				started = true;
			}
		};
		const hostChannel = ProxyChannel.fromService(hostService, store.add(new DisposableStore()));
		const replayWrite = new DeferredPromise<void>();
		store.add(toDisposable(() => { void replayWrite.complete(); }));
		const replayWriteStarted = new DeferredPromise<void>();
		const replayHandled = new DeferredPromise<void>();
		let replayEvents = 0;

		function connect() {
			const connection = store.add(new DisposableStore());
			const { port1, port2 } = new MessageChannel();
			const host = connection.add(new MessagePortClient(port1, 'ptyHost'));
			const renderer = connection.add(new MessagePortClient(port2, 'window'));
			host.registerChannel(TerminalIpcChannels.PtyHostWindow, hostChannel);
			const proxy = ProxyChannel.toService<IPtyService>(renderer.getChannel(TerminalIpcChannels.PtyHostWindow));
			const pty = connection.add(new LocalPty(1, true, proxy));
			connection.add(proxy.onProcessData(e => pty.handleData(e.event)));
			connection.add(proxy.onProcessReplay(e => {
				replayEvents++;
				void pty.handleReplay(e.event).then(() => replayHandled.complete(), error => replayHandled.error(error));
			}));
			return { connection, proxy, pty };
		}

		function emit(data: string) {
			recorded.push(data);
			output.fire({ id: 1, event: data });
		}

		const first = connect();
		await first.pty.start();
		const firstOutput = Event.toPromise(first.pty.onProcessData);
		emit('before\r\n');
		await firstOutput;
		await first.pty.detach(true);
		first.connection.dispose();
		emit('during\r\n');

		const second = connect();
		const received: string[] = [];
		let completions = 0;
		second.connection.add(second.pty.onProcessData(e => {
			if (typeof e === 'string') {
				received.push(e);
			} else {
				received.push(e.data);
				e.writePromise = replayWrite.p;
				void replayWriteStarted.complete();
			}
		}));
		second.connection.add(second.pty.onProcessReplayComplete(() => completions++));
		await second.proxy.attachToProcess(1);
		await second.pty.start();
		await replayWriteStarted.p;
		deepStrictEqual({ replayEvents, completions, received }, {
			replayEvents: 1,
			completions: 0,
			received: ['before\r\nduring\r\n']
		});

		await replayWrite.complete();
		await replayHandled.p;
		const afterOutput = Event.toPromise(second.pty.onProcessData);
		emit('after\r\n');
		await afterOutput;
		deepStrictEqual({ calls, replayEvents, completions, received, mainReplayBuffered: mainReplay.hasListeners() }, {
			calls: ['start', 'detach', 'attach', 'start'],
			replayEvents: 1,
			completions: 1,
			received: ['before\r\nduring\r\n', 'after\r\n'],
			mainReplayBuffered: false
		});
	});
});
