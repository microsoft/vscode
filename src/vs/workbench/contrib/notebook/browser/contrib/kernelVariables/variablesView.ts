/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from 'vs/workbench/common/views';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { VariablesPanelDescriptor } from 'vs/workbench/contrib/notebook/browser/contrib/kernelVariables/variablesPanel';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';

const VARIABLES_VIEW_CONTAINER_ID = 'variablesViewContainer';

export class VariablesView extends Disposable implements IWorkbenchContribution {

	constructor() {
		super();
		this.enableVariablesView();
	}

	private async enableVariablesView() {
		const viewEnabled = true;

		if (viewEnabled) {
			const viewContainer = await this.getViewContainer();
			const variablesPanelDescriptor = new VariablesPanelDescriptor();
			const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
			if (viewContainer) {
				viewsRegistry.registerViews([variablesPanelDescriptor!], viewContainer);
			}
		} else {
			// this.contextKeyListener = this.contextKeyService.onDidChangeContext(e => {
			// 	if (e.affectsSome()) {
			// 		this.enableVariablesView();
			// 	}
			// });
		}
	}

	getViewContainer() {
		return Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer({
			id: VARIABLES_VIEW_CONTAINER_ID,
			title: { value: nls.localize('variables', "Kernel Variables"), original: 'Kernel Variables' },
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VARIABLES_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: VARIABLES_VIEW_CONTAINER_ID,
			hideIfEmpty: true,
			order: 5
		}, ViewContainerLocation.Panel);
	}

}
