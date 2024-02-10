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
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { NotebookVariablesView } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariablesView';
import { variablesViewIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { NOTEBOOK_VARIABLE_VIEW_ENABLED } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariableContextKeys';


export class NotebookVariables extends Disposable implements IWorkbenchContribution {
	private listeners: IDisposable[] = [];
	private configListener: IDisposable;
	private initialized = false;

	private viewEnabled: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService,
		@INotebookKernelService private readonly notebookKernelService: INotebookKernelService
	) {
		super();

		this.viewEnabled = NOTEBOOK_VARIABLE_VIEW_ENABLED.bindTo(contextKeyService);

		this.listeners.push(this.editorService.onDidEditorsChange(() => this.handleInitEvent()));
		this.listeners.push(this.notebookExecutionStateService.onDidChangeExecution(() => this.handleInitEvent()));

		this.configListener = configurationService.onDidChangeConfiguration((e) => this.handleConfigChange(e));
	}

	private handleConfigChange(e: IConfigurationChangeEvent) {
		if (e.affectsConfiguration(NotebookSetting.notebookVariablesView)) {
			if (!this.configurationService.getValue(NotebookSetting.notebookVariablesView)) {
				this.viewEnabled.set(false);
			} else if (this.initialized) {
				this.viewEnabled.set(true);
			} else {
				this.handleInitEvent();
			}
		}
	}

	private handleInitEvent() {
		if (this.configurationService.getValue(NotebookSetting.notebookVariablesView)
			&& this.editorService.activeEditorPane?.getId() === 'workbench.editor.notebook') {

			if (this.hasVariableProvider()) {
				this.viewEnabled.set(true);
			}

			if (!this.initialized && this.initializeView()) {
				this.initialized = true;
				this.listeners.forEach(listener => listener.dispose());
			}
		}
	}

	private hasVariableProvider() {
		const notebookDocument = getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument;
		return notebookDocument && this.notebookKernelService.getMatchingKernel(notebookDocument).selected?.hasVariableProvider;
	}

	private initializeView() {
		const debugViewContainer = Registry.as<IViewContainersRegistry>('workbench.registry.view.containers').get(debugContainerId);

		if (debugViewContainer) {
			const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
			const viewDescriptor = {
				id: 'NOTEBOOK_VARIABLES', name: nls.localize2('notebookVariables', "Notebook Variables"),
				containerIcon: variablesViewIcon, ctorDescriptor: new SyncDescriptor(NotebookVariablesView),
				order: 50, weight: 5, canToggleVisibility: true, canMoveView: true, collapsed: true, when: NOTEBOOK_VARIABLE_VIEW_ENABLED,
			};

			viewsRegistry.registerViews([viewDescriptor], debugViewContainer);
			return true;
		}

		return false;
	}

	override dispose(): void {
		super.dispose();
		this.listeners.forEach(listener => listener.dispose());
		this.configListener.dispose();
	}

}
