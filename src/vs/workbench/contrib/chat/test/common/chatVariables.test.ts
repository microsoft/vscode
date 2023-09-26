/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ChatAgentService, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatRequestParser } from 'vs/workbench/contrib/chat/common/chatRequestParser';
import { ChatVariablesService, IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

suite('ChatVariables', function () {

	let service: ChatVariablesService;
	let instantiationService: TestInstantiationService;
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		service = new ChatVariablesService();
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IChatVariablesService, service);
		instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
	});

	test('ChatVariables - resolveVariables', async function () {

		const v1 = service.registerVariable({ name: 'foo', description: 'bar' }, async () => ([{ level: 'full', value: 'farboo' }]));
		const v2 = service.registerVariable({ name: 'far', description: 'boo' }, async () => ([{ level: 'full', value: 'farboo' }]));

		const parser = instantiationService.createInstance(ChatRequestParser);

		const resolveVariables = async (text: string) => {
			const result = await parser.parseChatRequest('1', text);
			return await service.resolveVariables(result, null!, CancellationToken.None);
		};

		{
			const data = await resolveVariables('Hello #foo and#far');
			assert.strictEqual(Object.keys(data.variables).length, 1);
			assert.deepEqual(Object.keys(data.variables).sort(), ['foo']);
			assert.strictEqual(data.prompt, 'Hello [#foo](values:foo) and#far');
		}
		{
			const data = await resolveVariables('#foo Hello');
			assert.strictEqual(Object.keys(data.variables).length, 1);
			assert.deepEqual(Object.keys(data.variables).sort(), ['foo']);
			assert.strictEqual(data.prompt, '[#foo](values:foo) Hello');
		}
		{
			const data = await resolveVariables('Hello #foo');
			assert.strictEqual(Object.keys(data.variables).length, 1);
			assert.deepEqual(Object.keys(data.variables).sort(), ['foo']);
		}
		{
			const data = await resolveVariables('Hello #foo?');
			assert.strictEqual(Object.keys(data.variables).length, 1);
			assert.deepEqual(Object.keys(data.variables).sort(), ['foo']);
			assert.strictEqual(data.prompt, 'Hello [#foo](values:foo)?');
		}
		{
			const data = await resolveVariables('Hello #foo and#far #foo');
			assert.strictEqual(Object.keys(data.variables).length, 1);
			assert.deepEqual(Object.keys(data.variables).sort(), ['foo']);
		}
		{
			const data = await resolveVariables('Hello #foo and #far #foo');
			assert.strictEqual(Object.keys(data.variables).length, 2);
			assert.deepEqual(Object.keys(data.variables).sort(), ['far', 'foo']);
		}
		{
			const data = await resolveVariables('Hello #foo and #far #foo #unknown');
			assert.strictEqual(Object.keys(data.variables).length, 2);
			assert.deepEqual(Object.keys(data.variables).sort(), ['far', 'foo']);
			assert.strictEqual(data.prompt, 'Hello [#foo](values:foo) and [#far](values:far) [#foo](values:foo) #unknown');
		}

		v1.dispose();
		v2.dispose();
	});
});
