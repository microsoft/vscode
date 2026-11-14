/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ChatViewId } from '../../../../chat/browser/chat.js';
import { IChatViewHostService } from '../../../../chat/browser/chatViewHost.js';
import { IChatViewSessionsListService } from '../../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { RemoteNameContext } from '../../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { IEditorWindowChatPartOptions, IEditorWindowChatPartService } from '../../../browser/agentsView/agentsChatPartContribution.js';
import { ChatViewOpenInChatPartContribution } from '../../../browser/chatView/chatViewOpenInChatPart.contribution.js';
import { IEditorWindowSessionsRuntime, IEditorWindowSessionsRuntimeOptions } from '../../../browser/editorWindow/editorWindowSessionsRuntime.js';

suite('ChatViewOpenInChatPartContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: { remote?: boolean; sessionsWindow?: boolean; setting?: boolean; chatEnabled?: boolean; agentEnabled?: boolean } = {}) {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsOpenInChatPart]: options.setting ?? false, [ChatConfiguration.AgentEnabled]: options.agentEnabled ?? true });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(options.chatEnabled ?? true);
		RemoteNameContext.bindTo(contextKeyService).set('');
		const chatPartOptions: IEditorWindowChatPartOptions[] = [];
		const runtimeOptions: IEditorWindowSessionsRuntimeOptions[] = [];
		let runtimeHeld = 0;

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: options.remote ? 'remote' : undefined, isSessionsWindow: !!options.sessionsWindow }));
		instantiationService.stub(IEditorWindowChatPartService, upcastPartial<IEditorWindowChatPartService>({
			enable: (o: IEditorWindowChatPartOptions): IDisposable => { chatPartOptions.push(o); return toDisposable(() => { }); },
		}));
		instantiationService.stub(IEditorWindowSessionsRuntime, upcastPartial<IEditorWindowSessionsRuntime>({
			enable: (o: IEditorWindowSessionsRuntimeOptions): IDisposable => { runtimeOptions.push(o); runtimeHeld++; return toDisposable(() => runtimeHeld--); },
		}));
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ replaced: constObservable(false) }));
		instantiationService.stub(IChatViewSessionsListService, upcastPartial<IChatViewSessionsListService>({ provider: undefined }));
		instantiationService.stub(IConfigurationService, configurationService);

		store.add(instantiationService.createInstance(ChatViewOpenInChatPartContribution));
		const state = () => ({
			anchors: chatPartOptions.map(o => ({ anchorViewId: o.anchorViewId, anchorPriority: o.anchorPriority, enabled: o.enabled.get() })),
			runtime: runtimeOptions.map(o => o.viewIds),
			runtimeHeld,
		});
		return { state, configurationService, contextKeyService, chatPartOptions };
	}

	test('registers nothing in remote and Agents windows', () => {
		assert.deepStrictEqual({ remote: setup({ remote: true, setting: true }).state(), sessions: setup({ sessionsWindow: true, setting: true }).state() }, {
			remote: { anchors: [], runtime: [], runtimeHeld: 0 },
			sessions: { anchors: [], runtime: [], runtimeHeld: 0 },
		});
	});

	test('does nothing while the setting is off, and anchors beside the Chat view while it is on', () => {
		const off = setup({ setting: false }).state();
		const on = setup({ setting: true }).state();
		assert.deepStrictEqual({ off, on }, {
			off: { anchors: [{ anchorViewId: ChatViewId, anchorPriority: 1, enabled: false }], runtime: [], runtimeHeld: 0 },
			on: { anchors: [{ anchorViewId: ChatViewId, anchorPriority: 1, enabled: true }], runtime: [[ChatViewId]], runtimeHeld: 1 },
		});
	});

	test('is off while agents are disabled, as the chat part\'s host cannot show chats then', () => {
		assert.strictEqual(setup({ setting: true, agentEnabled: false }).chatPartOptions[0].enabled.get(), false);
	});

	test('follows the setting and AI features', async () => {
		const { state, configurationService, contextKeyService, chatPartOptions } = setup({ setting: false });
		const enabled = (): IObservable<boolean> => chatPartOptions[0].enabled;
		const steps: boolean[] = [enabled().get()];
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, true);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		steps.push(enabled().get());
		ChatContextKeys.enabled.bindTo(contextKeyService).set(false);
		steps.push(enabled().get());
		assert.deepStrictEqual({ steps, runtimeHeld: state().runtimeHeld }, { steps: [false, true, false], runtimeHeld: 0 });
	});
});
