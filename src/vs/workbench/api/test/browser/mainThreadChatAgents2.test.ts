/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatService } from '../../../contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { IChatWidgetService } from '../../../contrib/chat/browser/chat.js';
import { IChatAgentService } from '../../../contrib/chat/common/participants/chatAgents.js';
import { IPromptsService } from '../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService } from '../../../contrib/chat/common/tools/languageModelToolsService.js';
import { mock, TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadChatAgents2 } from '../../browser/mainThreadChatAgents2.js';
import { ExtHostChatAgentsShape2 } from '../../common/extHost.protocol.js';
import { AnyCallRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadChatAgents2', function () {

	let disposables: DisposableStore;
	let onDidChangeCustomAgents: Emitter<void>;
	let onDidChangeInstructions: Emitter<void>;
	let onDidChangeSkills: Emitter<void>;
	let customAgents: { uri: URI }[];
	let instructionFiles: { uri: URI }[];
	let agentSkills: { uri: URI }[];
	let acceptCustomAgentsStub: sinon.SinonStub;
	let acceptInstructionsStub: sinon.SinonStub;
	let acceptSkillsStub: sinon.SinonStub;

	setup(function () {
		disposables = new DisposableStore();

		onDidChangeCustomAgents = disposables.add(new Emitter<void>());
		onDidChangeInstructions = disposables.add(new Emitter<void>());
		onDidChangeSkills = disposables.add(new Emitter<void>());

		customAgents = [];
		instructionFiles = [];
		agentSkills = [];

		acceptCustomAgentsStub = sinon.stub();
		acceptInstructionsStub = sinon.stub();
		acceptSkillsStub = sinon.stub();
	});

	teardown(function () {
		disposables.dispose();
		sinon.restore();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createMainThread(): MainThreadChatAgents2 {
		const rpc = AnyCallRPCProtocol<ExtHostChatAgentsShape2>({
			$acceptCustomAgents: acceptCustomAgentsStub,
			$acceptInstructions: acceptInstructionsStub,
			$acceptSkills: acceptSkillsStub,
		} as Partial<ExtHostChatAgentsShape2> as ExtHostChatAgentsShape2);

		const promptsService = new class extends mock<IPromptsService>() {
			override onDidChangeCustomAgents = onDidChangeCustomAgents.event;
			override onDidChangeInstructions = onDidChangeInstructions.event;
			override onDidChangeSkills = onDidChangeSkills.event;
			override async getCustomAgents() { return customAgents as never; }
			override async getInstructionFiles() { return instructionFiles as never; }
			override async findAgentSkills() { return agentSkills as never; }
		};

		const chatService = new class extends mock<IChatService>() {
			override onDidDisposeSession = Event.None;
			override onDidPerformUserAction = Event.None;
			override onDidReceiveQuestionCarouselAnswer = Event.None;
		};

		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override onDidChangeFocusedSession = Event.None;
			override lastFocusedWidget = undefined;
		};

		return disposables.add(new MainThreadChatAgents2(
			rpc,
			new class extends mock<IChatAgentService>() { },
			new class extends mock<IChatSessionsService>() { },
			chatService,
			new class extends mock<ILanguageFeaturesService>() { },
			chatWidgetService,
			new class extends mock<IInstantiationService>() { },
			new NullLogService(),
			new TestExtensionService(),
			new class extends mock<IUriIdentityService>() { },
			promptsService,
			new class extends mock<ILanguageModelToolsService>() { },
		));
	}

	test('initial push sends agents to extension host', async function () {
		customAgents = [
			{ uri: URI.parse('file:///agents/agent1.md') },
			{ uri: URI.parse('file:///agents/agent2.md') },
		];

		createMainThread();

		// Wait for async initial push
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(acceptCustomAgentsStub.callCount, 1);
	});

	test('suppresses duplicate push when URIs have not changed', async function () {
		customAgents = [
			{ uri: URI.parse('file:///agents/agent1.md') },
		];

		createMainThread();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(acceptCustomAgentsStub.callCount, 1);

		// Fire change event with same data
		onDidChangeCustomAgents.fire();
		await new Promise(resolve => setTimeout(resolve, 0));

		// Should NOT have pushed again
		assert.strictEqual(acceptCustomAgentsStub.callCount, 1);
	});

	test('pushes again when agent URIs change', async function () {
		customAgents = [
			{ uri: URI.parse('file:///agents/agent1.md') },
		];

		createMainThread();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(acceptCustomAgentsStub.callCount, 1);

		// Change the agents
		customAgents = [
			{ uri: URI.parse('file:///agents/agent1.md') },
			{ uri: URI.parse('file:///agents/agent2.md') },
		];
		onDidChangeCustomAgents.fire();
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(acceptCustomAgentsStub.callCount, 2);
	});

	test('suppresses duplicate instruction push', async function () {
		instructionFiles = [
			{ uri: URI.parse('file:///instructions/copilot.md') },
		];

		createMainThread();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(acceptInstructionsStub.callCount, 1);

		onDidChangeInstructions.fire();
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(acceptInstructionsStub.callCount, 1);
	});

	test('suppresses duplicate skill push', async function () {
		agentSkills = [
			{ uri: URI.parse('file:///skills/search.md') },
		];

		createMainThread();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(acceptSkillsStub.callCount, 1);

		onDidChangeSkills.fire();
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(acceptSkillsStub.callCount, 1);
	});

	test('dedup is order-independent', async function () {
		customAgents = [
			{ uri: URI.parse('file:///agents/b.md') },
			{ uri: URI.parse('file:///agents/a.md') },
		];

		createMainThread();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(acceptCustomAgentsStub.callCount, 1);

		// Same URIs but in different order
		customAgents = [
			{ uri: URI.parse('file:///agents/a.md') },
			{ uri: URI.parse('file:///agents/b.md') },
		];
		onDidChangeCustomAgents.fire();
		await new Promise(resolve => setTimeout(resolve, 0));

		// Should NOT push again — sorted keys match
		assert.strictEqual(acceptCustomAgentsStub.callCount, 1);
	});
});
