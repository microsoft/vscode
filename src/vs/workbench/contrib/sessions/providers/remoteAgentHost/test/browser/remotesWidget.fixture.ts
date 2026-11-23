/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { OperatingSystem, OS } from '../../../../../../../base/common/platform.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ISSHRemoteAgentHostService } from '../../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IClipboardService } from '../../../../../../../platform/clipboard/common/clipboardService.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { promptRemoteAgentHostLocationPreference } from '../../../../../../../platform/agentHost/common/remoteAgentHostLocationPreferenceDialog.js';
import { RemoteAgentHostLocationPreference } from '../../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../../../platform/layout/browser/layoutService.js';
import { IListService, ListService } from '../../../../../../../platform/list/browser/listService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../services/preferences/common/preferences.js';
import { IProgress } from '../../../../../../../platform/progress/common/progress.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../../../../test/browser/componentFixtures/fixtureUtils.js';
import { ICustomizationRemote, IRemoteRefreshProgress, IRemotesModel, IRemoteTroubleshootingInfo, RemoteKind, remoteKindLabels } from '../../browser/remotesModel.js';
import { RemotesWidget } from '../../browser/remotesWidget.js';
import { confirmTunnelDeletion } from '../../browser/remoteHostOptions.js';
import { IConnectionDiagnosticsService } from '../../browser/connectionDiagnostics.js';
import { IRemoteEnvironmentDetailsDelegate, RemoteEnvironmentDetails } from '../../browser/remoteEnvironmentDetails.js';
import { ISessionsProvidersService } from '../../../../browser/sessionsProvidersService.js';
import { INewSessionComposerService } from '../../../../browser/newSessionComposerService.js';
import '../../../../../../browser/media/style.css';

