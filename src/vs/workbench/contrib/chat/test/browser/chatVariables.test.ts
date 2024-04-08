/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ChatVariablesService } from 'vs/workbench/contrib/chat/browser/chatVariables';
import { ChatAgentService, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatRequestParser } from 'vs/workbench/contrib/chat/common/chatRequestParser';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { MockChatWidgetService } from 'vs/workbench/contrib/chat/test/browser/mockChatWidget';
import { MockChatService } from 'vs/workbench/contrib/chat/test/common/mockChatService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

suite('ChatVariables', function () {

	let service: ChatVariablesService;
	let instantiationService: TestInstantiationService;
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		service = new ChatVariablesService(new MockChatWidgetService());
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IChatVariablesService, service);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IChatAgentService, instantiationService.createInstance(ChatAgentService));
	});

	test('ChatVariables - resolveVariables', async function () {

		const v1 = service.registerVariable({ name: 'foo', description: 'bar' }, async () => ([{ level: 'full', value: 'farboo' }]));
		const v2 = service.registerVariable({ name: 'far', description: 'boo' }, async () => ([{ level: 'full', value: 'farboo' }]));

		const parser = instantiationService.createInstance(ChatRequestParser);

		const resolveVariables = async (text: string) => {
			const result = parser.parseChatRequest('1', text);
			return await service.resolveVariables(result, null!, () => { }, CancellationToken.None);
		};

		{
			const data = await resolveVariables('Hello #foo and#far');
			assert.strictEqual(data.variables.length, 1);
			assert.deepEqual(data.variables.map(v => v.name), ['foo']);
		}
		{
			const data = await resolveVariables('#foo Hello');
			assert.strictEqual(data.variables.length, 1);
			assert.deepEqual(data.variables.map(v => v.name), ['foo']);
		}
		{
			const data = await resolveVariables('Hello #foo');
			assert.strictEqual(data.variables.length, 1);
			assert.deepEqual(data.variables.map(v => v.name), ['foo']);
		}
		{
			const data = await resolveVariables('Hello #foo?');
			assert.strictEqual(data.variables.length, 1);
			assert.deepEqual(data.variables.map(v => v.name), ['foo']);
		}
		{
			const data = await resolveVariables('Hello #foo and#far #foo');
			assert.strictEqual(data.variables.length, 2);
			assert.deepEqual(data.variables.map(v => v.name), ['foo', 'foo']);
		}
		{
			const data = await resolveVariables('Hello #foo and #far #foo');
			assert.strictEqual(data.variables.length, 3);
			assert.deepEqual(data.variables.map(v => v.name), ['foo', 'far', 'foo']);
		}
		{
			const data = await resolveVariables('Hello #foo and #far #foo #unknown');
			assert.strictEqual(data.variables.length, 3);
			assert.deepEqual(data.variables.map(v => v.name), ['foo', 'far', 'foo']);
		}

		v1.dispose();
		v2.dispose();
	});
});
