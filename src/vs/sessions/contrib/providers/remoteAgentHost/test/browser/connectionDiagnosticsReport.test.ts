/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
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
import { IConnectionDiagnosticsService, IConnectionDiagnosticsSnapshot, ShowConnectionDiagnosticsCommandId } from '../../browser/connectionDiagnostics.js';
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
		const service = new class extends mock<IConnectionDiagnosticsService>() {
			override getSnapshot(): IConnectionDiagnosticsSnapshot { return current; }
		}();
		const clipboard = new class extends mock<IClipboardService>() {
			override writeText = writeText;
		}();
		const report = store.add(new ConnectionDiagnosticsReport(container, snapshot, download, service, clipboard));
		return { container, report, service, clipboard, update: (next: IConnectionDiagnosticsSnapshot) => { current = next; } };
	}

	test('diagnostics help takes precedence over general Agents chat help only in its own context', () => {
		const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'connectionDiagnostics' && implementation.type === AccessibleViewType.Help)!;
		assert.deepStrictEqual({
			priorityAboveChat: help.priority > new SessionsChatAccessibilityHelp().priority,
			context: help.when?.serialize(),
		}, { priorityAboveChat: true, context: 'connectionDiagnosticsFocused' });
	});

	test('renders facts without a summary or buttons, with client details collapsed at the bottom', () => {
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
		const { container, report, update } = createReport(async text => { copied.push(text); });
		const next = { ...snapshot, text: 'Connected' };
		update(next);
		const copy = report.copy();
		assert.deepStrictEqual(copied, [snapshot.text]);
		await copy;
		assert.strictEqual(container.querySelector('[role="status"]')?.textContent, 'Diagnostics copied.');
		container.querySelector('summary')!.click();
		assert.strictEqual(container.querySelector('details')?.open, true);
		report.refresh();
		await report.copy();
		assert.deepStrictEqual({ copied, snapshot: report.getSnapshot() }, { copied: [snapshot.text, next.text], snapshot: next });
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

	test('download uses UTF-8 text and a safe timestamped filename for the displayed snapshot', () => {
		const downloads: { name: string; text: string }[] = [];
		const { report, update } = createReport(async () => { }, (data, name) => {
			assert.ok(data instanceof Uint8Array);
			downloads.push({ name, text: VSBuffer.wrap(data).toString() });
		});
		const next = { ...snapshot, capturedAt: '2026-09-14T12:01:02.003Z', text: 'Host: caf\u00e9\nDisconnected' };
		update(next);
		report.download();
		report.refresh();
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
		assert.deepStrictEqual({
			copied,
			disabled: copy.getAttribute('aria-disabled'),
			controls: Array.from(container.querySelectorAll('button'), button => button.getAttribute('aria-label')),
			titles: container.querySelectorAll('.mobile-picker-sheet-title').length,
			footer: container.querySelectorAll('.connection-diagnostics-actions').length,
		}, {
			copied: [snapshot.text],
			disabled: 'true',
			controls: ['Copy Diagnostics', 'Download Diagnostics', 'Refresh', 'Close Connection diagnostics'],
			titles: 1,
			footer: 0,
		});
		finishCopy();
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(copy.getAttribute('aria-disabled'), 'false');
		const next = { ...snapshot, text: 'Updated complete snapshot' };
		update(next);
		container.querySelector<HTMLButtonElement>('button[aria-label="Refresh"]')!.click();
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

	for (const { hidden, hostCount } of [false, true].flatMap(hidden => [0, 1].map(hostCount => ({ hidden, hostCount })))) {
		test(`mobile picker exposes diagnostics with ${hostCount} hosts, AI hidden: ${hidden}`, () => {
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
				new class extends mock<IChatEntitlementService>() {
					override readonly sentiment = { hidden };
				}(),
			));
			widget.open();
			const diagnostics = container.querySelector<HTMLElement>('.host-picker-sheet-header .host-picker-sheet-diagnostics');
			assert.deepStrictEqual({
				empty: container.querySelector('.host-picker-sheet-empty')?.textContent,
				diagnostics: diagnostics?.getAttribute('aria-label'),
			}, {
				empty: hostCount ? undefined : 'No hosts found yet.',
				diagnostics: hidden ? undefined : 'Show Connection Diagnostics',
			});
			diagnostics?.click();
			assert.deepStrictEqual(commands, hidden ? [] : [{ id: ShowConnectionDiagnosticsCommandId, pickerOpen: false }]);
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
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IConnectionDiagnosticsService, service);
			instantiationService.stub(IClipboardService, clipboard);
			instantiationService.stub(IWorkbenchLayoutService, { activeContainer: container });
			instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
			instantiationService.stub(IChatEntitlementService, { sentiment: { hidden: false }, onDidChangeSentiment: Event.None });
			instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => true });
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ [AccessibilityVerbositySettingId.ConnectionDiagnostics]: verbosity }));
			instantiationService.stub(IKeybindingService, {
				lookupKeybinding: () => new USLayoutResolvedKeybinding([new KeyCodeChord(false, false, true, false, KeyCode.F1)], OperatingSystem.Windows),
			});
			instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
			const contribution = store.add(instantiationService.createInstance(ConnectionDiagnosticsContribution));
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

	test('desktop host filter always exposes diagnostics beside the connection control', () => {
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
		const diagnostics = container.querySelector<HTMLElement>('.agent-host-filter-diagnostics');
		diagnostics?.click();
		assert.deepStrictEqual({
			ariaLabel: diagnostics?.getAttribute('aria-label'),
			besideConnection: diagnostics?.nextElementSibling?.classList.contains('agent-host-filter-connect'),
			commands,
		}, {
			ariaLabel: 'Show Connection Diagnostics',
			besideConnection: true,
			commands: [ShowConnectionDiagnosticsCommandId],
		});
	});
});
