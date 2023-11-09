/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IViewContainersRegistry } from 'vs/workbench/common/views';
import { VIEWLET_ID as debugContainerId } from 'vs/workbench/contrib/debug/common/debug';


export class NotebookVariables extends Disposable implements IWorkbenchContribution {

	constructor() {
		super();
		this.enableVariablesView();
	}

	private async enableVariablesView() {
		const viewEnabled = true;

		if (viewEnabled) {
			const debugViewContainer = Registry.as<IViewContainersRegistry>('workbench.registry.view.containers').get(debugContainerId);

			if (debugViewContainer) {
				// const variablesPanelDescriptor = new VariablesPanelDescriptor();
				// const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);

				// viewsRegistry.registerViews([variablesPanelDescriptor], debugViewContainer);
			}

		} else {
			// this.contextKeyListener = this.contextKeyService.onDidChangeContext(e => {
			// 	if (e.affectsSome()) {
			// 		this.enableVariablesView();
			// 	}
			// });
		}
	}

}
