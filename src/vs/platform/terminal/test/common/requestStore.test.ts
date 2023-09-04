/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fail, strictEqual } from 'assert';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ConsoleLogger, ILogService } from 'vs/platform/log/common/log';
import { LogService } from 'vs/platform/log/common/logService';
import { RequestStore } from 'vs/platform/terminal/common/requestStore';

suite('RequestStore', () => {
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(ILogService, new LogService(new ConsoleLogger()));
	});

	teardown(() => {
		instantiationService.dispose();
	});

	test('should resolve requests', async () => {
		const store: RequestStore<{ data: string }, { arg: string }> = instantiationService.createInstance(RequestStore<{ data: string }, { arg: string }>, undefined);
		let eventArgs: { requestId: number; arg: string } | undefined;
		store.onCreateRequest(e => eventArgs = e);
		const request = store.createRequest({ arg: 'foo' });
		strictEqual(typeof eventArgs?.requestId, 'number');
		strictEqual(eventArgs?.arg, 'foo');
		store.acceptReply(eventArgs!.requestId, { data: 'bar' });
		const result = await request;
		strictEqual(result.data, 'bar');
	});

	test('should reject the promise when the request times out', async () => {
		const store: RequestStore<{ data: string }, { arg: string }> = instantiationService.createInstance(RequestStore<{ data: string }, { arg: string }>, 1);
		const request = store.createRequest({ arg: 'foo' });
		let threw = false;
		try {
			await request;
		} catch (e) {
			threw = true;
		}
		if (!threw) {
			fail();
		}
	});
});
