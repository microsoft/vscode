/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { assignHostSandboxProfile } from '../../../../../../../platform/agentHost/common/sandboxProfiles.js';
import { useFakeTimers } from 'sinon';
import * as dom from '../../../../../../../base/browser/dom.js';
import '../../../../../../../base/browser/ui/codicons/codiconStyles.js';
import '../../../../../../browser/media/style.css';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { ActionRunner, IAction, Separator, SubmenuAction } from '../../../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../../base/common/errors.js';
import { combinedDisposable, Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { isWindows, OperatingSystem } from '../../../../../../../base/common/platform.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IContextMenuService } from '../../../../../../../platform/contextview/browser/contextView.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { RemoteAgentHostLocationPreference } from '../../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { GitHubEnvironmentsEnabledSettingId } from '../../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IClipboardService } from '../../../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../../../platform/clipboard/test/common/testClipboardService.js';
import { MANAGE_EXTENSION_COMMAND_ID } from '../../../../../../../platform/extensions/common/extensions.js';
import { INotification, INotificationActions, INotificationService, NoOpNotification } from '../../../../../../../platform/notification/common/notification.js';
import { IProgress } from '../../../../../../../platform/progress/common/progress.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostSandboxConfigKey } from '../../../../../../../platform/agentHost/common/sandboxConfigSchema.js';
import { TestSandboxProfilesHost } from '../../../../../../../platform/agentHost/test/common/sandboxProfilesTestUtils.js';
import { SeparatorSelectOption } from '../../../../../../../base/browser/ui/selectBox/selectBox.js';
import { ISandboxProfile, readSandboxProfiles, writeSandboxProfiles } from '../../../../../../../platform/sandbox/common/sandboxProfiles.js';
import { AgentSandboxSettingId } from '../../../../../../../platform/sandbox/common/settings.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IStorageService, StorageScope } from '../../../../../../../platform/storage/common/storage.js';
import { getIconsStyleSheet } from '../../../../../../../platform/theme/browser/iconsStyleSheet.js';
import { IResourceEditorInput } from '../../../../../../../platform/editor/common/editor.js';
import { IEditorService, MODAL_GROUP, PreferredGroup } from '../../../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../services/preferences/common/preferences.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ICustomizationRemote, IRemoteRefreshProgress, IRemotesModel, IRemoteTroubleshootingInfo, RemoteKind, remoteKinds } from '../../browser/remotesModel.js';
import { RemotesWidget } from '../../browser/remotesWidget.js';
import { IConnectionDiagnosticsService } from '../../browser/connectionDiagnostics.js';
import { ISessionsService } from '../../../../browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../browser/sessionsProvidersService.js';
import { INewSessionComposer, INewSessionComposerService } from '../../../../browser/newSessionComposerService.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';

class TestRemotesModel extends Disposable implements IRemotesModel {
	readonly onDidChangeTroubleshootingInfo: IRemotesModel['onDidChangeTroubleshootingInfo'] = () => Disposable.None;
	readonly environmentsEnabled = observableValue(this, false);
	readonly canCreateDevContainer = observableValue(this, false);
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
		{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', canRemove: true, copyableAddress: 'build', availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected },
		{ id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu', canRemove: true, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		{ id: 'tunnel:laptop', kind: 'tunnel', name: 'Laptop', detail: 'work-laptop', canRemove: false, canDelete: true, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
	]);
	readonly managementChanges: { id: string; action: 'rename' | 'remove' }[] = [];
	readonly connectionChanges: { id: string; connected: boolean }[] = [];
	readonly visibilityChanges: { id: string; hidden: boolean }[] = [];
	readonly copiedAddresses: string[] = [];
	readonly locationChanges: string[] = [];
	readonly serverUpdates: string[] = [];
	readonly gitHubEnvironmentChanges: { id: string; shared: boolean }[] = [];
	readonly tunnelDeletions: string[] = [];
	readonly sshDeletions: string[] = [];
	readonly devContainerCreations: (string | undefined)[] = [];
	readonly devContainerDeletions: string[] = [];
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

	readonly preferences = new Map<string, RemoteAgentHostLocationPreference>();
	getPreferredAgentLocation(id: string): RemoteAgentHostLocationPreference | undefined { return this.preferences.get(id); }
	async changePreferredAgentLocation(id: string, preference?: RemoteAgentHostLocationPreference): Promise<'saved' | 'reconnected'> {
		this.locationChanges.push(id);
		await this.pendingManagement?.p;
		if (preference) {
			this.preferences.set(id, preference);
		}
		return RemoteAgentHostConnectionStatus.isConnected(this.remotes.get().find(remote => remote.id === id)?.connectionStatus) ? 'reconnected' : 'saved';
	}

	async updateServer(id: string): Promise<void> {
		this.serverUpdates.push(id);
		await this.pendingManagement?.p;
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, connectionStatus: RemoteAgentHostConnectionStatus.connected, canUpdateServer: undefined } : remote), undefined);
	}

	async setSharedAsGitHubEnvironment(id: string, shared: boolean): Promise<void> {
		this.gitHubEnvironmentChanges.push({ id, shared });
		await this.pendingManagement?.p;
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, gitHubEnvironment: shared ? { state: 'enabled' } : undefined } : remote), undefined);
	}

	deletionFailure: Error | undefined;
	async deleteTunnel(id: string): Promise<void> {
		this.tunnelDeletions.push(id);
		await this.pendingManagement?.p;
		if (this.deletionFailure) {
			throw this.deletionFailure;
		}
		this.remotes.set(this.remotes.get().filter(remote => remote.id !== id), undefined);
	}

	async deleteSSHHost(id: string): Promise<void> {
		this.sshDeletions.push(id);
		await this.pendingManagement?.p;
		this.remotes.set(this.remotes.get().filter(remote => remote.id !== id), undefined);
	}

	async createDevContainer(id?: string): Promise<void> {
		this.devContainerCreations.push(id);
		await this.pendingManagement?.p;
		const host = id ?? 'local';
		this.remotes.set([...this.remotes.get(), {
			id: `devcontainer:${host}:${this.remotes.get().length}`, kind: 'devContainer', name: 'Dev Container', detail: host, description: host,
			canRemove: false, canDelete: true, availability: 'unknown', connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
	}

	async deleteDevContainer(id: string): Promise<void> {
		this.devContainerDeletions.push(id);
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
		if (this.connectionFailure) {
			const error = this.connectionFailure;
			this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, lastConnectionError: error.message } : remote), undefined);
			throw error;
		}
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? {
			...remote, canRemove: connected, lastConnectionError: undefined,
			connectionStatus: connected ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected,
		} : remote), undefined);
	}

	connectionFailure: Error | undefined;
	troubleshootingInfo: IRemoteTroubleshootingInfo = {};
	readonly troubleshootingActions: string[] = [];
	async getTroubleshootingInfo(_id: string): Promise<IRemoteTroubleshootingInfo> {
		return this.troubleshootingInfo;
	}

	async forgetSSHHostKey(id: string): Promise<void> {
		this.troubleshootingActions.push(`forgetSSHHostKey:${id}`);
		this.troubleshootingInfo = { ...this.troubleshootingInfo, ssh: { ...this.troubleshootingInfo.ssh, hasSavedHostKey: false } };
	}

	async restartWSLDistribution(id: string): Promise<void> {
		this.troubleshootingActions.push(`restartWSLDistribution:${id}`);
		await this.setConnected(id, true);
	}

	async showConnectionLog(id: string): Promise<void> {
		this.troubleshootingActions.push(`showConnectionLog:${id}`);
	}
}

type MenuAnchor = ReturnType<Parameters<IContextMenuService['showContextMenu']>[0]['getAnchor']>;

class TestRemotesWidget extends RemotesWidget {
	focusFirstRow(): void {
		this.table.focusFirst();
	}

	scrollToBottom(): void {
		this.table.scrollTop = this.table.scrollHeight;
	}
}