const remotes: ICustomizationRemote[] = [
	{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', canRemove: true, copyableAddress: 'build', availability: 'unknown', canUpdateServer: true, connectionStatus: RemoteAgentHostConnectionStatus.connected, metadata: { operatingSystem: OperatingSystem.Linux, architecture: 'x64', cpuCount: 8, memoryBytes: 16 * 1024 ** 3, observedSessionCount: 3, observedAt: 0 } },
	{ id: 'ssh:staging', kind: 'ssh', name: 'Staging', detail: 'staging.example.com', canRemove: true, canDelete: true, hidden: true, availability: 'unknown', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
	{ id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu-24.04', canRemove: true, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connecting },
	{ id: 'wsl:Debian', kind: 'wsl', name: 'Debian', detail: 'Debian', canRemove: false, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, pickerUnavailableReason: 'Connect once to add this remote to the environment picker.' },
	{ id: 'tunnel:laptop', kind: 'tunnel', name: 'Work laptop', detail: 'work-laptop-europe', canRemove: true, canDelete: true, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.reconnecting },
	{ id: 'tunnel:home', kind: 'tunnel', name: 'Home workstation', detail: 'home-workstation', canRemove: true, canDelete: true, availability: 'online', canUpdateServer: true, connectionStatus: RemoteAgentHostConnectionStatus.incompatible('The remote host needs an update.', ['1'], undefined, 'vscode/upgrade') },
	{ id: 'environment:desktop', kind: 'environment', name: 'Shared desktop', detail: 'env-desktop', canRemove: true, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected, metadata: { operatingSystem: OperatingSystem.Windows, architecture: 'arm64', observedSessionCount: 0, observedAt: 0 } },
	{ id: 'environment:laptop', kind: 'environment', name: 'Shared laptop', detail: 'env-laptop', canRemove: true, availability: 'offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'The remote computer is offline. Start sharing it before connecting.', pickerUnavailableReason: 'Available in the environment picker when the remote computer is online.' },
];

const extensionRemotes: ICustomizationRemote[] = [
	{ id: '127.0.0.1:8445', kind: 'extension', name: 'Job runs', detail: '127.0.0.1:8445', canRemove: false, contributedBy: { extensionId: 'publisher.jobs', displayName: 'Job Runner' }, availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected },
	{ id: '127.0.0.1:8446', kind: 'extension', name: 'Nightly job runs', detail: '127.0.0.1:8446', canRemove: false, contributedBy: { extensionId: 'publisher.jobs', displayName: 'Job Runner' }, hidden: true, availability: 'unknown', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
];

const sshInfo: IRemoteTroubleshootingInfo = { ssh: { alias: 'build', hostName: 'build.example.com', user: 'dev', port: 22, identityFiles: ['~/.ssh/id_ed25519'], hasSavedHostKey: true } };
const clientVersion = { name: 'Visual Studio Code - Insiders', version: '1.140.0', build: { commit: 'd9cccddf6b34357c58b5bbfb60ea03d4c4d1df65', quality: 'insider', date: '2026-11-20T08:00:00.000Z' } };
const serverVersion = { name: 'VS Code Agent Host', version: '1.140.0', build: { commit: '0157e0b26b9a2a0f2d4c1e9b8f7a6c5d4e3b2a10', quality: 'insider', date: '2026-11-18T08:00:00.000Z' } };
const failedSSH: ICustomizationRemote = { ...remotes[0], canDelete: true, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, lastConnectionError: 'All configured authentication methods failed' };
const troubleshooting: Record<string, { readonly remote: ICustomizationRemote; readonly info: IRemoteTroubleshootingInfo }> = {
	SSHAuthentication: { remote: failedSSH, info: sshInfo },
	SSHHostKey: { remote: { ...failedSSH, lastConnectionError: 'Host key verification failed: the host key for build.example.com changed' }, info: sshInfo },
	SSHConnected: { remote: { ...remotes[0], canUpdateServer: true }, info: { ...sshInfo, versions: { server: { ...serverVersion, current: true }, client: clientVersion, update: 'available' } } },
	WSLStopped: {
		remote: { id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu-24.04', canRemove: false, availability: 'offline', startsOnConnect: true, unavailableReason: 'This distribution is stopped.', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		info: { canRestartDistribution: true },
	},
	WSLDownloadFailed: {
		remote: { id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu-24.04', canRemove: false, availability: 'online', lastConnectionError: 'Failed to download the VS Code server: getaddrinfo ENOTFOUND update.code.visualstudio.com', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		info: { canRestartDistribution: true },
	},
	TunnelNotShared: {
		remote: { id: 'tunnel:laptop', kind: 'tunnel', name: 'Work laptop', detail: 'work-laptop-europe', canRemove: true, canDelete: true, availability: 'offline', unavailableReason: 'No computer is sharing this tunnel.', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		info: { tunnel: { authProvider: 'github', inLastDiscovery: true, hostConnectionCount: 0 } },
	},
	TunnelIncompatible: {
		remote: remotes[5],
		info: { tunnel: { authProvider: 'microsoft', inLastDiscovery: true, hostConnectionCount: 1 }, versions: { server: { ...serverVersion, version: '1.138.0', current: false }, client: clientVersion } },
	},
	GitHubEnvironmentOffline: { remote: remotes[7], info: {} },
	Extension: {
		remote: { ...extensionRemotes[1], hidden: false, lastConnectionError: 'connect ECONNREFUSED 127.0.0.1:8446' },
		info: { extension: { version: '1.4.2', issuesUrl: 'https://github.com/publisher/jobs/issues' } },
	},
	DevContainerHostDisconnected: {
		remote: { id: 'devcontainer:ssh:build:1', kind: 'devContainer', name: 'Dev Container', detail: 'Build server', description: 'Build server', canRemove: false, canDelete: true, connectsWithHost: true, availability: 'unknown', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		info: { devContainer: { hostId: 'ssh:build', hostName: 'Build server', hostConnected: false }, canShowLog: true },
	},
	DevContainerDockerUnavailable: {
		remote: { id: 'devcontainer:local:1', kind: 'devContainer', name: 'Dev Container', detail: 'This Computer', description: 'This Computer', canRemove: false, canDelete: true, availability: 'unknown', lastConnectionError: 'Docker is not available.', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		info: { devContainer: { hostName: 'This Computer', hostConnected: true }, canShowLog: true },
	},
};

async function render({ container, disposableStore, theme }: ComponentFixtureContext, width: number, operatingSystem = OS, empty = false, failedKinds: readonly RemoteKind[] = [], environments = false, refreshing?: RemoteKind, signInRequired: boolean | 'pending' = false, options: { readonly height?: number; readonly connectionError?: string; readonly retrying?: boolean; readonly heading?: string; readonly runBehavior?: boolean; readonly troubleshoot?: { readonly remote: ICustomizationRemote; readonly info: IRemoteTroubleshootingInfo }; readonly expandedKind?: RemoteKind; readonly grouping?: 'none' | 'type' | 'status'; readonly query?: string; readonly kinds?: readonly RemoteKind[]; readonly extensions?: boolean } = {}): Promise<void> {
	container.style.width = `${width}px`;
	container.style.height = `${options.height ?? 640}px`;
	container.classList.add('remotes-editor');
	const content = dom.append(container, dom.$('.remotes-editor-content'));
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() { }());
			reg.defineInstance(INewSessionComposerService, new class extends mock<INewSessionComposerService>() { }());
			reg.define(IHoverService, HoverService);
			reg.definePartialInstance(ILayoutService, { getContainer: () => container });
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.define(IListService, ListService);
			reg.defineInstance(ISSHRemoteAgentHostService, new class extends mock<ISSHRemoteAgentHostService>() {
				override async ensureUserSSHConfig() { return URI.file('/home/user/.ssh/config'); }
			}());
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() {
				override async openEditor() { return undefined; }
			}());
			reg.defineInstance(IPreferencesService, new class extends mock<IPreferencesService>() {
				override async openSettings() { return undefined; }
			}());
			reg.defineInstance(IConnectionDiagnosticsService, new class extends mock<IConnectionDiagnosticsService>() {
				override async getSnapshot() { return { capturedAt: '2026-11-06T10:00:00Z', sections: [], text: 'Connection diagnostics' }; }
			}());
			reg.defineInstance(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
				override readonly connections = [];
				override readonly onDidChangeConnections = Event.None;
				override getConnectionByAddress() { return undefined; }
			}());
		},
	});
	const pendingRefresh = refreshing ? new DeferredPromise<void>() : undefined;
	if (pendingRefresh) {
		disposableStore.add(toDisposable(() => pendingRefresh.complete()));
	}
	const pendingSignIn = signInRequired === 'pending' ? new DeferredPromise<void>() : undefined;
	if (pendingSignIn) {
		disposableStore.add(toDisposable(() => pendingSignIn.complete()));
	}
	const model = disposableStore.add(new class extends Disposable implements IRemotesModel {
		readonly onDidChangeTroubleshootingInfo = Event.None;
		readonly environmentsEnabled = observableValue(this, environments);
		readonly canCreateDevContainer = observableValue(this, false);
		readonly tunnelAuthenticationRequired = observableValue<'github' | 'microsoft' | undefined>(this, signInRequired ? 'github' : undefined);
		async signInToTunnels(): Promise<void> {
			await pendingSignIn?.p;
			this.tunnelAuthenticationRequired.set(undefined, undefined);
		}
		readonly remotes = observableValue<readonly ICustomizationRemote[]>(this, empty ? [] : [...remotes, ...options.extensions ? extensionRemotes : []].filter(remote => !options.kinds || options.kinds.includes(remote.kind)).map(remote =>
			remote.id === 'ssh:build' && options.connectionError
				? {
					...remote, lastConnectionError: options.connectionError,
					connectionStatus: options.retrying ? RemoteAgentHostConnectionStatus.connecting : RemoteAgentHostConnectionStatus.disconnected,
				}
				: remote));
		async refresh(_token: CancellationToken, progress?: IProgress<IRemoteRefreshProgress>) {
			if (pendingRefresh && refreshing) {
				progress?.report({ kind: refreshing, refreshing: true });
				for (const kind of failedKinds) {
					progress?.report({ kind, refreshing: false, failed: true });
				}
				await pendingRefresh.p;
			}
			return failedKinds;
		}
		setHidden(id: string, hidden: boolean) {
			this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, hidden } : remote), undefined);
		}
		async rename(id: string) {
			this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, name: `${remote.name} (renamed)` } : remote), undefined);
		}
		async copyAddress(id: string) {
			const address = this.remotes.get().find(remote => remote.id === id)?.copyableAddress;
			if (address) {
				await instantiationService.get(IClipboardService).writeText(address);
			}
		}
		readonly preferences = new Map<string, RemoteAgentHostLocationPreference>();
		async changePreferredAgentLocation(id: string, preference?: RemoteAgentHostLocationPreference) {
			const selected = preference ?? await promptRemoteAgentHostLocationPreference(instantiationService.get(IDialogService), id, 'Code - OSS');
			if (selected) {
				this.preferences.set(id, selected);
				return 'saved' as const;
			}
			return undefined;
		}
		getPreferredAgentLocation(id: string) { return this.preferences.get(id); }
		async updateServer(id: string) {
			await this.setConnected(id, true);
		}
		async setSharedAsGitHubEnvironment(id: string, shared: boolean) {
			this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, gitHubEnvironment: shared ? { state: 'enabled' } : undefined } : remote), undefined);
		}
		async deleteTunnel(id: string) {
			const remote = this.remotes.get().find(remote => remote.id === id);
			if (remote && await confirmTunnelDeletion(instantiationService.get(IDialogService), remote.name)) {
				await this.remove(id);
			}
		}
		async deleteSSHHost(id: string) {
			await this.remove(id);
		}
		async createDevContainer(id = 'local') {
			const host = this.remotes.get().find(remote => remote.id === id);
			this.remotes.set([...this.remotes.get(), {
				id: `devcontainer:${id}`, kind: 'devContainer', name: 'Dev Container', detail: host?.name ?? id, description: host?.name ?? id,
				canRemove: false, canDelete: true, availability: 'unknown', connectionStatus: RemoteAgentHostConnectionStatus.connected,
			}], undefined);
		}
		async deleteDevContainer(id: string) {
			await this.remove(id);
		}
		async remove(id: string) {
			this.remotes.set(this.remotes.get().filter(remote => remote.id !== id), undefined);
		}
		async setConnected(id: string, connected: boolean) {
			this.remotes.set(this.remotes.get().map(remote => remote.id === id ? {
				...remote, canRemove: remote.kind === 'environment' || connected, lastConnectionError: undefined,
				connectionStatus: connected ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected,
			} : remote), undefined);
		}
		async getTroubleshootingInfo() {
			return options.troubleshoot?.info ?? {};
		}
		async forgetSSHHostKey() { }
		async restartWSLDistribution() { }
		async showConnectionLog() { }
	}());
	const detailsDelegate: IRemoteEnvironmentDetailsDelegate = {
		close: () => { }, onDidChangeBusy: () => { }, newSession: async () => { }, openConfiguration: async () => { }, showExtension: async () => { },
		signInToTunnels: async () => { }, refresh: async () => { }, deleteRemote: async () => { },
	};
	if (options.troubleshoot) {
		const details = disposableStore.add(instantiationService.createInstance(RemoteEnvironmentDetails, options.troubleshoot.remote, 'troubleshoot', model, detailsDelegate));
		content.appendChild(details.domNode);
		// The page shows the facts it reads from configuration once they arrive.
		await timeout(0);
		details.layout();
		return;
	}
	if (options.runBehavior) {
		const remote = model.remotes.get()[0];
		model.preferences.set(remote.id, 'dedicated');
		const details = disposableStore.add(instantiationService.createInstance(RemoteEnvironmentDetails, remote, 'runBehavior', model, detailsDelegate));
		content.appendChild(details.domNode);
		details.domNode.querySelectorAll<HTMLElement>('[role="radio"]')[1].click();
		details.layout();
		await waitForFixtureCondition(() => details.domNode.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'), 'Segment selection should settle before capture');
		return;
	}
	const widget = disposableStore.add(instantiationService.createInstance(RemotesWidget, content, model, operatingSystem));
	widget.setHeading(options.heading);
	widget.setGrouping(options.grouping ?? (options.expandedKind ? 'type' : 'none'));
	widget.setSearchQuery(options.query ?? '');
	widget.setVisible(true);
	await waitForFixtureCondition(() => content.querySelector('.remotes-table-container')?.getAttribute('aria-busy') === String(!!refreshing), 'Remotes refresh should reach its fixture state before capture');
	if (options.expandedKind) {
		const label = remoteKindLabels[options.expandedKind];
		const group = () => [...content.querySelectorAll<HTMLElement>('.remotes-group-list-row')].find(row => row.querySelector('.remotes-name')?.textContent === label);
		const row = group();
		if (!row) {
			throw new Error(`Missing ${options.expandedKind} group`);
		}
		const isExpanded = () => {
			const row = group();
			return row?.tagName === 'SUMMARY' ? row.closest('details')?.open === true : row?.getAttribute('aria-expanded') === 'true';
		};
		if (!isExpanded()) {
			row.querySelector<HTMLElement>('.remotes-group-chevron')!.click();
		}
		await waitForFixtureCondition(isExpanded, 'Connection-method setup should be expanded before capture');
	}
	if (pendingSignIn) {
		const signIn = content.querySelector<HTMLElement>('.remotes-empty-signin .monaco-link');
		if (!signIn) {
			throw new Error('Missing Dev Tunnel sign-in action');
		}
		signIn.click();
		await waitForFixtureCondition(() => content.querySelector('.remotes-empty-signin .monaco-link')?.getAttribute('aria-disabled') === 'true', 'Sign-in should be pending before capture');
	}
	widget.layout();
}

