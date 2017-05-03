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

const viewSchema: IJSONSchema = {
	description: localize('vscode.extension.contributes.view', 'Contributes custom view'),
	type: 'object',
	properties: {
		id: {
			description: localize('vscode.extension.contributes.view.id', 'Unique id used to identify view created through vscode.workspace.createTreeView'),
			type: 'string'
		},
		label: {
			description: localize('vscode.extension.contributes.view.label', 'Human readable string used to render the view'),
			type: 'string'
		},
		icon: {
			description: localize('vscode.extension.contributes.view.icon', 'Path to the view icon'),
			type: 'string'
		}
	}
};

const viewsSchema: IJSONSchema = {
	description: localize('vscode.extension.contributes.views', 'Contributes custom views'),
	type: 'object',
	items: viewSchema
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
		return 'vs.extension.view';
	}

	private init() {
		ExtensionsRegistry.registerExtensionPoint<ITreeExplorer[]>('views', [], viewsSchema).setHandler(extensions => {
			for (let extension of extensions) {
				for (const { id, label, icon } of extension.value) {
					if (!isValidViewletId(id)) {
						console.warn(`Tree view extension '${label}' has invalid id and failed to activate.`);
						continue;
					}

					const viewletId = toViewletId(id);
					const viewletCSSClass = toViewletCSSClass(id);

					// Generate CSS to show the icon in the activity bar
					if (icon) {
						const iconClass = `.monaco-workbench > .activitybar .monaco-action-bar .action-label.${viewletCSSClass}`;
						const iconPath = join(extension.description.extensionFolderPath, icon);

						createCSSRule(iconClass, `-webkit-mask: url('${iconPath}') no-repeat 50% 50%`);
					}

					// Register action to open the viewlet
					const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
					registry.registerWorkbenchAction(
						new SyncActionDescriptor(OpenViewletAction, viewletId, localize('showViewlet', "Show {0}", label)),
						'View: Show {0}',
						localize('view', "View")
					);

					// Register as viewlet
					Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
						'vs/workbench/parts/explorers/browser/treeExplorerViewlet',
						'TreeExplorerViewlet',
						viewletId,
						label,
						viewletCSSClass,
						-1,
						extension.description.id
					));
				}
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ExtensionExplorersContribtion);