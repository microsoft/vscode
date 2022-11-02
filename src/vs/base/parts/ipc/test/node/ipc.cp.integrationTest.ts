/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from 'vs/base/common/event';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { getPathFromAmdModule } from 'vs/base/test/node/testUtils';
import { TestServiceClient } from './testService';

function createClient(): Client {
	return new Client(getPathFromAmdModule(require, 'bootstrap-fork'), {
		serverName: 'TestServer',
		env: { VSCODE_AMD_ENTRYPOINT: 'vs/base/parts/ipc/test/node/testApp', verbose: true }
	});
}

suite('IPC, Child Process', function () {
	this.slow(2000);
	this.timeout(10000);

	test('createChannel', async () => {
		const client = createClient();
		const channel = client.getChannel('test');
		const service = new TestServiceClient(channel);

		const result = await service.pong('ping');
		assert.strictEqual(result.incoming, 'ping');
		assert.strictEqual(result.outgoing, 'pong');

		client.dispose();
	});

	test('events', async () => {
		const client = createClient();
		const channel = client.getChannel('test');
		const service = new TestServiceClient(channel);

		const event = Event.toPromise(Event.once(service.onMarco));
		const promise = service.marco();

		const [promiseResult, eventResult] = await Promise.all([promise, event]);

		assert.strictEqual(promiseResult, 'polo');
		assert.strictEqual(eventResult.answer, 'polo');

		client.dispose();
	});

	test('event dispose', async () => {
		const client = createClient();
		const channel = client.getChannel('test');
		const service = new TestServiceClient(channel);

		let count = 0;
		const disposable = service.onMarco(() => count++);

		const answer = await service.marco();
		assert.strictEqual(answer, 'polo');
		assert.strictEqual(count, 1);

		const answer_1 = await service.marco();
		assert.strictEqual(answer_1, 'polo');
		assert.strictEqual(count, 2);
		disposable.dispose();

		const answer_2 = await service.marco();
		assert.strictEqual(answer_2, 'polo');
		assert.strictEqual(count, 2);

		client.dispose();
	});
});
