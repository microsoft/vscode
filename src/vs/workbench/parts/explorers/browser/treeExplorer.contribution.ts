/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/treeExplorer.contribution';

import { localize } from 'vs/nls';
import { join } from 'vs/base/common/paths';
import { createCSSRule } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/platform';
import { ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ITreeExplorerService } from 'vs/workbench/parts/explorers/common/treeExplorerService';
import { TreeExplorerService } from 'vs/workbench/parts/explorers/browser/treeExplorerService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { ITreeExplorer } from 'vs/platform/extensionManagement/common/extensionManagement';
import { toViewletId, toViewletCSSClass, isValidViewletId } from 'vs/workbench/parts/explorers/common/treeExplorer';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

registerSingleton(ITreeExplorerService, TreeExplorerService);

const explorerSchema: IJSONSchema = {
	description: localize('vscode.extension.contributes.explorer', 'Contributes custom tree explorer viewlet to the sidebar'),
	type: 'object',
	properties: {
		treeExplorerNodeProviderId: {
			description: localize('vscode.extension.contributes.explorer.treeExplorerNodeProviderId', 'Unique id used to identify provider registered through vscode.workspace.registerTreeExplorerNodeProvider'),
			type: 'string'
		},
		treeLabel: {
			description: localize('vscode.extension.contributes.explorer.treeLabel', 'Human readable string used to render the custom tree explorer'),
			type: 'string'
		},
		icon: {
			description: localize('vscode.extension.contributes.explorer.icon', 'Path to the viewlet icon on the activity bar'),
			type: 'string'
		}
	}
};

export class OpenViewletAction extends ToggleViewletAction {

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, id, viewletService, editorService);
	}
}

export class ExtensionExplorersContribtion implements IWorkbenchContribution {

	constructor() {
		this.init();
	}

	public getId(): string {
		return 'vs.explorers.extensionExplorers';
	}

	private init() {
		ExtensionsRegistry.registerExtensionPoint<ITreeExplorer>('explorer', [], explorerSchema).setHandler(extensions => {
			for (let extension of extensions) {
				const { treeExplorerNodeProviderId, treeLabel, icon } = extension.value;

				if (!isValidViewletId(treeExplorerNodeProviderId)) {
					console.warn(`Tree Explorer extension '${treeLabel}' has invalid id and failed to activate.`);
					continue;
				}

				const viewletId = toViewletId(treeExplorerNodeProviderId);
				const viewletCSSClass = toViewletCSSClass(treeExplorerNodeProviderId);

				// Generate CSS to show the icon in the activity bar
				if (icon) {
					const iconClass = `.monaco-workbench > .activitybar .monaco-action-bar .action-label.${viewletCSSClass}`;
					const iconPath = join(extension.description.extensionFolderPath, icon);

					createCSSRule(iconClass, `background-image: url('${iconPath}')`);
				}

				// Register action to open the viewlet
				const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
				registry.registerWorkbenchAction(
					new SyncActionDescriptor(OpenViewletAction, viewletId, localize('showViewlet', "Show {0}", treeLabel)),
					'View: Show {0}',
					localize('view', "View")
				);

				// Register as viewlet
				Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
					'vs/workbench/parts/explorers/browser/treeExplorerViewlet',
					'TreeExplorerViewlet',
					viewletId,
					treeLabel,
					viewletCSSClass,
					-1,
					extension.description.id
				));
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ExtensionExplorersContribtion);