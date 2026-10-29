/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { ensureCodeWindow, mainWindow } from '../../../../../../base/browser/window.js';
import { Action } from '../../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { AccessibleViewRegistry } from '../../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Context } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IManagedHover } from '../../../../../../base/browser/ui/hover/hover.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { KeyCodeChord } from '../../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../../workbench/services/layout/browser/layoutService.js';
import { IsSessionsWindowContext } from '../../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AccessibilityVerbositySettingId } from '../../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ConnectionHostManagementAction, IConnectionDiagnosticsService, IConnectionDiagnosticsSnapshot, IConnectionHostManagementEntry, IConnectionHostManagementState, ShowConnectionDiagnosticsCommandId } from '../../browser/connectionDiagnostics.js';
import { ConnectionDiagnosticsReport, showConnectionDiagnosticsSheet } from '../../browser/connectionDiagnosticsReport.js';
import { ConnectionDiagnosticsContribution } from '../../browser/connectionDiagnostics.contribution.js';
import { SessionsChatAccessibilityHelp } from '../../../../chat/browser/sessionsChatAccessibilityHelp.js';
import { HostFilterActionViewItem } from '../../browser/hostFilterActionViewItem.js';
import { MobileHostFilterActionViewItem } from '../../browser/mobileHostFilterActionViewItem.js';

