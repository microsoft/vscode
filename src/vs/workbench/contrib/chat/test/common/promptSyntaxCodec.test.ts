/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MockObject, mockObject } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ChatAgentService, IChatAgentService } from '../../common/chatAgents.js';
import { IChatService } from '../../common/chatService.js';
import { IChatVariablesService } from '../../common/chatVariables.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { MockChatService } from './mockChatService.js';
import { MockLanguageModelToolsService } from './mockLanguageModelToolsService.js';
import { PromptSyntaxCodec } from '../../browser/chatVariables.js';

suite('ChatRequestParser', () => {
	const promptSyntaxCodec = new PromptSyntaxCodec();

	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	let varService: MockObject<IChatVariablesService>;
	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(ILanguageModelToolsService, new MockLanguageModelToolsService());
		instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));

		varService = mockObject<IChatVariablesService>()({});
		varService.getDynamicVariables.returns([]);
		instantiationService.stub(IChatVariablesService, varService as any);
	});

	test('simple test', async () => {
	});
});
