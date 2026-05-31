/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../platform/authentication/common/copilotToken';
import { setCopilotToken, StaticGitHubAuthenticationService } from '../../../../platform/authentication/common/staticGitHubAuthenticationService';
import { FailingDevContainerConfigurationService, IDevContainerConfigurationService } from '../../../../platform/devcontainer/common/devContainerConfigurationService';
import { ICombinedEmbeddingIndex, VSCodeCombinedIndexImpl } from '../../../../platform/embeddings/common/vscodeIndex';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IGitCommitMessageService, NoopGitCommitMessageService } from '../../../../platform/git/common/gitCommitMessageService';
import { ISettingsEditorSearchService, NoopSettingsEditorSearchService } from '../../../../platform/settingsEditor/common/settingsEditorSearchService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IMergeConflictService } from '../../../git/common/mergeConflictService';
import { TestMergeConflictServiceImpl } from '../../../git/vscode/mergeConflictServiceImpl';
import { IIntentService, IntentService } from '../../../intents/node/intentService';
import { INewWorkspacePreviewContentManager, NewWorkspacePreviewContentManagerImpl } from '../../../intents/node/newIntent';
import { createExtensionTestingServices } from '../../../test/vscode-node/services';
import { ConversationFeature } from '../conversationFeature';

suite('Conversation feature test suite', function () {
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;
	let sandbox: sinon.SinonSandbox;

	function createAccessor() {
		const testingServiceCollection = createExtensionTestingServices();
		testingServiceCollection.define(ICombinedEmbeddingIndex, new SyncDescriptor(VSCodeCombinedIndexImpl, [/*useRemoteCache*/ false]));
		testingServiceCollection.define(INewWorkspacePreviewContentManager, new SyncDescriptor(NewWorkspacePreviewContentManagerImpl));
		testingServiceCollection.define(IGitCommitMessageService, new NoopGitCommitMessageService());
		testingServiceCollection.define(IDevContainerConfigurationService, new FailingDevContainerConfigurationService());
		testingServiceCollection.define(IIntentService, new SyncDescriptor(IntentService));
		testingServiceCollection.define(ISettingsEditorSearchService, new SyncDescriptor(NoopSettingsEditorSearchService));
		testingServiceCollection.define(IMergeConflictService, new SyncDescriptor(TestMergeConflictServiceImpl));
		// We don't need auth in these tests
		testingServiceCollection.define(IAuthenticationService, new SyncDescriptor(StaticGitHubAuthenticationService, [() => undefined]));

		accessor = testingServiceCollection.createTestingAccessor();
		instaService = accessor.get(IInstantiationService);
	}

	setup(() => {
		sandbox = sinon.createSandbox();
		sandbox.stub(vscode.commands, 'registerCommand').returns({ dispose: () => { } });
		sandbox.stub(vscode.workspace, 'registerFileSystemProvider').returns({ dispose: () => { } });
		createAccessor();
	});

	teardown(() => {
		sandbox.restore();
		const extensionContext = accessor.get(IVSCodeExtensionContext);
		extensionContext.subscriptions.forEach(sub => sub.dispose());
	});

	test.skip(`If the 'interactive' namespace is not available, the feature is not enabled and not activated`, function () {
		// TODO: The vscode module cannot be stubbed
		sandbox.stub(vscode, 'interactive').value(undefined);

		const conversationFeature = instaService.createInstance(ConversationFeature);
		try {
			assert.deepStrictEqual(conversationFeature.enabled, false);
			assert.deepStrictEqual(conversationFeature.activated, false);
		} finally {
			conversationFeature.dispose();
		}
	});

	test(`If the 'interactive' version does not match, the feature is not enabled and not activated`, function () {
		const conversationFeature = instaService.createInstance(ConversationFeature);
		try {
			assert.deepStrictEqual(conversationFeature.enabled, false);
			assert.deepStrictEqual(conversationFeature.activated, false);
		} finally {
			conversationFeature.dispose();
		}
	});

	test('The feature is enabled and activated in test mode', function () {
		const conversationFeature = instaService.createInstance(ConversationFeature);
		try {
			const copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token', username: 'fake', copilot_plan: 'unknown' }));
			setCopilotToken(accessor.get(IAuthenticationService), copilotToken);

			assert.deepStrictEqual(conversationFeature.enabled, true);
			assert.deepStrictEqual(conversationFeature.activated, true);
		} finally {
			conversationFeature.dispose();
		}
	});

	test('If the token envelope setting is set to true, the feature should be enabled', function () {
		const conversationFeature = instaService.createInstance(ConversationFeature);
		try {
			const copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token', username: 'fake', copilot_plan: 'unknown' }));
			setCopilotToken(accessor.get(IAuthenticationService), copilotToken);

			assert.deepStrictEqual(conversationFeature.enabled, true);
		} finally {
			conversationFeature.dispose();
		}
	});

	test('The feature should be activated when it becomes enabled', function () {
		const conversationFeature = instaService.createInstance(ConversationFeature);
		try {
			const copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token', username: 'fake', copilot_plan: 'unknown' }));
			setCopilotToken(accessor.get(IAuthenticationService), copilotToken);
			assert.deepStrictEqual(conversationFeature.enabled, true);
			assert.deepStrictEqual(conversationFeature.activated, true);
		} finally {
			conversationFeature.dispose();
		}
	});

	test('The feature should register a chat provider on activation', function () {
		if (!vscode.chat.createChatParticipant) {
			this.skip();
		}

		const conversationFeature = instaService.createInstance(ConversationFeature);
		try {

			const copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token', username: 'fake', copilot_plan: 'unknown' }));
			setCopilotToken(accessor.get(IAuthenticationService), copilotToken);

			assert.deepStrictEqual(conversationFeature.activated, true);
		} finally {
			conversationFeature.dispose();
		}
	});

	test('The feature activates without a Copilot token when a non-copilot (BYOK) language model is available', async function () {
		sandbox.stub(vscode.lm, 'selectChatModels').resolves([
			{ vendor: 'ollama', id: 'llama3', name: 'llama3', family: 'llama3' } as unknown as vscode.LanguageModelChat
		]);
		sandbox.stub(vscode.lm, 'onDidChangeChatModels').returns({ dispose: () => { } });

		const conversationFeature = instaService.createInstance(ConversationFeature);
		try {
			// No Copilot token is set; activation and enablement should be driven by BYOK availability.
			await conversationFeature.activationBlocker;
			assert.deepStrictEqual(conversationFeature.activated, true);
			assert.deepStrictEqual(conversationFeature.enabled, true);
		} finally {
			conversationFeature.dispose();
		}
	});

	test('activationBlocker resolves on an auth change even when the BYOK query never settles', async function () {
		// Reproduces the air-gapped startup deadlock: the BYOK detection query (which itself
		// activates this extension's language-model providers) can hang until extension
		// activation completes, while extension activation is waiting for `activationBlocker`.
		// The auth-change event must unconditionally unblock activation regardless of token
		// or BYOK availability.
		sandbox.stub(vscode.lm, 'selectChatModels').returns(new Promise<vscode.LanguageModelChat[]>(() => { /* never resolves */ }));
		sandbox.stub(vscode.lm, 'onDidChangeChatModels').returns({ dispose: () => { } });

		const conversationFeature = instaService.createInstance(ConversationFeature);
		try {
			const authService = accessor.get(IAuthenticationService) as unknown as { fireAuthenticationChange(source: string): void };
			authService.fireAuthenticationChange('test');

			await conversationFeature.activationBlocker;
			assert.deepStrictEqual(conversationFeature.activated, false);
			assert.deepStrictEqual(conversationFeature.enabled, false);
		} finally {
			conversationFeature.dispose();
		}
	});
});
