/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { ActionRunner, IAction } from '../../../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../../base/common/errors.js';
import { combinedDisposable, Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { isWindows, OperatingSystem } from '../../../../../../../base/common/platform.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IContextMenuService } from '../../../../../../../platform/contextview/browser/contextView.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { RemoteAgentHostLocationPreference } from '../../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { GitHubEnvironmentsEnabledSettingId } from '../../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { IClipboardService } from '../../../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IProgress } from '../../../../../../../platform/progress/common/progress.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IResourceEditorInput } from '../../../../../../../platform/editor/common/editor.js';
import { IUntitledTextResourceEditorInput } from '../../../../../../common/editor.js';
import { IEditorService, MODAL_GROUP, PreferredGroup } from '../../../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../services/preferences/common/preferences.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ICustomizationRemote, IRemoteRefreshProgress, IRemotesModel, RemoteKind, remoteKinds } from '../../browser/remotesModel.js';
import { RemotesWidget } from '../../browser/remotesWidget.js';
import { IConnectionDiagnosticsService } from '../../browser/connectionDiagnostics.js';

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

	readonly preferences = new Map<string, RemoteAgentHostLocationPreference>();
	getPreferredAgentLocation(id: string): RemoteAgentHostLocationPreference | undefined { return this.preferences.get(id); }
	async changePreferredAgentLocation(id: string, preference?: RemoteAgentHostLocationPreference): Promise<'reconnected'> {
		this.locationChanges.push(id);
		await this.pendingManagement?.p;
		if (preference) {
			this.preferences.set(id, preference);
		}
		return 'reconnected';
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
	const menus = new WeakMap<HTMLElement, () => readonly IAction[]>();

	function createWidget(operatingSystem = OperatingSystem.Macintosh, grouping: 'status' | 'type' = 'type') {
		const parent = dom.append(document.body, dom.$('div'));
		parent.style.width = '700px';
		parent.style.height = '640px';
		store.add(toDisposable(() => parent.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		let menuActions: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, 'showContextMenu', (delegate: Parameters<IContextMenuService['showContextMenu']>[0]) => {
			menuActions = delegate.getActions?.() ?? [];
			delegate.onHide?.(true);
		});
		menus.set(parent, () => menuActions);
		const errors: Parameters<INotificationService['error']>[0][] = [];
		const hoverContents = new Map<HTMLElement, string>();
		const mouseHoverTargets = new Set<HTMLElement>();
		const opened: { input: IResourceEditorInput | IUntitledTextResourceEditorInput; group: PreferredGroup | undefined }[] = [];
		const copied: string[] = [];
		let diagnosticCopyFailure: Error | undefined;
		const commands: string[] = [];
		instantiationService.stub(IClipboardService, {
			writeText: async text => {
				if (diagnosticCopyFailure) {
					throw diagnosticCopyFailure;
				}
				copied.push(text);
			}
		});
		instantiationService.stub(ICommandService, { executeCommand: async id => { commands.push(id); } });
		const documentation: string[] = [];
		const settings: Parameters<IPreferencesService['openSettings']>[0][] = [];
		let snapshots = 0;
		instantiationService.stub(IConnectionDiagnosticsService, {
			getSnapshot: async () => {
				snapshots++;
				return { capturedAt: '2026-11-06T10:00:00Z', sections: [], text: 'Connection report' };
			},
		});
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
		const widget = store.add(instantiationService.createInstance(TestRemotesWidget, parent, model, operatingSystem));
		if (grouping === 'type') {
			widget.setGrouping('type');
		}
		widget.layout();
		return { widget, parent, model, errors, hoverContents, mouseHoverTargets, opened, copied, commands, documentation, settings, snapshots: () => snapshots, configRequests: () => configRequests, failConfig: (error: Error) => { configFailure = error; }, failDiagnosticCopy: (error: Error) => { diagnosticCopyFailure = error; } };
	}

	function getMenuActions(parent: HTMLElement, id: string): readonly IAction[] {
		const row = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].find(row => row.dataset.remoteId === id);
		const overflow = row?.querySelector<HTMLElement>('.codicon-toolbar-more');
		assert.ok(overflow, `Missing overflow for ${id}`);
		overflow.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
		return menus.get(parent)!();
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

	function getConnectionAction(parent: HTMLElement, id: string): HTMLElement {
		const row = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].find(row => row.dataset.remoteId === id);
		const action = row?.querySelector<HTMLElement>('.remotes-actions-column > .monaco-button');
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
				columns: ['', 'Name', 'Type', 'System', 'Sessions', 'Last connection', ''],
				roots: operatingSystem === OperatingSystem.Windows ? ['Dev Tunnels', 'WSL', 'SSH'] : ['Dev Tunnels', 'SSH'],
				switches: 0,
				checkboxes: 0,
				descriptions: 0,
				accessibleWSL: operatingSystem === OperatingSystem.Windows,
				accessibleContainers: false,
			});
		});
	}

	test('defaults to status groups, keeps hidden and offline hosts, and filters by type', () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'status');
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([
			...model.remotes.get(),
			{ id: 'environment:offline', kind: 'environment', name: 'Offline host', detail: 'offline', hidden: true, canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the host.' },
		], undefined);
		const headings = () => [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent);
		const initial = headings();
		const wslFilter = [...parent.querySelectorAll<HTMLElement>('.remotes-type-filter [role="button"]')].find(element => element.getAttribute('aria-label') === 'WSL')!;
		wslFilter.click();
		assert.deepStrictEqual({
			initial, filtered: headings(),
			remotes: [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId),
			accessible: widget.getAccessibilityContent().includes('Build server'),
		}, { initial: ['Ready to use', 'Available', 'Offline'], filtered: ['Available'], remotes: ['wsl:Ubuntu'], accessible: false });
	});

	test('type filters are separate label actions with one pressed state', () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'status');
		model.environmentsEnabled.set(true, undefined);
		const filter = parent.querySelector('.remotes-type-filter')!;
		const buttons = () => [...filter.querySelectorAll<HTMLElement>('[role="button"]')];
		buttons().find(button => button.textContent === 'GitHub Environment (Preview)')!.click();
		const selected = buttons().filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.textContent);
		model.environmentsEnabled.set(false, undefined);
		assert.deepStrictEqual({
			selected,
			afterUnavailable: buttons().filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.textContent),
			labels: buttons().map(button => button.textContent),
			radios: filter.querySelectorAll('[role="radio"]').length,
			icons: filter.querySelectorAll('.codicon').length,
		}, { selected: ['GitHub Environment (Preview)'], afterUnavailable: ['All'], labels: ['All', 'Dev Tunnel', 'WSL', 'SSH'], radios: 0, icons: 0 });
	});

	test('status explanations stay in hovers and accessible labels rather than repeating inline', () => {
		const { parent, hoverContents } = createWidget(OperatingSystem.Windows, 'status');
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
		assert.deepStrictEqual(groups, [
			{ label: 'Ready to use', description: 'Connected from this computer', inline: '', announced: true },
			{ label: 'Available', description: 'Connect when you need them', inline: '', announced: true },
		]);
	});

	test('status grouping scopes discovery failures and omits unrelated tunnel authentication', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'status');
		model.remotes.set([model.remotes.get()[0]], undefined);
		model.tunnelAuthenticationRequired.set('github', undefined);
		model.failedKinds = ['ssh'];
		widget.setVisible(true);
		await timeout(0);
		const statusGroups = [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent).sort();
		const notice = parent.querySelector('.remotes-message')!;
		const accessible = widget.getAccessibilityContent();
		const noticeState = {
			hidden: notice.hasAttribute('hidden'),
			signIn: !!parent.querySelector('.remotes-empty-signin:not([hidden])'),
		};
		widget.setGrouping('type');
		assert.deepStrictEqual({
			statusGroups,
			statusRows: accessible.split('\n').filter(line => ['SSH', 'WSL', 'Dev Tunnels'].includes(line)),
			...noticeState,
			typeGroups: [...parent.querySelectorAll('.remotes-group-row .remotes-name')].map(element => element.textContent),
		}, { statusGroups: ['Ready to use', 'SSH'], statusRows: ['SSH'], hidden: true, signIn: false, typeGroups: ['Dev Tunnels', 'WSL', 'SSH'] });
	});

	function selectType(parent: HTMLElement, label: string): void {
		const filter = [...parent.querySelectorAll<HTMLElement>('.remotes-type-filter [role="button"]')].find(element => element.getAttribute('aria-label') === label);
		assert.ok(filter, `Missing ${label} filter`);
		filter.click();
	}

	test('empty status results replace the table with setup guidance scoped to the selected type', async () => {
		const { parent, model, widget, opened, documentation } = createWidget(OperatingSystem.Windows, 'status');
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([], undefined);
		model.tunnelAuthenticationRequired.set('github', undefined);
		model.failedKinds = ['tunnel'];
		widget.setVisible(true);
		await timeout(0);
		const cards = () => [...parent.querySelectorAll<HTMLElement>('.remotes-empty-state-kind')].map(card => ({
			kind: card.dataset.remoteKind,
			message: card.querySelector('[role="status"]')?.textContent,
		}));
		const all = cards();
		const selected = ['GitHub Environment (Preview)', 'Dev Tunnel', 'WSL', 'SSH'].map(label => {
			selectType(parent, label);
			return { label, cards: cards(), tableHidden: parent.querySelector<HTMLElement>('.remotes-table-container')!.hidden };
		});
		parent.querySelector<HTMLElement>('[data-empty-action="ssh.configure"]')!.click();
		parent.querySelector<HTMLElement>('[data-empty-action="ssh.documentation"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({ all, selected, opened, documentation, accessible: widget.getAccessibilityContent() }, {
			all: [
				{ kind: 'environment', message: 'No GitHub Environments available.' },
				{ kind: 'tunnel', message: 'No dev tunnels found for this account.' },
				{ kind: 'wsl', message: 'No WSL 2 distributions found.' },
				{ kind: 'ssh', message: 'No SSH hosts configured.' },
			],
			selected: [
				{ label: 'GitHub Environment (Preview)', cards: [all[0]], tableHidden: true },
				{ label: 'Dev Tunnel', cards: [all[1]], tableHidden: true },
				{ label: 'WSL', cards: [all[2]], tableHidden: true },
				{ label: 'SSH', cards: [all[3]], tableHidden: true },
			],
			opened: [{ input: { resource: URI.file('/home/test/.ssh/config'), options: { pinned: true } }, group: MODAL_GROUP }],
			documentation: ['https://aka.ms/vscode-agent-ssh'],
			accessible: 'SSH\nNo SSH hosts configured.\nAdd a Host entry to your SSH configuration, then refresh.\nOpen SSH configuration\nShow all types\nSSH setup guide\nhttps://aka.ms/vscode-agent-ssh',
		});
	});

	for (const [provider, providerLabel] of [['github', 'GitHub'], ['microsoft', 'Microsoft']] as const) {
		test(`empty tunnel guidance names the ${providerLabel} account with readable instructions and a separate guide row`, async () => {
			const { parent, model, widget, documentation } = createWidget(OperatingSystem.Windows, 'status');
			parent.style.setProperty('--vscode-foreground', '#dddddd');
			parent.style.setProperty('--vscode-descriptionForeground', '#888888');
			parent.style.setProperty('--vscode-spacing-size80', '8px');
			model.remotes.set([], undefined);
			model.tunnelAuthenticationRequired.set(provider, undefined);
			widget.setVisible(true);
			await timeout(0);
			selectType(parent, 'Dev Tunnel');
			const card = parent.querySelector('[data-remote-kind="tunnel"]')!;
			const actions = card.querySelector('.remotes-empty-state-actions')!;
			const link = card.querySelector<HTMLAnchorElement>('[data-empty-action="tunnel.documentation"]')!;
			const actionBounds = actions.getBoundingClientRect();
			const guideBounds = link.getBoundingClientRect();
			const initial = {
				message: card.querySelector('[role="status"]')?.textContent,
				description: card.querySelector('.remotes-empty-state-description')?.textContent,
				controls: [...actions.children].map(element => element.textContent),
				instructionColor: dom.getWindow(parent).getComputedStyle(card.querySelector('.remotes-empty-state-description')!).color,
				detachedActions: parent.querySelectorAll('.remotes-empty-state-body > .remotes-empty-state-actions').length,
				guide: { tag: link.tagName, role: link.getAttribute('role'), href: link.getAttribute('href'), externalIcon: !!link.querySelector('.codicon-link-external') },
				guideBelowActions: guideBounds.top > actionBounds.bottom,
				guideLeftAligned: guideBounds.left === actionBounds.left,
			};
			link.focus();
			model.tunnelAuthenticationRequired.set(provider === 'github' ? 'microsoft' : 'github', undefined);
			const updatedLink = parent.querySelector<HTMLElement>('[data-empty-action="tunnel.documentation"]')!;
			const focusRetained = dom.getActiveElement() === updatedLink;
			updatedLink.click();
			await timeout(0);
			assert.deepStrictEqual({ initial, focusRetained, documentation }, {
				initial: {
					message: 'No dev tunnels found for this account.',
					description: `Sign in to ${providerLabel} with the account used to enable the tunnel on the remote computer.`,
					controls: [`Sign in to ${providerLabel}`, 'Show all types'],
					instructionColor: 'rgb(221, 221, 221)',
					detachedActions: 0,
					guide: { tag: 'A', role: null, href: 'https://aka.ms/vscode-agent-tunnel', externalIcon: true },
					guideBelowActions: true,
					guideLeftAligned: true,
				},
				focusRetained: true,
				documentation: ['https://aka.ms/vscode-agent-tunnel'],
			});
		});
	}

	test('tunnel sign-in is offered on intent and does not block other environments', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows, 'status');
		model.remotes.set([model.remotes.get()[0]], undefined);
		model.tunnelAuthenticationRequired.set('github', undefined);
		model.failedKinds = ['tunnel'];
		widget.setVisible(true);
		await timeout(0);
		const initial = { messageHidden: parent.querySelector<HTMLElement>('.remotes-message')!.hidden, signIn: widget.getAccessibilityContent().includes('Sign In') };
		selectType(parent, 'Dev Tunnel');
		const signIn = parent.querySelector<HTMLElement>('[data-empty-action="tunnel.signIn"]')!;
		const input = parent.querySelector<HTMLInputElement>('input')!;
		input.focus();
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true }));
		const reached = dom.getActiveElement() === signIn;
		model.pendingSignIn = new DeferredPromise<void>();
		signIn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		signIn.click();
		const busy = {
			calls: model.signInCalls,
			disabled: parent.querySelector('[data-empty-action="tunnel.signIn"]')?.getAttribute('aria-disabled'),
			label: parent.querySelector('[data-empty-action="tunnel.signIn"]')?.textContent,
			focusRetained: dom.getActiveElement() === parent.querySelector('[data-empty-action="tunnel.signIn"]'),
		};
		await model.pendingSignIn.complete();
		await timeout(0);
		const recovered = {
			signIn: !!parent.querySelector('[data-empty-action="tunnel.signIn"]'),
			message: parent.querySelector('[data-remote-kind="tunnel"] [role="status"]')?.textContent,
			refreshes: model.refreshCalls,
			changes: model.connectionChanges,
		};
		parent.querySelector<HTMLElement>('[data-empty-action="allTypes"]')!.click();
		assert.deepStrictEqual({
			initial, reached, busy, recovered,
			allPressed: parent.querySelector('[aria-label="All"]')?.getAttribute('aria-pressed'),
			restored: parent.querySelectorAll('[data-remote-id="ssh:build"]').length,
			messageHidden: parent.querySelector<HTMLElement>('.remotes-message')!.hidden,
		}, {
			initial: { messageHidden: true, signIn: false }, reached: true,
			busy: { calls: 1, disabled: 'true', label: 'Signing in...', focusRetained: true },
			recovered: { signIn: false, message: 'No dev tunnels found for this account.', refreshes: 2, changes: [] },
			allPressed: 'true', restored: 1, messageHidden: true,
		});
	});

	test('empty status discovery distinguishes partial loading, failures, successful emptiness and retry', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Linux, 'status');
		model.remotes.set([], undefined);
		const pending = model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		const messages = () => [...parent.querySelectorAll('[data-remote-kind] [role="status"]')].map(element => element.textContent);
		const loading = messages();
		model.refreshProgress[0].report({ kind: 'ssh', refreshing: false, failed: false });
		const partial = messages();
		await pending.complete(['tunnel']);
		await timeout(0);
		const failed = {
			messages: messages(),
			retry: !!parent.querySelector('[data-empty-action="tunnel.refresh"]'),
			guidance: parent.querySelector('[data-remote-kind="tunnel"] .remotes-empty-state-description')?.textContent,
			accessible: widget.getAccessibilityContent().includes('Couldn\'t refresh Dev Tunnels.'),
		};
		model.pendingRefresh = undefined;
		model.failedKinds = [];
		parent.querySelector<HTMLElement>('[data-empty-action="tunnel.refresh"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({ loading, partial, failed, recovered: messages(), retries: model.refreshCalls }, {
			loading: ['Looking for Dev Tunnels...', 'Looking for SSH...'],
			partial: ['Looking for Dev Tunnels...', 'No SSH hosts configured.'],
			failed: {
				messages: ['Couldn\'t refresh Dev Tunnels.', 'No SSH hosts configured.'], retry: true,
				guidance: 'Couldn\'t refresh tunnels. Check your sign-in and network connection. See the Window log for more details.',
				accessible: true,
			},
			recovered: ['No dev tunnels found for this account.', 'No SSH hosts configured.'], retries: 2,
		});
	});

	for (const grouping of ['status', 'type'] as const) {
		test(`search misses offer search recovery, not setup or authentication (${grouping})`, async () => {
			const { parent, model, widget } = createWidget(OperatingSystem.Windows, grouping);
			model.tunnelAuthenticationRequired.set('github', undefined);
			widget.setVisible(true);
			await timeout(0);
			selectType(parent, 'SSH');
			widget.setSearchQuery('missing');
			const missed = {
				hiddenTable: parent.querySelector<HTMLElement>('.remotes-table-container')!.hidden,
				message: parent.querySelector('.remotes-message [role="status"]')?.textContent,
				cards: parent.querySelectorAll('.remotes-empty-state-kind').length,
				signIn: widget.getAccessibilityContent().includes('Sign In'),
				recovery: [...parent.querySelectorAll('[data-empty-action]')].map(element => element.textContent),
				grouped: parent.querySelector('[data-empty-action="clearSearch"]')?.parentElement === parent.querySelector('[data-empty-action="allTypes"]')?.parentElement,
			};
			parent.querySelector<HTMLElement>('[data-empty-action="clearSearch"]')!.click();
			assert.deepStrictEqual({
				missed, query: parent.querySelector<HTMLInputElement>('input')!.value,
				focusedSearch: dom.getActiveElement() === parent.querySelector('input'),
				restored: parent.querySelectorAll('[data-remote-id="ssh:build"]').length,
				pressed: parent.querySelector('[aria-label="SSH"]')?.getAttribute('aria-pressed'),
			}, {
				missed: { hiddenTable: true, message: 'No environments match your search.', cards: 0, signIn: false, recovery: ['Clear search', 'Show all types'], grouped: true },
				query: '', focusedSearch: true, restored: 1, pressed: 'true',
			});
		});
	}

	test('status groups omit repeated row status while preserving in-progress connection feedback', async () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'status');
		const visibleStatuses = () => [...parent.querySelectorAll('.remotes-connection-column:not([hidden]) .remotes-connection-state')].map(element => element.textContent);
		const initial = visibleStatuses();
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, 'tunnel:laptop').click();
		const connecting = visibleStatuses();
		const progress = getConnectionAction(parent, 'tunnel:laptop').textContent?.trim();
		const progressVisibleWithoutHover = dom.getWindow(parent).getComputedStyle(getConnectionAction(parent, 'tunnel:laptop').parentElement!).opacity;
		const rowHeight = parent.querySelector('[data-remote-id="tunnel:laptop"]')!.getBoundingClientRect().height;
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({
			initial, connecting, connected: visibleStatuses(), progress, rowHeight, progressVisibleWithoutHover,
			spinnerDisplayAfterCompletion: dom.getWindow(parent).getComputedStyle(getConnectionAction(parent, 'tunnel:laptop').querySelector<HTMLElement>('.codicon-loading')!).display,
		}, {
			initial: [], connecting: [], connected: [], progress: 'Connecting', rowHeight: 36, progressVisibleWithoutHover: '1', spinnerDisplayAfterCompletion: 'none',
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
		}, { label: 'Connect', disabled: 'false', spinnerDisplay: 'none', errors: [error] });
	});

	test('leaves unobserved metadata empty and identifies cached counts without connecting', () => {
		const { parent, model } = createWidget();
		model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? {
			...remote, metadata: { operatingSystem: OperatingSystem.Linux, activeSessionCount: 2, observedAt: 100000 }, metadataIsStale: true,
		} : remote), undefined);
		assert.deepStrictEqual({
			columns: [...parent.querySelectorAll('.monaco-table-th')].map(element => element.textContent),
			known: [...parent.querySelectorAll('[data-remote-id="ssh:build"] .remotes-metadata')].map(element => element.textContent),
			missing: [...parent.querySelectorAll('[data-remote-id="tunnel:laptop"] .remotes-metadata')].map(element => element.textContent),
			unknowns: parent.textContent?.includes('Unknown'),
			connections: model.connectionChanges,
		}, {
			columns: ['', 'Name', 'Type', 'System', 'Sessions', 'Last connection', ''],
			known: ['SSH', 'Linux', '2 active (last known)', ''], missing: ['Dev Tunnel', '', '', ''], unknowns: false, connections: [],
		});
	});

	test('distinguishes no active sessions from an unobserved count', () => {
		const { parent, model } = createWidget();
		const labels = [undefined, 0, 1].map(activeSessionCount => {
			model.remotes.set(model.remotes.get().map(remote => ({
				...remote, metadata: { activeSessionCount, observedAt: 100000 },
			})), undefined);
			return parent.querySelector('[data-remote-id="ssh:build"] .remotes-sessions-column')?.textContent;
		});
		assert.deepStrictEqual(labels, ['', '0 active', '1 active']);
	});

	test('status groups use distinct icons and themed badges without dimming offline names', () => {
		const { parent, model } = createWidget(OperatingSystem.Windows, 'status');
		parent.style.setProperty('--vscode-foreground', '#dddddd');
		parent.style.setProperty('--vscode-descriptionForeground', '#888888');
		parent.style.setProperty('--vscode-charts-green', '#22aa22');
		parent.style.setProperty('--vscode-charts-blue', '#2266ff');
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([
			...model.remotes.get(),
			{ id: 'environment:offline', kind: 'environment', name: 'Offline environment', detail: 'offline', canRemove: true, unavailableReason: 'Offline', connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
		], undefined);
		const groups = [...parent.querySelectorAll<HTMLElement>('.remotes-group-row')];
		const offline = parent.querySelector<HTMLElement>('[data-remote-id="environment:offline"]')!;
		assert.deepStrictEqual({
			icons: groups.map(group => group.querySelector('.remotes-name-icon .codicon')?.className),
			counts: groups.map(group => group.querySelector('.monaco-count-badge')?.textContent),
			colors: groups.map(group => dom.getWindow(group).getComputedStyle(group.querySelector('.remotes-name-icon .codicon')!).color),
			offlineColor: dom.getWindow(offline).getComputedStyle(offline).color,
			noGroupingDropdown: parent.querySelector('.remotes-group-by') === null,
			standardAdd: parent.querySelector('.remotes-add .monaco-button.secondary')?.textContent,
		}, {
			icons: ['codicon codicon-circle-filled-compact', 'codicon codicon-circle-outline', 'codicon codicon-circle-slash-compact'],
			counts: ['1', '2', '1'], colors: ['rgb(34, 170, 34)', 'rgb(34, 102, 255)', 'rgb(136, 136, 136)'],
			offlineColor: 'rgb(221, 221, 221)', noGroupingDropdown: true, standardAdd: 'Add remote host',
		});
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
			canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected,
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
			connected: ['Ready to use', 'ssh:build', 'tunnel:laptop', 'Available', 'wsl:Ubuntu'],
			disconnected: ['Ready to use', 'ssh:build', 'Available', 'tunnel:laptop', 'wsl:Ubuntu'],
			changes: [{ id: 'tunnel:laptop', connected: true }, { id: 'tunnel:laptop', connected: false }],
		});
	});

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
			values: [row.querySelector('.remotes-name')?.textContent, row.querySelector('.remotes-connection-state')?.textContent],
			aligned: cells.every((cell, index) => Math.abs(cell.getBoundingClientRect().x - headers[index].getBoundingClientRect().x) < 1),
			rowHeight: row.getBoundingClientRect().height,
			groupHeight: parent.querySelector('.remotes-group-row')!.getBoundingClientRect().height,
			headerHeight: headers[1].getBoundingClientRect().height,
			actionsWidth: headers[6].getBoundingClientRect().width === 132,
			sashes: parent.querySelectorAll('.monaco-sash.vertical').length > 0,
		}, {
			values: ['Build server', 'Connected'], aligned: true,
			rowHeight: 44, groupHeight: 32, headerHeight: 30, actionsWidth: true, sashes: true,
		});
	});

	test('remote rows leave the compact group gutter empty', () => {
		const { parent } = createWidget();
		parent.style.setProperty('--vscode-spacing-size80', '8px');
		assert.deepStrictEqual({
			groups: parent.querySelectorAll('.remotes-group-row .remotes-gutter-column .action-label').length > 0,
			visibility: parent.querySelector('[data-remote-id="ssh:build"] .remotes-gutter-column')?.classList.contains('remotes-cell-action-hidden'),
			width: parent.querySelector('.monaco-table-th')!.getBoundingClientRect().width,
		}, { groups: true, visibility: true, width: 32 });
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
		const label = parent.querySelector('[data-remote-id="ssh:build"] .remotes-name')!;
		assert.deepStrictEqual({
			visible: !warning.hidden, hover: hoverContents.get(warning), aria: row.getAttribute('aria-label')?.includes(error),
			accessible: widget.getAccessibilityContent().includes(error),
			afterLabel: warning.getBoundingClientRect().left > label.getBoundingClientRect().right,
		}, { visible: true, hover: `Connection failed. Select Troubleshoot for recovery steps.\n\n${error}`, aria: true, accessible: true, afterLabel: true });
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
			const bottom = parent.querySelector('.remotes-table-container')!.getBoundingClientRect().bottom - 10;
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
			{ visible: true, hover: 'Connection failed. Select Troubleshoot for recovery steps.\n\nFirst failure', accessible: true },
			{ visible: true, hover: 'Connection failed. Select Troubleshoot for recovery steps.\n\nFirst failure', accessible: true },
			{ visible: true, hover: 'Connection failed. Select Troubleshoot for recovery steps.\n\nSecond failure', accessible: true },
			{ visible: true, hover: 'Connection failed. Select Troubleshoot for recovery steps.\n\nSecond failure', accessible: true },
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
				const cell = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-name-row')!;
				const warning = cell.querySelector<HTMLElement>('.remotes-connection-warning')!;
				const label = cell.querySelector<HTMLElement>('.remotes-name')!;
				return {
					right: warning.getBoundingClientRect().right,
					inset: cell.getBoundingClientRect().right - warning.getBoundingClientRect().right,
					separated: label.getBoundingClientRect().right < warning.getBoundingClientRect().left,
				};
			});
			assert.deepStrictEqual(positions, positions.map(() => ({ right: positions[0].right, inset: 0, separated: true })));
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
		const snapshot = () => ({ opacity: dom.getWindow(actions).getComputedStyle(actions).opacity, pointerEvents: dom.getWindow(actions).getComputedStyle(actions).pointerEvents });
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

	test('overflow visibility action hides and restores a remote without changing its connection', async () => {
		const { parent, model, widget } = createWidget();
		const row = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"]')!;
		row.click();
		const before = getMenuAction(parent, 'ssh:build', 'visibility').label;
		runMenuAction(parent, 'ssh:build', 'visibility');
		await timeout(0);
		const hidden = {
			label: getMenuAction(parent, 'ssh:build', 'visibility').label,
			dimmed: row.classList.contains('remotes-row-hidden'),
			connection: row.querySelector('.remotes-connection-state')?.textContent,
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
			restored: model.remotes.get().find(remote => remote.id === 'ssh:build')?.hidden,
			visibilityChanges: model.visibilityChanges, connectionChanges: model.connectionChanges, managementChanges: model.managementChanges,
		}, {
			before: 'Hide from Environment Picker',
			hidden: { label: 'Show in Environment Picker', dimmed: true, connection: 'Connected', accessible: true },
			retained: 1, restored: false,
			visibilityChanges: [{ id: 'ssh:build', hidden: true }, { id: 'ssh:build', hidden: false }],
			connectionChanges: [], managementChanges: [],
		});
	});

	test('row actions expose only the connection button and overflow, with deletion last in the menu', () => {
		const { parent, model } = createWidget();
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([{
			id: 'environment:online', kind: 'environment', name: 'Online host', detail: 'online',
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, canRemove: true,
		}], undefined);
		const row = parent.querySelector<HTMLElement>('[data-remote-id]')!;
		assert.deepStrictEqual({
			buttons: [...row.querySelectorAll('.remotes-actions-column [role="button"]')].map(button => button.textContent),
			menu: getMenuActions(parent, 'environment:online').map(action => action.id),
			visibilityChanges: model.visibilityChanges, connectionChanges: model.connectionChanges,
		}, {
			buttons: ['Connect', ''],
			menu: ['remotes.actions', 'remotes.troubleshoot', 'vs.actions.separator', 'remotes.visibility', 'vs.actions.separator', 'remotes.copyAddress', 'vs.actions.separator', 'remotes.rename', 'remotes.delete'],
			visibilityChanges: [], connectionChanges: [],
		});
	});

	for (const hidden of [false, true]) {
		test(`unavailable remotes explain their absence instead of offering a visibility toggle (hidden: ${hidden})`, () => {
			const { parent, model, widget } = createWidget(OperatingSystem.Windows);
			const remote: ICustomizationRemote = {
				id: 'wsl:Debian', kind: 'wsl', name: 'Debian', detail: 'Debian', canRemove: false, hidden,
				connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
				pickerUnavailableReason: 'Connect once to add this remote to the environment picker.',
			};
			model.remotes.set([remote], undefined);
			const row = parent.querySelector<HTMLElement>('[data-remote-id]')!;
			const action = getMenuAction(parent, remote.id, 'visibility');
			const unavailable = {
				label: action.label, tooltip: action.tooltip, disabled: !action.enabled,
				accessible: widget.getAccessibilityContent().includes('not shown in environment picker: Connect once'),
			};
			runMenuAction(parent, remote.id, 'visibility');
			model.remotes.set([{ ...remote, pickerUnavailableReason: undefined }], undefined);
			assert.deepStrictEqual({
				unavailable,
				restored: {
					label: action.label, disabled: !action.enabled,
					unavailableClass: row.classList.contains('remotes-row-picker-unavailable'),
				},
				visibilityChanges: model.visibilityChanges, connectionChanges: model.connectionChanges,
			}, {
				unavailable: {
					label: 'Show in Environment Picker',
					tooltip: 'Connect once to add this remote to the environment picker.',
					disabled: true, accessible: true,
				},
				restored: {
					label: hidden ? 'Show in Environment Picker' : 'Hide from Environment Picker',
					disabled: false, unavailableClass: false,
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

	test('remote menus keep connection, organization, copy, and management groups consistent after refresh', async () => {
		const { parent, model, widget } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:desktop', kind: 'environment', name: 'Desktop', detail: 'env-desktop', canRemove: true,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected,
		}], undefined);
		const actions = () => [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row =>
			getMenuActions(parent, row.dataset.remoteId!).map(action => action.id === 'vs.actions.separator' ? '---' : action.label));
		const before = actions();
		widget.setVisible(true);
		await timeout(0);
		const expected = [
			['Connect', 'Troubleshoot Connection', '---', 'Hide from Environment Picker', '---', 'Copy Address', '---', 'Rename...', 'Remove Environment...'],
			['Connect', 'Troubleshoot Connection', '---', 'Hide from Environment Picker', '---', 'Copy Address', '---', 'Rename...', 'Configure Agent Run Behavior...', 'Delete Dev Tunnel...'],
			['Connect', 'Troubleshoot Connection', '---', 'Hide from Environment Picker', '---', 'Copy Address', '---', 'Rename...'],
			['Disconnect', 'Troubleshoot Connection', '---', 'Hide from Environment Picker', '---', 'Copy Address', '---', 'Rename...', 'Configure Agent Run Behavior...'],
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
		runMenuAction(parent, 'tunnel:laptop', 'copyAddress');
		await model.pendingManagement.complete();
		await timeout(0);
		assert.deepStrictEqual({
			disabled, deleted: model.tunnelDeletions, removed: model.managementChanges, copied: model.copiedAddresses,
			present: !!parent.querySelector('[data-remote-id="tunnel:laptop"]'),
			focused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
		}, { disabled: true, deleted: ['tunnel:laptop'], removed: [], copied: ['tunnel:laptop'], present: false, focused: true });
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
			...ssh, canDelete: true,
			connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1'], ['2'], 'vendor/update'),
		}], undefined);
		assert.deepStrictEqual(getMenuActions(parent, ssh.id).map(action => action.id === 'vs.actions.separator' ? '---' : action.label), [
			'Connect', 'Troubleshoot Connection', '---',
			'Hide from Environment Picker', '---',
			'Copy Address', '---',
			'Rename...', 'Configure Agent Run Behavior...', 'Update Server', 'Forget SSH Connection...',
		]);
	});

	test('Copy Address works from overflow on every visible remote without changing connections', async () => {
		const { parent, model } = createWidget(OperatingSystem.Windows);
		model.environmentsEnabled.set(true, undefined);
		model.remotes.set([...model.remotes.get(), {
			id: 'environment:offline', name: 'Offline', kind: 'environment', detail: 'host', canRemove: true,
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Offline',
		}], undefined);
		const ids = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId!);
		for (const id of ids) {
			runMenuAction(parent, id, 'copyAddress');
			await timeout(0);
		}
		assert.deepStrictEqual({ copied: model.copiedAddresses, connections: model.connectionChanges }, { copied: ids, connections: [] });
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
			runMenuAction(parent, id, 'copyAddress');
			await model.pendingManagement.complete();
			await timeout(0);
			assert.deepStrictEqual({
				busy, enabled: save.getAttribute('aria-disabled'), calls: model.locationChanges, preference: model.preferences.get(id), copied: model.copiedAddresses, actionOrder,
			}, { busy: 'true', enabled: 'true', calls: [id], preference: 'dedicated', copied: [id], actionOrder: isWindows ? ['Save and reconnect', 'Cancel'] : ['Cancel', 'Save and reconnect'] });
		});
	}

	for (const saved of [false, true]) {
		test(`run behavior failure gives a recovery path without technical details when saved=${saved}`, async () => {
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
			await model.pendingManagement.error(new Error('Internal transport stack and host path'));
			await timeout(0);
			details.querySelector<HTMLElement>('.remotes-task-back .action-label')!.click();
			assert.deepStrictEqual({
				technicalDetails: details.textContent?.includes('Internal transport stack'),
				message: details.querySelector('.remotes-details-feedback')?.textContent,
				retryDisabled: save.getAttribute('aria-disabled'),
				backNavigated: !widget.detailsVisible.get(),
			}, {
				technicalDetails: false,
				message: saved
					? 'Your choice was saved, but reconnection failed. Go back and select Troubleshoot connection.'
					: 'Couldn\'t save your choice. Try again.',
				retryDisabled: String(saved),
				backNavigated: true,
			});
		});
	}

	test('task Back preserves the overview query and filter and restores row focus', () => {
		const { parent, widget } = createWidget();
		parent.querySelector<HTMLElement>('.remotes-type-filter [aria-label="SSH"]')!.click();
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
			filter: parent.querySelector('.remotes-type-filter [aria-pressed="true"]')?.textContent,
			ids: [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId),
			focus: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list'),
			scopedContent: visibleContent.includes('Agent run behavior') && !visibleContent.includes('Ready to use'),
		}, { pageVisible: false, overviewHidden: false, query: 'build', filter: 'SSH', ids: ['ssh:build'], focus: true, scopedContent: true });
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
		assert.deepStrictEqual({ retained, selectedEditor: selection?.startsWith('Use the remote VS Code window'), cancelled, removed: !parent.querySelector('.remotes-environment-details'), changes: model.locationChanges }, {
			retained: true, selectedEditor: true, cancelled: true, removed: true, changes: [],
		});
	});

	test('run behavior distinguishes the saved choice from a pending selection and updates it after saving', async () => {
		const { parent, model } = createWidget();
		model.preferences.set('ssh:build', 'dedicated');
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const choices = details.querySelectorAll<HTMLElement>('[role="radio"]');
		choices[1].click();
		const read = () => [...choices].map(choice => ({
			selected: choice.getAttribute('aria-checked'),
			current: choice.querySelector('.remotes-choice-current')?.textContent,
		}));
		const pending = read();
		details.querySelector<HTMLElement>('.remotes-details-actions .monaco-button:not(.secondary)')!.click();
		await timeout(0);
		assert.deepStrictEqual({ pending, saved: read(), preference: model.preferences.get('ssh:build') }, {
			pending: [{ selected: 'false', current: 'Current' }, { selected: 'true', current: '' }],
			saved: [{ selected: 'false', current: '' }, { selected: 'true', current: 'Current' }],
			preference: 'editor',
		});
	});

	test('run behavior explains both choices before one is selected', () => {
		const { parent } = createWidget();
		runMenuAction(parent, 'ssh:build', 'locationPreference');
		const choices = [...parent.querySelectorAll<HTMLElement>('.remotes-run-choices [role="radio"]')];
		assert.deepStrictEqual(choices.map(choice => ({
			selected: choice.getAttribute('aria-checked'),
			description: choice.querySelector('.remotes-choice-description')?.textContent,
		})), [
			{ selected: 'false', description: 'Run agents separately from the remote editor. Keep the computer awake and online while they work.' },
			{ selected: 'false', description: 'Use agents in an open VS Code window on the remote computer. They aren\'t available after that window closes.' },
		]);
	});

	for (const kind of ['environment', 'tunnel'] as const) {
		test(`${kind} recovery labels generated names and keeps registration IDs out of the page`, () => {
			const { parent, model } = createWidget();
			model.environmentsEnabled.set(true, undefined);
			const remote: ICustomizationRemote = {
				id: `${kind}:registration`, kind, name: 'giant-river-63l4ndx', detail: '199d7664-8edf-4130-aa41-caff68e2e95e',
				canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Offline',
			};
			model.remotes.set([remote], undefined);
			runMenuAction(parent, remote.id, 'troubleshoot');
			const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
			assert.deepStrictEqual({
				name: details.querySelector('.remotes-details-owner')?.textContent,
				identity: [...details.querySelectorAll('.remotes-task-identity-detail > *')].map(element => element.textContent),
				headings: [...details.querySelectorAll('.remotes-details-body h3')].map(element => element.textContent),
				showsId: details.textContent?.includes(remote.detail),
				reportGuidanceGrouped: details.querySelector('.remotes-recovery-report')?.textContent?.includes('Review and remove sensitive details before sharing.'),
				sharingGuidance: details.textContent?.includes('On the remote computer, select Share this computer to turn on sharing.'),
			}, {
				name: 'giant-river-63l4ndx',
				identity: ['Environment', 'giant-river-63l4ndx', 'Status', kind === 'environment' ? 'Offline' : 'Unavailable', 'Type', kind === 'environment' ? 'GitHub Environment (Preview)' : 'Dev Tunnel'],
				headings: ['Try these steps', 'Collect diagnostics'],
				showsId: false, reportGuidanceGrouped: true, sharingGuidance: true,
			});
		});
	}

	test('recovery keeps technical details out of the modal and exports them only on request', async () => {
		const { parent, model, snapshots, copied, opened, commands, hoverContents } = createWidget(OperatingSystem.Windows, 'status');
		model.remotes.set([{ ...model.remotes.get()[0], connectionStatus: RemoteAgentHostConnectionStatus.disconnected, lastConnectionError: 'Network failed https://relay/?token=test-secret' }], undefined);
		parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-connection-warning')!.click();
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const before = {
			snapshots: snapshots(), rawProblemVisible: details.textContent?.includes('Network failed'),
			guidance: details.textContent?.includes('sign in to this address using SSH'),
			localScope: details.textContent?.includes('local logs for all environments'),
			actions: [...details.querySelectorAll('.remotes-details-footer .monaco-button')].map(button => button.textContent),
			supportAfterActions: details.querySelector('.remotes-recovery-next')?.nextElementSibling?.classList.contains('remotes-recovery-support'),
			reportParagraphs: details.querySelectorAll('.remotes-recovery-report > p').length,
			editorGuidance: hoverContents.get([...details.querySelectorAll<HTMLElement>('.monaco-link')].find(link => link.textContent === 'Open diagnostic report')!),
			buttons: details.querySelectorAll('.monaco-button').length,
			collapsible: !!details.querySelector('details'),
		};
		[...details.querySelectorAll<HTMLElement>('.monaco-link')].find(link => link.textContent === 'Open diagnostic report')!.click();
		await timeout(0);
		const report = 'Connection report\n\nLatest error for Build server:\nNetwork failed https://relay/?[redacted]';
		assert.deepStrictEqual({
			before, snapshots: snapshots(), copied, opened, commands, connections: model.connectionChanges,
		}, {
			before: { snapshots: 0, rawProblemVisible: false, guidance: true, localScope: true, actions: ['Retry connection'], supportAfterActions: true, reportParagraphs: 2, editorGuidance: 'Open diagnostic report in the editor', buttons: 2, collapsible: false },
			snapshots: 1, copied: [],
			opened: [{ input: { contents: report, languageId: 'plaintext', options: { pinned: true } }, group: undefined }],
			commands: ['workbench.action.closeModalEditor'], connections: [],
		});
	});

	for (const action of ['locationPreference', 'troubleshoot'] as const) {
		test(`${action} leads with the task and retains readable environment context when renamed`, () => {
			const { parent, model } = createWidget();
			runMenuAction(parent, 'ssh:build', action);
			const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
			const read = () => ({
				title: details.querySelector('h2.remotes-task-title')?.textContent,
				name: details.querySelector('.remotes-details-owner')?.textContent,
				detail: [...details.querySelectorAll('.remotes-task-identity-detail > *')].map(element => element.textContent),
				taskInBody: !!details.querySelector('.remotes-details-body > .remotes-task-title'),
				metadataInBody: !!details.querySelector('.remotes-details-body > dl.remotes-task-identity-detail'),
				healthCard: !!details.querySelector('.remotes-recovery-health'),
			});
			const before = read();
			model.remotes.set(model.remotes.get().map(remote => remote.id === 'ssh:build' ? {
				...remote, name: 'Renamed server', detail: 'new.example.com',
			} : remote), undefined);
			assert.deepStrictEqual({ before, after: read() }, {
				before: { title: action === 'locationPreference' ? 'Agent run behavior' : 'Troubleshoot connection', name: 'Build server', detail: ['Environment', 'Build server', 'Status', 'Connected', 'Type', 'SSH', 'Host address', 'build.example.com'], taskInBody: false, metadataInBody: true, healthCard: false },
				after: { title: action === 'locationPreference' ? 'Agent run behavior' : 'Troubleshoot connection', name: 'Renamed server', detail: ['Environment', 'Renamed server', 'Status', 'Connected', 'Type', 'SSH', 'Host address', 'new.example.com'], taskInBody: false, metadataInBody: true, healthCard: false },
			});
		});
	}

	test('task pages share metadata row alignment and typography', () => {
		const { parent } = createWidget();
		parent.style.setProperty('--vscode-fontSize-body1', '13px');
		parent.style.setProperty('--vscode-fontWeight-regular', '400');
		parent.style.setProperty('--vscode-fontWeight-semiBold', '600');
		parent.style.setProperty('--vscode-foreground', '#dddddd');
		parent.style.setProperty('--vscode-descriptionForeground', '#aaaaaa');
		const pages = ['locationPreference', 'troubleshoot'].map(action => {
			runMenuAction(parent, 'ssh:build', action);
			const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
			const labels = [...details.querySelectorAll<HTMLElement>('.remotes-task-identity-detail dt')];
			const values = [...details.querySelectorAll<HTMLElement>('.remotes-task-identity-detail dd')];
			const style = (element: HTMLElement) => {
				const computed = dom.getWindow(element).getComputedStyle(element);
				return { size: computed.fontSize, weight: computed.fontWeight, color: computed.color };
			};
			const result = {
				aligned: labels.every((label, index) => label.offsetLeft === labels[0].offsetLeft
					&& values[index].offsetLeft === values[0].offsetLeft && label.offsetTop === values[index].offsetTop),
				labels: [...new Set(labels.map(element => JSON.stringify(style(element))))],
				values: [...new Set(values.map(element => JSON.stringify(style(element))))],
			};
			details.querySelector<HTMLElement>('.remotes-task-back .action-label')!.click();
			return result;
		});
		const expected = {
			aligned: true,
			labels: [JSON.stringify({ size: '13px', weight: '600', color: 'rgb(221, 221, 221)' })],
			values: [JSON.stringify({ size: '13px', weight: '400', color: 'rgb(221, 221, 221)' })],
		};
		assert.deepStrictEqual(pages, [expected, expected]);
	});

	test('troubleshooting returns through Back or Escape without a Done action', () => {
		const { parent, widget } = createWidget();
		const results = ['back', 'escape'].map(action => {
			runMenuAction(parent, 'ssh:build', 'troubleshoot');
			const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
			const actions = [...details.querySelectorAll('.remotes-details-footer .monaco-button')].map(button => button.textContent);
			if (action === 'back') {
				details.querySelector<HTMLElement>('.remotes-task-back .action-label')!.click();
			} else {
				details.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			}
			return { actions, visible: widget.detailsVisible.get(), focused: dom.getActiveElement() === parent.querySelector('.monaco-table .monaco-list') };
		});
		assert.deepStrictEqual(results, [
			{ actions: [], visible: false, focused: true },
			{ actions: [], visible: false, focused: true },
		]);
	});

	test('recovery keeps its actions visible independently of the selected row position', () => {
		const { parent, widget, model } = createWidget(OperatingSystem.Windows, 'status');
		parent.style.height = '500px';
		const remote = { ...model.remotes.get()[0], name: 'Z build', connectionStatus: RemoteAgentHostConnectionStatus.disconnected };
		model.remotes.set([
			...Array.from({ length: 5 }, (_, i) => ({ ...remote, id: `ssh:${i}`, name: `A build ${i}` })),
			remote,
		], undefined);
		widget.layout();
		runMenuAction(parent, remote.id, 'troubleshoot');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const footer = details.querySelector<HTMLElement>('.remotes-details-footer')!.getBoundingClientRect();
		const viewport = parent.getBoundingClientRect();
		assert.ok(footer.height > 0 && footer.bottom <= viewport.bottom + 1, 'Recovery actions remain visible within the task page');
	});

	test('recovery offers refresh for offline environments and update only with advertised support', async () => {
		const { parent, model } = createWidget();
		const remote = { ...model.remotes.get()[2], unavailableReason: 'Offline' };
		model.remotes.set([remote], undefined);
		runMenuAction(parent, remote.id, 'troubleshoot');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const primary = () => details.querySelector<HTMLElement>('.remotes-details-footer .monaco-button:not(.secondary)');
		const offlineAction = primary()?.textContent;
		primary()!.click();
		await timeout(0);
		model.remotes.set([{ ...remote, unavailableReason: undefined, connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1'], ['2'], 'vendor/update') }], undefined);
		const updateAction = primary()?.textContent;
		primary()!.click();
		await timeout(0);
		assert.deepStrictEqual({
			offlineAction, refreshes: model.refreshCalls, updateAction, updates: model.serverUpdates,
			title: details.querySelector('.remotes-recovery-status')?.textContent, primary: primary()?.textContent, connects: model.connectionChanges,
		}, { offlineAction: 'Refresh', refreshes: 1, updateAction: 'Update server', updates: [remote.id], title: 'Connected', primary: undefined, connects: [] });
	});

	test('recovery distinguishes healthy, pending, failed and unsupported-version connections', () => {
		const { parent, model } = createWidget();
		const remote = model.remotes.get()[0];
		runMenuAction(parent, remote.id, 'troubleshoot');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const states = [
			{ connectionStatus: RemoteAgentHostConnectionStatus.connected },
			{ connectionStatus: RemoteAgentHostConnectionStatus.reconnecting },
			{ connectionStatus: RemoteAgentHostConnectionStatus.disconnected, lastConnectionError: 'Network failed' },
			{ connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1']) },
			{ connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1'], undefined, 'vendor/update') },
		].map(state => {
			model.remotes.set([{ ...remote, ...state }], undefined);
			return {
				status: details.querySelector('.remotes-recovery-status')?.textContent,
				icon: details.querySelector('.remotes-recovery-status .codicon')?.className,
				steps: !!details.querySelector('.remotes-recovery-steps'),
				actions: [...details.querySelectorAll('.remotes-details-footer .monaco-button')].map(button => [button.textContent, button.getAttribute('aria-disabled')]),
			};
		});
		assert.deepStrictEqual(states, [
			{ status: 'Connected', icon: 'codicon codicon-circle-filled-compact', steps: false, actions: [] },
			{ status: 'Reconnecting', icon: 'codicon codicon-loading-compact codicon-modifier-spin', steps: false, actions: [] },
			{ status: 'Disconnected', icon: 'codicon codicon-debug-disconnect-compact', steps: true, actions: [['Retry connection', 'false']] },
			{ status: 'Update required', icon: 'codicon codicon-warning', steps: true, actions: [] },
			{ status: 'Update required', icon: 'codicon codicon-warning', steps: true, actions: [['Update server', 'false']] },
		]);
	});

	test('Copy report shares sanitized diagnostics without opening an editor or changing connection health', async () => {
		const { parent, model, snapshots, copied, opened, commands } = createWidget();
		const remote = { ...model.remotes.get()[0], connectionStatus: RemoteAgentHostConnectionStatus.disconnected, lastConnectionError: 'Network failed https://relay/?token=test-secret' };
		model.remotes.set([remote], undefined);
		runMenuAction(parent, remote.id, 'troubleshoot');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const copy = details.querySelector<HTMLElement>('.remotes-copy-report')!;
		copy.focus();
		copy.click();
		copy.click();
		await timeout(0);
		assert.deepStrictEqual({
			snapshots: snapshots(), copied, opened, commands, connections: model.connectionChanges,
			status: details.querySelector('.remotes-recovery-status')?.textContent,
			feedback: details.querySelector('.remotes-recovery-report .remotes-details-feedback')?.textContent,
			focused: dom.getActiveElement() === details.querySelector('.remotes-copy-report'),
			enabled: details.querySelector('.remotes-copy-report')?.getAttribute('aria-disabled'),
		}, {
			snapshots: 1, copied: ['Connection report\n\nLatest error for Build server:\nNetwork failed https://relay/?[redacted]'],
			opened: [], commands: [], connections: [], status: 'Disconnected',
			feedback: 'Report copied. Review and remove sensitive details before sharing.', focused: true, enabled: 'false',
		});
	});

	test('a failed diagnostic copy can be retried without being reported as a connection failure', async () => {
		const { parent, model, copied, failDiagnosticCopy } = createWidget();
		const remote = model.remotes.get()[2];
		runMenuAction(parent, remote.id, 'troubleshoot');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		failDiagnosticCopy(new Error('Clipboard unavailable'));
		details.querySelector<HTMLElement>('.remotes-copy-report')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			status: details.querySelector('.remotes-recovery-status')?.textContent,
			message: details.querySelector('.remotes-recovery-report .remotes-details-feedback')?.textContent,
			enabled: details.querySelector('.remotes-copy-report')?.getAttribute('aria-disabled'),
			connect: details.querySelector('.remotes-details-footer .monaco-button:not(.secondary)')?.textContent,
			copied,
		}, { status: 'Disconnected', message: 'Couldn\'t collect or share the diagnostic report. Try again.', enabled: 'false', connect: 'Connect', copied: [] });
	});

	test('failed recovery retains a short message and exports the error without leaving buttons stuck', async () => {
		const { parent, model, opened } = createWidget();
		const remote = model.remotes.get()[2];
		runMenuAction(parent, remote.id, 'troubleshoot');
		model.pendingConnection = new DeferredPromise<void>();
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		details.querySelector<HTMLElement>('.remotes-details-footer .monaco-button:not(.secondary)')!.click();
		const recoveryOrder = () => [...details.querySelector('.remotes-recovery-next')!.children]
			.map(element => element.tagName === 'P' && element.classList.contains('remotes-recovery-links') ? 'documentation'
				: element.classList.contains('remotes-details-feedback') ? 'feedback'
					: element.classList.contains('remotes-details-footer') ? 'actions' : element.tagName);
		const workingOrder = recoveryOrder();
		await model.pendingConnection.error(new Error('connect ECONNREFUSED'));
		await timeout(0);
		const failed = {
			message: details.querySelector('.remotes-details-feedback')?.textContent,
			enabled: details.querySelector('.remotes-details-footer .monaco-button:not(.secondary)')?.getAttribute('aria-disabled'),
			order: recoveryOrder(),
		};
		[...details.querySelectorAll<HTMLElement>('.monaco-link')].find(link => link.textContent === 'Open diagnostic report')!.click();
		await timeout(0);
		assert.deepStrictEqual({ workingOrder, failed, opened }, {
			workingOrder: ['H3', 'OL', 'feedback', 'actions', 'documentation'],
			failed: { message: 'Couldn\'t complete the action. Try again, or open the diagnostic report for details.', enabled: 'false', order: ['H3', 'OL', 'feedback', 'actions', 'documentation'] },
			opened: [{ input: { contents: 'Connection report\n\nLatest error for Laptop:\nconnect ECONNREFUSED', languageId: 'plaintext', options: { pinned: true } }, group: undefined }],
		});
	});

	test('recovery and report links stay below their buttons at wide and narrow widths', async () => {
		const { parent, model, widget } = createWidget();
		const remote = { ...model.remotes.get()[0], connectionStatus: RemoteAgentHostConnectionStatus.disconnected };
		model.remotes.set([remote], undefined);
		runMenuAction(parent, remote.id, 'troubleshoot');
		const details = parent.querySelector<HTMLElement>('.remotes-environment-details')!;
		const scenes = [900, 360].map(width => {
			parent.style.width = `${width}px`;
			widget.layout();
			const read = (section: Element) => {
				const button = section.querySelector<HTMLElement>('.monaco-button')!.getBoundingClientRect();
				const link = section.querySelector<HTMLElement>('.remotes-recovery-links .monaco-link')!.getBoundingClientRect();
				return { below: link.top >= button.bottom, leftAligned: Math.abs(link.left - button.left) < 1 };
			};
			return { recovery: read(details.querySelector('.remotes-recovery-next')!), report: read(details.querySelector('.remotes-recovery-report')!) };
		});
		details.querySelector<HTMLElement>('.remotes-copy-report')!.click();
		const reportOrder = () => [...details.querySelector('.remotes-recovery-report')!.children].map(element => element.className || element.tagName);
		const working = reportOrder();
		const workingFeedback = details.querySelector('.remotes-report-feedback')?.textContent;
		await timeout(0);
		const copied = reportOrder();
		model.pendingConnection = new DeferredPromise<void>();
		details.querySelector<HTMLElement>('.remotes-details-footer .monaco-button')!.click();
		const recoveryFeedback = details.querySelector('.remotes-recovery-next > .remotes-details-feedback')?.textContent;
		await model.pendingConnection.complete();
		await timeout(0);
		assert.deepStrictEqual({ scenes, working, copied, workingFeedback, recoveryFeedback }, {
			scenes: [
				{ recovery: { below: true, leftAligned: true }, report: { below: true, leftAligned: true } },
				{ recovery: { below: true, leftAligned: true }, report: { below: true, leftAligned: true } },
			],
			working: ['P', 'remotes-report-feedback', 'remotes-details-actions', 'remotes-recovery-links'],
			copied: ['P', 'remotes-report-feedback', 'remotes-details-actions', 'remotes-recovery-links'],
			workingFeedback: 'Working...', recoveryFeedback: 'Working...',
		});
	});

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
			return findMenuAction(parent, remote.id, 'updateServer')?.label ?? null;
		});
		assert.deepStrictEqual(labels, [null, null, 'Update Server', null, null]);
	});

	test('Update Server in overflow blocks duplicates and restores focus when it disappears', async () => {
		const { parent, model } = createWidget();
		model.remotes.set([{
			...model.remotes.get()[0],
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
			...model.remotes.get()[0],
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

	test('task actions report failures and location changes re-enable for retry', async () => {
		const { parent, model, errors } = createWidget();
		const copyError = new Error('Clipboard unavailable');
		const locationError = new Error('Cannot save preference');
		model.copyFailure = copyError;
		runMenuAction(parent, 'tunnel:laptop', 'copyAddress');
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
			connectionStatus: RemoteAgentHostConnectionStatus.connected,
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
			id: 'ssh:other', kind: 'ssh', name: 'Other', detail: 'other.example.com', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected,
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
		const noMatches = parent.querySelector('.remotes-message [role="status"]')?.textContent;
		widget.setVisible(true);
		await timeout(0);
		const refreshed = groups();
		widget.setSearchQuery('');
		assert.deepStrictEqual({
			matched, omittedFromAccessibleView: !accessible.includes('Dev Tunnels') && !accessible.includes('GitHub Environments') && !accessible.includes('WSL'),
			removed, noMatches, refreshed, restored: groups(),
		}, {
			matched: ['SSH'], omittedFromAccessibleView: true, removed: [], noMatches: 'No environments match your search.', refreshed: [],
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
			renameDisabled: !getMenuAction(parent, 'ssh:unavailable', 'rename').enabled,
		}, { disabled: 'true', changes: [], renameDisabled: false });
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
		assert.deepStrictEqual({ observed, accessible: widget.getAccessibilityContent().includes('Status: Update required') }, {
			observed: [
				{ status: 'Connected', action: 'Disconnect Build server', disabled: false },
				{ status: 'Disconnected', action: 'Connect to Build server', disabled: false },
				{ status: '', action: 'Connecting: Build server', disabled: true },
				{ status: '', action: 'Reconnecting: Build server', disabled: true },
				{ status: 'Update required', action: 'Connect to Build server', disabled: false },
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
			accessible: widget.getAccessibilityContent().includes('Status: Disconnecting'),
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

	test('connection failures are surfaced and the action becomes available again', async () => {
		const { parent, model, errors } = createWidget();
		model.pendingConnection = new DeferredPromise<void>();
		const action = getConnectionAction(parent, 'tunnel:laptop');
		action.click();
		const error = new Error('Connection refused');
		await model.pendingConnection.error(error);
		await timeout(0);
		assert.deepStrictEqual({
			errors, disabled: action.getAttribute('aria-disabled'), renameDisabled: !getMenuAction(parent, 'tunnel:laptop', 'rename').enabled,
			status: parent.querySelector('[data-remote-id="tunnel:laptop"] .remotes-connection-state')?.textContent,
		}, { errors: [error], disabled: 'false', renameDisabled: false, status: 'Disconnected' });
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
			accessible: widget.getAccessibilityContent().includes('Couldn\'t refresh Dev Tunnels.'),
			globalBusy: parent.querySelector('.remotes-table-container')?.getAttribute('aria-busy'),
		};
		await model.pendingRefresh.complete(['tunnel']);
		await timeout(0);
		assert.deepStrictEqual({ waiting, partial }, {
			waiting: [{ name: 'Dev Tunnels', spinning: true, warning: false }, { name: 'SSH', spinning: true, warning: false }],
			partial: {
				groups: [{ name: 'Dev Tunnels', spinning: false, warning: true }, { name: 'SSH', spinning: true, warning: false }],
				failedMessage: 'Couldn\'t refresh Dev Tunnels.', accessible: true, globalBusy: 'true',
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
		const guidance = widget.getAccessibilityContent().includes('No GitHub Environments available.');
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
			renameDisabled: !getMenuAction(parent, 'environment:desktop', 'rename').enabled,
			deleteDisabled: !getMenuAction(parent, 'environment:desktop', 'delete').enabled,
		}, {
			connect: 'Connect to Desktop: Start the owning application.', disabled: 'true',
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
			connectionStatus: RemoteAgentHostConnectionStatus.disconnected, unavailableReason: 'Start the owning application.',
			pickerUnavailableReason: 'Available when the owning application is online.',
		}], undefined);
		const row = parent.querySelector<HTMLElement>('[data-remote-id="environment:desktop"]')!;
		row.click();
		const table = parent.querySelector<HTMLElement>('.monaco-table .monaco-list')!;
		table.focus();
		const connection = row.querySelector<HTMLElement>('.remotes-connection-state')!;
		const offline = {
			connection: connection.textContent,
			offlineIndicator: !!row.querySelector('.remotes-connection-indicator .codicon-circle-slash-compact'),
			nameOpacity: dom.getWindow(row).getComputedStyle(row.querySelector<HTMLElement>('.remotes-name')!).opacity,
			tooltip: hoverContents.get(connection),
			infoIcons: row.querySelectorAll('.codicon-info').length,
			addressColumns: parent.querySelectorAll('.remotes-address-column').length,
			accessibleView: widget.getAccessibilityContent().includes('Status: Offline') && widget.getAccessibilityContent().includes('Start the owning application.'),
		};
		model.remotes.set(model.remotes.get().map(remote => ({ ...remote, unavailableReason: undefined })), undefined);
		assert.deepStrictEqual({
			offline,
			available: parent.querySelector('[data-remote-id] .remotes-connection-state')?.textContent,
			tableFocused: dom.getActiveElement() === table,
		}, {
			offline: { connection: 'Offline', offlineIndicator: true, nameOpacity: '1', tooltip: 'Start the owning application.', infoIcons: 0, addressColumns: 0, accessibleView: true },
			available: 'Disconnected', tableFocused: true,
		});
	});

	test('offline availability does not override an active connection or pending action', async () => {
		const { parent, model, widget, hoverContents } = createWidget();
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
			const label = parent.querySelector<HTMLElement>('[data-remote-id] .remotes-connection-state')!;
			return {
				label: label.textContent,
				offlineHover: hoverContents.get(label) === offline.unavailableReason,
				offlineAccessible: widget.getAccessibilityContent().includes(offline.unavailableReason!),
			};
		});
		model.remotes.set([{ ...offline, connectionStatus: RemoteAgentHostConnectionStatus.connected }], undefined);
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, offline.id).click();
		const readPending = () => ({
			label: parent.querySelector('[data-remote-id] .remotes-connection-state')?.textContent ?? '',
			offlineHover: hoverContents.get(parent.querySelector<HTMLElement>('[data-remote-id] .remotes-connection-state')!) === offline.unavailableReason,
			offlineAccessible: widget.getAccessibilityContent().includes(offline.unavailableReason!),
		});
		observed.push(readPending());
		await model.pendingConnection.complete();
		await timeout(0);
		observed.push(readPending());
		assert.deepStrictEqual(observed, [
			{ label: 'Offline', offlineHover: true, offlineAccessible: true },
			{ label: 'Connected', offlineHover: false, offlineAccessible: false },
			{ label: '', offlineHover: false, offlineAccessible: false },
			{ label: '', offlineHover: false, offlineAccessible: false },
			{ label: '', offlineHover: false, offlineAccessible: false },
			{ label: 'Offline', offlineHover: true, offlineAccessible: true },
		]);
	});

	test('connection indicators follow this window and clear during pending actions and row reuse', async () => {
		const { parent, model } = createWidget();
		const remote = model.remotes.get()[0];
		const read = () => {
			const cell = parent.querySelector<HTMLElement>('[data-remote-id="ssh:build"] .remotes-connection-column')!;
			const indicator = cell.querySelector<HTMLElement>('.remotes-connection-indicator')!;
			return {
				label: cell.querySelector('.remotes-connection-state')?.textContent,
				connected: indicator.classList.contains('connected'), pending: !!indicator.querySelector('.codicon-loading-compact'), hidden: indicator.hidden, decorative: indicator.getAttribute('aria-hidden'),
			};
		};
		const states = [
			RemoteAgentHostConnectionStatus.connected, RemoteAgentHostConnectionStatus.disconnected,
			RemoteAgentHostConnectionStatus.connecting, RemoteAgentHostConnectionStatus.reconnecting,
		].map(connectionStatus => {
			model.remotes.set([{ ...remote, connectionStatus }], undefined);
			return read();
		});
		model.remotes.set([{ ...remote, connectionStatus: RemoteAgentHostConnectionStatus.connected }], undefined);
		model.pendingConnection = new DeferredPromise<void>();
		getConnectionAction(parent, remote.id).click();
		states.push(read());
		await model.pendingConnection.complete();
		await timeout(0);
		states.push(read());
		model.remotes.set([], undefined);
		assert.deepStrictEqual({ states, groupIndicators: [...parent.querySelectorAll<HTMLElement>('.remotes-group-row .remotes-connection-indicator')].every(indicator => indicator.hidden) }, {
			states: [
				{ label: 'Connected', connected: true, pending: false, hidden: false, decorative: 'true' },
				{ label: 'Disconnected', connected: false, pending: false, hidden: false, decorative: 'true' },
				{ label: '', connected: false, pending: true, hidden: true, decorative: 'true' },
				{ label: '', connected: false, pending: true, hidden: true, decorative: 'true' },
				{ label: '', connected: false, pending: true, hidden: true, decorative: 'true' },
				{ label: 'Disconnected', connected: false, pending: false, hidden: false, decorative: 'true' },
			],
			groupIndicators: true,
		});
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

	test('narrow environment controls wrap without clipping filters or overlapping search', () => {
		const { widget, parent, model } = createWidget(OperatingSystem.Windows, 'status');
		model.environmentsEnabled.set(true, undefined);
		parent.style.width = '360px';
		const results = [undefined, 'Other environments'].map(heading => {
			widget.setHeading(heading);
			widget.layout();
			const bounds = widget.domNode.getBoundingClientRect();
			const search = parent.querySelector('input')!.getBoundingClientRect();
			const filters = [...parent.querySelectorAll<HTMLElement>('.remotes-type-filter [role="button"]')];
			return {
				filterCount: filters.length,
				filtersVisible: filters.every(filter => {
					const rect = filter.getBoundingClientRect();
					return rect.width > 0 && rect.left >= bounds.left && rect.right <= bounds.right;
				}),
				searchSeparate: filters.every(filter => {
					const rect = filter.getBoundingClientRect();
					return rect.top >= search.bottom || rect.bottom <= search.top || rect.left >= search.right || rect.right <= search.left;
				}),
			};
		});
		assert.deepStrictEqual(results, [
			{ filterCount: 5, filtersVisible: true, searchSeparate: true },
			{ filterCount: 5, filtersVisible: true, searchSeparate: true },
		]);
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
			const authRow = [...parent.querySelectorAll<HTMLElement>('.monaco-list-row')].find(row => row.textContent?.includes('Sign in to'))!;
			authRow.click();
			const link = authRow.querySelector<HTMLElement>('.remotes-empty-signin .monaco-link')!;
			const before = {
				copy: authRow.querySelector('.remotes-name')?.textContent, warnings: parent.querySelectorAll('.remotes-refresh-warning:not([hidden])').length,
				genericError: parent.textContent?.includes('Couldn\'t refresh Dev Tunnels.'), tabbable: link.tabIndex,
				cached: parent.querySelectorAll('[data-remote-id="tunnel:laptop"]').length,
				accessible: widget.getAccessibilityContent().includes('Sign in'),
				spinners: authRow.querySelectorAll('.remotes-signin-progress:not([hidden])').length,
				guide: !authRow.querySelector<HTMLElement>('.remotes-empty-actions')!.hidden,
				height: authRow.style.height,
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
				before: hasCachedTunnels
					? { copy: 'Sign in to refresh your tunnels.', warnings: 0, genericError: false, tabbable: 0, cached: 1, accessible: true, spinners: 0, guide: false, height: '54px' }
					: { copy: 'No dev tunnels found for this account.', warnings: 0, genericError: false, tabbable: 0, cached: 0, accessible: true, spinners: 0, guide: true, height: '76px' },
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
			accessibleGuidance: widget.getAccessibilityContent().includes('SSH setup guide: https://aka.ms/vscode-agent-ssh'),
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
		assert.deepStrictEqual({ loading, refreshed, filtered: labels(), message: parent.querySelector('.remotes-message [role="status"]')?.textContent, setupLinks: parent.querySelectorAll('.remotes-empty-actions:not([hidden]) .monaco-link').length }, {
			loading: [],
			refreshed: ['Couldn\'t refresh Dev Tunnels.', 'No SSH hosts configured.'],
			filtered: [], message: 'No environments match your search.',
			setupLinks: 0,
		});
	});
});
