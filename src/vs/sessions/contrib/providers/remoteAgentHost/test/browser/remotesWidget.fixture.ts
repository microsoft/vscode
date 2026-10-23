/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { OperatingSystem, OS } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IListService, ListService } from '../../../../../../platform/list/browser/listService.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ICustomizationRemote, IRemotesModel, RemoteKind } from '../../browser/remotesModel.js';
import { RemotesWidget } from '../../browser/remotesWidget.js';

const remotes: ICustomizationRemote[] = [
	{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
	{ id: 'ssh:staging', kind: 'ssh', name: 'Staging', detail: 'staging.example.com', canRemove: false, connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
	{ id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu-24.04', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connecting },
	{ id: 'wsl:Debian', kind: 'wsl', name: 'Debian', detail: 'Debian', canRemove: false, connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
	{ id: 'tunnel:laptop', kind: 'tunnel', name: 'Work laptop', detail: 'work-laptop-europe', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.reconnecting },
	{ id: 'tunnel:home', kind: 'tunnel', name: 'Home workstation', detail: 'home-workstation', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.incompatible('The remote host needs an update.', ['1']) },
	{ id: 'container:project', kind: 'devContainer', name: 'Project development container', detail: '/Users/developer/projects/example-project-with-a-long-source-folder-name', canRemove: true, connectionStatus: RemoteAgentHostConnectionStatus.connected },
	{ id: 'container:api', kind: 'devContainer', name: 'API service', detail: '/Users/developer/projects/api', canRemove: false, connectionStatus: RemoteAgentHostConnectionStatus.disconnected },
];

async function render({ container, disposableStore, theme }: ComponentFixtureContext, width: number, operatingSystem = OS, empty = false, failedKinds: readonly RemoteKind[] = []): Promise<void> {
	container.style.width = `${width}px`;
	container.style.height = '640px';
	container.classList.add('remotes-editor');
	const content = dom.append(container, dom.$('.remotes-editor-content'));
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
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
		},
	});
	const model = disposableStore.add(new class extends Disposable implements IRemotesModel {
		readonly remotes = observableValue<readonly ICustomizationRemote[]>(this, empty ? [] : remotes);
		async refresh() { return failedKinds; }
		async rename(id: string) {
			this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, name: `${remote.name} (renamed)` } : remote), undefined);
		}
		async remove(id: string) {
			this.remotes.set(this.remotes.get().filter(remote => remote.id !== id), undefined);
		}
		async setConnected(id: string, connected: boolean) {
			this.remotes.set(this.remotes.get().map(remote => remote.id === id ? {
				...remote, canRemove: connected, connectionStatus: connected ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected,
			} : remote), undefined);
		}
	}());
	const widget = disposableStore.add(instantiationService.createInstance(RemotesWidget, content, model, operatingSystem));
	widget.setVisible(true);
	await waitForFixtureCondition(() => content.querySelector('.remotes-message')?.textContent === '', 'Remotes refresh should finish before capture');
	widget.layout();
}

export default defineThemedFixtureGroup({ path: 'sessions/remotes/' }, {
	Table: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1000) }),
	Wide: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 1400) }),
	Windows: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OperatingSystem.Windows) }),
	Narrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360) }),
	Empty: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, true) }),
	EmptyWindows: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OperatingSystem.Windows, true) }),
	EmptyNarrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360, OperatingSystem.Windows, true) }),
	RefreshWarnings: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, false, ['ssh', 'tunnel']) }),
	EmptyRefreshWarnings: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, true, ['tunnel']) }),
});
