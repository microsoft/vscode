/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ForkConversationAction } from '../../../browser/actions/chatForkActions.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatModelReference, IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, SessionTypeSelectionReason } from '../../../common/constants.js';
import { IChatModel, ISerializableChatData } from '../../../common/model/chatModel.js';

class TestForkConversationAction extends ForkConversationAction {
	openForkedSession(instantiationService: TestInstantiationService, parentSessionResource: URI, forkedSessionResource: URI): Promise<void> {
		return this._openForkedSession(instantiationService, parentSessionResource, forkedSessionResource);
	}
}

suite('ForkConversationAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function stubSelectionTelemetryServices(instantiationService: TestInstantiationService): void {
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(true), managedSandboxEnforced: constObservable(false) });
	}

	test('opens a fork with the current session selection reason', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		stubSelectionTelemetryServices(instantiationService);
		const parentSessionResource = URI.parse('vscode-chat-session://parent');
		const forkedSessionResource = URI.parse('vscode-chat-session://fork');
		let openCall: { resource: URI; usesViewTarget: boolean; selectionReason: SessionTypeSelectionReason | undefined } | undefined;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async (resource, target, options) => {
				openCall = { resource, usesViewTarget: target === ChatViewPaneTarget, selectionReason: options?.sessionTypeSelectionTelemetry?.reason };
				return undefined;
			},
		}));

		await new TestForkConversationAction().openForkedSession(instantiationService, parentSessionResource, forkedSessionResource);

		assert.deepStrictEqual(openCall, {
			resource: forkedSessionResource,
			usesViewTarget: true,
			selectionReason: 'currentSession',
		});
	});

	test('loads a local fork with the current session selection reason', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		stubSelectionTelemetryServices(instantiationService);
		const sourceSessionResource = URI.parse('vscode-chat-session://source');
		const forkedSessionResource = URI.parse('vscode-chat-session://fork');
		const serializedData: ISerializableChatData = {
			version: 3,
			sessionId: 'source',
			creationDate: 0,
			customTitle: undefined,
			initialLocation: ChatAgentLocation.Chat,
			responderUsername: 'test',
			requests: [{
				requestId: 'request',
				message: 'hello',
				variableData: { variables: [] },
				response: [],
			}],
		};
		const sourceModel = upcastPartial<IChatModel>({
			sessionResource: sourceSessionResource,
			title: 'Source',
			toJSON: () => serializedData,
		});
		let loadCall: { debugOwner: string | undefined; selectionReason: SessionTypeSelectionReason | undefined } | undefined;
		let modelDisposed = false;
		const modelRef = upcastPartial<IChatModelReference>({
			object: upcastPartial<IChatModel>({ sessionResource: forkedSessionResource, sessionTypeSelectionReason: 'currentSession' }),
			dispose: () => modelDisposed = true,
		});
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: resource => resource.toString() === sourceSessionResource.toString() ? sourceModel : undefined,
			loadSessionFromData: (_data, debugOwner, selectionTelemetry) => {
				loadCall = { debugOwner, selectionReason: selectionTelemetry?.reason };
				return modelRef;
			},
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [],
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async () => undefined,
		}));

		await instantiationService.invokeFunction(accessor => new ForkConversationAction().run(accessor, sourceSessionResource));
		await timeout(0);

		assert.deepStrictEqual({ loadCall, modelDisposed }, {
			loadCall: {
				debugOwner: 'ChatForkActions#forkCleanSession',
				selectionReason: 'currentSession',
			},
			modelDisposed: true,
		});
	});
});
