/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NotificationsModel, NotificationViewItem, INotificationChangeEvent, NotificationChangeType, NotificationViewItemContentChangeKind, IStatusMessageChangeEvent, StatusMessageChangeType, INotificationsFilter } from '../../common/notifications.js';
import { Action } from '../../../base/common/actions.js';
import { INotification, Severity, NotificationsFilter, NotificationPriority } from '../../../platform/notification/common/notification.js';
import { createErrorWithActions } from '../../../base/common/errorMessage.js';
import { timeout } from '../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { legacyExtensionLinkParsing } from '../../../platform/notification/common/notificationLegacy.js';
import { NotificationText } from '../../../platform/notification/common/notificationMessage.js';

suite('Notifications', () => {

	const disposables = new DisposableStore();
	const noFilter: INotificationsFilter = { global: NotificationsFilter.OFF, sources: new Map() };

	teardown(() => {
		disposables.clear();
	});

	function createItem(notification: INotification) {
		const item = NotificationViewItem.create(notification, noFilter)!;
		disposables.add(toDisposable(() => item.close()));
		return item;
	}

	test('renders strings and errors literally by default', () => {
		const message = 'README.md [Open](command:workbench.action.files.newUntitledFile "Open README") [Help](https://example.com) <b>text</b>';
		const items = [
			createItem({ severity: Severity.Info, message }),
			createItem({ severity: Severity.Error, message: new Error(message) }),
			createItem({ severity: Severity.Warning, message }),
		];

		assert.deepStrictEqual(items.map(item => ({
			raw: item.message.raw,
			nodes: item.message.linkedText.nodes
		})), items.map(() => ({ raw: message, nodes: [message] })));
	});

	test('does not accept boolean or lookalike legacy parsing capabilities at runtime', () => {
		const message = '[Open](command:unexpected)';
		const nodes = [true, {}, Symbol('legacyExtensionLinkParsing')].map(capability => createItem({
			severity: Severity.Info,
			message,
			// @ts-expect-error Only the extension bridge capability can enable legacy parsing.
			legacyExtensionLinkParsing: capability,
		}).message.linkedText.nodes);
		assert.deepStrictEqual(nodes, [[message], [message], [message]]);
	});

	test('preserves explicit links without interpreting literal fragments or link labels', () => {
		const filename = '[Open](command:unexpected)';
		const link = { label: filename, href: 'command:showLogs?%5B%22file%22%5D', title: 'Show Logs' };
		const message = NotificationText.format('Cannot open {0}. {1}', filename, NotificationText.link(link.label, link.href, link.title));
		const item = createItem({ severity: Severity.Error, message });

		assert.deepStrictEqual({
			raw: item.message.raw,
			nodes: item.message.linkedText.nodes,
		}, {
			raw: `Cannot open ${filename}. ${filename}`,
			nodes: [`Cannot open ${filename}. `, link],
		});
	});

	test('updating a structured message with plain text removes links even when the text is unchanged', () => {
		const item = createItem({ severity: Severity.Info, message: NotificationText.link('Details', 'command:showDetails') });
		const changes: NotificationViewItemContentChangeKind[] = [];
		disposables.add(item.onDidChangeContent(event => changes.push(event.kind)));

		item.updateMessage('Details');
		item.updateMessage('Details');

		assert.deepStrictEqual({
			nodes: item.message.linkedText.nodes,
			changes
		}, {
			nodes: ['Details'],
			changes: [NotificationViewItemContentChangeKind.MESSAGE]
		});
	});

	test('updates link targets without requiring a label change', () => {
		const item = createItem({ severity: Severity.Info, message: NotificationText.link('Details', 'command:first') });
		const changes: NotificationViewItemContentChangeKind[] = [];
		disposables.add(item.onDidChangeContent(event => changes.push(event.kind)));

		item.updateMessage(NotificationText.link('Details', 'command:second'));
		item.updateMessage(NotificationText.link('Details', 'command:second'));

		assert.deepStrictEqual({
			nodes: item.message.linkedText.nodes,
			changes
		}, {
			nodes: [{ label: 'Details', href: 'command:second' }],
			changes: [NotificationViewItemContentChangeKind.MESSAGE]
		});
	});

	test('does not deduplicate literal text and different links with the same label', () => {
		const literal = createItem({ severity: Severity.Info, message: 'Details' });
		const first = createItem({ severity: Severity.Info, message: NotificationText.link('Details', 'command:first') });
		const duplicate = createItem({ severity: Severity.Info, message: NotificationText.link('Details', 'command:first') });
		const second = createItem({ severity: Severity.Info, message: NotificationText.link('Details', 'command:second') });

		assert.deepStrictEqual([
			literal.equals(first),
			first.equals(second),
			first.equals(duplicate),
		], [false, false, true]);
	});

	test('preserves legacy link parsing and updates with the extension capability', () => {
		const item = createItem({
			severity: Severity.Info,
			message: '  [Show Logs](command:python.viewOutput)\r\n[Help](https://example.com)  ',
			legacyExtensionLinkParsing,
		});
		const initial = item.message.linkedText.nodes;
		item.updateMessage('[Check details](command:java.show.server.task.status "Build Status")');

		assert.deepStrictEqual({
			initial,
			updated: item.message.linkedText.nodes,
		}, {
			initial: [{ label: 'Show Logs', href: 'command:python.viewOutput' }, ' ', { label: 'Help', href: 'https://example.com' }],
			updated: [{ label: 'Check details', href: 'command:java.show.server.task.status', title: 'Build Status' }]
		});
	});

	test('normalizes and truncates messages while preserving the original text', () => {
		const message = `  line one\r\nline two\rline three\n${'x'.repeat(1000)}`;
		const item = createItem({ severity: Severity.Info, message });
		const legacy = createItem({ severity: Severity.Info, message: `${'x'.repeat(995)}[Open](command:unexpected)`, legacyExtensionLinkParsing });

		assert.deepStrictEqual({
			raw: item.message.raw,
			displayed: item.message.linkedText.toString(),
			legacyNodes: legacy.message.linkedText.nodes,
		}, {
			raw: message,
			displayed: `${message.substring(0, 1000).replace(/\r\n|\n|\r/g, ' ').trimStart()}...`,
			legacyNodes: [`${'x'.repeat(995)}[Open...`],
		});
	});

	test('truncates structured labels without changing link targets', () => {
		const href = `command:showLogs?${'x'.repeat(1100)}`;
		const item = createItem({
			severity: Severity.Info,
			message: NotificationText.concat('x'.repeat(999), NotificationText.link('Details', href))
		});

		assert.deepStrictEqual(item.message.linkedText.nodes, [
			'x'.repeat(999),
			{ label: 'D', href },
			'...'
		]);
	});

	test('shows structured status messages as plain text', () => {
		const model = disposables.add(new NotificationsModel());
		const message = NotificationText.concat('Open ', NotificationText.link('logs', 'command:showLogs'));
		const handle = model.showStatusMessage(message);
		disposables.add(toDisposable(() => handle.close()));

		assert.strictEqual(model.statusMessage?.message, 'Open logs');
	});

	test('Items', () => {

		// Invalid
		assert.ok(!NotificationViewItem.create({ severity: Severity.Error, message: '' }, noFilter));
		assert.ok(!NotificationViewItem.create({ severity: Severity.Error, message: null! }, noFilter));

		// Duplicates
		const item1 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' }, noFilter)!;
		const item2 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' }, noFilter)!;
		const item3 = NotificationViewItem.create({ severity: Severity.Info, message: 'Info Message' }, noFilter)!;
		const item4 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message', source: 'Source' }, noFilter)!;
		const item5 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message', actions: { primary: [disposables.add(new Action('id', 'label'))] } }, noFilter)!;
		const item6 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message', actions: { primary: [disposables.add(new Action('id', 'label'))] }, progress: { infinite: true } }, noFilter)!;

		assert.strictEqual(item1.equals(item1), true);
		assert.strictEqual(item2.equals(item2), true);
		assert.strictEqual(item3.equals(item3), true);
		assert.strictEqual(item4.equals(item4), true);
		assert.strictEqual(item5.equals(item5), true);

		assert.strictEqual(item1.equals(item2), true);
		assert.strictEqual(item1.equals(item3), false);
		assert.strictEqual(item1.equals(item4), false);
		assert.strictEqual(item1.equals(item5), false);

		const itemId1 = NotificationViewItem.create({ id: 'same', message: 'Info Message', severity: Severity.Info }, noFilter)!;
		const itemId2 = NotificationViewItem.create({ id: 'same', message: 'Error Message', severity: Severity.Error }, noFilter)!;

		assert.strictEqual(itemId1.equals(itemId2), true);
		assert.strictEqual(itemId1.equals(item3), false);

		// Progress
		assert.strictEqual(item1.hasProgress, false);
		assert.strictEqual(item1.hasActiveProgress, false);
		assert.strictEqual(item6.hasProgress, true);
		assert.strictEqual(item6.hasActiveProgress, true);

		// Message Box
		assert.strictEqual(item5.canCollapse, false);
		assert.strictEqual(item5.expanded, true);

		// Events
		let called = 0;
		disposables.add(item1.onDidChangeExpansion(() => {
			called++;
		}));

		item1.expand();
		item1.expand();
		item1.collapse();
		item1.collapse();

		assert.strictEqual(called, 2);

		called = 0;
		disposables.add(item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.PROGRESS) {
				called++;
			}
		}));

		item1.progress.infinite();
		item1.progress.done();

		assert.strictEqual(called, 2);

		called = 0;
		disposables.add(item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.MESSAGE) {
				called++;
			}
		}));

		item1.updateMessage('message update');

		called = 0;
		disposables.add(item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.SEVERITY) {
				called++;
			}
		}));

		item1.updateSeverity(Severity.Error);

		called = 0;
		disposables.add(item1.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.ACTIONS) {
				called++;
			}
		}));

		item1.updateActions({ primary: [disposables.add(new Action('id2', 'label'))] });

		assert.strictEqual(called, 1);

		called = 0;
		disposables.add(item1.onDidChangeVisibility(e => {
			called++;
		}));

		item1.updateVisibility(true);
		item1.updateVisibility(false);
		item1.updateVisibility(false);

		assert.strictEqual(called, 2);

		called = 0;
		disposables.add(item1.onDidClose(() => {
			called++;
		}));

		item1.close();
		assert.strictEqual(called, 1);

		// Error with Action
		const item7 = NotificationViewItem.create({ severity: Severity.Error, message: createErrorWithActions('Hello Error', [disposables.add(new Action('id', 'label'))]) }, noFilter)!;
		assert.strictEqual(item7.actions!.primary!.length, 1);

		// Filter
		const item8 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' }, { global: NotificationsFilter.OFF, sources: new Map() })!;
		assert.strictEqual(item8.priority, NotificationPriority.DEFAULT);

		const item9 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' }, { global: NotificationsFilter.ERROR, sources: new Map() })!;
		assert.strictEqual(item9.priority, NotificationPriority.DEFAULT);

		const item10 = NotificationViewItem.create({ severity: Severity.Warning, message: 'Error Message' }, { global: NotificationsFilter.ERROR, sources: new Map() })!;
		assert.strictEqual(item10.priority, NotificationPriority.SILENT);

		const sources = new Map<string, NotificationsFilter>();
		sources.set('test.source', NotificationsFilter.ERROR);
		const item11 = NotificationViewItem.create({ severity: Severity.Warning, message: 'Error Message', source: 'test.source' }, { global: NotificationsFilter.OFF, sources })!;
		assert.strictEqual(item11.priority, NotificationPriority.DEFAULT);
		const item12 = NotificationViewItem.create({ severity: Severity.Warning, message: 'Error Message', source: { id: 'test.source', label: 'foo' } }, { global: NotificationsFilter.OFF, sources })!;
		assert.strictEqual(item12.priority, NotificationPriority.SILENT);
		const item13 = NotificationViewItem.create({ severity: Severity.Warning, message: 'Error Message', source: { id: 'test.source2', label: 'foo' } }, { global: NotificationsFilter.OFF, sources })!;
		assert.strictEqual(item13.priority, NotificationPriority.DEFAULT);

		for (const item of [item1, item2, item3, item4, item5, item6, itemId1, itemId2, item7, item8, item9, item10, item11, item12, item13]) {
			item.close();
		}
	});

	test('Progress activity tracks starts, updates, completion, and restart', () => {
		const item = NotificationViewItem.create({ severity: Severity.Info, message: 'Progress' }, noFilter)!;
		const states: { hasProgress: boolean; hasActiveProgress: boolean; sticky: boolean; activeProgressChanged: boolean | undefined }[] = [];
		const captureState = (activeProgressChanged?: boolean) => states.push({
			hasProgress: item.hasProgress,
			hasActiveProgress: item.hasActiveProgress,
			sticky: item.sticky,
			activeProgressChanged
		});
		disposables.add(item.onDidChangeContent(e => {
			if (e.kind === NotificationViewItemContentChangeKind.PROGRESS) {
				captureState(e.activeProgressChanged);
			}
		}));

		captureState();
		const progress = item.progress;
		captureState();
		progress.infinite();
		progress.total(100);
		progress.worked(10);
		progress.done();
		progress.infinite();

		assert.deepStrictEqual(states, [
			{ hasProgress: false, hasActiveProgress: false, sticky: false, activeProgressChanged: undefined },
			{ hasProgress: true, hasActiveProgress: false, sticky: false, activeProgressChanged: undefined },
			{ hasProgress: true, hasActiveProgress: true, sticky: true, activeProgressChanged: true },
			{ hasProgress: true, hasActiveProgress: true, sticky: true, activeProgressChanged: false },
			{ hasProgress: true, hasActiveProgress: true, sticky: true, activeProgressChanged: false },
			{ hasProgress: true, hasActiveProgress: false, sticky: false, activeProgressChanged: true },
			{ hasProgress: true, hasActiveProgress: true, sticky: true, activeProgressChanged: true }
		]);

		item.close();
	});

	test('Completed progress notifications remain unique', () => {
		const model = disposables.add(new NotificationsModel());
		const first = model.addNotification({ severity: Severity.Info, message: 'Same message' });
		let firstClosed = false;
		disposables.add(first.onDidClose(() => firstClosed = true));

		first.progress.infinite();
		first.progress.done();
		const second = model.addNotification({ severity: Severity.Info, message: 'Same message' });

		assert.deepStrictEqual({
			notificationCount: model.notifications.length,
			firstClosed
		}, {
			notificationCount: 2,
			firstClosed: false
		});

		first.close();
		second.close();
	});

	test('Items - does not fire changed when message did not change (content, severity)', async () => {
		const item1 = NotificationViewItem.create({ severity: Severity.Error, message: 'Error Message' }, noFilter)!;

		let fired = false;
		disposables.add(item1.onDidChangeContent(() => {
			fired = true;
		}));

		item1.updateMessage('Error Message');
		await timeout(0);
		assert.ok(!fired, 'Expected onDidChangeContent to not be fired');

		item1.updateSeverity(Severity.Error);
		await timeout(0);
		assert.ok(!fired, 'Expected onDidChangeContent to not be fired');

		for (const item of [item1]) {
			item.close();
		}
	});

	test('Model', () => {
		const model = disposables.add(new NotificationsModel());

		let lastNotificationEvent!: INotificationChangeEvent;
		disposables.add(model.onDidChangeNotification(e => {
			lastNotificationEvent = e;
		}));

		let lastStatusMessageEvent!: IStatusMessageChangeEvent;
		disposables.add(model.onDidChangeStatusMessage(e => {
			lastStatusMessageEvent = e;
		}));

		const item1: INotification = { severity: Severity.Error, message: 'Error Message', actions: { primary: [disposables.add(new Action('id', 'label'))] } };
		const item2: INotification = { severity: Severity.Warning, message: 'Warning Message', source: 'Some Source' };
		const item2Duplicate: INotification = { severity: Severity.Warning, message: 'Warning Message', source: 'Some Source' };
		const item3: INotification = { severity: Severity.Info, message: 'Info Message' };

		const item1Handle = model.addNotification(item1);
		assert.strictEqual(lastNotificationEvent.item.severity, item1.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item1.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.ADD);

		item1Handle.updateMessage('Different Error Message');
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assert.strictEqual(lastNotificationEvent.detail, NotificationViewItemContentChangeKind.MESSAGE);

		item1Handle.updateSeverity(Severity.Warning);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assert.strictEqual(lastNotificationEvent.detail, NotificationViewItemContentChangeKind.SEVERITY);

		item1Handle.updateActions({ primary: [], secondary: [] });
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assert.strictEqual(lastNotificationEvent.detail, NotificationViewItemContentChangeKind.ACTIONS);

		item1Handle.progress.infinite();
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.CHANGE);
		assert.strictEqual(lastNotificationEvent.detail, NotificationViewItemContentChangeKind.PROGRESS);

		const item2Handle = model.addNotification(item2);
		assert.strictEqual(lastNotificationEvent.item.severity, item2.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item2.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.ADD);

		const item3Handle = model.addNotification(item3);
		assert.strictEqual(lastNotificationEvent.item.severity, item3.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item3.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.ADD);

		assert.strictEqual(model.notifications.length, 3);

		let called = 0;
		disposables.add(item1Handle.onDidClose(() => {
			called++;
		}));

		item1Handle.close();
		assert.strictEqual(called, 1);
		assert.strictEqual(model.notifications.length, 2);
		assert.strictEqual(lastNotificationEvent.item.severity, Severity.Warning);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), 'Different Error Message');
		assert.strictEqual(lastNotificationEvent.index, 2);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.REMOVE);

		const item2DuplicateHandle = model.addNotification(item2Duplicate);
		assert.strictEqual(model.notifications.length, 2);
		assert.strictEqual(lastNotificationEvent.item.severity, item2Duplicate.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item2Duplicate.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.ADD);

		item2Handle.close();
		assert.strictEqual(model.notifications.length, 1);
		assert.strictEqual(lastNotificationEvent.item.severity, item2Duplicate.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item2Duplicate.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.REMOVE);

		model.notifications[0].expand();
		assert.strictEqual(lastNotificationEvent.item.severity, item3.severity);
		assert.strictEqual(lastNotificationEvent.item.message.linkedText.toString(), item3.message);
		assert.strictEqual(lastNotificationEvent.index, 0);
		assert.strictEqual(lastNotificationEvent.kind, NotificationChangeType.EXPAND_COLLAPSE);

		const disposable = model.showStatusMessage('Hello World');
		assert.strictEqual(model.statusMessage!.message, 'Hello World');
		assert.strictEqual(lastStatusMessageEvent.item.message, model.statusMessage!.message);
		assert.strictEqual(lastStatusMessageEvent.kind, StatusMessageChangeType.ADD);
		disposable.close();
		assert.ok(!model.statusMessage);
		assert.strictEqual(lastStatusMessageEvent.kind, StatusMessageChangeType.REMOVE);

		const disposable2 = model.showStatusMessage('Hello World 2');
		const disposable3 = model.showStatusMessage('Hello World 3');

		assert.strictEqual(model.statusMessage!.message, 'Hello World 3');

		disposable2.close();
		assert.strictEqual(model.statusMessage!.message, 'Hello World 3');

		disposable3.close();
		assert.ok(!model.statusMessage);

		item2DuplicateHandle.close();
		item3Handle.close();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
