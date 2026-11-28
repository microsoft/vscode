/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { extUri } from '../../../../../base/common/resources.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAgentHostFilterService } from '../../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../../workbench/contrib/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsProvider } from '../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { IRecentSessionWorkspace, ISessionWorkspacesService } from '../../../../../workbench/contrib/sessions/common/sessionWorkspaces.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { SESSIONS_WORKSPACES_ENABLED_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { WorkspacePicker } from '../../../../../workbench/contrib/sessions/browser/chat/sessionWorkspacePicker.js';
import { ISessionWorkspace, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../../../workbench/services/sessions/common/session.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import '../../../../../workbench/contrib/sessions/browser/chat/media/chatWidget.css';
import '../../../../../workbench/contrib/sessions/browser/chat/media/chatInput.css';
import '../../../../browser/media/style.css';

const VSCODE = URI.file('/Users/me/code/vscode');
const DOCS = URI.file('/Users/me/code/vscode-docs');
const COPILOT = URI.file('/Users/me/code/copilot');
const WEBSITE = URI.file('/Users/me/code/website');

const SESSION_WORKSPACES: readonly IRecentSessionWorkspace[] = [
	{ uri: URI.file('/Users/me/workspaces/product.code-workspace'), name: 'Product', folders: [VSCODE, DOCS, COPILOT], owned: true, icon: 'rocket' },
	{ uri: URI.file('/Users/me/workspaces/archive.code-workspace'), name: 'Archive', folders: [WEBSITE], owned: true, missing: true },
];

/** A workspace on a remote, which an editor window on this computer can't open. */
const REMOTE_WORKSPACE: IRecentSessionWorkspace = {
	uri: URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+devbox', path: '/home/me/workspaces/server.code-workspace' }),
	name: 'Server',
	folders: [URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+devbox', path: '/home/me/code/server' })],
	owned: false,
};

class FixtureWorkspacePicker extends WorkspacePicker {
	pickSessionWorkspace(): Promise<boolean> {
		const item = this._buildItems().find(candidate => candidate.item?.sessionWorkspaceUri)?.item;
		return item ? this._dispatchPickerItem(item) : Promise.resolve(false);
	}
}

function createFolderWorkspace(folder: URI): ISessionWorkspace {
	const name = folder.path.substring(folder.path.lastIndexOf('/') + 1);
	return {
		uri: folder,
		label: name,
		icon: Codicon.folder,
		group: SESSION_WORKSPACE_GROUP_LOCAL,
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
		folders: [{ root: folder, workingDirectory: folder, name, description: undefined, gitRepository: undefined }],
	};
}

async function renderPicker(context: ComponentFixtureContext, pick: boolean, open: boolean, focus?: 'workspaceRow' | 'missingRow' | 'missingRowAction', workspaces: readonly IRecentSessionWorkspace[] = SESSION_WORKSPACES): Promise<void> {
	const { container, disposableStore, theme } = context;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	container.style.position = 'relative';
	container.style.width = '480px';
	container.style.height = '320px';
	container.style.padding = 'var(--vscode-spacing-size80)';
	container.style.backgroundColor = 'var(--vscode-editor-background)';

	const provider = new class extends mock<ISessionsProvider>() {
		override readonly id = 'local-agent-host';
		override readonly label = 'Local';
		override readonly sessionTypes = [];
		override readonly onDidChangeSessionTypes = Event.None;
		override readonly browseActions = [];
		override readonly supportsLocalWorkspaces = true;
		override resolveWorkspace(folder: URI) { return createFolderWorkspace(folder); }
	}();
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme, additionalServices: registerWorkbenchServices });
	instantiationService.set(IConfigurationService, new TestConfigurationService({ [SESSIONS_WORKSPACES_ENABLED_SETTING]: true }));
	// Workspaces are Insiders only
	instantiationService.set(IProductService, new class extends mock<IProductService>() { override readonly quality = 'insider'; }());
	instantiationService.set(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProviders() { return [provider]; }
		override getProvider<T extends ISessionsProvider>(id: string): T | undefined { return (id === provider.id ? provider : undefined) as T | undefined; }
	}());
	instantiationService.set(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() {
		override readonly onDidChangeRecentWorkspaces = Event.None;
		override readonly historyLoadState = constObservable('loaded' as const);
		override getRecentWorkspaces(): IRecentWorkspace[] { return [WEBSITE, DOCS].map(folder => ({ workspace: createFolderWorkspace(folder), providerId: provider.id, checked: false, source: 'agents' as const })); }
		override getWorkspaceCatalog(): IRecentWorkspace[] { return this.getRecentWorkspaces(); }
		override addRecentWorkspace(): void { }
		override removeRecentWorkspace(): void { }
		override clearCheckedWorkspace(): void { }
		override isNoWorkspaceChecked(): boolean { return false; }
		override checkNoWorkspace(): void { }
	}());
	instantiationService.set(ISessionWorkspacesService, new class extends mock<ISessionWorkspacesService>() {
		override readonly workspaces = constObservable(workspaces);
		override getWorkspace(uri: URI) { return workspaces.find(candidate => candidate.uri.toString() === uri.toString()); }
		override touchWorkspace(): void { }
	}());
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IFileService, { onDidFilesChange: Event.None, onDidChangeFileSystemProviderRegistrations: Event.None, hasProvider: () => true, exists: async () => true });
	instantiationService.stub(IDialogService, {});
	instantiationService.stub(IProgressService, {});
	instantiationService.stub(IWorkspacesService, { getRecentlyOpened: async () => ({ workspaces: [], files: [] }), onDidChangeRecentlyOpened: Event.None });
	instantiationService.stub(IRemoteAgentHostService, { connections: [] });
	instantiationService.stub(IAgentHostFilterService, { isDiscovering: false, rediscover: async () => true });
	instantiationService.set(ILayoutService, new class extends mock<ILayoutService>() {
		override readonly mainContainer = container;
		override readonly activeContainer = container;
		override readonly onDidLayoutContainer = Event.None;
		override getContainer() { return container; }
	}());
	instantiationService.set(IContextViewService, disposableStore.add(instantiationService.createInstance(ContextViewService)));
	const actionWidgetService = disposableStore.add(instantiationService.createInstance(ActionWidgetService));
	instantiationService.set(IActionWidgetService, actionWidgetService);

	const picker = disposableStore.add(instantiationService.createInstance(FixtureWorkspacePicker, { restoreFromSessions: false }));
	const host = dom.append(container, dom.$('.new-chat-widget-container.default-new-session.revealed'));
	host.style.width = 'max-content';
	host.style.height = 'auto';
	picker.renderCategoryTriggers(dom.append(host, dom.$('.sessions-chat-toolbar')), [{
		label: 'Workspace',
		ariaLabel: 'Choose a workspace for the new session',
		icon: Codicon.project,
		reflectsWorkspace: true,
		attachesContext: false,
	}]);
	if (pick) {
		await picker.pickSessionWorkspace();
	}
	if (open) {
		picker.showPicker();
	}
	if (focus) {
		const targetWindow = dom.getWindow(container);
		// As a user who reads the opened picker first: after its rows settle, which refreshes them
		await new Promise<void>(resolve => setTimeout(resolve, 300));
		// As Up Arrow moves from the selected recent folder to the last workspace above it, the missing one
		actionWidgetService.focusPrevious();
		if (focus === 'workspaceRow') {
			// And once more to the Product workspace above it
			actionWidgetService.focusPrevious();
		}
		if (focus === 'missingRowAction') {
			await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
			const list = targetWindow.document.querySelector<HTMLElement>('.action-widget .monaco-list');
			list?.focus();
			list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
			// Synthetic focus draws no focus ring, so make sure Tab reached the action
			if (targetWindow.document.activeElement?.getAttribute('aria-label') !== 'Edit Workspace') {
				throw new Error('Tab from the missing workspace row did not focus its Edit Workspace action');
			}
		}
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/chat/' }, {
	WorkspacesGroup: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The open workspace picker starts with a Workspaces header. The Product workspace shows a rocket icon with its folder names vscode, vscode-docs and copilot, and the Archive workspace shows a warning icon with Workspace file missing. A separator follows, then the recent folders website and vscode-docs.'],
		render: context => renderPicker(context, false, true),
	}),
	WorkspaceChip: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['After picking the Product workspace, the workspace pill shows a rocket icon and the name Product.'],
		render: context => renderPicker(context, true, false),
	}),
	WorkspaceFocused: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['With the keyboard, the Product workspace row is focused, showing its Open in Editor Window (window icon), Edit Workspace (gear) and Remove Workspace buttons.'],
		virtualTime: { enabled: false },
		render: context => renderPicker(context, false, true, 'workspaceRow'),
	}),
	MissingWorkspaceFocused: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['With the keyboard, the Archive workspace row with a warning icon and Workspace file missing is focused, showing its edit and remove buttons.'],
		virtualTime: { enabled: false },
		render: context => renderPicker(context, false, true, 'missingRow'),
	}),
	MissingWorkspaceActionFocused: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['After Tab from the focused Archive row, its Edit Workspace button has keyboard focus (the fixture fails otherwise); the gear and remove buttons stay shown.'],
		virtualTime: { enabled: false },
		render: context => renderPicker(context, false, true, 'missingRowAction'),
	}),
	RemoteWorkspaceFocused: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['With the keyboard, the Server workspace row, a workspace on a remote, is focused, showing only its Edit Workspace (gear) and Remove Workspace buttons, without Open in Editor Window.'],
		virtualTime: { enabled: false },
		// The last workspace row is the remote one
		render: context => renderPicker(context, false, true, 'missingRow', [SESSION_WORKSPACES[0], REMOTE_WORKSPACE]),
	}),
	WorkspacePicked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The picker reopened after picking the Product workspace shows the Product row checked and the pill showing Product.'],
		render: context => renderPicker(context, true, true),
	}),
});
