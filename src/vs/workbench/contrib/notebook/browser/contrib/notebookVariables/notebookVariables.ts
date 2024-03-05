/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Extensions, IViewContainersRegistry, IViewsRegistry } from 'vs/workbench/common/views';
import { VIEWLET_ID as debugContainerId } from 'vs/workbench/contrib/debug/common/debug';
import { NOTEBOOK_VARIABLE_VIEW_ENABLED } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariableContextKeys';
import { NotebookVariablesView } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariablesView';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { variablesViewIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

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
		@INotebookKernelService private readonly notebookKernelService: INotebookKernelService,
		@INotebookService private readonly notebookDocumentService: INotebookService
	) {
		super();

		this.viewEnabled = NOTEBOOK_VARIABLE_VIEW_ENABLED.bindTo(contextKeyService);

		this.listeners.push(this.editorService.onDidActiveEditorChange(() => this.handleInitEvent()));
		this.listeners.push(this.notebookExecutionStateService.onDidChangeExecution((e) => this.handleInitEvent(e.notebook)));

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

	private handleInitEvent(notebook?: URI) {
		if (this.configurationService.getValue(NotebookSetting.notebookVariablesView)
			&& (!!notebook || this.editorService.activeEditorPane?.getId() === 'workbench.editor.notebook')) {

			if (this.hasVariableProvider(notebook) && !this.initialized && this.initializeView()) {
				this.viewEnabled.set(true);
				this.initialized = true;
				this.listeners.forEach(listener => listener.dispose());
			}
		}
	}

	private hasVariableProvider(notebookUri?: URI) {
		const notebook = notebookUri ?
			this.notebookDocumentService.getNotebookTextModel(notebookUri) :
			getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument;
		return notebook && this.notebookKernelService.getMatchingKernel(notebook).selected?.hasVariableProvider;
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
