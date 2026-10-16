/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../browser/chat.js';
import { CopilotCliSessionLinkOpener } from '../../browser/copilotCliSessionLink.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';

suite('CopilotCliSessionLinkOpener', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function open(sessionId: string, options: { readonly providerAvailable: boolean; readonly aiHidden?: boolean }) {
		const opened: { resource: string; inChatView: boolean }[] = [];
		const errors: string[] = [];
		const resolvedSessionTypes: string[] = [];

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentiment: { hidden: options.aiHidden } }));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			canResolveChatSession: async sessionType => {
				resolvedSessionTypes.push(sessionType);
				return options.providerAvailable;
			},
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async (resource, target) => {
				opened.push({ resource: resource.toString(), inChatView: target === ChatViewPaneTarget });
				return undefined;
			},
		}));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			error: message => { errors.push(String(message)); },
		}));

		await instantiationService.createInstance(CopilotCliSessionLinkOpener).open(sessionId);

		return { opened, errors: errors.length, resolvedSessionTypes };
	}

	test('opens the session in the Chat view through the Copilot CLI provider', async () => {
		assert.deepStrictEqual(await open('0b6f9a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', { providerAvailable: true }), {
			opened: [{ resource: 'copilotcli:/0b6f9a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', inChatView: true }],
			errors: 0,
			resolvedSessionTypes: ['copilotcli'],
		});
	});

	test('reports an error instead of opening an empty chat when the provider is unavailable', async () => {
		assert.deepStrictEqual({
			providerUnavailable: await open('session-1', { providerAvailable: false }),
			aiFeaturesHidden: await open('session-1', { providerAvailable: true, aiHidden: true }),
		}, {
			providerUnavailable: { opened: [], errors: 1, resolvedSessionTypes: ['copilotcli'] },
			aiFeaturesHidden: { opened: [], errors: 1, resolvedSessionTypes: [] },
		});
	});

	test('ignores an invalid session id', async () => {
		assert.deepStrictEqual(await open('../session', { providerAvailable: true }), {
			opened: [],
			errors: 0,
			resolvedSessionTypes: [],
		});
	});
});
