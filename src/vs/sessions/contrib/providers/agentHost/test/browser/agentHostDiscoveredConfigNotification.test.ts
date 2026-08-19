/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostAllowSignedOutWhenUsableSettingId } from '../../../../../../platform/agentHost/common/agentService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IChatInputNotification, IChatInputNotificationService } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { SessionType } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { SessionTypeAuthRequirement } from '../../../../../services/sessions/common/session.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostDiscoveredConfigNotificationContribution } from '../../browser/agentHostDiscoveredConfigNotification.js';

class TestChatInputNotificationService extends Disposable implements IChatInputNotificationService {
	declare readonly _serviceBrand: undefined;

	readonly onDidChange = Event.None;
	private readonly _onDidDismiss = this._register(new Emitter<string>());
	readonly onDidDismiss = this._onDidDismiss.event;

	readonly notifications = new Map<string, IChatInputNotification>();

	setNotification(notification: IChatInputNotification): void {
		this.notifications.set(notification.id, notification);
	}
	deleteNotification(id: string): void {
		this.notifications.delete(id);
	}
	/** Mirrors the real service: a dismissal is remembered, not forgotten. */
	dismissNotification(id: string): void {
		if (this.notifications.has(id)) {
			this._onDidDismiss.fire(id);
		}
	}
	getActiveNotification(): IChatInputNotification | undefined {
		return [...this.notifications.values()].at(0);
	}
	handleMessageSent(): void { }
	announceRendered(): void { }
}

/**
 * A signed-out user who has opted in, with Claude advertising that it runs on the
 * user's own credentials — the one situation the nudge is written for.
 */
function createContribution(store: Pick<DisposableStore, 'add'>, storageService = store.add(new InMemoryStorageService())) {
	const notificationService = store.add(new TestChatInputNotificationService());
	const claude: IProviderSessionType = {
		providerId: 'local-agent-host',
		sessionType: {
			id: 'claude',
			label: 'Claude Code',
			icon: Codicon.copilot,
			chatSessionType: SessionType.AgentHostClaude,
			authRequirement: SessionTypeAuthRequirement.None,
		},
	};

	store.add(new AgentHostDiscoveredConfigNotificationContribution(
		notificationService,
		new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessionTypes = Event.None;
			override getAllProviderSessionTypes(): IProviderSessionType[] { return [claude]; }
		}(),
		new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = Event.None;
			override readonly currentDefaultAccount = null;
			override getDefaultAccount() { return Promise.resolve(null); }
		}(),
		new TestConfigurationService({ [AgentHostAllowSignedOutWhenUsableSettingId]: true }),
		storageService,
	));

	return { notificationService, storageService };
}

suite('AgentHostDiscoveredConfigNotification', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	(isWeb ? test.skip : test)('nudges the signed-out user, with dismissal as the only off switch', async () => {
		const { notificationService } = createContribution(store);

		// The account resolves asynchronously; the nudge waits for it.
		await timeout(0);

		assert.deepStrictEqual([...notificationService.notifications.values()].map(notification => ({
			message: notification.message,
			actions: notification.actions.map(action => ({ label: action.label, keepOpen: action.keepOpen })),
			dismissible: notification.dismissible,
			mute: notification.mute,
			sessionTypes: notification.sessionTypes,
		})), [{
			message: 'We\'ve discovered your existing Claude Code configuration.',
			// `keepOpen` so a sign-in the user then cancels doesn't silence the nudge.
			actions: [{ label: 'Sign in to GitHub', keepOpen: true }],
			dismissible: true,
			mute: undefined,
			sessionTypes: [SessionType.AgentHostClaude],
		}]);
	});

	(isWeb ? test.skip : test)('dismissing it silences the nudge on this machine for good', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = createContribution(store, storageService);
		await timeout(0);
		const notification = first.notificationService.getActiveNotification();

		first.notificationService.dismissNotification(notification!.id);

		// A fresh contribution stands in for the next window on this machine.
		const next = createContribution(store, storageService);
		await timeout(0);

		assert.deepStrictEqual({
			afterDismissal: first.notificationService.notifications.size,
			nextWindow: next.notificationService.notifications.size,
		}, {
			afterDismissal: 0,
			nextWindow: 0,
		});
	});

	(isWeb ? test : test.skip)('does not nudge on web when signed-out operation is configured', async () => {
		const { notificationService } = createContribution(store);

		await timeout(0);

		assert.strictEqual(notificationService.notifications.size, 0);
	});
});
