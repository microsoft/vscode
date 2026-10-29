/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { combinedDisposable, Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { GitHubEnvironmentsEnabledSettingId } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgress } from '../../../../../../platform/progress/common/progress.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IResourceEditorInput } from '../../../../../../platform/editor/common/editor.js';
import { IEditorService, MODAL_GROUP, PreferredGroup } from '../../../../../../workbench/services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { ICustomizationRemote, IRemoteRefreshProgress, IRemotesModel, RemoteKind, remoteKinds } from '../../browser/remotesModel.js';
import { RemotesWidget } from '../../browser/remotesWidget.js';

class TestRemotesModel extends Disposable implements IRemotesModel {
	readonly environmentsEnabled = observableValue(this, false);
	readonly tunnelAuthenticationRequired = observableValue<'github' | 'microsoft' | undefined>(this, undefined);
	pendingSignIn: DeferredPromise<void> | undefined;
	signInCalls = 0;
	async signInToTunnels(): Promise<void> {
		this.signInCalls++;
		await this.pendingSignIn?.p;
		this.tunnelAuthenticationRequired.set(undefined, undefined);
		this.failedKinds = this.failedKinds.filter(kind => kind !== 'tunnel');
	}
	readonly remotes = observableValue<readonly ICustomizationRemote[]>(this, [
		{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
		{ id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		{ id: 'tunnel:laptop', kind: 'tunnel', name: 'Laptop', detail: 'work-laptop', canRemove: false, canDelete: true, connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		{ id: 'container:project', kind: 'devContainer', name: 'Project', detail: '/project', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
	]);
	readonly managementChanges: { id: string; action: 'rename' | 'remove' }[] = [];
	readonly connectionChanges: { id: string; connected: boolean }[] = [];
	readonly visibilityChanges: { id: string; hidden: boolean }[] = [];
	readonly copiedAddresses: string[] = [];
	readonly locationChanges: string[] = [];
	readonly serverUpdates: string[] = [];
	readonly tunnelDeletions: string[] = [];
	readonly sshDeletions: string[] = [];
	copyFailure: Error | undefined;
	pendingConnection: DeferredPromise<void> | undefined;
	pendingManagement: DeferredPromise<void> | undefined;
	failedKinds: readonly RemoteKind[] = [];
	pendingRefresh: DeferredPromise<readonly RemoteKind[]> | undefined;
	refreshCalls = 0;
	readonly refreshProgress: IProgress<IRemoteRefreshProgress>[] = [];

	async refresh(_token: CancellationToken, progress?: IProgress<IRemoteRefreshProgress>): Promise<readonly RemoteKind[]> {
		this.refreshCalls++;
		if (progress) {
			this.refreshProgress.push(progress);
		}
		for (const kind of remoteKinds) {
			progress?.report({ kind, refreshing: true });
		}
		const result = await (this.pendingRefresh?.p ?? this.failedKinds);
		for (const kind of remoteKinds) {
			progress?.report({ kind, refreshing: false, failed: result.includes(kind) });
		}
		return result;
	}

	setHidden(id: string, hidden: boolean): void {
		this.visibilityChanges.push({ id, hidden });
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, hidden } : remote), undefined);
	}

	async rename(id: string): Promise<void> {
		this.managementChanges.push({ id, action: 'rename' });
		await this.pendingManagement?.p;
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, name: 'Renamed remote' } : remote).sort((a, b) => a.name.localeCompare(b.name)), undefined);
	}

	async copyAddress(id: string): Promise<void> {
		if (this.copyFailure) {
			throw this.copyFailure;
		}
		this.copiedAddresses.push(id);
	}

	async changePreferredAgentLocation(id: string): Promise<void> {
		this.locationChanges.push(id);
		await this.pendingManagement?.p;
	}

	async updateServer(id: string): Promise<void> {
		this.serverUpdates.push(id);
		await this.pendingManagement?.p;
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, connectionStatus: RemoteAgentHostConnectionStatus.connected } : remote), undefined);
	}

	async deleteTunnel(id: string): Promise<void> {
		this.tunnelDeletions.push(id);
		await this.pendingManagement?.p;
		this.remotes.set(this.remotes.get().filter(remote => remote.id !== id), undefined);
	}

	async deleteSSHHost(id: string): Promise<void> {
		this.sshDeletions.push(id);
		await this.pendingManagement?.p;
		this.remotes.set(this.remotes.get().filter(remote => remote.id !== id), undefined);
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
			...remote, canRemove: connected, lastConnectionError: undefined,
			connectionStatus: connected ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected,
		} : remote), undefined);
	}
}