suite('RemotesWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const menus = new WeakMap<HTMLElement, () => readonly IAction[]>();
	const menuAnchors = new WeakMap<HTMLElement, () => MenuAnchor | undefined>();

	function createWidget(operatingSystem = OperatingSystem.Macintosh, grouping: 'status' | 'type' | 'default' = 'type', width = 900, storageService?: IStorageService) {
		const parent = dom.append(document.body, dom.$('div'));
		parent.style.width = `${width}px`;
		parent.style.height = '640px';
		store.add(toDisposable(() => parent.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(AgentSandboxSettingId.AgentSandboxProfilesEnabled, true);
		if (storageService) {
			instantiationService.stub(IStorageService, storageService);
		}
		let menuActions: readonly IAction[] = [];
		let menuAnchor: MenuAnchor | undefined;
		instantiationService.stub(IContextMenuService, 'showContextMenu', (delegate: Parameters<IContextMenuService['showContextMenu']>[0]) => {
			menuActions = delegate.getActions?.() ?? [];
			menuAnchor = delegate.getAnchor();
			delegate.onHide?.(true);
		});
		menus.set(parent, () => {
			const actions = menuActions;
			menuActions = [];
			return actions;
		});
		menuAnchors.set(parent, () => menuAnchor);
		const errors: Parameters<INotificationService['error']>[0][] = [];
		const hoverContents = new Map<HTMLElement, string>();
		const mouseHoverTargets = new Set<HTMLElement>();
		const opened: { input: IResourceEditorInput; group: PreferredGroup | undefined }[] = [];
		const commands: (string | readonly string[])[] = [];
		instantiationService.stub(ICommandService, { executeCommand: async (id: string, ...args: string[]) => { commands.push(args.length ? [id, ...args] : id); } });
		const sessionActions: string[] = [];
		const activeComposer = observableValue<INewSessionComposer | undefined>('composer', upcastPartial<INewSessionComposer>({
			selectEnvironment: async providerId => { sessionActions.push(providerId); },
		}));
		instantiationService.stub(INewSessionComposerService, { activeComposer });
		instantiationService.stub(ISessionsService, {
			openNewSession: async () => {
				sessionActions.push('open');
				return { session: undefined, trustDeclined: false };
			},
			focusActiveSession: () => { sessionActions.push('focus'); },
		});
		instantiationService.stub(ISessionsProvidersService, {
			getProviders: () => [
				upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-remote-build', remoteAddress: 'ssh:build' }),
			]
		});
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
		const notifications: { notification: INotification; actions: () => readonly IAction[] }[] = [];
		instantiationService.stub(INotificationService, 'notify', (notification: INotification) => {
			errors.push(notification.message);
			let actions = notification.actions?.primary ?? [];
			notifications.push({ notification, actions: () => actions });
			return new class extends NoOpNotification {
				override updateActions(updated?: INotificationActions): void { actions = updated?.primary ?? []; }
			}();
		});
		instantiationService.stub(IConnectionDiagnosticsService, { getSnapshot: async () => ({ capturedAt: '', sections: [], text: 'Connection diagnostics' }) });
		const clipboard = new TestClipboardService();
		instantiationService.stub(IClipboardService, clipboard);
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupManagedHover(...args: Parameters<IHoverService['setupManagedHover']>) {
				if (typeof args[2] === 'string') {
					hoverContents.set(args[1], args[2]);
				}
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
		const hosts = new Map<string, TestSandboxProfilesHost>();
		const onDidChangeConnections = store.add(new Emitter<void>());
		instantiationService.stub(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeConnections = onDidChangeConnections.event;
			override getConnectionByAddress(address: string) { return hosts.get(address); }
		}());
		const widget = store.add(instantiationService.createInstance(TestRemotesWidget, parent, model, operatingSystem));
		if (grouping !== 'default') {
			widget.setGrouping(grouping);
			widget.focusFirstRow();
		}
		widget.layout();
		const addHost = (address: string, host: TestSandboxProfilesHost) => {
			hosts.set(address, store.add(host));
			onDidChangeConnections.fire();
			return host;
		};
		const disconnectHost = (address: string) => {
			hosts.delete(address);
			onDidChangeConnections.fire();
		};
		return { widget, parent, model, addHost, disconnectHost, errors, notifications, clipboard, hoverContents, mouseHoverTargets, opened, commands, sessionActions, activeComposer, documentation, settings, storageService: instantiationService.get(IStorageService), configurationService: instantiationService.get(IConfigurationService) as TestConfigurationService, configRequests: () => configRequests, failConfig: (error: Error) => { configFailure = error; } };
	}

	function feedbackGeometry(parent: HTMLElement, selectors: readonly string[]): number[][] {
		return selectors.map(selector => {
			const bounds = parent.querySelector(selector)!.getBoundingClientRect();
			return [bounds.x, bounds.y, bounds.width, bounds.height];
		});
	}

	function feedbackStyles(parent: HTMLElement): void {
		const icons = dom.append(parent, dom.$('style'));
		icons.textContent = store.add(getIconsStyleSheet(undefined)).getCSS().toString();
		for (const size of [20, 40, 60, 80, 100, 120, 160, 200, 240, 320, 360]) {
			parent.style.setProperty(`--vscode-spacing-size${size}`, `${size / 10}px`);
		}
		parent.style.setProperty('--vscode-fontSize-label2', '11px');
		parent.style.setProperty('--vscode-codiconFontSize', '16px');
	}

	function getMenuActions(parent: HTMLElement, id: string): readonly IAction[] {
		const row = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].find(row => row.dataset.remoteId === id);
		const overflow = row?.querySelector<HTMLElement>('.codicon-toolbar-more');
		assert.ok(overflow, `Missing overflow for ${id}`);
		overflow.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
		return menus.get(parent)!();
	}

	function getContextMenuActions(parent: HTMLElement, row: HTMLElement): readonly IAction[] {
		row.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
		return menus.get(parent)!();
	}

	function menuLabels(actions: readonly IAction[]): string[] {
		return actions.map(action => action.id === Separator.ID ? '---' : action.label);
	}

	function findMenuAction(parent: HTMLElement, id: string, action: string): IAction | undefined {
		return getMenuActions(parent, id).find(item => item.id === `remotes.${action}`);
	}

	function getMenuAction(parent: HTMLElement, id: string, action: string): IAction {
		const item = findMenuAction(parent, id, action);
		assert.ok(item, `Missing ${action} action for ${id}`);
		return item;
	}

	function runMenuAction(parent: HTMLElement, id: string, action: string): void {
		const item = getMenuAction(parent, id, action);
		if (item.enabled) {
			parent.querySelector<HTMLElement>(`[data-remote-id="${id}"] .codicon-toolbar-more`)!.focus();
		}
		void store.add(new ActionRunner()).run(item);
	}

	function getOrganizationActions(parent: HTMLElement): readonly IAction[] {
		const control = parent.querySelector<HTMLElement>('[aria-label="Filter"]')!;
		control.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
		return menus.get(parent)!();
	}

	async function organize(parent: HTMLElement, id: string): Promise<void> {
		const actions = getOrganizationActions(parent);
		const action = actions.flatMap(action => action instanceof SubmenuAction ? action.actions : [action]).find(action => action.id === id);
		assert.ok(action, `Missing organization action ${id}`);
		await store.add(new ActionRunner()).run(action);
	}

	function getConnectionAction(parent: HTMLElement, id: string): HTMLElement {
		const row = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].find(row => row.dataset.remoteId === id);
		const action = row?.querySelector<HTMLElement>('.remotes-connect-action');
		assert.ok(action, `Missing connection action for ${id}`);
		return action;
	}

	function isWarningShown(action: HTMLElement): boolean {
		const icon = action.querySelector<HTMLElement>('.codicon-warning');
		return !!icon && !icon.hidden;
	}

	function getRowStatus(row: Element): string | undefined {
		return row.closest('.monaco-list-row')?.getAttribute('aria-label')?.match(/Status: (?<status>.+?)\./)?.groups?.status;
	}

	test('preserves search and collapsed groups through discovery updates without connecting', async () => {
		const { parent, widget, model } = createWidget(OperatingSystem.Windows, 'status');
		widget.setVisible(true);
		await timeout(0);
		widget.setSearchQuery('build');
		parent.querySelector<HTMLElement>('.remotes-table-container .monaco-list-row[aria-expanded]')!.click();
		const refreshes = model.refreshCalls;
		model.remotes.set([...model.remotes.get()], undefined);
		const collapsed = parent.querySelectorAll('[data-remote-id]').length;
		parent.querySelector<HTMLElement>('.remotes-table-container .monaco-list-row[aria-expanded]')!.click();
		await timeout(0);
		const expanded = parent.querySelectorAll('[data-remote-id="ssh:build"]').length;
		assert.deepStrictEqual({
			collapsed, expanded, refreshes: model.refreshCalls - refreshes,
			query: parent.querySelector<HTMLInputElement>('input')!.value,
			listVisible: !parent.querySelector<HTMLElement>('.remotes-table-container')!.hidden,
			listRows: parent.querySelectorAll('.remotes-table-container [data-remote-id]').length,
			connections: model.connectionChanges,
		}, { collapsed: 0, expanded: 1, refreshes: 0, query: 'build', listVisible: true, listRows: 1, connections: [] });
	});

	test('shows only known live metadata and preserves session and connection actions', async () => {
		const { parent, model, sessionActions } = createWidget(OperatingSystem.Windows, 'status');
		const remote = model.remotes.get()[0];
		model.remotes.set([{
			...remote, metadata: { operatingSystem: OperatingSystem.Linux, activeSessionCount: 2, observedSessionCount: 2, lastConnectedAt: Date.now(), lastActivityAt: Date.now(), observedAt: Date.now() },
		}], undefined);
		const table = parent.querySelector<HTMLElement>('.remotes-table-container')!;
		const metadata = () => [...table.querySelectorAll<HTMLElement>('[data-remote-id] .remotes-metadata')].map(cell => cell.textContent);
		const live = metadata();
		table.querySelector<HTMLElement>('[data-remote-id] .remotes-new-session')!.click();
		await timeout(0);
		model.remotes.set(model.remotes.get().map(item => ({ ...item, metadataIsStale: true })), undefined);
		const stale = metadata();
		model.remotes.set([{ ...remote, availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected }], undefined);
		const connect = getConnectionAction(table, remote.id);
		const unknown = metadata();
		connect.click();
		assert.deepStrictEqual({
			live, stale, unknown, sessionActions,
			connectHidden: connect.hidden,
			task: parent.querySelector('.remotes-task-title')?.textContent,
			connections: model.connectionChanges,
		}, {
			live: ['Connected', 'now', 'Linux', 'SSH'],
			stale: ['Connected', 'now', 'Linux', 'SSH'], unknown: ['Offline', '', '', 'SSH'],
			sessionActions: ['open', 'agenthost-remote-build'], connectHidden: true,
			task: undefined, connections: [],
		});
	});

	test('opens the composer with the connected environment selected without sending or reconnecting', async () => {
		const { parent, model, commands, sessionActions, errors } = createWidget();
		parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-new-session')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			commands, sessionActions, connections: model.connectionChanges, errors,
			disconnectedActionHidden: parent.querySelector<HTMLElement>('[data-remote-id="tunnel:laptop"] .remotes-new-session')!.hidden,
		}, {
			commands: ['workbench.action.closeModalEditor'], sessionActions: ['open', 'agenthost-remote-build'],
			connections: [], errors: [], disconnectedActionHidden: true,
		});
	});

	test('disables new session while disconnecting and reports a missing composer explicitly', async () => {
		const { parent, model, activeComposer, errors, sessionActions } = createWidget();
		activeComposer.set(undefined, undefined);
		parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-new-session')!.click();
		await timeout(0);
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, 'ssh:build').click();
		const disabled = parent.querySelector('[data-remote-id="ssh:build"] .remotes-new-session')!.getAttribute('aria-disabled');
		const menuEnabled = getMenuAction(parent, 'ssh:build', 'newSession').enabled;
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({
			sessionActions, errors: errors.map(error => error instanceof Error ? error.message : String(error)), disabled, menuEnabled,
		}, { sessionActions: ['open'], errors: ['Couldn\'t open the new session composer.'], disabled: 'true', menuEnabled: false });
	});

	test('New Session stays consistent between the row and its menu as connection state changes', async () => {
		const { parent, model, sessionActions } = createWidget();
		const remote = model.remotes.get().find(remote => remote.id === 'ssh:build')!;
		const read = () => ({
			inline: parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-new-session')!.hidden,
			menu: findMenuAction(parent, remote.id, 'newSession')?.label,
		});
		const connected = read();
		model.remotes.set(model.remotes.get().map(item => item.id === remote.id ? { ...item, connectionStatus: RemoteAgentHostConnectionStatus.disconnected } : item), undefined);
		const disconnected = read();
		model.remotes.set(model.remotes.get().map(item => item.id === remote.id ? remote : item), undefined);
		const reconnected = read();
		model.remotes.set(model.remotes.get().map(item => item.id === remote.id ? { ...remote, pickerUnavailableReason: 'Not selectable' } : item), undefined);
		const notSelectable = read();
		model.remotes.set(model.remotes.get().map(item => item.id === remote.id ? remote : item), undefined);
		runMenuAction(parent, remote.id, 'newSession');
		await timeout(0);
		assert.deepStrictEqual({ connected, disconnected, reconnected, notSelectable, sessionActions }, {
			connected: { inline: false, menu: 'New Session' },
			disconnected: { inline: true, menu: undefined },
			reconnected: { inline: false, menu: 'New Session' },
			notSelectable: { inline: true, menu: undefined },
			sessionActions: ['open', 'agenthost-remote-build'],
		});
	});

	async function renderIcons(parent: HTMLElement): Promise<void> {
		const styles = dom.append(parent, dom.$('style'));
		styles.textContent = store.add(getIconsStyleSheet(undefined)).getCSS().toString();
		await dom.getWindow(parent).document.fonts.load('16px codicon');
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
				columns: ['Name', 'Status', 'Last Activity', 'System', 'Type', 'Sandbox Profile', '', ''],
				roots: operatingSystem === OperatingSystem.Windows ? ['Dev Tunnels', 'WSL', 'SSH'] : ['Dev Tunnels', 'SSH'],
				switches: 0,
				checkboxes: 0,
				descriptions: 0,
				accessibleWSL: operatingSystem === OperatingSystem.Windows,
				accessibleContainers: false,
			});
		});
	}

	for (const operatingSystem of [OperatingSystem.Windows, OperatingSystem.Macintosh]) {
		test(`toolbar only offers environment actions with populated, filtered and empty environments on ${operatingSystem}`, () => {
			const { parent, model, widget } = createWidget(operatingSystem, 'default');
			const actions = () => [...parent.querySelectorAll('.remotes-header-actions .monaco-button')].map(element => element.getAttribute('aria-label'));
			const initial = actions();
			model.environmentsEnabled.set(true, undefined);
			widget.setGrouping('status');
			widget.setSearchQuery('no matching environment');
			const filtered = actions();
			model.remotes.set([], undefined);
			widget.setSearchQuery('');
			model.environmentsEnabled.set(false, undefined);
			const expected = ['Refresh the list of remote environments without connecting'];
			assert.deepStrictEqual({ initial, filtered, empty: actions() }, { initial: expected, filtered: expected, empty: expected });
		});
	}

	test('connection method grouping keeps empty methods expanded with their setup rows until collapsed', () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'type');
		model.environmentsEnabled.set(true, undefined);
		const groups = () => [...parent.querySelectorAll('.remotes-group-row')].map(group => ({
			name: group.querySelector('.remotes-name')?.textContent,
			count: group.querySelector('.monaco-count-badge')?.textContent,
			expanded: group.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
		}));
		const setupRows = () => [...parent.querySelectorAll('.remotes-empty-row .remotes-empty-label')].map(label => label.textContent);
		const initial = { groups: groups(), setupRows: setupRows() };
		toggleMethodGroup(parent, 'GitHub Environments');
		const collapsed = { expanded: groups()[0].expanded, setupRows: setupRows() };
		toggleMethodGroup(parent, 'GitHub Environments');
		const expanded = { expanded: groups()[0].expanded, setupRows: setupRows() };
		model.remotes.set([], undefined);
		assert.deepStrictEqual({ initial, collapsed, expanded, empty: groups(), messageHidden: parent.querySelector<HTMLElement>('.remotes-message')!.hidden }, {
			initial: {
				groups: [
					{ name: 'GitHub Environments', count: '0', expanded: 'true' },
					{ name: 'Dev Tunnels', count: '1', expanded: 'true' },
					{ name: 'WSL', count: '1', expanded: 'true' },
					{ name: 'SSH', count: '1', expanded: 'true' },
				],
				setupRows: ['Refresh to look for GitHub Environments.'],
			},
			collapsed: { expanded: 'false', setupRows: [] },
			expanded: { expanded: 'true', setupRows: ['Refresh to look for GitHub Environments.'] },
			empty: ['GitHub Environments', 'Dev Tunnels', 'WSL', 'SSH'].map(name => ({ name, count: '0', expanded: 'true' })),
			messageHidden: true,
		});
	});

	test('empty method groups expose setup guidance and keep a collapsed group collapsed across updates', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'type');
		model.remotes.set([], undefined);
		widget.setVisible(true);
		await timeout(0);
		const ssh = [...parent.querySelectorAll<HTMLElement>('.remotes-group-row')].find(group => group.querySelector('.remotes-name')?.textContent === 'SSH')!;
		ssh.querySelector<HTMLElement>('.remotes-group-chevron')!.click();
		const guidance = [...parent.querySelectorAll('.remotes-empty-label')].map(entry => entry.textContent);
		model.remotes.set([], undefined);
		await timeout(0);
		const sections = [...parent.querySelectorAll<HTMLElement>('.remotes-group-row')];
		assert.deepStrictEqual({
			guidance,
			sections: sections.map(section => ({ name: section.querySelector('.remotes-name')?.textContent, open: section.closest('.monaco-list-row')?.getAttribute('aria-expanded') === 'true' })),
			setup: [...parent.querySelectorAll('.remotes-empty-label')].map(entry => entry.textContent),
		}, {
			guidance: ['Connect to another computer with a Dev Tunnel', 'No WSL 2 distributions found.'],
			sections: [{ name: 'Dev Tunnels', open: true }, { name: 'WSL', open: true }, { name: 'SSH', open: false }],
			setup: ['Connect to another computer with a Dev Tunnel', 'No WSL 2 distributions found.'],
		});
	});

	test('group headers omit setup hints during discovery and after failure', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'type');
		model.remotes.set([], undefined);
		const hints = () => [...parent.querySelectorAll('.remotes-group-row .remotes-empty-description')].filter(element => element.textContent).map(element => element.textContent);
		const before = hints();
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const loading = hints();
		await model.pendingRefresh.complete(['ssh']);
		await timeout(0);
		const settled = hints();
		model.tunnelAuthenticationRequired.set('github', undefined);
		const signedOut = hints();
		widget.setSearchQuery('not-a-machine');
		assert.deepStrictEqual({ before, loading, settled, signedOut, filtered: hints(), connects: model.connectionChanges }, {
			before: [], loading: [],
			settled: [], signedOut: [], filtered: [], connects: [],
		});
	});

	test('the plain environments heading preserves search and discovery updates', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'default');
		parent.style.setProperty('--vscode-fontSize-heading2', '18px');
		parent.style.setProperty('--vscode-fontWeight-semiBold', '600');
		widget.setHeading('Other environments');
		widget.setSearchQuery('build');
		const toggle = parent.querySelector<HTMLElement>('.remotes-heading')!;
		const body = parent.querySelector<HTMLElement>('.remotes-overview-body')!;
		toggle.click();
		await timeout(0);
		model.remotes.set([...model.remotes.get()], undefined);
		widget.focus();
		assert.deepStrictEqual({
			hidden: body.hidden,
			disclosure: toggle.tagName === 'SUMMARY' || toggle.parentElement?.tagName === 'DETAILS',
			titleFont: dom.getWindow(toggle).getComputedStyle(toggle.querySelector('h2')!).fontSize,
			titleWeight: dom.getWindow(toggle).getComputedStyle(toggle.querySelector('h2')!).fontWeight,
			border: dom.getWindow(toggle).getComputedStyle(toggle).borderTopStyle,
			query: parent.querySelector<HTMLInputElement>('input')!.value,
			list: !parent.querySelector<HTMLElement>('.remotes-table-container')!.hidden,
			ids: [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(element => element.dataset.remoteId),
			connects: model.connectionChanges,
		}, {
			hidden: false, disclosure: false, titleFont: '18px', titleWeight: '600', border: 'none',
			query: 'build', list: true, ids: ['ssh:build'], connects: [],
		});
		widget.setHeading(undefined);
		widget.focus();
		assert.deepStrictEqual({
			hidden: body.hidden, headingDisplay: dom.getWindow(toggle).getComputedStyle(toggle).display,
			focused: dom.getActiveElement() === parent.querySelector('input'),
		}, { hidden: false, headingDisplay: 'none', focused: true });
	});

	test('defaults to status order and exposes consistent names for sorting and grouping table fields', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'default');
		const remote = (id: string, kind: RemoteKind, name: string, availability: ICustomizationRemote['availability'], connectionStatus: RemoteAgentHostConnectionStatus = RemoteAgentHostConnectionStatus.disconnected): ICustomizationRemote => ({
			id, kind, name, availability, connectionStatus, detail: id, canRemove: true,
		});
		model.remotes.set([
			{ ...remote('ssh:connected', 'ssh', 'Z connected', 'online', RemoteAgentHostConnectionStatus.connected), metadata: { observedAt: 1, lastActivityAt: 100 } },
			{ ...remote('wsl:start', 'wsl', 'A start', 'offline'), startsOnConnect: true },
			{ ...remote('tunnel:online', 'tunnel', 'B reachable', 'online'), metadata: { observedAt: 1, lastConnectedAt: 200 } },
			{ ...remote('ssh:unknown', 'ssh', 'C unverified', 'unknown'), metadata: { observedAt: 1, lastConnectedAt: 1_000_000 } },
			{ ...remote('ssh:error', 'ssh', 'D sign-in failed', 'online'), lastConnectionError: 'Permission denied' },
			remote('tunnel:offline', 'tunnel', 'A offline', 'offline'),
		], undefined);
		const listIds = () => [...parent.querySelectorAll<HTMLElement>('.remotes-table-container [data-remote-id]')].map(row => row.dataset.remoteId);
		const menu = getOrganizationActions(parent).map(action => action instanceof SubmenuAction
			? { label: action.label, children: action.actions.map(child => ({ label: child.label, checked: child.checked })) }
			: action.label);
		const defaultOrder = listIds();
		const headers = [...parent.querySelectorAll('.remotes-sort-header')].map(button => ({
			label: button.textContent, sort: button.getAttribute('aria-label'),
		}));
		await organize(parent, 'remotes.sort.activity');
		const grouped = [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent);
		const newestFirst = listIds();
		await organize(parent, 'remotes.group.status');
		const statuses = [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent);
		widget.setSearchQuery('reachable');
		const filtered = listIds();
		await organize(parent, 'remotes.resetFilters');
		assert.deepStrictEqual({
			menu, headers, defaultOrder, grouped, newestFirst, statuses, filtered,
			resetMethods: [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent),
			query: parent.querySelector<HTMLInputElement>('input')!.value, connects: model.connectionChanges,
		}, {
			menu: [
				{ label: 'Sort By', children: [{ label: 'Status', checked: true }, { label: 'Name', checked: false }, { label: 'Last Activity', checked: false }, { label: 'System', checked: false }, { label: 'Type', checked: false }] },
				{ label: 'Group By', children: [{ label: 'None', checked: true }, { label: 'Type', checked: false }, { label: 'Status', checked: false }] },
				'', 'Reset Filter',
			],
			headers: [
				{ label: 'Name', sort: 'Sort Name ascending' },
				{ label: 'Status', sort: 'Status, sorted ascending. Sort Status descending' },
				{ label: 'Last Activity', sort: 'Sort Last Activity descending' },
				{ label: 'System', sort: 'Sort System ascending' },
				{ label: 'Type', sort: 'Sort Type ascending' },
			],
			defaultOrder: ['ssh:connected', 'tunnel:online', 'ssh:unknown', 'ssh:error', 'wsl:start', 'tunnel:offline'],
			grouped: [],
			newestFirst: ['ssh:unknown', 'tunnel:online', 'ssh:connected', 'tunnel:offline', 'wsl:start', 'ssh:error'],
			statuses: ['Connected', 'Available', 'Stopped', 'Offline'], filtered: ['tunnel:online'],
			resetMethods: [], query: '', connects: [],
		});
	});

	test('grouping hides only its redundant column and keeps Status after Name otherwise', async () => {
		// The Remote Environments modal editor is about this wide.
		const { parent, widget } = createWidget(OperatingSystem.Windows, 'default', 1100);
		const columns = () => [...parent.querySelectorAll<HTMLElement>('.monaco-table-th')]
			.filter(cell => cell.clientWidth > 0 && dom.getWindow(cell).getComputedStyle(cell).display !== 'none')
			.map(cell => cell.textContent).filter(Boolean);
		const ungrouped = columns();
		widget.setGrouping('type');
		const byMethod = columns();
		widget.setGrouping('status');
		const byAvailability = columns();
		widget.setSearchQuery('nonmatching');
		const empty = parent.querySelector('.remotes-message')?.textContent;
		parent.querySelector<HTMLElement>('[data-empty-action="clearFilter"]')!.click();
		assert.deepStrictEqual({ ungrouped, byMethod, byAvailability, empty, restored: columns() }, {
			ungrouped: ['Name', 'Status', 'Last Activity', 'System', 'Type', 'Sandbox Profile'],
			byMethod: ['Name', 'Status', 'Last Activity', 'System', 'Sandbox Profile'],
			byAvailability: ['Name', 'Last Activity', 'System', 'Type', 'Sandbox Profile'],
			empty: 'No environments match your filters.Clear Filter',
			restored: ['Name', 'Last Activity', 'System', 'Type', 'Sandbox Profile'],
		});
	});

	test('identity and host-reported resources distinguish hosts and are searchable', () => {
		const { parent, model, widget, hoverContents } = createWidget(OperatingSystem.Windows, 'default', 1400);
		const base = model.remotes.get()[0];
		const heightBefore = parent.querySelector('[data-remote-id]')!.getBoundingClientRect().height;
		model.remotes.set([
			{ ...base, detail: 'developer@build.example:2222', metadata: { operatingSystem: OperatingSystem.Linux, architecture: 'arm64', cpuCount: 8, memoryBytes: 16 * 1024 ** 3, observedAt: 1 } },
			{ ...base, id: 'ssh:other', detail: 'developer@other.example', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		], undefined);
		widget.setSearchQuery('arm64');
		assert.deepStrictEqual({
			system: parent.querySelector('[data-remote-id] .remotes-system-column')?.textContent,
			systemTooltip: hoverContents.get(parent.querySelector<HTMLElement>('[data-remote-id] .remotes-system-column .remotes-metadata')!),
			rows: parent.querySelectorAll('[data-remote-id]').length,
			heights: [heightBefore, parent.querySelector('[data-remote-id]')!.getBoundingClientRect().height],
		}, { system: 'Linux', systemTooltip: 'Linux \u00b7 arm64\nCPUs: 8\nMemory: 16 GiB', rows: 1, heights: [28, 28] });
	});

	test('GitHub heartbeat information is visible without connecting, while opaque registration IDs are not presentation or search fields', () => {
		const { parent, model, widget, hoverContents } = createWidget(OperatingSystem.Windows, 'default', 1400);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'cloudsandbox:opaque-registration', kind: 'environment', name: 'Workstation', detail: 'opaque-registration',
			canRemove: true, availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
			lastHeartbeatAt: Date.now() - 3_600_000, reportedSessionCount: 2,
		}], undefined);
		const row = parent.querySelector<HTMLElement>('[data-remote-id]')!;
		const activity = row.querySelector('.remotes-activity-column')?.textContent;
		const tooltip = hoverContents.get(row.querySelector<HTMLElement>('.remotes-activity-column .remotes-metadata')!);
		const address = row.textContent?.includes('opaque-registration');
		widget.setSearchQuery('opaque-registration');
		const opaqueMatches = parent.querySelectorAll('[data-remote-id]').length;
		widget.setSearchQuery('last seen');
		assert.deepStrictEqual({ activity, tooltip, address, opaqueMatches, heartbeatMatches: parent.querySelectorAll('[data-remote-id]').length, connections: model.connectionChanges }, {
			activity: '1 hr ago', tooltip: '2 sessions\nLast seen: 1 hr ago', address: false, opaqueMatches: 0, heartbeatMatches: 1, connections: [],
		});
	});

	test('status grouping keeps hidden and offline hosts and supports searching connection methods', () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'status');
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([
			...model.remotes.get(),
			{ id: 'environment:offline', kind: 'environment', name: 'Offline host', detail: 'offline', hidden: true, canRemove: true, availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the host.' },
		], undefined);
		const headings = () => [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent);
		const initial = headings();
		searchForText(parent, 'WSL');
		assert.deepStrictEqual({
			initial, filtered: headings(),
			remotes: [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId),
			accessible: widget.getAccessibilityContent().includes('Build server'),
		}, { initial: ['Connected', 'Available', 'Offline'], filtered: ['Available'], remotes: ['wsl:Ubuntu'], accessible: false });
	});

	test('Filter is the only search action and precedes the separate Refresh control', () => {
		const { parent } = createWidget();
		assert.deepStrictEqual({
			actions: [...parent.querySelectorAll('.remotes-header-actions .monaco-button')].map(element => element.getAttribute('aria-label')),
			searchActions: [...parent.querySelectorAll('.remotes-search-container .action-label')].map(element => element.getAttribute('aria-label')),
		}, { actions: ['Refresh the list of remote environments without connecting'], searchActions: ['Filter'] });
	});

	test('stopped WSL distributions show as Stopped and offer Start Distribution, while running ones offer Restart Distribution', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'status');
		const stopped: ICustomizationRemote = {
			id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu', canRemove: true,
			availability: 'offline', startsOnConnect: true, connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
		};
		const menu = () => getMenuActions(parent, stopped.id).filter(action => action.id !== Separator.ID).map(action => action.label);
		model.remotes.set([stopped], undefined);
		const stoppedState = {
			groups: [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent),
			connect: getConnectionAction(parent, stopped.id).getAttribute('aria-disabled'),
			accessible: widget.getAccessibilityContent().includes('Status: Stopped'),
			menu: menu(),
		};
		runMenuAction(parent, stopped.id, 'distribution');
		await timeout(0);
		const connected = menu();
		runMenuAction(parent, stopped.id, 'distribution');
		await timeout(0);
		model.remotes.set([{ ...stopped, startsOnConnect: undefined }], undefined);
		assert.deepStrictEqual({
			stoppedState, connected, connectionChanges: model.connectionChanges, troubleshootingActions: model.troubleshootingActions,
			uninstalled: findMenuAction(parent, stopped.id, 'distribution')?.label,
		}, {
			stoppedState: {
				groups: ['Stopped'], connect: 'false', accessible: true,
				menu: ['Connect', 'Start Distribution', 'Hide from Environment Picker', 'Rename...', 'Troubleshoot Connection...'],
			},
			connected: ['New Session', 'Disconnect', 'Restart Distribution...', 'Hide from Environment Picker', 'Rename...', 'Troubleshoot Connection...'],
			connectionChanges: [{ id: stopped.id, connected: true }, { id: stopped.id, connected: true }],
			troubleshootingActions: ['restartWSLDistribution:wsl:Ubuntu'],
			uninstalled: undefined,
		});
	});

	test('overview groups describe connection state without promising usability in either view', () => {
		const { parent, model, widget, hoverContents } = createWidget(OperatingSystem.Windows, 'status');
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([
			...model.remotes.get(),
			{ id: 'environment:offline', kind: 'environment', name: 'Offline host', detail: 'offline', canRemove: true, availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start sharing on the host.' },
			{ id: 'ssh:failed', kind: 'ssh', name: 'Failed host', detail: 'failed.example.com', canRemove: true, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, lastConnectionError: 'Permission denied' },
			{ id: 'ssh:unknown', kind: 'ssh', name: 'Unchecked host', detail: 'jump.example.com', canRemove: true, availability: 'unknown', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Reached through a jump host.' },
			{ id: 'ssh:pending', kind: 'ssh', name: 'Pending host', detail: 'pending.example.com', canRemove: true, availability: 'pending', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		], undefined);
		const groups = [...parent.querySelectorAll('.remotes-group-row')].map(group => {
			const label = group.querySelector<HTMLElement>('.remotes-name')!;
			const description = hoverContents.get(label);
			return {
				label: label.textContent,
				description,
				inline: group.querySelector('.remotes-empty-description')?.textContent,
				announced: group.closest('.monaco-list-row')?.getAttribute('aria-label')?.includes(description!),
			};
		});
		assert.ok(parent.querySelector('[data-remote-id="ssh:pending"]'));
		const statusRows = ['environment:offline', 'ssh:unknown'].map(id => {
			const row = parent.querySelector<HTMLElement>(`[data-remote-id="${id}"]`)!;
			return {
				name: row.querySelector('.remotes-name')?.textContent,
				status: getRowStatus(row),
				hover: hoverContents.get(row.querySelector<HTMLElement>('.remotes-name')!),
				rowHeight: row.getBoundingClientRect().height,
				announced: widget.getAccessibilityContent().includes(model.remotes.get().find(remote => remote.id === id)!.unavailableReason!),
				offlineStyle: !!row.closest('.remotes-offline-row'),
			};
		});
		assert.deepStrictEqual(statusRows, [
			{ name: 'Offline host', status: 'Offline', hover: 'Offline host', rowHeight: 28, announced: false, offlineStyle: true },
			{ name: 'Unchecked host', status: 'Available', hover: 'Unchecked host\n\njump.example.com', rowHeight: 28, announced: false, offlineStyle: false },
		]);
		assert.deepStrictEqual(groups, [
			{ label: 'Connected', description: 'Connected from this window and ready to start or continue sessions.', inline: '', announced: true },
			{ label: 'Available', description: 'Select Connect to use this environment.', inline: '', announced: true },
			{ label: 'Offline', description: 'No reachable endpoint was found at the last check. Bring the environment online, then refresh.', inline: '', announced: true },
		]);
		const overview = parent.querySelector<HTMLElement>('.remotes-overview')!;
		assert.deepStrictEqual({
			diagnosis: overview.textContent?.includes('Reached through a jump host.'),
			announced: widget.getAccessibilityContent().includes('Reached through a jump host.'),
			available: overview.querySelector('.remotes-available-group .remotes-name')?.textContent,
			states: ['environment:offline', 'ssh:failed', 'ssh:unknown'].map(id => {
				const row = overview.querySelector<HTMLElement>(`[data-remote-id="${id}"]`)!;
				return {
					status: getRowStatus(row),
					action: row.querySelector<HTMLElement>('.remotes-connect-action:not([hidden])')?.textContent?.trim(),
				};
			}),
		}, {
			diagnosis: false, announced: false, available: 'Available',
			states: [
				{ status: 'Offline', action: undefined },
				{ status: 'Available', action: 'Connect' },
				{ status: 'Available', action: 'Connect' },
			],
		});
	});

	test('rows retain known system metadata across statuses and grouping changes', () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'status', 1400);
		model.environmentsEnabled.set(true, undefined);
		const remotes: ICustomizationRemote[] = remoteKinds.map(kind => ({
			id: `${kind}:host`, kind, name: kind, detail: kind, canRemove: false,
			availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
			unavailableReason: 'Start the host.',
			metadata: { operatingSystem: OperatingSystem.Linux, activeSessionCount: 0, lastConnectedAt: Date.now(), observedAt: 1 },
		}));
		const snapshot = () => [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => ({
			name: row.querySelector('.remotes-name')?.textContent,
			status: getRowStatus(row),
			height: row.getBoundingClientRect().height,
			metadata: [...row.querySelectorAll('.remotes-type-column .remotes-metadata, .remotes-system-column .remotes-metadata')].map(cell => cell.textContent),
		}));
		model.remotes.set(remotes, undefined);
		const offline = snapshot();
		widget.setGrouping('type');
		const byType = snapshot().map(row => ({ name: row.name, status: row.status, height: row.height })).sort((a, b) => a.name!.localeCompare(b.name!));
		widget.setGrouping('status');
		const restored = snapshot();
		model.remotes.set(remotes.map(remote => ({ ...remote, availability: 'unknown' })), undefined);
		const unknown = snapshot();
		model.remotes.set(remotes.map(remote => ({ ...remote, availability: 'online', unavailableReason: undefined })), undefined);
		const available = snapshot();
		model.remotes.set(remotes.map(remote => ({ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.connected })), undefined);
		const connected = snapshot();
		const expected = [
			{ name: 'devContainer', metadata: ['Linux', 'Dev Containers'] },
			{ name: 'environment', metadata: ['Linux', 'GitHub Environment (Preview)'] },
			{ name: 'extension', metadata: ['Linux', 'Extensions'] },
			{ name: 'ssh', metadata: ['Linux', 'SSH'] },
			{ name: 'tunnel', metadata: ['Linux', 'Dev Tunnel'] },
			{ name: 'wsl', metadata: ['Linux', 'WSL'] },
		].map(row => ({ ...row, status: undefined, height: 28 }));
		assert.deepStrictEqual({ offline, byType, restored, unknown, available, connected }, {
			offline: expected.map(row => ({ ...row, status: 'Offline' })),
			byType: expected.map(({ name, height }) => ({ name, status: 'Offline', height })),
			restored: expected.map(row => ({ ...row, status: 'Offline' })), unknown: expected.map(row => ({ ...row, status: 'Available' })), available: expected.map(row => ({ ...row, status: 'Available' })), connected: expected.map(row => ({ ...row, status: 'Connected' })),
		});
	});

	test('status grouping includes every host during pending, unknown, and settled checks without mixing recycled rows', () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'status');
		const host = (name: string, availability: ICustomizationRemote['availability']): ICustomizationRemote => ({
			id: `ssh:${name}`, kind: 'ssh', name, detail: `${name}.example.com`, canRemove: true, availability, connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
		});
		const snapshot = () => [...parent.querySelectorAll<HTMLElement>('.monaco-table-tr')].map(row => row.classList.contains('remotes-group-row')
			? `group:${row.querySelector('.remotes-name')?.textContent}:${row.dataset.remoteId ?? ''}`
			: `${row.dataset.remoteId}:${row.querySelector('.remotes-name')?.textContent}${row.classList.contains('remotes-offline-row') ? ':offline' : ''}`);
		model.remotes.set([host('a', 'pending'), host('b', 'pending'), host('c', 'pending')], undefined);
		const loading = snapshot();
		model.remotes.set([host('a', 'online'), host('b', 'offline'), host('c', 'pending')], undefined);
		const partial = snapshot();
		model.remotes.set([host('a', 'unknown'), host('b', 'offline'), host('c', 'pending')], undefined);
		const unverified = snapshot();
		model.remotes.set([host('a', 'offline'), host('b', 'offline'), host('c', 'online')], undefined);
		assert.deepStrictEqual({ loading, partial, unverified, settled: snapshot() }, {
			loading: ['group:Available:', 'ssh:a:a', 'ssh:b:b', 'ssh:c:c'],
			partial: ['group:Available:', 'ssh:a:a', 'ssh:c:c', 'group:Offline:', 'ssh:b:b:offline'],
			unverified: ['group:Available:', 'ssh:a:a', 'ssh:c:c', 'group:Offline:', 'ssh:b:b:offline'],
			settled: ['group:Available:', 'ssh:c:c', 'group:Offline:', 'ssh:a:a:offline', 'ssh:b:b:offline'],
		});
	});

	test('status grouping scopes discovery failures and omits unrelated tunnel authentication', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'status');
		model.remotes.set([model.remotes.get()[0], model.remotes.get()[1]], undefined);
		model.tunnelAuthenticationRequired.set('github', undefined);
		model.failedKinds = ['ssh'];
		widget.setVisible(true);
		await timeout(0);
		const statusGroups = [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent).sort();
		const notice = parent.querySelector('.remotes-message')!;
		const accessible = widget.getAccessibilityContent();
		const noticeState = {
			hidden: notice.hasAttribute('hidden'),
			signIn: !!parent.querySelector('[data-empty-action="remote-empty-tunnel.signIn"]'),
		};
		widget.setGrouping('type');
		assert.deepStrictEqual({
			statusGroups,
			statusRows: accessible.split('\n').filter(line => ['SSH', 'WSL', 'Dev Tunnels'].includes(line)),
			...noticeState,
			typeGroups: [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent),
		}, { statusGroups: ['Available', 'Connected'], statusRows: ['SSH'], hidden: false, signIn: false, typeGroups: ['Dev Tunnels', 'WSL', 'SSH'] });
	});

	test('a confirmed tunnel sign-in gate replaces Connect without adding a discovery notice or status', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'default');
		const tunnel = model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!;
		const row = () => parent.querySelector<HTMLElement>('[data-remote-id="tunnel:laptop"]')!;
		const action = () => row().querySelector<HTMLElement>('.remotes-connect-action')!;
		model.failedKinds = ['tunnel'];
		widget.setVisible(true);
		await timeout(0);
		const failed = {
			action: action().textContent,
			notice: !!parent.querySelector('.remotes-discovery-notice'),
			warning: /Couldn.t refresh tunnels\./.test(widget.getAccessibilityContent()),
		};
		model.tunnelAuthenticationRequired.set('github', undefined);
		model.remotes.set(model.remotes.get().map(remote => remote === tunnel ? { ...remote, requiresTunnelSignIn: true } : remote), undefined);
		widget.setGrouping('status');
		const gated = {
			action: action().textContent,
			available: row().textContent?.includes('Available'),
			offline: row().classList.contains('remotes-offline-row'),
			menu: getMenuActions(parent, tunnel.id).filter(item => item.label === 'Sign In' || item.label === 'Connect').map(item => item.label),
			notice: !!parent.querySelector('.remotes-discovery-notice'),
		};
		model.pendingSignIn = new DeferredPromise<void>();
		action().click();
		const busy = action().getAttribute('aria-disabled');
		await model.pendingSignIn.complete();
		await timeout(0);
		assert.deepStrictEqual({ failed, gated, busy, signIns: model.signInCalls, refreshes: model.refreshCalls, connections: model.connectionChanges }, {
			failed: { action: 'Connect', notice: false, warning: true },
			gated: { action: 'Sign In', available: false, offline: false, menu: ['Sign In'], notice: false },
			busy: 'true', signIns: 1, refreshes: 2, connections: [],
		});
	});

	test('header refreshes discovered environments without offering duplicate add routes', async () => {
		const { parent, model } = createWidget();
		parent.querySelector<HTMLElement>('.remotes-header-actions .monaco-button')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			headerButtons: parent.querySelectorAll('.remotes-search-controls .monaco-button').length,
			refreshes: model.refreshCalls,
			connections: model.connectionChanges,
		}, {
			headerButtons: 1, refreshes: 1, connections: [],
		});
	});

	for (const grouping of ['default', 'type', 'status'] as const) {
		test(`refresh keeps rows and metadata stable without discovery spinners (${grouping})`, async () => {
			const { parent, model, widget } = createWidget(OperatingSystem.Windows, grouping, 1400);
			const remotes = model.remotes.get().map(remote => ({
				...remote, availability: 'pending' as const, connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
				metadata: { operatingSystem: OperatingSystem.Linux, observedAt: 1 },
			}));
			model.remotes.set(remotes, undefined);
			const pending = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
			widget.setVisible(true);
			const rows = () => [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')];
			const content = () => rows().map(row => row.textContent);
			const spinners = () => [...parent.querySelectorAll<HTMLElement>('.codicon-modifier-spin')].filter(icon => icon.getClientRects().length).length;
			const initialRows = rows();
			const initial = content();
			const refreshing = spinners();
			model.remotes.set(remotes.map(remote => ({
				...remote, name: `Updated ${remote.name}`, availability: 'online',
				metadata: { operatingSystem: OperatingSystem.Windows, observedAt: 2 },
			})), undefined);
			model.refreshProgress[0].report({ kind: 'ssh', refreshing: false, failed: false });
			model.refreshProgress[0].report({ kind: 'wsl', refreshing: false, failed: false });
			const partial = {
				content: content(), sameRows: rows().every((row, index) => row === initialRows[index]),
				spinners: spinners(), accessible: widget.getAccessibilityContent().includes('Updated'),
			};
			widget.setSearchQuery('Build');
			const filtered = parent.querySelector('[data-remote-id="ssh:build"] .remotes-name')?.textContent;
			widget.setSearchQuery('');
			await pending.complete([]);
			await timeout(0);
			assert.deepStrictEqual({
				refreshing, partial, filtered,
				settled: { names: rows().map(row => row.querySelector('.remotes-name')?.textContent).sort(), spinners: spinners(), accessible: widget.getAccessibilityContent().includes('Updated') },
			}, {
				refreshing: 0, partial: { content: initial, sameRows: true, spinners: 0, accessible: false }, filtered: 'Build server',
				settled: { names: ['Updated Build server', 'Updated Laptop', 'Updated Ubuntu'], spinners: 0, accessible: true },
			});
		});
	}

	test('connection actions stay current while discovery metadata waits for the full result', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows);
		const remote = { ...model.remotes.get()[0], connectionStatus: RemoteAgentHostConnectionStatus.disconnected };
		model.remotes.set([remote], undefined);
		const pending = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const read = () => ({
			name: parent.querySelector('[data-remote-id="ssh:build"] .remotes-name')?.textContent,
			action: getConnectionAction(parent, remote.id).textContent?.trim(),
		});
		model.remotes.set([{ ...remote, name: 'Updated name', connectionStatus: RemoteAgentHostConnectionStatus.connected }], undefined);
		const connected = read();
		model.remotes.set([{ ...remote, name: 'Updated name' }], undefined);
		const disconnected = read();
		await pending.complete([]);
		await timeout(0);
		assert.deepStrictEqual({ connected, disconnected, settled: read() }, {
			connected: { name: 'Build server', action: 'Disconnect' },
			disconnected: { name: 'Build server', action: 'Connect' },
			settled: { name: 'Updated name', action: 'Connect' },
		});
	});

	test('initially empty discovery waits for the full result and still honors inventory withdrawals', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'default');
		const remotes = model.remotes.get();
		model.remotes.set([], undefined);
		let pending = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		model.remotes.set(remotes, undefined);
		const initial = parent.querySelectorAll('[data-remote-id]').length;
		await pending.complete([]);
		await timeout(0);
		const settled = parent.querySelectorAll('[data-remote-id]').length;
		pending = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		parent.querySelector<HTMLElement>('.remotes-header-actions .monaco-button')!.click();
		model.remotes.set([], undefined);
		const withdrawn = parent.querySelectorAll('[data-remote-id]').length;
		await pending.complete(['ssh']);
		await timeout(0);
		assert.deepStrictEqual({ initial, settled, withdrawn, afterFailure: parent.querySelectorAll('[data-remote-id]').length }, {
			initial: 0, settled: 3, withdrawn: 0, afterFailure: 0,
		});
	});

	function searchForText(parent: HTMLElement, label: string): void {
		const input = parent.querySelector<HTMLInputElement>('.remotes-search-row input')!;
		input.value = label === 'All' ? '' : label;
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function toggleMethodGroup(parent: HTMLElement, label: string): void {
		const group = [...parent.querySelectorAll<HTMLElement>('.remotes-group-row')].find(group => group.querySelector('.remotes-name')?.textContent === label);
		assert.ok(group, `Missing method group ${label}`);
		group.querySelector<HTMLElement>('.remotes-group-chevron')!.click();
	}

	test('zero inventory uses the existing Type rows even when tunnels require sign-in', async () => {
		const { parent, model, widget, opened, documentation } = createWidget(OperatingSystem.Windows, 'status');
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([], undefined);
		model.tunnelAuthenticationRequired.set('github', undefined);
		model.failedKinds = ['tunnel'];
		widget.setVisible(true);
		await timeout(0);
		const groups = [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(row => row.textContent);
		const sshSetup = [...parent.querySelectorAll<HTMLElement>('.remotes-empty-row')].find(row => row.textContent?.includes('No SSH hosts configured.'))!;
		parent.querySelector<HTMLElement>('[aria-label="Open SSH Configuration"]')!.click();
		sshSetup.querySelector<HTMLElement>('.remotes-empty-actions .monaco-link')!.click();
		await timeout(0);
		assert.deepStrictEqual({ groups, rows: parent.querySelectorAll('.remotes-empty-row').length, opened, documentation, accessible: widget.getAccessibilityContent().includes('No SSH hosts configured.') }, {
			groups: ['GitHub Environments', 'Dev Tunnels', 'WSL', 'SSH'],
			rows: 4,
			opened: [{ input: { resource: URI.file('/home/test/.ssh/config'), options: { pinned: true } }, group: MODAL_GROUP }],
			documentation: ['https://aka.ms/vscode-agent-ssh'],
			accessible: true,
		});
	});

	for (const [provider, providerLabel] of [['github', 'GitHub'], ['microsoft', 'Microsoft']] as const) {
		test(`empty tunnel guidance names the ${providerLabel} account with readable instructions and a separate guide row`, async () => {
			const { parent, model, widget, documentation } = createWidget(OperatingSystem.Windows);
			parent.style.setProperty('--vscode-foreground', '#dddddd');
			parent.style.setProperty('--vscode-descriptionForeground', '#888888');
			parent.style.setProperty('--vscode-spacing-size80', '8px');
			model.remotes.set([], undefined);
			model.tunnelAuthenticationRequired.set(provider, undefined);
			widget.setVisible(true);
			await timeout(0);
			const card = parent.querySelector('.remotes-empty-row')!;
			const actions = card.querySelector('.remotes-empty-signin')!;
			const link = card.querySelector<HTMLAnchorElement>('.remotes-empty-actions .monaco-link')!;
			const actionBounds = actions.getBoundingClientRect();
			const guideBounds = link.getBoundingClientRect();
			const initial = {
				message: card.querySelector('.remotes-empty-label')?.textContent,
				description: card.querySelector('.remotes-empty-description')?.textContent,
				controls: [...actions.querySelectorAll('.monaco-link')].map(element => element.textContent),
				detachedActions: parent.querySelectorAll('.remotes-empty-state-body > .remotes-empty-state-actions').length,
				guide: { tag: link.tagName, role: link.getAttribute('role'), href: link.getAttribute('href'), externalIcon: !!link.querySelector('.codicon-link-external') },
				guideBelowActions: guideBounds.top > actionBounds.bottom,
				guideLeftAligned: guideBounds.left === actionBounds.left,
			};
			link.focus();
			model.tunnelAuthenticationRequired.set(provider === 'github' ? 'microsoft' : 'github', undefined);
			const updatedLink = parent.querySelector<HTMLElement>('.remotes-empty-actions .monaco-link')!;
			const focusRetained = dom.getActiveElement() === updatedLink;
			updatedLink.click();
			await timeout(0);
			assert.deepStrictEqual({ initial, focusRetained, documentation }, {
				initial: {
					message: 'Connect to another computer with a Dev Tunnel',
					description: `Sign in to ${providerLabel} with the same account you use for Remote Tunnel Access on the other computer.`,
					controls: [`Sign in to ${providerLabel}`],
					detachedActions: 0,
					guide: { tag: 'A', role: 'button', href: 'https://aka.ms/vscode-agent-tunnel', externalIcon: false },
					guideBelowActions: true,
					guideLeftAligned: true,
				},
				focusRetained: true,
				documentation: ['https://aka.ms/vscode-agent-tunnel'],
			});
		});
	}

	test('empty method guidance wraps within the viewport and grows without clipping', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'type', 1400);
		feedbackStyles(parent);
		parent.style.setProperty('--vscode-fontSize-label1', '12px');
		parent.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		parent.style.setProperty('--vscode-strokeThickness', '1px');
		model.remotes.set(model.remotes.get().filter(remote => remote.kind !== 'tunnel'), undefined);
		model.tunnelAuthenticationRequired.set('github', undefined);
		widget.setVisible(true);
		await timeout(0);
		const results = [1400, 360, 700].map(width => {
			parent.style.width = `${width}px`;
			widget.layout();
			const root = parent.querySelector('.remotes-table-container')!;
			const row = root.querySelector<HTMLElement>('.remotes-empty-row')!;
			const content = row.querySelector<HTMLElement>('.remotes-name-content')!;
			const description = row.querySelector<HTMLElement>('.remotes-empty-description')!;
			const bounds = row.getBoundingClientRect();
			const contentBounds = content.getBoundingClientRect();
			const parentBounds = parent.getBoundingClientRect();
			return {
				width,
				fitsRow: contentBounds.top >= bounds.top && contentBounds.bottom <= bounds.bottom,
				fitsViewport: contentBounds.left >= parentBounds.left && contentBounds.right <= parentBounds.right,
				wrapped: dom.getWindow(description).getComputedStyle(description).whiteSpace === 'normal',
				unclipped: description.scrollWidth <= description.clientWidth && description.scrollHeight <= description.clientHeight,
				guideVisible: row.querySelector<HTMLElement>('.remotes-empty-actions')!.getBoundingClientRect().bottom <= bounds.bottom,
			};
		});
		assert.deepStrictEqual(results, [1400, 360, 700].map(width => ({
			width, fitsRow: true, fitsViewport: true, wrapped: true, unclipped: true, guideVisible: true,
		})));
	});

	test('aligns full-width setup guidance with names and keeps column sashes out of its content', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'type', 900);
		feedbackStyles(parent);
		parent.style.setProperty('--vscode-spacing-size100', '10px');
		parent.style.setProperty('--vscode-strokeThickness', '1px');
		model.remotes.set(model.remotes.get().filter(remote => remote.kind !== 'tunnel'), undefined);
		model.tunnelAuthenticationRequired.set('github', undefined);
		widget.setVisible(true);
		await timeout(0);
		const results = [900, 360, 900].map(width => {
			parent.style.width = `${width}px`;
			widget.layout();
			const header = parent.querySelector<HTMLElement>('.monaco-table > .monaco-split-view2')!;
			const content = parent.querySelector<HTMLElement>('.remotes-empty-row .remotes-name-content')!;
			const bounds = content.getBoundingClientRect();
			const sashHits = [...header.querySelectorAll<HTMLElement>('.monaco-sash')].filter(sash => {
				const sashBounds = sash.getBoundingClientRect();
				const x = sashBounds.left + sashBounds.width / 2;
				return x > bounds.left && x < bounds.right && header.contains(document.elementFromPoint(x, bounds.top + 20));
			});
			const group = [...parent.querySelectorAll('.remotes-group-row')].find(row => row.querySelector('.remotes-name')?.textContent === 'Dev Tunnels')!;
			return {
				width,
				aligned: content.querySelector('.remotes-empty-label')!.getBoundingClientRect().left === group.querySelector('.remotes-name')!.getBoundingClientRect().left,
				sashHits: sashHits.length,
			};
		});
		assert.deepStrictEqual(results, [900, 360, 900].map(width => ({ width, aligned: true, sashHits: 0 })));
	});

	test('tunnel sign-in is offered in the empty Dev Tunnels group and does not block other environments', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows);
		model.remotes.set([model.remotes.get()[0]], undefined);
		model.tunnelAuthenticationRequired.set('github', undefined);
		model.failedKinds = ['tunnel'];
		widget.setVisible(true);
		await timeout(0);
		const initial = { messageHidden: parent.querySelector<HTMLElement>('.remotes-message')!.hidden, signIn: widget.getAccessibilityContent().includes('Sign In') };
		const signIn = parent.querySelector<HTMLElement>('.remotes-empty-signin .monaco-link')!;
		const input = parent.querySelector<HTMLInputElement>('input')!;
		input.focus();
		signIn.focus();
		const reached = dom.getActiveElement() === signIn;
		model.pendingSignIn = new DeferredPromise<void>();
		signIn.click();
		const busy = {
			calls: model.signInCalls,
			label: parent.querySelector('.remotes-empty-signin .monaco-link')?.textContent,
		};
		await model.pendingSignIn.complete();
		await timeout(0);
		const recovered = {
			signIn: !!parent.querySelector('.remotes-empty-signin:not([hidden]) .monaco-link'),
			message: parent.querySelector('.remotes-empty-label')?.textContent,
			refreshes: model.refreshCalls,
			changes: model.connectionChanges,
		};
		assert.deepStrictEqual({
			initial, reached, busy, recovered,
			restored: parent.querySelectorAll('[data-remote-id="ssh:build"]').length,
			messageHidden: parent.querySelector<HTMLElement>('.remotes-message')!.hidden,
		}, {
			initial: { messageHidden: true, signIn: false }, reached: true,
			busy: { calls: 1, label: 'Signing in...' },
			recovered: { signIn: false, message: 'Connect to another computer with a Dev Tunnel', refreshes: 2, changes: [] },
			restored: 1, messageHidden: true,
		});
	});

	test('empty discovery consolidates loading, failure and retry without setup cards', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Linux, 'status');
		model.remotes.set([], undefined);
		const pending = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const messages = () => widget.getAccessibilityContent();
		const loading = messages();
		model.refreshProgress[0].report({ kind: 'ssh', refreshing: false, failed: false });
		const partial = messages();
		await pending.complete(['tunnel']);
		await timeout(0);
		const failed = {
			messages: messages(),
			retry: !!parent.querySelector('[data-empty-action="refresh"]'),
			setupRows: parent.querySelectorAll('.remotes-empty-row').length,
		};
		model.pendingRefresh = undefined;
		model.failedKinds = [];
		parent.querySelector<HTMLElement>('[data-empty-action="refresh"]')!.click();
		await timeout(0);
		const recovered = messages();
		const refreshingAgain = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		parent.querySelector<HTMLElement>('.remotes-header-actions .monaco-button')!.click();
		const repeatedLoading = messages();
		await refreshingAgain.complete([]);
		await timeout(0);
		assert.deepStrictEqual({ loading, partial, failed, setupMethods: [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(heading => heading.textContent), repeatedLoading, recoveredAgain: messages() === recovered, retries: model.refreshCalls }, {
			loading: 'Looking for environments...',
			partial: 'Looking for environments...',
			failed: {
				messages: 'Couldn\'t refresh environments.\nCheck your connection and try refreshing.\nRefresh', retry: true, setupRows: 0,
			},
			setupMethods: ['Dev Tunnels', 'SSH'],
			repeatedLoading: 'Looking for environments...', recoveredAgain: true, retries: 3,
		});
	});

	for (const grouping of ['status', 'type'] as const) {
		test(`search misses offer search recovery, not setup or authentication (${grouping})`, async () => {
			const { parent, model, widget } = createWidget(OperatingSystem.Windows, grouping);
			model.tunnelAuthenticationRequired.set('github', undefined);
			widget.setVisible(true);
			await timeout(0);
			searchForText(parent, 'SSH');
			widget.setSearchQuery('missing');
			const missed = {
				hiddenTable: parent.querySelector<HTMLElement>('.remotes-table-container')!.hidden,
				message: parent.querySelector('.remotes-message [role="status"]')?.textContent,
				setupRows: parent.querySelectorAll('.remotes-empty-row').length,
				signIn: widget.getAccessibilityContent().includes('Sign In'),
				recovery: [...parent.querySelectorAll('[data-empty-action]')].map(element => element.textContent),
			};
			parent.querySelector<HTMLElement>('[data-empty-action="clearFilter"]')!.click();
			assert.deepStrictEqual({
				missed, query: parent.querySelector<HTMLInputElement>('input')!.value,
				focusedSearch: dom.getActiveElement() === parent.querySelector('input'),
				restored: parent.querySelectorAll('[data-remote-id="ssh:build"]').length,
			}, {
				missed: { hiddenTable: true, message: 'No environments match your filters.', setupRows: 0, signIn: false, recovery: ['Clear Filter'] },
				query: '', focusedSearch: true, restored: 1,
			});
		});

		test(`zero inventory shows setup groups without changing the selected grouping (${grouping})`, async () => {
			const { parent, model, widget } = createWidget(OperatingSystem.Windows, grouping);
			model.environmentsEnabled.set(true, undefined);
			const ssh = model.remotes.get()[0];
			const snapshot = () => ({
				methodGuidance: widget.getAccessibilityContent().includes('No SSH hosts configured.'),
				cards: parent.querySelectorAll('.remotes-empty-row').length,
				groups: [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent),
				tableHidden: parent.querySelector<HTMLElement>('.remotes-table-container')!.hidden,
			});
			model.remotes.set([], undefined);
			widget.setVisible(true);
			await timeout(0);
			const empty = snapshot();
			widget.setSearchQuery('missing');
			const search = snapshot();
			parent.querySelector<HTMLElement>('[data-empty-action="clearFilter"]')!.click();
			const reset = snapshot();
			model.remotes.set([ssh], undefined);
			assert.deepStrictEqual({
				empty, search, reset,
				populated: { cards: snapshot().cards, groups: snapshot().groups, tableHidden: snapshot().tableHidden },
			}, {
				empty: { methodGuidance: true, cards: 4, groups: ['GitHub Environments', 'Dev Tunnels', 'WSL', 'SSH'], tableHidden: false },
				search: { methodGuidance: false, cards: 0, groups: [], tableHidden: true },
				reset: empty,
				populated: { cards: grouping === 'status' ? 0 : 3, groups: grouping === 'status' ? ['Connected'] : ['GitHub Environments', 'Dev Tunnels', 'WSL', 'SSH'], tableHidden: false },
			});
		});
	}

	test('compact row actions preserve connection progress without a redundant status column', async () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'status');
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, 'tunnel:laptop').click();
		const progress = getConnectionAction(parent, 'tunnel:laptop').textContent?.trim();
		const progressVisibleWithoutHover = dom.getWindow(parent).getComputedStyle(getConnectionAction(parent, 'tunnel:laptop').parentElement!).opacity;
		const rowHeight = parent.querySelector('[data-remote-id="tunnel:laptop"]')!.getBoundingClientRect().height;
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({
			progress, rowHeight, progressVisibleWithoutHover,
			sessionButtonsPrimary: [...parent.querySelectorAll('.remotes-new-session')].every(button => !button.classList.contains('secondary')),
			connectionButtonsSecondary: [...parent.querySelectorAll('.remotes-connect-action')].every(button => button.classList.contains('secondary')),
			spinnerDisplayAfterCompletion: dom.getWindow(parent).getComputedStyle(getConnectionAction(parent, 'tunnel:laptop').querySelector<HTMLElement>('.codicon-loading')!).display,
		}, {
			progress: 'Connecting', rowHeight: 28, progressVisibleWithoutHover: '1', sessionButtonsPrimary: true, connectionButtonsSecondary: true, spinnerDisplayAfterCompletion: 'none',
		});
	});

	test('a failed connection removes the painted spinner and permits another attempt', async () => {
		const { parent, model, errors } = createWidget();
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, 'tunnel:laptop').click();
		const error = new Error('Connection timed out');
		await model.pendingConnection.error(error);
		await timeout(0);
		const action = getConnectionAction(parent, 'tunnel:laptop');
		assert.deepStrictEqual({
			label: action.textContent?.trim(),
			disabled: action.getAttribute('aria-disabled'),
			spinnerDisplay: dom.getWindow(parent).getComputedStyle(action.querySelector<HTMLElement>('.codicon-loading')!).display,
			errors,
		}, { label: 'Connect', disabled: 'false', spinnerDisplay: 'none', errors: ['Connection to Laptop failed: Connection timed out'] });
	});

	test('keeps cached counts concise and accessible without connecting', () => {
		const { parent, model, widget } = createWidget();
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? {
			...remote, metadata: { operatingSystem: OperatingSystem.Linux, activeSessionCount: 2, observedAt: 100000 }, metadataIsStale: true,
		} : remote), undefined);
		assert.deepStrictEqual({
			columns: [...parent.querySelectorAll('.monaco-table-th')].map(element => element.textContent),
			known: [...parent.querySelectorAll('[data-remote-id="ssh:build"] .remotes-metadata')].map(element => element.textContent),
			missing: [...parent.querySelectorAll('[data-remote-id="tunnel:laptop"] .remotes-metadata')].map(element => element.textContent),
			unknowns: parent.textContent?.includes('Unknown'),
			accessibleCount: widget.getAccessibilityContent().includes('Active sessions: 2'),
			connections: model.connectionChanges,
		}, {
			columns: ['Name', 'Status', 'Last Activity', 'System', 'Type', 'Sandbox Profile', '', ''],
			known: ['Connected', '', 'Linux', 'SSH'], missing: ['Available', '', '', 'Dev Tunnel'], unknowns: false, accessibleCount: false, connections: [],
		});
	});

	test('Last Activity stays blank without a timestamp but keeps zero and nonzero session counts hoverable', () => {
		const { parent, model, hoverContents } = createWidget();
		const labels = [undefined, 0, 1].map(observedSessionCount => {
			model.remotes.set(model.remotes.get().map(remote => ({
				...remote, metadata: { observedSessionCount, observedAt: 100000 },
			})), undefined);
			const cell = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-activity-column')!;
			const rect = cell.getBoundingClientRect();
			return { label: cell.textContent, tooltip: hoverContents.get(cell), hasHoverArea: rect.width > 0 && rect.height > 0 };
		});
		assert.deepStrictEqual(labels, [
			{ label: '', tooltip: undefined, hasHoverArea: true },
			{ label: '', tooltip: '0 sessions', hasHoverArea: true },
			{ label: '', tooltip: '1 session', hasHoverArea: true },
		]);
	});

	test('rows show only availability while the run behavior Status shows connection failures', () => {
		const { parent, model, hoverContents } = createWidget(OperatingSystem.Windows);
		feedbackStyles(parent);
		parent.style.setProperty('--vscode-testing-iconPassed', '#228822');
		parent.style.setProperty('--vscode-charts-blue', '#2266cc');
		parent.style.setProperty('--vscode-descriptionForeground', '#888888');
		parent.style.setProperty('--vscode-editorWarning-foreground', '#aa8800');
		// The pending glyph inherits the text color, which otherwise follows the OS color scheme.
		parent.style.color = 'rgb(0, 0, 0)';
		const base = { ...model.remotes.get()[0], connectionStatus: RemoteAgentHostConnectionStatus.disconnected };
		const states: ICustomizationRemote[] = [
			{ ...base, connectionStatus: RemoteAgentHostConnectionStatus.connected },
			base,
			{ ...base, availability: 'offline' },
			{ ...base, lastConnectionError: 'Sign-in rejected' },
			{ ...base, availability: 'offline', lastConnectionError: 'Connection refused' },
			{ ...base, connectionStatus: RemoteAgentHostConnectionStatus.connected, lastConnectionError: 'Older failure' },
			{ ...base, availability: 'unknown' },
			{ ...base, availability: 'pending' },
			{ ...base, connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1']) },
			{ ...base, connectionStatus: RemoteAgentHostConnectionStatus.connecting },
		];
		const read = (root: HTMLElement) => {
			const indicator = root.querySelector<HTMLElement>('.remotes-connection-indicator');
			if (!indicator || indicator.hidden) {
				return undefined;
			}
			const icon = indicator.querySelector<HTMLElement>('.codicon')!;
			return {
				icon: icon.className, color: dom.getWindow(icon).getComputedStyle(icon).color,
				hiddenFromScreenReader: indicator.getAttribute('aria-hidden'),
			};
		};
		const expected = [
			{ label: 'Connected', icon: 'codicon codicon-circle-filled', color: 'rgb(34, 136, 34)' },
			{ label: 'Available', icon: 'codicon codicon-circle', color: 'rgb(34, 102, 204)' },
			{ label: 'Offline', icon: 'codicon codicon-circle-slash-compact', color: 'rgb(136, 136, 136)' },
			{ label: 'Available', icon: 'codicon codicon-circle', color: 'rgb(34, 102, 204)' },
			{ label: 'Offline', icon: 'codicon codicon-circle-slash-compact', color: 'rgb(136, 136, 136)' },
			{ label: 'Connected', icon: 'codicon codicon-circle-filled', color: 'rgb(34, 136, 34)' },
			{ label: 'Available', icon: 'codicon codicon-circle', color: 'rgb(34, 102, 204)' },
			{ label: 'Available', icon: 'codicon codicon-circle', color: 'rgb(34, 102, 204)' },
			{ label: 'Available', icon: 'codicon codicon-circle', color: 'rgb(34, 102, 204)' },
			{ label: 'Available', icon: 'codicon codicon-circle', color: 'rgb(34, 102, 204)' },
		];
		const rows = states.map(remote => {
			model.remotes.set([remote], undefined);
			const row = parent.querySelector<HTMLElement>(`[data-remote-id="${base.id}"]`)!;
			const list = read(row);
			const hover = hoverContents.get(row.querySelector<HTMLElement>('.remotes-status-column .remotes-metadata')!);
			const isLeading = row.firstElementChild?.classList.contains('remotes-status-column');
			return { list, hover, isLeading, accessible: getRowStatus(row) === hover };
		});
		model.remotes.set([base], undefined);
		runMenuAction(parent, base.id, 'locationPreference');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const actual = states.map((remote, index) => {
			model.remotes.set([remote], undefined);
			return { ...rows[index], detail: read(details.querySelector<HTMLElement>('.remotes-recovery-status')!) };
		});
		assert.deepStrictEqual(actual, expected.map(({ label, ...presentation }, index) => ({
			list: label ? { ...presentation, hiddenFromScreenReader: 'true' } : undefined,
			detail: index === 3 || index === 4 || index === 8
				? { icon: 'codicon codicon-warning', color: 'rgb(170, 136, 0)', hiddenFromScreenReader: 'true' }
				: index === 9 ? { icon: 'codicon codicon-loading-compact codicon-modifier-spin', color: 'rgb(0, 0, 0)', hiddenFromScreenReader: 'true' }
					: !label ? undefined
						: { ...presentation, hiddenFromScreenReader: 'true' },
			hover: label, isLeading: false, accessible: true,
		})));
	});

	test('status glyphs retain a visible hover hit area', () => {
		const { parent } = createWidget(OperatingSystem.Windows);
		feedbackStyles(parent);
		const results = [...parent.querySelectorAll<HTMLElement>('.remotes-table-container [data-remote-id]')].map(root => {
			const slot = root.querySelector<HTMLElement>('.remotes-status-column')!;
			const label = slot.querySelector<HTMLElement>('.remotes-metadata')!;
			const icon = label.querySelector<HTMLElement>('.codicon')!;
			const rect = icon.getBoundingClientRect();
			return {
				width: label.getBoundingClientRect().width >= rect.width && rect.width > 0,
				height: label.getBoundingClientRect().height >= rect.height && rect.height > 0,
				hit: label.contains(label.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
			};
		});
		assert.deepStrictEqual(results, Array.from({ length: 3 }, () => ({ width: true, height: true, hit: true })));
	});

	test('Last Activity shows live session activity when connected and connection history when disconnected or offline', async () => {
		const { parent, model } = createWidget(OperatingSystem.Windows);
		feedbackStyles(parent);
		const now = Date.now();
		const remote = {
			...model.remotes.get()[0],
			metadata: { observedAt: now, lastActivityAt: now - 60_000, lastConnectedAt: now - 120_000, observedSessionCount: 3 },
		};
		const values = [];
		let clippedWithoutEllipsis = false;
		for (const availability of ['online', 'offline'] as const) {
			for (const connectionStatus of [RemoteAgentHostConnectionStatus.connected, RemoteAgentHostConnectionStatus.disconnected]) {
				model.remotes.set([{ ...remote, availability, connectionStatus }], undefined);
				values.push(parent.querySelector('[data-remote-id] .remotes-activity-column')?.textContent);
				const activity = parent.querySelector<HTMLElement>('.remotes-table-container [data-remote-id] .remotes-activity-column .remotes-metadata > span')!;
				clippedWithoutEllipsis ||= activity.scrollWidth > activity.clientWidth && dom.getWindow(activity).getComputedStyle(activity).textOverflow !== 'ellipsis';
			}
		}
		model.remotes.set([{ ...remote, metadata: { observedAt: now }, connectionStatus: RemoteAgentHostConnectionStatus.disconnected }], undefined);
		assert.deepStrictEqual({ values, clippedWithoutEllipsis, unknown: parent.querySelector('[data-remote-id] .remotes-activity-column')?.textContent }, {
			values: [
				'1 min ago', '1 min ago',
				'1 min ago', '1 min ago',
			],
			unknown: '',
			clippedWithoutEllipsis: false,
		});
		await organize(parent, 'remotes.sort.activity');
		model.remotes.set([
			{ ...remote, id: 'ssh:old', name: 'A', metadata: { observedAt: now, lastActivityAt: now - 90_000 } },
			{ ...remote, id: 'ssh:connection', name: 'B', metadata: { observedAt: now, lastConnectedAt: now } },
			{ ...remote, id: 'ssh:activity', name: 'C', metadata: { observedAt: now, lastActivityAt: now - 30_000, lastConnectedAt: now - 120_000 } },
			{ ...remote, id: 'ssh:none', name: 'D', metadata: undefined },
		], undefined);
		assert.deepStrictEqual([...parent.querySelectorAll<HTMLElement>('.remotes-table-container [data-remote-id]')].map(row => row.dataset.remoteId), ['ssh:connection', 'ssh:activity', 'ssh:old', 'ssh:none']);
	});

	test('cached session activity is not presented or sorted as current before reconciliation', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows);
		const now = Date.now();
		const base = model.remotes.get()[0];
		const cached = {
			...base, id: 'ssh:cached', name: 'A cached', metadataIsStale: true,
			metadata: { observedAt: now, observedSessionCount: 20, lastActivityAt: now, lastConnectedAt: now - 120_000 },
		};
		const current = {
			...base, id: 'ssh:current', name: 'B current',
			metadata: { observedAt: now, observedSessionCount: 1, lastActivityAt: now - 60_000 },
		};
		model.remotes.set([cached, current], undefined);
		await organize(parent, 'remotes.sort.activity');
		const read = () => ({
			rows: [...parent.querySelectorAll<HTMLElement>('.remotes-table-container [data-remote-id]')].map(row => ({
				id: row.dataset.remoteId,
				activity: row.querySelector('.remotes-activity-column')?.textContent,
			})),
			accessibleCachedCount: widget.getAccessibilityContent().includes('20 sessions'),
		});
		const beforeReconciliation = read();
		widget.setSearchQuery('Last activity: now');
		const cachedActivitySearchMatches = parent.querySelectorAll('[data-remote-id]').length;
		widget.setSearchQuery('');
		model.remotes.set([{ ...cached, metadataIsStale: false }, current], undefined);
		assert.deepStrictEqual({ beforeReconciliation, cachedActivitySearchMatches, afterReconciliation: read() }, {
			beforeReconciliation: {
				rows: [
					{ id: 'ssh:current', activity: '1 min ago' },
					{ id: 'ssh:cached', activity: '2 mins ago' },
				],
				accessibleCachedCount: false,
			},
			cachedActivitySearchMatches: 0,
			afterReconciliation: {
				rows: [
					{ id: 'ssh:cached', activity: 'now' },
					{ id: 'ssh:current', activity: '1 min ago' },
				],
				accessibleCachedCount: true,
			},
		});
	});

	test('Last Activity shows only time and caps unavailable ages strictly beyond seven days, retaining sessions in hovers', () => {
		const now = 1_800_000_000_000;
		const clock = useFakeTimers({ now, toFake: ['Date'] });
		store.add(toDisposable(() => clock.restore()));
		const { parent, model, hoverContents } = createWidget(OperatingSystem.Windows, 'default');
		const day = 86_400_000;
		const base = model.remotes.get()[0];
		const observations = [
			{ ...base, metadata: { observedAt: now, observedSessionCount: 2, lastActivityAt: now - 60_000 } },
			{ ...base, metadata: { observedAt: now, observedSessionCount: 0, lastActivityAt: now - 60_000 } },
			{ ...base, metadata: { observedAt: now, observedSessionCount: 2, lastActivityAt: now - 8 * day } },
			{ ...base, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, metadata: { observedAt: now, observedSessionCount: 2, lastActivityAt: now - 60_000 } },
			{ ...base, availability: 'offline' as const, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, metadata: { observedAt: now, lastConnectedAt: now - 7 * day } },
			{ ...base, availability: 'offline' as const, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, metadata: { observedAt: now, lastConnectedAt: now - 7 * day - 1 } },
			{ ...base, availability: 'unknown' as const, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, lastHeartbeatAt: now - 8 * day, reportedSessionCount: 5 },
			{ ...base, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, metadata: undefined },
		].map(remote => {
			model.remotes.set([remote], undefined);
			const cell = parent.querySelector<HTMLElement>('[data-remote-id] .remotes-activity-column .remotes-metadata')!;
			const tooltip = hoverContents.get(cell);
			return {
				label: cell.textContent, detailsRetained: !cell.textContent || !!tooltip && tooltip !== cell.textContent && tooltip.includes('ago'),
				sessions: tooltip?.match(/^\d+ sessions?/m)?.[0],
			};
		});
		assert.deepStrictEqual(observations, [
			{ label: '1 min ago', detailsRetained: true, sessions: '2 sessions' },
			{ label: '1 min ago', detailsRetained: true, sessions: '0 sessions' },
			{ label: '1 wk ago', detailsRetained: true, sessions: '2 sessions' },
			{ label: '1 min ago', detailsRetained: true, sessions: undefined },
			{ label: '7 days ago', detailsRetained: true, sessions: undefined },
			{ label: '>7 days ago', detailsRetained: true, sessions: undefined },
			{ label: '>7 days ago', detailsRetained: true, sessions: '5 sessions' },
			{ label: '', detailsRetained: true, sessions: undefined },
		]);
	});

	test('column headers reverse sorting by pointer and keyboard and keep unknown system values last', async () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'default', 1400);
		const base = model.remotes.get()[0];
		model.remotes.set([
			{ ...base, id: 'ssh:alpha', name: 'Alpha', metadata: { observedAt: 1, operatingSystem: OperatingSystem.Windows } },
			{ ...base, id: 'ssh:beta', name: 'Beta', metadata: { observedAt: 1, operatingSystem: OperatingSystem.Linux } },
			{ ...base, id: 'ssh:gamma', name: 'Gamma', metadata: undefined },
		], undefined);
		const names = () => [...parent.querySelectorAll('[data-remote-id] .remotes-name')].map(node => node.textContent);
		const name = parent.querySelector<HTMLElement>('.monaco-table-th[data-col-index="0"] .remotes-sort-header')!;
		name.click();
		const ascending = names();
		name.focus();
		name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		const descending = names();
		const focusedAfterSorting = dom.getActiveElement() === name;
		const nameSort = name.getAttribute('aria-label');
		const system = parent.querySelector<HTMLElement>('.monaco-table-th[data-col-index="3"] .remotes-sort-header')!;
		system.click();
		const systemsAscending = names();
		system.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true, cancelable: true }));
		const systemsDescending = names();
		const menuSort = getOrganizationActions(parent).flatMap(action => action instanceof SubmenuAction ? action.actions : []).filter(action => action.checked).map(action => action.id);
		await organize(parent, 'remotes.resetFilters');
		assert.deepStrictEqual({
			ascending, descending, focusedAfterSorting, nameSort, systemsAscending, systemsDescending, menuSort,
			resetSort: parent.querySelector('.monaco-table-th[data-col-index="1"] .remotes-sort-header')?.getAttribute('aria-label'),
		}, {
			ascending: ['Alpha', 'Beta', 'Gamma'], descending: ['Gamma', 'Beta', 'Alpha'], focusedAfterSorting: true, nameSort: 'Name, sorted descending. Sort Name ascending',
			systemsAscending: ['Beta', 'Alpha', 'Gamma'], systemsDescending: ['Alpha', 'Beta', 'Gamma'],
			menuSort: ['remotes.sort.system', 'remotes.group.none'], resetSort: 'Status, sorted ascending. Sort Status descending',
		});
	});

	test('zebra rows use the table palette without painting over selected rows or group headings', () => {
		const { parent, widget, model } = createWidget(OperatingSystem.Windows, 'default');
		const remotes = model.remotes.get();
		model.remotes.set([...remotes, { ...remotes[0], id: 'ssh:second' }], undefined);
		parent.style.setProperty('--vscode-keybindingTable-rowsBackground', 'rgb(40, 50, 60)');
		const row = parent.querySelector<HTMLElement>('.monaco-list-row[data-parity="odd"]')!;
		const content = row.querySelector<HTMLElement>('.monaco-table-tr')!;
		const background = () => dom.getWindow(content).getComputedStyle(content).backgroundColor;
		const idle = background();
		row.classList.add('selected');
		const selected = background();
		row.classList.remove('selected');
		widget.setGrouping('status');
		const groupBackgrounds = [...parent.querySelectorAll<HTMLElement>('.remotes-group-row')].map(row => dom.getWindow(row).getComputedStyle(row).backgroundColor);
		assert.deepStrictEqual({ idle, selected, groupBackgrounds, oddGroup: !!parent.querySelector('.monaco-list-row[data-parity="odd"] .remotes-group-row') }, {
			idle: 'rgb(40, 50, 60)', selected: 'rgba(0, 0, 0, 0)', groupBackgrounds: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'], oddGroup: true,
		});
	});

	test('sortable headers have inner spacing aligned with row values and release focus when hidden', () => {
		const { parent, widget } = createWidget(OperatingSystem.Windows, 'default', 1400);
		feedbackStyles(parent);
		parent.style.setProperty('--vscode-spacing-size100', '10px');
		parent.style.setProperty('--vscode-spacing-size200', '20px');
		widget.layout();
		const header = parent.querySelector<HTMLElement>('.monaco-table-th[data-col-index="3"] .remotes-sort-header')!;
		const cell = parent.querySelector<HTMLElement>('[data-remote-id] .remotes-system-column')!;
		const label = header.firstElementChild!.getBoundingClientRect();
		const bounds = header.getBoundingClientRect();
		const cellBounds = cell.getBoundingClientRect();
		const cellStyle = dom.getWindow(cell).getComputedStyle(cell);
		const spacing = {
			insideHover: label.left > bounds.left && label.right < bounds.right,
			aligned: label.left === cellBounds.left + parseFloat(cellStyle.paddingLeft),
			paddedBothSides: parseFloat(cellStyle.paddingLeft) >= 12 && cellStyle.paddingLeft === cellStyle.paddingRight,
		};
		header.focus();
		parent.style.width = '500px';
		widget.layout();
		const focusedList = dom.getActiveElement()?.classList.contains('monaco-list');
		assert.deepStrictEqual({ ...spacing, focusedList }, { insideHover: true, aligned: true, paddedBothSides: true, focusedList: true });
	});

	test('status groups use consistent icons and compact chevron spacing without dimming offline names', () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'status');
		feedbackStyles(parent);
		parent.style.setProperty('--vscode-foreground', '#dddddd');
		parent.style.setProperty('--vscode-descriptionForeground', '#888888');
		parent.style.setProperty('--vscode-testing-iconPassed', '#22aa22');
		parent.style.setProperty('--vscode-charts-blue', '#2266ff');
		parent.style.setProperty('--vscode-spacing-size40', '4px');
		parent.style.setProperty('--vscode-spacing-size80', '8px');
		parent.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([
			...model.remotes.get(),
			{ id: 'environment:offline', kind: 'environment', name: 'Offline environment', detail: 'offline', canRemove: true, unavailableReason: 'Offline', availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		], undefined);
		const groups = [...parent.querySelectorAll<HTMLElement>('.remotes-group-row')];
		const offline = parent.querySelector<HTMLElement>('[data-remote-id="environment:offline"]')!;
		assert.deepStrictEqual({
			icons: groups.map(group => group.querySelector('.remotes-name-icon .codicon')?.className),
			counts: groups.map(group => group.querySelector('.monaco-count-badge')?.textContent),
			colors: groups.map(group => dom.getWindow(group).getComputedStyle(group.querySelector('.remotes-name-icon .codicon')!).color),
			offlineColor: dom.getWindow(offline).getComputedStyle(offline).color,
			noGroupingDropdown: parent.querySelector('.remotes-group-by') === null,
		}, {
			icons: ['codicon codicon-circle-filled', 'codicon codicon-circle', 'codicon codicon-circle-slash-compact'],
			counts: ['1', '2', '1'], colors: ['rgb(34, 170, 34)', 'rgb(34, 102, 255)', 'rgb(136, 136, 136)'],
			offlineColor: 'rgb(221, 221, 221)', noGroupingDropdown: true,
		});
		assert.deepStrictEqual(groups.map(group => {
			const chevron = group.querySelector<HTMLElement>('.remotes-group-chevron')!;
			const icon = group.querySelector<HTMLElement>('.remotes-name-icon .codicon')!;
			const gap = icon.getBoundingClientRect().left - chevron.getBoundingClientRect().right;
			return {
				icon: icon.className, compactGap: gap >= 0 && gap <= 12,
				size: dom.getWindow(icon).getComputedStyle(icon).fontSize,
			};
		}), [
			{ icon: 'codicon codicon-circle-filled', compactGap: true, size: '12px' },
			{ icon: 'codicon codicon-circle', compactGap: true, size: '12px' },
			{ icon: 'codicon codicon-circle-slash-compact', compactGap: true, size: '12px' },
		]);
	});

	test('group counts retain the standard badge shape and task pages replace the overview', () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'status');
		parent.style.setProperty('--vscode-toolbar-hoverBackground', '#333333');
		parent.style.setProperty('--vscode-descriptionForeground', '#aaaaaa');
		parent.style.setProperty('--vscode-spacing-size160', '16px');
		parent.style.setProperty('--vscode-spacing-size100', '10px');
		parent.style.setProperty('--vscode-spacing-size60', '6px');
		parent.style.setProperty('--vscode-spacing-size280', '28px');
		parent.style.setProperty('--vscode-spacing-size120', '12px');
		parent.style.setProperty('--vscode-spacing-size320', '32px');
		const remote = model.remotes.get()[0];
		model.remotes.set([
			remote,
			...Array.from({ length: 12 }, (_, index) => ({ ...remote, id: `ssh:other-${index}`, name: `Other ${index}`, connectionStatus: RemoteAgentHostConnectionStatus.disconnected })),
		], undefined);
		const badges = [...parent.querySelectorAll<HTMLElement>('.remotes-group-count:not([hidden]) .monaco-count-badge')].map(element => ({
			count: element.textContent, compact: element.getBoundingClientRect().width < 32,
			rounded: dom.getWindow(element).getComputedStyle(element).borderRadius,
			background: dom.getWindow(element).getComputedStyle(element).backgroundColor,
		}));
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const child = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const owner = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!;
		const expanded = {
			owner: child.querySelector('.remotes-details-owner')?.textContent,
			inTable: !!child.closest('.monaco-list-row'),
			overviewHidden: parent.querySelector<HTMLElement>('.remotes-overview')!.hidden,
			title: child.querySelector('.remotes-task-title')?.textContent,
			noDeviceIcon: owner.querySelector<HTMLElement>('.remotes-name-icon')?.hidden,
		};
		child.querySelector<HTMLElement>('.remotes-details-actions .secondary')!.click();
		assert.deepStrictEqual({ badges, expanded, restored: !parent.querySelector<HTMLElement>('.remotes-overview')!.hidden }, {
			badges: [{ count: '1', compact: true, rounded: '11px', background: 'rgb(51, 51, 51)' }, { count: '12', compact: true, rounded: '11px', background: 'rgb(51, 51, 51)' }],
			expanded: { owner: remote.name, inTable: false, overviewHidden: true, title: 'Agent run behavior', noDeviceIcon: true }, restored: true,
		});
	});

	test('long labels ellipsize within their columns and dividers appear on intent', () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'status');
		parent.style.setProperty('--vscode-tree-tableColumnsBorder', '#123456');
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:long', kind: 'environment', name: 'Very long environment name '.repeat(20), detail: 'long',
			canRemove: true, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
		const table = parent.querySelector<HTMLElement>('.monaco-table')!;
		const header = table.querySelector<HTMLElement>(':scope > .monaco-split-view2')!;
		const label = table.querySelector<HTMLElement>('[data-remote-id] .remotes-name')!;
		const cell = label.closest('.monaco-table-td')!;
		const idle = dom.getWindow(header).getComputedStyle(header).borderBottomColor;
		table.classList.add('hovered');
		const hovered = dom.getWindow(header).getComputedStyle(header).borderBottomColor;
		assert.deepStrictEqual({
			ellipsis: dom.getWindow(label).getComputedStyle(label).textOverflow,
			truncated: label.scrollWidth > label.clientWidth,
			contained: label.getBoundingClientRect().right <= cell.getBoundingClientRect().right,
			idle, hovered,
		}, { ellipsis: 'ellipsis', truncated: true, contained: true, idle: 'rgba(0, 0, 0, 0)', hovered: 'rgb(18, 52, 86)' });
	});

	test('status grouping moves connected hosts once and retains their identity', async () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'status');
		const read = () => [...parent.querySelectorAll<HTMLElement>('.monaco-table-tr')].map(row => row.dataset.remoteId ?? row.querySelector('.remotes-name')?.textContent);
		getConnectionAction(parent, 'tunnel:laptop').click();
		await timeout(0);
		const connected = read();
		getConnectionAction(parent, 'tunnel:laptop').click();
		await timeout(0);
		assert.deepStrictEqual({ connected, disconnected: read(), changes: model.connectionChanges }, {
			connected: ['Connected', 'ssh:build', 'tunnel:laptop', 'Available', 'wsl:Ubuntu'],
			disconnected: ['Connected', 'ssh:build', 'Available', 'tunnel:laptop', 'wsl:Ubuntu'],
			changes: [{ id: 'tunnel:laptop', connected: true }, { id: 'tunnel:laptop', connected: false }],
		});
	});

	test('orders enabled sections like the Environment picker in the table and accessible view', () => {
		const { widget, parent, model } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'desktop', canRemove: true,
			availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
		const headings = ['GitHub Environments', 'Dev Tunnels', 'WSL', 'SSH'];
		assert.deepStrictEqual({
			table: [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent),
			accessible: widget.getAccessibilityContent().split('\n').filter(line => headings.includes(line)),
		}, { table: headings, accessible: headings });
	});

	test('aligns compact rows under resizable column headers', () => {
		const { parent } = createWidget();
		feedbackStyles(parent);
		const headers = [...parent.querySelectorAll<HTMLElement>('.monaco-table-th')];
		const row = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!;
		const cells = [...row.querySelectorAll<HTMLElement>('.monaco-table-td')];
		assert.deepStrictEqual({
			values: [row.querySelector('.remotes-name')?.textContent, row.querySelector('.remotes-type-column')?.textContent],
			aligned: cells.every((cell, index) => Math.abs(cell.getBoundingClientRect().x - headers[index].getBoundingClientRect().x) < 1),
			rowHeight: row.getBoundingClientRect().height,
			groupHeight: parent.querySelector('.remotes-group-row')!.getBoundingClientRect().height,
			headerHeight: headers[1].getBoundingClientRect().height,
			actionsWidth: headers[headers.length - 2].getBoundingClientRect().width === 224,
			sashes: parent.querySelectorAll('.monaco-sash.vertical').length > 0,
			actionsFit: [...row.querySelectorAll<HTMLElement>('.remotes-actions-column > .monaco-button:not([hidden])')].every(button => {
				const bounds = button.getBoundingClientRect();
				const rowBounds = row.getBoundingClientRect();
				return bounds.top >= rowBounds.top + 3 && bounds.bottom <= rowBounds.bottom - 3;
			}),
		}, {
			values: ['Build server', 'SSH'], aligned: true,
			rowHeight: 28, groupHeight: 32, headerHeight: 30, actionsWidth: true, sashes: true, actionsFit: true,
		});
	});

	test('fits typical metadata and reserves the same action space when connections change', async () => {
		const { parent, widget, model } = createWidget(OperatingSystem.Windows, 'status', 910);
		await renderIcons(parent);
		parent.style.font = '13px "Segoe UI", sans-serif';
		for (const size of [40, 60, 80, 100, 160]) {
			parent.style.setProperty(`--vscode-spacing-size${size}`, `${size / 10}px`);
		}
		const remote: ICustomizationRemote = {
			id: 'environment:build', kind: 'environment', name: 'devbox-chocobo', detail: 'Build environment',
			canRemove: false, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
			metadata: { operatingSystem: OperatingSystem.Windows, lastConnectedAt: Date.now() - 7_200_000, observedAt: Date.now() },
		};
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([remote], undefined);
		widget.layout();
		const row = parent.querySelector<HTMLElement>('[data-remote-id="environment:build"]')!;
		const nameWidth = row.querySelector<HTMLElement>('.remotes-name-column')!.clientWidth;
		const fits = [...row.querySelectorAll<HTMLElement>('.remotes-name, .remotes-metadata > span')].every(label => label.scrollWidth <= label.clientWidth);
		const disconnectedWidth = row.querySelector<HTMLElement>('.remotes-actions-column')!.clientWidth;
		model.remotes.set([{ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.connected }], undefined);
		widget.layout();
		const actions = parent.querySelector<HTMLElement>('[data-remote-id="environment:build"] .remotes-actions-column')!;
		const bounds = actions.getBoundingClientRect();
		const controls = [...actions.querySelectorAll<HTMLElement>(':scope > :not([hidden])')];
		assert.deepStrictEqual({
			fits, nameRetainsSpace: nameWidth >= 180, disconnectedWidth,
			connectedWidth: actions.clientWidth,
			connectedActionsFit: controls.every(control => control.getBoundingClientRect().right <= bounds.right),
		}, { fits: true, nameRetainsSpace: true, disconnectedWidth: 224, connectedWidth: 224, connectedActionsFit: true });
	});

	for (const width of [360, 879, 880, 900, 1400]) {
		test(`fits readable columns without horizontal scrolling from startup through resizing at width ${width}`, () => {
			const { parent, widget } = createWidget(OperatingSystem.Windows, 'status', width);
			parent.style.setProperty('--vscode-spacing-size100', '10px');
			parent.style.setProperty('--vscode-fontWeight-semiBold', '600');
			parent.style.font = '13px "Segoe UI", sans-serif';
			const headers = [...parent.querySelectorAll<HTMLElement>('.monaco-table-th')].filter(header => header.textContent);
			const layouts = [width, 360, 1400, width].map(layoutWidth => {
				parent.style.width = `${layoutWidth}px`;
				widget.layout();
				const clippedHeaders = headers.filter(header => header.getBoundingClientRect().width > 0).filter(header => {
					const range = document.createRange();
					range.selectNodeContents(header);
					const style = dom.getWindow(header).getComputedStyle(header);
					return range.getBoundingClientRect().width > header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
				}).map(header => header.textContent);
				const container = parent.querySelector<HTMLElement>('.remotes-table-container')!;
				const table = container.querySelector<HTMLElement>('.monaco-table')!;
				const row = table.querySelector<HTMLElement>('[data-remote-id]')!;
				return {
					clippedHeaders,
					fitsViewport: table.getBoundingClientRect().width === container.clientWidth,
					noHorizontalOverflow: container.scrollWidth === container.clientWidth && row.scrollWidth === row.clientWidth,
					actionsReachable: row.querySelector<HTMLElement>('.remotes-actions-column')!.getBoundingClientRect().right <= container.getBoundingClientRect().right,
				};
			});
			assert.deepStrictEqual(layouts, Array.from({ length: 4 }, () => ({
				clippedHeaders: [], fitsViewport: true, noHorizontalOverflow: true, actionsReachable: true,
			})));
		});
	}

	test('task context outlasts secondary connection columns through resizing while hidden fields stay usable', async () => {
		const { parent, widget, model } = createWidget(OperatingSystem.Windows, 'default', 1400);
		const remote = model.remotes.get()[0];
		model.remotes.set([{
			...remote,
			metadata: { operatingSystem: OperatingSystem.Linux, architecture: 'arm64', observedSessionCount: 2, observedAt: Date.now() },
		}], undefined);
		const layouts = [1400, 1200, 900, 700, 360, 900, 1400].map(width => {
			parent.style.width = `${width}px`;
			widget.layout();
			const container = parent.querySelector<HTMLElement>('.remotes-table-container')!;
			const row = container.querySelector<HTMLElement>('[data-remote-id]')!;
			return {
				columns: [...container.querySelectorAll<HTMLElement>('.monaco-table-th')]
					.filter(cell => cell.clientWidth > 0 && dom.getWindow(cell).getComputedStyle(cell).display !== 'none')
					.map(cell => cell.textContent).filter(Boolean),
				fits: row.scrollWidth === row.clientWidth && container.scrollWidth === container.clientWidth,
				height: row.getBoundingClientRect().height,
			};
		});
		parent.style.width = '900px';
		widget.layout();
		const matches = ['build.example.com', 'SSH', 'arm64'].map(query => {
			widget.setSearchQuery(query);
			return parent.querySelectorAll('[data-remote-id]').length;
		});
		runMenuAction(parent, remote.id, 'copyAddress');
		await timeout(0);
		const accessible = widget.getAccessibilityContent();
		assert.deepStrictEqual({
			layouts, matches, copies: model.copiedAddresses, connections: model.connectionChanges,
			accessibleOrder: accessible.indexOf('2 sessions') < accessible.indexOf('Linux')
				&& accessible.indexOf('Linux') < accessible.indexOf('Connection type: SSH')
				&& accessible.indexOf('Connection type: SSH') < accessible.indexOf('Address: build.example.com'),
		}, {
			layouts: [
				['Name', 'Status', 'Last Activity', 'System', 'Type', 'Sandbox Profile'],
				['Name', 'Status', 'Last Activity', 'System', 'Type', 'Sandbox Profile'],
				['Name', 'Status', 'Last Activity', 'System', 'Sandbox Profile'],
				['Name', 'Status', 'System', 'Sandbox Profile'],
				['Name', 'Status'],
				['Name', 'Status', 'Last Activity', 'System', 'Sandbox Profile'],
				['Name', 'Status', 'Last Activity', 'System', 'Type', 'Sandbox Profile'],
			].map(columns => ({ columns, fits: true, height: 28 })),
			matches: [1, 1, 1], copies: [remote.id], connections: [], accessibleOrder: true,
		});
	});

	test('compact lists retain session and connection actions in the menu and recover focus on resize', async () => {
		const { parent, widget, model, sessionActions } = createWidget(OperatingSystem.Windows, 'status', 1400);
		parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-new-session')!.focus();
		parent.style.width = '360px';
		widget.layout();
		const compact = {
			focusRecovered: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
			buttonHidden: dom.getWindow(parent).getComputedStyle(getConnectionAction(parent, 'ssh:build')).display === 'none',
		};
		runMenuAction(parent, 'ssh:build', 'newSession');
		await timeout(0);
		runMenuAction(parent, 'ssh:build', 'actions');
		await timeout(0);
		parent.style.width = '1400px';
		widget.layout();
		const connect = getConnectionAction(parent, 'ssh:build');
		assert.deepStrictEqual({
			compact, sessionActions, connections: model.connectionChanges,
			restored: { label: connect.textContent?.trim(), visible: dom.getWindow(connect).getComputedStyle(connect).display !== 'none' },
		}, {
			compact: { focusRecovered: true, buttonHidden: true },
			sessionActions: ['open', 'agenthost-remote-build'], connections: [{ id: 'ssh:build', connected: false }],
			restored: { label: 'Connect', visible: true },
		});
	});

	test('lists this machine\'s profiles, assigns a copy to the host without connecting, and is disabled for disconnected or unsupported hosts', () => {
		const { parent, addHost, model, storageService } = createWidget();
		const laptop = addHost('tunnel:laptop', new TestSandboxProfilesHost());
		const strict: ISandboxProfile = { id: 'strict', name: 'Strict', settings: { [AgentSandboxSettingId.AgentSandboxAllowNetwork]: false } };
		writeSandboxProfiles(storageService, [strict]);
		const picker = (id: string) => parent.querySelector<HTMLSelectElement>(`[data-remote-id="${id}"] select`)!;
		const state = (id: string) => ({ disabled: picker(id).disabled, dimmed: picker(id).closest('.remotes-sandbox-profile-picker')!.classList.contains('disabled'), title: picker(id).title, options: Array.from(picker(id).options, option => option.text), selected: picker(id).options[picker(id).selectedIndex]?.text });
		const listed = state('tunnel:laptop');
		picker('tunnel:laptop').selectedIndex = 1;
		picker('tunnel:laptop').dispatchEvent(new Event('change'));
		const assigned = laptop.values[AgentHostSandboxConfigKey.SandboxProfile];
		picker('tunnel:laptop').selectedIndex = 0;
		picker('tunnel:laptop').dispatchEvent(new Event('change'));
		const disconnected = state('ssh:build');
		addHost('ssh:build', new TestSandboxProfilesHost(false));
		assert.deepStrictEqual({
			listed, assigned, cleared: laptop.values[AgentHostSandboxConfigKey.SandboxProfile], disconnected, unsupported: state('ssh:build'), connections: model.connectionChanges,
		}, {
			listed: { disabled: false, dimmed: false, title: '', options: ['Default', 'Strict'], selected: 'Default' },
			assigned: { id: 'strict', name: 'Strict', sandbox: { allowNetwork: false } },
			cleared: {},
			disconnected: { disabled: true, dimmed: true, title: '', options: ['Default'], selected: 'Default' },
			unsupported: { disabled: true, dimmed: true, title: '', options: ['Default'], selected: 'Default' },
			connections: [],
		});
	});

	test('a disconnected host shows its last-known assignment, disabled, also after reopening; reconnecting shows the host\'s current assignment without writing to it', () => {
		const first = createWidget();
		const host = new TestSandboxProfilesHost();
		first.addHost('tunnel:laptop', host);
		assignHostSandboxProfile(host, { id: 's1', name: 'S1', settings: {} });
		const state = (device: typeof first) => {
			const picker = device.parent.querySelector<HTMLSelectElement>('[data-remote-id="tunnel:laptop"] select')!;
			return { disabled: picker.disabled, selected: picker.options[picker.selectedIndex].text, label: picker.getAttribute('aria-label') };
		};
		const connected = state(first);
		first.disconnectHost('tunnel:laptop');
		const disconnected = state(first);
		const reopened = createWidget(OperatingSystem.Macintosh, 'type', 900, first.storageService);
		const reopenedState = state(reopened);
		// Another device assigns S2 while this machine is offline.
		assignHostSandboxProfile(host, { id: 's2', name: 'S2', settings: {} });
		first.addHost('tunnel:laptop', host);
		const reconnected = state(first);
		first.disconnectHost('tunnel:laptop');
		assert.deepStrictEqual({ connected, disconnected, reopened: reopenedState, reconnected, host: (host.values[AgentHostSandboxConfigKey.SandboxProfile] as { id: string }).id, disconnectedAgain: state(first) }, {
			connected: { disabled: false, selected: 'S1 (on host)', label: 'Sandbox profile for Laptop' },
			disconnected: { disabled: true, selected: 'S1 (on host)', label: 'Sandbox profile for Laptop: S1, last known. Connect to Laptop to refresh or change it.' },
			reopened: { disabled: true, selected: 'S1 (on host)', label: 'Sandbox profile for Laptop: S1, last known. Connect to Laptop to refresh or change it.' },
			reconnected: { disabled: false, selected: 'S2 (on host)', label: 'Sandbox profile for Laptop' },
			host: 's2',
			disconnectedAgain: { disabled: true, selected: 'S2 (on host)', label: 'Sandbox profile for Laptop: S2, last known. Connect to Laptop to refresh or change it.' },
		});
	});
	test('another device sees the assigned profile, can save it to its own profiles, and the last assignment wins', () => {
		const host = store.add(new TestSandboxProfilesHost());
		const deviceA = createWidget();
		const deviceB = createWidget();
		const strict: ISandboxProfile = { id: 'strict', name: 'Strict', settings: { [AgentSandboxSettingId.AgentSandboxAllowNetwork]: false } };
		const open: ISandboxProfile = { id: 'open', name: 'Open', settings: { [AgentSandboxSettingId.AgentSandboxAllowNetwork]: true } };
		writeSandboxProfiles(deviceA.storageService, [strict]);
		writeSandboxProfiles(deviceB.storageService, [open]);
		deviceA.addHost('tunnel:laptop', host);
		deviceB.addHost('tunnel:laptop', host);
		const picker = (device: typeof deviceA) => device.parent.querySelector<HTMLSelectElement>('[data-remote-id="tunnel:laptop"] select')!;
		const state = (device: typeof deviceA) => ({ options: Array.from(picker(device).options, option => option.text), selected: picker(device).options[picker(device).selectedIndex]?.text });
		const choose = (device: typeof deviceA, text: string) => {
			const select = picker(device);
			select.selectedIndex = Array.from(select.options, option => option.text).indexOf(text);
			select.dispatchEvent(new Event('change'));
		};
		choose(deviceA, 'Strict');
		const seenByB = state(deviceB);
		choose(deviceB, 'Save "Strict" to My Profiles');
		const savedByB = { state: state(deviceB), library: readSandboxProfiles(deviceB.storageService).map(profile => [profile.id, profile.name, profile.settings[AgentSandboxSettingId.AgentSandboxAllowNetwork]]), host: (host.values[AgentHostSandboxConfigKey.SandboxProfile] as { id: string }).id };
		choose(deviceB, 'Open');
		assert.deepStrictEqual({ seenByB, savedByB, seenByA: state(deviceA), host: (host.values[AgentHostSandboxConfigKey.SandboxProfile] as { id: string }).id }, {
			seenByB: { options: ['Default', 'Open', SeparatorSelectOption.text, 'Strict (on host)', 'Save "Strict" to My Profiles'], selected: 'Strict (on host)' },
			savedByB: { state: { options: ['Default', 'Open', 'Strict'], selected: 'Strict' }, library: [['open', 'Open', true], ['strict', 'Strict', false]], host: 'strict' },
			seenByA: { options: ['Default', 'Strict', SeparatorSelectOption.text, 'Open (on host)', 'Save "Open" to My Profiles'], selected: 'Open (on host)' },
			host: 'open',
		});
	});

	test('sandbox profile picker keeps navigation keys from moving table focus and is hidden on non-remote rows', () => {
		const { parent } = createWidget();
		parent.querySelector('[data-remote-id="tunnel:laptop"] .remotes-name')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		const picker = parent.querySelector<HTMLSelectElement>('[data-remote-id="tunnel:laptop"] select')!;
		for (const [key, keyCode] of [['ArrowDown', 40], ['ArrowUp', 38]] as const) {
			picker.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
		}
		const sandboxProfileCells = [...parent.querySelectorAll<HTMLElement>('.monaco-list-row .remotes-sandboxProfile-column')];
		assert.deepStrictEqual({
			focusedRemote: parent.querySelector<HTMLElement>('.monaco-list-row.focused [data-remote-id]')?.dataset.remoteId,
			hiddenOnRemoteRows: sandboxProfileCells.some(cell => cell.closest('[data-remote-id]') && cell.classList.contains('remotes-cell-action-hidden')),
			hiddenOnOtherRows: sandboxProfileCells.filter(cell => !cell.closest('[data-remote-id]')).every(cell => cell.classList.contains('remotes-cell-action-hidden')),
		}, { focusedRemote: 'tunnel:laptop', hiddenOnRemoteRows: false, hiddenOnOtherRows: true });
	});

	test('shows the sandbox profile column only while sandbox profiles are enabled', () => {
		const { parent, widget, configurationService } = createWidget();
		widget.layout();
		const hidden = () => parent.querySelector('.remotes-hide-sandbox-profile') !== null;
		const setEnabled = (enabled: boolean) => {
			configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxProfilesEnabled, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === AgentSandboxSettingId.AgentSandboxProfilesEnabled }));
			return hidden();
		};
		assert.deepStrictEqual({ enabled: hidden(), disabled: setEnabled(false), reenabled: setEnabled(true) }, { enabled: false, disabled: true, reenabled: false });
	});

	test('keeps trailing content and actions clear of the vertical scrollbar through resizing', async () => {
		const { parent, widget, model } = createWidget(OperatingSystem.Windows, 'status', 1400);
		await renderIcons(parent);
		parent.style.height = '220px';
		parent.style.font = '13px "Segoe UI", sans-serif';
		for (const size of [40, 60, 100, 160]) {
			parent.style.setProperty(`--vscode-spacing-size${size}`, `${size / 10}px`);
		}
		const results = [];
		for (const width of [1400, 880, 360, 1400]) {
			parent.style.width = `${width}px`;
			for (const { connectionStatus, lastConnectionError } of [
				{ connectionStatus: RemoteAgentHostConnectionStatus.connected },
				{ connectionStatus: RemoteAgentHostConnectionStatus.connecting },
				{ connectionStatus: RemoteAgentHostConnectionStatus.reconnecting },
				{ connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
				{ connectionStatus: RemoteAgentHostConnectionStatus.disconnected, lastConnectionError: 'Connection refused' },
			]) {
				model.remotes.set(Array.from({ length: 20 }, (_, index) => ({
					id: `ssh:${index}`, kind: 'ssh' as const, name: `Build server ${index}`, detail: 'build.example.com',
					canRemove: true, availability: 'online' as const, connectionStatus, lastConnectionError,
				})), undefined);
				widget.layout();
				await timeout(0);
				const table = parent.querySelector<HTMLElement>('.monaco-table')!;
				const scrollbar = table.querySelector<HTMLElement>('.monaco-list .scrollbar.vertical')!;
				const actions = table.querySelector<HTMLElement>('[data-remote-id] .remotes-actions-column')!;
				const controls = [...actions.querySelectorAll<HTMLElement>('.monaco-button, .monaco-toolbar')];
				const scrollbarBounds = scrollbar.getBoundingClientRect();
				results.push({
					contentClear: actions.getBoundingClientRect().right <= scrollbarBounds.left - 4,
					actionsFit: controls.every(control => control.getBoundingClientRect().right <= actions.getBoundingClientRect().right),
					actionsClear: controls.every(control => control.getBoundingClientRect().right <= scrollbarBounds.left - 4),
					scrollable: scrollbarBounds.width > 0 && table.querySelector('.monaco-list-rows')!.getBoundingClientRect().height > scrollbarBounds.height,
				});
			}
		}
		assert.deepStrictEqual(results, Array.from({ length: 20 }, () => ({ contentClear: true, actionsFit: true, actionsClear: true, scrollable: true })));
	});

	test('groups use a labelled disclosure instead of a separate gutter action', () => {
		const { parent } = createWidget();
		parent.style.setProperty('--vscode-spacing-size80', '8px');
		assert.deepStrictEqual({
			groups: parent.querySelectorAll('.monaco-list-row[aria-expanded] .remotes-group-chevron').length > 0,
			firstColumn: parent.querySelector('.monaco-table-th')!.textContent,
		}, { groups: true, firstColumn: 'Name' });
	});

	test('Name owns group disclosures and Status is a separate labelled column through resizing', async () => {
		const { parent, widget } = createWidget(OperatingSystem.Windows);
		feedbackStyles(parent);
		const table = parent.querySelector<HTMLElement>('.monaco-table')!;
		const results = [];
		for (const width of [1400, 900, 360, 1400]) {
			parent.style.width = `${width}px`;
			widget.layout();
			const group = table.querySelector<HTMLElement>('.remotes-group-row')!;
			const remote = table.querySelector<HTMLElement>('[data-remote-id]')!;
			const groupSlot = group.querySelector<HTMLElement>('.remotes-name-column')!;
			const groupLabel = group.querySelector<HTMLElement>('.remotes-name')!;
			const name = remote.querySelector<HTMLElement>('.remotes-name')!;
			const chevron = group.querySelector<HTMLElement>('.remotes-group-chevron:not([hidden])')!;
			results.push({
				disclosureInSlot: groupSlot.contains(chevron),
				labelsAligned: Math.abs(groupLabel.getBoundingClientRect().left - name.getBoundingClientRect().left) < 1,
				availability: remote.querySelector('.remotes-status-column')?.textContent,
				order: remote.querySelector('.remotes-status-column')?.previousElementSibling?.classList.contains('remotes-name-column'),
			});
		}
		const groupRow = () => table.querySelector<HTMLElement>('.remotes-group-row')!.closest('.monaco-list-row')!;
		groupRow().querySelector<HTMLElement>('.remotes-group-chevron:not([hidden])')!.click();
		await timeout(0);
		const collapsed = groupRow().getAttribute('aria-expanded');
		groupRow().querySelector<HTMLElement>('.remotes-group-chevron:not([hidden])')!.click();
		await timeout(0);
		assert.deepStrictEqual({ results, collapsed, expanded: groupRow().getAttribute('aria-expanded') }, {
			results: [1400, 900, 360, 1400].map(() => ({
				disclosureInSlot: true, labelsAligned: true, availability: 'Available', order: true,
			})),
			collapsed: 'false', expanded: 'true',
		});
	});

	test('a connection failure keeps Connect with a warning in the row and Connect in the overflow', async () => {
		const { parent, widget, model, hoverContents } = createWidget();
		parent.style.setProperty('--vscode-spacing-size60', '6px');
		const error = 'connect ECONNREFUSED 127.0.0.1:43192';
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? {
			...remote, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, lastConnectionError: error,
		} : remote), undefined);
		const warning = getConnectionAction(parent, 'ssh:build');
		const row = warning.closest('.monaco-list-row')!;
		const failed = {
			label: warning.textContent?.trim(), warningIcon: isWarningShown(warning), hover: hoverContents.get(warning), aria: row.getAttribute('aria-label'),
			actionAria: warning.getAttribute('aria-label'), failedCell: warning.parentElement!.classList.contains('remotes-connection-failed'),
			accessible: widget.getAccessibilityContent().includes(error),
			nameActions: row.querySelectorAll('.remotes-name-column .monaco-button:not([hidden])').length,
			visibleAtRest: dom.getWindow(warning).getComputedStyle(warning.parentElement!).opacity,
			menu: getMenuActions(parent, 'ssh:build').filter(action => action.id === 'remotes.actions').map(action => action.label),
		};
		model.pendingConnection = new DeferredPromise<void>();
		runMenuAction(parent, 'ssh:build', 'actions');
		const connecting = { label: warning.textContent?.trim(), warningIcon: isWarningShown(warning), hover: hoverContents.get(warning) };
		await model.pendingConnection.complete();
		await timeout(0);
		const connected = { label: warning.textContent?.trim(), warningIcon: isWarningShown(warning), hover: hoverContents.get(warning), accessible: widget.getAccessibilityContent().includes(error) };
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.disconnected })), undefined);
		assert.deepStrictEqual({ failed, connecting, connected, disconnected: warning.textContent?.trim(), connections: model.connectionChanges }, {
			failed: {
				label: 'Connect', warningIcon: true, hover: `Connection failed: ${error}`,
				aria: `Build server. Status: Available. Connection failed: ${error} Connection type: SSH. Address: build.example.com.`,
				actionAria: `Connect to Build server. Connection failed: ${error}`, failedCell: true,
				accessible: true, nameActions: 0, visibleAtRest: '1', menu: ['Connect'],
			},
			connecting: { label: 'Connecting', warningIcon: false, hover: 'Connecting: Build server' },
			connected: { label: 'Disconnect', warningIcon: false, hover: 'Disconnect from Build server. Sessions may continue running on the remote computer.', accessible: false },
			disconnected: 'Connect',
			connections: [{ id: 'ssh:build', connected: true }],
		});
	});

	test('keeps Connect visible at rest with a warning when the server needs an update', () => {
		const { parent, model, widget, hoverContents } = createWidget();
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? {
			...remote, connectionStatus: RemoteAgentHostConnectionStatus.incompatible('The remote server needs an update.', ['1']),
		} : remote), undefined);
		const action = getConnectionAction(parent, 'ssh:build');
		assert.deepStrictEqual({
			label: action.textContent?.trim(), warningIcon: isWarningShown(action), hover: hoverContents.get(action), actionAria: action.getAttribute('aria-label'),
			visibleAtRest: dom.getWindow(action).getComputedStyle(action.parentElement!).opacity,
			accessible: widget.getAccessibilityContent().includes('Update required: The remote server needs an update.'),
		}, {
			label: 'Connect', warningIcon: true, hover: 'Update required: The remote server needs an update.',
			actionAria: 'Connect to Build server. Update required: The remote server needs an update.', visibleAtRest: '1', accessible: true,
		});
	});

	for (const width of [700, 360]) {
		test(`can scroll the complete final empty row into the viewport at width ${width}`, async () => {
			const { parent, widget, model } = createWidget(OperatingSystem.Linux);
			parent.style.width = `${width}px`;
			parent.style.height = '220px';
			model.remotes.set(Array.from({ length: 20 }, (_, i) => ({
				id: `tunnel:${i}`, kind: 'tunnel' as const, name: `Host ${i}`, detail: `${i}`, canRemove: false,
				availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
			})), undefined);
			model.failedKinds = ['ssh'];
			widget.setVisible(true);
			await timeout(0);
			widget.layout();
			widget.scrollToBottom();
			await timeout(0);
			const empty = parent.querySelector<HTMLElement>('.remotes-empty-row')!;
			assert.ok(empty, 'The final empty SSH row is rendered after scrolling');
			const bottom = parent.querySelector('.remotes-table-container')!.getBoundingClientRect().bottom;
			assert.ok(empty.getBoundingClientRect().bottom <= bottom, 'The entire empty row is inside the visible viewport');
			const link = empty.querySelector<HTMLElement>('.monaco-link')!;
			link.focus();
			link.click();
			assert.ok(link.getBoundingClientRect().bottom <= bottom, 'The setup link remains visible and reachable');
		});
	}

	test('automatic retries show progress in the primary action and restore the failure warning', () => {
		const { parent, widget, model, hoverContents } = createWidget();
		const update = (connectionStatus: RemoteAgentHostConnectionStatus, lastConnectionError?: string) => {
			model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? { ...remote, connectionStatus, lastConnectionError } : remote), undefined);
			const warning = getConnectionAction(parent, 'ssh:build');
			return {
				label: warning.textContent?.trim(), warningIcon: isWarningShown(warning), hover: hoverContents.get(warning),
				accessible: widget.getAccessibilityContent().includes('Connection failed:'),
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
			{ label: 'Connect', warningIcon: true, hover: 'Connection failed: First failure', accessible: true },
			{ label: 'Connecting', warningIcon: false, hover: 'Connecting: Build server', accessible: false },
			{ label: 'Connect', warningIcon: true, hover: 'Connection failed: Second failure', accessible: true },
			{ label: 'Reconnecting', warningIcon: false, hover: 'Reconnecting: Build server', accessible: false },
			{ label: 'Disconnect', warningIcon: false, hover: 'Disconnect from Build server. Sessions may continue running on the remote computer.', accessible: false },
			{ label: 'Connect', warningIcon: false, hover: 'Connect to Build server', accessible: false },
		]);
	});

	for (const width of [1000, 360]) {
		test(`connection actions keep a shared trailing edge through failure and progress states at width ${width}`, () => {
			const { parent, widget, model } = createWidget();
			parent.style.width = `${width}px`;
			parent.style.setProperty('--vscode-spacing-size100', '10px');
			parent.style.setProperty('--vscode-spacing-size60', '6px');
			parent.style.setProperty('--vscode-spacing-size80', '8px');
			widget.layout();
			const positions = [
				RemoteAgentHostConnectionStatus.disconnected,
				RemoteAgentHostConnectionStatus.connecting,
				RemoteAgentHostConnectionStatus.reconnecting,
			].map(connectionStatus => {
				model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? { ...remote, connectionStatus, lastConnectionError: 'Connection refused' } : remote), undefined);
				const warning = getConnectionAction(parent, 'ssh:build');
				const cell = warning.parentElement!;
				const overflow = cell.querySelector<HTMLElement>('.codicon-toolbar-more')!;
				const visible = dom.getWindow(warning).getComputedStyle(warning).display !== 'none';
				return {
					right: visible ? warning.getBoundingClientRect().right : undefined,
					separated: warning.getBoundingClientRect().right < overflow.getBoundingClientRect().left,
				};
			});
			assert.deepStrictEqual(positions, [
				{ right: width < 700 ? undefined : positions[1].right, separated: true },
				{ right: positions[1].right, separated: true },
				{ right: positions[1].right, separated: true },
			]);
		});
	}

	test('failure row text hovers are mouse-positioned so they do not cover the wheel target', async () => {
		const { parent, widget, model, mouseHoverTargets } = createWidget();
		model.remotes.set([model.remotes.get()[0]], undefined);
		model.failedKinds = ['tunnel'];
		widget.setVisible(true);
		await timeout(0);
		const text = [...parent.querySelectorAll<HTMLElement>('.remotes-empty-row .remotes-name, .remotes-empty-row .remotes-empty-description')];
		assert.ok(text.length > 0 && text.every(target => mouseHoverTargets.has(target)));
	});

	test('row actions are trailing aligned and revealed on hover or keyboard focus', () => {
		const { parent } = createWidget();
		const row = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!.closest<HTMLElement>('.monaco-list-row')!;
		const actions = row.querySelector<HTMLElement>('.remotes-actions-column')!;
		const snapshot = () => ({ opacity: dom.getWindow(actions).getComputedStyle(actions).opacity, pointerEvents: dom.getWindow(actions).getComputedStyle(actions).pointerEvents });
		const idle = snapshot();
		row.classList.add('hovered');
		const hovered = snapshot();
		row.classList.remove('hovered');
		getConnectionAction(parent, 'ssh:build').focus();
		const focused = snapshot();
		assert.deepStrictEqual({ idle, hovered, focused, alignment: dom.getWindow(actions).getComputedStyle(actions).justifyContent }, {
			idle: { opacity: '0', pointerEvents: 'auto' },
			hovered: { opacity: '1', pointerEvents: 'auto' },
			focused: { opacity: '1', pointerEvents: 'auto' },
			alignment: 'flex-end',
		});
	});

	test('overflow targets stay aligned across mixed rows and connection changes through resizing', async () => {
		const { parent, widget, model } = createWidget(OperatingSystem.Windows, 'default', 1400);
		feedbackStyles(parent);
		parent.style.font = '13px "Segoe UI", sans-serif';
		const host = (id: string, availability: ICustomizationRemote['availability'], connectionStatus: RemoteAgentHostConnectionStatus, lastConnectionError?: string): ICustomizationRemote => ({
			id, kind: 'ssh', name: id, detail: id, canRemove: true, availability, connectionStatus, lastConnectionError,
		});
		const remotes = [
			host('ssh:connected', 'online', RemoteAgentHostConnectionStatus.connected),
			host('ssh:available', 'online', RemoteAgentHostConnectionStatus.disconnected),
			host('ssh:offline', 'offline', RemoteAgentHostConnectionStatus.disconnected),
			host('ssh:checking', 'online', RemoteAgentHostConnectionStatus.connecting),
			host('ssh:failed', 'online', RemoteAgentHostConnectionStatus.disconnected, 'Connection refused'),
		];
		model.remotes.set(remotes, undefined);
		await timeout(0);
		const results = [];
		const columnGeometry = () => [...parent.querySelectorAll('.monaco-table-th')].map(header => {
			const { x, width } = header.getBoundingClientRect();
			return [x, width];
		});
		const wideWidth = Math.min(900, dom.getWindow(parent).innerWidth - 24);
		for (const width of [wideWidth, 360, wideWidth]) {
			parent.style.width = `${width}px`;
			widget.layout();
			const targets = () => [...parent.querySelectorAll<HTMLElement>('[data-remote-id] .codicon-toolbar-more')].map(button => button.getBoundingClientRect());
			const before = targets();
			const columns = columnGeometry();
			model.remotes.set(remotes.map(remote => ({ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.disconnected })), undefined);
			widget.layout();
			await timeout(0);
			const after = targets();
			const row = parent.querySelector<HTMLElement>('[data-remote-id="ssh:offline"]')!.closest<HTMLElement>('.monaco-list-row')!;
			row.classList.add('hovered');
			const button = row.querySelector<HTMLElement>('.codicon-toolbar-more')!;
			const bounds = button.getBoundingClientRect();
			const hit = parent.ownerDocument.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
			assert.ok(hit && button.contains(hit), JSON.stringify({ width, button: bounds.toJSON(), hit: hit?.outerHTML.slice(0, 400), hitBounds: hit?.getBoundingClientRect().toJSON() }));
			results.push({
				aligned: before.length === remotes.length && before.every(rect => rect.left === before[0].left && rect.right === before[0].right),
				targetSize: before.every(rect => rect.width === 24 && rect.height === 24),
				stableTargets: after.every(rect => rect.left === before[0].left && rect.right === before[0].right),
				stableColumns: JSON.stringify(columnGeometry()) === JSON.stringify(columns),
				hit: !!hit && button.contains(hit),
			});
			row.classList.remove('hovered');
			model.remotes.set(remotes, undefined);
		}
		assert.deepStrictEqual(results, Array.from({ length: 3 }, () => ({
			aligned: true, targetSize: true, stableTargets: true, stableColumns: true, hit: true,
		})));
	});

	for (const state of ['connected', 'disconnected', 'offline'] as const) {
		test(`overflow visibility action hides and restores ${state} remotes without changing their connection`, async () => {
			const { parent, model, widget } = createWidget();
			const connected = state === 'connected';
			if (!connected) {
				model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build'
					? { ...remote, availability: state === 'offline' ? 'offline' : 'online', connectionStatus: RemoteAgentHostConnectionStatus.disconnected } : remote), undefined);
			}
			const row = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!;
			const marked = () => !!parent.querySelector('[data-remote-id="ssh:build"] .remotes-picker-hidden:not([hidden])');
			row.click();
			const before = getMenuAction(parent, 'ssh:build', 'visibility').label;
			runMenuAction(parent, 'ssh:build', 'visibility');
			await timeout(0);
			const hidden = {
				label: getMenuAction(parent, 'ssh:build', 'visibility').label,
				marked: marked(),
				connection: getRowStatus(row),
				accessible: widget.getAccessibilityContent().includes('Build server (hidden from environment picker)'),
			};
			widget.setSearchQuery('build');
			widget.setVisible(true);
			await timeout(0);
			const retained = parent.querySelectorAll('[data-remote-id="ssh:build"]').length;
			runMenuAction(parent, 'ssh:build', 'visibility');
			await timeout(0);
			assert.deepStrictEqual({
				before, hidden, retained,
				restored: model.remotes.get().find(remote => remote.id === 'ssh:build')?.hidden, restoredMarked: marked(),
				visibilityChanges: model.visibilityChanges, connectionChanges: model.connectionChanges, managementChanges: model.managementChanges,
			}, {
				before: 'Hide from Environment Picker',
				hidden: { label: 'Show in Environment Picker', marked: true, connection: state === 'offline' ? 'Offline' : state === 'connected' ? 'Connected' : 'Available', accessible: true },
				retained: 1, restored: false, restoredMarked: false,
				visibilityChanges: [{ id: 'ssh:build', hidden: true }, { id: 'ssh:build', hidden: false }],
				connectionChanges: [], managementChanges: [],
			});
		});
	}

	test('an open row menu retains its environment when discovery recycles the row', async () => {
		const { parent, model } = createWidget();
		const remote = model.remotes.get().find(remote => remote.id === 'ssh:build')!;
		model.remotes.set([remote, { ...remote, id: 'ssh:other', name: 'Other server' }], undefined);
		const visibility = getMenuAction(parent, remote.id, 'visibility');
		model.remotes.set(model.remotes.get().map(item => item.id === remote.id ? { ...item, name: 'Z server' } : item), undefined);
		await store.add(new ActionRunner()).run(visibility);
		assert.deepStrictEqual({
			label: visibility.label,
			visibilityChanges: model.visibilityChanges,
			connectionChanges: model.connectionChanges,
			managementChanges: model.managementChanges,
		}, {
			label: 'Hide from Environment Picker',
			visibilityChanges: [{ id: remote.id, hidden: true }],
			connectionChanges: [], managementChanges: [],
		});
	});

	test('row actions expose only the connection button and overflow, with deletion last in the menu', () => {
		const { parent, model } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:online', kind: 'environment', name: 'Online host', detail: 'online',
			availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, canRemove: true,
		}], undefined);
		const row = parent.querySelector<HTMLElement>('[data-remote-id]')!;
		assert.deepStrictEqual({
			buttons: [...row.querySelectorAll('.remotes-actions-column [role="button"]:not([hidden])')].map(button => button.textContent),
			menu: getMenuActions(parent, 'environment:online').map(action => action.id),
			visibilityChanges: model.visibilityChanges, connectionChanges: model.connectionChanges,
		}, {
			buttons: ['Connect', ''],
			menu: ['remotes.actions', 'vs.actions.separator', 'remotes.visibility', 'vs.actions.separator', 'remotes.rename', 'remotes.troubleshoot', 'remotes.delete'],
			visibilityChanges: [], connectionChanges: [],
		});
	});

	for (const hidden of [false, true]) {
		test(`unavailable remotes explain their absence instead of offering a visibility toggle (hidden: ${hidden})`, () => {
			const { parent, model, widget } = createWidget(OperatingSystem.Windows);
			const remote: ICustomizationRemote = {
				id: 'wsl:Debian', kind: 'wsl', name: 'Debian', detail: 'Debian', canRemove: false, hidden,
				availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
				pickerUnavailableReason: 'This remote can\'t appear as a separate entry in the environment picker.',
			};
			model.remotes.set([remote], undefined);
			const row = parent.querySelector<HTMLElement>('[data-remote-id]')!;
			const marked = () => !!row.querySelector('.remotes-picker-hidden:not([hidden])');
			const action = getMenuAction(parent, remote.id, 'visibility');
			const unavailable = {
				label: action.label, tooltip: action.tooltip, disabled: !action.enabled, marked: marked(),
				accessible: widget.getAccessibilityContent().includes('not shown in environment picker: This remote can\'t appear as a separate entry'),
			};
			runMenuAction(parent, remote.id, 'visibility');
			model.remotes.set([{ ...remote, pickerUnavailableReason: undefined }], undefined);
			const restoredAction = getMenuAction(parent, remote.id, 'visibility');
			assert.deepStrictEqual({
				unavailable,
				restored: {
					label: restoredAction.label, disabled: !restoredAction.enabled, marked: marked(),
					unavailableClass: row.classList.contains('remotes-row-picker-unavailable'),
				},
				visibilityChanges: model.visibilityChanges, connectionChanges: model.connectionChanges,
			}, {
				unavailable: {
					label: 'Show in Environment Picker',
					tooltip: 'This remote can\'t appear as a separate entry in the environment picker.',
					disabled: true, marked: false, accessible: true,
				},
				restored: {
					label: hidden ? 'Show in Environment Picker' : 'Hide from Environment Picker',
					disabled: false, marked: hidden, unavailableClass: false,
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
		parent.querySelector<HTMLElement>('.monaco-list-row[aria-expanded]')!.click();
		widget.setSearchQuery('build.example');
		assert.deepStrictEqual({
			remotes: [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId),
			expanded: parent.querySelector('.remotes-group-row')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
		}, { remotes: ['ssh:build'], expanded: 'true' });
	});

	test('Rename in overflow prevents duplicate management actions', async () => {
		const { parent, model } = createWidget();
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'ssh:build', 'rename');
		runMenuAction(parent, 'ssh:build', 'rename');
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			changes: model.managementChanges,
			enabled: getMenuAction(parent, 'ssh:build', 'rename').enabled,
			name: parent.querySelector('[data-remote-id="ssh:build"] .remotes-name')?.textContent,
		}, { changes: [{ id: 'ssh:build', action: 'rename' }], enabled: true, name: 'Renamed remote' });
	});

	test('remote overflow and context menus keep connection, organization, copy, and management groups consistent after refresh', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: true,
			availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
		}], undefined);
		const rows = () => [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')];
		const actions = () => rows().map(row => menuLabels(getMenuActions(parent, row.dataset.remoteId!)));
		const before = actions();
		widget.setVisible(true);
		await timeout(0);
		const expected = [
			['Connect', '---', 'Hide from Environment Picker', '---', 'Rename...', 'Troubleshoot Connection...', 'Remove Environment...'],
			['Connect', '---', 'Hide from Environment Picker', '---', 'Rename...', 'Configure Agent Run Behavior...', 'Troubleshoot Connection...', 'Delete Dev Tunnel...'],
			['Connect', 'Restart Distribution...', '---', 'Hide from Environment Picker', '---', 'Rename...', 'Troubleshoot Connection...'],
			['New Session', 'Disconnect', '---', 'Hide from Environment Picker', '---', 'Copy Address', '---', 'Rename...', 'Configure Agent Run Behavior...', 'Troubleshoot Connection...'],
		];
		assert.deepStrictEqual({
			before, after: actions(), contextMenus: rows().map(row => menuLabels(getContextMenuActions(parent, row))), changes: model.managementChanges,
		}, { before: expected, after: expected, contextMenus: expected, changes: [] });
	});

	test('Delete works offline, prevents duplicate actions and restores keyboard focus', async () => {
		const { parent, model } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: true,
			availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Offline',
		}], undefined);
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'environment:desktop', 'delete');
		assert.deepStrictEqual(model.managementChanges, [{ id: 'environment:desktop', action: 'remove' }]);
		runMenuAction(parent, 'environment:desktop', 'delete');
		const busy = {
			deletion: !getMenuAction(parent, 'environment:desktop', 'delete').enabled,
			rename: !getMenuAction(parent, 'environment:desktop', 'rename').enabled,
		};
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			busy, changes: model.managementChanges,
			remaining: parent.querySelector('[data-remote-id="environment:desktop"]') !== null,
			focused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { busy: { deletion: true, rename: true }, changes: [{ id: 'environment:desktop', action: 'remove' }], remaining: false, focused: true });
	});

	test('tunnel Delete in overflow is distinct from Remove and guarded while pending', async () => {
		const { parent, model } = createWidget();
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'tunnel:laptop', 'delete');
		runMenuAction(parent, 'tunnel:laptop', 'delete');
		const disabled = !getMenuAction(parent, 'tunnel:laptop', 'delete').enabled;
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			disabled, deleted: model.tunnelDeletions, removed: model.managementChanges,
			present: !!parent.querySelector('[data-remote-id="tunnel:laptop"]'),
			focused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { disabled: true, deleted: ['tunnel:laptop'], removed: [], present: false, focused: true });
	});

	test('failed tunnel deletion reports the error and keeps Delete available for retry', async () => {
		const { parent, model, errors } = createWidget();
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'tunnel:laptop', 'delete');
		const error = new Error('Tunnel deletion forbidden');
		await model.pendingManagement.error(error);
		await timeout(0);
		assert.deepStrictEqual({ errors, enabled: getMenuAction(parent, 'tunnel:laptop', 'delete').enabled, deleted: model.tunnelDeletions }, {
			errors: [error], enabled: true, deleted: ['tunnel:laptop'],
		});
	});

	test('tunnel Delete tracks deletion capability independently of local removal', () => {
		const { parent, model } = createWidget();
		const remote = model.remotes.get().find(remote => remote.kind === 'tunnel')!;
		const states = [false, true, false].map(canDelete => {
			model.remotes.set([{ ...remote, canDelete }], undefined);
			return !!findMenuAction(parent, 'tunnel:laptop', 'delete');
		});
		assert.deepStrictEqual(states, [false, true, false]);
	});

	test('SSH Delete appears in overflow only for eligible saved hosts', async () => {
		const { parent, model } = createWidget();
		const ssh = model.remotes.get().find(remote => remote.kind === 'ssh')!;
		const configuredDelete = !!findMenuAction(parent, 'ssh:build', 'delete');
		model.remotes.set([{ ...ssh, canDelete: true }], undefined);
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'ssh:build', 'delete');
		runMenuAction(parent, 'ssh:build', 'delete');
		const busy = !getMenuAction(parent, 'ssh:build', 'delete').enabled;
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			configuredDelete, busy, deleted: model.sshDeletions, removed: model.managementChanges,
			present: !!parent.querySelector('[data-remote-id="ssh:build"]'),
			focused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { configuredDelete: false, busy: true, deleted: ['ssh:build'], removed: [], present: false, focused: true });
	});

	test('SSH Delete disappears when the host becomes configured again', () => {
		const { parent, model } = createWidget();
		const ssh = model.remotes.get().find(remote => remote.kind === 'ssh')!;
		const states = [true, false].map(canDelete => {
			model.remotes.set([{ ...ssh, canDelete }], undefined);
			return !!findMenuAction(parent, 'ssh:build', 'delete');
		});
		assert.deepStrictEqual(states, [true, false]);
	});

	test('saved SSH connections distinguish forgetting a connection from updating the remote server', () => {
		const { parent, model } = createWidget();
		const ssh = model.remotes.get().find(remote => remote.kind === 'ssh')!;
		model.remotes.set([{
			...ssh, canDelete: true, canUpdateServer: true,
			connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1'], ['2'], 'vendor/update'),
		}], undefined);
		assert.deepStrictEqual(getMenuActions(parent, ssh.id).map(action => action.id === 'vs.actions.separator' ? '---' : action.label), [
			'Connect', '---',
			'Hide from Environment Picker', '---',
			'Copy Address', '---',
			'Rename...', 'Configure Agent Run Behavior...', 'Troubleshoot Connection...', 'Update Server', 'Forget SSH Connection...',
		]);
	});

	test('Copy Address appears only on rows with a pasteable address and copies without changing connections', async () => {
		const { parent, model } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:offline', name: 'Offline', kind: 'environment', detail: 'host', canRemove: true,
			availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Offline',
		}], undefined);
		const ids = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId!);
		const copyable = ids.filter(id => !!findMenuAction(parent, id, 'copyAddress'));
		for (const id of copyable) {
			runMenuAction(parent, id, 'copyAddress');
			await timeout(0);
		}
		assert.deepStrictEqual({ copyable, copied: model.copiedAddresses, connections: model.connectionChanges }, { copyable: ['ssh:build'], copied: ['ssh:build'], connections: [] });
	});

	test('extension rows name their registering extension, find it by search and show it on request', async () => {
		const { parent, model, widget, commands, hoverContents, mouseHoverTargets } = createWidget();
		model.remotes.set([...model.remotes.get(), {
			id: '127.0.0.1:8445', kind: 'extension', name: 'Jobs', detail: '127.0.0.1:8445', canRemove: false,
			contributedBy: { extensionId: 'publisher.jobs', displayName: 'Job Runner' },
			availability: 'unknown', connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
		const row = parent.querySelector<HTMLElement>('[data-remote-id="127.0.0.1:8445"]')!;
		const detail = row.querySelector<HTMLElement>('.remotes-name-detail')!;
		const extensionAction = getMenuAction(parent, '127.0.0.1:8445', 'showExtension');
		runMenuAction(parent, '127.0.0.1:8445', 'showExtension');
		await timeout(0);
		widget.setSearchQuery('job runner');
		assert.deepStrictEqual({
			details: [...parent.querySelectorAll<HTMLElement>('.remotes-name-detail:not([hidden])')].map(element => element.textContent),
			detailHover: mouseHoverTargets.has(detail) ? hoverContents.get(detail) : undefined,
			extensionAction: extensionAction.label,
			commands,
			searched: [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId),
		}, {
			details: ['Registered by the Job Runner extension'],
			detailHover: 'Registered by the Job Runner extension',
			extensionAction: 'Show Job Runner Extension',
			commands: [[MANAGE_EXTENSION_COMMAND_ID, 'publisher.jobs']],
			searched: ['127.0.0.1:8445'],
		});
	});

	for (const id of ['ssh:build', 'tunnel:laptop']) {
		test(`${id} run behavior opens a task page and saves an explicit choice once`, async () => {
			const { parent, model } = createWidget();
			model.pendingManagement = new DeferredPromise<void>();
			runMenuAction(parent, id, 'locationPreference');
			const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
			const choices = details.querySelectorAll<HTMLElement>('[role="radio"]');
			const actionOrder = [...details.querySelectorAll('.remotes-details-footer .monaco-button')].map(button => button.textContent);
			choices[0].click();
			const save = details.querySelector<HTMLElement>('.remotes-details-actions .monaco-button:not(.secondary)')!;
			save.click();
			save.click();
			const busy = save.getAttribute('aria-disabled');
			if (id === 'ssh:build') {
				runMenuAction(parent, id, 'copyAddress');
			}
			await model.pendingManagement.complete();
			await timeout(0);
			assert.deepStrictEqual({
				busy, enabled: save.getAttribute('aria-disabled'), calls: model.locationChanges, preference: model.preferences.get(id), copied: model.copiedAddresses, actionOrder,
			}, { busy: 'true', enabled: 'true', calls: [id], preference: 'dedicated', copied: id === 'ssh:build' ? [id] : [], actionOrder: isWindows ? [id === 'ssh:build' ? 'Save and Reconnect' : 'Save', 'Cancel'] : ['Cancel', id === 'ssh:build' ? 'Save and Reconnect' : 'Save'] });
		});
	}

	test('run behavior offers Save without connecting an offline environment and updates its action with connection state', async () => {
		const { parent, model } = createWidget();
		const remote = { ...model.remotes.get()[2], availability: 'offline' as const, unavailableReason: 'The tunnel host is offline.' };
		model.remotes.set([remote], undefined);
		runMenuAction(parent, remote.id, 'locationPreference');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const save = details.querySelector<HTMLElement>('.remotes-details-footer .monaco-button:not(.secondary)')!;
		details.querySelectorAll<HTMLElement>('[role="radio"]')[0].click();
		const read = () => ({ status: details.querySelector('.remotes-recovery-status')?.textContent, label: save.textContent, disabled: save.getAttribute('aria-disabled') });
		const offline = read();
		save.click();
		await timeout(0);
		const saved = details.querySelector('.remotes-details-feedback')?.textContent;
		details.querySelectorAll<HTMLElement>('[role="radio"]')[1].click();
		model.remotes.set([{ ...remote, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected }], undefined);
		const connected = read();
		model.remotes.set([{ ...remote, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.reconnecting }], undefined);
		const reconnecting = read();
		model.remotes.set([remote], undefined);
		assert.deepStrictEqual({ offline, saved, connected, reconnecting, disconnected: read(), connectionChanges: model.connectionChanges }, {
			offline: { status: 'Offline', label: 'Save', disabled: 'false' },
			saved: '',
			connected: { status: 'Connected', label: 'Save and Reconnect', disabled: 'false' },
			reconnecting: { status: 'Reconnecting', label: 'Save', disabled: 'true' },
			disconnected: { status: 'Offline', label: 'Save', disabled: 'false' },
			connectionChanges: [],
		});
	});

	for (const saved of [false, true]) {
		test(`run behavior failure explains whether the choice was saved with only a sanitized reason when saved=${saved}`, async () => {
			const { parent, model, widget } = createWidget();
			model.pendingManagement = new DeferredPromise<void>();
			runMenuAction(parent, 'tunnel:laptop', 'locationPreference');
			const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
			details.querySelector<HTMLElement>('[role="radio"]')!.click();
			const save = details.querySelector<HTMLElement>('.remotes-details-footer .monaco-button:not(.secondary)')!;
			save.click();
			if (saved) {
				model.preferences.set('tunnel:laptop', 'dedicated');
			}
			await model.pendingManagement.error(new Error('Reconnect failed token=private-value'));
			await timeout(0);
			const secretShown = details.textContent?.includes('private-value');
			details.querySelector<HTMLElement>('.remotes-task-back .action-label')!.click();
			assert.deepStrictEqual({
				secretShown,
				message: details.querySelector('.remotes-details-feedback')?.textContent,
				retryDisabled: save.getAttribute('aria-disabled'),
				backNavigated: !widget.detailsVisible.get(),
			}, {
				secretShown: false,
				message: saved
					? 'Your choice was saved, but reconnection failed: Reconnect failed token=[redacted]'
					: 'Couldn\'t save your choice. Try again.',
				retryDisabled: String(saved),
				backNavigated: true,
			});
		});
	}

	test('task Back preserves the overview query and filter and restores row focus', () => {
		const { parent, widget } = createWidget();
		searchForText(parent, 'SSH');
		widget.setSearchQuery('build');
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const task = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		task.querySelectorAll<HTMLElement>('[role="radio"]')[1].click();
		const visibleContent = widget.getAccessibilityContent();
		task.querySelector<HTMLElement>('.remotes-task-back .action-label')!.click();
		assert.deepStrictEqual({
			pageVisible: widget.detailsVisible.get(),
			overviewHidden: parent.querySelector<HTMLElement>('.remotes-overview')!.hidden,
			query: parent.querySelector<HTMLInputElement>('.remotes-search-row input')!.value,
			ids: [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId),
			focus: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
			scopedContent: visibleContent.includes('Agent run behavior') && !visibleContent.includes('Ready to use'),
		}, { pageVisible: false, overviewHidden: false, query: 'build', ids: ['ssh:build'], focus: true, scopedContent: true });
	});

	test('task choices survive refresh, cancel without applying, and close when their environment disappears', () => {
		const { parent, model } = createWidget();
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		details.querySelectorAll<HTMLElement>('[role="radio"]')[1].click();
		model.remotes.set([...model.remotes.get()], undefined);
		const retained = parent.querySelector('.remotes-environment-details') === details;
		const selection = details.querySelector('[aria-checked="true"]')?.textContent;
		details.querySelector<HTMLElement>('.remotes-details-actions .secondary')!.click();
		const cancelled = !parent.querySelector('.remotes-environment-details');
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		model.remotes.set(model.remotes.get().filter(remote => remote.id !== 'ssh:build'), undefined);
		assert.deepStrictEqual({ retained, selectedEditor: selection?.startsWith('Use Remote VS Code'), cancelled, removed: !parent.querySelector('.remotes-environment-details'), changes: model.locationChanges }, {
			retained: true, selectedEditor: true, cancelled: true, removed: true, changes: [],
		});
	});

	test('run behavior distinguishes the saved choice from a pending selection and updates it after saving', async () => {
		const { parent, model, widget } = createWidget();
		model.preferences.set('ssh:build', 'dedicated');
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const choices = details.querySelectorAll<HTMLElement>('[role="radio"]');
		choices[1].click();
		const read = () => [...choices].map(choice => ({
			selected: choice.getAttribute('aria-checked'),
			current: choice.querySelector<HTMLElement>('.remotes-choice-current')?.hidden ? '' : choice.querySelector('.remotes-choice-current')?.textContent,
		}));
		const readAccessible = () => {
			const content = widget.getAccessibilityContent();
			return { choices: content.split('\n').slice(-2), savedBadges: content.match(/Saved preference/g)?.length ?? 0 };
		};
		const pending = read();
		const pendingAccessible = readAccessible();
		details.querySelector<HTMLElement>('.remotes-details-actions .monaco-button:not(.secondary)')!.click();
		await timeout(0);
		assert.deepStrictEqual({ pending, pendingAccessible, saved: read(), savedAccessible: readAccessible(), preference: model.preferences.get('ssh:build') }, {
			pending: [{ selected: 'false', current: 'Saved preference' }, { selected: 'true', current: '' }],
			pendingAccessible: { choices: ['Saved choice: Run in the Background', 'Selected choice: Use Remote VS Code'], savedBadges: 1 },
			saved: [{ selected: 'false', current: '' }, { selected: 'true', current: 'Saved preference' }],
			savedAccessible: { choices: ['Saved choice: Use Remote VS Code', 'Selected choice: Use Remote VS Code'], savedBadges: 1 },
			preference: 'editor',
		});
	});

	test('run behavior preselects the default without saving it until confirmed', async () => {
		const { parent, widget, model } = createWidget();
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const choices = [...parent.querySelectorAll<HTMLElement>('.remotes-run-choices [role="radio"]')];
		assert.deepStrictEqual({
			choices: choices.map(choice => ({
				selected: choice.getAttribute('aria-checked'),
				description: choice.querySelector('.remotes-choice-description')?.textContent,
				label: choice.getAttribute('aria-label'),
			})), accessible: widget.getAccessibilityContent().split('\n').slice(-2),
			savedBadges: widget.getAccessibilityContent().match(/Saved preference/g)?.length ?? 0,
			saved: model.preferences.get('ssh:build'),
			saveEnabled: parent.querySelector('.remotes-details-actions .monaco-button:not(.secondary)')?.getAttribute('aria-disabled'),
		}, {
			choices: [
				{
					selected: 'true', description: 'For tasks you want to leave running. Agents can keep working after you close VS Code on the remote computer.',
					label: 'Run in the Background. For tasks you want to leave running. Agents can keep working after you close VS Code on the remote computer.',
				},
				{
					selected: 'false', description: 'Uses an open VS Code window on the remote computer when available. Agents stop when that window closes.',
					label: 'Use Remote VS Code. Uses an open VS Code window on the remote computer when available. Agents stop when that window closes.',
				},
			], accessible: ['Saved choice: None', 'Selected choice: Run in the Background'], savedBadges: 0, saved: undefined, saveEnabled: 'false',
		});
		parent.querySelector<HTMLElement>('.remotes-details-actions .monaco-button:not(.secondary)')!.click();
		await timeout(0);
		assert.deepStrictEqual({ preference: model.preferences.get('ssh:build'), changes: model.locationChanges }, { preference: 'dedicated', changes: ['ssh:build'] });
	});

	for (const id of ['ssh:build', 'tunnel:laptop']) {
		test(`${id} run behavior explains scope, save effects, and applicable connection limits with a default selection`, () => {
			const { parent, widget } = createWidget();
			runMenuAction(parent, id, 'locationPreference');
			const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
			const description = details.querySelector('.remotes-task-description')!;
			const radio = details.querySelector('[role="radiogroup"]')!;
			const question = details.querySelector('.remotes-run-question')!;
			const actionSection = details.querySelector('.remotes-run-actions')!;
			const save = actionSection.querySelector('.monaco-button:not(.secondary)')!;
			const saveHint = actionSection.querySelector('p.remotes-run-hint')!;
			const feedback = actionSection.querySelector('.remotes-details-feedback')!;
			const explanation = [...details.querySelectorAll('p')].map(paragraph => paragraph.textContent);
			const accessible = widget.getAccessibilityContent();
			assert.deepStrictEqual({
				scope: description.textContent,
				radioDescribedByScope: radio.getAttribute('aria-describedby') === description.id,
				fieldLabel: question.textContent,
				radioLabelledByField: radio.getAttribute('aria-labelledby') === question.id,
				flow: [...details.querySelector('.remotes-details-body')!.children].map(element => element.className),
				saveLabel: save.textContent,
				actionFlow: [...actionSection.children].map(element => element === saveHint ? 'hint' : element === feedback ? 'feedback' : 'buttons'),
				saveDescribedByHintAndFeedback: save.getAttribute('aria-describedby') === `${saveHint.id} ${feedback.id}`,
				saveEffects: explanation.find(text => text?.includes('Existing sessions are not moved')),
				computerRequirements: explanation.find(text => text?.includes('awake and online')),
				tunnelLimits: explanation.find(text => text?.includes('If this Dev Tunnel')) ?? null,
				explanationsAccessible: explanation.every(text => accessible.includes(text!)),
				selection: details.querySelector('[aria-checked="true"]')?.getAttribute('aria-label')?.startsWith('Run in the Background.'),
			}, {
				scope: 'Choose how agents run on this remote computer. Keep it awake and online while they work.',
				radioDescribedByScope: true,
				fieldLabel: 'Preferred run behavior',
				radioLabelledByField: true,
				flow: ['remotes-task-description remotes-run-description', 'remotes-task-identity-detail', 'remotes-run-field', 'remotes-run-actions'],
				saveLabel: id === 'ssh:build' ? 'Save and Reconnect' : 'Save',
				actionFlow: ['hint', 'buttons', 'feedback'],
				saveDescribedByHintAndFeedback: true,
				saveEffects: 'Your choice applies on the next connection. Existing sessions are not moved.',
				computerRequirements: 'Choose how agents run on this remote computer. Keep it awake and online while they work.',
				tunnelLimits: id === 'tunnel:laptop' ? 'If this Dev Tunnel is shared by VS Code, keep that remote window open to stay connected.' : null,
				explanationsAccessible: true,
				selection: true,
			});
		});
	}

	test('run behavior uses consistent status icons and follows theme color changes', () => {
		const { parent, model } = createWidget();
		parent.classList.add('monaco-workbench');
		parent.style.setProperty('--vscode-icon-foreground', '#888888');
		parent.style.setProperty('--vscode-charts-blue', '#2266cc');
		parent.style.setProperty('--vscode-testing-iconPassed', '#22aa22');
		parent.style.setProperty('--vscode-debugIcon-startForeground', '#22aa22');
		const read = (selector: string) => {
			const indicator = parent.querySelector<HTMLElement>(selector)!;
			return {
				icon: indicator.querySelector('.codicon')?.className,
				color: dom.getWindow(parent).getComputedStyle(indicator.querySelector('.codicon')!).color,
				hiddenFromScreenReader: indicator.getAttribute('aria-hidden'),
			};
		};
		const connected = { icon: 'codicon codicon-circle-filled', color: 'rgb(34, 170, 34)', hiddenFromScreenReader: 'true' };
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const details = read('.remotes-recovery-status .remotes-connection-indicator');
		parent.style.setProperty('--vscode-testing-iconPassed', '#00ff00');
		const themeChanged = read('.remotes-recovery-status .remotes-connection-indicator');
		parent.style.removeProperty('--vscode-testing-iconPassed');
		const themeRemoved = read('.remotes-recovery-status .remotes-connection-indicator');
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.disconnected })), undefined);
		const disconnected = read('.remotes-recovery-status .remotes-connection-indicator');
		assert.deepStrictEqual({ details, themeChanged, themeRemoved, disconnected }, {
			details: connected,
			themeChanged: { ...connected, color: 'rgb(0, 255, 0)' },
			themeRemoved: connected,
			disconnected: { icon: 'codicon codicon-circle', color: 'rgb(34, 102, 204)', hiddenFromScreenReader: 'true' },
		});
	});

	test('run behavior leads with the task and retains readable environment context when renamed', () => {
		const { parent, model } = createWidget();
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const read = () => ({
			title: details.querySelector('h2.remotes-task-title')?.textContent,
			name: details.querySelector('.remotes-details-owner')?.textContent,
			detail: [...details.querySelectorAll('.remotes-task-identity-detail > *')].map(element => element.textContent),
			taskInBody: !!details.querySelector('.remotes-details-body > .remotes-task-title'),
			metadataInBody: !!details.querySelector('.remotes-details-body > dl.remotes-task-identity-detail'),
		});
		const before = read();
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? {
			...remote, name: 'Renamed server', detail: 'new.example.com',
		} : remote), undefined);
		assert.deepStrictEqual({ before, after: read() }, {
			before: { title: 'Agent run behavior', name: 'Build server', detail: ['Environment', 'Build server', 'Status', 'Connected', 'Connection type', 'SSH', 'Host address', 'build.example.com'], taskInBody: false, metadataInBody: true },
			after: { title: 'Agent run behavior', name: 'Renamed server', detail: ['Environment', 'Renamed server', 'Status', 'Connected', 'Connection type', 'SSH', 'Host address', 'new.example.com'], taskInBody: false, metadataInBody: true },
		});
	});

	test('run behavior aligns metadata rows and uses consistent typography', () => {
		const { parent } = createWidget();
		parent.style.setProperty('--vscode-fontSize-body1', '13px');
		parent.style.setProperty('--vscode-fontSize-heading2', '18px');
		parent.style.setProperty('--vscode-fontSize-heading3', '13px');
		parent.style.setProperty('--vscode-fontWeight-regular', '400');
		parent.style.setProperty('--vscode-fontWeight-semiBold', '600');
		parent.style.setProperty('--vscode-foreground', '#dddddd');
		parent.style.setProperty('--vscode-descriptionForeground', '#aaaaaa');
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const labels = [...details.querySelectorAll<HTMLElement>('.remotes-task-identity-detail dt')];
		const values = [...details.querySelectorAll<HTMLElement>('.remotes-task-identity-detail dd')];
		const style = (element: HTMLElement) => {
			const computed = dom.getWindow(element).getComputedStyle(element);
			return { size: computed.fontSize, weight: computed.fontWeight, color: computed.color };
		};
		assert.deepStrictEqual({
			aligned: labels.every((label, index) => label.offsetLeft === labels[0].offsetLeft
				&& values[index].offsetLeft === values[0].offsetLeft && label.offsetTop === values[index].offsetTop),
			labels: [...new Set(labels.map(element => JSON.stringify(style(element))))],
			values: [...new Set(values.map(element => JSON.stringify(style(element))))],
			title: style(details.querySelector<HTMLElement>('.remotes-task-title')!),
			section: style(details.querySelector<HTMLElement>('.remotes-run-question')!),
		}, {
			aligned: true,
			labels: [JSON.stringify({ size: '13px', weight: '400', color: 'rgb(170, 170, 170)' })],
			values: [JSON.stringify({ size: '13px', weight: '400', color: 'rgb(221, 221, 221)' })],
			title: { size: '18px', weight: '600', color: 'rgb(221, 221, 221)' },
			section: { size: '13px', weight: '600', color: 'rgb(221, 221, 221)' },
		});
	});

	test('first run preference save preserves layout when the saved badge wraps', async () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'status', 240);
		feedbackStyles(parent);
		const remote = model.remotes.get()[2];
		runMenuAction(parent, remote.id, 'locationPreference');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const choice = details.querySelectorAll<HTMLElement>('[role="radio"]')[1];
		const badge = choice.querySelector<HTMLElement>('.remotes-choice-current')!;
		const title = parent.ownerDocument.createRange();
		title.selectNodeContents(choice.firstChild!);
		choice.click();
		const save = details.querySelector<HTMLElement>('.remotes-details-footer .monaco-button:not(.secondary)')!;
		save.focus();
		// Reveal Save first: WebKit scrolls a clipped, focused button into view when the save finishes.
		save.scrollIntoView({ block: 'nearest' });
		const geometry = () => feedbackGeometry(details, ['.remotes-run-choices', '.remotes-details-footer', '.remotes-run-hint']);
		const before = geometry();
		const initiallySaved = choice.getAttribute('aria-label')!.includes('Saved preference');
		model.pendingManagement = new DeferredPromise<void>();
		save.click();
		const during = geometry();
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			during, after: geometry(), initiallySaved,
			saved: choice.getAttribute('aria-label')!.includes('Saved preference'),
			badgeWraps: badge.getBoundingClientRect().top >= title.getBoundingClientRect().bottom,
			focused: dom.getActiveElement() === save,
		}, { during: before, after: before, initiallySaved: false, saved: true, badgeWraps: true, focused: true });
	});

	for (const width of [900, 360]) {
		for (const connected of [false, true]) {
			test(`run save and selection preserve geometry at width ${width}, connected=${connected}`, async () => {
				const { parent, model } = createWidget(OperatingSystem.Windows, 'status', width);
				feedbackStyles(parent);
				const remote = model.remotes.get()[connected ? 0 : 2];
				model.preferences.set(remote.id, 'dedicated');
				runMenuAction(parent, remote.id, 'locationPreference');
				const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
				const choices = details.querySelectorAll<HTMLElement>('[role="radio"]');
				const save = details.querySelector<HTMLElement>('.remotes-details-footer .monaco-button:not(.secondary)')!;
				choices[1].click();
				save.focus();
				const geometry = () => feedbackGeometry(details, ['.remotes-run-choices', '.remotes-details-footer', '.remotes-run-hint']);
				const before = geometry();
				const iconsBefore = save.querySelectorAll('.codicon').length;
				model.pendingManagement = new DeferredPromise<void>();
				save.click();
				const during = geometry();
				const iconsDuring = save.querySelectorAll('.codicon').length;
				await model.pendingManagement.complete();
				await timeout(0);
				const after = geometry();
				const iconsAfter = save.querySelectorAll('.codicon').length;
				choices[0].click();
				assert.deepStrictEqual({
					during, after, selectedAgain: geometry(), iconsBefore, iconsDuring, iconsAfter, iconsAfterSelection: save.querySelectorAll('.codicon').length,
					focused: dom.getActiveElement() === save, same: save === details.querySelector('.remotes-details-footer .monaco-button:not(.secondary)'),
					feedback: details.querySelector('.remotes-details-feedback')?.textContent, connections: model.connectionChanges,
				}, { during: before, after: before, selectedAgain: before, iconsBefore: 0, iconsDuring: 0, iconsAfter: 0, iconsAfterSelection: 0, focused: true, same: true, feedback: '', connections: [] });
			});
		}

		test(`empty discovery retry retains setup, documentation and focus at width ${width}`, async () => {
			const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'status', width);
			feedbackStyles(parent);
			model.remotes.set([], undefined);
			model.failedKinds = ['ssh'];
			widget.setVisible(true);
			await timeout(0);
			const refresh = parent.querySelector<HTMLElement>('[data-empty-action="refresh"]')!;
			const description = parent.querySelector('.remotes-empty-state-description');
			refresh.focus();
			const geometry = () => feedbackGeometry(parent, ['[data-empty-action="refresh"]', '.remotes-empty-state-description']);
			const before = geometry();
			model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
			refresh.click();
			const during = { geometry: geometry(), disabled: refresh.getAttribute('aria-disabled') };
			await model.pendingRefresh.complete(['ssh']);
			await timeout(0);
			assert.deepStrictEqual({
				during, after: geometry(), focused: dom.getActiveElement() === refresh,
				identities: [refresh === parent.querySelector('[data-empty-action="refresh"]'), description === parent.querySelector('.remotes-empty-state-description')],
				enabled: refresh.getAttribute('aria-disabled'),
			}, { during: { geometry: before, disabled: 'true' }, after: before, focused: true, identities: [true, true], enabled: 'false' });
		});

	}

	test('a remote name keeps its space when its state indicators do not fit', () => {
		const indicators = ['remotes-github-environment', 'remotes-server-update', 'remotes-picker-hidden'];
		const states = [360, 1400].map(width => {
			const { parent, model, widget } = createWidget(OperatingSystem.Macintosh, 'default', width);
			feedbackStyles(parent);
			model.remotes.set([{
				...model.remotes.get()[0], hidden: true, canUpdateServer: true, gitHubEnvironment: { state: 'enabled' },
				connectionStatus: RemoteAgentHostConnectionStatus.connected,
			}], undefined);
			widget.layout();
			const row = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!;
			const name = row.querySelector<HTMLElement>('.remotes-name')!;
			const group = row.querySelector<HTMLElement>('.remotes-name-indicators')!.getBoundingClientRect();
			const nameFits = name.scrollWidth <= name.clientWidth;
			return {
				width,
				shown: indicators.filter(indicator => {
					const bounds = row.querySelector<HTMLElement>(`.${indicator}`)!.getBoundingClientRect();
					return bounds.top >= group.top && bounds.bottom <= group.bottom && bounds.right <= group.right;
				}),
				nameFits,
				squeezed: !nameFits && name.getBoundingClientRect().width <= group.width,
			};
		});
		assert.deepStrictEqual(states, [
			{ width: 360, shown: ['remotes-github-environment'], nameFits: false, squeezed: false },
			{ width: 1400, shown: indicators, nameFits: true, squeezed: false },
		]);
	});

	test('Update Server and the update indicator follow the update capability on incompatible and connected rows', () => {
		const { parent, model, hoverContents } = createWidget();
		const remote = model.remotes.get()[0];
		const rows: Partial<ICustomizationRemote>[] = [
			{ connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Too old', ['1'], ['2'], 'vendor/update'), canUpdateServer: true },
			{ connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Too old', ['1']) },
			{ connectionStatus: RemoteAgentHostConnectionStatus.connected, canUpdateServer: true },
			{ connectionStatus: RemoteAgentHostConnectionStatus.connected },
		];
		const update = 'A server update is available. Select Update Server in More Actions to install it.';
		const states = rows.map(row => {
			model.remotes.set([{ ...remote, ...row }], undefined);
			const indicator = parent.querySelector<HTMLElement>(`[data-remote-id="${remote.id}"] .remotes-server-update`)!;
			return {
				menu: getMenuActions(parent, remote.id).map(action => action.label).filter(label => ['New Session', 'Connect', 'Disconnect', 'Update Server'].includes(label)),
				indicator: indicator.hidden ? undefined : hoverContents.get(indicator),
				announced: !!indicator.closest('.monaco-list-row')?.getAttribute('aria-label')?.includes(update),
			};
		});
		assert.deepStrictEqual(states, [
			{ menu: ['Connect', 'Update Server'], indicator: undefined, announced: false },
			{ menu: ['Connect'], indicator: undefined, announced: false },
			{ menu: ['New Session', 'Disconnect', 'Update Server'], indicator: update, announced: true },
			{ menu: ['New Session', 'Disconnect'], indicator: undefined, announced: false },
		]);
	});

	for (const shared of [false, true]) {
		test(`an open ${shared ? 'Stop Sharing' : 'Share'} menu action retains its intent after sharing changes`, async () => {
			const { parent, model, errors } = createWidget();
			const remote = model.remotes.get()[0];
			model.remotes.set([{
				...remote, canShareAsGitHubEnvironment: true, gitHubEnvironment: shared ? { state: 'enabled' } : undefined,
			}], undefined);
			const action = getMenuAction(parent, remote.id, 'githubEnvironment');
			model.remotes.set([{
				...remote, canShareAsGitHubEnvironment: true, gitHubEnvironment: shared ? undefined : { state: 'enabled' },
			}], undefined);
			await action.run();
			await timeout(0);
			assert.deepStrictEqual({ changes: model.gitHubEnvironmentChanges, errors }, {
				changes: [{ id: remote.id, shared: !shared }], errors: [],
			});
		});
	}

	test('GitHub environment overflow action offers Stop Sharing once the remote is shared', async () => {
		const { parent, model } = createWidget();
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? { ...remote, canShareAsGitHubEnvironment: true } : remote), undefined);
		const state = () => {
			const action = getMenuAction(parent, 'ssh:build', 'githubEnvironment');
			return { label: action.label, enabled: action.enabled };
		};
		const states = [state()];
		runMenuAction(parent, 'ssh:build', 'githubEnvironment');
		await timeout(0);
		states.push(state());
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? { ...remote, gitHubEnvironment: { state: 'connecting' } } : remote), undefined);
		states.push(state());
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? { ...remote, gitHubEnvironment: { state: 'error', error: 'Denied' } } : remote), undefined);
		states.push(state());
		runMenuAction(parent, 'ssh:build', 'githubEnvironment');
		await timeout(0);
		states.push(state());
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? { ...remote, gitHubEnvironment: { state: 'unavailable', unavailableReason: 'account' } } : remote), undefined);
		states.push(state());
		runMenuAction(parent, 'ssh:build', 'githubEnvironment');
		await timeout(0);
		assert.deepStrictEqual({ states, changes: model.gitHubEnvironmentChanges }, {
			states: [
				{ label: 'Share as GitHub Environment', enabled: true },
				{ label: 'Stop Sharing as GitHub Environment', enabled: true },
				{ label: 'Sharing as a GitHub environment...', enabled: false },
				{ label: 'Stop Sharing as GitHub Environment', enabled: true },
				{ label: 'Share as GitHub Environment', enabled: true },
				{ label: 'Shared as a GitHub environment by another GitHub account.', enabled: false },
			],
			changes: [{ id: 'ssh:build', shared: true }, { id: 'ssh:build', shared: false }],
		});
	});

	test('Update Server in overflow blocks duplicates and restores focus when it disappears', async () => {
		const { parent, model } = createWidget();
		model.remotes.set([{
			...model.remotes.get()[0], canUpdateServer: true,
			connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Too old', ['1'], undefined, 'vendor/update'),
		}], undefined);
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'ssh:build', 'updateServer');
		runMenuAction(parent, 'ssh:build', 'updateServer');
		const busy = !getMenuAction(parent, 'ssh:build', 'updateServer').enabled;
		runMenuAction(parent, 'ssh:build', 'copyAddress');
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			busy, updates: model.serverUpdates, copies: model.copiedAddresses,
			present: !!findMenuAction(parent, 'ssh:build', 'updateServer'),
			focused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { busy: true, updates: ['ssh:build'], copies: ['ssh:build'], present: false, focused: true });
	});

	test('failed Update Server reports the error and re-enables the action', async () => {
		const { parent, model, errors } = createWidget();
		model.remotes.set([{
			...model.remotes.get()[0], canUpdateServer: true,
			connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Too old', ['1'], undefined, 'vendor/update'),
		}], undefined);
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'ssh:build', 'updateServer');
		const error = new Error('Cannot update server');
		await model.pendingManagement.error(error);
		await timeout(0);
		assert.deepStrictEqual({ errors, enabled: getMenuAction(parent, 'ssh:build', 'updateServer').enabled, updates: model.serverUpdates }, {
			errors: [error], enabled: true, updates: ['ssh:build'],
		});
	});

	test('run behavior respects the shared busy state of an overflow update', async () => {
		const { parent, model } = createWidget();
		model.remotes.set([{
			...model.remotes.get()[0], canUpdateServer: true,
			connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Too old', ['1'], undefined, 'vendor/update'),
		}], undefined);
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'ssh:build', 'updateServer');
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const blocked = !parent.querySelector('.remotes-environment-details');
		const stillBusy = !getMenuAction(parent, 'ssh:build', 'updateServer').enabled;
		await model.pendingManagement.complete();
		await timeout(0);
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		assert.deepStrictEqual({
			blocked, stillBusy, updates: model.serverUpdates,
			openedAfterCompletion: !!parent.querySelector('.remotes-environment-details'),
		}, { blocked: true, stillBusy: true, updates: ['ssh:build'], openedAfterCompletion: true });
	});

	test('task actions report failures and location changes re-enable for retry', async () => {
		const { parent, model, errors } = createWidget();
		const copyError = new Error('Clipboard unavailable');
		const locationError = new Error('Cannot save preference');
		model.copyFailure = copyError;
		runMenuAction(parent, 'ssh:build', 'copyAddress');
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'tunnel:laptop', 'locationPreference');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		details.querySelector<HTMLElement>('[role="radio"]')!.click();
		const save = details.querySelector<HTMLElement>('.remotes-details-actions .monaco-button:not(.secondary)')!;
		save.click();
		await model.pendingManagement.error(locationError);
		await timeout(0);
		assert.deepStrictEqual({ errors, enabled: save.getAttribute('aria-disabled'), feedback: details.querySelector('.remotes-details-feedback')?.textContent }, {
			errors: [copyError], enabled: 'false', feedback: 'Couldn\'t save your choice. Try again.',
		});
	});

	test('failed Delete retains the row, reports the error and allows retry', async () => {
		const { parent, model, errors } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: true,
			availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'environment:desktop', 'delete');
		const error = new Error('Deletion failed');
		await model.pendingManagement.error(error);
		await timeout(0);
		assert.deepStrictEqual({
			errors,
			disabled: !getMenuAction(parent, 'environment:desktop', 'delete').enabled,
			changes: model.managementChanges,
		}, { errors: [error], disabled: false, changes: [{ id: 'environment:desktop', action: 'remove' }] });
	});

	test('renaming a sorted row does not leave keyboard focus on another remote action', async () => {
		const { parent, model } = createWidget();
		model.remotes.set([...model.remotes.get(), {
			id: 'ssh:other', kind: 'ssh', name: 'Other', detail: 'other.example.com', canRemove: true, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
		parent.querySelector('[data-remote-id="ssh:build"] .remotes-name')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		runMenuAction(parent, 'ssh:build', 'rename');
		await timeout(0);
		assert.deepStrictEqual({
			focusedRemote: parent.querySelector<HTMLElement>('.monaco-list-row.focused [data-remote-id]')?.dataset.remoteId,
			listFocused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { focusedRemote: 'ssh:build', listFocused: true });
	});

	test('surfaces failed management operations and re-enables the action', async () => {
		const { parent, model, errors } = createWidget();
		model.pendingManagement = new DeferredPromise<void>();
		runMenuAction(parent, 'tunnel:laptop', 'rename');
		const error = new Error('Could not save name');
		await model.pendingManagement.error(error);
		await timeout(0);
		assert.deepStrictEqual({
			disabled: !getMenuAction(parent, 'tunnel:laptop', 'rename').enabled,
			errors,
		}, { disabled: false, errors: [error] });
	});

	test('preserves collapsed groups through inventory updates', () => {
		const { parent, model } = createWidget();
		parent.querySelector<HTMLElement>('.monaco-list-row[aria-expanded]')!.click();
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

	test('search omits missing groups even after clearing and inventory changes', async () => {
		const { parent, widget, model } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		const groups = () => [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent);
		widget.setSearchQuery('build');
		const matched = groups();
		const accessible = widget.getAccessibilityContent();
		model.remotes.set(model.remotes.get().filter(remote => remote.kind !== 'ssh'), undefined);
		const removed = groups();
		const noMatches = parent.querySelector('.remotes-message [role="status"]')?.textContent;
		widget.setVisible(true);
		await timeout(0);
		const refreshed = groups();
		widget.setSearchQuery('');
		assert.deepStrictEqual({
			matched, omittedFromAccessibleView: !accessible.includes('Dev Tunnels') && !accessible.includes('GitHub Environments') && !accessible.includes('WSL'),
			removed, noMatches, refreshed, restored: groups(),
		}, {
			matched: ['SSH'], omittedFromAccessibleView: true, removed: [], noMatches: 'No environments match your filters.', refreshed: [],
			restored: ['GitHub Environments', 'Dev Tunnels', 'WSL', 'SSH'],
		});
	});

	test('confirmed offline environments omit connection and refresh actions but retain management actions', async () => {
		const { parent, model } = createWidget();
		model.remotes.set([{ id: 'tunnel:unavailable', kind: 'tunnel', name: 'Unavailable', detail: 'Host', canRemove: false, unavailableReason: 'Unavailable host', availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected }], undefined);
		const control = getConnectionAction(parent, 'tunnel:unavailable');
		control.click();
		await timeout(0);
		assert.deepStrictEqual({
			actionHidden: control.hidden, changes: model.connectionChanges, refreshes: model.refreshCalls,
			menuAction: !!findMenuAction(parent, 'tunnel:unavailable', 'actions'),
			renameDisabled: !getMenuAction(parent, 'tunnel:unavailable', 'rename').enabled,
		}, { actionHidden: true, changes: [], refreshes: 0, menuAction: false, renameDisabled: false });
	});

	test('offline transitions remove Connect and recover focus', () => {
		const { parent, model } = createWidget(OperatingSystem.Windows);
		const remote = { ...model.remotes.get()[0], connectionStatus: RemoteAgentHostConnectionStatus.disconnected };
		model.remotes.set([remote], undefined);
		const action = getConnectionAction(parent, remote.id);
		action.focus();
		model.remotes.set([{ ...remote, availability: 'offline' }], undefined);
		const offline = {
			hidden: getConnectionAction(parent, remote.id).hidden,
			focusRecovered: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
			menu: !!findMenuAction(parent, remote.id, 'actions'),
		};
		model.remotes.set([{ ...remote, kind: 'wsl', availability: 'offline', startsOnConnect: true }], undefined);
		const wslAction = getConnectionAction(parent, remote.id);
		const wsl = { hidden: wslAction.hidden, disabled: wslAction.getAttribute('aria-disabled'), menu: !!findMenuAction(parent, remote.id, 'actions') };
		model.remotes.set([{ ...remote, availability: 'online' }], undefined);
		const available = {
			hidden: getConnectionAction(parent, remote.id).hidden,
			disabled: getConnectionAction(parent, remote.id).getAttribute('aria-disabled'),
			menu: !!findMenuAction(parent, remote.id, 'actions'),
		};
		assert.deepStrictEqual({
			offline, wsl, available,
		}, { offline: { hidden: true, focusRecovered: true, menu: false }, wsl: { hidden: false, disabled: 'false', menu: true }, available: { hidden: false, disabled: 'false', menu: true } });
	});

	test('shows connection progress in the action without repeating a row status', () => {
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
				action: action.getAttribute('aria-label'),
				disabled: action.getAttribute('aria-disabled') === 'true',
			};
		});
		assert.deepStrictEqual({ observed, accessible: widget.getAccessibilityContent().includes('Status: Update required') }, {
			observed: [
				{ action: 'Disconnect Build server', disabled: false },
				{ action: 'Connect to Build server', disabled: false },
				{ action: 'Connecting: Build server', disabled: true },
				{ action: 'Reconnecting: Build server', disabled: true },
				{ action: 'Connect to Build server. Update required: Update required', disabled: false },
			],
			accessible: false,
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
			actionDisabled: action.getAttribute('aria-disabled'), renameDisabled: !getMenuAction(parent, 'tunnel:laptop', 'rename').enabled,
			state: action.textContent?.trim(),
		};
		action.click();
		runMenuAction(parent, 'tunnel:laptop', 'rename');
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({
			tabIndex, busy, connectionChanges: model.connectionChanges, managementChanges: model.managementChanges,
			action: action.getAttribute('aria-label'), renameDisabled: !getMenuAction(parent, 'tunnel:laptop', 'rename').enabled,
			sameControl: getConnectionAction(parent, 'tunnel:laptop') === action, focused: dom.getActiveElement() === action,
		}, {
			tabIndex: 0, busy: { actionDisabled: 'true', renameDisabled: true, state: 'Connecting' },
			connectionChanges: [{ id: 'tunnel:laptop', connected: true }], managementChanges: [],
			action: 'Disconnect Laptop', renameDisabled: false, sameControl: true, focused: true,
		});
	});

	test('disconnect restores rename availability and keeps the group expanded', async () => {
		const { parent, model, widget } = createWidget();
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, 'ssh:build').click();
		const busy = {
			state: getConnectionAction(parent, 'ssh:build').textContent?.trim(),
			accessible: widget.getAccessibilityContent().includes('Status: Connected'),
			renameDisabled: !getMenuAction(parent, 'ssh:build', 'rename').enabled,
		};
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({
			busy,
			connectionChanges: model.connectionChanges, action: getConnectionAction(parent, 'ssh:build').getAttribute('aria-label'),
			renameDisabled: !getMenuAction(parent, 'ssh:build', 'rename').enabled,
			expanded: parent.querySelector('.remotes-group-row')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
		}, {
			busy: { state: 'Disconnecting', accessible: true, renameDisabled: true },
			connectionChanges: [{ id: 'ssh:build', connected: false }], action: 'Connect to Build server', renameDisabled: false, expanded: 'true',
		});
	});

	test('failed Connect notifies, opens no page, and keeps Connect with the failure for retrying', async () => {
		const { parent, model, widget, errors, hoverContents } = createWidget();
		model.pendingConnection = new DeferredPromise<void>();
		const action = getConnectionAction(parent, 'tunnel:laptop');
		action.click();
		const error = new Error('Connection refused');
		// The connection service records the failure on the remote before the attempt rejects.
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'tunnel:laptop' ? { ...remote, lastConnectionError: error.message } : remote), undefined);
		await model.pendingConnection.error(error);
		await timeout(0);
		const failed = {
			errors: [...errors], details: !!parent.querySelector('.remotes-environment-details'),
			label: action.textContent?.trim(), warningIcon: isWarningShown(action), hover: hoverContents.get(action),
			aria: action.getAttribute('aria-label'), disabled: action.getAttribute('aria-disabled'),
			renameDisabled: !getMenuAction(parent, 'tunnel:laptop', 'rename').enabled,
			accessible: widget.getAccessibilityContent().includes('Laptop. Status: Available. Connection failed: Connection refused'),
		};
		model.pendingConnection = undefined;
		action.click();
		await timeout(0);
		assert.deepStrictEqual({ failed, retried: { label: action.textContent?.trim(), warningIcon: isWarningShown(action) }, connections: model.connectionChanges }, {
			failed: {
				errors: ['Connection to Laptop failed: Connection refused'], details: false,
				label: 'Connect', warningIcon: true, hover: 'Connection failed: Connection refused',
				aria: 'Connect to Laptop. Connection failed: Connection refused', disabled: 'false', renameDisabled: false, accessible: true,
			},
			retried: { label: 'Disconnect', warningIcon: false },
			connections: [{ id: 'tunnel:laptop', connected: true }, { id: 'tunnel:laptop', connected: true }],
		});
	});

	function readTroubleshooting(parent: HTMLElement) {
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		return {
			title: details.querySelector('.remotes-task-title')?.textContent,
			facts: [...details.querySelectorAll('.remotes-task-identity-detail dt')].map(term => `${term.textContent}: ${term.nextElementSibling?.textContent}`),
			feedback: details.querySelector('.remotes-recovery-next > .remotes-details-feedback')?.textContent,
			guidance: [...details.querySelectorAll('.remotes-recovery-guidance')].map(paragraph => paragraph.textContent),
			command: details.querySelector('.remotes-recovery-command code')?.textContent,
			actions: [...details.querySelectorAll('.remotes-recovery-next .remotes-details-footer .monaco-button')].map(button => button.textContent),
			links: [...details.querySelectorAll('.remotes-recovery-links a')].map(link => link.textContent),
		};
	}

	/** Focuses the button first, as a pointer or keyboard activation would. */
	function clickTroubleshootingButton(parent: HTMLElement, label: string): void {
		const button = [...parent.querySelectorAll<HTMLElement>('.remotes-environment-details .monaco-button')].find(button => button.textContent === label);
		assert.ok(button, `Missing ${label} button`);
		button.focus();
		button.click();
	}

	test('Troubleshoot Connection explains an SSH host key failure and runs its actions on the page', async () => {
		const { parent, model, clipboard, commands } = createWidget();
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build'
			? { ...remote, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, lastConnectionError: 'Host key verification failed' } : remote), undefined);
		model.troubleshootingInfo = { ssh: { alias: 'build', hostName: 'build.example.com', user: 'dev', port: 22, hasSavedHostKey: true } };
		runMenuAction(parent, 'ssh:build', 'troubleshoot');
		await timeout(0);
		const failed = readTroubleshooting(parent);
		clickTroubleshootingButton(parent, 'Copy');
		await timeout(0);
		const copiedCommand = await clipboard.readText();
		clickTroubleshootingButton(parent, 'Forget Saved Host Key...');
		await timeout(0);
		const afterForget = readTroubleshooting(parent).actions;
		clickTroubleshootingButton(parent, 'Export Agent Host Debug Logs...');
		clickTroubleshootingButton(parent, 'Copy Report');
		await timeout(0);
		const report = await clipboard.readText();
		clickTroubleshootingButton(parent, 'Retry Connection');
		await timeout(0);
		assert.deepStrictEqual({
			failed, copiedCommand, afterForget, report, commands, troubleshootingActions: model.troubleshootingActions,
			connected: readTroubleshooting(parent), focused: dom.getActiveElement()?.textContent,
		}, {
			failed: {
				title: 'Troubleshoot connection',
				facts: ['Environment: Build server', 'Status: Connection failed', 'Connection type: SSH', 'Host address: build.example.com', 'Resolved host: build.example.com', 'User: dev'],
				feedback: 'Connection failed: Host key verification failed',
				guidance: ['The remote computer\'s host key doesn\'t match the saved key. Verify the new key with the computer\'s administrator before you forget the saved key.'],
				command: 'ssh -v -- build',
				actions: ['Retry Connection', 'Forget Saved Host Key...', 'Open SSH Configuration'],
				links: ['SSH connection guide', 'Open Diagnostic Report'],
			},
			copiedCommand: 'ssh -v -- build',
			afterForget: ['Retry Connection', 'Open SSH Configuration'],
			report: 'Connection diagnostics\n\nLatest error for Build server:\nHost key verification failed',
			commands: ['agentHost.exportDebugLogs'],
			troubleshootingActions: ['forgetSSHHostKey:ssh:build'],
			connected: {
				title: 'Troubleshoot connection',
				facts: ['Environment: Build server', 'Status: Connected', 'Connection type: SSH', 'Host address: build.example.com', 'Resolved host: build.example.com', 'User: dev'],
				feedback: '', guidance: [], command: undefined, actions: ['New Session', 'Disconnect'], links: ['SSH connection guide', 'Open Diagnostic Report'],
			},
			focused: 'New Session',
		});
	});

	test('a failed Connect offers Troubleshoot while Remote Environments is open', async () => {
		const { parent, model, widget, notifications } = createWidget();
		model.connectionFailure = new Error('Connection refused');
		getConnectionAction(parent, 'tunnel:laptop').click();
		await timeout(0);
		widget.setVisible(true);
		getConnectionAction(parent, 'tunnel:laptop').click();
		await timeout(0);
		const [hiddenFailure, failure] = notifications;
		const labels = failure.actions().map(action => action.label);
		await failure.actions()[0].run();
		await timeout(0);
		const page = readTroubleshooting(parent);
		widget.setVisible(false);
		const actionsWhenHidden = failure.actions().length;
		widget.dispose();
		assert.deepStrictEqual({ message: failure.notification.message, labels, page, actionsWhenHidden, hiddenFailure: { message: hiddenFailure.notification.message, actions: hiddenFailure.actions().length } }, {
			message: 'Connection to Laptop failed: Connection refused',
			labels: ['Troubleshoot'],
			page: {
				title: 'Troubleshoot connection',
				facts: ['Environment: Laptop', 'Status: Connection failed', 'Connection type: Dev Tunnel'],
				feedback: 'Connection failed: Connection refused', command: undefined,
				guidance: ['Check that the computer sharing this tunnel is turned on and connected to the internet, and that it still shares the tunnel with Remote Tunnel Access or the code tunnel command. Then retry.'],
				actions: ['Retry Connection'], links: ['Dev Tunnel connection guide', 'Open Diagnostic Report'],
			},
			actionsWhenHidden: 0,
			hiddenFailure: { message: 'Connection to Laptop failed: Connection refused', actions: 0 },
		});
	});
	test('the troubleshooting page reports failed actions on the page and restarts a WSL distribution', async () => {
		const { parent, model, errors } = createWidget(OperatingSystem.Windows);
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'wsl:Ubuntu' ? { ...remote, lastConnectionError: 'The agent host exited' } : remote), undefined);
		model.troubleshootingInfo = { canRestartDistribution: true };
		runMenuAction(parent, 'wsl:Ubuntu', 'troubleshoot');
		await timeout(0);
		model.connectionFailure = new Error('The agent host exited again');
		clickTroubleshootingButton(parent, 'Retry Connection');
		await timeout(0);
		const { feedback, guidance, actions } = readTroubleshooting(parent);
		model.connectionFailure = undefined;
		clickTroubleshootingButton(parent, 'Restart Distribution...');
		await timeout(0);
		assert.deepStrictEqual({ failed: { feedback, guidance, actions }, errors, troubleshootingActions: model.troubleshootingActions, restarted: readTroubleshooting(parent).actions }, {
			failed: {
				feedback: 'Connection failed: The agent host exited again',
				guidance: ['Restart the distribution to stop its agent host, then connect again to start a new one.'],
				actions: ['Retry Connection', 'Restart Distribution...'],
			},
			errors: [],
			troubleshootingActions: ['restartWSLDistribution:wsl:Ubuntu'],
			restarted: ['New Session', 'Disconnect', 'Restart Distribution...'],
		});
	});

	test('the troubleshooting page shows failed refreshes and deletions on the page instead of notifying', async () => {
		const { parent, model, errors } = createWidget();
		model.troubleshootingInfo = { tunnel: { inLastDiscovery: false } };
		runMenuAction(parent, 'tunnel:laptop', 'troubleshoot');
		await timeout(0);
		const actions = readTroubleshooting(parent).actions;
		model.failedKinds = ['tunnel'];
		clickTroubleshootingButton(parent, 'Refresh');
		await timeout(0);
		const refreshFeedback = readTroubleshooting(parent).feedback;
		model.deletionFailure = new Error('The tunnel service is unavailable');
		clickTroubleshootingButton(parent, 'Delete Dev Tunnel...');
		await timeout(0);
		assert.deepStrictEqual({ actions, refreshFeedback, deleteFeedback: readTroubleshooting(parent).feedback, deletions: model.tunnelDeletions, errors }, {
			actions: ['Connect', 'Refresh', 'Delete Dev Tunnel...'],
			refreshFeedback: 'Couldn\'t refresh tunnels. Check your sign-in and network connection. See the Window log for more details.',
			deleteFeedback: 'The tunnel service is unavailable',
			deletions: ['tunnel:laptop'],
			errors: [],
		});
	});

	test('the details pages scroll content that does not fit', async () => {
		const results: Record<string, { fitsViewport: boolean; scrolledToEnd: boolean; sliderFollowsNativeScroll: boolean }> = {};
		for (const page of ['troubleshoot', 'locationPreference']) {
			const { parent, widget, model } = createWidget();
			model.troubleshootingInfo = { ssh: { alias: 'build', hostName: 'build.example.com', user: 'dev', port: 22, hasSavedHostKey: true } };
			runMenuAction(parent, 'ssh:build', page);
			await timeout(0);
			parent.style.height = '200px';
			widget.layout();
			const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
			const viewport = details.querySelector<HTMLElement>(':scope > .monaco-scrollable-element')!;
			const body = viewport.querySelector<HTMLElement>('.remotes-details-body')!;
			const slider = viewport.querySelector<HTMLElement>(':scope > .scrollbar.vertical > .slider')!;
			const wheel = new WheelEvent('wheel', { deltaY: 10000, bubbles: true, cancelable: true });
			// Chromium gives synthetic legacy deltas the wrong sign; keep both representations consistent.
			Object.defineProperty(wheel, 'wheelDeltaY', { value: -10000 });
			body.dispatchEvent(wheel);
			const fitsViewport = body.getBoundingClientRect().bottom <= viewport.getBoundingClientRect().bottom + 1;
			const scrolledToEnd = body.scrollTop > 0 && Math.abs(body.scrollTop - (body.scrollHeight - body.clientHeight)) <= 1;
			const sliderTopAtEnd = slider.offsetTop;
			// Moving focus scrolls the body natively, as this does.
			body.scrollTop = 0;
			body.dispatchEvent(new Event('scroll'));
			results[page] = { fitsViewport, scrolledToEnd, sliderFollowsNativeScroll: sliderTopAtEnd > 0 && slider.offsetTop === 0 };
		}
		assert.deepStrictEqual(results, {
			troubleshoot: { fitsViewport: true, scrolledToEnd: true, sliderFollowsNativeScroll: true },
			locationPreference: { fitsViewport: true, scrolledToEnd: true, sliderFollowsNativeScroll: true },
		});
	});

	test('shows refresh warnings on the failed groups, with simple tooltips and accessible labels', async () => {
		const { parent, model, widget, hoverContents } = createWidget();
		model.failedKinds = ['ssh', 'tunnel'];
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
			message: parent.querySelector('.remotes-message [role="status"]')?.textContent,
			retainedHosts: parent.querySelectorAll('[data-remote-id]').length,
			accessibleWarnings: widget.getAccessibilityContent().match(/See the Window log for more details\./g)?.length,
		}, {
			warnings: [
				{ group: 'Dev Tunnels', tooltip: 'Couldn\'t refresh tunnels. Check your sign-in and network connection. See the Window log for more details.', announced: true },
				{ group: 'SSH', tooltip: 'Couldn\'t read your SSH hosts. Check your SSH configuration. See the Window log for more details.', announced: true },
			],
			message: '', retainedHosts: 2, accessibleWarnings: 2,
		});
	});

	test('retains warnings during retry and clears only the recovered groups', async () => {
		const { parent, model, widget } = createWidget();
		const warningGroups = () => [...parent.querySelectorAll('.remotes-refresh-warning:not([hidden])')].map(icon => icon.closest('.remotes-group-row')?.querySelector('.remotes-name')?.textContent);
		const refresh = () => parent.querySelector<HTMLElement>('.remotes-header-actions .monaco-button')!.click();
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

	test('Refresh is a text button and stays disabled during discovery', async () => {
		const { parent, model, widget } = createWidget();
		widget.setVisible(true);
		await timeout(0);
		const refresh = parent.querySelector<HTMLElement>('.remotes-header-actions .monaco-button')!;
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
			spinning: !!refresh.querySelector('.codicon-modifier-spin'),
			busy: parent.querySelector('.remotes-table-container')?.getAttribute('aria-busy'),
			sameText: parent.textContent === beforeRefresh,
		};
		refresh.click();
		await model.pendingRefresh.complete([]);
		await timeout(0);
		assert.deepStrictEqual({ idle, pending, completedDisabled: refresh.getAttribute('aria-disabled'), refreshCalls: model.refreshCalls }, {
			idle: { label: 'Refresh the list of remote environments without connecting', role: 'button', text: 'Refresh', tabIndex: 0, disabled: 'false' },
			pending: { disabled: 'true', spinning: false, busy: 'true', sameText: true },
			completedDisabled: 'false',
			refreshCalls: 2,
		});
	});

	test('sections never spin during discovery, including collapsed and empty sections', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows);
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const snapshot = () => [...parent.querySelectorAll('.remotes-group-row')].map(row => ({
			name: row.querySelector('.remotes-name')?.textContent,
			busy: row.parentElement?.getAttribute('aria-busy'),
			spinning: !!row.querySelector('.remotes-name-column .codicon-modifier-spin'),
		}));
		const started = snapshot();
		const progress = model.refreshProgress[0];
		progress.report({ kind: 'ssh', refreshing: false, failed: false });
		const partial = snapshot();
		const tunnelGroup = [...parent.querySelectorAll<HTMLElement>('.remotes-group-row')].find(row => row.querySelector('.remotes-name')?.textContent === 'Dev Tunnels')!;
		tunnelGroup.closest<HTMLElement>('.monaco-list-row')!.click();
		const collapsedSpinner = !!tunnelGroup.querySelector('.remotes-name-column .codicon-modifier-spin');
		const accessible = widget.getAccessibilityContent().includes('Dev Tunnels\nRefreshing.');
		await model.pendingRefresh.complete(['tunnel']);
		await timeout(0);
		assert.deepStrictEqual({ started, partial, collapsedSpinner, accessible, finished: snapshot() }, {
			started: ['Dev Tunnels', 'WSL', 'SSH'].map(name => ({ name, busy: 'true', spinning: false })),
			partial: ['Dev Tunnels', 'WSL', 'SSH'].map(name => ({ name, busy: 'true', spinning: false })),
			collapsedSpinner: false, accessible: true,
			finished: ['Dev Tunnels', 'WSL', 'SSH'].map(name => ({ name, busy: 'false', spinning: false })),
		});
	});

	test('an empty method defers its refresh failure until all discovery finishes', async () => {
		const { parent, model, widget } = createWidget();
		model.remotes.set([], undefined);
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const message = () => parent.querySelector('.remotes-empty-label')?.textContent;
		const waiting = message();
		model.refreshProgress[0].report({ kind: 'tunnel', refreshing: false, failed: true });
		const partial = {
			failedMessage: message(),
			accessible: widget.getAccessibilityContent().includes('Couldn\'t refresh Dev Tunnels.'),
			globalBusy: parent.querySelector('.remotes-table-container')?.getAttribute('aria-busy'),
		};
		await model.pendingRefresh.complete(['tunnel']);
		await timeout(0);
		assert.deepStrictEqual({ waiting, partial, finished: message() }, {
			waiting: 'Looking for Dev Tunnels...',
			partial: {
				failedMessage: 'Looking for Dev Tunnels...', accessible: false, globalBusy: 'true',
			},
			finished: 'Couldn\'t refresh Dev Tunnels.',
		});
	});

	test('canceled refresh progress cannot enable a newer refresh and errors restore the button', async () => {
		const { parent, model, widget, errors } = createWidget();
		const first = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const oldProgress = model.refreshProgress[0];
		widget.setVisible(false);
		const disabled = () => parent.querySelectorAll('.remotes-header-actions .monaco-button[aria-disabled="true"]').length;
		const canceled = disabled();
		const second = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		oldProgress.report({ kind: 'ssh', refreshing: false, failed: false });
		await first.complete([]);
		await timeout(0);
		const restarted = disabled();
		const error = new Error('Refresh failed');
		await second.error(error);
		await timeout(0);
		assert.deepStrictEqual({ canceled, restarted, failed: disabled(), errors }, { canceled: 0, restarted: 1, failed: 0, errors: [error] });
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
		model.failedKinds = ['wsl'];
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

	test('the Dev Tunnels settings button opens the same settings filter as Manage', async () => {
		const { parent, settings, opened, configRequests } = createWidget();
		parent.querySelector<HTMLElement>('[aria-label="Open Dev Tunnels Settings"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({ settings, opened, configRequests: configRequests() }, {
			settings: [{ query: 'chat.remoteAgentHosts' }], opened: [], configRequests: 0,
		});
	});

	test('GitHub Environments setup guidance remains in its enabled method group', async () => {
		const { widget, parent, model, settings } = createWidget();
		const groups = () => [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(node => node.textContent);
		const hidden = groups();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'desktop', canRemove: true,
			availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
		widget.setVisible(true);
		await timeout(0);
		const shown = groups();
		parent.querySelector<HTMLElement>('[aria-label="Open GitHub Environments Settings"]')!.click();
		await timeout(0);
		model.remotes.set(model.remotes.get().filter(remote => remote.kind !== 'environment'), undefined);
		const guidance = widget.getAccessibilityContent().includes('No GitHub Environments available.');
		model.environmentsEnabled.set(false, undefined);
		assert.deepStrictEqual({ hidden, shown, settings, guidance, disabled: groups() }, {
			hidden: ['Dev Tunnels', 'SSH'], shown: ['GitHub Environments', 'Dev Tunnels', 'SSH'],
			settings: [{ query: GitHubEnvironmentsEnabledSettingId }], guidance: true, disabled: ['Dev Tunnels', 'SSH'],
		});
	});

	test('Dev Containers appears while one can be created, guides getting started, and keeps creating available in parallel', async () => {
		const { widget, parent, model } = createWidget();
		const groups = () => [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(node => node.textContent);
		const header = () => parent.querySelector<HTMLElement>('.remotes-group-row .remotes-connect-action:not([hidden])[aria-label="Create Dev Container"]');
		const hidden = groups();
		model.canCreateDevContainer.set(true, undefined);
		const emptyRow = parent.querySelector<HTMLElement>('.remotes-empty-row');
		const empty = {
			text: [...emptyRow?.querySelectorAll('.remotes-name, .remotes-empty-description, .remotes-empty-signin .monaco-link') ?? []].map(node => node.textContent),
			accessible: widget.getAccessibilityContent().includes('No Dev Containers yet.'),
		};
		model.pendingManagement = new DeferredPromise<void>();
		header()!.click();
		emptyRow!.querySelector<HTMLElement>('.remotes-empty-signin .monaco-link')!.click();
		header()!.click();
		const whileCreating = { creations: [...model.devContainerCreations], headerDisabled: header()!.getAttribute('aria-disabled') };
		model.pendingManagement.complete();
		await timeout(0);
		model.canCreateDevContainer.set(false, undefined);
		assert.deepStrictEqual({ hidden, shown: groups(), empty, whileCreating, created: model.remotes.get().filter(remote => remote.kind === 'devContainer').length, headerAfterUnavailable: !!header() }, {
			hidden: ['Dev Tunnels', 'SSH'],
			shown: ['Dev Tunnels', 'SSH', 'Dev Containers'],
			empty: { text: ['No Dev Containers yet.', 'Run sessions in an Ubuntu container that keeps its files in a Docker volume.', 'Create Dev Container'], accessible: true },
			whileCreating: { creations: [undefined, undefined, undefined], headerDisabled: 'false' },
			created: 3,
			headerAfterUnavailable: false,
		});
	});

	test('connected Dev Containers offer New Session, with Disconnect only on this computer because those on remote hosts connect with their host', () => {
		const { parent, model } = createWidget();
		model.remotes.set([
			{ id: 'devcontainer:local', kind: 'devContainer', name: 'Dev Container', detail: 'This Computer', description: 'This Computer', canRemove: false, canDelete: true, availability: 'unknown', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
			{ id: 'devcontainer:ssh', kind: 'devContainer', name: 'Dev Container 2', detail: 'Build server', description: 'Build server', canRemove: false, canDelete: true, availability: 'unknown', connectsWithHost: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
		], undefined);
		const actions = (id: string) => ({
			connect: getConnectionAction(parent, id).hidden ? undefined : getConnectionAction(parent, id).textContent,
			newSession: !parent.querySelector<HTMLElement>(`[data-remote-id="${id}"] .remotes-new-session`)!.hidden,
			menu: getMenuActions(parent, id).filter(action => action.id !== Separator.ID).map(action => action.label),
		});
		const disconnected = actions('devcontainer:local');
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.connected })), undefined);
		assert.deepStrictEqual({ disconnected, connected: actions('devcontainer:local'), remote: actions('devcontainer:ssh') }, {
			disconnected: { connect: 'Connect', newSession: false, menu: ['Connect', 'Hide from Environment Picker', 'Rename...', 'Troubleshoot Connection...', 'Delete Dev Container...'] },
			connected: { connect: 'Disconnect', newSession: true, menu: ['New Session', 'Disconnect', 'Hide from Environment Picker', 'Rename...', 'Troubleshoot Connection...', 'Delete Dev Container...'] },
			remote: { connect: undefined, newSession: true, menu: ['New Session', 'Hide from Environment Picker', 'Rename...', 'Troubleshoot Connection...', 'Delete Dev Container...'] },
		});
	});

	test('Dev Container creation stays in More Actions alongside connection and management actions', async () => {
		const { parent, model } = createWidget();
		const tunnel: ICustomizationRemote = { id: 'tunnel:laptop', kind: 'tunnel', name: 'Laptop', detail: 'work-laptop', copyableAddress: 'work-laptop', canRemove: true, canDelete: true, availability: 'online', canShareAsGitHubEnvironment: true, connectionStatus: RemoteAgentHostConnectionStatus.connected };
		const actions = () => ({
			connect: getConnectionAction(parent, tunnel.id).getAttribute('aria-label'),
			create: findMenuAction(parent, tunnel.id, 'createDevContainer')?.label,
			copy: getMenuAction(parent, tunnel.id, 'copyAddress').label,
			delete: getMenuAction(parent, tunnel.id, 'delete').label,
		});
		model.remotes.set([tunnel], undefined);
		const before = actions();
		model.remotes.set([{ ...tunnel, canCreateDevContainer: true }], undefined);
		const after = actions();
		runMenuAction(parent, tunnel.id, 'createDevContainer');
		await timeout(0);
		assert.deepStrictEqual({ before, after, creations: model.devContainerCreations }, {
			before: { connect: 'Disconnect Laptop', create: undefined, copy: 'Copy Address', delete: 'Delete Dev Tunnel...' },
			after: { connect: 'Disconnect Laptop', create: 'Create Dev Container', copy: 'Copy Address', delete: 'Delete Dev Tunnel...' },
			creations: [tunnel.id],
		});
	});

	test('offline environment has no primary action and retains management actions', () => {
		const { parent, model } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'desktop', canRemove: true,
			availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
		}], undefined);
		const connect = getConnectionAction(parent, 'environment:desktop');
		assert.deepStrictEqual({
			hidden: connect.hidden,
			menuAction: !!findMenuAction(parent, 'environment:desktop', 'actions'),
			renameDisabled: !getMenuAction(parent, 'environment:desktop', 'rename').enabled,
			deleteDisabled: !getMenuAction(parent, 'environment:desktop', 'delete').enabled,
		}, {
			hidden: true, menuAction: false,
			renameDisabled: false, deleteDisabled: false,
		});
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.connected })), undefined);
		assert.deepStrictEqual({ label: connect.getAttribute('aria-label'), disabled: connect.getAttribute('aria-disabled') }, {
			label: 'Disconnect Desktop', disabled: 'false',
		});
	});

	test('offline environment identifies the host without an address or info icon and preserves row focus on updates', () => {
		const { parent, model, widget, hoverContents } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
			availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
			pickerUnavailableReason: 'Available when the owning application is online.',
		}], undefined);
		const row = parent.querySelector<HTMLElement>('[data-remote-id="environment:desktop"]')!;
		row.click();
		const table = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
		table.focus();
		const offline = {
			connection: getRowStatus(row),
			offlineIndicator: !!row.querySelector('.remotes-connection-indicator .codicon-circle-slash-compact'),
			nameOpacity: dom.getWindow(row).getComputedStyle(row.querySelector<HTMLElement>('.remotes-name')!).opacity,
			diagnosisInHover: hoverContents.get(row.querySelector<HTMLElement>('.remotes-name')!)?.includes('Start the owning application.'),
			infoIcons: row.querySelectorAll('.codicon-info').length,
			addressColumns: parent.querySelectorAll('.remotes-address-column').length,
			accessibleView: widget.getAccessibilityContent().includes('Status: Offline') && !widget.getAccessibilityContent().includes('Start the owning application.'),
		};
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, availability: 'online' as const, unavailableReason: undefined })), undefined);
		assert.deepStrictEqual({
			offline,
			available: getRowStatus(parent.querySelector('[data-remote-id]')!),
			tableFocused: dom.getActiveElement() === table,
		}, {
			offline: { connection: 'Offline', offlineIndicator: true, nameOpacity: '1', diagnosisInHover: false, infoIcons: 0, addressColumns: 0, accessibleView: true },
			available: 'Available', tableFocused: true,
		});
	});

	test('offline availability does not override an active connection or pending action', async () => {
		const { parent, model, widget, hoverContents } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		const offline: ICustomizationRemote = {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: false,
			availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
		};
		const states = [
			offline,
			{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.connected },
			{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.connecting },
			{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.reconnecting },
		];
		const observed = states.map(remote => {
			model.remotes.set([remote], undefined);
			const label = parent.querySelector<HTMLElement>('[data-remote-id] .remotes-name')!;
			return {
				label: widget.getAccessibilityContent().split('Status: ')[1]?.split('.')[0],
				offlineHover: hoverContents.get(label) === offline.unavailableReason,
				offlineAccessible: widget.getAccessibilityContent().includes(offline.unavailableReason!),
			};
		});
		model.remotes.set([{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.connected }], undefined);
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, offline.id).click();
		const readPending = () => ({
			label: widget.getAccessibilityContent().split('Status: ')[1]?.split('.')[0],
			offlineHover: hoverContents.get(parent.querySelector<HTMLElement>('[data-remote-id] .remotes-name')!) === offline.unavailableReason,
			offlineAccessible: widget.getAccessibilityContent().includes(offline.unavailableReason!),
		});
		observed.push(readPending());
		await model.pendingConnection.complete();
		await timeout(0);
		observed.push(readPending());
		assert.deepStrictEqual(observed, [
			{ label: 'Offline', offlineHover: false, offlineAccessible: false },
			{ label: 'Connected', offlineHover: false, offlineAccessible: false },
			{ label: 'Available', offlineHover: false, offlineAccessible: false },
			{ label: 'Available', offlineHover: false, offlineAccessible: false },
			{ label: 'Connected', offlineHover: false, offlineAccessible: false },
			{ label: 'Offline', offlineHover: false, offlineAccessible: false },
		]);
	});

	test('overflow opens from the keyboard and supplies the selected environment actions', () => {
		const { parent, model } = createWidget();
		parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!.click();
		const overflow = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .codicon-toolbar-more')!;
		overflow.focus();
		overflow.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
		for (const type of ['keydown', 'keyup']) {
			overflow.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		}
		assert.deepStrictEqual({
			rename: menus.get(parent)!().find(action => action.id === 'remotes.rename')?.label,
			changes: model.managementChanges,
			focused: dom.getActiveElement() === overflow,
		}, {
			rename: 'Rename...', changes: [], focused: true,
		});
	});

	test('Shift+F10 opens the focused row\'s More Actions as a context menu that runs them on that row', async () => {
		const { parent, model } = createWidget();
		const list = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
		const openWithKeyboard = (id: string) => {
			parent.querySelector<HTMLElement>(`[data-remote-id="${id}"]`)!.click();
			for (const type of ['keydown', 'keyup']) {
				list.dispatchEvent(new KeyboardEvent(type, { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true }));
			}
			return menus.get(parent)!();
		};
		const tunnel = openWithKeyboard('tunnel:laptop');
		const ssh = openWithKeyboard('ssh:build');
		const sshGroup = [...parent.querySelectorAll<HTMLElement>('.remotes-group-row')].find(group => group.querySelector('.remotes-name')?.textContent === 'SSH')!;
		const group = getContextMenuActions(parent, sshGroup);
		await store.add(new ActionRunner()).run(ssh.find(action => action.id === 'remotes.rename')!);
		await timeout(0);
		assert.deepStrictEqual({ tunnel: menuLabels(tunnel), ssh: menuLabels(ssh), group: menuLabels(group), changes: model.managementChanges }, {
			tunnel: ['Connect', '---', 'Hide from Environment Picker', '---', 'Rename...', 'Configure Agent Run Behavior...', 'Troubleshoot Connection...', 'Delete Dev Tunnel...'],
			ssh: ['New Session', 'Disconnect', '---', 'Hide from Environment Picker', '---', 'Copy Address', '---', 'Rename...', 'Configure Agent Run Behavior...', 'Troubleshoot Connection...'],
			group: ['Open SSH Configuration', '---', 'Open Setup Guide'],
			changes: [{ id: 'ssh:build', action: 'rename' }],
		});
	});

	test('Shift+F10 on a focused row scrolled out of view reveals the row and anchors its context menu there', () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Macintosh, 'default');
		model.remotes.set(Array.from({ length: 60 }, (_, index) => ({
			id: `ssh:host${index}`, kind: 'ssh' as const, name: `Host ${index}`, detail: `host${index}.example.com`, canRemove: true,
			availability: 'online' as const, connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
		})), undefined);
		widget.focusFirstRow();
		const focusedId = parent.querySelector<HTMLElement>('.monaco-list-row.focused [data-remote-id]')!.dataset.remoteId!;
		widget.scrollToBottom();
		const renderedBefore = !!parent.querySelector(`[data-remote-id="${focusedId}"]`);
		const list = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
		for (const type of ['keydown', 'keyup']) {
			list.dispatchEvent(new KeyboardEvent(type, { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true }));
		}
		const menu = menuLabels(menus.get(parent)!());
		const anchor = menuAnchors.get(parent)!();
		assert.deepStrictEqual({
			renderedBefore, menu,
			anchor: dom.isHTMLElement(anchor) ? anchor.querySelector<HTMLElement>('[data-remote-id]')?.dataset.remoteId : undefined,
		}, {
			renderedBefore: false, anchor: focusedId,
			menu: ['Connect', '---', 'Hide from Environment Picker', '---', 'Rename...', 'Configure Agent Run Behavior...', 'Troubleshoot Connection...'],
		});
	});

	test('Shift+F10 opens the menu of the row whose Sandbox Profile selector has focus, not the previously focused row', () => {
		const { parent, addHost } = createWidget();
		addHost('tunnel:laptop', new TestSandboxProfilesHost());
		parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!.click();
		// The selector restores focus to itself when it closes, without the table focusing its row.
		const picker = parent.querySelector<HTMLSelectElement>('[data-remote-id="tunnel:laptop"] select')!;
		picker.focus();
		for (const type of ['keydown', 'keyup']) {
			picker.dispatchEvent(new KeyboardEvent(type, { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true }));
		}
		const anchor = menuAnchors.get(parent)!();
		assert.deepStrictEqual({
			menu: menuLabels(menus.get(parent)!()),
			anchor: dom.isHTMLElement(anchor) ? anchor.querySelector<HTMLElement>('[data-remote-id]')?.dataset.remoteId : undefined,
		}, {
			menu: ['Connect', '---', 'Hide from Environment Picker', '---', 'Rename...', 'Configure Agent Run Behavior...', 'Troubleshoot Connection...', 'Delete Dev Tunnel...'],
			anchor: 'tunnel:laptop',
		});
	});

	test('the Dev Tunnels settings button and setup links follow table focus and support keyboard activation', async () => {
		const { widget, parent, model, configRequests, documentation, settings } = createWidget();
		model.remotes.set([model.remotes.get()[0]], undefined);
		model.failedKinds = ['tunnel'];
		widget.setVisible(true);
		await timeout(0);
		const table = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
		table.focus();
		const button = () => parent.querySelector<HTMLElement>('.remotes-group-row [aria-label="Open Dev Tunnels Settings"]')!;
		const initial = { label: button().textContent?.trim(), tabIndex: button().tabIndex };
		button().focus();
		button().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		await timeout(0);
		table.focus();
		const emptyRow = [...parent.querySelectorAll('.remotes-empty-row')].find(row => row.textContent?.includes('Couldn\'t refresh Dev Tunnels.'))!;
		emptyRow.querySelector('.remotes-empty-label')!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
		emptyRow.querySelector('.remotes-empty-label')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		const link = emptyRow.querySelector<HTMLElement>('.remotes-empty-actions .monaco-link')!;
		const focusedLinkTabIndex = link.tabIndex;
		link.focus();
		link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			initial, focusedButtonTabIndex: button().tabIndex, focusedLinkTabIndex, configRequests: configRequests(), documentation, settings,
			expanded: button().closest('.monaco-list-row')?.getAttribute('aria-expanded'),
		}, {
			initial: { label: 'Open Settings', tabIndex: 0 }, focusedButtonTabIndex: -1, focusedLinkTabIndex: 0, configRequests: 0,
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

	test('narrow environment controls keep the funnel and Refresh reachable without method chips', () => {
		const { widget, parent, model } = createWidget(OperatingSystem.Windows, 'status');
		model.environmentsEnabled.set(true, undefined);
		parent.style.width = '360px';
		const results = [undefined, 'Other computers'].map(heading => {
			widget.setHeading(heading);
			widget.layout();
			const bounds = widget.domNode.getBoundingClientRect();
			const input = parent.querySelector('input')!;
			const search = input.getBoundingClientRect();
			const textRight = search.right - parseFloat(dom.getWindow(input).getComputedStyle(input).paddingRight);
			const filters = [...parent.querySelectorAll<HTMLElement>('.remotes-search-row [role="button"]')];
			return {
				controls: filters.map(filter => filter.getAttribute('aria-label')),
				filtersVisible: filters.every(filter => {
					const rect = filter.getBoundingClientRect();
					return rect.width > 0 && rect.left >= bounds.left && rect.right <= bounds.right;
				}),
				searchSeparate: filters.every(filter => {
					const rect = filter.getBoundingClientRect();
					return rect.top >= search.bottom || rect.bottom <= search.top || rect.left >= textRight || rect.right <= search.left;
				}),
			};
		});
		assert.deepStrictEqual(results, [
			{ controls: ['Filter', 'Refresh the list of remote environments without connecting'], filtersVisible: true, searchSeparate: true },
			{ controls: ['Filter', 'Refresh the list of remote environments without connecting'], filtersVisible: true, searchSeparate: true },
		]);
	});

	test('aligns the section title with right-hand controls and wraps only in narrow containers', () => {
		const { widget, parent, model } = createWidget(OperatingSystem.Windows, 'status');
		feedbackStyles(parent);
		const remote = model.remotes.get()[0];
		model.remotes.set(Array.from({ length: 12 }, (_, index) => ({ ...remote, id: `ssh:${index}`, name: `Build server ${index}` })), undefined);
		model.environmentsEnabled.set(true, undefined);
		for (const [name, value] of Object.entries({
			'--vscode-spacing-size60': '6px', '--vscode-spacing-size80': '8px', '--vscode-spacing-size120': '12px',
			'--vscode-fontSize-heading2': '18px',
		})) {
			parent.style.setProperty(name, value);
		}
		const results = [1400, 800, 360, 1400].map(width => {
			parent.style.width = `${width}px`;
			widget.setHeading('Other computers');
			widget.layout();
			const bounds = widget.domNode.getBoundingClientRect();
			const heading = parent.querySelector('.remotes-heading')!.getBoundingClientRect();
			const headingTitle = parent.querySelector('.remotes-heading-title')!.getBoundingClientRect();
			const search = parent.querySelector('.remotes-search-controls')!.getBoundingClientRect();
			const filters = parent.querySelector('.remotes-header-actions')!.getBoundingClientRect();
			const table = parent.querySelector('.remotes-table-container')!.getBoundingClientRect();
			return {
				headingAligned: width === 360
					? heading.bottom < search.top && heading.bottom < filters.top
					: Math.abs(heading.top + heading.height / 2 - search.top - search.height / 2) < 1,
				leftAligned: heading.left === bounds.left && table.left === headingTitle.left,
				listBelow: table.top > Math.max(filters.bottom, search.bottom),
				rightGap: Math.round(table.right - search.right),
				searchFits: search.left >= table.left && search.width > 0,
				fillsContainer: Math.abs(table.right - bounds.right) < 1,
			};
		});
		assert.deepStrictEqual(results, Array.from({ length: 4 }, () => ({
			headingAligned: true, leftAligned: true, listBelow: true, rightGap: 0, searchFits: true, fillsContainer: true,
		})));
	});

	test('Reset Filter inside Search resets text, sorting, grouping and collapsed state without connecting', async () => {
		const { widget, parent, model } = createWidget();
		const input = parent.querySelector<HTMLInputElement>('input')!;
		await organize(parent, 'remotes.sort.name');
		widget.setSearchQuery('build');
		parent.querySelector<HTMLElement>('.remotes-group-row')!.click();
		await organize(parent, 'remotes.resetFilters');
		const checked = getOrganizationActions(parent).flatMap(action => action instanceof SubmenuAction ? action.actions : []).filter(action => action.checked).map(action => action.id);
		assert.deepStrictEqual({
			query: input.value, checked,
			groups: parent.querySelectorAll('.remotes-group-row').length,
			ids: [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId),
			sort: parent.querySelector('.monaco-table-th[data-col-index="1"] .remotes-sort-header')?.getAttribute('aria-label'),
			connections: model.connectionChanges,
		}, {
			query: '', checked: ['remotes.sort.availability', 'remotes.group.none'], groups: 0,
			ids: ['ssh:build', 'tunnel:laptop'], sort: 'Status, sorted ascending. Sort Status descending', connections: [],
		});
	});

	test('reopening restores sorting and grouping until Reset Filter', async () => {
		const first = createWidget(OperatingSystem.Macintosh, 'default');
		await organize(first.parent, 'remotes.sort.activity');
		await organize(first.parent, 'remotes.group.status');
		first.widget.dispose();
		const reopen = () => {
			const { parent } = createWidget(OperatingSystem.Macintosh, 'default', 900, first.storageService);
			return {
				parent,
				state: {
					checked: getOrganizationActions(parent).flatMap(action => action instanceof SubmenuAction ? action.actions : []).filter(action => action.checked).map(action => action.id),
					sorted: [...parent.querySelectorAll('.remotes-sort-header')].map(button => button.getAttribute('aria-label')).filter(label => label?.includes('sorted')),
					groups: [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent),
				},
			};
		};
		const restored = reopen();
		await organize(restored.parent, 'remotes.resetFilters');
		assert.deepStrictEqual({
			restored: restored.state,
			reset: reopen().state,
			stored: ['remotesWidget.sortBy', 'remotesWidget.sortDescending', 'remotesWidget.groupBy'].map(key => first.storageService.get(key, StorageScope.PROFILE)),
		}, {
			restored: {
				checked: ['remotes.sort.activity', 'remotes.group.status'],
				sorted: ['Last Activity, sorted descending. Sort Last Activity ascending'],
				groups: ['Connected', 'Available'],
			},
			reset: {
				checked: ['remotes.sort.availability', 'remotes.group.none'],
				sorted: ['Status, sorted ascending. Sort Status descending'],
				groups: [],
			},
			stored: [undefined, undefined, undefined],
		});
	});

	test('empty Dev Tunnels group offers keyboard sign-in without generic error copy', async () => {
		const { widget, parent, model, errors, documentation } = createWidget();
		model.remotes.set(model.remotes.get().filter(remote => remote.kind !== 'tunnel'), undefined);
		parent.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		model.tunnelAuthenticationRequired.set('github', undefined);
		model.failedKinds = ['tunnel'];
		widget.setVisible(true);
		await timeout(0);
		const authRow = parent.querySelector<HTMLElement>('.remotes-empty-row')!;
		authRow.click();
		const link = authRow.querySelector<HTMLElement>('.remotes-empty-signin .monaco-link')!;
		const before = {
			copy: authRow.querySelector('.remotes-name')?.textContent, warnings: parent.querySelectorAll('.remotes-refresh-warning:not([hidden])').length,
			genericError: parent.textContent?.includes('Couldn\'t refresh Dev Tunnels.'), tabbable: link.tabIndex,
			cached: parent.querySelectorAll('[data-remote-id="tunnel:laptop"]').length,
			accessible: widget.getAccessibilityContent().includes('Sign in'),
			spinners: authRow.querySelectorAll('.remotes-signin-progress:not([hidden])').length,
			guide: !authRow.querySelector<HTMLElement>('.remotes-empty-actions')!.hidden,
		};
		model.pendingSignIn = new DeferredPromise<void>();
		link.focus();
		link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		link.click();
		const spinner = authRow.querySelector<HTMLElement>('.monaco-link + .remotes-signin-progress')!;
		const busy = {
			disabled: link.getAttribute('aria-disabled'), rowBusy: authRow.closest('.monaco-list-row')?.getAttribute('aria-busy'),
			spinning: !spinner.hidden && spinner.classList.contains('codicon-modifier-spin'),
			size: dom.getWindow(spinner).getComputedStyle(spinner).fontSize,
		};
		await model.pendingSignIn.complete();
		await timeout(0);
		assert.deepStrictEqual({ before, busy, calls: model.signInCalls, refreshes: model.refreshCalls, signInLinks: parent.querySelectorAll('.remotes-empty-signin:not([hidden])').length, remainingSpinners: parent.querySelectorAll('.remotes-signin-progress:not([hidden])').length, errors, documentation }, {
			before: { copy: 'Connect to another computer with a Dev Tunnel', warnings: 0, genericError: false, tabbable: 0, cached: 0, accessible: true, spinners: 0, guide: true },
			busy: { disabled: 'true', rowBusy: 'true', spinning: true, size: '12px' }, calls: 1, refreshes: 2, signInLinks: 0, remainingSpinners: 0, errors: [], documentation: [],
		});
	});

	for (const outcome of ['cancel', 'failure', 'dispose'] as const) {
		test(`tunnel sign-in handles ${outcome} without a late refresh or silent errors`, async () => {
			const { widget, parent, model, errors } = createWidget();
			model.tunnelAuthenticationRequired.set('github', undefined);
			model.remotes.set(model.remotes.get().map(remote => remote.kind === 'tunnel' ? { ...remote, requiresTunnelSignIn: true } : remote), undefined);
			model.pendingSignIn = new DeferredPromise<void>();
			widget.setVisible(true);
			await timeout(0);
			const signIn = () => parent.querySelector<HTMLElement>('[data-remote-id="tunnel:laptop"] .remotes-connect-action');
			signIn()!.click();
			const error = outcome === 'cancel' ? new CancellationError() : new Error('Sign-in failed');
			if (outcome === 'dispose') {
				widget.dispose();
				await model.pendingSignIn.complete();
			} else {
				await model.pendingSignIn.error(error);
			}
			await timeout(0);
			assert.deepStrictEqual({ calls: model.signInCalls, refreshes: model.refreshCalls, errors, retryEnabled: outcome === 'dispose' ? undefined : signIn()?.getAttribute('aria-disabled') }, {
				calls: 1, refreshes: 1, errors: outcome === 'failure' ? [error] : [], retryEnabled: outcome === 'dispose' ? undefined : 'false',
			});
		});
	}

	test('group rows offer their main action as a text button and the setup guide in More Actions, also when collapsed', () => {
		const { parent, model, documentation } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'desktop', canRemove: false,
			availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected,
		}], undefined);
		const read = () => [...parent.querySelectorAll<HTMLElement>('.remotes-group-row')].map(group => {
			const button = group.querySelector<HTMLElement>('.remotes-connect-action')!;
			group.querySelector<HTMLElement>('.codicon-toolbar-more')!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
			const menu = menus.get(parent)!().filter(action => action.id !== Separator.ID);
			void menu.find(action => action.id === 'remotes.documentation')?.run();
			return { name: group.querySelector('.remotes-name')?.textContent, button: button.hidden ? undefined : button.textContent?.trim(), menu: menu.map(action => action.label) };
		});
		const populated = read();
		for (const row of parent.querySelectorAll<HTMLElement>('.monaco-list-row[aria-expanded="true"]')) {
			row.click();
		}
		assert.deepStrictEqual({ populated, collapsed: read(), documentation }, {
			populated: [
				{ name: 'GitHub Environments', button: 'Open Settings', menu: ['Open GitHub Environments Settings', 'Open Setup Guide'] },
				{ name: 'Dev Tunnels', button: 'Open Settings', menu: ['Open Dev Tunnels Settings', 'Open Setup Guide'] },
				{ name: 'WSL', button: undefined, menu: ['Open Setup Guide'] },
				{ name: 'SSH', button: 'Open SSH Configuration', menu: ['Open SSH Configuration', 'Open Setup Guide'] },
			],
			collapsed: populated,
			documentation: Array.from({ length: 2 }, () => [
				'https://aka.ms/vscode-agent-environments', 'https://aka.ms/vscode-agent-tunnel', 'https://aka.ms/vscode-agent-wsl', 'https://aka.ms/vscode-agent-ssh',
			]).flat(),
		});
	});

	test('empty Type groups show setup guidance and working documentation links', async () => {
		const { widget, parent, model, documentation } = createWidget(OperatingSystem.Windows);
		model.remotes.set([], undefined);
		widget.setVisible(true);
		await timeout(0);
		const labels = [...parent.querySelectorAll('.remotes-empty-row')].map(row => {
			row.querySelector<HTMLElement>('.remotes-empty-actions:not([hidden]) .monaco-link')!.click();
			return row.querySelector('.remotes-empty-label')?.textContent;
		});
		assert.deepStrictEqual({
			labels,
			counts: [...parent.querySelectorAll('.remotes-group-count:not([hidden])')].map(element => element.textContent),
			documentation,
			accessibleGuidance: widget.getAccessibilityContent().includes('SSH setup guide: https://aka.ms/vscode-agent-ssh'),
		}, {
			labels: ['Connect to another computer with a Dev Tunnel', 'No WSL 2 distributions found.', 'No SSH hosts configured.'],
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
		const refreshed = parent.querySelector('.remotes-empty-label')?.textContent;
		widget.setSearchQuery('nonexistent');
		assert.deepStrictEqual({ loading, refreshed, filtered: labels(), message: parent.querySelector('.remotes-message [role="status"]')?.textContent, setupLinks: parent.querySelectorAll('.remotes-empty-actions:not([hidden]) .monaco-link').length }, {
			loading: ['Looking for Dev Tunnels...', 'Looking for SSH...'],
			refreshed: 'Couldn\'t refresh Dev Tunnels.',
			filtered: [], message: 'No environments match your filters.',
			setupLinks: 0,
		});
	});
});
