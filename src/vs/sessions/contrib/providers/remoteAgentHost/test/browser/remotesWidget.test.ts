/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IResourceEditorInput } from '../../../../../../platform/editor/common/editor.js';
import { IEditorService, MODAL_GROUP, PreferredGroup } from '../../../../../../workbench/services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { ICustomizationRemote, IRemotesModel, RemoteKind } from '../../browser/remotesModel.js';
import { RemotesWidget } from '../../browser/remotesWidget.js';

class TestRemotesModel extends Disposable implements IRemotesModel {
	readonly remotes = observableValue<readonly ICustomizationRemote[]>(this, [
		{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', enabled: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
		{ id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu', enabled: true, connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		{ id: 'tunnel:laptop', kind: 'tunnel', name: 'Laptop', detail: 'work-laptop', enabled: false, connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		{ id: 'container:project', kind: 'devContainer', name: 'Project', detail: '/project', enabled: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
	]);
	readonly changes: { id: string; enabled: boolean }[] = [];
	readonly connectionChanges: { id: string; connected: boolean }[] = [];
	pendingConnection: DeferredPromise<void> | undefined;
	pendingChange: DeferredPromise<void> | undefined;
	failedKinds: readonly RemoteKind[] = [];
	pendingRefresh: DeferredPromise<readonly RemoteKind[]> | undefined;
	refreshCalls = 0;

	async refresh(): Promise<readonly RemoteKind[]> {
		this.refreshCalls++;
		return this.pendingRefresh?.p ?? this.failedKinds;
	}

	async setEnabled(id: string, enabled: boolean): Promise<void> {
		this.changes.push({ id, enabled });
		await this.pendingChange?.p;
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, enabled } : remote), undefined);
	}

	async setConnected(id: string, connected: boolean): Promise<void> {
		this.connectionChanges.push({ id, connected });
		await this.pendingConnection?.p;
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? {
			...remote, enabled: connected, connectionStatus: connected ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected,
		} : remote), undefined);
	}
}

