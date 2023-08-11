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
		service.registerVariable({ name: 'foo', description: 'bar' }, async () => ({ content: 'farboo' }));
		service.registerVariable({ name: 'far', description: 'boo' }, async () => ({ content: 'farboo' }));

		{
			const data = await service.resolveVariables('Hello @foo and@far', CancellationToken.None);
			assert.strictEqual(data.size, 1);
			assert.deepEqual([...data.keys()].sort(), ['foo']);
		}
		{
			const data = await service.resolveVariables('@foo Hello', CancellationToken.None);
			assert.strictEqual(data.size, 1);
			assert.deepEqual([...data.keys()].sort(), ['foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo', CancellationToken.None);
			assert.strictEqual(data.size, 1);
			assert.deepEqual([...data.keys()].sort(), ['foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo and@far @foo', CancellationToken.None);
			assert.strictEqual(data.size, 1);
			assert.deepEqual([...data.keys()].sort(), ['foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo and @far @foo', CancellationToken.None);
			assert.strictEqual(data.size, 2);
			assert.deepEqual([...data.keys()].sort(), ['far', 'foo']);
		}
		{
			const data = await service.resolveVariables('Hello @foo and @far @foo @unknown', CancellationToken.None);
			assert.strictEqual(data.size, 2);
			assert.deepEqual([...data.keys()].sort(), ['far', 'foo']);
		}
	});
});
