/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NotificationPriority, Severity, type INotification, type INotificationActions, type INotificationHandle, type INotificationProgress, type NotificationMessage } from '../../../../../../platform/notification/common/notification.js';
import { TerminalNotificationHandler, type IOsc99NotificationHost } from '../../browser/terminalNotificationHandler.js';

class TestNotificationProgress implements INotificationProgress {
	infinite(): void { }
	total(_value: number): void { }
	worked(_value: number): void { }
	done(): void { }
}

class TestNotificationHandle implements INotificationHandle {
	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose = this._onDidClose.event;
	readonly onDidChangeVisibility = Event.None;
	readonly progress = new TestNotificationProgress();
	closed = false;
	message: NotificationMessage;
	severity: Severity;
	actions?: INotificationActions;
	priority?: NotificationPriority;
	source?: string | { id: string; label: string };

	constructor(notification: INotification) {
		this.message = notification.message;
		this.severity = notification.severity;
		this.actions = notification.actions;
		this.priority = notification.priority;
		this.source = notification.source;
	}

	updateSeverity(severity: Severity): void {
		this.severity = severity;
	}

	updateMessage(message: NotificationMessage): void {
		this.message = message;
	}

	updateActions(actions?: INotificationActions): void {
		this._disposeActions(this.actions);
		this.actions = actions;
	}

	close(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this._disposeActions(this.actions);
		this._onDidClose.fire();
	}

	private _disposeActions(actions: INotificationActions | undefined): void {
		for (const action of actions?.primary ?? []) {
			const disposable = action as { dispose?: () => void };
			if (typeof disposable.dispose === 'function') {
				disposable.dispose();
			}
		}
		for (const action of actions?.secondary ?? []) {
			const disposable = action as { dispose?: () => void };
			if (typeof disposable.dispose === 'function') {
				disposable.dispose();
			}
		}
	}
}

class TestOsc99Host implements IOsc99NotificationHost {
	enabled = true;
	windowFocused = false;
	terminalVisible = false;
	writes: string[] = [];
	notifications: TestNotificationHandle[] = [];
	focusCalls = 0;
	updatedEnableNotifications: boolean[] = [];
	logMessages: string[] = [];

	isEnabled(): boolean {
		return this.enabled;
	}

	isWindowFocused(): boolean {
		return this.windowFocused;
	}

	isTerminalVisible(): boolean {
		return this.terminalVisible;
	}

	focusTerminal(): void {
		this.focusCalls++;
	}

	notify(notification: INotification): INotificationHandle {
		const handle = new TestNotificationHandle(notification);
		this.notifications.push(handle);
		return handle;
	}

	async updateEnableNotifications(value: boolean): Promise<void> {
		this.enabled = value;
		this.updatedEnableNotifications.push(value);
	}

	logWarn(message: string): void {
		this.logMessages.push(message);
	}

	writeToProcess(data: string): void {
		this.writes.push(data);
	}
}

