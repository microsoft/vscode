/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { join } from 'vs/base/common/paths';
import { createCSSRule } from 'vs/base/browser/dom';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { Registry } from 'vs/platform/platform';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';

namespace schema {

	export type IUserFriendlyIcon = string | { light: string; dark: string; };

	export interface IExplorer {
		treeExplorerNodeProviderId: string;
		treeLabel: string;
		icon: IUserFriendlyIcon;
	}

	export const explorerContribtion: IJSONSchema = {
		description: localize('vscode.extension.contributes.explorer', "Contributes explorer viewlet to the sidebar"),
		type: 'object',
		properties: {
			treeContentProviderId: {
				description: localize('vscode.extension.contributes.explorer.treeExplorerNodeProviderId', 'Unique id used to identify provider registered through vscode.workspace.registerTreeExplorerNodeProvider'),
				type: 'string'
			},
			treeLabel: {
				description: localize('vscode.extension.contributes.explorer.treeLabel', 'Human readable string used to render the custom tree Viewlet'),
				type: 'string'
			},
			icon: {
				description: localize('vscode.extension.contributes.explorer.icon', 'Icon to put on activity bar'),
				type: 'string'
			}
		}
	};
}

ExtensionsRegistry.registerExtensionPoint<schema.IExplorer>('explorer', schema.explorerContribtion).setHandler(extensions => {
	let baseOrder = 200; // Stock viewlet order goes up to 100
	let descriptors = [];

	for (let extension of extensions) {
		const { treeExplorerNodeProviderId, treeLabel, icon } = extension.value;

		const getIconRule = (iconPath) => { return `background-image: url('${iconPath}')`; };
		if (icon) {
			if (typeof icon === 'string') {
				const iconClass = `.monaco-workbench > .activitybar .monaco-action-bar .action-label.${treeExplorerNodeProviderId}`;
				const iconPath = join(extension.description.extensionFolderPath, icon);
				createCSSRule(iconClass, getIconRule(iconPath));
			} else {
				const lightIconClass = `.monaco-workbench > .activitybar .monaco-action-bar .action-label.${treeExplorerNodeProviderId}`;
				const darkIconClass = `.vs-dark .monaco-workbench > .activitybar .monaco-action-bar .action-label.${treeExplorerNodeProviderId}`;
				createCSSRule(lightIconClass, getIconRule(icon.light));
				createCSSRule(darkIconClass, getIconRule(icon.dark));
			}
		}

		descriptors.push(new ViewletDescriptor(
			'vs/workbench/parts/explorers/browser/treeExplorerViewlet',
			'TreeExplorerViewlet',
			'workbench.view.customTreeExplorerViewlet.' + treeExplorerNodeProviderId,
			treeLabel,
			treeExplorerNodeProviderId,
			baseOrder++,
			true
		));
	}
	Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerExternalViewlets(descriptors);
});