suite('RemotesWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(operatingSystem = OperatingSystem.Macintosh) {
		const parent = dom.append(document.body, dom.$('div'));
		parent.style.width = '700px';
		parent.style.height = '640px';
		store.add(toDisposable(() => parent.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const errors: Parameters<INotificationService['error']>[0][] = [];
		const hoverContents = new Map<HTMLElement, string>();
		const opened: { input: IResourceEditorInput; group: PreferredGroup | undefined }[] = [];
		const documentation: string[] = [];
		let configFailure: Error | undefined;
		let configRequests = 0;
		instantiationService.stub(ISSHRemoteAgentHostService, {
			ensureUserSSHConfig: async () => {
				configRequests++;
				if (configFailure) {
					throw configFailure;
				}
				return URI.file('/home/test/.ssh/config');
			},
		});
		instantiationService.stub(IEditorService, 'openEditor', async (input: IResourceEditorInput, group?: PreferredGroup) => { opened.push({ input, group }); return undefined; });
		instantiationService.stub(IOpenerService, { open: async resource => { documentation.push(resource.toString()); return true; } });
		instantiationService.stub(INotificationService, 'error', (error: Parameters<INotificationService['error']>[0]) => { errors.push(error); });
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover(...args: Parameters<IHoverService['setupDelayedHover']>) {
				const options = typeof args[1] === 'function' ? args[1]() : args[1];
				if (typeof options.content === 'string') {
					hoverContents.set(args[0], options.content);
				}
				return Disposable.None;
			}
		}());
		const model = store.add(new TestRemotesModel());
		const widget = store.add(instantiationService.createInstance(RemotesWidget, parent, model, operatingSystem));
		widget.layout();
		return { widget, parent, model, errors, hoverContents, opened, documentation, configRequests: () => configRequests, failConfig: (error: Error) => { configFailure = error; } };
	}

	function getSwitch(parent: HTMLElement, id: string): HTMLButtonElement {
		const row = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].find(row => row.dataset.remoteId === id);
		const control = row?.querySelector<HTMLButtonElement>('[role="switch"]');
		assert.ok(control, `Missing switch for ${id}`);
		return control;
	}

	function getConnectionAction(parent: HTMLElement, id: string): HTMLElement {
		const row = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].find(row => row.dataset.remoteId === id);
		const action = row?.querySelector<HTMLElement>('.remotes-connection-actions [role="button"]');
		assert.ok(action, `Missing connection action for ${id}`);
		return action;
	}

	for (const operatingSystem of [OperatingSystem.Windows, OperatingSystem.Macintosh, OperatingSystem.Linux]) {
		test(`uses a grouped tree and switches with platform-specific roots (${operatingSystem})`, () => {
			const { parent, widget } = createWidget(operatingSystem);
			assert.deepStrictEqual({
				trees: parent.querySelectorAll('[role="tree"]').length,
				roots: [...parent.querySelectorAll('.group-label')].map(element => element.textContent),
				switches: parent.querySelectorAll('[role="switch"]').length,
				checkboxes: parent.querySelectorAll('[role="checkbox"]').length,
				accessibleWSL: widget.getAccessibilityContent().includes('Ubuntu'),
				accessibleContainers: widget.getAccessibilityContent().includes('Project'),
			}, {
				trees: 1,
				roots: operatingSystem === OperatingSystem.Windows ? ['WSL', 'SSH', 'Tunnels'] : ['SSH', 'Tunnels'],
				switches: operatingSystem === OperatingSystem.Windows ? 3 : 2,
				checkboxes: 0,
				accessibleWSL: operatingSystem === OperatingSystem.Windows,
				accessibleContainers: false,
			});
		});
	}

	test('updates the switch without losing its DOM focus or duplicating an in-flight change', async () => {
		const { parent, model } = createWidget();
		const control = getSwitch(parent, 'ssh:build');
		control.focus();
		model.pendingChange = new DeferredPromise<void>();
		control.click();
		control.click();
		await model.pendingChange.complete();
		await timeout(0);
		assert.deepStrictEqual({
			changes: model.changes,
			sameControl: getSwitch(parent, 'ssh:build') === control,
			focused: dom.getActiveElement() === control,
			checked: control.getAttribute('aria-checked'),
		}, { changes: [{ id: 'ssh:build', enabled: false }], sameControl: true, focused: true, checked: 'false' });
	});

	test('allows native switch keyboard activation instead of tree expansion or selection', () => {
		const { parent } = createWidget();
		const control = getSwitch(parent, 'ssh:build');
		control.focus();
		const events = [
			new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true, cancelable: true }),
			new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
		];
		for (const event of events) {
			control.dispatchEvent(event);
		}
		assert.deepStrictEqual(events.map(event => event.defaultPrevented), [false, false]);
	});

	test('restores the switch and surfaces a failed visibility change', async () => {
		const { parent, model, errors } = createWidget();
		model.pendingChange = new DeferredPromise<void>();
		const control = getSwitch(parent, 'tunnel:laptop');
		control.click();
		const error = new Error('Could not register tunnel');
		await model.pendingChange.error(error);
		await timeout(0);
		assert.deepStrictEqual({
			checked: getSwitch(parent, 'tunnel:laptop').getAttribute('aria-checked'),
			errors,
		}, { checked: 'false', errors: [error] });
	});

	test('preserves collapsed groups through inventory updates', () => {
		const { parent, model } = createWidget();
		parent.querySelector('.monaco-tl-twistie')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		const expandedBeforeUpdate = parent.querySelector('.ai-customization-group-header')!.closest('.monaco-list-row')?.getAttribute('aria-expanded');
		model.remotes.set([...model.remotes.get()], undefined);
		const firstGroup = parent.querySelector('.ai-customization-group-header')!.closest('.monaco-list-row');
		assert.deepStrictEqual({
			expandedBeforeUpdate,
			expanded: firstGroup?.getAttribute('aria-expanded'),
			sshRows: parent.querySelectorAll('[data-remote-id="ssh:build"]').length,
			switches: parent.querySelectorAll('[role="switch"]').length,
		}, { expandedBeforeUpdate: 'false', expanded: 'false', sshRows: 0, switches: 1 });
	});

	test('search matches names, details and groups and filters the accessible view', () => {
		const { parent, widget } = createWidget();
		const matches: string[][] = [];
		for (const query of ['build.example', 'Tunnels', 'no match', '']) {
			widget.setSearchQuery(query);
			matches.push([...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId!));
			if (query === 'Tunnels') {
				assert.ok(!widget.getAccessibilityContent().includes('Build server'));
			}
		}
		assert.deepStrictEqual(matches, [['ssh:build'], ['tunnel:laptop'], [], ['ssh:build', 'tunnel:laptop']]);
	});

	test('shows unavailable remotes with disabled switches', () => {
		const { parent, model } = createWidget();
		model.remotes.set([{ id: 'ssh:unavailable', kind: 'ssh', name: 'Unavailable', detail: 'Host', enabled: false, unavailableReason: 'Unavailable host', connectionStatus: RemoteAgentHostConnectionStatus.disconnected }], undefined);
		const control = getSwitch(parent, 'ssh:unavailable');
		control.click();
		assert.deepStrictEqual({ disabled: control.disabled, changes: model.changes }, { disabled: true, changes: [] });
	});

	test('shows live connection states and the corresponding inline action', () => {
		const { parent, model, widget } = createWidget();
		const states = [
			RemoteAgentHostConnectionStatus.connected, RemoteAgentHostConnectionStatus.disconnected,
			RemoteAgentHostConnectionStatus.connecting, RemoteAgentHostConnectionStatus.reconnecting,
			RemoteAgentHostConnectionStatus.incompatible('Update required', ['1']),
		];
		const observed = states.map(connectionStatus => {
			model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? { ...remote, connectionStatus } : remote), undefined);
			const action = getConnectionAction(parent, 'ssh:build');
			return {
				status: parent.querySelector('[data-remote-id="ssh:build"] .remotes-connection-state')?.textContent,
				action: action.getAttribute('aria-label'),
				disabled: action.getAttribute('aria-disabled') === 'true',
			};
		});
		assert.deepStrictEqual({ observed, accessible: widget.getAccessibilityContent().includes('Connection: Incompatible') }, {
			observed: [
				{ status: 'Online', action: 'Disconnect Build server', disabled: false },
				{ status: 'Offline', action: 'Connect to Build server', disabled: false },
				{ status: 'Connecting', action: 'Connect to Build server', disabled: true },
				{ status: 'Reconnecting', action: 'Connect to Build server', disabled: true },
				{ status: 'Incompatible', action: 'Connect to Build server', disabled: false },
			],
			accessible: true,
		});
	});

	test('connect is keyboard accessible and prevents concurrent connection and visibility changes', async () => {
		const { parent, model } = createWidget();
		const action = getConnectionAction(parent, 'tunnel:laptop');
		parent.querySelector('[data-remote-id="tunnel:laptop"] .remotes-name')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		const tabIndex = action.tabIndex;
		action.focus();
		action.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		model.pendingConnection = new DeferredPromise<void>();
		for (const type of ['keydown', 'keyup']) {
			action.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		const busy = {
			actionDisabled: action.getAttribute('aria-disabled'), switchDisabled: getSwitch(parent, 'tunnel:laptop').disabled,
			state: parent.querySelector('[data-remote-id="tunnel:laptop"] .remotes-connection-state')?.textContent,
		};
		action.click();
		getSwitch(parent, 'tunnel:laptop').click();
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({
			tabIndex, busy, connectionChanges: model.connectionChanges, visibilityChanges: model.changes,
			action: action.getAttribute('aria-label'), checked: getSwitch(parent, 'tunnel:laptop').getAttribute('aria-checked'),
			sameControl: getConnectionAction(parent, 'tunnel:laptop') === action, focused: dom.getActiveElement() === action,
		}, {
			tabIndex: 0, busy: { actionDisabled: 'true', switchDisabled: true, state: 'Connecting' },
			connectionChanges: [{ id: 'tunnel:laptop', connected: true }], visibilityChanges: [],
			action: 'Disconnect Laptop', checked: 'true', sameControl: true, focused: true,
		});
	});

	test('disconnect follows the model visibility changes and keeps the group expanded', async () => {
		const { parent, model, widget } = createWidget();
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, 'ssh:build').click();
		const busy = {
			state: parent.querySelector('[data-remote-id="ssh:build"] .remotes-connection-state')?.textContent,
			accessible: widget.getAccessibilityContent().includes('Connection: Disconnecting'),
			switchDisabled: getSwitch(parent, 'ssh:build').disabled,
		};
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({
			busy,
			connectionChanges: model.connectionChanges, action: getConnectionAction(parent, 'ssh:build').getAttribute('aria-label'),
			checked: getSwitch(parent, 'ssh:build').getAttribute('aria-checked'),
			expanded: parent.querySelector('.ai-customization-group-header')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
		}, {
			busy: { state: 'Disconnecting', accessible: true, switchDisabled: true },
			connectionChanges: [{ id: 'ssh:build', connected: false }], action: 'Connect to Build server', checked: 'false', expanded: 'true',
		});
	});

	test('connection failures are surfaced and the action becomes available again', async () => {
		const { parent, model, errors } = createWidget();
		model.pendingConnection = new DeferredPromise<void>();
		const action = getConnectionAction(parent, 'tunnel:laptop');
		action.click();
		const error = new Error('Connection refused');
		await model.pendingConnection.error(error);
		await timeout(0);
		assert.deepStrictEqual({
			errors, disabled: action.getAttribute('aria-disabled'), switchDisabled: getSwitch(parent, 'tunnel:laptop').disabled,
			status: parent.querySelector('[data-remote-id="tunnel:laptop"] .remotes-connection-state')?.textContent,
		}, { errors: [error], disabled: null, switchDisabled: false, status: 'Offline' });
	});

	test('shows refresh warnings on the failed groups, with simple tooltips and accessible labels', async () => {
		const { parent, model, widget, hoverContents } = createWidget();
		model.remotes.set(model.remotes.get().filter(remote => remote.kind !== 'devContainer'), undefined);
		model.failedKinds = ['ssh', 'tunnel', 'devContainer'];
		widget.setVisible(true);
		await timeout(0);
		const warnings = [...parent.querySelectorAll<HTMLElement>('.remotes-refresh-warning')].map(icon => {
			const group = icon.closest('.ai-customization-group-header')!;
			return {
				group: group.querySelector('.group-label')?.textContent,
				tooltip: hoverContents.get(icon),
				announced: group.closest('.monaco-list-row')?.getAttribute('aria-label')?.includes(hoverContents.get(icon)!),
			};
		});
		assert.deepStrictEqual({
			warnings,
			message: parent.querySelector('.remotes-message')?.textContent,
			retainedHosts: parent.querySelectorAll('[data-remote-id]').length,
			accessibleWarnings: widget.getAccessibilityContent().match(/See the Window log for more details\./g)?.length,
		}, {
			warnings: [
				{ group: 'SSH', tooltip: 'Could not read your SSH hosts. Check your SSH configuration. See the Window log for more details.', announced: true },
				{ group: 'Tunnels', tooltip: 'Could not refresh tunnels. Check your sign-in and network connection. See the Window log for more details.', announced: true },
			],
			message: '', retainedHosts: 2, accessibleWarnings: 2,
		});
	});

	test('retains warnings during retry and clears only the recovered groups', async () => {
		const { parent, model, widget } = createWidget();
		const warningGroups = () => [...parent.querySelectorAll('.remotes-refresh-warning')].map(icon => icon.closest('.ai-customization-group-header')?.querySelector('.group-label')?.textContent);
		const refresh = () => parent.querySelector<HTMLElement>('.section-title-actions .codicon-refresh')!.click();
		model.failedKinds = ['ssh', 'tunnel'];
		widget.setVisible(true);
		await timeout(0);
		const initial = warningGroups();
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		refresh();
		const pending = warningGroups();
		await model.pendingRefresh.complete(['tunnel']);
		await timeout(0);
		const retried = warningGroups();
		model.pendingRefresh = undefined;
		model.failedKinds = [];
		refresh();
		await timeout(0);
		assert.deepStrictEqual({ initial, pending, retried, recovered: warningGroups() }, {
			initial: ['SSH', 'Tunnels'], pending: ['SSH', 'Tunnels'], retried: ['Tunnels'], recovered: [],
		});
	});

	test('refresh uses an accessible toolbar icon and stays disabled during discovery', async () => {
		const { parent, model, widget } = createWidget();
		widget.setVisible(true);
		await timeout(0);
		const refresh = parent.querySelector<HTMLElement>('.section-title-actions .codicon-refresh')!;
		const idle = {
			label: refresh.getAttribute('aria-label'),
			role: refresh.getAttribute('role'),
			text: refresh.textContent,
			tabIndex: refresh.tabIndex,
			disabled: refresh.getAttribute('aria-disabled'),
		};
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		refresh.focus();
		refresh.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		for (const type of ['keydown', 'keyup']) {
			refresh.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		const pendingDisabled = refresh.getAttribute('aria-disabled');
		refresh.click();
		await model.pendingRefresh.complete([]);
		await timeout(0);
		assert.deepStrictEqual({ idle, pendingDisabled, completedDisabled: refresh.getAttribute('aria-disabled'), refreshCalls: model.refreshCalls }, {
			idle: { label: 'Refresh', role: 'button', text: '', tabIndex: 0, disabled: null },
			pendingDisabled: 'true',
			completedDisabled: null,
			refreshCalls: 2,
		});
	});

	test('does not publish warnings from a canceled refresh or for platform-hidden groups', async () => {
		const { parent, model, widget } = createWidget();
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		widget.setVisible(false);
		await model.pendingRefresh.complete(['tunnel']);
		await timeout(0);
		const canceled = parent.querySelectorAll('.remotes-refresh-warning').length;
		model.pendingRefresh = undefined;
		model.failedKinds = ['wsl', 'devContainer'];
		widget.setVisible(true);
		await timeout(0);
		assert.deepStrictEqual({
			canceled,
			hidden: parent.querySelectorAll('.remotes-refresh-warning').length,
			accessibleWarning: widget.getAccessibilityContent().includes('Window log'),
		}, { canceled: 0, hidden: 0, accessibleWarning: false });
	});

	test('the SSH gear opens the user config in a modal without collapsing its node or connecting', async () => {
		const { parent, model, opened, configRequests } = createWidget();
		const gear = parent.querySelector<HTMLElement>('.group-actions .codicon-settings-gear')!;
		assert.ok(gear);
		gear.click();
		await timeout(0);
		assert.deepStrictEqual({
			configRequests: configRequests(),
			opened,
			expanded: parent.querySelector('.ai-customization-group-header')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
			changes: model.changes,
		}, {
			configRequests: 1,
			opened: [{ input: { resource: URI.file('/home/test/.ssh/config'), options: { pinned: true } }, group: MODAL_GROUP }],
			expanded: 'true',
			changes: [],
		});
	});

	test('SSH configuration failures are surfaced', async () => {
		const { parent, opened, errors, failConfig } = createWidget();
		const error = new Error('Cannot create SSH config');
		failConfig(error);
		parent.querySelector<HTMLElement>('.group-actions .codicon-settings-gear')!.click();
		await timeout(0);
		assert.deepStrictEqual({ opened, errors }, { opened: [], errors: [error] });
	});

	test('the SSH gear and setup links follow tree focus and support keyboard activation', async () => {
		const { widget, parent, model, configRequests, documentation } = createWidget();
		model.remotes.set([], undefined);
		widget.setVisible(true);
		await timeout(0);
		const tree = parent.querySelector<HTMLElement>('[role="tree"]')!;
		tree.focus();
		const gear = parent.querySelector<HTMLElement>('.group-actions .codicon-settings-gear')!;
		const initialGearTabIndex = gear.tabIndex;
		gear.focus();
		gear.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		for (const type of ['keydown', 'keyup']) {
			gear.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		await timeout(0);
		tree.focus();
		parent.querySelector('.remotes-empty-label')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		const link = parent.querySelector<HTMLElement>('.remotes-empty-actions .monaco-link')!;
		const focusedLinkTabIndex = link.tabIndex;
		link.focus();
		link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			initialGearTabIndex, focusedGearTabIndex: gear.tabIndex, focusedLinkTabIndex, configRequests: configRequests(), documentation,
			expanded: parent.querySelector('.ai-customization-group-header')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
		}, {
			initialGearTabIndex: 0, focusedGearTabIndex: -1, focusedLinkTabIndex: 0, configRequests: 1,
			documentation: ['https://aka.ms/vscode-agent-ssh'],
			expanded: 'true',
		});
	});

	test('empty groups show setup guidance and working documentation links', async () => {
		const { widget, parent, model, documentation } = createWidget(OperatingSystem.Windows);
		model.remotes.set([], undefined);
		widget.setVisible(true);
		await timeout(0);
		for (const link of parent.querySelectorAll<HTMLElement>('.remotes-empty-actions .monaco-link')) {
			link.click();
		}
		assert.deepStrictEqual({
			labels: [...parent.querySelectorAll('.remotes-empty-label')].map(element => element.textContent),
			counts: [...parent.querySelectorAll('.group-count')].map(element => element.textContent),
			documentation,
			accessibleGuidance: widget.getAccessibilityContent().includes('SSH Setup Guide: https://aka.ms/vscode-agent-ssh'),
		}, {
			labels: ['No WSL 2 distributions found.', 'No SSH hosts configured.', 'No tunnels found for this account.'],
			counts: ['0', '0', '0'],
			documentation: [
				'https://aka.ms/vscode-remote/wsl/install-wsl',
				'https://aka.ms/vscode-agent-ssh',
				'https://aka.ms/vscode-agent-tunnel',
			],
			accessibleGuidance: true,
		});
	});

	test('loading, refresh failure and search misses are not presented as missing setup', async () => {
		const { widget, parent, model } = createWidget();
		const labels = () => [...parent.querySelectorAll('.remotes-empty-label')].map(element => element.textContent);
		model.remotes.set([], undefined);
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const loading = labels();
		await model.pendingRefresh.complete(['tunnel']);
		await timeout(0);
		const refreshed = labels();
		widget.setSearchQuery('nonexistent');
		assert.deepStrictEqual({ loading, refreshed, filtered: labels(), setupLinks: parent.querySelectorAll('.remotes-empty-actions .monaco-link').length }, {
			loading: ['Looking for SSH locations...', 'Looking for Tunnels locations...'],
			refreshed: ['No SSH hosts configured.', 'Could not refresh Tunnels.'],
			filtered: ['No matching remotes.', 'No matching remotes.'],
			setupLinks: 0,
		});
	});
});
