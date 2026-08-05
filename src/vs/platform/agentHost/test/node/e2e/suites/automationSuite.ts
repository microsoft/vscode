/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import type { ListAutomationsResult } from '../../../../common/state/protocol/channels-automation/commands.js';
import type { AutomationState } from '../../../../common/state/protocol/channels-automation/state.js';
import { MessageKind } from '../../../../common/state/protocol/channels-chat/state.js';
import type { AutomationAddedParams, AutomationRemovedParams } from '../../../../common/state/protocol/channels-root/notifications.js';
import type { InitializeResult, SubscribeResult } from '../../../../common/state/protocol/common/commands.js';
import type { ActionEnvelope } from '../../../../common/state/protocol/common/actions.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineAutomationTests(context: IAgentHostE2ETestContext): void {
	conformanceTest(context, 'automation definitions support CRUD and subscriptions', async () => {
		const resource = `ahp-automation:/${generateUuid()}`;
		let created = false;
		try {
			const initialized = await context.client.call<InitializeResult>('initialize', {
				channel: 'ahp-root://',
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `automation-${generateUuid()}`,
			});
			assert.ok(initialized.automations);
			const added = context.client.waitForNotification(notification =>
				notification.method === 'root/automationAdded'
				&& (notification.params as AutomationAddedParams).summary.resource === resource
			);
			await context.client.call('createAutomation', {
				channel: resource,
				definition: {
					title: 'Conformance automation',
					message: { text: 'Do not run', origin: { kind: MessageKind.User } },
					session: { provider: context.config.provider, model: { id: 'test-model' } },
					enabled: true,
					triggers: [],
				},
			});
			created = true;
			await added;

			const listed = await context.client.call<ListAutomationsResult>('listAutomations', { channel: 'ahp-root://' });
			const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: resource });
			const changed = context.client.waitForNotification(notification =>
				notification.method === 'action'
				&& (notification.params as ActionEnvelope).channel === resource
			);
			await context.client.call('updateAutomation', {
				channel: resource,
				expectedRevision: 1,
				changes: { title: 'Updated conformance automation', enabled: false },
			});
			await changed;
			const updated = await context.client.call<SubscribeResult>('subscribe', { channel: resource });

			assert.deepStrictEqual({
				listed: listed.items.map(item => ({ resource: item.resource, revision: item.revision })),
				initial: {
					title: (subscribed.snapshot?.state as AutomationState).definition.title,
					model: (subscribed.snapshot?.state as AutomationState).definition.session.model,
					revision: (subscribed.snapshot?.state as AutomationState).revision,
				},
				updated: {
					title: (updated.snapshot?.state as AutomationState).definition.title,
					enabled: (updated.snapshot?.state as AutomationState).definition.enabled,
					revision: (updated.snapshot?.state as AutomationState).revision,
				},
			}, {
				listed: [{ resource, revision: 1 }],
				initial: { title: 'Conformance automation', model: { id: 'test-model' }, revision: 1 },
				updated: { title: 'Updated conformance automation', enabled: false, revision: 2 },
			});
		} finally {
			if (created) {
				const removed = context.client.waitForNotification(notification =>
					notification.method === 'root/automationRemoved'
					&& (notification.params as AutomationRemovedParams).automation === resource
				);
				await context.client.call('disposeAutomation', { channel: resource });
				await removed;
			}
		}
	});
}
