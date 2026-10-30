/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { BrowserEditor } from './browserEditor.js';
import { BrowserEditorInput, BrowserEditorSerializer, reviveBrowserEditorViewState } from '../common/browserEditorInput.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Schemas } from '../../../../base/common/network.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { waitForState } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IBrowserViewCDPService, IBrowserViewModel, IBrowserViewWorkbenchService } from '../common/browserView.js';
import { BrowserViewWorkbenchService } from './browserViewWorkbenchService.js';
import { BrowserViewCDPService } from './browserViewCDPService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logBrowserOpen } from '../../../../platform/browserView/common/browserViewTelemetry.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';

// Register actions and browser features
import './features/webContentsViewRendererFeature.js';
import './features/browserNavigationFeatures.js';
import './features/browserWelcomeFeature.js';
import './features/browserFavoritesFeature.js';
import './features/browserHistoryFeature.js';
import './features/browserPermissionsFeature.js';
import './features/browserDataStorageFeatures.js';
import './features/browserDevToolsFeature.js';
import './features/browserEditorChatFeatures.js';
import './features/browserEditorErrorFeatures.js';
import './features/browserEditorZoomFeature.js';
import './features/browserEditorEmulationFeatures.js';
import './features/browserAutoReloadFeatures.js';
import './features/browserEditorFindFeature.js';
import './features/browserSearchFeatures.js';
import './features/browserTabManagementFeatures.js';
import './features/browserRemoteFeatures.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		BrowserEditor,
		BrowserEditorInput.EDITOR_ID,
		localize('browser.editorLabel', "Browser")
	),
	[
		new SyncDescriptor(BrowserEditorInput)
	]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	BrowserEditorInput.ID,
	BrowserEditorSerializer
);

class BrowserEditorResolverContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.browserEditorResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IBrowserViewWorkbenchService browserViewWorkbenchService: IBrowserViewWorkbenchService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		editorResolverService.registerEditor(
			`${Schemas.vscodeBrowser}:/**`,
			{
				id: BrowserEditorInput.EDITOR_ID,
				label: localize('browser.editorLabel', "Browser"),
				priority: RegisteredEditorPriority.exclusive
			},
			{
				canSupportResource: resource => resource.scheme === Schemas.vscodeBrowser,
				singlePerResource: true
			},
			{
				createEditorInput: ({ resource, options }) => {
					const parsed = BrowserViewUri.parse(resource);
					if (!parsed) {
						throw new Error(`Invalid browser view resource: ${resource.toString()}`);
					}

					const browserInput = browserViewWorkbenchService.getOrCreateLazy({
						id: parsed.id,
						...reviveBrowserEditorViewState(options?.viewState)
					});

					// Start resolving the input right away. This will create the browser view.
					// This allows browser views to be loaded in the background.
					void browserInput.resolve();

					return {
						editor: browserInput,
						options: {
							pinned: !!browserInput.url, // pin if navigated
							...options
						}
					};
				}
			}
		);

		for (const extension of ['html', 'htm', 'mhtml', 'mht']) {
			editorResolverService.registerEditor(
				`${Schemas.file}:/**/*.${extension}`,
				{
					id: BrowserEditorInput.EDITOR_ID,
					label: localize('browser.htmlEditorLabel', "Integrated Browser"),
					priority: RegisteredEditorPriority.option
				},
				{
					canSupportResource: resource => resource.scheme === Schemas.file,
					singlePerResource: true
				},
				{
					createEditorInput: ({ resource, options }) => {
						logBrowserOpen(telemetryService, 'fileResource');

						const viewState = reviveBrowserEditorViewState(options?.viewState);
						const browserInput = browserViewWorkbenchService.getOrCreateLazy({
							id: generateUuid(),
							associatedResource: resource,
							...viewState,
							url: viewState.url ?? resource.toString()
						});
						void browserInput.resolve();

						return {
							editor: browserInput,
							options: {
								pinned: true,
								...options
							}
						};
					}
				}
			);
		}
	}
}

registerWorkbenchContribution2(BrowserEditorResolverContribution.ID, BrowserEditorResolverContribution, WorkbenchPhase.BlockStartup);

registerSingleton(IBrowserViewWorkbenchService, BrowserViewWorkbenchService, InstantiationType.Delayed);
registerSingleton(IBrowserViewCDPService, BrowserViewCDPService, InstantiationType.Delayed);

const extensionTestBrowserViews = new Map<string, IBrowserViewModel>();

CommandsRegistry.registerCommand('_workbench.test.openBrowserViewViaAgentHostNetwork', async (accessor, url: string, expectedTitle?: string) => {
	const environmentService = accessor.get(IWorkbenchEnvironmentService);
	if (!environmentService.extensionTestsLocationURI) {
		throw new Error('Command is only available when running extension tests.');
	}
	const agentHostService = accessor.get(IAgentHostService);
	const browserViewService = accessor.get(IBrowserViewWorkbenchService);
	agentHostService.startAgentHost();
	const initialized = await raceTimeout(waitForState(agentHostService.initializeResult, result => result?.tcpConnections !== undefined), 30_000);
	if (!initialized) {
		throw new Error('Agent Host TCP forwarding did not become available');
	}
	const resolver = browserViewService.registerNetworkResolver({
		resolveNetwork: () => ({ authority: AMBIENT_AGENT_HOST_AUTHORITY }),
		getNetworkStatus: () => ({ label: 'Agent Host', connected: true, proxySupported: true }),
		onDidChangeNetworkStatus: Event.None,
	});
	let model: IBrowserViewModel;
	try {
		model = await browserViewService.createExternalBrowserView(url, 'canvas', { type: 'agent', sessionId: 'extension-test' }, true);
	} finally {
		resolver.dispose();
	}
	extensionTestBrowserViews.set(model.id, model);
	Event.once(model.onWillDispose)(() => extensionTestBrowserViews.delete(model.id));
	if (expectedTitle && model.title !== expectedTitle) {
		const changed = await raceTimeout(Event.toPromise(Event.filter(model.onDidChangeTitle, event => event.title === expectedTitle)), 30_000);
		if (!changed) {
			const details = `current title '${model.title}', URL '${model.url}', error '${model.error?.errorDescription ?? 'none'}'`;
			model.dispose();
			throw new Error(`Browser view did not reach expected title '${expectedTitle}': ${details}`);
		}
	}
	return { id: model.id, title: model.title, networkAuthority: model.network?.authority };
});

CommandsRegistry.registerCommand('_workbench.test.closeExternalBrowserView', (accessor, id: string) => {
	const environmentService = accessor.get(IWorkbenchEnvironmentService);
	if (!environmentService.extensionTestsLocationURI) {
		throw new Error('Command is only available when running extension tests.');
	}
	extensionTestBrowserViews.get(id)?.dispose();
});
