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
import { BrowserEditorInput, BrowserEditorSerializer } from './browserEditorInput.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Schemas } from '../../../../base/common/network.js';
import { IBrowserViewWorkbenchService } from '../common/browserView.js';
import { BrowserViewWorkbenchService } from './browserViewWorkbenchService.js';
import { BrowserViewStorageScope } from '../../../../platform/browserView/common/browserView.js';
import { IOpenerService, IOpener, OpenInternalOptions, OpenExternalOptions } from '../../../../platform/opener/common/opener.js';
import { isLocalhostAuthority } from '../../../../platform/url/common/trustedDomains.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logBrowserOpen } from './browserViewTelemetry.js';

// Register actions
import './browserViewActions.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		BrowserEditor,
		BrowserEditor.ID,
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
						id: parsed.id,
						url: parsed.url
					});

					// Start resolving the input right away. This will create the browser view.
					// This allows browser views to be loaded in the background.
					void browserInput.resolve();

					return {
						editor: browserInput,
						options: {
							...options,
							pinned: !!parsed.url // pin if navigated
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
class LocalhostLinkOpenerContribution extends Disposable implements IWorkbenchContribution, IOpener {
	static readonly ID = 'workbench.contrib.localhostLinkOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();

		this._register(openerService.registerOpener(this));
	}

	async open(resource: URI | string, _options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
		if (!this.configurationService.getValue<boolean>('workbench.browser.openLocalhostLinks')) {
			return false;
		}

		const url = typeof resource === 'string' ? resource : resource.toString(true);
		try {
			const parsed = new URL(url);
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

		const browserUri = BrowserViewUri.forUrl(url);
		await this.editorService.openEditor({ resource: browserUri, options: { pinned: true } });
		return true;
	}
}

registerWorkbenchContribution2(LocalhostLinkOpenerContribution.ID, LocalhostLinkOpenerContribution, WorkbenchPhase.BlockStartup);

registerSingleton(IBrowserViewWorkbenchService, BrowserViewWorkbenchService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.browser.openLocalhostLinks': {
			type: 'boolean',
			default: false,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.openLocalhostLinks' },
				'When enabled, localhost links from the terminal, chat, and other sources will open in the Integrated Browser instead of the system browser.'
			)
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