export default defineThemedFixtureGroup({ path: 'sessions/remotes/' }, {
	InlineActions: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: async context => {
			await render(context, 1000, OS, false, [], true);
			for (const row of context.container.querySelectorAll('[data-remote-id]')) {
				row.closest('.monaco-list-row')?.classList.add('hovered');
			}
		},
	}),
	InlineActionsGroupedByType: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: async context => {
			await render(context, 1000, OS, false, [], true, undefined, false, { grouping: 'type' });
			for (const row of context.container.querySelectorAll('.monaco-list-row')) {
				row.classList.add('hovered');
			}
		},
	}),
	ConnectionError: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 1000, OperatingSystem.Linux, false, [], false, undefined, false, { connectionError: 'connect ECONNREFUSED build.example.com:22' }),
	}),
	ConnectionRetry: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 1000, OperatingSystem.Linux, false, [], false, undefined, false, { connectionError: 'connect ECONNREFUSED build.example.com:22', retrying: true }),
	}),
	RunBehaviorDraft: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 900, OS, false, [], false, undefined, false, { runBehavior: true }),
	}),
	RunBehaviorDraftNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 360, OS, false, [], false, undefined, false, { runBehavior: true }),
	}),
	TroubleshootSSHAuthentication: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 900, OperatingSystem.Linux, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.SSHAuthentication }),
	}),
	TroubleshootSSHAuthenticationNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 360, OperatingSystem.Linux, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.SSHAuthentication }),
	}),
	TroubleshootSSHHostKey: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OperatingSystem.Linux, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.SSHHostKey }),
	}),
	TroubleshootSSHConnected: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OperatingSystem.Linux, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.SSHConnected }),
	}),
	TroubleshootWSLStopped: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OperatingSystem.Windows, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.WSLStopped }),
	}),
	TroubleshootWSLDownloadFailed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OperatingSystem.Windows, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.WSLDownloadFailed }),
	}),
	TroubleshootTunnelNotShared: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OS, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.TunnelNotShared }),
	}),
	TroubleshootTunnelIncompatible: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OS, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.TunnelIncompatible }),
	}),
	TroubleshootGitHubEnvironmentOffline: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OS, false, [], true, undefined, false, { height: 900, troubleshoot: troubleshooting.GitHubEnvironmentOffline }),
	}),
	TroubleshootExtension: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OS, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.Extension }),
	}),
	TroubleshootDevContainerHostDisconnected: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OS, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.DevContainerHostDisconnected }),
	}),
	TroubleshootDevContainerDockerUnavailable: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OS, false, [], false, undefined, false, { height: 900, troubleshoot: troubleshooting.DevContainerDockerUnavailable }),
	}),
	ShortEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 700, OperatingSystem.Linux, true, ['tunnel'], false, undefined, false, { height: 220 }),
	}),
	ShortEmptyNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 360, OperatingSystem.Linux, true, ['tunnel'], false, undefined, false, { height: 220 }),
	}),
	Environments: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, 1000, OS, false, [], true) }),
	EnvironmentActions: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: async context => {
			await render(context, 1000, OS, false, [], true);
			for (const row of context.container.querySelectorAll('[data-remote-id^="environment:"]')) {
				row.closest('.monaco-list-row')?.classList.add('hovered');
			}
		},
	}),
	ExtensionActions: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: async context => {
			await render(context, 1000, OS, false, [], true, undefined, false, { extensions: true });
			for (const row of context.container.querySelectorAll('[data-remote-id^="127.0.0.1:"]')) {
				row.closest('.monaco-list-row')?.classList.add('hovered');
			}
		},
	}),
	RefreshingTunnels: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, 1000, OS, false, [], true, 'tunnel') }),
	TunnelDiscoveryFailure: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000, OS, true, ['tunnel'], true) }),
	TunnelSignIn: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, 1000, OS, true, ['tunnel'], true, undefined, true) }),
	TunnelSigningIn: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, 1000, OS, true, ['tunnel'], true, undefined, 'pending', { expandedKind: 'tunnel' }) }),
	TunnelSignInNarrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360, OS, false, ['tunnel'], true, undefined, true) }),
	TunnelSetupSignIn: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 1000, OS, true, ['tunnel'], true, undefined, true, { heading: 'Other environments', expandedKind: 'tunnel' }),
	}),
	TunnelSetupSignInNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 360, OS, true, ['tunnel'], true, undefined, true, { heading: 'Other environments', expandedKind: 'tunnel' }),
	}),
	OtherTypesWithoutTunnelSignIn: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 1000, OS, false, ['tunnel'], true, undefined, true, { heading: 'Other computers', kinds: ['ssh'] }),
	}),
	SSHSetup: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 1000, OS, true, [], true, undefined, false, { expandedKind: 'ssh' }),
	}),
	WSLSetup: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 1000, OperatingSystem.Windows, true, [], true, undefined, false, { expandedKind: 'wsl' }),
	}),
	GitHubSetup: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 1000, OS, true, [], true, undefined, false, { expandedKind: 'environment' }),
	}),
	SearchMiss: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 1000, OS, false, ['tunnel'], true, undefined, true, { query: 'missing' }),
	}),
	EnvironmentsWide: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, 1400, OS, false, [], true) }),
	EnvironmentsNarrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360, OS, false, [], true) }),
	EnvironmentsEmpty: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000, OS, true, [], true) }),
	EnvironmentsWarning: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000, OS, true, ['environment'], true) }),
	Table: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000) }),
	TableGroupedByAvailability: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000, OS, false, [], true, undefined, false, { grouping: 'status' }) }),
	TableGroupedByMethod: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000, OS, false, [], true, undefined, false, { grouping: 'type' }) }),
	TableWithHeading: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 1000, OS, false, [], true, undefined, false, { heading: 'Other computers' }),
	}),
	EmptyWithHeading: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000, OS, true, [], true, undefined, false, { heading: 'Other computers' }) }),
	NarrowWithHeading: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360, OS, false, [], true, undefined, false, { heading: 'Other computers' }) }),
	Wide: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1400) }),
	Windows: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OperatingSystem.Windows) }),
	Narrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360) }),
	Empty: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, true) }),
	EmptyWindows: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OperatingSystem.Windows, true) }),
	EmptyNarrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360, OperatingSystem.Windows, true) }),
	RefreshWarnings: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, false, ['ssh', 'tunnel']) }),
	EmptyRefreshWarnings: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, true, ['tunnel']) }),
});
