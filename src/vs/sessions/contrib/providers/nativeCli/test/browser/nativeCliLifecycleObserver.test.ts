/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { INativeCliLifecycleEvent } from '../../../../../../platform/agentHost/common/nativeCliLifecycle.js';
import { IFileContent, IFileService, IReadFileOptions } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { NativeCliLifecycleObserver } from '../../browser/nativeCliLifecycleObserver.js';

suite('Native CLI lifecycle observer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const event: INativeCliLifecycleEvent = {
		sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', event: 'prompt', cwd: '/repo', timestamp: 1, title: 'Fix tests',
	};

	function createHarness(onEvent?: (event: INativeCliLifecycleEvent) => Promise<void>) {
		let content = VSBuffer.alloc(0);
		const events: INativeCliLifecycleEvent[] = [];
		const errors: unknown[] = [];
		let watches = 0;
		const files = new class extends mock<IFileService>() {
			override createWatcher() {
				watches++;
				return { onDidChange: Event.None, dispose: () => { watches--; } };
			}
			override async readFile(_resource: URI, options?: IReadFileOptions): Promise<IFileContent> {
				const start = options?.position ?? 0;
				return upcastPartial<IFileContent>({ value: content.slice(start, start + (options?.length ?? content.byteLength)) });
			}
		}();
		const observer = store.add(new NativeCliLifecycleObserver(URI.file('/events.jsonl'), async event => {
			events.push(event);
			await onEvent?.(event);
		}, error => errors.push(error), files, new NullLogService()));
		return { observer, events, errors, setContent: (value: VSBuffer) => content = value, watches: () => watches };
	}

	test('reads only complete records, retaining partial UTF-8 characters across appends', async () => {
		const { observer, events, setContent } = createHarness();
		const message = { ...event, title: 'Fix \u2713 tests' };
		const bytes = VSBuffer.fromString(`${JSON.stringify(message)}\n`);
		const character = bytes.buffer.indexOf(0xe2);
		setContent(bytes.slice(0, character + 1));
		await observer.read();
		const partialCount = events.length;
		setContent(bytes);
		await observer.read();
		await observer.read();
		assert.deepStrictEqual({ partialCount, events, connected: observer.hasEvents }, { partialCount: 0, events: [message], connected: true });
	});

	test('serializes readers and stops dispatching when disposed during a callback', async () => {
		const gate = new DeferredPromise<void>();
		const entered = new DeferredPromise<void>();
		const { observer, events, setContent, watches } = createHarness(async () => {
			await entered.complete();
			await gate.p;
		});
		setContent(VSBuffer.fromString(`${JSON.stringify(event)}\n${JSON.stringify({ ...event, event: 'stop' })}\n`));
		const first = observer.read();
		await entered.p;
		const second = observer.read();
		observer.dispose();
		await gate.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual({ events, watches: watches() }, { events: [event], watches: 0 });
	});

	test('surfaces malformed records and rejects unbounded partial records', async () => {
		const malformed = createHarness();
		malformed.setContent(VSBuffer.fromString('{"sessionId":"invalid"}\n'));
		await assert.rejects(malformed.observer.read(), /Invalid native CLI lifecycle metadata/);
		const oversized = createHarness();
		oversized.setContent(VSBuffer.fromString('x'.repeat(65537)));
		await assert.rejects(oversized.observer.read(), /exceeded its limit/);
		assert.deepStrictEqual([malformed.errors.length, oversized.errors.length], [1, 1]);
	});
});
