/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Emitter } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IUserActivityCaptureService, IUserActivityEvent } from '../../../services/userActivity/common/userActivityCapture.js';
import { MainThreadUserActivity } from '../../browser/mainThreadUserActivity.js';
import { ExtHostUserActivityShape, IUserActivityEventDto } from '../../common/extHost.protocol.js';
import { toApiUserActivityEvent } from '../../common/extHostUserActivity.js';
import { UserActivityKind } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadUserActivity', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;
	let starts: number;
	let onDidRecord: Emitter<IUserActivityEvent>;
	let batches: IUserActivityEventDto[][];
	let mainThread: MainThreadUserActivity;

	const event = (i: number): IUserActivityEvent => ({ kind: 'click', time: i, target: { area: 'editor', label: `#${i}` } });

	setup(() => {
		clock = sinon.useFakeTimers();
		starts = 0;
		batches = [];
		onDidRecord = store.add(new Emitter<IUserActivityEvent>());
		const capture: IUserActivityCaptureService = {
			_serviceBrand: undefined,
			onDidRecord: onDidRecord.event,
			get isCapturing() { return starts > 0; },
			start: () => {
				starts++;
				return toDisposable(() => starts--);
			},
		};
		const proxy: Partial<ExtHostUserActivityShape> = { $acceptUserActivity: events => batches.push(events) };
		mainThread = store.add(new MainThreadUserActivity(SingleProxyRPCProtocol(proxy), capture));
	});

	teardown(() => clock.restore());

	test('captures only while the extension host listens', () => {
		onDidRecord.fire(event(0));
		assert.strictEqual(starts, 0);

		mainThread.$setListening(true);
		mainThread.$setListening(true);
		assert.strictEqual(starts, 1);

		mainThread.$setListening(false);
		assert.strictEqual(starts, 0);
		onDidRecord.fire(event(1));
		clock.tick(2000);
		assert.deepStrictEqual(batches, []);
	});

	test('sends a batch each second, or at once when 50 events wait', () => {
		mainThread.$setListening(true);
		onDidRecord.fire(event(1));
		onDidRecord.fire(event(2));
		clock.tick(999);
		assert.strictEqual(batches.length, 0);
		clock.tick(1);
		assert.deepStrictEqual(batches.map(b => b.length), [2]);

		for (let i = 0; i < 50; i++) {
			onDidRecord.fire(event(i));
		}
		assert.deepStrictEqual(batches.map(b => b.length), [2, 50]);
		clock.tick(5000);
		assert.strictEqual(batches.length, 2);
	});

	test('stops capture when disposed', () => {
		mainThread.$setListening(true);
		onDidRecord.fire(event(1));
		mainThread.dispose();
		assert.strictEqual(starts, 0);
		clock.tick(2000);
		assert.deepStrictEqual(batches, []);
	});

	test('the API event has the enum kind and a revived URI', () => {
		const uri = URI.file('/work/a.ts');
		const dto = JSON.parse(JSON.stringify({ kind: 'search', time: 5, target: { area: 'editor', uri, line: 3 }, text: 'query', detail: { window: 'editor' } })) as IUserActivityEventDto;
		const api = toApiUserActivityEvent(dto);
		assert.strictEqual(api.kind, UserActivityKind.Search);
		assert.strictEqual(toApiUserActivityEvent({ ...dto, kind: 'focus' }).kind, UserActivityKind.Focus);
		assert.ok(URI.isUri(api.target.uri));
		assert.strictEqual(api.target.uri?.toString(), uri.toString());
		assert.deepStrictEqual({ area: api.target.area, line: api.target.line, text: api.text, detail: api.detail }, { area: 'editor', line: 3, text: 'query', detail: { window: 'editor' } });
	});
});
