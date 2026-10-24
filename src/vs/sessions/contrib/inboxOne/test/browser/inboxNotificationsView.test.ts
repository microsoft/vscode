/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IAgentsActivityService } from '../../../../services/activity/browser/agentsActivityService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { InboxNotificationsView } from '../../browser/inboxNotificationsView.js';
import { IInboxNotificationItem, IInboxNotificationsService, InboxNotificationKind, InboxNotificationPriority, InboxNotificationsSortMode } from '../../common/inboxNotificationsService.js';

suite('InboxNotificationsView', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('requests previews and records impressions only for intersecting cards', () => {
		let observer: TestIntersectionObserver | undefined;
		class TestIntersectionObserver implements IntersectionObserver {
			readonly root = null;
			readonly rootMargin = '';
			readonly scrollMargin = '';
			readonly thresholds = [0];
			readonly targets = new Set<Element>();

			constructor(private readonly callback: IntersectionObserverCallback) {
				observer = this;
			}

			disconnect(): void { this.targets.clear(); }
			observe(target: Element): void { this.targets.add(target); }
			unobserve(target: Element): void { this.targets.delete(target); }
			takeRecords(): IntersectionObserverEntry[] { return []; }
			setIntersecting(target: Element, isIntersecting: boolean): void {
				this.callback([upcastPartial<IntersectionObserverEntry>({ target, isIntersecting })], this);
			}
		}

		const items: IInboxNotificationItem[] = ['visible', 'offscreen'].map(id => ({
			id, kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Next,
			title: id, description: id, timestamp: 1, actions: [], previewSignature: id, previewInputText: id,
		}));
		const previews = observableValue<ReadonlyMap<string, string>>('test.previews', new Map());
		const previewRequests: string[] = [];
		const events: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IInboxNotificationsService, {
			notifications: constObservable(items),
			dismissedNotifications: constObservable([]),
			previews,
			sortMode: constObservable(InboxNotificationsSortMode.Priority),
			isLoading: constObservable(false),
			revealRequest: constObservable(undefined),
			detailSummaries: constObservable(new Map()),
			requestPreview: item => { previewRequests.push(item.id); },
			getInteractionTelemetryContext: () => ({ agentSessionId: 'none', providerId: 'none' }),
		});
		instantiationService.stub(IChatService, {});
		instantiationService.stub(ISessionsService, {});
		instantiationService.stub(ISessionsManagementService, {});
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IContextMenuService, {});
		instantiationService.stub(IOnboardingScenarioService, {});
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(ICommandService, {});
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IAccessibilityService, {});
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(ITelemetryService, { publicLog2: event => { events.push(event); } });
		instantiationService.stub(IAgentsActivityService, {});
		const view = disposables.add(instantiationService.createInstance(InboxNotificationsView, TestIntersectionObserver));
		const list = document.createElement('div');
		view.render(list);
		assert.ok(observer);
		const [visible, offscreen] = Array.from(observer.targets);
		observer.setIntersecting(offscreen, false);
		assert.deepStrictEqual({ previewRequests, impressions: events.filter(event => event === 'agents/inboxImpression') }, { previewRequests: [], impressions: [] });
		observer.setIntersecting(visible, true);
		assert.deepStrictEqual({ previewRequests, impressions: events.filter(event => event === 'agents/inboxImpression') }, {
			previewRequests: ['visible'], impressions: ['agents/inboxImpression'],
		});

		observer.setIntersecting(visible, false);
		observer.setIntersecting(visible, true);
		assert.deepStrictEqual(events.filter(event => event === 'agents/inboxImpression'), ['agents/inboxImpression']);
		view.dispose();
		assert.strictEqual(observer.targets.size, 0);
	});
});
