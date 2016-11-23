/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!../media/treeExplorer.contribution';

import { localize } from 'vs/nls';
import { join } from 'vs/base/common/paths';
import { createCSSRule } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/platform';
import { ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ICustomTreeExplorerService } from 'vs/workbench/parts/explorers/common/customTreeExplorerService';
import { CustomTreeExplorerService } from 'vs/workbench/parts/explorers/browser/customTreeExplorerService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { ITreeExplorer } from 'vs/platform/extensionManagement/common/extensionManagement';
import { toCustomExplorerViewletId, toCustomExplorerViewletCSSClass, isValidViewletId } from 'vs/workbench/parts/explorers/common/treeExplorer';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IMessageService, Severity } from 'vs/platform/message/common/message';

registerSingleton(ICustomTreeExplorerService, CustomTreeExplorerService);

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

export class ExplorerContribtion implements IWorkbenchContribution {

	constructor(
		@IMessageService private messageService: IMessageService
	) {
		this.init();
	}

	public getId(): string {
		return 'vs.explorer';
	}

	private init() {
		ExtensionsRegistry.registerExtensionPoint<ITreeExplorer>('explorer', [], explorerSchema).setHandler(extensions => {
			for (let extension of extensions) {
				const { treeExplorerNodeProviderId, treeLabel, icon } = extension.value;

				if (!isValidViewletId(treeExplorerNodeProviderId)) {
					return this.messageService.show(Severity.Error, localize('treeExplorer.invalidId', 'Tree Explorer extension {0} has invalid id and failed to activate.', treeLabel));
				}

				const getIconRule = (iconPath) => { return `background-image: url('${iconPath}')`; };
				if (icon) {
					const iconClass = `.monaco-workbench > .activitybar .monaco-action-bar .action-label.${toCustomExplorerViewletCSSClass(treeExplorerNodeProviderId)}`;
					const iconPath = join(extension.description.extensionFolderPath, icon);
					createCSSRule(iconClass, getIconRule(iconPath));
				}

				Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
					'vs/workbench/parts/explorers/browser/treeExplorerViewlet',
					'TreeExplorerViewlet',
					toCustomExplorerViewletId(treeExplorerNodeProviderId),
					treeLabel,
					toCustomExplorerViewletCSSClass(treeExplorerNodeProviderId),
					-1, // External viewlets are ordered by enabling sequence, so order here doesn't matter.
					true
				));
			}
		});
	}
}

(<IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(ExplorerContribtion);