suite('Terminal OSC 99 notifications', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let host: TestOsc99Host;
	let handler: TerminalNotificationHandler;

	setup(() => {
		host = new TestOsc99Host();
		handler = store.add(new TerminalNotificationHandler(host));
	});

	teardown(() => {
		for (const notification of host.notifications) {
			notification.close();
		}
	});

	test('ignores notifications when disabled', () => {
		host.enabled = false;

		handler.handleSequence(';Hello');
		strictEqual(host.notifications.length, 0);
		strictEqual(host.writes.length, 0);
	});

	test('creates notification for title and body and updates', () => {
		handler.handleSequence('i=1:d=0:p=title;Hello');
		strictEqual(host.notifications.length, 0);

		handler.handleSequence('i=1:p=body;World');
		strictEqual(host.notifications.length, 1);
		strictEqual(host.notifications[0].message, 'Hello: World');
	});

	test('decodes base64 payloads', () => {
		handler.handleSequence('e=1:p=title;SGVsbG8=');
		strictEqual(host.notifications.length, 1);
		strictEqual(host.notifications[0].message, 'Hello');
	});

	test('sanitizes markdown links in payloads', () => {
		handler.handleSequence('i=link:d=0:p=title;Click [run](command:workbench.action.reloadWindow)');
		handler.handleSequence('i=link:p=body;See [docs](https://example.com)');
		strictEqual(host.notifications.length, 1);
		strictEqual(host.notifications[0].message, 'Click run: See docs');
	});

	test('defers display until done', () => {
		handler.handleSequence('i=chunk:d=0:p=title;Hello ');
		strictEqual(host.notifications.length, 0);

		handler.handleSequence('i=chunk:d=1:p=title;World');
		strictEqual(host.notifications.length, 1);
		strictEqual(host.notifications[0].message, 'Hello World');
	});

	test('reports activation on button click', async () => {
		handler.handleSequence('i=btn:d=0:a=report:p=title;Hi');
		handler.handleSequence('i=btn:p=buttons;Yes');

		const actions = host.notifications[0].actions;
		if (!actions?.primary || actions.primary.length === 0) {
			throw new Error('Expected primary actions');
		}
		await actions.primary[0].run();
		strictEqual(host.writes[0], '\x1b]99;i=btn;1\x1b\\');
	});

	test('supports buttons before title and reports body activation', async () => {
		handler.handleSequence('i=btn:p=buttons;One\u2028Two');
		handler.handleSequence('i=btn:a=report;Buttons test');

		strictEqual(host.notifications.length, 1);
		const actions = host.notifications[0].actions;
		if (!actions?.primary || actions.primary.length !== 2) {
			throw new Error('Expected two primary actions');
		}
		strictEqual(actions.primary[0].label, 'One');
		strictEqual(actions.primary[1].label, 'Two');

		await actions.primary[1].run();
		strictEqual(host.writes[0], '\x1b]99;i=btn;2\x1b\\');
	});

	test('reports activation when notification closes without button action', () => {
		handler.handleSequence('i=btn:p=buttons;One\u2028Two');
		handler.handleSequence('i=btn:a=report;Buttons test');

		host.notifications[0].close();
		strictEqual(host.writes[0], '\x1b]99;i=btn;\x1b\\');
	});

	test('sends close report when requested', () => {
		handler.handleSequence('i=close:c=1:p=title;Bye');
		strictEqual(host.notifications.length, 1);
		host.notifications[0].close();
		strictEqual(host.writes[0], '\x1b]99;i=close:p=close;\x1b\\');
	});

	test('responds to query and alive', () => {
		handler.handleSequence('i=a:p=title;A');
		handler.handleSequence('i=b:p=title;B');
		handler.handleSequence('i=q:p=?;');
		handler.handleSequence('i=q:p=alive;');

		strictEqual(host.writes[0], '\x1b]99;i=q:p=?:a=report,focus:c=1:o=always,unfocused,invisible:p=title,body,buttons,close,alive,?:u=0,1,2:w=1;\x1b\\');
		strictEqual(host.writes[1], '\x1b]99;i=q:p=alive;a,b\x1b\\');
	});

	test('honors occasion for visibility and focus', () => {
		host.windowFocused = true;
		host.terminalVisible = true;
		handler.handleSequence('o=unfocused:p=title;Hidden');
		strictEqual(host.notifications.length, 0);

		host.windowFocused = false;
		host.terminalVisible = true;
		handler.handleSequence('o=invisible:p=title;Hidden');
		strictEqual(host.notifications.length, 0);

		host.terminalVisible = false;
		handler.handleSequence('o=invisible:p=title;Shown');
		strictEqual(host.notifications.length, 1);
	});

	test('closes notifications via close payload', () => {
		handler.handleSequence('i=closeme:p=title;Close');
		strictEqual(host.notifications.length, 1);
		strictEqual(host.notifications[0].closed, false);

		handler.handleSequence('i=closeme:p=close;');
		strictEqual(host.notifications[0].closed, true);
	});

	test('maps urgency to severity and priority', () => {
		handler.handleSequence('u=2:p=title;Urgent');
		strictEqual(host.notifications[0].severity, Severity.Warning);
		strictEqual(host.notifications[0].priority, NotificationPriority.URGENT);
	});
});
