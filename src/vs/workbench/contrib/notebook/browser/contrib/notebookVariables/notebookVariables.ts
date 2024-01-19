/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IViewContainersRegistry, IViewsRegistry } from 'vs/workbench/common/views';
import { VIEWLET_ID as debugContainerId } from 'vs/workbench/contrib/debug/common/debug';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { NotebookVariablesView } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariablesView';
import { NOTEBOOK_KERNEL } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { variablesViewIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';


export class NotebookVariables extends Disposable implements IWorkbenchContribution {
	private listeners: IDisposable[] = [];

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService
	) {
		super();

		this.listeners.push(this.editorService.onDidEditorsChange(() => this.handleInitEvent(configurationService)));
		this.listeners.push(this.notebookExecutionStateService.onDidChangeExecution(() => this.handleInitEvent(configurationService)));
	}

	private handleInitEvent(configurationService: IConfigurationService) {
		if (configurationService.getValue('notebook.experimental.notebookVariablesView')
			&& this.editorService.activeEditorPane?.getId() === 'workbench.editor.notebook') {
			if (this.initializeView()) {
				this.listeners.forEach(listener => listener.dispose());
			}
		}
	}

	private initializeView() {
		const debugViewContainer = Registry.as<IViewContainersRegistry>('workbench.registry.view.containers').get(debugContainerId);

		if (debugViewContainer) {
			const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
			const viewDescriptor = {
				id: 'NOTEBOOK_VARIABLES', name: nls.localize2('notebookVariables', "Notebook Variables"),
				containerIcon: variablesViewIcon, ctorDescriptor: new SyncDescriptor(NotebookVariablesView),
				order: 50, weight: 5, canToggleVisibility: true, canMoveView: true, collapsed: true, when: ContextKeyExpr.notEquals(NOTEBOOK_KERNEL.key, ''),
			};

			viewsRegistry.registerViews([viewDescriptor], debugViewContainer);
			return true;
		}

		return false;
	}

}
