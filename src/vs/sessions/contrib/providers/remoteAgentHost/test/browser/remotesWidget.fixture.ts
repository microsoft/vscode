/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { OperatingSystem, OS } from '../../../../../../base/common/platform.js';
import { IListService, ListService } from '../../../../../../platform/list/browser/listService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ICustomizationRemote, IRemotesModel, RemoteKind } from '../../browser/remotesModel.js';
import { RemotesWidget } from '../../browser/remotesWidget.js';

const remotes: ICustomizationRemote[] = [
	{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', enabled: true },
	{ id: 'ssh:staging', kind: 'ssh', name: 'Staging', detail: 'staging.example.com', enabled: false },
	{ id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu-24.04', enabled: true },
	{ id: 'wsl:Debian', kind: 'wsl', name: 'Debian', detail: 'Debian', enabled: false },
	{ id: 'tunnel:laptop', kind: 'tunnel', name: 'Work laptop', detail: 'work-laptop-europe', enabled: true },
	{ id: 'tunnel:home', kind: 'tunnel', name: 'Home workstation', detail: 'home-workstation', enabled: false },
	{ id: 'container:project', kind: 'devContainer', name: 'Project development container', detail: '/Users/developer/projects/example-project-with-a-long-source-folder-name', enabled: true },
	{ id: 'container:api', kind: 'devContainer', name: 'API service', detail: '/Users/developer/projects/api', enabled: false },
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
		},
	});
	const model = new class extends Disposable implements IRemotesModel {
		readonly remotes = observableValue<readonly ICustomizationRemote[]>(this, empty ? [] : remotes);
		async refresh() { return failedKinds; }
		async setEnabled(id: string, enabled: boolean) {
			this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, enabled } : remote), undefined);
		}
	}();
	const widget = disposableStore.add(instantiationService.createInstance(RemotesWidget, content, model, operatingSystem));
	widget.setVisible(true);
	await waitForFixtureCondition(() => content.querySelector('.remotes-message')?.textContent === '', 'Remotes refresh should finish before capture');
	widget.layout();
}

export default defineThemedFixtureGroup({ path: 'sessions/customizations/remotes/' }, {
	Tree: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700) }),
	Windows: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OperatingSystem.Windows) }),
	Narrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 360) }),
	Empty: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, true) }),
	RefreshWarnings: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, 700, OS, false, ['tunnel', 'devContainer']) }),
});
