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
import { HoverService } from '../../../../../../platform/hover/browser/hoverService.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { GitHubEnvironmentsEnabledSettingId } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IResourceEditorInput } from '../../../../../../platform/editor/common/editor.js';
import { IEditorService, MODAL_GROUP, PreferredGroup } from '../../../../../../workbench/services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { ICustomizationRemote, IRemotesModel, RemoteKind } from '../../browser/remotesModel.js';
import { RemotesWidget } from '../../browser/remotesWidget.js';

class TestRemotesModel extends Disposable implements IRemotesModel {
	readonly environmentsEnabled = observableValue(this, false);
	readonly remotes = observableValue<readonly ICustomizationRemote[]>(this, [
		{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
		{ id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		{ id: 'tunnel:laptop', kind: 'tunnel', name: 'Laptop', detail: 'work-laptop', canRemove: false, connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		{ id: 'container:project', kind: 'devContainer', name: 'Project', detail: '/project', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
	]);
	readonly managementChanges: { id: string; action: 'rename' | 'remove' }[] = [];
	readonly connectionChanges: { id: string; connected: boolean }[] = [];
	pendingConnection: DeferredPromise<void> | undefined;
	pendingManagement: DeferredPromise<void> | undefined;
	failedKinds: readonly RemoteKind[] = [];
	pendingRefresh: DeferredPromise<readonly RemoteKind[]> | undefined;
	refreshCalls = 0;

	async refresh(): Promise<readonly RemoteKind[]> {
		this.refreshCalls++;
		return this.pendingRefresh?.p ?? this.failedKinds;
	}

	async rename(id: string): Promise<void> {
		this.managementChanges.push({ id, action: 'rename' });
		await this.pendingManagement?.p;
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, name: 'Renamed remote' } : remote).sort((a, b) => a.name.localeCompare(b.name)), undefined);
	}

	async remove(id: string): Promise<void> {
		this.managementChanges.push({ id, action: 'remove' });
		await this.pendingManagement?.p;
		this.remotes.set(this.remotes.get().filter(remote => remote.id !== id), undefined);
	}

	async setConnected(id: string, connected: boolean): Promise<void> {
		this.connectionChanges.push({ id, connected });
		await this.pendingConnection?.p;
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? {
			...remote, canRemove: connected, connectionStatus: connected ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected,
		} : remote), undefined);
	}
}

