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
import { BrowserEditorInput, BrowserEditorSerializer } from '../common/browserEditorInput.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Schemas } from '../../../../base/common/network.js';
import { IBrowserViewWorkbenchService, IBrowserViewCDPService } from '../common/browserView.js';
import { BrowserViewWorkbenchService } from './browserViewWorkbenchService.js';
import { BrowserViewCDPService } from './browserViewCDPService.js';
import { BrowserZoomService, IBrowserZoomService, MATCH_WINDOW_ZOOM_LABEL } from '../common/browserZoomService.js';
import { browserZoomFactors, BrowserViewStorageScope } from '../../../../platform/browserView/common/browserView.js';
import { IExternalOpener, IOpenerService } from '../../../../platform/opener/common/opener.js';
import { isLocalhostAuthority } from '../../../../platform/url/common/trustedDomains.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { PolicyCategory } from '../../../../base/common/policy.js';
import { getZoomLevel, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { zoomLevelToZoomFactor } from '../../../../platform/window/common/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logBrowserOpen } from '../../../../platform/browserView/common/browserViewTelemetry.js';

// Register actions and browser tools
import './browserViewActions.js';
import './tools/browserTools.contribution.js';

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
		@IInstantiationService instantiationService: IInstantiationService
	) {
		editorResolverService.registerEditor(
			`${Schemas.vscodeBrowser}:/**`,
			{
				id: BrowserEditorInput.ID,
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

					const browserInput = instantiationService.createInstance(BrowserEditorInput, {
						...options?.viewState,
						id: parsed.id
					});

					// Start resolving the input right away. This will create the browser view.
					// This allows browser views to be loaded in the background.
					void browserInput.resolve();

					return {
						editor: browserInput,
						options: {
							...options,
							pinned: !!browserInput.url // pin if navigated
						}
					};
				}
			}
		);
	}
}

registerWorkbenchContribution2(BrowserEditorResolverContribution.ID, BrowserEditorResolverContribution, WorkbenchPhase.BlockStartup);

/**
 * Opens localhost URLs in the Integrated Browser when the setting is enabled.
 */
class LocalhostLinkOpenerContribution extends Disposable implements IWorkbenchContribution, IExternalOpener {
	static readonly ID = 'workbench.contrib.localhostLinkOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();

		this._register(openerService.registerExternalOpener(this));
	}

	async openExternal(href: string, _ctx: { sourceUri: URI; preferredOpenerId?: string }, _token: CancellationToken): Promise<boolean> {
		if (!this.configurationService.getValue<boolean>('workbench.browser.openLocalhostLinks')) {
			return false;
		}

		try {
			const parsed = new URL(href);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				return false;
			}
			if (!isLocalhostAuthority(parsed.host)) {
				return false;
			}
		} catch {
			return false;
		}

		logBrowserOpen(this.telemetryService, 'localhostLinkOpener');

		const browserUri = BrowserViewUri.forId(generateUuid());
		await this.editorService.openEditor({ resource: browserUri, options: { pinned: true, viewState: { url: href } } });
		return true;
	}
}

registerWorkbenchContribution2(LocalhostLinkOpenerContribution.ID, LocalhostLinkOpenerContribution, WorkbenchPhase.BlockStartup);

/**
 * Bridges the application's UI zoom level changes into IBrowserZoomService so that
 * views using the 'Match Window' default zoom level stay in sync.
 */
class WindowZoomSynchronizer extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.browserView.windowZoomSynchronizer';

	constructor(@IBrowserZoomService browserZoomService: IBrowserZoomService) {
		super();
		browserZoomService.notifyWindowZoomChanged(zoomLevelToZoomFactor(getZoomLevel(mainWindow)));
		this._register(onDidChangeZoomLevel(() => {
			browserZoomService.notifyWindowZoomChanged(zoomLevelToZoomFactor(getZoomLevel(mainWindow)));
		}));
	}
}

registerWorkbenchContribution2(WindowZoomSynchronizer.ID, WindowZoomSynchronizer, WorkbenchPhase.BlockRestore);

registerSingleton(IBrowserViewWorkbenchService, BrowserViewWorkbenchService, InstantiationType.Delayed);
registerSingleton(IBrowserViewCDPService, BrowserViewCDPService, InstantiationType.Delayed);
registerSingleton(IBrowserZoomService, BrowserZoomService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.browser.showInTitleBar': {
			type: 'boolean',
			default: false,
			experiment: { mode: 'startup' },
			description: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.showInTitleBar' },
				'Controls whether the Integrated Browser button is shown in the title bar.'
			)
		},
		'workbench.browser.openLocalhostLinks': {
			type: 'boolean',
			default: false,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.openLocalhostLinks' },
				'When enabled, localhost links from the terminal, chat, and other sources will open in the Integrated Browser instead of the system browser.'
			)
		},
		'workbench.browser.enableChatTools': {
			type: 'boolean',
			default: false,
			experiment: { mode: 'startup' },
			tags: ['experimental'],
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.enableChatTools' },
				'When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser.'
			),
			policy: {
				name: 'BrowserChatTools',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.110',
				value: (policyData) => policyData.chat_preview_features_enabled === false ? false : undefined,
				localization: {
					description: {
						key: 'browser.enableChatTools',
						value: localize('browser.enableChatTools', 'When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser.')
					}
				},
			}
		},
		'workbench.browser.pageZoom': {
			type: 'string',
			enum: [MATCH_WINDOW_ZOOM_LABEL, ...browserZoomFactors.map(f => `${Math.round(f * 100)}%`)],
			markdownEnumDescriptions: [
				localize(
					{ comment: ['This is the description for a setting enum value.'], key: 'browser.defaultZoomLevel.matchWindow' },
					'Matches the application\'s current UI zoom level.'
				),
				...browserZoomFactors.map(() => ''),
			],
			default: MATCH_WINDOW_ZOOM_LABEL,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.pageZoom' },
				'Default zoom level for all sites in the Integrated Browser.'
			),
			// Zoom can change from machine to machine, so we don't need the workspace-level nor syncing that WINDOW has.
			scope: ConfigurationScope.MACHINE
		},
		'workbench.browser.dataStorage': {
			type: 'string',
			enum: [
				BrowserViewStorageScope.Global,
				BrowserViewStorageScope.Workspace,
				BrowserViewStorageScope.Ephemeral
			],
			markdownEnumDescriptions: [
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage.global' }, 'All browser views share a single persistent session across all workspaces.'),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage.workspace' }, 'Browser views within the same workspace share a persistent session. If no workspace is opened, `ephemeral` storage is used.'),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage.ephemeral' }, 'Each browser view has its own session that is cleaned up when closed.')
			],
			restricted: true,
			default: BrowserViewStorageScope.Global,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage' },
				'Controls how browser data (cookies, cache, storage) is shared between browser views.\n\n**Note**: In untrusted workspaces, this setting is ignored and `ephemeral` storage is always used.'
			),
			scope: ConfigurationScope.WINDOW,
			order: 100
		}
	}
});
