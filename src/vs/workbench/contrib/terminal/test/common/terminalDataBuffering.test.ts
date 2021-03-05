/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { TerminalDataBufferer } from 'vs/workbench/contrib/terminal/common/terminalDataBuffering';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

suite('Workbench - TerminalDataBufferer', () => {
	let bufferer: TerminalDataBufferer;

	setup(async () => {
		bufferer = new TerminalDataBufferer();
	});

	test('start', async () => {
		let terminalOnData = new Emitter<string>();
		let counter = 0;
		let data: string | undefined;

		bufferer.startBuffering(1, terminalOnData.event, (id, e) => {
			counter++;
			data = e;
		}, 0);

		terminalOnData.fire('1');
		terminalOnData.fire('2');
		terminalOnData.fire('3');

		await wait(0);

		terminalOnData.fire('4');

		assert.equal(counter, 1);
		assert.equal(data, '123');

		await wait(0);

		assert.equal(counter, 2);
		assert.equal(data, '4');
	});

	test('start 2', async () => {
		let terminal1OnData = new Emitter<string>();
		let terminal1Counter = 0;
		let terminal1Data: string | undefined;

		bufferer.startBuffering(1, terminal1OnData.event, (id, e) => {
			terminal1Counter++;
			terminal1Data = e;
		}, 0);

		let terminal2OnData = new Emitter<string>();
		let terminal2Counter = 0;
		let terminal2Data: string | undefined;

		bufferer.startBuffering(2, terminal2OnData.event, (id, e) => {
			terminal2Counter++;
			terminal2Data = e;
		}, 0);

		terminal1OnData.fire('1');
		terminal2OnData.fire('4');
		terminal1OnData.fire('2');
		terminal2OnData.fire('5');
		terminal1OnData.fire('3');
		terminal2OnData.fire('6');
		terminal2OnData.fire('7');

		assert.equal(terminal1Counter, 0);
		assert.equal(terminal1Data, undefined);
		assert.equal(terminal2Counter, 0);
		assert.equal(terminal2Data, undefined);

		await wait(0);

		assert.equal(terminal1Counter, 1);
		assert.equal(terminal1Data, '123');
		assert.equal(terminal2Counter, 1);
		assert.equal(terminal2Data, '4567');
	});

	test('stop', async () => {
		let terminalOnData = new Emitter<string>();
		let counter = 0;
		let data: string | undefined;

		bufferer.startBuffering(1, terminalOnData.event, (id, e) => {
			counter++;
			data = e;
		}, 0);

		terminalOnData.fire('1');
		terminalOnData.fire('2');
		terminalOnData.fire('3');

		bufferer.stopBuffering(1);

		await wait(0);

		assert.equal(counter, 0);
		assert.equal(data, undefined);
	});

	test('start 2 stop 1', async () => {
		let terminal1OnData = new Emitter<string>();
		let terminal1Counter = 0;
		let terminal1Data: string | undefined;

		bufferer.startBuffering(1, terminal1OnData.event, (id, e) => {
			terminal1Counter++;
			terminal1Data = e;
		}, 0);

		let terminal2OnData = new Emitter<string>();
		let terminal2Counter = 0;
		let terminal2Data: string | undefined;

		bufferer.startBuffering(2, terminal2OnData.event, (id, e) => {
			terminal2Counter++;
			terminal2Data = e;
		}, 0);


		terminal1OnData.fire('1');
		terminal2OnData.fire('4');
		terminal1OnData.fire('2');
		terminal2OnData.fire('5');
		terminal1OnData.fire('3');
		terminal2OnData.fire('6');
		terminal2OnData.fire('7');

		assert.equal(terminal1Counter, 0);
		assert.equal(terminal1Data, undefined);
		assert.equal(terminal2Counter, 0);
		assert.equal(terminal2Data, undefined);

		bufferer.stopBuffering(1);
		await wait(0);

		assert.equal(terminal1Counter, 0);
		assert.equal(terminal1Data, undefined);
		assert.equal(terminal2Counter, 1);
		assert.equal(terminal2Data, '4567');
	});

	test('dispose', async () => {
		let terminal1OnData = new Emitter<string>();
		let terminal1Counter = 0;
		let terminal1Data: string | undefined;

		bufferer.startBuffering(1, terminal1OnData.event, (id, e) => {
			terminal1Counter++;
			terminal1Data = e;
		}, 0);

		let terminal2OnData = new Emitter<string>();
		let terminal2Counter = 0;
		let terminal2Data: string | undefined;

		bufferer.startBuffering(2, terminal2OnData.event, (id, e) => {
			terminal2Counter++;
			terminal2Data = e;
		}, 0);


		terminal1OnData.fire('1');
		terminal2OnData.fire('4');
		terminal1OnData.fire('2');
		terminal2OnData.fire('5');
		terminal1OnData.fire('3');
		terminal2OnData.fire('6');
		terminal2OnData.fire('7');

		assert.equal(terminal1Counter, 0);
		assert.equal(terminal1Data, undefined);
		assert.equal(terminal2Counter, 0);
		assert.equal(terminal2Data, undefined);

		bufferer.dispose();
		await wait(0);

		assert.equal(terminal1Counter, 0);
		assert.equal(terminal1Data, undefined);
		assert.equal(terminal2Counter, 0);
		assert.equal(terminal2Data, undefined);
	});
});
