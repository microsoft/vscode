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
import { ITreeExplorerViewletService, TreeExplorerViewletService } from 'vs/workbench/parts/explorers/browser/treeExplorerViewletService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { ITreeExplorer } from 'vs/platform/extensionManagement/common/extensionManagement';
import { toCustomViewletId, toCustomViewletCSSClass } from 'vs/workbench/parts/explorers/common/treeExplorer';

registerSingleton(ITreeExplorerViewletService, TreeExplorerViewletService);

const explorerContribtion: IJSONSchema = {
	description: localize('vscode.extension.contributes.explorer', "Contributes custom tree explorer viewlet to the sidebar"),
	type: 'object',
	properties: {
		treeExplorerNodeProviderId: {
			description: localize('vscode.extension.contributes.explorer.treeExplorerNodeProviderId', 'Unique id used to identify provider registered through vscode.workspace.registerTreeExplorerNodeProvider'),
			type: 'string'
		},
		treeLabel: {
			description: localize('vscode.extension.contributes.explorer.treeLabel', 'Human readable string used to render the custom tree viewlet'),
			type: 'string'
		},
		icon: {
			description: localize('vscode.extension.contributes.explorer.icon', 'Path to the viewlet icon on the activity bar'),
			type: 'string'
		}
	}
};

ExtensionsRegistry.registerExtensionPoint<ITreeExplorer>('explorer', [], explorerContribtion).setHandler(extensions => {
	for (let extension of extensions) {
		const { treeExplorerNodeProviderId, treeLabel, icon } = extension.value;

		const getIconRule = (iconPath) => { return `background-image: url('${iconPath}')`; };
		if (icon) {
			const iconClass = `.monaco-workbench > .activitybar .monaco-action-bar .action-label.${toCustomViewletCSSClass(treeExplorerNodeProviderId)}`;
			const iconPath = join(extension.description.extensionFolderPath, icon);
			createCSSRule(iconClass, getIconRule(iconPath));
		}

		Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
			'vs/workbench/parts/explorers/browser/treeExplorerViewlet',
			'TreeExplorerViewlet',
			toCustomViewletId(treeExplorerNodeProviderId),
			treeLabel,
			toCustomViewletCSSClass(treeExplorerNodeProviderId),
			-1, // Extension viewlets are ordered by enabling sequence, so order here doesn't matter.
			true
		));
	}
});