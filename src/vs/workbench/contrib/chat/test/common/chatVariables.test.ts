/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';

suite('ChatVariables', function () {

	let service: ChatVariablesService;

	setup(function () {
		service = new ChatVariablesService();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('ChatVariables - resolveVariables', async function () {

		const v1 = service.registerVariable({ name: 'foo', description: 'bar' }, async () => ([{ level: 'full', value: 'farboo' }]));
		const v2 = service.registerVariable({ name: 'far', description: 'boo' }, async () => ([{ level: 'full', value: 'farboo' }]));

		{
			const data = await service.resolveVariables('Hello @foo and@far', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data.variables).length, 1);
			assert.deepEqual(Object.keys(data.variables).sort(), ['foo']);
			assert.strictEqual(data.prompt, 'Hello [@foo](values:foo) and@far');
		}
		{
			const data = await service.resolveVariables('@foo Hello', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data.variables).length, 1);
			assert.deepEqual(Object.keys(data.variables).sort(), ['foo']);
			assert.strictEqual(data.prompt, '[@foo](values:foo) Hello');
		}
		{
			const data = await service.resolveVariables('Hello @foo', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data.variables).length, 1);
			assert.deepEqual(Object.keys(data.variables).sort(), ['foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo?', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data.variables).length, 1);
			assert.deepEqual(Object.keys(data.variables).sort(), ['foo']);
			assert.strictEqual(data.prompt, 'Hello [@foo](values:foo)?');
		}
		{
			const data = await service.resolveVariables('Hello @foo and@far @foo', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data.variables).length, 1);
			assert.deepEqual(Object.keys(data.variables).sort(), ['foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo and @far @foo', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data.variables).length, 2);
			assert.deepEqual(Object.keys(data.variables).sort(), ['far', 'foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo and @far @foo @unknown', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data.variables).length, 2);
			assert.deepEqual(Object.keys(data.variables).sort(), ['far', 'foo']);
			assert.strictEqual(data.prompt, 'Hello [@foo](values:foo) and [@far](values:far) [@foo](values:foo) @unknown');
		}

		v1.dispose();
		v2.dispose();
	});
});
