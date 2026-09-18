/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { IConnectionDiagnosticsService, IConnectionDiagnosticsSnapshot, ShowConnectionDiagnosticsCommandId } from '../../browser/connectionDiagnostics.js';
import { showConnectionDiagnosticsSheet } from '../../browser/connectionDiagnosticsReport.js';
import { MobileHostFilterActionViewItem } from '../../browser/mobileHostFilterActionViewItem.js';

const snapshotContent: Omit<IConnectionDiagnosticsSnapshot, 'text'> = {
	capturedAt: '2026-09-14T19:00:00.000Z',
	sections: [
		{
			title: 'Tunnel discovery successful with 1 tunnel',
			collapsed: true,
			entries: [
				{ label: 'Status', value: 'Succeeded' },
				{ label: 'Hosts found', value: '1' },
				{ label: 'Cached hosts', value: '0' },
			],
		},
		{
			title: 'Work laptop - connected, selectable',
			hostAddress: 'tunnel:work',
			collapsed: true,
			entries: [
				{ label: 'Online', value: 'Yes' },
				{ label: 'Cached', value: 'Yes' },
				{ label: 'Selectable', value: 'Yes' },
				{ label: 'Dismissed', value: 'No' },
				{ label: 'Host address', value: 'example-host-with-a-long-name-for-verifying-narrow-layout.example.invalid:12345' },
			],
		},
		{
			title: 'Home server - disconnected, selectable',
			hostAddress: 'tunnel:home',
			collapsed: true,
			entries: [
				{ label: 'Connection status', value: 'Disconnected' },
				{ label: 'Selectable', value: 'Yes' },
				{ label: 'Auto-connect suppressed', value: 'Yes' },
			],
		},
		{
			title: 'Build machine - no connection, not selectable',
			hostAddress: 'tunnel:hidden',
			collapsed: true,
			entries: [
				{ label: 'Connection status', value: 'No connection entry' },
				{ label: 'Selectable', value: 'No' },
				{ label: 'Persistently dismissed', value: 'Yes' },
			],
		},
		{
			title: 'Recent activity logs',
			collapsed: true,
			description: 'Up to 100 events from this window only.',
			entries: [{ label: '19:00:00', value: 'Tunnel discovery succeeded: 1 online host found.' }],
		},
		{
			title: 'This client',
			collapsed: true,
			entries: [
				{ label: 'Environment', value: 'Web browser' },
				{ label: 'Online', value: 'Yes' },
				{ label: 'Secure context', value: 'Yes' },
			],
		},
	],
};

const snapshot: IConnectionDiagnosticsSnapshot = {
	...snapshotContent,
	text: [
		'Connection diagnostics',
		`Captured: ${snapshotContent.capturedAt}`,
		...snapshotContent.sections.flatMap(section => [
			section.title,
			...(section.description ? [section.description] : []),
			...section.entries.map(entry => `${entry.label}: ${entry.value}`),
		]),
	].join('\n'),
};

