/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../../base/browser/window.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { AccessibleViewRegistry } from '../../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
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
import { IWorkbenchLayoutService } from '../../../../../../workbench/services/layout/browser/layoutService.js';
import { AccessibilityVerbositySettingId } from '../../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ConnectionHostManagementAction, IConnectionDiagnosticsService, IConnectionDiagnosticsSnapshot, ShowConnectionDiagnosticsCommandId } from '../../browser/connectionDiagnostics.js';
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

	function createReport(writeText: (text: string) => Promise<void>, download: typeof dom.triggerDownload = () => { }) {
		const container = dom.$('div');
		let current = snapshot;
		let rediscoveries = 0;
		const service = new class extends mock<IConnectionDiagnosticsService>() {
			override readonly onDidChangeHostManagement = Event.None;
			override getSnapshot(): IConnectionDiagnosticsSnapshot { return current; }
			override getHostManagementState() { return { hosts: [], isDiscovering: false }; }
			override async runHostAction(): Promise<void> { }
			override async rediscover(): Promise<void> { rediscoveries++; }
		}();
		const clipboard = new class extends mock<IClipboardService>() {
			override writeText = writeText;
		}();
		const report = store.add(new ConnectionDiagnosticsReport(container, snapshot, download, service, clipboard));
		return { container, report, service, clipboard, update: (next: IConnectionDiagnosticsSnapshot) => { current = next; }, rediscoveries: () => rediscoveries };
	}

	function createContribution(service: IConnectionDiagnosticsService, clipboard: IClipboardService, getContainer: () => HTMLElement, verbosity = false): ConnectionDiagnosticsContribution {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConnectionDiagnosticsService, service);
		instantiationService.stub(IClipboardService, clipboard);
		instantiationService.stub(IWorkbenchLayoutService, { get activeContainer() { return getContainer(); } });
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.stub(IChatEntitlementService, { sentiment: { hidden: false }, onDidChangeSentiment: Event.None });
		instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => true });
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [AccessibilityVerbositySettingId.ConnectionDiagnostics]: verbosity }));
		instantiationService.stub(IKeybindingService, {
			lookupKeybinding: () => new USLayoutResolvedKeybinding([new KeyCodeChord(false, false, true, false, KeyCode.F1)], OperatingSystem.Windows),
		});
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
		return store.add(instantiationService.createInstance(ConnectionDiagnosticsContribution));
	}

	test('diagnostics help takes precedence over general Agents chat help only in its own context', () => {
		const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'connectionDiagnostics' && implementation.type === AccessibleViewType.Help)!;
		assert.deepStrictEqual({
			priorityAboveChat: help.priority > new SessionsChatAccessibilityHelp().priority,
			context: help.when?.serialize(),
		}, { priorityAboveChat: true, context: 'connectionDiagnosticsFocused' });
	});

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
		}, {
			headings: ['Discovery', 'This client'],
			details: ['<script>not markup</script>', 'Web browser'],
			clientOpen: false,
			last: 'DETAILS',
			feedbackHidden: true,
			scripts: 0,
			buttons: 0,
		});
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

	test('renders live actions beside matching diagnostic host sections', () => {
		const container = dom.$('div');
		const actions: string[] = [];
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
			override getSnapshot(): IConnectionDiagnosticsSnapshot { return hostSnapshot; }
			override getHostManagementState() {
				return {
					hosts: [{
						id: 'work',
						label: 'Work laptop',
						address: 'tunnel:work',
						status: 'connected' as const,
						selectable: true,
						selected: true,
						hidden: false,
						autoConnectSuppressed: false,
						connectable: true,
					}],
					isDiscovering: false,
				};
			}
			override async runHostAction(hostId: string, action: ConnectionHostManagementAction): Promise<void> {
				actions.push(`${hostId}:${action}`);
			}
			override async rediscover(): Promise<void> { }
		}();
		const report = store.add(new ConnectionDiagnosticsReport(
			container,
			hostSnapshot,
			() => { },
			service,
			new class extends mock<IClipboardService>() { },
		));
		const hostSection = container.querySelector<HTMLElement>('[data-host-address="tunnel:work"]')!;
		hostSection.querySelector<HTMLElement>('[aria-label="Disconnect Work laptop"]')!.click();
		assert.deepStrictEqual({
			actions,
			actionContainers: hostSection.querySelectorAll('.connection-diagnostics-host-actions').length,
			standaloneHostLists: container.querySelectorAll('.connection-diagnostics-hosts').length,
			snapshot: report.getSnapshot().text,
		}, {
			actions: ['work:disconnect'],
			actionContainers: 1,
			standaloneHostLists: 0,
			snapshot: hostSnapshot.text,
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
		test(`mobile picker does not duplicate connection information with ${hostCount} hosts`, () => {
			const container = dom.append(mainWindow.document.body, dom.$('div.monaco-workbench'));
			store.add(toDisposable(() => container.remove()));
			const trigger = dom.append(container, dom.$('div'));
			const commands: { id: string; pickerOpen: boolean }[] = [];
			class TestMobileHostFilter extends MobileHostFilterActionViewItem {
				open(): void {
					this.element = trigger;
					this._showMenu(new mainWindow.Event('click'));
				}
			}
			const widget = store.add(new TestMobileHostFilter(
				store.add(new Action('hosts', 'Hosts')),
				new class extends mock<IAgentHostFilterService>() {
					override readonly onDidChange = Event.None;
					override readonly onDidChangeDiscovering = Event.None;
					override readonly hosts = hostCount ? [{ id: 'mock', label: 'Mock host', providerIds: ['mock'], grouped: false, address: 'tunnel:mock', icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Connected, connectable: true }] : [];
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
			widget.open();
			const diagnostics = container.querySelector<HTMLElement>('.host-picker-sheet-header .host-picker-sheet-diagnostics');
			assert.deepStrictEqual({
				empty: container.querySelector('.host-picker-sheet-empty')?.textContent,
				diagnostics: diagnostics?.getAttribute('aria-label'),
			}, {
				empty: hostCount ? undefined : 'No hosts found yet.',
				diagnostics: undefined,
			});
			assert.deepStrictEqual(commands, []);
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
			if (lifecycle === 'unregister') {
				registration.dispose();
			} else {
				auxiliaryWindow.dispatchEvent(new mainWindow.Event(dom.EventType.BEFORE_UNLOAD));
			}
			activeContainer = mainContainer;
			const mainClosed = contribution.show();
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
		test(`disposing accessible ${type} without onClose clears the snapshot used by Copy`, async () => {
			const copied: string[] = [];
			const { service, clipboard, update } = createReport(async text => { copied.push(text); });
			const container = dom.append(mainWindow.document.body, dom.$('div'));
			store.add(toDisposable(() => container.remove()));
			const contribution = createContribution(service, clipboard, () => container);
			const closed = contribution.show();
			const provider = store.add(contribution.getAccessibleProvider(type)!);
			await closed;
			update({ ...snapshot, text: 'Current connection state' });
			await contribution.copy();
			// ContextView replacement disposes the provider without invoking its onClose callback.
			provider.dispose();
			await contribution.copy();
			assert.deepStrictEqual({
				copied,
				dialogs: container.querySelectorAll('[role="dialog"]').length,
			}, { copied: [snapshot.text, 'Current connection state'], dialogs: 0 });
		});
	}

	test('disposing an older accessible provider does not clear a replacement showing the same snapshot', async () => {
		const copied: string[] = [];
		const { service, clipboard, update } = createReport(async text => { copied.push(text); });
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const contribution = createContribution(service, clipboard, () => container);
		const closed = contribution.show();
		const previous = store.add(contribution.getAccessibleProvider(AccessibleViewType.Help)!);
		await closed;
		previous.onClose();
		const current = store.add(contribution.getAccessibleProvider(AccessibleViewType.View)!);
		update({ ...snapshot, text: 'New connection state' });

		previous.dispose();
		await contribution.copy();
		current.dispose();
		await contribution.copy();
		assert.deepStrictEqual(copied, [snapshot.text, 'New connection state']);
	});

	test('desktop host filter separates passive status from connection information', () => {
		const container = dom.append(mainWindow.document.body, dom.$('div.action-item'));
		store.add(toDisposable(() => container.remove()));
		const commands: string[] = [];
		const widget = store.add(new HostFilterActionViewItem(
			store.add(new Action('hosts', 'Hosts')),
			'sidebar',
			new class extends mock<IAgentHostFilterService>() {
				override readonly onDidChange = Event.None;
				override readonly onDidChangeDiscovering = Event.None;
				override readonly hosts = [];
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
		diagnostics?.click();
		assert.deepStrictEqual({
			statusAriaHidden: connection?.getAttribute('aria-hidden'),
			statusRole: connection?.getAttribute('role'),
			diagnosticsLabel: diagnostics?.getAttribute('aria-label'),
			commands,
		}, {
			statusAriaHidden: 'true',
			statusRole: null,
			diagnosticsLabel: 'Open Connection Information',
			commands: [ShowConnectionDiagnosticsCommandId],
		});
	});
});
