/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObjectTreeElement } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { NotebookVariableAccessibilityProvider, NotebookVariableRenderer, INotebookVariableElement, NotebookVariablesDelegate } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariablesTree';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService, VariablesResult } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class NotebookVariablesView extends ViewPane {

	static readonly ID = 'notebookVariablesView';
	static readonly TITLE: ILocalizedString = nls.localize2('notebook.notebookVariables', "Notebook Variables");

	private tree: WorkbenchObjectTree<INotebookVariableElement> | undefined;
	private activeNotebook: NotebookTextModel | undefined;

	constructor(
		options: IViewPaneOptions,
		@IEditorService private readonly editorService: IEditorService,
		@INotebookKernelService private readonly notebookKernelService: INotebookKernelService,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IOpenerService openerService: IOpenerService,
		@IQuickInputService protected quickInputService: IQuickInputService,
		@ICommandService protected commandService: ICommandService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		this._register(this.editorService.onDidActiveEditorChange(this.handleActiveEditorChange.bind(this)));
		this._register(this.notebookExecutionStateService.onDidChangeExecution(this.handleExecutionStateChange.bind(this)));
		this._register(this.notebookKernelService.onDidNotebookVariablesUpdate(this.handleVariablesChanged.bind(this)));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.tree = <WorkbenchObjectTree<INotebookVariableElement>>this.instantiationService.createInstance(
			WorkbenchObjectTree,
			'notebookVariablesTree',
			container,
			new NotebookVariablesDelegate(),
			[new NotebookVariableRenderer()],
			{
				identityProvider: { getId: (e: INotebookVariableElement) => e.id },
				horizontalScrolling: false,
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: new NotebookVariableAccessibilityProvider(),
				setRowLineHeight: false,
			});

		this.tree.layout();
		this.tree?.setChildren(null, []);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree?.layout(height, width);
	}

	private handleActiveEditorChange() {
		const activeEditorPane = this.editorService.activeEditorPane;
		if (activeEditorPane && activeEditorPane.getId() === 'workbench.editor.notebook') {
			const notebookDocument = getNotebookEditorFromEditorPane(activeEditorPane)?.getViewModel()?.notebookDocument;
			if (notebookDocument && notebookDocument !== this.activeNotebook) {
				this.activeNotebook = notebookDocument;
				this.updateVariables(this.activeNotebook);
			}
		}
	}

	private handleExecutionStateChange(event: ICellExecutionStateChangedEvent | IExecutionStateChangedEvent) {
		if (this.activeNotebook) {
			// changed === undefined -> excecution ended
			if (event.changed === undefined && event.affectsNotebook(this.activeNotebook?.uri)) {
				this.updateVariables(this.activeNotebook);
			}
		}
	}

	private handleVariablesChanged(notebookUri: URI) {
		if (this.activeNotebook && notebookUri.toString() === this.activeNotebook.uri.toString()) {
			this.updateVariables(this.activeNotebook);
		}
	}

	private async updateVariables(notebook: NotebookTextModel) {
		const selectedKernel = this.notebookKernelService.getMatchingKernel(notebook).selected;
		if (selectedKernel && selectedKernel.hasVariableProvider) {

			const variables = selectedKernel.provideVariables(notebook.uri, undefined, 'named', 0, CancellationToken.None);
			const treeData = await variables
				.map(variable => { return this.createTreeItem(variable); })
				.toPromise();

			this.tree?.setChildren(null, treeData);
		}
	}

	private index = 0;

	private createTreeItem(variable: VariablesResult): IObjectTreeElement<INotebookVariableElement> {
		let collapsed: boolean | undefined = undefined;
		let children: IObjectTreeElement<INotebookVariableElement>[] | undefined = undefined;
		if (variable.namedChildrenCount > 0 || variable.indexedChildrenCount > 0) {
			collapsed = true;
			children = [
				{
					element: {
						id: `${this.index + 1}-placeholder`,
						label: ' ',
						value: 'loading...',
					}
				}
			];
		}

		const element = {
			element: {
				id: `${this.index++}`,
				label: variable.variable.name,
				value: variable.variable.value,
			},
			children,
			collapsed
		};



		return element;
	}
}
