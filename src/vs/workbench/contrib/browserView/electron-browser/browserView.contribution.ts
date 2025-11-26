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
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserOverlayManager, BrowserOverlayManager } from './overlayManager.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { MultiCommand, RedoCommand, SelectAllCommand, UndoCommand } from '../../../../editor/browser/editorExtensions.js';
import { CopyAction, CutAction, PasteAction } from '../../../../editor/contrib/clipboard/browser/clipboard.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Schemas } from '../../../../base/common/network.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		BrowserEditor,
		BrowserEditor.ID,
		localize('browserEditor', "Browser")
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
				id: BrowserEditor.ID,
				label: localize('browserEditor', "Browser"),
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

class OpenIntegratedBrowserAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openIntegratedBrowser',
			title: { value: localize('openIntegratedBrowser', "Open Integrated Browser"), original: 'Open Integrated Browser' },
			category: Categories.View,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, url?: string): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const resource = BrowserViewUri.forUrl(url);

		await editorService.openEditor({ resource });
	}
}

registerAction2(OpenIntegratedBrowserAction);

registerSingleton(IBrowserOverlayManager, BrowserOverlayManager, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.browser.dataStorage': {
			type: 'string',
			enum: ['global', 'workspace', 'ephemeral'],
			default: 'workspace',
			markdownDescription: localize(
				'browserDataStorage',
				'Controls how browser data (cookies, cache, storage) is shared between browser views.\n\n- `global`: All browser views share a single persistent session across all workspaces.\n- `workspace`: Browser views within the same workspace share a persistent session.\n- `ephemeral`: Each browser view has its own session that is cleaned up when closed.'
			),
			scope: ConfigurationScope.WINDOW,
			order: 100
		}
	}
});

const PRIORITY = 100;

function redirectCommandToBrowser(command: MultiCommand | undefined) {
	command?.addImplementation(PRIORITY, 'integratedBrowser', (accessor: ServicesAccessor) => {
		const editorService = accessor.get(IEditorService);
		const activeEditor = editorService.activeEditorPane;

		if (activeEditor instanceof BrowserEditor) {
			// This will return false if there is no event to forward
			// (i.e., the command was not triggered from the browser view)
			return activeEditor.forwardCurrentEvent();
		}

		return false;
	});
}

redirectCommandToBrowser(UndoCommand);
redirectCommandToBrowser(RedoCommand);
redirectCommandToBrowser(SelectAllCommand);
redirectCommandToBrowser(CopyAction);
redirectCommandToBrowser(PasteAction);
redirectCommandToBrowser(CutAction);
