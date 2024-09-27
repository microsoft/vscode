/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ChatVariablesService } from '../../browser/chatVariables.js';
import { ChatAgentService, IChatAgentService } from '../../common/chatAgents.js';
import { ChatRequestParser } from '../../common/chatRequestParser.js';
import { IChatService } from '../../common/chatService.js';
import { IChatVariablesService } from '../../common/chatVariables.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { MockChatWidgetService } from './mockChatWidget.js';
import { MockChatService } from '../common/mockChatService.js';
import { MockLanguageModelToolsService } from '../common/mockLanguageModelToolsService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestViewsService } from '../../../../test/browser/workbenchTestServices.js';
import { TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';

suite('ChatVariables', function () {

	let service: ChatVariablesService;
	let instantiationService: TestInstantiationService;
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		service = new ChatVariablesService(new MockChatWidgetService(), new TestViewsService());
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