suite('ConnectionDiagnosticsReport', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const snapshot: IConnectionDiagnosticsSnapshot = {
		capturedAt: '2026-09-14T12:00:00Z',
		sections: [{
			title: 'This client',
			collapsed: true,
			entries: [{ label: 'Environment', value: 'Web browser' }],
		}, {
			title: 'Discovery',
			description: 'No discovery has completed.',
			entries: [{ label: 'Detail', value: '<script>not markup</script>' }],
		}],
		text: 'No hosts found\nDiscovery\nDetail: <script>not markup</script>\nThis client\nEnvironment: Web browser',
	};

	function createReport(
		writeText: (text: string) => Promise<void>,
		download: typeof dom.triggerDownload = () => { },
		options: { readonly enableHostManagement?: boolean; readonly rediscoverOnRefresh?: boolean; readonly discoverySucceeded?: boolean } = {},
	) {
		const container = dom.$('div');
		let current = snapshot;
		let rediscoveries = 0;
		const service = new class extends mock<IConnectionDiagnosticsService>() {
			override readonly onDidChangeHostManagement = Event.None;
			override async getSnapshot(): Promise<IConnectionDiagnosticsSnapshot> { return current; }
			override getHostManagementState(): IConnectionHostManagementState { return { hosts: [], isDiscovering: false }; }
			override async runHostAction(): Promise<void> { }
			override async rediscover(): Promise<boolean> { rediscoveries++; return options.discoverySucceeded !== false; }
		}();
		const clipboard = new class extends mock<IClipboardService>() {
			override writeText = writeText;
		}();
		const report = store.add(new ConnectionDiagnosticsReport(container, snapshot, download, {
			enableHostManagement: options.enableHostManagement !== false,
			rediscoverOnRefresh: options.rediscoverOnRefresh !== false,
		}, service, clipboard));
		return { container, report, service, clipboard, update: (next: IConnectionDiagnosticsSnapshot) => { current = next; }, rediscoveries: () => rediscoveries };
	}

	function createContribution(service: IConnectionDiagnosticsService, clipboard: IClipboardService, getContainer: () => HTMLElement, verbosity = false, web = true, returnFocusToPart?: (part: Parts) => void): ConnectionDiagnosticsContribution {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConnectionDiagnosticsService, service);
		instantiationService.stub(IClipboardService, clipboard);
		instantiationService.stub(IWorkbenchLayoutService, {
			onDidLayoutMainContainer: Event.None,
			hasFocus: (part: Parts) => returnFocusToPart !== undefined && part === Parts.TITLEBAR_PART,
			focusPart: (part: Parts) => returnFocusToPart?.(part),
			get activeContainer() { return getContainer(); },
			get mainContainer() { return getContainer(); },
		});
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.stub(IChatEntitlementService, { sentiment: { hidden: false }, onDidChangeSentiment: Event.None });
		instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => true });
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [AccessibilityVerbositySettingId.ConnectionDiagnostics]: verbosity }));
		instantiationService.stub(IKeybindingService, {
			lookupKeybinding: () => new USLayoutResolvedKeybinding([new KeyCodeChord(false, false, true, false, KeyCode.F1)], OperatingSystem.Windows),
		});
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
		return store.add(instantiationService.createInstance(class extends ConnectionDiagnosticsContribution {
			protected override get isWebPlatform(): boolean { return web; }
		}));
	}

	test('diagnostics help takes precedence over general Agents chat help only in its own context', () => {
		const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'connectionDiagnostics' && implementation.type === AccessibleViewType.Help)!;
		assert.deepStrictEqual({
			priorityAboveChat: help.priority > new SessionsChatAccessibilityHelp().priority,
			context: help.when?.serialize(),
		}, { priorityAboveChat: true, context: 'connectionDiagnosticsFocused' });
	});

	test('closing diagnostics returns to the originating toolbar if its control was replaced', async () => {
		const { service, clipboard } = createReport(async () => { });
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const trigger = dom.append(container, dom.$('button'));
		trigger.focus();
		const focusedParts: Parts[] = [];
		const contribution = createContribution(service, clipboard, () => container, false, true, part => focusedParts.push(part));
		const closed = contribution.show();
		await Promise.resolve();
		trigger.remove();
		container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
		await closed;
		assert.deepStrictEqual(focusedParts, [Parts.TITLEBAR_PART]);
	});

	for (const web of [false, true]) {
		test(`${web ? 'web' : 'native'} accessibility help matches available host actions and refresh behavior`, async () => {
			const { service, clipboard } = createReport(async () => { });
			const container = dom.append(mainWindow.document.body, dom.$('div'));
			store.add(toDisposable(() => container.remove()));
			const contribution = createContribution(service, clipboard, () => container, false, web);
			const closed = contribution.show();
			await Promise.resolve();
			const help = store.add(contribution.getAccessibleProvider(AccessibleViewType.Help)!);
			const text = help.provideContent();
			await closed;
			assert.deepStrictEqual({
				describesHostActions: text.includes('Connect and Disconnect'),
				describesRediscovery: text.includes('Refresh re-runs host discovery'),
				describesSnapshotOnly: text.includes('Refresh reads current local state without discovery'),
			}, {
				describesHostActions: web,
				describesRediscovery: web,
				describesSnapshotOnly: !web,
			});
		});
	}

	test('renders facts without a duplicate host list, with client details collapsed at the bottom', () => {
		const { container } = createReport(async () => { });
		assert.deepStrictEqual({
			headings: Array.from(container.querySelectorAll('h2, summary'), element => element.textContent),
			details: Array.from(container.querySelectorAll('dd'), element => element.textContent),
			clientOpen: container.querySelector('details')?.open,
			last: container.querySelector('.connection-diagnostics-content')?.lastElementChild?.tagName,
			feedbackHidden: container.querySelector<HTMLElement>('[role="status"]')?.hidden,
			scripts: container.querySelectorAll('script').length,
			buttons: container.querySelectorAll('button, [role="button"]').length,
			scrollables: container.querySelectorAll('.monaco-scrollable-element.connection-diagnostics-scrollable').length,
		}, {
			headings: ['Discovery', 'This client'],
			details: ['<script>not markup</script>', 'Web browser'],
			clientOpen: false,
			last: 'DETAILS',
			feedbackHidden: true,
			scripts: 0,
			buttons: 0,
			scrollables: 1,
		});
	});

	test('mouse wheel scrolls and is consumed by the report scrollable', () => {
		const { container } = createReport(async () => { });
		const content = container.querySelector<HTMLElement>('.connection-diagnostics-content')!;
		const scrollable = container.querySelector<HTMLElement>('.connection-diagnostics-scrollable')!;
		let scrollTop = 0;
		Object.defineProperties(content, {
			clientHeight: { configurable: true, value: 100 },
			scrollHeight: { configurable: true, value: 1000 },
			scrollTop: {
				configurable: true,
				get: () => scrollTop,
				set: value => scrollTop = value,
			},
		});
		container.querySelector<HTMLDetailsElement>('details')!.dispatchEvent(new mainWindow.Event('toggle'));
		const event = new mainWindow.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
		Object.defineProperty(event, 'wheelDeltaY', { value: -120 });
		scrollable.dispatchEvent(event);
		assert.deepStrictEqual({
			consumed: event.defaultPrevented,
			scrolled: content.scrollTop > 0,
		}, {
			consumed: true,
			scrolled: true,
		});
	});

	test('native scrolling keeps the workbench scrollbar in sync without moving report focus', async () => {
		const { container, report } = createReport(async () => { });
		dom.append(mainWindow.document.body, container);
		store.add(toDisposable(() => container.remove()));
		const content = container.querySelector<HTMLElement>('.connection-diagnostics-content')!;
		const scrollable = container.querySelector<HTMLElement>('.connection-diagnostics-scrollable')!;
		let scrollTop = 0;
		let dimensionReads = 0;
		Object.defineProperties(content, {
			clientHeight: { configurable: true, get: () => { dimensionReads++; return 100; } },
			scrollHeight: { configurable: true, get: () => { dimensionReads++; return 1000; } },
			clientWidth: { configurable: true, get: () => { dimensionReads++; return 200; } },
			scrollWidth: { configurable: true, get: () => { dimensionReads++; return 200; } },
			scrollTop: {
				configurable: true,
				get: () => scrollTop,
				set: value => scrollTop = value,
			},
		});
		container.querySelector<HTMLDetailsElement>('details')!.dispatchEvent(new mainWindow.Event('toggle'));
		report.focus();
		scrollTop = 400;
		dimensionReads = 0;
		content.dispatchEvent(new mainWindow.Event('scroll'));
		const scrollDimensionReads = dimensionReads;
		const event = new mainWindow.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
		Object.defineProperty(event, 'wheelDeltaY', { value: -120 });
		scrollable.dispatchEvent(event);
		await report.refresh();
		assert.deepStrictEqual({
			scrollDimensionReads,
			overflowY: dom.getWindow(content).getComputedStyle(content).overflowY,
			touchAction: dom.getWindow(content).getComputedStyle(content).touchAction,
			consumedWheel: event.defaultPrevented,
			scrolledFromNativePosition: content.scrollTop > 400,
			focused: dom.getActiveElement() === content,
		}, {
			scrollDimensionReads: 0,
			overflowY: 'auto',
			touchAction: 'pan-y',
			consumedWheel: true,
			scrolledFromNativePosition: true,
			focused: true,
		});
	});

	test('leaves native touch events on report actions unconsumed', async () => {
		const touchDevice = sinon.stub(Gesture, 'isTouchDevice').returns(true);
		store.add(toDisposable(() => touchDevice.restore()));
		const { container, report, service } = createReport(async () => { });
		dom.append(mainWindow.document.body, container);
		store.add(toDisposable(() => container.remove()));
		service.getHostManagementState = () => ({
			hosts: [{
				id: 'hidden',
				address: 'tunnel:hidden',
				label: 'Hidden laptop',
				status: 'disconnected',
				selectable: false,
				selected: false,
				hidden: true,
				autoConnectSuppressed: false,
				connectable: false,
			}],
			isDiscovering: false,
		});
		await report.refresh();
		const action = container.querySelector<HTMLElement>('[aria-label="Restore Hidden laptop"]')!;
		const prevented = [];
		for (const [type, pageY] of [['touchstart', 300], ['touchmove', 290], ['touchend', 290]] as const) {
			const touch: Touch = {
				identifier: 0, target: action, pageX: 100, pageY,
				clientX: 100, clientY: pageY, screenX: 100, screenY: pageY,
				force: 1, radiusX: 1, radiusY: 1, rotationAngle: 0,
			};
			const touches: TouchList = { 0: touch, length: 1, item: index => index === 0 ? touch : null, [Symbol.iterator]: () => [touch].values() };
			const emptyTouches: TouchList = { length: 0, item: () => null, [Symbol.iterator]: () => [].values() };
			// Desktop WebKit exposes Touch but does not allow constructing it.
			const event = new mainWindow.Event(type, { bubbles: true, cancelable: true });
			Object.defineProperties(event, {
				touches: { value: type === 'touchend' ? emptyTouches : touches },
				targetTouches: { value: type === 'touchend' ? emptyTouches : touches },
				changedTouches: { value: touches },
			});
			action.dispatchEvent(event);
			prevented.push(event.defaultPrevented);
		}
		assert.deepStrictEqual(prevented, [false, false, false]);
	});

	test('copy includes collapsed content and uses the displayed snapshot until refreshed', async () => {
		const copied: string[] = [];
		const { container, report, update, rediscoveries } = createReport(async text => { copied.push(text); });
		const next = { ...snapshot, text: 'Connected' };
		update(next);
		const copy = report.copy();
		assert.deepStrictEqual(copied, [snapshot.text]);
		await copy;
		assert.strictEqual(container.querySelector('[role="status"]')?.textContent, 'Diagnostics copied.');
		container.querySelector('summary')!.click();
		assert.strictEqual(container.querySelector('details')?.open, true);
		await report.refresh();
		await report.copy();
		assert.deepStrictEqual({ copied, snapshot: report.getSnapshot(), rediscoveries: rediscoveries() }, { copied: [snapshot.text, next.text], snapshot: next, rediscoveries: 1 });
	});

	test('a late snapshot cannot overwrite a newer refresh', async () => {
		const { report, service } = createReport(async () => { }, undefined, { rediscoverOnRefresh: false });
		const first = new DeferredPromise<IConnectionDiagnosticsSnapshot>();
		const second = new DeferredPromise<IConnectionDiagnosticsSnapshot>();
		let calls = 0;
		service.getSnapshot = () => ++calls === 1 ? first.p : second.p;
		const older = report.refresh();
		const newer = report.refresh();
		const latest = { ...snapshot, text: 'Newer captured evidence' };
		await second.complete(latest);
		await newer;
		await first.complete({ ...snapshot, text: 'Older captured evidence' });
		await older;
		assert.strictEqual(report.getSnapshot(), latest);
	});

	test('disposing while collecting a snapshot does not render it', async () => {
		const { report, service } = createReport(async () => { }, undefined, { rediscoverOnRefresh: false });
		const pending = new DeferredPromise<IConnectionDiagnosticsSnapshot>();
		service.getSnapshot = () => pending.p;
		let renders = 0;
		store.add(report.onDidChangeFocusTargets(() => renders++));
		const refreshing = report.refresh();
		report.dispose();
		await pending.complete({ ...snapshot, text: 'Late evidence' });
		await refreshing;
		assert.deepStrictEqual({ renders, snapshot: report.getSnapshot() }, { renders: 0, snapshot });
	});

	test('concurrent opens share one modal after asynchronous capture', async () => {
		const { service, clipboard } = createReport(async () => { });
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const contribution = createContribution(service, clipboard, () => container);
		const pending = new DeferredPromise<IConnectionDiagnosticsSnapshot>();
		service.getSnapshot = () => pending.p;
		const first = contribution.show();
		const second = contribution.show();
		await pending.complete(snapshot);
		assert.strictEqual(container.querySelectorAll('[role="dialog"]').length, 1);
		container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
		await Promise.all([first, second]);
	});

	test('disposing during initial capture does not open a modal', async () => {
		const { service, clipboard } = createReport(async () => { });
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const contribution = createContribution(service, clipboard, () => container);
		const pending = new DeferredPromise<IConnectionDiagnosticsSnapshot>();
		service.getSnapshot = () => pending.p;
		const opening = contribution.show();
		contribution.dispose();
		await pending.complete(snapshot);
		await opening;
		assert.strictEqual(container.querySelectorAll('[role="dialog"]').length, 0);
	});

	test('refresh reports discovery failure without failing the local snapshot refresh', async () => {
		const { container, report, rediscoveries } = createReport(async () => { }, () => { }, { discoverySucceeded: false });
		await report.refresh();
		assert.deepStrictEqual({
			message: container.querySelector('[role="status"]')?.textContent,
			rediscoveries: rediscoveries(),
		}, {
			message: 'Snapshot refreshed, but one or more host discovery operations failed.',
			rediscoveries: 1,
		});
	});

	test('native presentation remains snapshot-only', async () => {
		const { container, report, rediscoveries } = createReport(async () => { }, () => { }, { enableHostManagement: false, rediscoverOnRefresh: false });
		await report.refresh();
		assert.deepStrictEqual({
			actions: container.querySelectorAll('.connection-diagnostics-host-actions').length,
			message: container.querySelector('[role="status"]')?.textContent,
			rediscoveries: rediscoveries(),
		}, {
			actions: 0,
			message: 'Snapshot refreshed.',
			rediscoveries: 0,
		});
	});

	test('keeps live connection controls in existing host summaries without a separate host list', async () => {
		const container = dom.$('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const actions: string[] = [];
		let status: 'connected' | 'disconnected' = 'connected';
		let hidden = true;
		const hostSnapshot: IConnectionDiagnosticsSnapshot = {
			capturedAt: snapshot.capturedAt,
			sections: [{
				title: 'Work laptop - connected, selectable',
				hostAddress: 'tunnel:work',
				collapsed: true,
				entries: [{ label: 'Connection status', value: 'Connected' }],
			}],
			text: 'Work laptop - connected, selectable\nConnection status: Connected',
		};
		const service = new class extends mock<IConnectionDiagnosticsService>() {
			override readonly onDidChangeHostManagement = Event.None;
			override async getSnapshot(): Promise<IConnectionDiagnosticsSnapshot> { return hostSnapshot; }
			override getHostManagementState() {
				return {
					hosts: [{
						id: 'work',
						label: 'Work laptop',
						address: 'tunnel:work',
						status,
						selectable: true,
						selected: true,
						hidden: false,
						autoConnectSuppressed: status === 'disconnected',
						connectable: true,
					}, {
						id: hidden ? 'tunnel:hidden' : 'restored',
						label: 'Hidden laptop',
						address: 'tunnel:hidden',
						status: 'disconnected' as const,
						selectable: !hidden,
						selected: false,
						hidden,
						autoConnectSuppressed: false,
						connectable: !hidden,
					}],
					isDiscovering: false,
				};
			}
			override async runHostAction(hostId: string, action: ConnectionHostManagementAction): Promise<void> {
				actions.push(`${hostId}:${action}`);
				if (action === 'disconnect') {
					status = 'disconnected';
				} else if (action === 'restore') {
					hidden = false;
				}
			}
			override async rediscover(): Promise<boolean> { return true; }
		}();
		const report = store.add(new ConnectionDiagnosticsReport(
			container,
			hostSnapshot,
			() => { },
			{ enableHostManagement: true, rediscoverOnRefresh: true },
			service,
			new class extends mock<IClipboardService>() { },
		));
		const initialHiddenRows = container.querySelectorAll('.connection-diagnostics-hidden-hosts .connection-diagnostics-host-row').length;
		const disconnect = container.querySelector<HTMLElement>('[aria-label="Disconnect Work laptop"]')!;
		const actionInSummary = disconnect.closest('summary') !== null;
		const initialHostLists = container.querySelectorAll('.connection-diagnostics-hosts:not(.connection-diagnostics-hidden-hosts)').length;
		disconnect.focus();
		disconnect.click();
		await Promise.resolve();
		await Promise.resolve();
		const focusAfterDisconnect = dom.getActiveElement()?.getAttribute('aria-label');
		const restore = container.querySelector<HTMLElement>('[aria-label="Restore Hidden laptop"]')!;
		restore.focus();
		restore.click();
		await Promise.resolve();
		await Promise.resolve();
		assert.deepStrictEqual({
			actions,
			initialHiddenRows,
			actionInSummary,
			initialHostLists,
			hostDetailsOpen: container.querySelector('details')?.open,
			focusAfterDisconnect,
			focusAfterRestore: dom.getActiveElement()?.getAttribute('aria-label'),
			liveStatuses: Array.from(container.querySelectorAll('.connection-diagnostics-host-status'), element => element.textContent),
			buttonLabels: Array.from(container.querySelectorAll('.connection-diagnostics-host-actions .monaco-button'), element => element.textContent?.trim()),
			focusTargets: report.getFocusTargets().map(target => target.classList.contains('connection-diagnostics-content')
				? target.tagName
				: `${target.tagName}:${target.getAttribute('aria-label') ?? target.querySelector('.connection-diagnostics-host-name')?.textContent ?? target.childNodes[0]?.textContent}`),
			snapshotActions: container.querySelectorAll('.connection-diagnostics-section .monaco-button').length,
			hiddenSections: container.querySelectorAll('.connection-diagnostics-hidden-hosts').length,
			snapshot: report.getSnapshot().text,
		}, {
			actions: ['work:disconnect', 'tunnel:hidden:restore'],
			initialHiddenRows: 1,
			actionInSummary: true,
			initialHostLists: 0,
			hostDetailsOpen: false,
			focusAfterDisconnect: 'Connect Work laptop',
			focusAfterRestore: 'Connect Hidden laptop',
			liveStatuses: ['Disconnected', 'Disconnected. Automatic connection paused.'],
			buttonLabels: ['Connect', 'Connect'],
			focusTargets: [
				'DIV',
				'A:Connect Hidden laptop',
				'SUMMARY:Work laptop',
				'A:Connect Work laptop',
			],
			snapshotActions: 2,
			hiddenSections: 0,
			snapshot: hostSnapshot.text,
		});
	});

	test('only exposes the categorized Show command in AI-enabled Agents windows', () => {
		const command = MenuRegistry.getCommand(ShowConnectionDiagnosticsCommandId)!;
		const menu = MenuRegistry.getMenuItems(MenuId.CommandPalette).find(item => isIMenuItem(item) && item.command.id === ShowConnectionDiagnosticsCommandId);
		assert.ok(menu && isIMenuItem(menu));
		const visible = (sessions: boolean, chat: boolean) => {
			const context = new Context(0, null);
			context.setValue(IsSessionsWindowContext.key, sessions);
			context.setValue(ChatContextKeys.enabled.key, chat);
			return menu.when?.evaluate(context);
		};
		assert.deepStrictEqual({
			title: typeof command.title === 'string' ? command.title : command.title.value,
			category: typeof command.category === 'string' ? command.category : command.category?.value,
			agents: visible(true, true),
			editor: visible(false, true),
			aiDisabled: visible(true, false),
			copyCommand: CommandsRegistry.getCommand('sessions.copyConnectionDiagnostics'),
		}, {
			title: 'Show Connection Information',
			category: 'Remote Agent Hosts',
			agents: true,
			editor: false,
			aiDisabled: false,
			copyCommand: undefined,
		});
	});

	test('clipboard failure remains visible without modifying the snapshot', async () => {
		const { container, report } = createReport(async () => { throw new Error('clipboard denied'); });
		await report.copy();
		assert.deepStrictEqual({
			message: container.querySelector('[role="status"]')?.textContent,
			hidden: container.querySelector<HTMLElement>('[role="status"]')?.hidden,
			snapshot: report.getSnapshot(),
		}, {
			message: 'Could not copy. Try downloading diagnostics.',
			hidden: false,
			snapshot,
		});
	});

	for (const outcome of ['not-found', 'failure'] as const) {
		test(`hidden host recovery shows pending state and ${outcome} without a false connection claim`, async () => {
			const container = dom.$('div');
			const pending = new DeferredPromise<void>();
			let hidden = true;
			const service = new class extends mock<IConnectionDiagnosticsService>() {
				override readonly onDidChangeHostManagement = Event.None;
				override getHostManagementState() {
					return {
						hosts: hidden ? [{
							id: 'hidden', address: 'tunnel:hidden', label: 'Hidden laptop', status: 'disconnected' as const,
							selectable: false, selected: false, hidden: true, autoConnectSuppressed: false, connectable: false,
						}] : [],
						isDiscovering: false,
					};
				}
				override async runHostAction(): Promise<void> {
					await pending.p;
					hidden = false;
					if (outcome === 'failure') {
						throw new Error('Discovery failed');
					}
				}
			}();
			store.add(new ConnectionDiagnosticsReport(container, snapshot, () => { }, { enableHostManagement: true, rediscoverOnRefresh: true }, service, new class extends mock<IClipboardService>() { }));
			container.querySelector<HTMLElement>('[aria-label="Restore Hidden laptop"]')!.click();
			const pendingState = {
				disabled: container.querySelector('[aria-label="Restore Hidden laptop"]')?.getAttribute('aria-disabled'),
				working: container.textContent?.includes('Working...'),
			};
			await pending.complete();
			await Promise.resolve();
			await Promise.resolve();
			assert.deepStrictEqual({
				pendingState,
				message: container.querySelector('[role="status"]')?.textContent,
				hiddenSections: container.querySelectorAll('.connection-diagnostics-hidden-hosts').length,
			}, {
				pendingState: { disabled: 'true', working: true },
				message: outcome === 'failure' ? 'Discovery failed' : 'Host restored, but not found in the latest discovery.',
				hiddenSections: 0,
			});
		});
	}

	test('native diagnostics omit management even with hidden and selectable hosts', () => {
		const { container, service, clipboard } = createReport(async () => { });
		const host: IConnectionHostManagementEntry = {
			id: 'host', address: 'tunnel:host', label: 'Host', status: 'connected',
			selectable: true, selected: true, hidden: false, autoConnectSuppressed: false, connectable: true,
		};
		service.getHostManagementState = () => ({ hosts: [host, { ...host, id: 'hidden', hidden: true }], isDiscovering: false });
		const nativeContainer = dom.$('div');
		store.add(new ConnectionDiagnosticsReport(nativeContainer, snapshot, () => { }, { enableHostManagement: false, rediscoverOnRefresh: false }, service, clipboard));
		assert.deepStrictEqual({
			nativeHosts: nativeContainer.querySelectorAll('.connection-diagnostics-hosts').length,
			nativeActions: nativeContainer.querySelectorAll('[role="button"]').length,
			nativeDetails: nativeContainer.querySelectorAll('dd').length,
			webDetails: container.querySelectorAll('dd').length,
		}, { nativeHosts: 0, nativeActions: 0, nativeDetails: 2, webDetails: 2 });
	});

	test('download uses UTF-8 text and a safe timestamped filename for the displayed snapshot', async () => {
		const downloads: { name: string; text: string }[] = [];
		const { report, update } = createReport(async () => { }, (data, name) => {
			assert.ok(data instanceof Uint8Array);
			downloads.push({ name, text: VSBuffer.wrap(data).toString() });
		});
		const next = { ...snapshot, capturedAt: '2026-09-14T12:01:02.003Z', text: 'Host: caf\u00e9\nDisconnected' };
		update(next);
		report.download();
		await report.refresh();
		report.download();

		assert.deepStrictEqual(downloads, [
			{ name: 'connection-diagnostics-2026-09-14T12-00-00-000Z.txt', text: snapshot.text },
			{ name: 'connection-diagnostics-2026-09-14T12-01-02-003Z.txt', text: next.text },
		]);
	});

	test('download failure is shown without claiming that a file was saved', () => {
		const { container, report } = createReport(async () => { }, () => { throw new Error('download blocked'); });
		report.download();
		assert.deepStrictEqual({
			message: container.querySelector('[role="status"]')?.textContent,
			snapshot: report.getSnapshot(),
		}, {
			message: 'Could not download. Try copying diagnostics.',
			snapshot,
		});
	});

	test('full sheet actions preserve activation and snapshot consistency, and contain focus', async () => {
		let finishCopy!: () => void;
		const copied: string[] = [];
		const { service, clipboard, update } = createReport(text => {
			copied.push(text);
			return new Promise<void>(resolve => { finishCopy = resolve; });
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConnectionDiagnosticsService, service);
		instantiationService.stub(IClipboardService, clipboard);
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		let disposeCount = 0;
		const downloaded: string[] = [];
		const closed = showConnectionDiagnosticsSheet(container, snapshot, instantiationService, {
			triggerDownload: data => {
				assert.ok(data instanceof Uint8Array);
				downloaded.push(VSBuffer.wrap(data).toString());
			},
			onDidCreate: (_report, api) => {
				store.add(toDisposable(() => api.close()));
				return toDisposable(() => disposeCount++);
			},
		});
		const copy = container.querySelector<HTMLButtonElement>('button[aria-label="Copy Diagnostics"]')!;
		const client = container.querySelector('summary')!;
		copy.focus();
		copy.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
		assert.strictEqual(mainWindow.document.activeElement, client);
		client.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		assert.strictEqual(mainWindow.document.activeElement, copy);
		copy.click();
		copy.click();
		copy.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
		const reverseTabWhilePending = mainWindow.document.activeElement === client;
		client.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		const forwardTabWhilePending = mainWindow.document.activeElement === copy;
		finishCopy();
		assert.deepStrictEqual({
			copied,
			disabled: copy.getAttribute('aria-disabled'),
			reverseTabWhilePending,
			forwardTabWhilePending,
			controls: Array.from(container.querySelectorAll('button'), button => button.getAttribute('aria-label')),
			titles: container.querySelectorAll('.mobile-picker-sheet-title').length,
			footer: container.querySelectorAll('.connection-diagnostics-actions').length,
		}, {
			copied: [snapshot.text],
			disabled: 'true',
			reverseTabWhilePending: true,
			forwardTabWhilePending: true,
			controls: ['Copy Diagnostics', 'Download Diagnostics', 'Refresh', 'Close Connection information'],
			titles: 1,
			footer: 0,
		});
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(copy.getAttribute('aria-disabled'), 'false');
		const next = { ...snapshot, text: 'Updated complete snapshot' };
		update(next);
		container.querySelector<HTMLButtonElement>('button[aria-label="Refresh"]')!.click();
		await Promise.resolve();
		await Promise.resolve();
		container.querySelector<HTMLButtonElement>('button[aria-label="Download Diagnostics"]')!.click();
		assert.deepStrictEqual({
			downloaded,
			feedback: container.querySelector('[role="status"]')?.textContent,
			open: !!container.querySelector('[role="dialog"]'),
		}, { downloaded: [next.text], feedback: 'Download requested.', open: true });
		container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
		await closed;
		assert.deepStrictEqual({ disposeCount, overlays: container.childElementCount }, { disposeCount: 1, overlays: 0 });
	});

	for (const hostCount of [0, 1]) {
		test(`mobile picker opens information after removing its sheet with ${hostCount} hosts`, () => {
			const container = dom.append(mainWindow.document.body, dom.$('div.monaco-workbench'));
			store.add(toDisposable(() => container.remove()));
			const trigger = dom.append(container, dom.$('div'));
			const commands: { id: string; pickerOpen: boolean }[] = [];
			class TestMobileHostFilter extends MobileHostFilterActionViewItem {
				open(): void {
					this._showMenu(new mainWindow.Event('click'));
				}
			}
			const widget = store.add(new TestMobileHostFilter(
				store.add(new Action('hosts', 'Hosts')),
				new class extends mock<IAgentHostFilterService>() {
					override readonly onDidChange = Event.None;
					override readonly onDidChangeDiscovering = Event.None;
					override readonly hosts = hostCount ? [{ id: 'mock', label: 'Mock host', providerIds: ['mock'], grouped: false, address: 'tunnel:mock', icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Connected, connectable: true }] : [];
					override readonly selectedHost = this.hosts[0];
					override readonly isDiscovering = false;
				}(),
				new class extends mock<IContextMenuService>() { }(),
				new class extends mock<IHoverService>() {
					override setupManagedHover(): IManagedHover {
						return {
							dispose() { },
							show() { },
							hide() { },
							update() { },
						};
					}
				}(),
				new class extends mock<ICommandService>() {
					override async executeCommand<T>(id: string): Promise<T> {
						commands.push({ id, pickerOpen: !!container.querySelector('[role="dialog"]') });
						return undefined as T;
					}
				}(),
			));
			widget.render(trigger);
			widget.open();
			const diagnostics = container.querySelector<HTMLElement>('.host-picker-sheet-heading .host-picker-sheet-information');
			assert.deepStrictEqual({
				empty: container.querySelector('.host-picker-sheet-empty')?.textContent,
				diagnostics: diagnostics?.getAttribute('aria-label'),
				inlineInformation: trigger.querySelectorAll('.agent-host-filter-diagnostics').length,
				statusAnnounced: trigger.querySelector('.agent-host-filter-dropdown')?.getAttribute('aria-label')?.includes('Current host status: Connected.'),
			}, {
				empty: hostCount ? undefined : 'No hosts found yet.',
				diagnostics: 'Open Connection Information',
				inlineInformation: 0,
				statusAnnounced: hostCount > 0,
			});
			diagnostics!.dispatchEvent(new mainWindow.Event(TouchEventType.Tap, { bubbles: true, cancelable: true }));
			widget.open();
			container.querySelector<HTMLElement>('.host-picker-sheet-information')!.click();
			assert.deepStrictEqual({
				commands,
				focusRestored: dom.getActiveElement() === trigger,
				sheets: container.querySelectorAll('.host-picker-sheet-overlay').length,
			}, {
				commands: [
					{ id: ShowConnectionDiagnosticsCommandId, pickerOpen: false },
					{ id: ShowConnectionDiagnosticsCommandId, pickerOpen: false },
				],
				focusRestored: true,
				sheets: 0,
			});
		});
	}

	for (const verbosity of [true, false]) {
		test(`accessibility hint stays inside the modal while background is inert, verbosity: ${verbosity}`, async () => {
			const { service, clipboard } = createReport(async () => { });
			const container = dom.append(mainWindow.document.body, dom.$('div'));
			store.add(toDisposable(() => container.remove()));
			const background = dom.append(container, dom.$('button'));
			const globalAria = dom.append(container, dom.$('div.monaco-aria-container'));
			dom.append(globalAria, dom.$('div', { 'aria-live': 'polite' }));
			background.focus();
			const contribution = createContribution(service, clipboard, () => container, verbosity);
			const closed = contribution.show();
			await Promise.resolve();
			const liveRegion = container.querySelector<HTMLElement>('[role="dialog"] [role="status"]')!;
			assert.deepStrictEqual({
				backgroundInert: background.inert,
				globalAriaInert: globalAria.inert,
				hintInert: !!liveRegion.closest('[inert]'),
				hint: liveRegion.textContent,
				hidden: liveRegion.hidden,
			}, {
				backgroundInert: true,
				globalAriaInert: true,
				hintInert: false,
				hint: verbosity ? 'Use Alt+F1 for connection diagnostics accessibility help.' : '',
				hidden: !verbosity,
			});
			container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
			await closed;
			assert.deepStrictEqual({
				backgroundInert: background.inert,
				globalAriaInert: globalAria.inert,
				focusRestored: mainWindow.document.activeElement === background,
			}, { backgroundInert: false, globalAriaInert: false, focusRestored: true });
		});
	}

	for (const lifecycle of ['unregister', 'beforeunload'] as const) {
		test(`auxiliary window ${lifecycle} releases the sheet and allows reopening in the main window`, async () => {
			const { service, clipboard } = createReport(async () => { });
			const iframe = dom.append(mainWindow.document.body, dom.$<HTMLIFrameElement>('iframe'));
			store.add(toDisposable(() => iframe.remove()));
			const auxiliaryWindow = iframe.contentWindow!;
			ensureCodeWindow(auxiliaryWindow, 999);
			const registration = store.add(dom.registerWindow(auxiliaryWindow));
			const auxiliaryContainer = dom.append(auxiliaryWindow.document.body, dom.$('div'));
			const background = dom.append(auxiliaryContainer, dom.$('button'));
			const mainContainer = dom.append(mainWindow.document.body, dom.$('div'));
			store.add(toDisposable(() => mainContainer.remove()));
			let activeContainer = auxiliaryContainer;
			const contribution = createContribution(service, clipboard, () => activeContainer);

			const auxiliaryClosed = contribution.show();
			await Promise.resolve();
			if (lifecycle === 'unregister') {
				registration.dispose();
			} else {
				auxiliaryWindow.dispatchEvent(new mainWindow.Event(dom.EventType.BEFORE_UNLOAD));
			}
			activeContainer = mainContainer;
			const mainClosed = contribution.show();
			await Promise.resolve();
			assert.deepStrictEqual({
				auxiliaryDialogs: auxiliaryContainer.querySelectorAll('[role="dialog"]').length,
				auxiliaryBackgroundInert: background.inert,
				mainDialogs: mainContainer.querySelectorAll('[role="dialog"]').length,
			}, { auxiliaryDialogs: 0, auxiliaryBackgroundInert: false, mainDialogs: 1 });

			await auxiliaryClosed;
			mainContainer.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
			await mainClosed;
		});
	}

	for (const type of [AccessibleViewType.Help, AccessibleViewType.View]) {
		test(`closing accessible ${type} restores captured evidence while Show captures fresh evidence`, async () => {
			const copied: string[] = [];
			const { service, clipboard, update } = createReport(async text => { copied.push(text); });
			const container = dom.append(mainWindow.document.body, dom.$('div'));
			store.add(toDisposable(() => container.remove()));
			const contribution = createContribution(service, clipboard, () => container, false, false);
			const closed = contribution.show();
			await Promise.resolve();
			const provider = store.add(contribution.getAccessibleProvider(type)!);
			await closed;
			update({ ...snapshot, text: 'Current connection state' });
			provider.onClose();
			container.querySelector<HTMLButtonElement>('button[aria-label="Copy Diagnostics"]')!.click();
			const restored = store.add(contribution.getAccessibleProvider(type)!);
			restored.dispose();
			provider.dispose();
			const freshClosed = contribution.show();
			await Promise.resolve();
			container.querySelector<HTMLButtonElement>('button[aria-label="Copy Diagnostics"]')!.click();
			container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
			await freshClosed;
			assert.deepStrictEqual({
				copied,
				dialogs: container.querySelectorAll('[role="dialog"]').length,
			}, { copied: [snapshot.text, 'Current connection state'], dialogs: 0 });
		});
	}

	test('disposing an older accessible provider does not clear ownership of its replacement', async () => {
		const { service, clipboard } = createReport(async () => { });
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const contribution = createContribution(service, clipboard, () => container, false, false);
		const closed = contribution.show();
		await Promise.resolve();
		const previous = store.add(contribution.getAccessibleProvider(AccessibleViewType.Help)!);
		await closed;
		previous.onClose();
		const current = store.add(contribution.getAccessibleProvider(AccessibleViewType.View)!);
		let disposed = false;
		const onDispose = current.onDispose;
		current.onDispose = () => {
			onDispose?.();
			disposed = true;
		};
		previous.dispose();
		contribution.dispose();
		assert.strictEqual(disposed, true);
	});

	for (const appearance of ['sidebar', 'titlebar'] as const) {
		test(`${appearance} host information responds to click and tap without invoking its enclosing action`, () => {
			const container = dom.append(mainWindow.document.body, dom.$('div.action-item'));
			store.add(toDisposable(() => container.remove()));
			const commands: string[] = [];
			let enclosingActions = 0;
			const widget = store.add(new HostFilterActionViewItem(
				store.add(new Action('hosts', 'Hosts', undefined, true, async () => { enclosingActions++; })),
				appearance,
				new class extends mock<IAgentHostFilterService>() {
					override readonly onDidChange = Event.None;
					override readonly onDidChangeDiscovering = Event.None;
					override readonly hosts = [{
						id: 'work',
						label: 'Work laptop',
						providerIds: ['mock'],
						grouped: false,
						address: 'tunnel:work',
						icon: Codicon.remote,
						status: AgentHostFilterConnectionStatus.Connected,
						connectable: true,
					}];
					override readonly selectedHost = this.hosts[0];
					override readonly isDiscovering = false;
				}(),
				new class extends mock<IContextMenuService>() { }(),
				new class extends mock<IHoverService>() {
					override setupManagedHover(): IManagedHover {
						return {
							dispose() { },
							show() { },
							hide() { },
							update() { },
						};
					}
				}(),
				new class extends mock<ICommandService>() {
					override async executeCommand<T>(id: string): Promise<T> {
						commands.push(id);
						return undefined as T;
					}
				}(),
			));
			widget.render(container);
			const connection = container.querySelector<HTMLElement>('.agent-host-filter-connect');
			const diagnostics = container.querySelector<HTMLElement>('.agent-host-filter-diagnostics');
			connection?.click();
			enclosingActions = 0;
			diagnostics?.click();
			diagnostics?.dispatchEvent(new mainWindow.Event(TouchEventType.Tap, { bubbles: true, cancelable: true }));
			assert.deepStrictEqual({
				statusAriaHidden: connection?.getAttribute('aria-hidden'),
				statusRole: connection?.getAttribute('role'),
				diagnosticsLabel: diagnostics?.getAttribute('aria-label'),
				commands,
				enclosingActions,
			}, {
				statusAriaHidden: 'true',
				statusRole: null,
				diagnosticsLabel: 'Open Connection Information. Current host status: Connected.',
				commands: [ShowConnectionDiagnosticsCommandId, ShowConnectionDiagnosticsCommandId],
				enclosingActions: 0,
			});
		});
	}
});
