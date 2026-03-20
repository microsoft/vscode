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
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Schemas } from '../../../../base/common/network.js';
import { IBrowserViewCDPService, IBrowserViewWorkbenchService } from '../common/browserView.js';
import { BrowserViewWorkbenchService } from './browserViewWorkbenchService.js';
import { BrowserViewCDPService } from './browserViewCDPService.js';

// Register actions and browser features
import './browserViewActions.js';
import './features/browserDataStorageFeatures.js';
import './features/browserDevToolsFeature.js';
import './features/browserEditorChatFeatures.js';
import './features/browserEditorZoomFeature.js';
import './features/browserTabManagementFeatures.js';

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

registerSingleton(IBrowserViewWorkbenchService, BrowserViewWorkbenchService, InstantiationType.Delayed);
registerSingleton(IBrowserViewCDPService, BrowserViewCDPService, InstantiationType.Delayed);
