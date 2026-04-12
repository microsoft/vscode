/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NotificationPriority, Severity } from '../../../../../../platform/notification/common/notification.js';
import { TerminalNotificationHandler } from '../../browser/terminalNotificationHandler.js';
class TestNotificationProgress {
    infinite() { }
    total(_value) { }
    worked(_value) { }
    done() { }
}
class TestNotificationHandle {
    constructor(notification) {
        this._onDidClose = new Emitter();
        this.onDidClose = this._onDidClose.event;
        this.onDidChangeVisibility = Event.None;
        this.progress = new TestNotificationProgress();
        this.closed = false;
        this.message = notification.message;
        this.severity = notification.severity;
        this.actions = notification.actions;
        this.priority = notification.priority;
        this.source = notification.source;
    }
    updateSeverity(severity) {
        this.severity = severity;
    }
    updateMessage(message) {
        this.message = message;
    }
    updateActions(actions) {
        this._disposeActions(this.actions);
        this.actions = actions;
    }
    close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this._disposeActions(this.actions);
        this._onDidClose.fire();
    }
    _disposeActions(actions) {
        for (const action of actions?.primary ?? []) {
            const disposable = action;
            if (typeof disposable.dispose === 'function') {
                disposable.dispose();
            }
        }
        for (const action of actions?.secondary ?? []) {
            const disposable = action;
            if (typeof disposable.dispose === 'function') {
                disposable.dispose();
            }
        }
    }
}
class TestOsc99Host {
    constructor() {
        this.enabled = true;
        this.windowFocused = false;
        this.terminalVisible = false;
        this.writes = [];
        this.notifications = [];
        this.focusCalls = 0;
        this.updatedEnableNotifications = [];
        this.logMessages = [];
    }
    isEnabled() {
        return this.enabled;
    }
    isWindowFocused() {
        return this.windowFocused;
    }
    isTerminalVisible() {
        return this.terminalVisible;
    }
    focusTerminal() {
        this.focusCalls++;
    }
    notify(notification) {
        const handle = new TestNotificationHandle(notification);
        this.notifications.push(handle);
        return handle;
    }
    async updateEnableNotifications(value) {
        this.enabled = value;
        this.updatedEnableNotifications.push(value);
    }
    logWarn(message) {
        this.logMessages.push(message);
    }
    writeToProcess(data) {
        this.writes.push(data);
    }
}
suite('Terminal OSC 99 notifications', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let host;
    let handler;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxOb3RpZmljYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9ub3RpZmljYXRpb24vdGVzdC9icm93c2VyL3Rlcm1pbmFsTm90aWZpY2F0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNyQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQWlJLE1BQU0sZ0VBQWdFLENBQUM7QUFDL08sT0FBTyxFQUFFLDJCQUEyQixFQUErQixNQUFNLDhDQUE4QyxDQUFDO0FBRXhILE1BQU0sd0JBQXdCO0lBQzdCLFFBQVEsS0FBVyxDQUFDO0lBQ3BCLEtBQUssQ0FBQyxNQUFjLElBQVUsQ0FBQztJQUMvQixNQUFNLENBQUMsTUFBYyxJQUFVLENBQUM7SUFDaEMsSUFBSSxLQUFXLENBQUM7Q0FDaEI7QUFFRCxNQUFNLHNCQUFzQjtJQVkzQixZQUFZLFlBQTJCO1FBWHRCLGdCQUFXLEdBQUcsSUFBSSxPQUFPLEVBQVEsQ0FBQztRQUMxQyxlQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUM7UUFDcEMsMEJBQXFCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNuQyxhQUFRLEdBQUcsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO1FBQ25ELFdBQU0sR0FBRyxLQUFLLENBQUM7UUFRZCxJQUFJLENBQUMsT0FBTyxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUM7UUFDcEMsSUFBSSxDQUFDLFFB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