/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { OperatingSystem, OS } from '../../../../../../../base/common/platform.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ISSHRemoteAgentHostService } from '../../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
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
import { ICustomizationRemote, IRemoteRefreshProgress, IRemotesModel, RemoteKind } from '../../browser/remotesModel.js';
import { RemotesWidget } from '../../browser/remotesWidget.js';
import { getRemoteTypeLabel } from '../../browser/remotesTable.js';
import { confirmTunnelDeletion } from '../../browser/remoteHostOptions.js';
import { IConnectionDiagnosticsService } from '../../browser/connectionDiagnostics.js';
import { RemoteEnvironmentDetails } from '../../browser/remoteEnvironmentDetails.js';

const remotes: ICustomizationRemote[] = [
	{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
	{ id: 'ssh:staging', kind: 'ssh', name: 'Staging', detail: 'staging.example.com', canRemove: true, canDelete: true, hidden: true, connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
	{ id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu-24.04', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connecting },
	{ id: 'wsl:Debian', kind: 'wsl', name: 'Debian', detail: 'Debian', canRemove: false, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, pickerUnavailableReason: 'Connect once to add this remote to the environment picker.' },
	{ id: 'tunnel:laptop', kind: 'tunnel', name: 'Work laptop', detail: 'work-laptop-europe', canRemove: true, canDelete: true, connectionStatus: RemoteAgentHostConnectionStatus.reconnecting },
	{ id: 'tunnel:home', kind: 'tunnel', name: 'Home workstation', detail: 'home-workstation', canRemove: true, canDelete: true, connectionStatus: RemoteAgentHostConnectionStatus.incompatible('The remote host needs an update.', ['1'], undefined, 'vscode/upgrade') },
	{ id: 'environment:desktop', kind: 'environment', name: 'Shared desktop', detail: 'env-desktop', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
	{ id: 'environment:laptop', kind: 'environment', name: 'Shared laptop', detail: 'env-laptop', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'The remote computer is offline. Start sharing it before connecting.', pickerUnavailableReason: 'Available in the environment picker when the remote computer is online.' },
];

async function render({ container, disposableStore, theme }: ComponentFixtureContext, width: number, operatingSystem = OS, empty = false, failedKinds: readonly RemoteKind[] = [], environments = false, refreshing?: RemoteKind, signInRequired: boolean | 'pending' = false, options: { readonly height?: number; readonly connectionError?: string; readonly retrying?: boolean; readonly heading?: string; readonly runBehavior?: boolean; readonly troubleshoot?: ICustomizationRemote; readonly filter?: RemoteKind; readonly query?: string; readonly kinds?: readonly RemoteKind[] } = {}): Promise<void> {
	container.style.width = `${width}px`;
	container.style.height = `${options.height ?? 640}px`;
	container.classList.add('remotes-editor');
	const content = dom.append(container, dom.$('.remotes-editor-content'));
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
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
		readonly environmentsEnabled = observableValue(this, environments);
		readonly tunnelAuthenticationRequired = observableValue<'github' | 'microsoft' | undefined>(this, signInRequired ? 'github' : undefined);
		async signInToTunnels(): Promise<void> {
			await pendingSignIn?.p;
			this.tunnelAuthenticationRequired.set(undefined, undefined);
		}
		readonly remotes = observableValue<readonly ICustomizationRemote[]>(this, options.troubleshoot ? [options.troubleshoot] : empty ? [] : remotes.filter(remote => !options.kinds || options.kinds.includes(remote.kind)).map(remote =>
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
			await instantiationService.get(IClipboardService).writeText(id);
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
		async deleteTunnel(id: string) {
			const remote = this.remotes.get().find(remote => remote.id === id);
			if (remote && await confirmTunnelDeletion(instantiationService.get(IDialogService), remote.name)) {
				await this.remove(id);
			}
		}
		async deleteSSHHost(id: string) {
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
	}());
	if (options.troubleshoot) {
		const details = disposableStore.add(instantiationService.createInstance(RemoteEnvironmentDetails, options.troubleshoot, 'troubleshoot', model, () => { }, () => { }));
		content.appendChild(details.domNode);
		details.layout();
		return;
	}
	if (options.runBehavior) {
		const remote = model.remotes.get()[0];
		model.preferences.set(remote.id, 'dedicated');
		const details = disposableStore.add(instantiationService.createInstance(RemoteEnvironmentDetails, remote, 'runBehavior', model, () => { }, () => { }));
		content.appendChild(details.domNode);
		details.domNode.querySelectorAll<HTMLElement>('[role="radio"]')[1].click();
		details.layout();
		await waitForFixtureCondition(() => details.domNode.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'), 'Segment selection should settle before capture');
		return;
	}
	const widget = disposableStore.add(instantiationService.createInstance(RemotesWidget, content, model, operatingSystem));
	widget.setHeading(options.heading);
	if (options.filter) {
		const label = getRemoteTypeLabel(options.filter);
		const filter = [...content.querySelectorAll<HTMLElement>('.remotes-type-filter [role="button"]')].find(element => element.getAttribute('aria-label') === label);
		if (!filter) {
			throw new Error(`Missing ${options.filter} filter`);
		}
		filter.click();
	}
	widget.setSearchQuery(options.query ?? '');
	widget.setVisible(true);
	await waitForFixtureCondition(() => refreshing
		? content.querySelector('.remotes-header-actions .codicon-modifier-spin') !== null
		: content.querySelector('.remotes-table-container')?.getAttribute('aria-busy') === 'false', 'Remotes refresh should reach its fixture state before capture');
	if (pendingSignIn) {
		content.querySelector<HTMLElement>('[data-empty-action="tunnel.signIn"]')!.click();
		await waitForFixtureCondition(() => content.querySelector('[data-empty-action="tunnel.signIn"]')?.getAttribute('aria-disabled') === 'true', 'Sign-in should be pending before capture');
	}
	widget.layout();
}

export default defineThemedFixtureGroup({ path: 'sessions/remotes/' }, {
	ConnectionReady: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 900, OS, false, [], false, undefined, false, {
			troubleshoot: { ...remotes[2], name: 'UX-Ubuntu-Dev', detail: 'UX-Ubuntu-Dev', connectionStatus: RemoteAgentHostConnectionStatus.connected, metadata: { operatingSystem: OperatingSystem.Linux, observedAt: 0 } },
		}),
	}),
	ConnectionPending: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OS, false, [], false, undefined, false, { troubleshoot: remotes[4] }),
	}),
	ConnectionOffline: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OS, false, [], true, undefined, false, { troubleshoot: remotes[7] }),
	}),
	ConnectionUpdate: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 900, OS, false, [], false, undefined, false, { troubleshoot: remotes[5] }),
	}),
	InlineActions: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: async context => {
			await render(context, 1000, OS, false, [], true);
			for (const row of context.container.querySelectorAll('[data-remote-id]')) {
				row.closest('.monaco-list-row')?.classList.add('hovered');
			}
		},
	}),
	ConnectionError: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 1000, OperatingSystem.Linux, false, [], false, undefined, false, { connectionError: 'connect ECONNREFUSED 127.0.0.1:43192' }),
	}),
	ConnectionRetry: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 1000, OperatingSystem.Linux, false, [], false, undefined, false, { connectionError: 'connect ECONNREFUSED 127.0.0.1:43192', retrying: true }),
	}),
	Recovery: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: async context => {
			await render(context, 900, OS, false, [], false, undefined, false, { connectionError: 'connect ECONNREFUSED 127.0.0.1:43192' });
			context.container.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-connection-warning')!.click();
		},
	}),
	RunBehaviorDraft: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 900, OS, false, [], false, undefined, false, { runBehavior: true }),
	}),
	RunBehaviorDraftNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 360, OS, false, [], false, undefined, false, { runBehavior: true }),
	}),
	RecoveryNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: async context => {
			await render(context, 360, OS, false, [], false, undefined, false, { height: 500, connectionError: 'connect ECONNREFUSED 127.0.0.1:43192' });
			context.container.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-connection-warning')!.click();
		},
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
	RefreshingTunnels: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, 1000, OS, false, [], true, 'tunnel') }),
	TunnelDiscoveryFailure: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000, OS, true, ['tunnel'], true, 'ssh') }),
	TunnelSignIn: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, 1000, OS, true, ['tunnel'], true, undefined, true) }),
	TunnelSigningIn: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, 1000, OS, true, ['tunnel'], true, undefined, 'pending') }),
	TunnelSignInNarrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360, OS, false, ['tunnel'], true, undefined, true) }),
	FilteredTunnelSignIn: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 1000, OS, true, ['tunnel'], true, undefined, true, { heading: 'Other environments', filter: 'tunnel' }),
	}),
	FilteredTunnelSignInNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 360, OS, true, ['tunnel'], true, undefined, true, { heading: 'Other environments', filter: 'tunnel' }),
	}),
	OtherTypesWithoutTunnelSignIn: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 1000, OS, false, ['tunnel'], true, undefined, true, { heading: 'Other environments', kinds: ['ssh'] }),
	}),
	FilteredSSHEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 1000, OS, true, [], true, undefined, false, { filter: 'ssh' }),
	}),
	FilteredWSLEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 1000, OperatingSystem.Windows, true, [], true, undefined, false, { filter: 'wsl' }),
	}),
	FilteredGitHubEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 1000, OS, true, [], true, undefined, false, { filter: 'environment' }),
	}),
	SearchMiss: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, 1000, OS, false, ['tunnel'], true, undefined, true, { filter: 'ssh', query: 'missing' }),
	}),
	EnvironmentsNarrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360, OS, false, [], true) }),
	EnvironmentsEmpty: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000, OS, true, [], true) }),
	EnvironmentsWarning: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000, OS, true, ['environment'], true) }),
	Table: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000) }),
	TableWithHeading: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 1000, OS, false, [], true, undefined, false, { heading: 'Other environments' }),
	}),
	EmptyWithHeading: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000, OS, true, [], true, undefined, false, { heading: 'Other environments' }) }),
	NarrowWithHeading: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360, OS, false, [], true, undefined, false, { heading: 'Other environments' }) }),
	Wide: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1400) }),
	Windows: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OperatingSystem.Windows) }),
	Narrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360) }),
	Empty: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, true) }),
	EmptyWindows: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OperatingSystem.Windows, true) }),
	EmptyNarrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360, OperatingSystem.Windows, true) }),
	RefreshWarnings: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, false, ['ssh', 'tunnel']) }),
	EmptyRefreshWarnings: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, true, ['tunnel']) }),
});
