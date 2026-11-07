/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toAction } from '../../../base/common/actions.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../platform/accessibility/browser/accessibleView.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IListService, WorkbenchList } from '../../../platform/list/browser/listService.js';
import { INotification, Severity } from '../../../platform/notification/common/notification.js';
import { NotificationText } from '../../../platform/notification/common/notificationMessage.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { NotificationAccessibleView } from '../../browser/parts/notifications/notificationAccessibleView.js';
import { INotificationViewItem, NotificationsModel } from '../../common/notifications.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { NotificationActionTelemetryId, NotificationTelemetryId, withNotificationActionTelemetry } from '../../../platform/notification/common/notificationTelemetry.js';
import { TestNotificationTelemetryService } from '../common/testNotificationTelemetry.js';

suite('NotificationAccessibleView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupNotification(notifications: INotification[] = [{ severity: Severity.Info, message: 'Synthetic notification' }]) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const telemetry = new TestNotificationTelemetryService();
		instantiationService.stub(ITelemetryService, telemetry);
		const model = store.add(new NotificationsModel());
		const handles = [...notifications].reverse().map(notification => {
			const handle = model.addNotification(notification);
			store.add(toDisposable(() => handle.close()));
			return handle;
		}).reverse();
		const list = store.add(instantiationService.createInstance(
			WorkbenchList<INotificationViewItem>,
			'NotificationAccessibleView',
			container,
			{ getHeight: () => 22, getTemplateId: () => 'notification' },
			[{
				templateId: 'notification',
				renderTemplate: () => container,
				renderElement: () => { },
				disposeTemplate: () => { }
			}],
			{ accessibilityProvider: { getAriaLabel: item => item.message.raw, getWidgetAriaLabel: () => 'Notifications' } }
		));
		list.splice(0, 0, model.notifications);
		list.setFocus([0]);
		instantiationService.stub(IListService, { lastFocusedList: list });
		let nextCalls = 0;
		instantiationService.stub(IAccessibleViewService, { next: () => nextCalls++ });
		const opened: { uri: string; options: Parameters<IOpenerService['open']>[1] }[] = [];
		instantiationService.stub(IOpenerService, {
			open: async (uri, options) => {
				opened.push({ uri: uri.toString(), options });
				return true;
			},
		});
		instantiationService.stub(ICommandService, {
			executeCommand: async () => {
				list.setFocus([0]);
				return undefined;
			}
		});
		const implementation = new NotificationAccessibleView();
		return {
			telemetry,
			handle: handles[0],
			handles,
			opened,
			getNextCalls: () => nextCalls,
			createProvider: () => {
				const provider = instantiationService.invokeFunction(accessor => implementation.getProvider(accessor));
				assert.ok(provider);
				store.add(provider);
				const onOpenDisposable = provider.onOpen?.();
				assert.ok(onOpenDisposable);
				return { provider, showing: store.add(onOpenDisposable) };
			}
		};
	}

	for (const role of ['primary', 'secondary'] as const) {
		test(`records accessible-view exposure and ${role} action once without collecting content`, async () => {
			let invoked = 0;
			const action = withNotificationActionTelemetry(toAction({ id: 'private ID', label: 'Private label', run: () => invoked++ }), NotificationActionTelemetryId.Continue);
			const notification = setupNotification([{
				severity: Severity.Info, message: 'private message', telemetry: NotificationTelemetryId.AuthenticationContinue,
				actions: { [role]: [action] }
			}]);
			notification.createProvider().showing.dispose();
			const { provider } = notification.createProvider();
			await provider.actions!.find(candidate => candidate.id === action.id)!.run();
			assert.deepStrictEqual({
				invoked,
				shown: notification.telemetry.shown.map(event => event.surface),
				actions: notification.telemetry.interactions.map(event => [event.interaction, event.actionRole, event.actionId, event.surface]),
				privatePayload: JSON.stringify(notification.telemetry.events).includes('private')
			}, { invoked: 1, shown: ['accessibleView'], actions: [[`${role}Action`, role, 'continue', 'accessibleView']], privatePayload: false });
		});
	}

	test('accessible-view clear is a dismissal, not progress cancellation or an automatic-close event', async () => {
		const notification = setupNotification([{ severity: Severity.Info, message: 'Progress', progress: { infinite: true } }]);
		const { provider } = notification.createProvider();
		await provider.actions!.find(action => action.id === 'clearNotification')!.run();
		notification.handle.close();
		assert.deepStrictEqual(notification.telemetry.interactions.map(event => [event.interaction, event.surface]), [['dismiss', 'accessibleView']]);
	});

	test('releases close listeners when show resources are disposed while the notification survives', () => {
		const notification = setupNotification();
		for (let index = 0; index < 3; index++) {
			notification.createProvider().showing.dispose();
		}
		notification.handle.close();
		assert.strictEqual(notification.getNextCalls(), 0);
	});

	test('only the surviving provider responds when the notification closes', () => {
		const notification = setupNotification();
		notification.createProvider().showing.dispose();
		const provider = notification.createProvider();
		notification.handle.close();
		provider.showing.dispose();
		assert.strictEqual(notification.getNextCalls(), 1);
	});

	test('exposes explicit command and documentation links without parsing literal fragments or labels', async () => {
		const literal = 'README.md [Open](command:unexpected)';
		const linkLabel = '[Documentation](command:unexpected)';
		const notification = setupNotification([{
			severity: Severity.Info,
			message: NotificationText.concat(
				literal, 'x'.repeat(1001),
				NotificationText.link(linkLabel, 'https://example.com/docs'),
				' ',
				NotificationText.link('Show Logs', 'command:showLogs?%5B%22file%22%5D', 'Open Log'),
			),
		}]);
		const { provider } = notification.createProvider();
		const links = provider.actions!.filter(action => action.id.startsWith('notification.link.'));
		for (const link of links) {
			await link.run();
		}

		assert.deepStrictEqual({
			literalPresent: provider.provideContent().includes(literal),
			links: links.map(action => ({ label: action.label, tooltip: action.tooltip })),
			opened: notification.opened,
			nextCalls: notification.getNextCalls(),
		}, {
			literalPresent: true,
			links: [{ label: linkLabel, tooltip: 'https://example.com/docs' }, { label: 'Show Logs', tooltip: 'Open Log' }],
			opened: [
				{ uri: 'https://example.com/docs', options: { allowCommands: true } },
				{ uri: 'command:showLogs?%5B%22file%22%5D', options: { allowCommands: true } },
			],
			nextCalls: 0,
		});
	});

	for (const error of [false, true]) {
		test(`does not add actions for links embedded in literal ${error ? 'errors' : 'strings'}`, () => {
			const message = 'README.md [Open](command:unexpected) [Help](https://example.com)';
			const notification = setupNotification([{ severity: Severity.Error, message: error ? new Error(message) : message }]);
			const { provider } = notification.createProvider();
			assert.deepStrictEqual({
				literalPresent: provider.provideContent().includes(message),
				links: provider.actions!.filter(action => action.id.startsWith('notification.link.')),
			}, {
				literalPresent: true,
				links: [],
			});
		});
	}

	test('updates link actions and removes them when a message becomes literal', async () => {
		const notification = setupNotification([{ severity: Severity.Info, message: NotificationText.link('Details', 'command:first') }]);
		const { provider, showing } = notification.createProvider();
		let changes = 0;
		store.add(provider.onDidChangeContent!(() => changes++));

		notification.handle.updateMessage(NotificationText.link('Details', 'command:second'));
		await provider.actions!.find(action => action.id.startsWith('notification.link.'))!.run();
		notification.handle.updateMessage('Details');
		const plainLinks = provider.actions!.filter(action => action.id.startsWith('notification.link.'));
		showing.dispose();
		notification.handle.updateMessage('Update after closing the view');

		assert.deepStrictEqual({ opened: notification.opened, plainLinks, changes }, {
			opened: [{ uri: 'command:second', options: { allowCommands: true } }],
			plainLinks: [],
			changes: 2,
		});
	});

	test('keeps navigation actions and close listeners with the currently displayed notification', async () => {
		const notification = setupNotification([
			{ severity: Severity.Info, message: NotificationText.link('First', 'command:first') },
			{ severity: Severity.Info, message: NotificationText.link('Second', 'command:second') },
		]);
		const { provider } = notification.createProvider();
		const secondContent = provider.provideNextContent!();
		const secondLink = provider.actions!.find(action => action.id.startsWith('notification.link.'))!;
		await secondLink.run();
		const firstContent = provider.providePreviousContent!();
		const firstLink = provider.actions!.find(action => action.id.startsWith('notification.link.'))!;
		await firstLink.run();
		notification.handles[1].close();
		const nextCallsAfterOtherCloses = notification.getNextCalls();
		notification.handles[0].close();

		assert.deepStrictEqual({
			secondContent: secondContent?.includes('Second'),
			firstContent: firstContent?.includes('First'),
			labels: [secondLink.label, firstLink.label],
			opened: notification.opened,
			nextCallsAfterOtherCloses,
			nextCalls: notification.getNextCalls(),
		}, {
			secondContent: true,
			firstContent: true,
			labels: ['Second', 'First'],
			opened: [{ uri: 'command:second', options: { allowCommands: true } }, { uri: 'command:first', options: { allowCommands: true } }],
			nextCallsAfterOtherCloses: 0,
			nextCalls: 1,
		});
	});

	test('does not mutate existing actions when reopening or updating the accessible view', async () => {
		let calls = 0;
		const action = toAction({ id: 'original', label: 'Original Action', run: () => calls++ });
		const originalRun = action.run;
		const notification = setupNotification([{ severity: Severity.Info, message: 'Message', actions: { primary: [action] } }]);
		notification.createProvider().showing.dispose();
		const { provider } = notification.createProvider();
		notification.handle.updateMessage(NotificationText.link('Help', 'https://example.com'));
		await provider.actions!.find(candidate => candidate.id === action.id)!.run();

		assert.deepStrictEqual({
			calls,
			originalRunPreserved: action.run === originalRun,
			originalClass: action.class,
			nextCalls: notification.getNextCalls(),
		}, {
			calls: 1,
			originalRunPreserved: true,
			originalClass: undefined,
			nextCalls: 1,
		});
	});
});
