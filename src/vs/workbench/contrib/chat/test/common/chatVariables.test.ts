/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';

suite('ChatVariables', function () {

	let service: ChatVariablesService;

	setup(function () {
		service = new ChatVariablesService();
	});


	test('ChatVariables - resolveVariables', async function () {
		service.registerVariable({ name: 'foo', description: 'bar' }, async () => ([{ level: 'full', value: 'farboo' }]));
		service.registerVariable({ name: 'far', description: 'boo' }, async () => ([{ level: 'full', value: 'farboo' }]));

		{
			const data = await service.resolveVariables('Hello @foo and@far', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data).length, 1);
			assert.deepEqual(Object.keys(data).sort(), ['foo']);
		}
		{
			const data = await service.resolveVariables('@foo Hello', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data).length, 1);
			assert.deepEqual(Object.keys(data).sort(), ['foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data).length, 1);
			assert.deepEqual(Object.keys(data).sort(), ['foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo and@far @foo', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data).length, 1);
			assert.deepEqual(Object.keys(data).sort(), ['foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo and @far @foo', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data).length, 2);
			assert.deepEqual(Object.keys(data).sort(), ['far', 'foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo and @far @foo @unknown', null!, CancellationToken.None);
			assert.strictEqual(Object.keys(data).length, 2);
			assert.deepEqual(Object.keys(data).sort(), ['far', 'foo']);
		}
	});
});
