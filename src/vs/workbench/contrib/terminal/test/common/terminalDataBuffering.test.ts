/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TerminalDataBufferer } from '../../../../../platform/terminal/common/terminalDataBuffering.js';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

suite('Workbench - TerminalDataBufferer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let bufferer: TerminalDataBufferer;
	let counter: Map<number, number>;
	let data: Map<number, string>;

	setup(async () => {
		counter = new Map();
		data = new Map();
		bufferer = store.add(new TerminalDataBufferer((id, e) => {
			if (!counter.has(id)) {
				counter.set(id, 0);
			}
			counter.set(id, counter.get(id)! + 1);
			if (!data.has(id)) {
				data.set(id, '');
			}
			data.set(id, e);
		}));
	});

	test('start', async () => {
		const terminalOnData = new Emitter<string>();

		store.add(bufferer.startBuffering(1, terminalOnData.event, 0));

		terminalOnData.fire('1');
		terminalOnData.fire('2');
		terminalOnData.fire('3');

		await wait(0);

		terminalOnData.fire('4');

		assert.strictEqual(counter.get(1), 1);
		assert.strictEqual(data.get(1), '123');

		await wait(0);

		assert.strictEqual(counter.get(1), 2);
		assert.strictEqual(data.get(1), '4');
	});

	test('start 2', async () => {
		const terminal1OnData = new Emitter<string>();
		const terminal2OnData = new Emitter<string>();

		store.add(bufferer.startBuffering(1, terminal1OnData.event, 0));
		store.add(bufferer.startBuffering(2, terminal2OnData.event, 0));

		terminal1OnData.fire('1');
		terminal2OnData.fire('4');
		terminal1OnData.fire('2');
		terminal2OnData.fire('5');
		terminal1OnData.fire('3');
		terminal2OnData.fire('6');
		terminal2OnData.fire('7');

		assert.strictEqual(counter.get(1), undefined);
		assert.strictEqual(data.get(1), undefined);
		assert.strictEqual(counter.get(2), undefined);
		assert.strictEqual(data.get(2), undefined);

		await wait(0);

		assert.strictEqual(counter.get(1), 1);
		assert.strictEqual(data.get(1), '123');
		assert.strictEqual(counter.get(2), 1);
		assert.strictEqual(data.get(2), '4567');
	});

	test('stop', async () => {
		const terminalOnData = new Emitter<string>();

		bufferer.startBuffering(1, terminalOnData.event, 0);

		terminalOnData.fire('1');
		terminalOnData.fire('2');
		terminalOnData.fire('3');

		bufferer.stopBuffering(1);
		await wait(0);

		assert.strictEqual(counter.get(1), 1);
		assert.strictEqual(data.get(1), '123');
	});

	test('start 2 stop 1', async () => {
		const terminal1OnData = new Emitter<string>();
		const terminal2OnData = new Emitter<string>();

		bufferer.startBuffering(1, terminal1OnData.event, 0);
		store.add(bufferer.startBuffering(2, terminal2OnData.event, 0));

		terminal1OnData.fire('1');
		terminal2OnData.fire('4');
		terminal1OnData.fire('2');
		terminal2OnData.fire('5');
		terminal1OnData.fire('3');
		terminal2OnData.fire('6');
		terminal2OnData.fire('7');

		assert.strictEqual(counter.get(1), undefined);
		assert.strictEqual(data.get(1), undefined);
		assert.strictEqual(counter.get(2), undefined);
		assert.strictEqual(data.get(2), undefined);

		bufferer.stopBuffering(1);
		await wait(0);

		assert.strictEqual(counter.get(1), 1);
		assert.strictEqual(data.get(1), '123');
		assert.strictEqual(counter.get(2), 1);
		assert.strictEqual(data.get(2), '4567');
	});

	test('dispose should flush remaining data events', async () => {
		const terminal1OnData = new Emitter<string>();
		const terminal2OnData = new Emitter<string>();

		store.add(bufferer.startBuffering(1, terminal1OnData.event, 0));
		store.add(bufferer.startBuffering(2, terminal2OnData.event, 0));

		terminal1OnData.fire('1');
		terminal2OnData.fire('4');
		terminal1OnData.fire('2');
		terminal2OnData.fire('5');
		terminal1OnData.fire('3');
		terminal2OnData.fire('6');
		terminal2OnData.fire('7');

		assert.strictEqual(counter.get(1), undefined);
		assert.strictEqual(data.get(1), undefined);
		assert.strictEqual(counter.get(2), undefined);
		assert.strictEqual(data.get(2), undefined);

		bufferer.dispose();
		await wait(0);

		assert.strictEqual(counter.get(1), 1);
		assert.strictEqual(data.get(1), '123');
		assert.strictEqual(counter.get(2), 1);
		assert.strictEqual(data.get(2), '4567');
	});
});
