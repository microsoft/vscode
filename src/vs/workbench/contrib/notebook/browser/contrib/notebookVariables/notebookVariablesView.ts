/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { IAction } from 'vs/base/common/actions';
import { RunOnceScheduler } from 'vs/base/common/async';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { CONTEXT_VARIABLE_EXTENSIONID, CONTEXT_VARIABLE_INTERFACES, CONTEXT_VARIABLE_LANGUAGE, CONTEXT_VARIABLE_NAME, CONTEXT_VARIABLE_TYPE, CONTEXT_VARIABLE_VALUE } from 'vs/workbench/contrib/debug/common/debug';
import { INotebookScope, INotebookVariableElement, NotebookVariableDataSource } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariablesDataSource';
import { NotebookVariableAccessibilityProvider, NotebookVariableRenderer, NotebookVariablesDelegate } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariablesTree';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export type contextMenuArg = { source: string; name: string; type?: string; value?: string; expression?: string; language?: string; extensionId?: string };

export class NotebookVariablesView extends ViewPane {

	static readonly ID = 'notebookVariablesView';
	static readonly TITLE: ILocalizedString = nls.localize2('notebook.notebookVariables', "Notebook Variables");

	private tree: WorkbenchAsyncDataTree<INotebookScope, INotebookVariableElement> | undefined;
	private activeNotebook: NotebookTextModel | undefined;
	private readonly dataSource: NotebookVariableDataSource;

	private updateScheduler: RunOnceScheduler;

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
		@IHoverService hoverService: IHoverService,
		@IMenuService private readonly menuService: IMenuService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this._register(this.editorService.onDidActiveEditorChange(this.handleActiveEditorChange.bind(this)));
		this._register(this.notebookKernelService.onDidNotebookVariablesUpdate(this.handleVariablesChanged.bind(this)));
		this._register(this.notebookExecutionStateService.onDidChangeExecution(this.handleExecutionStateChange.bind(this)));

		this.setActiveNotebook();

		this.dataSource = new NotebookVariableDataSource(this.notebookKernelService);
		this.updateScheduler = new RunOnceScheduler(() => this.tree?.updateChildren(), 100);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.element.classList.add('debug-pane');

		this.tree = <WorkbenchAsyncDataTree<INotebookScope, INotebookVariableElement>>this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'notebookVariablesTree',
			container,
			new NotebookVariablesDelegate(),
			[new NotebookVariableRenderer(this.hoverService)],
			this.dataSource,
			{
				accessibilityProvider: new NotebookVariableAccessibilityProvider(),
				identityProvider: { getId: (e: INotebookVariableElement) => e.id },
			});

		this.tree.layout();
		if (this.activeNotebook) {
			this.tree.setInput({ kind: 'root', notebook: this.activeNotebook });
		}

		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));
	}

	private onContextMenu(e: ITreeContextMenuEvent<INotebookVariableElement>): any {
		if (!e.element) {
			return;
		}
		const element = e.element;

		const arg: contextMenuArg = {
			source: element.notebook.uri.toString(),
			name: element.name,
			value: element.value,
			type: element.type,
			expression: element.expression,
			language: element.language,
			extensionId: element.extensionId
		};
		const actions: IAction[] = [];

		const overlayedContext = this.contextKeyService.createOverlay([
			[CONTEXT_VARIABLE_NAME.key, element.name],
			[CONTEXT_VARIABLE_VALUE.key, element.value],
			[CONTEXT_VARIABLE_TYPE.key, element.type],
			[CONTEXT_VARIABLE_INTERFACES.key, element.interfaces],
			[CONTEXT_VARIABLE_LANGUAGE.key, element.language],
			[CONTEXT_VARIABLE_EXTENSIONID.key, element.extensionId]
		]);
		const menu = this.menuService.getMenuActions(MenuId.NotebookVariablesContext, overlayedContext, { arg, shouldForwardArgs: true });
		createAndFillInContextMenuActions(menu, actions);
		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions
		});
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree?.layout(height, width);
	}

	private setActiveNotebook() {
		const current = this.activeNotebook;
		const activeEditorPane = this.editorService.activeEditorPane;
		if (activeEditorPane?.getId() === 'workbench.editor.notebook' || activeEditorPane?.getId() === 'workbench.editor.interactive') {
			const notebookDocument = getNotebookEditorFromEditorPane(activeEditorPane)?.getViewModel()?.notebookDocument;
			this.activeNotebook = notebookDocument;
		}

		return current !== this.activeNotebook;
	}

	private handleActiveEditorChange() {
		if (this.setActiveNotebook() && this.activeNotebook) {
			this.tree?.setInput({ kind: 'root', notebook: this.activeNotebook });
			this.updateScheduler.schedule();
		}
	}

	private handleExecutionStateChange(event: ICellExecutionStateChangedEvent | IExecutionStateChangedEvent) {
		if (this.activeNotebook) {
			if (event.affectsNotebook(this.activeNotebook.uri)) {
				// new execution state means either new variables or the kernel is busy so we shouldn't ask
				this.dataSource.cancel();

				// changed === undefined -> excecution ended
				if (event.changed === undefined) {
					this.updateScheduler.schedule();
				}
				else {
					this.updateScheduler.cancel();
				}
			}
		}
	}

	private handleVariablesChanged(notebookUri: URI) {
		if (this.activeNotebook && notebookUri.toString() === this.activeNotebook.uri.toString()) {
			this.tree?.setInput({ kind: 'root', notebook: this.activeNotebook });
			this.updateScheduler.schedule();
		}
	}
}