function renderReport(context: ComponentFixtureContext, width: number, expandClient = false): void {
	const { container, disposableStore, theme } = context;
	container.classList.add('monaco-workbench');
	container.style.width = `${width}px`;
	container.style.height = '640px';
	container.style.position = 'relative';
	container.style.contain = 'layout paint';
	container.style.backgroundColor = 'var(--vscode-menu-background)';
	container.style.color = 'var(--vscode-menu-foreground)';
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			reg.defineInstance(IConnectionDiagnosticsService, new class extends mock<IConnectionDiagnosticsService>() {
				override readonly onDidChangeHostManagement = Event.None;
				override async getSnapshot(): Promise<IConnectionDiagnosticsSnapshot> { return snapshot; }
				override getHostManagementState() {
					return {
						hosts: [{
							id: 'connected',
							label: 'Work laptop',
							address: 'tunnel:work',
							status: 'connected' as const,
							selectable: true,
							selected: true,
							hidden: false,
							autoConnectSuppressed: false,
							connectable: true,
						}, {
							id: 'disconnected',
							label: 'Home server',
							address: 'tunnel:home',
							status: 'disconnected' as const,
							selectable: true,
							selected: false,
							hidden: false,
							autoConnectSuppressed: true,
							connectable: true,
						}, {
							id: 'tunnel:hidden',
							label: 'Build machine',
							address: 'tunnel:hidden',
							status: 'disconnected' as const,
							selectable: false,
							selected: false,
							hidden: true,
							autoConnectSuppressed: false,
							connectable: false,
						}],
						isDiscovering: false,
					};
				}
				override async runHostAction(): Promise<void> { }
				override async rediscover(): Promise<boolean> { return true; }
			}());
		},
	});
	void showConnectionDiagnosticsSheet(container, snapshot, instantiationService, {
		autoFocus: false,
		enableHostManagement: true,
		rediscoverOnRefresh: true,
		onDidCreate: (report, api) => {
			disposableStore.add(toDisposable(() => api.close()));
			api.overlay.classList.add(width < 600 ? 'phone-layout' : 'desktop-layout');
			api.overlay.style.height = '100%';
			api.sheet.style.maxHeight = '100%';
			if (expandClient) {
				for (const target of report.getFocusTargets().slice(1)) {
					if (target.tagName === 'SUMMARY') {
						target.click();
					}
				}
				const content = api.sheet.querySelector<HTMLElement>('.connection-diagnostics-content')!;
				const style = dom.getWindow(content).getComputedStyle(content);
				if (content.scrollHeight <= content.clientHeight || style.overflowY !== 'auto' || style.touchAction !== 'pan-y') {
					throw new Error('Expanded diagnostics must overflow a native vertical touch scroll container.');
				}
			}
			const header = api.sheet.querySelector<HTMLElement>('.mobile-picker-sheet-title-row')!;
			const headerBounds = header.getBoundingClientRect();
			const buttons = Array.from(header.querySelectorAll('button'));
			if (buttons.length !== 4 || header.scrollWidth > header.clientWidth || buttons.some(button => {
				const bounds = button.getBoundingClientRect();
				return bounds.width < 44 || bounds.height < 44 || bounds.left < headerBounds.left || bounds.right > headerBounds.right;
			})) {
				throw new Error('Diagnostics header must contain four non-overflowing 44px touch targets.');
			}
			return Disposable.None;
		},
	});
}

function renderEmptyPicker(context: ComponentFixtureContext): void {
	const { container, disposableStore, theme } = context;
	container.classList.add('monaco-workbench');
	container.style.width = '390px';
	container.style.height = '640px';
	container.style.position = 'relative';
	container.style.contain = 'layout paint';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
				override readonly onDidChange = Event.None;
				override readonly onDidChangeDiscovering = Event.None;
				override readonly hosts = [];
				override readonly isDiscovering = false;
				override async rediscover(): Promise<boolean> { return true; }
			}());
			reg.defineInstance(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
				override readonly sentiment = { hidden: false };
			}());
			reg.defineInstance(ICommandService, new class extends mock<ICommandService>() {
				override async executeCommand<T>(id: string): Promise<T> {
					if (id === ShowConnectionDiagnosticsCommandId) {
						dom.clearNode(container);
						renderReport(context, 390);
					}
					return undefined as T;
				}
			}());
		},
	});
	const trigger = dom.append(container, dom.$('div'));
	const widget = disposableStore.add(instantiationService.createInstance(MobileHostFilterActionViewItem, disposableStore.add(new Action('hosts', 'Hosts'))));
	widget.render(trigger);
	trigger.querySelector<HTMLElement>('.agent-host-filter-dropdown')!.click();
}

export default defineThemedFixtureGroup({ path: 'sessions/connectionDiagnostics/' }, {
	MobileDismissedDiscovery: defineComponentFixture({ render: context => renderReport(context, 390) }),
	NarrowDismissedDiscovery: defineComponentFixture({ render: context => renderReport(context, 320) }),
	DesktopDismissedDiscovery: defineComponentFixture({ render: context => renderReport(context, 720) }),
	ClientExpanded: defineComponentFixture({ render: context => renderReport(context, 390, true) }),
	NarrowClientExpanded: defineComponentFixture({ render: context => renderReport(context, 320, true) }),
	EmptyHostPicker: defineComponentFixture({ render: renderEmptyPicker }),
});
