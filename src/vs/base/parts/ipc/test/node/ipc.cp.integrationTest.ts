/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../common/async.js';
import { Event } from '../../../../common/event.js';
import { IChannel } from '../../common/ipc.js';
import { Client } from '../../node/ipc.cp.js';
import { ITestService, TestServiceClient } from './testService.js';
import { FileAccess } from '../../../../common/network.js';

function createClient(env?: Record<string, string>): Client {
	return new Client(FileAccess.asFileUri('bootstrap-fork').fsPath, {
		serverName: 'TestServer',
		env: { VSCODE_ESM_ENTRYPOINT: 'vs/base/parts/ipc/test/node/testApp', verbose: true, ...env }
	});
}

suite('IPC, Child Process', function () {
	this.slow(2000);
	this.timeout(10000);

	let client: Client;
	let channel: IChannel;
	let service: ITestService;

	setup(() => {
		client = createClient();
		channel = client.getChannel('test');
		service = new TestServiceClient(channel);
	});

	teardown(() => {
		client.dispose();
	});

	test('createChannel', async () => {
		const result = await service.pong('ping');
		assert.strictEqual(result.incoming, 'ping');
		assert.strictEqual(result.outgoing, 'pong');
	});

	test('events', async () => {
		const event = Event.toPromise(Event.once(service.onMarco));
		const promise = service.marco();

		const [promiseResult, eventResult] = await Promise.all([promise, event]);

		assert.strictEqual(promiseResult, 'polo');
		assert.strictEqual(eventResult.answer, 'polo');
	});

	test('event dispose', async () => {
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
	});

	test('rejected call does not cause an unhandled rejection', async () => {
		await assert.rejects(channel.call('unknown'), /command not found: unknown/);
		await timeout(0);
	});

	test('deferred cancellation does not cause unhandled rejections', async () => {
		client.dispose();
		client = createClient({ VSCODE_IPC_TEST_DEFERRED_CANCELLATION: 'true' });
		channel = client.getChannel('test');
		const onDidProcessExit = Event.toPromise(Event.once(client.onDidProcessExit));
		const result = channel.call('start');

		const { code } = await onDidProcessExit;
		await assert.rejects(result, /Canceled/);
		assert.strictEqual(code, 0);
	});
});