class TestRemotesWidget extends RemotesWidget {
	scrollToBottom(): void {
		this.table.scrollTop = this.table.scrollHeight;
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
		const mouseHoverTargets = new Set<HTMLElement>();
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
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() {
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
			override setupDelayedHoverAtMouse(...args: Parameters<IHoverService['setupDelayedHoverAtMouse']>) {
				mouseHoverTargets.add(args[0]);
				return combinedDisposable(this.setupDelayedHover(...args), toDisposable(() => mouseHoverTargets.delete(args[0])));
			}
		}());
		const model = store.add(new TestRemotesModel());
		const widget = store.add(instantiationService.createInstance(TestRemotesWidget, parent, model, operatingSystem));
		widget.layout();
		return { widget, parent, model, errors, hoverContents, mouseHoverTargets, opened, documentation, settings, configRequests: () => configRequests, failConfig: (error: Error) => { configFailure = error; } };
	}

	function getManagementAction(parent: HTMLElement, id: string, action: 'rename' | 'delete'): HTMLElement {
		const row = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].find(row => row.dataset.remoteId === id);
		const control = row?.querySelector<HTMLElement>(action === 'rename' ? '.codicon-edit' : '.codicon-trash');
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
				descriptions: parent.querySelectorAll('.remotes-description').length,
				accessibleWSL: widget.getAccessibilityContent().includes('Ubuntu'),
				accessibleContainers: widget.getAccessibilityContent().includes('Project'),
			}, {
				tables: 1,
				trees: 0,
				columns: ['', 'Name', 'Status', ''],
				roots: operatingSystem === OperatingSystem.Windows ? ['Dev Tunnels', 'WSL', 'SSH'] : ['Dev Tunnels', 'SSH'],
				switches: 0,
				checkboxes: 0,
				descriptions: 0,
				accessibleWSL: operatingSystem === OperatingSystem.Windows,
				accessibleContainers: false,
			});
		});
	}

	test('orders enabled sections like the Environment picker in the table and accessible view', () => {
		const { widget, parent, model } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		const headings = ['GitHub Environments', 'Dev Tunnels', 'WSL', 'SSH'];
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
			values: cells.slice(1, 3).map(cell => cell.textContent),
			aligned: cells.every((cell, index) => Math.abs(cell.getBoundingClientRect().x - headers[index].getBoundingClientRect().x) < 1),
			rowHeight: row.getBoundingClientRect().height,
			groupHeight: parent.querySelector('.remotes-group-row')!.getBoundingClientRect().height,
			headerHeight: headers[1].getBoundingClientRect().height,
			actionsWidth: headers[3].getBoundingClientRect().width === 144,
			sashes: parent.querySelectorAll('.monaco-sash.vertical').length > 0,
		}, {
			values: ['Build server', 'Connected'], aligned: true,
			rowHeight: 26, groupHeight: 30, headerHeight: 30, actionsWidth: true, sashes: true,
		});
	});

	test('group chevrons and row visibility actions occupy distinct gutter positions', () => {
		const { parent } = createWidget();
		parent.style.setProperty('--vscode-spacing-size80', '8px');
		const group = parent.querySelector<HTMLElement>('.remotes-group-row .remotes-gutter-column .action-label')!;
		const visibility = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-gutter-column .action-label')!;
		assert.deepStrictEqual({
			offset: visibility.getBoundingClientRect().left - group.getBoundingClientRect().left,
			width: parent.querySelector('.monaco-table-th')!.getBoundingClientRect().width,
		}, { offset: 26, width: 64 });
	});

	test('shows disconnected error details in a warning hover, row label and accessible view', async () => {
		const { parent, widget, model, hoverContents } = createWidget();
		parent.style.setProperty('--vscode-spacing-size60', '6px');
		const error = 'connect ECONNREFUSED 127.0.0.1:43192';
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? {
			...remote, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, lastConnectionError: error,
		} : remote), undefined);
		const warning = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-connection-warning')!;
		const row = warning.closest('.monaco-list-row')!;
		const label = parent.querySelector('[data-remote-id="ssh:build"] .remotes-connection-state')!;
		assert.deepStrictEqual({
			visible: !warning.hidden, hover: hoverContents.get(warning), aria: row.getAttribute('aria-label')?.includes(error),
			accessible: widget.getAccessibilityContent().includes(error),
			afterLabel: warning.getBoundingClientRect().left > label.getBoundingClientRect().right,
		}, { visible: true, hover: error, aria: true, accessible: true, afterLabel: true });
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, 'ssh:build').click();
		const connecting = { hidden: warning.hidden, hover: hoverContents.get(warning), accessible: widget.getAccessibilityContent().includes(error) };
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({ connecting, connected: warning.hidden, hover: hoverContents.get(warning) }, {
			connecting: { hidden: true, hover: undefined, accessible: false }, connected: true, hover: undefined,
		});
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.disconnected })), undefined);
		assert.strictEqual(warning.hidden, true);
	});

	for (const width of [700, 360]) {
		test(`can scroll the complete final empty row above the bottom scrollbar at width ${width}`, async () => {
			const { parent, widget, model } = createWidget(OperatingSystem.Linux);
			parent.style.width = `${width}px`;
			parent.style.height = '220px';
			model.remotes.set(Array.from({ length: 20 }, (_, i) => ({
				id: `tunnel:${i}`, kind: 'tunnel' as const, name: `Host ${i}`, detail: `${i}`, canRemove: false,
				connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
			})), undefined);
			widget.setVisible(true);
			await timeout(0);
			widget.layout();
			widget.scrollToBottom();
			await timeout(0);
			const empty = parent.querySelector<HTMLElement>('.remotes-empty-row')!;
			assert.ok(empty, 'The final empty SSH row is rendered after scrolling');
			const bottom = parent.querySelector('.remotes-table-container')!.getBoundingClientRect().bottom - (width === 360 ? 10 : 0);
			assert.ok(empty.getBoundingClientRect().bottom <= bottom, 'The entire empty row is inside the visible viewport');
			const link = empty.querySelector<HTMLElement>('.monaco-link')!;
			link.focus();
			link.click();
			assert.ok(link.getBoundingClientRect().bottom <= bottom, 'The setup link remains visible and reachable');
		});
	}

	test('automatic retries retain the warning and update it only on completion', () => {
		const { parent, widget, model, hoverContents } = createWidget();
		const update = (connectionStatus: RemoteAgentHostConnectionStatus, lastConnectionError?: string) => {
			model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? { ...remote, connectionStatus, lastConnectionError } : remote), undefined);
			const warning = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-connection-warning')!;
			return {
				visible: !warning.hidden, hover: hoverContents.get(warning),
				accessible: widget.getAccessibilityContent().includes('Connection error:'),
			};
		};
		assert.deepStrictEqual([
			update(RemoteAgentHostConnectionStatus.disconnected, 'First failure'),
			update(RemoteAgentHostConnectionStatus.connecting, 'First failure'),
			update(RemoteAgentHostConnectionStatus.disconnected, 'Second failure'),
			update(RemoteAgentHostConnectionStatus.reconnecting, 'Second failure'),
			update(RemoteAgentHostConnectionStatus.connected),
			update(RemoteAgentHostConnectionStatus.disconnected),
		], [
			{ visible: true, hover: 'First failure', accessible: true },
			{ visible: true, hover: 'First failure', accessible: true },
			{ visible: true, hover: 'Second failure', accessible: true },
			{ visible: true, hover: 'Second failure', accessible: true },
			{ visible: false, hover: undefined, accessible: false },
			{ visible: false, hover: undefined, accessible: false },
		]);
	});

	for (const width of [1000, 360]) {
		test(`connection warnings stay right-aligned across status changes at width ${width}`, () => {
			const { parent, widget, model } = createWidget();
			parent.style.width = `${width}px`;
			parent.style.setProperty('--vscode-spacing-size100', '10px');
			parent.style.setProperty('--vscode-spacing-size60', '6px');
			widget.layout();
			const positions = [
				RemoteAgentHostConnectionStatus.disconnected,
				RemoteAgentHostConnectionStatus.connecting,
				RemoteAgentHostConnectionStatus.reconnecting,
			].map(connectionStatus => {
				model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? { ...remote, connectionStatus, lastConnectionError: 'Connection refused' } : remote), undefined);
				const cell = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-connection-column')!;
				const warning = cell.querySelector<HTMLElement>('.remotes-connection-warning')!;
				const label = cell.querySelector<HTMLElement>('.remotes-connection-state')!;
				return {
					right: warning.getBoundingClientRect().right,
					inset: cell.getBoundingClientRect().right - warning.getBoundingClientRect().right,
					separated: label.getBoundingClientRect().right < warning.getBoundingClientRect().left,
				};
			});
			assert.deepStrictEqual(positions, positions.map(() => ({ right: positions[0].right, inset: 10, separated: true })));
		});
	}

	test('empty row text hovers are mouse-positioned so they do not cover the wheel target', async () => {
		const { parent, widget, model, mouseHoverTargets } = createWidget();
		model.remotes.set([], undefined);
		widget.setVisible(true);
		await timeout(0);
		const text = [...parent.querySelectorAll<HTMLElement>('.remotes-empty-row .remotes-name, .remotes-empty-row .remotes-empty-description')];
		assert.ok(text.length > 0 && text.every(target => mouseHoverTargets.has(target)));
	});

	test('row actions are left aligned and revealed on hover or keyboard focus', () => {
		const { parent } = createWidget();
		const row = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!.closest<HTMLElement>('.monaco-list-row')!;
		const actions = row.querySelector<HTMLElement>('.remotes-actions-column')!;
		const toolbar = actions.querySelector<HTMLElement>('.monaco-toolbar')!;
		const snapshot = () => ({ opacity: dom.getWindow(toolbar).getComputedStyle(toolbar).opacity, pointerEvents: dom.getWindow(toolbar).getComputedStyle(toolbar).pointerEvents });
		const idle = snapshot();
		row.classList.add('hovered');
		const hovered = snapshot();
		row.classList.remove('hovered');
		getConnectionAction(parent, 'ssh:build').focus();
		const focused = snapshot();
		assert.deepStrictEqual({ idle, hovered, focused, alignment: dom.getWindow(actions).getComputedStyle(actions).justifyContent }, {
			idle: { opacity: '0', pointerEvents: 'none' },
			hovered: { opacity: '1', pointerEvents: 'auto' },
			focused: { opacity: '1', pointerEvents: 'auto' },
			alignment: 'flex-start',
		});
	});

	test('eye action hides and restores a remote without changing its connection or keyboard focus', async () => {
		const { parent, model, widget } = createWidget();
		const row = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!;
		row.click();
		const action = row.querySelector<HTMLElement>('.remotes-gutter-column [role="button"]')!;
		const before = { label: action.getAttribute('aria-label'), icon: action.classList.contains('codicon-eye') };
		action.focus();
		action.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		for (const type of ['keydown', 'keyup']) {
			action.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		await timeout(0);
		const hidden = {
			label: action.getAttribute('aria-label'), icon: action.classList.contains('codicon-eye-closed'),
			dimmed: row.classList.contains('remotes-row-hidden'), focused: dom.getActiveElement() === action,
			connection: row.querySelector('.remotes-connection-state')?.textContent,
			accessible: widget.getAccessibilityContent().includes('Build server (hidden from Environment picker)'),
		};
		widget.setSearchQuery('build');
		widget.setVisible(true);
		await timeout(0);
		const retained = parent.querySelectorAll('[data-remote-id="ssh:build"]').length;
		const show = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-gutter-column [role="button"]')!;
		show.click();
		await timeout(0);
		assert.deepStrictEqual({
			before, hidden, retained,
			restored: model.remotes.get().find(remote => remote.id === 'ssh:build')?.hidden,
			visibilityChanges: model.visibilityChanges, connectionChanges: model.connectionChanges, managementChanges: model.managementChanges,
		}, {
			before: { label: 'Hide Build server from Environment Picker', icon: true },
			hidden: { label: 'Show Build server in Environment Picker', icon: true, dimmed: true, focused: true, connection: 'Connected', accessible: true },
			retained: 1, restored: false,
			visibilityChanges: [{ id: 'ssh:build', hidden: true }, { id: 'ssh:build', hidden: false }],
			connectionChanges: [], managementChanges: [],
		});
	});

	test('shown and hidden eligible remotes keep their eye visible at rest without exposing other actions', () => {
		const { parent, model } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:online', kind: 'environment', name: 'Online host', detail: 'online', canRemove: false,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
		}], undefined);
		const row = parent.querySelector<HTMLElement>('[data-remote-id]')!;
		const toolbar = row.querySelector<HTMLElement>('.remotes-gutter-column .monaco-toolbar')!;
		const idle = dom.getWindow(toolbar).getComputedStyle(toolbar).opacity;
		row.querySelector<HTMLElement>('.remotes-gutter-column [role="button"]')!.click();
		assert.deepStrictEqual({
			idle, hiddenOpacity: dom.getWindow(toolbar).getComputedStyle(toolbar).opacity,
			connectionActionsOpacity: dom.getWindow(toolbar).getComputedStyle(row.querySelector('.remotes-actions-column .monaco-toolbar')!).opacity,
			connection: row.querySelector('.remotes-connection-state')?.textContent,
			visibilityChanges: model.visibilityChanges, connectionChanges: model.connectionChanges,
		}, { idle: '1', hiddenOpacity: '1', connectionActionsOpacity: '0', connection: 'Disconnected', visibilityChanges: [{ id: 'environment:online', hidden: true }], connectionChanges: [] });
	});

	for (const hidden of [false, true]) {
		test(`unavailable remotes explain their absence instead of offering a visibility toggle (hidden: ${hidden})`, () => {
			const { parent, model, widget } = createWidget(OperatingSystem.Windows);
			const remote: ICustomizationRemote = {
				id: 'wsl:Debian', kind: 'wsl', name: 'Debian', detail: 'Debian', canRemove: false, hidden,
				connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
				pickerUnavailableReason: 'Connect once to add this remote to the picker.',
			};
			model.remotes.set([remote], undefined);
			const row = parent.querySelector<HTMLElement>('[data-remote-id]')!;
			const action = row.querySelector<HTMLElement>('.remotes-gutter-column [role="button"]')!;
			const unavailable = {
				label: action.getAttribute('aria-label'), disabled: action.getAttribute('aria-disabled'),
				icon: action.classList.contains('codicon-eye-closed'),
				opacity: dom.getWindow(action).getComputedStyle(action.closest('.monaco-toolbar')!).opacity,
				accessible: widget.getAccessibilityContent().includes('not shown in Environment picker: Connect once'),
			};
			action.click();
			for (const key of [{ key: 'Enter', keyCode: 13 }, { key: ' ', keyCode: 32 }]) {
				for (const type of ['keydown', 'keyup']) {
					action.dispatchEvent(new KeyboardEvent(type, { ...key, bubbles: true, cancelable: true }));
				}
			}
			model.remotes.set([{ ...remote, pickerUnavailableReason: undefined }], undefined);
			assert.deepStrictEqual({
				unavailable,
				restored: {
					label: action.getAttribute('aria-label'), disabled: action.getAttribute('aria-disabled'),
					unavailableClass: row.classList.contains('remotes-row-picker-unavailable'),
				},
				visibilityChanges: model.visibilityChanges, connectionChanges: model.connectionChanges,
			}, {
				unavailable: {
					label: 'Debian is not shown in the Environment picker. Connect once to add this remote to the picker.',
					disabled: 'true', icon: true, opacity: '1', accessible: true,
				},
				restored: {
					label: hidden ? 'Show Debian in Environment Picker' : 'Hide Debian from Environment Picker',
					disabled: null, unavailableClass: false,
				},
				visibilityChanges: [], connectionChanges: [],
			});
		});
	}

	test('group keyboard collapse and expansion preserves rows through refresh', () => {
		const { parent, model } = createWidget();
		const list = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
		list.focus();
		const shown = () => parent.querySelectorAll('[data-remote-id="tunnel:laptop"]').length;
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

	test('environment and deletable tunnel rows offer Delete, including after refresh', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: true,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
		}], undefined);
		const actions = () => [...parent.querySelectorAll('[data-remote-id]')].map(row =>
			[...row.querySelectorAll('.remotes-actions-column [role="button"]')].map(action => action.getAttribute('aria-label')));
		const before = actions();
		widget.setVisible(true);
		await timeout(0);
		const expected = [
			['Connect to Desktop', 'Rename Desktop...', 'Copy Address of Desktop', 'Delete Desktop'],
			['Connect to Laptop', 'Rename Laptop...', 'Copy Address of Laptop', 'Change Preferred Agent Location for Laptop', 'Delete Laptop'],
			['Connect to Ubuntu', 'Rename Ubuntu...', 'Copy Address of Ubuntu'],
			['Disconnect Build server', 'Rename Build server...', 'Copy Address of Build server', 'Change Preferred Agent Location for Build server'],
		];
		assert.deepStrictEqual({ before, after: actions(), changes: model.managementChanges }, { before: expected, after: expected, changes: [] });
	});

	test('Delete works offline, prevents duplicate actions and restores keyboard focus', async () => {
		const { parent, model } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: true,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Offline',
		}], undefined);
		const control = getManagementAction(parent, 'environment:desktop', 'delete');
		control.focus();
		control.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		model.pendingManagement = new DeferredPromise<void>();
		for (const type of ['keydown', 'keyup']) {
			control.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		assert.deepStrictEqual(model.managementChanges, [{ id: 'environment:desktop', action: 'remove' }]);
		control.click();
		const busy = {
			deletion: control.getAttribute('aria-disabled'),
			rename: getManagementAction(parent, 'environment:desktop', 'rename').getAttribute('aria-disabled'),
		};
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			busy, changes: model.managementChanges,
			remaining: parent.querySelector('[data-remote-id="environment:desktop"]') !== null,
			focused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { busy: { deletion: 'true', rename: 'true' }, changes: [{ id: 'environment:desktop', action: 'remove' }], remaining: false, focused: true });
	});

	test('tunnel Delete is keyboard accessible, distinct from Remove and guarded while pending', async () => {
		const { parent, model } = createWidget();
		const row = parent.querySelector('[data-remote-id="tunnel:laptop"]')!;
		const location = row.querySelector<HTMLElement>('.codicon-server-process')!;
		location.focus();
		location.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		location.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		const deletion = row.querySelector<HTMLElement>('.codicon-trash')!;
		assert.strictEqual(dom.getActiveElement(), deletion);
		model.pendingManagement = new DeferredPromise<void>();
		for (const type of ['keydown', 'keyup']) {
			deletion.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		deletion.click();
		const disabled = deletion.getAttribute('aria-disabled');
		row.querySelector<HTMLElement>('.codicon-copy')!.click();
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			disabled, deleted: model.tunnelDeletions, removed: model.managementChanges, copied: model.copiedAddresses,
			present: !!parent.querySelector('[data-remote-id="tunnel:laptop"]'),
			focused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { disabled: 'true', deleted: ['tunnel:laptop'], removed: [], copied: ['tunnel:laptop'], present: false, focused: true });
	});

	test('failed tunnel deletion reports the error and keeps Delete available for retry', async () => {
		const { parent, model, errors } = createWidget();
		const deletion = parent.querySelector<HTMLElement>('[data-remote-id="tunnel:laptop"] .codicon-trash')!;
		model.pendingManagement = new DeferredPromise<void>();
		deletion.click();
		const error = new Error('Tunnel deletion forbidden');
		await model.pendingManagement.error(error);
		await timeout(0);
		assert.deepStrictEqual({ errors, enabled: deletion.getAttribute('aria-disabled'), deleted: model.tunnelDeletions }, {
			errors: [error], enabled: null, deleted: ['tunnel:laptop'],
		});
	});

	test('tunnel Delete tracks deletion capability independently of local removal', () => {
		const { parent, model } = createWidget();
		const remote = model.remotes.get().find(remote => remote.kind === 'tunnel')!;
		const states = [false, true, false].map(canDelete => {
			model.remotes.set([{ ...remote, canDelete }], undefined);
			return !!parent.querySelector('[data-remote-id="tunnel:laptop"] .codicon-trash');
		});
		assert.deepStrictEqual(states, [false, true, false]);
	});

	test('SSH Delete appears only for eligible saved hosts and is keyboard accessible', async () => {
		const { parent, model } = createWidget();
		const ssh = model.remotes.get().find(remote => remote.kind === 'ssh')!;
		const configuredDelete = !!parent.querySelector('[data-remote-id="ssh:build"] .codicon-trash');
		model.remotes.set([{ ...ssh, canDelete: true }], undefined);
		const row = parent.querySelector('[data-remote-id="ssh:build"]')!;
		const location = row.querySelector<HTMLElement>('.codicon-server-process')!;
		location.focus();
		location.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		location.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		const deletion = row.querySelector<HTMLElement>('.codicon-trash')!;
		assert.strictEqual(dom.getActiveElement(), deletion);
		model.pendingManagement = new DeferredPromise<void>();
		for (const type of ['keydown', 'keyup']) {
			deletion.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		deletion.click();
		const busy = deletion.getAttribute('aria-disabled');
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			configuredDelete, busy, deleted: model.sshDeletions, removed: model.managementChanges,
			present: !!parent.querySelector('[data-remote-id="ssh:build"]'),
			focused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { configuredDelete: false, busy: 'true', deleted: ['ssh:build'], removed: [], present: false, focused: true });
	});

	test('SSH Delete disappears when the host becomes configured again', () => {
		const { parent, model } = createWidget();
		const ssh = model.remotes.get().find(remote => remote.kind === 'ssh')!;
		const states = [true, false].map(canDelete => {
			model.remotes.set([{ ...ssh, canDelete }], undefined);
			return !!parent.querySelector('[data-remote-id="ssh:build"] .codicon-trash');
		});
		assert.deepStrictEqual(states, [true, false]);
	});

	test('Copy Address works on every visible remote without changing connections or focus', async () => {
		const { parent, model } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:offline', name: 'Offline', kind: 'environment', detail: 'host', canRemove: true,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Offline',
		}], undefined);
		const buttons = [...parent.querySelectorAll<HTMLElement>('[data-remote-id] .remotes-actions-column .codicon-copy')];
		const ids = buttons.map(button => button.closest<HTMLElement>('[data-remote-id]')!.dataset.remoteId);
		for (const button of buttons) {
			button.focus();
			button.click();
			await timeout(0);
			assert.strictEqual(dom.getActiveElement(), button);
		}
		assert.deepStrictEqual({ copied: model.copiedAddresses, connections: model.connectionChanges }, { copied: ids, connections: [] });
	});

	for (const id of ['ssh:build', 'tunnel:laptop']) {
		test(`${id} location action is keyboard accessible and guards duplicate requests while copying stays available`, async () => {
			const { parent, model } = createWidget();
			const row = parent.querySelector(`[data-remote-id="${id}"]`)!;
			const copy = row.querySelector<HTMLElement>('.codicon-copy')!;
			const location = row.querySelector<HTMLElement>('.codicon-server-process')!;
			copy.focus();
			copy.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
			copy.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
			assert.strictEqual(dom.getActiveElement(), location);
			model.pendingManagement = new DeferredPromise<void>();
			for (const type of ['keydown', 'keyup']) {
				location.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			}
			location.click();
			const busy = location.getAttribute('aria-disabled');
			copy.click();
			await model.pendingManagement.complete();
			await timeout(0);
			assert.deepStrictEqual({
				busy, enabled: location.getAttribute('aria-disabled'), calls: model.locationChanges, copied: model.copiedAddresses,
			}, { busy: 'true', enabled: null, calls: [id], copied: [id] });
		});
	}

	test('Update Server follows advertised capability as a row changes status', () => {
		const { parent, model } = createWidget();
		const remote = model.remotes.get()[0];
		const statuses = [
			RemoteAgentHostConnectionStatus.disconnected,
			RemoteAgentHostConnectionStatus.incompatible('Too old', ['1']),
			RemoteAgentHostConnectionStatus.incompatible('Too old', ['1'], ['2'], 'vendor/update'),
			RemoteAgentHostConnectionStatus.connecting,
			RemoteAgentHostConnectionStatus.connected,
		];
		const labels = statuses.map(connectionStatus => {
			model.remotes.set([{ ...remote, connectionStatus }], undefined);
			return parent.querySelector('.remotes-actions-column .codicon-cloud-download')?.getAttribute('aria-label') ?? null;
		});
		assert.deepStrictEqual(labels, [null, null, 'Update Server for Build server', null, null]);
	});

	test('Update Server supports keyboard activation, blocks duplicates and restores focus when it disappears', async () => {
		const { parent, model } = createWidget();
		model.remotes.set([{
			...model.remotes.get()[0],
			connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Too old', ['1'], undefined, 'vendor/update'),
		}], undefined);
		const location = parent.querySelector<HTMLElement>('.remotes-actions-column .codicon-server-process')!;
		location.focus();
		location.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		location.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		const update = parent.querySelector<HTMLElement>('.remotes-actions-column .codicon-cloud-download')!;
		assert.strictEqual(dom.getActiveElement(), update);
		model.pendingManagement = new DeferredPromise<void>();
		for (const type of ['keydown', 'keyup']) {
			update.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		update.click();
		const busy = update.getAttribute('aria-disabled');
		parent.querySelector<HTMLElement>('.remotes-actions-column .codicon-copy')!.click();
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			busy, updates: model.serverUpdates, copies: model.copiedAddresses,
			present: !!parent.querySelector('.remotes-actions-column .codicon-cloud-download'),
			focused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { busy: 'true', updates: ['ssh:build'], copies: ['ssh:build'], present: false, focused: true });
	});

	test('failed Update Server reports the error and re-enables the action', async () => {
		const { parent, model, errors } = createWidget();
		model.remotes.set([{
			...model.remotes.get()[0],
			connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Too old', ['1'], undefined, 'vendor/update'),
		}], undefined);
		const update = parent.querySelector<HTMLElement>('.remotes-actions-column .codicon-cloud-download')!;
		model.pendingManagement = new DeferredPromise<void>();
		update.click();
		const error = new Error('Cannot update server');
		await model.pendingManagement.error(error);
		await timeout(0);
		assert.deepStrictEqual({ errors, enabled: update.getAttribute('aria-disabled'), updates: model.serverUpdates }, {
			errors: [error], enabled: null, updates: ['ssh:build'],
		});
	});

	test('new inline actions report failures and location changes re-enable for retry', async () => {
		const { parent, model, errors } = createWidget();
		const row = parent.querySelector('[data-remote-id="tunnel:laptop"]')!;
		const copyError = new Error('Clipboard unavailable');
		const locationError = new Error('Cannot save preference');
		model.copyFailure = copyError;
		row.querySelector<HTMLElement>('.codicon-copy')!.click();
		model.pendingManagement = new DeferredPromise<void>();
		const location = row.querySelector<HTMLElement>('.codicon-server-process')!;
		location.click();
		await model.pendingManagement.error(locationError);
		await timeout(0);
		assert.deepStrictEqual({ errors, enabled: location.getAttribute('aria-disabled') }, { errors: [copyError, locationError], enabled: null });
	});

	test('failed Delete retains the row, reports the error and allows retry', async () => {
		const { parent, model, errors } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: true,
			connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
		model.pendingManagement = new DeferredPromise<void>();
		getManagementAction(parent, 'environment:desktop', 'delete').click();
		const error = new Error('Deletion failed');
		await model.pendingManagement.error(error);
		await timeout(0);
		assert.deepStrictEqual({
			errors,
			disabled: getManagementAction(parent, 'environment:desktop', 'delete').getAttribute('aria-disabled'),
			changes: model.managementChanges,
		}, { errors: [error], disabled: null, changes: [{ id: 'environment:desktop', action: 'remove' }] });
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
		}, { expandedBeforeUpdate: 'false', expanded: 'false', sshRows: 1, rows: 1 });
	});

	test('search matches names, details and groups and filters the accessible view', () => {
		const { parent, widget } = createWidget();
		const matches: string[][] = [];
		for (const query of ['build.example', 'Dev Tunnels', 'no match', '']) {
			widget.setSearchQuery(query);
			matches.push([...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId!));
			if (query === 'Dev Tunnels') {
				assert.ok(!widget.getAccessibilityContent().includes('Build server'));
			}
		}
		assert.deepStrictEqual(matches, [['ssh:build'], ['tunnel:laptop'], [], ['tunnel:laptop', 'ssh:build']]);
	});

	test('search omits empty groups and restores them when cleared, including after inventory changes', async () => {
		const { parent, widget, model } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		const groups = () => [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent);
		widget.setSearchQuery('build');
		const matched = groups();
		const accessible = widget.getAccessibilityContent();
		model.remotes.set(model.remotes.get().filter(remote => remote.kind !== 'ssh'), undefined);
		const removed = groups();
		const noMatches = parent.querySelector('.remotes-message')?.textContent;
		widget.setVisible(true);
		await timeout(0);
		const refreshed = groups();
		widget.setSearchQuery('');
		assert.deepStrictEqual({
			matched, omittedFromAccessibleView: !accessible.includes('Dev Tunnels') && !accessible.includes('GitHub Environments') && !accessible.includes('WSL'),
			removed, noMatches, refreshed, restored: groups(),
		}, {
			matched: ['SSH'], omittedFromAccessibleView: true, removed: [], noMatches: 'No matching remotes.', refreshed: [],
			restored: ['GitHub Environments', 'Dev Tunnels', 'WSL', 'SSH'],
		});
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
		assert.deepStrictEqual({ observed, accessible: widget.getAccessibilityContent().includes('Status: Disconnected') }, {
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
			accessible: widget.getAccessibilityContent().includes('Status: Disconnecting'),
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
				{ group: 'Dev Tunnels', tooltip: 'Could not refresh tunnels. Check your sign-in and network connection. See the Window log for more details.', announced: true },
				{ group: 'SSH', tooltip: 'Could not read your SSH hosts. Check your SSH configuration. See the Window log for more details.', announced: true },
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
			initial: ['Dev Tunnels', 'SSH'], pending: ['Dev Tunnels', 'SSH'], retried: ['Dev Tunnels'], recovered: [],
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
		const beforeRefresh = parent.textContent;
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		refresh.focus();
		refresh.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		for (const type of ['keydown', 'keyup']) {
			refresh.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		const pending = {
			disabled: refresh.getAttribute('aria-disabled'),
			spinning: refresh.classList.contains('codicon-loading') && refresh.classList.contains('codicon-modifier-spin'),
			busy: parent.querySelector('.remotes-table-container')?.getAttribute('aria-busy'),
			sameText: parent.textContent === beforeRefresh,
		};
		refresh.click();
		await model.pendingRefresh.complete([]);
		await timeout(0);
		assert.deepStrictEqual({ idle, pending, completedDisabled: refresh.getAttribute('aria-disabled'), refreshedIcon: refresh.classList.contains('codicon-refresh'), refreshCalls: model.refreshCalls }, {
			idle: { label: 'Refresh', role: 'button', text: '', tabIndex: 0, disabled: null },
			pending: { disabled: 'true', spinning: true, busy: 'true', sameText: true },
			completedDisabled: null,
			refreshedIcon: true,
			refreshCalls: 2,
		});
	});

	test('each section spins after its count only until that section finishes, including collapsed and empty sections', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows);
		model.remotes.set([], undefined);
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const snapshot = () => [...parent.querySelectorAll('.remotes-group-row')].map(row => ({
			name: row.querySelector('.remotes-name')?.textContent,
			busy: row.parentElement?.getAttribute('aria-busy'),
			spinning: !!row.querySelector('.remotes-group-count + .remotes-group-progress:not([hidden]) .codicon-modifier-spin'),
		}));
		const started = snapshot();
		const progress = model.refreshProgress[0];
		progress.report({ kind: 'ssh', refreshing: false, failed: false });
		const partial = snapshot();
		const tunnelGroup = [...parent.querySelectorAll<HTMLElement>('.remotes-group-row')].find(row => row.querySelector('.remotes-name')?.textContent === 'Dev Tunnels')!;
		tunnelGroup.querySelector<HTMLElement>('.remotes-gutter-column [role="button"]')!.click();
		const collapsedSpinner = !!tunnelGroup.querySelector('.remotes-group-progress:not([hidden]) .codicon-modifier-spin');
		const accessible = widget.getAccessibilityContent().includes('Dev Tunnels\nRefreshing.');
		await model.pendingRefresh.complete(['tunnel']);
		await timeout(0);
		assert.deepStrictEqual({ started, partial, collapsedSpinner, accessible, finished: snapshot() }, {
			started: ['Dev Tunnels', 'WSL', 'SSH'].map(name => ({ name, busy: 'true', spinning: true })),
			partial: [
				{ name: 'Dev Tunnels', busy: 'true', spinning: true },
				{ name: 'WSL', busy: 'true', spinning: true },
				{ name: 'SSH', busy: 'false', spinning: false },
			],
			collapsedSpinner: true, accessible: true,
			finished: ['Dev Tunnels', 'WSL', 'SSH'].map(name => ({ name, busy: 'false', spinning: false })),
		});
	});

	test('tunnel failure replaces its spinner with a warning immediately while another section is loading', async () => {
		const { parent, model, widget } = createWidget();
		model.remotes.set([], undefined);
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const groups = () => [...parent.querySelectorAll('.remotes-group-row')].map(row => ({
			name: row.querySelector('.remotes-name')?.textContent,
			spinning: !!row.querySelector('.remotes-group-progress:not([hidden])'),
			warning: !!row.querySelector('.remotes-refresh-warning:not([hidden])'),
		}));
		const waiting = groups();
		model.refreshProgress[0].report({ kind: 'tunnel', refreshing: false, failed: true });
		const partial = {
			groups: groups(), failedMessage: parent.querySelector('.remotes-empty-label')?.textContent,
			accessible: widget.getAccessibilityContent().includes('Could not refresh Dev Tunnels.'),
			globalBusy: parent.querySelector('.remotes-table-container')?.getAttribute('aria-busy'),
		};
		await model.pendingRefresh.complete(['tunnel']);
		await timeout(0);
		assert.deepStrictEqual({ waiting, partial }, {
			waiting: [{ name: 'Dev Tunnels', spinning: true, warning: false }, { name: 'SSH', spinning: true, warning: false }],
			partial: {
				groups: [{ name: 'Dev Tunnels', spinning: false, warning: true }, { name: 'SSH', spinning: true, warning: false }],
				failedMessage: 'Could not refresh Dev Tunnels.', accessible: true, globalBusy: 'true',
			},
		});
	});

	test('canceled refresh progress cannot stop a newer spinner and errors clear all spinners', async () => {
		const { parent, model, widget, errors } = createWidget();
		const first = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const oldProgress = model.refreshProgress[0];
		widget.setVisible(false);
		const spinners = () => parent.querySelectorAll('.remotes-group-progress:not([hidden])').length;
		const canceled = spinners();
		const second = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		oldProgress.report({ kind: 'ssh', refreshing: false, failed: false });
		await first.complete([]);
		await timeout(0);
		const restarted = spinners();
		const error = new Error('Refresh failed');
		await second.error(error);
		await timeout(0);
		assert.deepStrictEqual({ canceled, restarted, failed: spinners(), errors }, { canceled: 0, restarted: 2, failed: 0, errors: [error] });
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
			canceled, spinning: parent.querySelectorAll('.remotes-header-actions .codicon-modifier-spin').length,
			hidden: parent.querySelectorAll('.remotes-refresh-warning:not([hidden])').length,
			accessibleWarning: widget.getAccessibilityContent().includes('Window log'),
		}, { canceled: 0, spinning: 0, hidden: 0, accessibleWarning: false });
	});

	test('the SSH gear opens the user config in a modal without collapsing its node or connecting', async () => {
		const { parent, model, opened, configRequests } = createWidget();
		const gear = parent.querySelector<HTMLElement>('[aria-label="Open SSH Configuration"]')!;
		assert.ok(gear);
		gear.click();
		await timeout(0);
		assert.deepStrictEqual({
			configRequests: configRequests(),
			opened,
			expanded: gear.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
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
		parent.querySelector<HTMLElement>('[aria-label="Open SSH Configuration"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({ opened, errors }, { opened: [], errors: [error] });
	});

	test('the Dev Tunnels gear opens the same settings filter as Manage', async () => {
		const { parent, settings, opened, configRequests } = createWidget();
		parent.querySelector<HTMLElement>('[aria-label="Open Dev Tunnels Settings"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({ settings, opened, configRequests: configRequests() }, {
			settings: [{ query: 'chat.remoteAgentHosts' }], opened: [], configRequests: 0,
		});
	});

	test('GitHub Environments appears only when enabled and offers settings and empty guidance', async () => {
		const { widget, parent, model, settings } = createWidget();
		const groups = () => [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(node => node.textContent);
		const hidden = groups();
		model.environmentsEnabled.set(true, undefined);
		widget.setVisible(true);
		await timeout(0);
		const shown = groups();
		parent.querySelector<HTMLElement>('[aria-label="Open GitHub Environments Settings"]')!.click();
		await timeout(0);
		const guidance = widget.getAccessibilityContent().includes('No GitHub environments available.');
		model.environmentsEnabled.set(false, undefined);
		assert.deepStrictEqual({ hidden, shown, settings, guidance, disabled: groups() }, {
			hidden: ['Dev Tunnels', 'SSH'], shown: ['GitHub Environments', 'Dev Tunnels', 'SSH'],
			settings: [{ query: GitHubEnvironmentsEnabledSettingId }], guidance: true, disabled: ['Dev Tunnels', 'SSH'],
		});
	});

	test('offline environment connection explains its disabled state while Rename and Delete stay available', () => {
		const { parent, model } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'desktop', canRemove: true,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
		}], undefined);
		const connect = getConnectionAction(parent, 'environment:desktop');
		assert.deepStrictEqual({
			connect: connect.getAttribute('aria-label'), disabled: connect.getAttribute('aria-disabled'),
			renameDisabled: getManagementAction(parent, 'environment:desktop', 'rename').getAttribute('aria-disabled'),
			deleteDisabled: getManagementAction(parent, 'environment:desktop', 'delete').getAttribute('aria-disabled'),
		}, {
			connect: 'Connect to Desktop: Start the owning application.', disabled: 'true',
			renameDisabled: null, deleteDisabled: null,
		});
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.connected })), undefined);
		assert.deepStrictEqual({ label: connect.getAttribute('aria-label'), disabled: connect.getAttribute('aria-disabled') }, {
			label: 'Disconnect Desktop', disabled: null,
		});
	});

	test('offline environment shows Offline without an address or info icon and preserves row focus on updates', () => {
		const { parent, model, widget, hoverContents } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
		}], undefined);
		const row = parent.querySelector<HTMLElement>('[data-remote-id="environment:desktop"]')!;
		row.click();
		const table = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
		table.focus();
		const connection = row.querySelector<HTMLElement>('.remotes-connection-state')!;
		const offline = {
			connection: connection.textContent,
			tooltip: hoverContents.get(connection),
			infoIcons: row.querySelectorAll('.codicon-info').length,
			addressColumns: parent.querySelectorAll('.remotes-address-column').length,
			accessibleView: widget.getAccessibilityContent().includes('Desktop. Status: Offline. Start the owning application.'),
		};
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, unavailableReason: undefined })), undefined);
		assert.deepStrictEqual({
			offline,
			available: parent.querySelector('[data-remote-id] .remotes-connection-state')?.textContent,
			tableFocused: dom.getActiveElement() === table,
		}, {
			offline: { connection: 'Offline', tooltip: 'Start the owning application.', infoIcons: 0, addressColumns: 0, accessibleView: true },
			available: 'Disconnected', tableFocused: true,
		});
	});

	test('offline availability does not override an active connection or pending action', async () => {
		const { parent, model } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		const offline: ICustomizationRemote = {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
		};
		const states = [
			offline,
			{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.connected },
			{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.connecting },
			{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.reconnecting },
		];
		const observed = states.map(remote => {
			model.remotes.set([remote], undefined);
			return parent.querySelector('[data-remote-id] .remotes-connection-state')?.textContent;
		});
		model.remotes.set([{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.connected }], undefined);
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, offline.id).click();
		observed.push(parent.querySelector('[data-remote-id] .remotes-connection-state')?.textContent);
		await model.pendingConnection.complete();
		await timeout(0);
		observed.push(parent.querySelector('[data-remote-id] .remotes-connection-state')?.textContent);
		assert.deepStrictEqual(observed, ['Offline', 'Connected', 'Connecting', 'Disconnected', 'Disconnecting', 'Offline']);
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
		const copy = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .codicon-copy')!;
		assert.strictEqual(dom.getActiveElement(), copy);
		copy.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		const location = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .codicon-server-process')!;
		assert.strictEqual(dom.getActiveElement(), location);
		location.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({ changes: model.managementChanges, focused: dom.getActiveElement() === connection }, {
			changes: [{ id: 'ssh:build', action: 'rename' }], focused: true,
		});
	});

	test('the Dev Tunnels gear and setup links follow table focus and support keyboard activation', async () => {
		const { widget, parent, model, configRequests, documentation, settings } = createWidget();
		model.remotes.set([], undefined);
		widget.setVisible(true);
		await timeout(0);
		const table = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
		table.focus();
		const gear = parent.querySelector<HTMLElement>('[aria-label="Open Dev Tunnels Settings"]')!;
		const info = gear.closest('.remotes-group-row')!.querySelector<HTMLElement>('.codicon-info')!;
		const initialInfoTabIndex = info.tabIndex;
		info.focus();
		info.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		info.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		const gearReached = dom.getActiveElement() === gear;
		gear.focus();
		gear.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		for (const type of ['keydown', 'keyup']) {
			gear.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		await timeout(0);
		table.focus();
		const emptyRow = [...parent.querySelectorAll('.remotes-empty-row')].find(row => row.textContent?.includes('No dev tunnels found for this account.'))!;
		emptyRow.querySelector('.remotes-empty-label')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		const link = emptyRow.querySelector<HTMLElement>('.remotes-empty-actions .monaco-link')!;
		const focusedLinkTabIndex = link.tabIndex;
		link.focus();
		link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			initialInfoTabIndex, gearReached, focusedGearTabIndex: gear.tabIndex, focusedLinkTabIndex, configRequests: configRequests(), documentation, settings,
			expanded: gear.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
		}, {
			initialInfoTabIndex: 0, gearReached: true, focusedGearTabIndex: -1, focusedLinkTabIndex: 0, configRequests: 0,
			documentation: ['https://aka.ms/vscode-agent-tunnel'], settings: [{ query: 'chat.remoteAgentHosts' }],
			expanded: 'true',
		});
	});

	test('search actions are vertically centered inside wide and narrow search fields', () => {
		const { widget, parent } = createWidget();
		for (const width of [900, 360]) {
			parent.style.width = `${width}px`;
			widget.layout();
			const search = parent.querySelector<HTMLElement>('.remotes-search-container .monaco-inputbox')!;
			const inputBounds = search.getBoundingClientRect();
			for (const action of search.querySelectorAll<HTMLElement>('[role="button"]')) {
				const bounds = action.getBoundingClientRect();
				const offset = bounds.top + bounds.height / 2 - inputBounds.top - inputBounds.height / 2;
				assert.ok(Math.abs(offset) < 0.5, `${action.getAttribute('aria-label')} is offset by ${offset}px at width ${width}`);
			}
		}
	});

	test('search actions clear and collapse without changing connections or clearing the query on collapse', async () => {
		const { widget, parent, model } = createWidget();
		const input = parent.querySelector<HTMLInputElement>('input')!;
		const clear = parent.querySelector<HTMLElement>('.remotes-search-container .codicon-clear-all')!;
		const collapse = parent.querySelector<HTMLElement>('.remotes-search-container .codicon-collapse-all')!;
		const initial = { clear: clear.getAttribute('aria-disabled'), collapse: collapse.getAttribute('aria-disabled') };
		widget.setSearchQuery('build');
		collapse.click();
		const collapsed = { query: input.value, rows: parent.querySelectorAll('[data-remote-id]').length, disabled: collapse.getAttribute('aria-disabled') };
		clear.focus();
		clear.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		for (const type of ['keydown', 'keyup']) {
			clear.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		const cleared = { query: input.value, focus: dom.getActiveElement() === input, disabled: clear.getAttribute('aria-disabled') };
		widget.setSearchQuery('missing');
		const noGroups = collapse.getAttribute('aria-disabled');
		widget.setSearchQuery('laptop');
		widget.setVisible(true);
		await timeout(0);
		assert.deepStrictEqual({ initial, collapsed, cleared, noGroups, searchRetained: input.value, connections: model.connectionChanges }, {
			initial: { clear: 'true', collapse: null }, collapsed: { query: 'build', rows: 0, disabled: 'true' },
			cleared: { query: '', focus: true, disabled: 'true' }, noGroups: 'true', searchRetained: 'laptop', connections: [],
		});
	});

	for (const hasCachedTunnels of [false, true]) {
		test(`tunnel authentication recovery replaces generic error copy and refreshes after keyboard sign-in (cached: ${hasCachedTunnels})`, async () => {
			const { widget, parent, model, errors, documentation } = createWidget();
			parent.style.setProperty('--vscode-codiconFontSize-compact', '12px');
			if (!hasCachedTunnels) {
				model.remotes.set([], undefined);
			}
			model.tunnelAuthenticationRequired.set('github', undefined);
			model.failedKinds = ['tunnel'];
			widget.setVisible(true);
			await timeout(0);
			const authRow = [...parent.querySelectorAll<HTMLElement>('.monaco-list-row')].find(row => row.textContent?.includes('Sign in to allow access'))!;
			authRow.click();
			const link = authRow.querySelector<HTMLElement>('.remotes-empty-signin .monaco-link')!;
			const before = {
				copy: authRow.querySelector('.remotes-name')?.textContent, warnings: parent.querySelectorAll('.remotes-refresh-warning:not([hidden])').length,
				genericError: parent.textContent?.includes('Could not refresh Dev Tunnels.'), tabbable: link.tabIndex,
				cached: parent.querySelectorAll('[data-remote-id="tunnel:laptop"]').length,
				accessible: widget.getAccessibilityContent().includes('Sign In'),
				spinners: authRow.querySelectorAll('.remotes-signin-progress:not([hidden])').length,
			};
			model.pendingSignIn = new DeferredPromise<void>();
			link.focus();
			link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			link.click();
			const spinner = authRow.querySelector<HTMLElement>('.monaco-link + .remotes-signin-progress')!;
			const busy = {
				disabled: link.getAttribute('aria-disabled'), rowBusy: authRow.getAttribute('aria-busy'),
				spinning: !spinner.hidden && spinner.classList.contains('codicon-modifier-spin'),
				size: dom.getWindow(spinner).getComputedStyle(spinner).fontSize,
			};
			await model.pendingSignIn.complete();
			await timeout(0);
			assert.deepStrictEqual({ before, busy, calls: model.signInCalls, refreshes: model.refreshCalls, signInLinks: parent.querySelectorAll('.remotes-empty-signin:not([hidden])').length, remainingSpinners: parent.querySelectorAll('.remotes-signin-progress:not([hidden])').length, errors, documentation }, {
				before: { copy: 'Sign in to allow access to your tunnels.', warnings: 0, genericError: false, tabbable: 0, cached: hasCachedTunnels ? 1 : 0, accessible: true, spinners: 0 },
				busy: { disabled: 'true', rowBusy: 'true', spinning: true, size: '12px' }, calls: 1, refreshes: 2, signInLinks: 0, remainingSpinners: 0, errors: [], documentation: [],
			});
		});
	}

	for (const outcome of ['cancel', 'failure', 'dispose'] as const) {
		test(`tunnel sign-in handles ${outcome} without a late refresh or silent errors`, async () => {
			const { widget, parent, model, errors } = createWidget();
			model.tunnelAuthenticationRequired.set('github', undefined);
			model.pendingSignIn = new DeferredPromise<void>();
			widget.setVisible(true);
			await timeout(0);
			parent.querySelector<HTMLElement>('.remotes-empty-signin .monaco-link')!.click();
			const error = outcome === 'cancel' ? new CancellationError() : new Error('Sign-in failed');
			if (outcome === 'dispose') {
				widget.dispose();
				await model.pendingSignIn.complete();
			} else {
				await model.pendingSignIn.error(error);
			}
			await timeout(0);
			assert.deepStrictEqual({ calls: model.signInCalls, refreshes: model.refreshCalls, errors, spinners: parent.querySelectorAll('.remotes-signin-progress:not([hidden])').length, retryEnabled: outcome === 'dispose' ? undefined : parent.querySelector('.remotes-empty-signin .monaco-link')?.getAttribute('aria-disabled') }, {
				calls: 1, refreshes: 1, errors: outcome === 'failure' ? [error] : [], spinners: 0, retryEnabled: outcome === 'dispose' ? undefined : 'false',
			});
		});
	}

	test('section info actions open the same setup links for populated, collapsed, and empty groups', async () => {
		const { widget, parent, model, documentation } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'desktop', canRemove: false,
			connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
		const openInfo = () => {
			for (const action of parent.querySelectorAll<HTMLElement>('.remotes-group-row .remotes-actions-column .codicon-info')) {
				action.click();
			}
		};
		openInfo();
		for (const action of parent.querySelectorAll<HTMLElement>('.remotes-gutter-column .codicon-chevron-down')) {
			action.click();
		}
		openInfo();
		for (const action of parent.querySelectorAll<HTMLElement>('.remotes-gutter-column .codicon-chevron-right')) {
			action.click();
		}
		model.remotes.set([], undefined);
		widget.setVisible(true);
		await timeout(0);
		openInfo();
		for (const link of parent.querySelectorAll<HTMLElement>('.remotes-empty-actions .monaco-link')) {
			link.click();
		}
		assert.deepStrictEqual(documentation, Array.from({ length: 4 }, () => [
			'https://aka.ms/vscode-agent-environments', 'https://aka.ms/vscode-agent-tunnel', 'https://aka.ms/vscode-agent-wsl', 'https://aka.ms/vscode-agent-ssh',
		]).flat());
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
			labels: ['No dev tunnels found for this account.', 'No WSL 2 distributions found.', 'No SSH hosts configured.'],
			counts: ['0', '0', '0'],
			documentation: [
				'https://aka.ms/vscode-agent-tunnel',
				'https://aka.ms/vscode-agent-wsl',
				'https://aka.ms/vscode-agent-ssh',
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
		assert.deepStrictEqual({ loading, refreshed, filtered: labels(), message: parent.querySelector('.remotes-message')?.textContent, setupLinks: parent.querySelectorAll('.remotes-empty-actions:not([hidden]) .monaco-link').length }, {
			loading: [],
			refreshed: ['Could not refresh Dev Tunnels.', 'No SSH hosts configured.'],
			filtered: [], message: 'No matching remotes.',
			setupLinks: 0,
		});
	});
});
