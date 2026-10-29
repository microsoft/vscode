/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IWindowCanvasDescriptor, IWindowCanvasService } from '../../../../services/canvas/browser/windowCanvasService.js';
import { CHAT_INBOX_ENABLED_SETTING, INBOX_CANVAS_ID } from '../../browser/inboxNotificationsConstants.js';
import { InboxNotificationsCanvasContribution } from '../../browser/inboxOne.contribution.js';

suite('InboxNotificationsCanvasContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(enabled: boolean, hidden = false) {
		const configurationService = new TestConfigurationService({ [CHAT_INBOX_ENABLED_SETTING]: enabled });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const sentiment = observableValue<IChatSentiment>('test.chatSentiment', { hidden });
		const registered = new Map<string, IWindowCanvasDescriptor>();
		const closed: string[] = [];
		disposables.add(new InboxNotificationsCanvasContribution(
			configurationService,
			upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment }),
			upcastPartial<IWindowCanvasService>({
				registerCanvas: descriptor => {
					registered.set(descriptor.id, descriptor);
					return toDisposable(() => registered.delete(descriptor.id));
				},
				closeCanvas: async id => { closed.push(id); },
			}),
		));
		return {
			registered, closed, sentiment,
			async setEnabled(value: boolean): Promise<void> {
				await configurationService.setUserConfiguration(CHAT_INBOX_ENABLED_SETTING, value);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectsConfiguration: key => key === CHAT_INBOX_ENABLED_SETTING,
				}));
			},
		};
	}

	test('disabled Inbox is not registered and clears pending tab restoration', () => {
		const fixture = createFixture(false);
		assert.deepStrictEqual({ registered: [...fixture.registered.keys()], closed: fixture.closed }, {
			registered: [], closed: [INBOX_CANVAS_ID],
		});
	});

	test('registers a native canvas only while enabled', async () => {
		const fixture = createFixture(true);
		const enabled = [...fixture.registered.keys()];
		await fixture.setEnabled(false);
		const disabled = [...fixture.registered.keys()];
		await fixture.setEnabled(true);
		assert.deepStrictEqual({ enabled, disabled, reenabled: [...fixture.registered.keys()], closed: fixture.closed }, {
			enabled: [INBOX_CANVAS_ID], disabled: [], reenabled: [INBOX_CANVAS_ID], closed: [INBOX_CANVAS_ID],
		});
	});

	test('AI hiding removes the canvas and unhiding makes it available again', () => {
		const fixture = createFixture(true);
		fixture.sentiment.set({ hidden: true }, undefined);
		const hidden = [...fixture.registered.keys()];
		fixture.sentiment.set({}, undefined);
		assert.deepStrictEqual({ hidden, available: [...fixture.registered.keys()], closed: fixture.closed }, {
			hidden: [], available: [INBOX_CANVAS_ID], closed: [INBOX_CANVAS_ID],
		});
	});

	test('AI hidden at startup never registers Inbox', () => {
		const fixture = createFixture(true, true);
		assert.deepStrictEqual([...fixture.registered.keys()], []);
	});
});
