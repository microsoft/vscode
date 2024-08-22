/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log';
import { IStorageService } from '../../../../../platform/storage/common/storage';
import { ChatVariablesService } from '../../browser/chatVariables';
import { ChatAgentService, IChatAgentService } from '../../common/chatAgents';
import { ChatRequestParser } from '../../common/chatRequestParser';
import { IChatService } from '../../common/chatService';
import { IChatVariablesService } from '../../common/chatVariables';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService';
import { MockChatWidgetService } from './mockChatWidget';
import { MockChatService } from '../common/mockChatService';
import { MockLanguageModelToolsService } from '../common/mockLanguageModelToolsService';
import { IExtensionService } from '../../../../services/extensions/common/extensions';
import { TestViewsService } from '../../../../test/browser/workbenchTestServices';
import { TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices';

suite('ChatVariables', function () {

	let service: ChatVariablesService;
	let instantiationService: TestInstantiationService;
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		service = new ChatVariablesService(new MockChatWidgetService(), new TestViewsService(), new MockLanguageModelToolsService());
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IChatVariablesService, service);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(ILanguageModelToolsService, new MockLanguageModelToolsService());
		instantiationService.stub(IChatAgentService, instantiationService.createInstance(ChatAgentService));
	});

	test('ChatVariables - resolveVariables', async function () {

		const v1 = service.registerVariable({ id: 'id', name: 'foo', description: 'bar' }, async () => 'farboo');
		const v2 = service.registerVariable({ id: 'id', name: 'far', description: 'boo' }, async () => 'farboo');

		const parser = instantiationService.createInstance(ChatRequestParser);

		const resolveVariables = async (text: string) => {
			const result = parser.parseChatRequest('1', text);
			return await service.resolveVariables(result, undefined, null!, () => { }, CancellationToken.None);
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