suite('RemotesWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(operatingSystem = OperatingSystem.Macintosh, realHovers = false) {
		const parent = dom.append(document.body, dom.$('div'));
		parent.style.width = '700px';
		parent.style.height = '640px';
		store.add(toDisposable(() => parent.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const errors: Parameters<INotificationService['error']>[0][] = [];
		const hoverContents = new Map<HTMLElement, string>();
		const hoverOptions = new Map<HTMLElement, { focus: boolean; trapFocus: boolean }>();
		const opened: { input: IResourceEditorInput; group: PreferredGroup | undefined }[] = [];
		const documentation: string[] = [];
		const settings: Parameters<IPreferencesService['openSettings']>[0][] = [];
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
		instantiationService.stub(IPreferencesService, { openSettings: async options => { settings.push(options); return undefined; } });
		instantiationService.stub(INotificationService, 'error', (error: Parameters<INotificationService['error']>[0]) => { errors.push(error); });
		const hoverService = realHovers ? (() => {
			instantiationService.stub(ILayoutService, { getContainer: () => parent });
			return store.add(instantiationService.createInstance(HoverService));
		})() : new class extends mock<IHoverService>() {
			override setupManagedHover(...args: Parameters<IHoverService['setupManagedHover']>) {
				return NullHoverService.setupManagedHover(...args);
			}
			override setupDelayedHover(...args: Parameters<IHoverService['setupDelayedHover']>) {
				const options = typeof args[1] === 'function' ? args[1]() : args[1];
				if (typeof options.content === 'string') {
					hoverContents.set(args[0], options.content);
				}
				return toDisposable(() => {
					hoverContents.delete(args[0]);
				});
			}
			override showDelayedHover(options: Parameters<IHoverService['showDelayedHover']>[0]) {
				return this.showInstantHover(options);
			}
			override showInstantHover(options: Parameters<IHoverService['showInstantHover']>[0], focus = false) {
				const target = options.target;
				assert.ok(dom.isHTMLElement(target));
				assert.ok(typeof options.content === 'string');
				hoverContents.set(target, options.content);
				hoverOptions.set(target, { focus, trapFocus: options.trapFocus === true });
				let isDisposed = false;
				return {
					get isDisposed() { return isDisposed; },
					dispose: () => {
						isDisposed = true;
						hoverContents.delete(target);
						hoverOptions.delete(target);
					},
				};
			}
		}();
		instantiationService.stub(IHoverService, hoverService);
		const model = store.add(new TestRemotesModel());
		const widget = store.add(instantiationService.createInstance(RemotesWidget, parent, model, operatingSystem));
		widget.layout();
		return { widget, parent, model, errors, hoverContents, hoverOptions, hoverService, opened, documentation, settings, configRequests: () => configRequests, failConfig: (error: Error) => { configFailure = error; } };
	}

	function getManagementAction(parent: HTMLElement, id: string, action: 'rename'): HTMLElement {
		const row = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].find(row => row.dataset.remoteId === id);
		const control = row?.querySelector<HTMLElement>('.codicon-edit');
		assert.ok(control, `Missing ${action} action for ${id}`);
		return control;
	}

	function getConnectionAction(parent: HTMLElement, id: string): HTMLElement {
		const row = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].find(row => row.dataset.remoteId === id);
		const action = row?.querySelector<HTMLElement>('.remotes-actions-column [role="button"]');
		assert.ok(action, `Missing connection action for ${id}`);
		return action;
	}

	for (const operatingSystem of [OperatingSystem.Windows, OperatingSystem.Macintosh, OperatingSystem.Linux]) {
		test(`uses a grouped table without visibility controls and with platform-specific sections (${operatingSystem})`, () => {
			const { parent, widget } = createWidget(operatingSystem);
			assert.deepStrictEqual({
				tables: parent.querySelectorAll('.monaco-table').length,
				trees: parent.querySelectorAll('[role="tree"]').length,
				columns: [...parent.querySelectorAll('.monaco-table-th')].map(element => element.textContent),
				roots: [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent),
				switches: parent.querySelectorAll('[role="switch"]:not([hidden])').length,
				checkboxes: parent.querySelectorAll('[role="checkbox"]').length,
				accessibleWSL: widget.getAccessibilityContent().includes('Ubuntu'),
				accessibleContainers: widget.getAccessibilityContent().includes('Project'),
			}, {
				tables: 1,
				trees: 0,
				columns: ['', 'Name', 'Address', 'Connection', ''],
				roots: operatingSystem === OperatingSystem.Windows ? ['SSH', 'Tunnels', 'WSL'] : ['SSH', 'Tunnels'],
				switches: 0,
				checkboxes: 0,
				accessibleWSL: operatingSystem === OperatingSystem.Windows,
				accessibleContainers: false,
			});
		});
	}

	test('orders enabled sections alphabetically in the table and accessible view', () => {
		const { widget, parent, model } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		const headings = ['Environments', 'SSH', 'Tunnels', 'WSL'];
		assert.deepStrictEqual({
			table: [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent),
			accessible: widget.getAccessibilityContent().split('\n').filter(line => headings.includes(line)),
		}, { table: headings, accessible: headings });
	});

	test('aligns compact rows under resizable column headers', () => {
		const { parent } = createWidget();
		const headers = [...parent.querySelectorAll<HTMLElement>('.monaco-table-th')];
		const row = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!;
		const cells = [...row.querySelectorAll<HTMLElement>('.monaco-table-td')];
		assert.deepStrictEqual({
			values: cells.slice(1, 4).map(cell => cell.textContent),
			aligned: cells.every((cell, index) => Math.abs(cell.getBoundingClientRect().x - headers[index].getBoundingClientRect().x) < 1),
			rowHeight: row.getBoundingClientRect().height,
			groupHeight: parent.querySelector('.remotes-group-row')!.getBoundingClientRect().height,
			headerHeight: headers[1].getBoundingClientRect().height,
			actionsWidth: headers[4].getBoundingClientRect().width === 72,
			sashes: parent.querySelectorAll('.monaco-sash.vertical').length > 0,
		}, {
			values: ['Build server', 'build.example.com', 'Connected'], aligned: true,
			rowHeight: 26, groupHeight: 30, headerHeight: 30, actionsWidth: true, sashes: true,
		});
	});

	test('group keyboard collapse and expansion preserves rows through refresh', () => {
		const { parent, model } = createWidget();
		const list = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
		list.focus();
		const shown = () => parent.querySelectorAll('[data-remote-id="ssh:build"]').length;
		const states = [shown()];
		list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', keyCode: 37, bubbles: true, cancelable: true }));
		states.push(shown());
		model.remotes.set([...model.remotes.get()], undefined);
		states.push(shown());
		list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		states.push(shown());
		assert.deepStrictEqual(states, [1, 0, 0, 1]);
	});

	test('search expands groups to reveal matching table rows', () => {
		const { parent, widget } = createWidget();
		parent.querySelector<HTMLElement>('.remotes-gutter-column .codicon-chevron-down')!.click();
		widget.setSearchQuery('build.example');
		assert.deepStrictEqual({
			remotes: [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId),
			expanded: parent.querySelector('.remotes-group-row')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
		}, { remotes: ['ssh:build'], expanded: 'true' });
	});

	test('Rename preserves keyboard focus and prevents duplicate management actions', async () => {
		const { parent, model } = createWidget();
		const control = getManagementAction(parent, 'ssh:build', 'rename');
		control.focus();
		model.pendingManagement = new DeferredPromise<void>();
		control.click();
		control.click();
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			changes: model.managementChanges,
			sameControl: getManagementAction(parent, 'ssh:build', 'rename') === control,
			focused: dom.getActiveElement() === control,
			name: parent.querySelector('[data-remote-id="ssh:build"] .remotes-name')?.textContent,
		}, { changes: [{ id: 'ssh:build', action: 'rename' }], sameControl: true, focused: true, name: 'Renamed remote' });
	});

	test('remote rows offer only connection and rename actions, including after refresh', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
		}], undefined);
		const actions = () => [...parent.querySelectorAll('[data-remote-id]')].map(row =>
			[...row.querySelectorAll('.remotes-actions-column [role="button"]')].map(action => action.getAttribute('aria-label')));
		const before = actions();
		widget.setVisible(true);
		await timeout(0);
		const expected = [
			['Connect to Desktop', 'Rename Desktop...'],
			['Disconnect Build server', 'Rename Build server...'],
			['Connect to Laptop', 'Rename Laptop...'],
			['Connect to Ubuntu', 'Rename Ubuntu...'],
		];
		assert.deepStrictEqual({ before, after: actions(), changes: model.managementChanges }, { before: expected, after: expected, changes: [] });
	});

	test('renaming a sorted row does not leave keyboard focus on another remote action', async () => {
		const { parent, model } = createWidget();
		model.remotes.set([...model.remotes.get(), {
			id: 'ssh:other', kind: 'ssh', name: 'Other', detail: 'other.example.com', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
		parent.querySelector('[data-remote-id="ssh:build"] .remotes-name')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		const rename = getManagementAction(parent, 'ssh:build', 'rename');
		rename.focus();
		rename.click();
		await timeout(0);
		assert.deepStrictEqual({
			focusedRemote: parent.querySelector<HTMLElement>('.monaco-list-row.focused [data-remote-id]')?.dataset.remoteId,
			listFocused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { focusedRemote: 'ssh:build', listFocused: true });
	});

	test('surfaces failed management operations and re-enables the action', async () => {
		const { parent, model, errors } = createWidget();
		model.pendingManagement = new DeferredPromise<void>();
		const control = getManagementAction(parent, 'tunnel:laptop', 'rename');
		control.click();
		const error = new Error('Could not save name');
		await model.pendingManagement.error(error);
		await timeout(0);
		assert.deepStrictEqual({
			disabled: getManagementAction(parent, 'tunnel:laptop', 'rename').getAttribute('aria-disabled'),
			errors,
		}, { disabled: null, errors: [error] });
	});

	test('preserves collapsed groups through inventory updates', () => {
		const { parent, model } = createWidget();
		parent.querySelector<HTMLElement>('.remotes-gutter-column .codicon-chevron-down')!.click();
		const expandedBeforeUpdate = parent.querySelector('.remotes-group-row')!.closest('.monaco-list-row')?.getAttribute('aria-expanded');
		model.remotes.set([...model.remotes.get()], undefined);
		const firstGroup = parent.querySelector('.remotes-group-row')!.closest('.monaco-list-row');
		assert.deepStrictEqual({
			expandedBeforeUpdate,
			expanded: firstGroup?.getAttribute('aria-expanded'),
			sshRows: parent.querySelectorAll('[data-remote-id="ssh:build"]').length,
			rows: parent.querySelectorAll('[data-remote-id]').length,
		}, { expandedBeforeUpdate: 'false', expanded: 'false', sshRows: 0, rows: 1 });
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

	test('unavailable remotes cannot connect but can still be renamed', () => {
		const { parent, model } = createWidget();
		model.remotes.set([{ id: 'ssh:unavailable', kind: 'ssh', name: 'Unavailable', detail: 'Host', canRemove: false, unavailableReason: 'Unavailable host', connectionStatus: RemoteAgentHostConnectionStatus.disconnected }], undefined);
		const control = getConnectionAction(parent, 'ssh:unavailable');
		control.click();
		assert.deepStrictEqual({
			disabled: control.getAttribute('aria-disabled'), changes: model.connectionChanges,
			renameDisabled: getManagementAction(parent, 'ssh:unavailable', 'rename').getAttribute('aria-disabled'),
		}, { disabled: 'true', changes: [], renameDisabled: null });
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
		assert.deepStrictEqual({ observed, accessible: widget.getAccessibilityContent().includes('Connection: Disconnected') }, {
			observed: [
				{ status: 'Connected', action: 'Disconnect Build server', disabled: false },
				{ status: 'Disconnected', action: 'Connect to Build server', disabled: false },
				{ status: 'Connecting', action: 'Connect to Build server', disabled: true },
				{ status: 'Disconnected', action: 'Connect to Build server', disabled: true },
				{ status: 'Disconnected', action: 'Connect to Build server', disabled: false },
			],
			accessible: true,
		});
	});

	test('connect is keyboard accessible and prevents concurrent connection and management changes', async () => {
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
			actionDisabled: action.getAttribute('aria-disabled'), renameDisabled: getManagementAction(parent, 'tunnel:laptop', 'rename').getAttribute('aria-disabled'),
			state: parent.querySelector('[data-remote-id="tunnel:laptop"] .remotes-connection-state')?.textContent,
		};
		action.click();
		getManagementAction(parent, 'tunnel:laptop', 'rename').click();
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({
			tabIndex, busy, connectionChanges: model.connectionChanges, managementChanges: model.managementChanges,
			action: action.getAttribute('aria-label'), renameDisabled: getManagementAction(parent, 'tunnel:laptop', 'rename').getAttribute('aria-disabled'),
			sameControl: getConnectionAction(parent, 'tunnel:laptop') === action, focused: dom.getActiveElement() === action,
		}, {
			tabIndex: 0, busy: { actionDisabled: 'true', renameDisabled: 'true', state: 'Connecting' },
			connectionChanges: [{ id: 'tunnel:laptop', connected: true }], managementChanges: [],
			action: 'Disconnect Laptop', renameDisabled: null, sameControl: true, focused: true,
		});
	});

	test('disconnect restores rename availability and keeps the group expanded', async () => {
		const { parent, model, widget } = createWidget();
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, 'ssh:build').click();
		const busy = {
			state: parent.querySelector('[data-remote-id="ssh:build"] .remotes-connection-state')?.textContent,
			accessible: widget.getAccessibilityContent().includes('Connection: Disconnecting'),
			renameDisabled: getManagementAction(parent, 'ssh:build', 'rename').getAttribute('aria-disabled'),
		};
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({
			busy,
			connectionChanges: model.connectionChanges, action: getConnectionAction(parent, 'ssh:build').getAttribute('aria-label'),
			renameDisabled: getManagementAction(parent, 'ssh:build', 'rename').getAttribute('aria-disabled'),
			expanded: parent.querySelector('.remotes-group-row')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
		}, {
			busy: { state: 'Disconnecting', accessible: true, renameDisabled: 'true' },
			connectionChanges: [{ id: 'ssh:build', connected: false }], action: 'Connect to Build server', renameDisabled: null, expanded: 'true',
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
			errors, disabled: action.getAttribute('aria-disabled'), renameDisabled: getManagementAction(parent, 'tunnel:laptop', 'rename').getAttribute('aria-disabled'),
			status: parent.querySelector('[data-remote-id="tunnel:laptop"] .remotes-connection-state')?.textContent,
		}, { errors: [error], disabled: null, renameDisabled: null, status: 'Disconnected' });
	});

	test('shows refresh warnings on the failed groups, with simple tooltips and accessible labels', async () => {
		const { parent, model, widget, hoverContents } = createWidget();
		model.remotes.set(model.remotes.get().filter(remote => remote.kind !== 'devContainer'), undefined);
		model.failedKinds = ['ssh', 'tunnel', 'devContainer'];
		widget.setVisible(true);
		await timeout(0);
		const warnings = [...parent.querySelectorAll<HTMLElement>('.remotes-refresh-warning:not([hidden])')].map(icon => {
			const group = icon.closest('.remotes-group-row')!;
			return {
				group: group.querySelector('.remotes-name')?.textContent,
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
		const warningGroups = () => [...parent.querySelectorAll('.remotes-refresh-warning:not([hidden])')].map(icon => icon.closest('.remotes-group-row')?.querySelector('.remotes-name')?.textContent);
		const refresh = () => parent.querySelector<HTMLElement>('.remotes-header-actions .codicon-refresh')!.click();
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
		const refresh = parent.querySelector<HTMLElement>('.remotes-header-actions .codicon-refresh')!;
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
		const canceled = parent.querySelectorAll('.remotes-refresh-warning:not([hidden])').length;
		model.pendingRefresh = undefined;
		model.failedKinds = ['wsl', 'devContainer'];
		widget.setVisible(true);
		await timeout(0);
		assert.deepStrictEqual({
			canceled,
			hidden: parent.querySelectorAll('.remotes-refresh-warning:not([hidden])').length,
			accessibleWarning: widget.getAccessibilityContent().includes('Window log'),
		}, { canceled: 0, hidden: 0, accessibleWarning: false });
	});

	test('the SSH gear opens the user config in a modal without collapsing its node or connecting', async () => {
		const { parent, model, opened, configRequests } = createWidget();
		const gear = parent.querySelector<HTMLElement>('.remotes-group-row .codicon-settings-gear')!;
		assert.ok(gear);
		gear.click();
		await timeout(0);
		assert.deepStrictEqual({
			configRequests: configRequests(),
			opened,
			expanded: parent.querySelector('.remotes-group-row')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
			changes: model.connectionChanges,
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
		parent.querySelector<HTMLElement>('.remotes-group-row .codicon-settings-gear')!.click();
		await timeout(0);
		assert.deepStrictEqual({ opened, errors }, { opened: [], errors: [error] });
	});

	test('the Tunnels gear opens the same settings filter as Manage', async () => {
		const { parent, settings, opened, configRequests } = createWidget();
		parent.querySelector<HTMLElement>('[aria-label="Open Tunnel Settings"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({ settings, opened, configRequests: configRequests() }, {
			settings: [{ query: 'chat.remoteAgentHosts' }], opened: [], configRequests: 0,
		});
	});

	test('Environments appears only when enabled and offers settings and empty guidance', async () => {
		const { widget, parent, model, settings } = createWidget();
		const groups = () => [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(node => node.textContent);
		const hidden = groups();
		model.environmentsEnabled.set(true, undefined);
		widget.setVisible(true);
		await timeout(0);
		const shown = groups();
		parent.querySelector<HTMLElement>('[aria-label="Open Environment Settings"]')!.click();
		await timeout(0);
		const guidance = widget.getAccessibilityContent().includes('No environments available.');
		model.environmentsEnabled.set(false, undefined);
		assert.deepStrictEqual({ hidden, shown, settings, guidance, disabled: groups() }, {
			hidden: ['SSH', 'Tunnels'], shown: ['Environments', 'SSH', 'Tunnels'],
			settings: [{ query: GitHubEnvironmentsEnabledSettingId }], guidance: true, disabled: ['SSH', 'Tunnels'],
		});
	});

	test('offline environment connection explains its disabled state while Rename stays available', () => {
		const { parent, model } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'desktop', canRemove: false,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
			removeUnavailableReason: 'Removing environments is not supported here. Manage sharing in the application running on that machine.',
		}], undefined);
		const connect = getConnectionAction(parent, 'environment:desktop');
		assert.deepStrictEqual({
			connect: connect.getAttribute('aria-label'), disabled: connect.getAttribute('aria-disabled'),
			renameDisabled: getManagementAction(parent, 'environment:desktop', 'rename').getAttribute('aria-disabled'),
		}, {
			connect: 'Connect to Desktop: Start the owning application.', disabled: 'true',
			renameDisabled: null,
		});
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.connected })), undefined);
		assert.deepStrictEqual({ label: connect.getAttribute('aria-label'), disabled: connect.getAttribute('aria-disabled') }, {
			label: 'Disconnect Desktop', disabled: null,
		});
	});

	test('offline environment keeps its address and explains its status with an accessible info icon', () => {
		const { parent, model, widget, hoverContents, hoverOptions } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
		}], undefined);
		const row = parent.querySelector<HTMLElement>('[data-remote-id="environment:desktop"]')!;
		const info = row.querySelector<HTMLElement>('.remotes-connection-info')!;
		const beforeFocus = info.tabIndex;
		row.click();
		info.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			address: row.querySelector('.remotes-detail')?.textContent,
			connection: info.previousElementSibling?.textContent,
			icon: info.querySelector('.codicon-info')?.getAttribute('aria-hidden'),
			hidden: info.hidden, role: info.getAttribute('role'), label: info.getAttribute('aria-label'),
			tooltip: hoverContents.get(info), beforeFocus, focusedTabIndex: info.tabIndex,
			hoverOptions: hoverOptions.get(info),
			accessible: row.closest('.monaco-list-row')?.getAttribute('aria-label'),
			accessibleView: widget.getAccessibilityContent().includes('Desktop. Address: env-desktop. Connection: Disconnected. Start the owning application.'),
		}, {
			address: 'env-desktop', connection: 'Disconnected', icon: 'true',
			hidden: false, role: 'img', label: 'Start the owning application.',
			tooltip: 'Start the owning application.', beforeFocus: -1, focusedTabIndex: 0,
			hoverOptions: { focus: true, trapFocus: true },
			accessible: 'Desktop. Address: env-desktop. Connection: Disconnected. Start the owning application.',
			accessibleView: true,
		});

		parent.querySelector<HTMLElement>('.remotes-group-row')!.click();
		assert.strictEqual(info.tabIndex, -1);
	});

	test('environment status info is cleared when the row becomes available, connects, or is reused', () => {
		const { parent, model, hoverContents } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		const offline: ICustomizationRemote = {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
		};
		const states = [
			{ ...offline, unavailableReason: undefined },
			{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.connected },
			{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.connecting },
			{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.reconnecting },
		];
		const observed = states.map(remote => {
			model.remotes.set([offline], undefined);
			const previousInfo = parent.querySelector<HTMLElement>('[data-remote-id] .remotes-connection-info')!;
			previousInfo.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			model.remotes.set([remote], undefined);
			const info = parent.querySelector<HTMLElement>('[data-remote-id] .remotes-connection-info')!;
			return {
				address: parent.querySelector('[data-remote-id] .remotes-detail')?.textContent,
				hidden: info.hidden, label: info.getAttribute('aria-label'), tabIndex: info.tabIndex,
				tooltip: hoverContents.get(info), previousTooltip: hoverContents.get(previousInfo),
			};
		});
		assert.deepStrictEqual(observed, states.map(() => ({
			address: 'env-desktop', hidden: true, label: null, tabIndex: -1, tooltip: undefined, previousTooltip: undefined,
		})));
	});

	for (const keyboardHover of [false, true]) {
		for (const removeEnvironment of [false, true]) {
			test(`restores table focus when an environment ${removeEnvironment ? 'disappears' : 'becomes available'} with its ${keyboardHover ? 'tooltip' : 'info icon'} focused`, () => {
				const { parent, model } = createWidget(OperatingSystem.Macintosh, true);
				model.environmentsEnabled.set(true, undefined);
				model.remotes.set([{
					id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
					connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
				}], undefined);
				const row = parent.querySelector<HTMLElement>('[data-remote-id="environment:desktop"]')!;
				row.click();
				const info = row.querySelector<HTMLElement>('.remotes-connection-info')!;
				info.focus();
				if (keyboardHover) {
					info.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
					assert.ok(parent.querySelector('.monaco-hover')?.contains(dom.getActiveElement()));
				}

				model.remotes.set(removeEnvironment ? [] : model.remotes.get().map(remote => ({ ...remote, unavailableReason: undefined })), undefined);
				const table = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
				const tableFocused = dom.getActiveElement() === table;
				assert.deepStrictEqual({
					tableFocused,
					hoverCount: parent.querySelectorAll('.monaco-hover').length,
					visibleInfoCount: parent.querySelectorAll('.remotes-connection-info:not([hidden])').length,
					focusedRowCount: parent.querySelectorAll('.monaco-list-row.focused').length,
				}, { tableFocused: true, hoverCount: 0, visibleInfoCount: 0, focusedRowCount: 1 });
			});
		}
	}

	for (const unrelatedHover of [false, true]) {
		test(`availability updates do not steal focus from ${unrelatedHover ? 'an unrelated tooltip' : 'Search'} or dismiss unrelated hovers`, () => {
			const { parent, model, hoverService } = createWidget(OperatingSystem.Macintosh, true);
			model.environmentsEnabled.set(true, undefined);
			model.remotes.set([{
				id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
				connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
			}], undefined);
			const info = parent.querySelector<HTMLElement>('[data-remote-id] .remotes-connection-info')!;
			info.focus();
			info.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			assert.ok(parent.querySelector('.monaco-hover')?.contains(dom.getActiveElement()));

			const search = parent.querySelector<HTMLInputElement>('.remotes-search-container input')!;
			search.focus();
			const otherHover = unrelatedHover ? store.add(hoverService.showInstantHover({ target: search, content: 'Search help', trapFocus: true }, true)!) : undefined;
			const focused = dom.getActiveElement();
			model.remotes.set(model.remotes.get().map(remote => ({ ...remote, unavailableReason: undefined })), undefined);
			assert.deepStrictEqual({
				sameFocus: dom.getActiveElement() === focused,
				hoverCount: parent.querySelectorAll('.monaco-hover').length,
				otherHoverDisposed: otherHover?.isDisposed,
			}, { sameFocus: true, hoverCount: unrelatedHover ? 1 : 0, otherHoverDisposed: unrelatedHover ? false : undefined });
		});
	}

	test('availability updates cancel a pending info tooltip without moving focus', async () => {
		const { parent, model } = createWidget(OperatingSystem.Macintosh, true);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
		}], undefined);
		const search = parent.querySelector<HTMLInputElement>('.remotes-search-container input')!;
		search.focus();
		parent.querySelector<HTMLElement>('[data-remote-id] .remotes-connection-info')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, unavailableReason: undefined })), undefined);
		await timeout(0);
		assert.deepStrictEqual({ searchFocused: dom.getActiveElement() === search, hoverCount: parent.querySelectorAll('.monaco-hover').length }, {
			searchFocused: true, hoverCount: 0,
		});
	});

	test('keyboard activation focuses an existing pointer tooltip before an availability update', async () => {
		const { parent, model } = createWidget(OperatingSystem.Macintosh, true);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
		}], undefined);
		const info = parent.querySelector<HTMLElement>('[data-remote-id] .remotes-connection-info')!;
		info.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(0);
		assert.ok(parent.querySelector('.monaco-hover'));
		info.focus();
		info.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true, cancelable: true }));
		const tooltipFocused = parent.querySelector('.monaco-hover')?.contains(dom.getActiveElement());
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, unavailableReason: undefined })), undefined);
		assert.deepStrictEqual({
			tooltipFocused, tableFocused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
			hoverCount: parent.querySelectorAll('.monaco-hover').length,
		}, { tooltipFocused: true, tableFocused: true, hoverCount: 0 });
	});

	test('Rename is reachable and operable through toolbar keyboard navigation', async () => {
		const { parent, model } = createWidget();
		const connection = getConnectionAction(parent, 'ssh:build');
		connection.focus();
		connection.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		connection.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		const rename = getManagementAction(parent, 'ssh:build', 'rename');
		assert.strictEqual(dom.getActiveElement(), rename);
		for (const type of ['keydown', 'keyup']) {
			rename.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		await timeout(0);
		rename.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({ changes: model.managementChanges, focused: dom.getActiveElement() === connection }, {
			changes: [{ id: 'ssh:build', action: 'rename' }], focused: true,
		});
	});

	test('the SSH gear and setup links follow table focus and support keyboard activation', async () => {
		const { widget, parent, model, configRequests, documentation } = createWidget();
		model.remotes.set([], undefined);
		widget.setVisible(true);
		await timeout(0);
		const table = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
		table.focus();
		const gear = parent.querySelector<HTMLElement>('.remotes-group-row .codicon-settings-gear')!;
		const initialGearTabIndex = gear.tabIndex;
		gear.focus();
		gear.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		for (const type of ['keydown', 'keyup']) {
			gear.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		await timeout(0);
		table.focus();
		parent.querySelector('.remotes-empty-label')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		const link = parent.querySelector<HTMLElement>('.remotes-empty-actions .monaco-link')!;
		const focusedLinkTabIndex = link.tabIndex;
		link.focus();
		link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			initialGearTabIndex, focusedGearTabIndex: gear.tabIndex, focusedLinkTabIndex, configRequests: configRequests(), documentation,
			expanded: parent.querySelector('.remotes-group-row')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
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
			counts: [...parent.querySelectorAll('.remotes-group-count:not([hidden])')].map(element => element.textContent),
			documentation,
			accessibleGuidance: widget.getAccessibilityContent().includes('SSH Setup Guide: https://aka.ms/vscode-agent-ssh'),
		}, {
			labels: ['No SSH hosts configured.', 'No tunnels found for this account.', 'No WSL 2 distributions found.'],
			counts: ['0', '0', '0'],
			documentation: [
				'https://aka.ms/vscode-agent-ssh',
				'https://aka.ms/vscode-agent-tunnel',
				'https://aka.ms/vscode-remote/wsl/install-wsl',
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
		assert.deepStrictEqual({ loading, refreshed, filtered: labels(), setupLinks: parent.querySelectorAll('.remotes-empty-actions:not([hidden]) .monaco-link').length }, {
			loading: ['Looking for SSH locations...', 'Looking for Tunnels locations...'],
			refreshed: ['No SSH hosts configured.', 'Could not refresh Tunnels.'],
			filtered: ['No matching remotes.', 'No matching remotes.'],
			setupLinks: 0,
		});
	});
});
