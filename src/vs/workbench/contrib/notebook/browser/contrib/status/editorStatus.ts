/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INotebookEditor, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickInputService, QuickPickInput, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import * as nls from 'vs/nls';
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { NOTEBOOK_ACTIONS_CATEGORY, INotebookCellActionContext } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

// export class NotebookEditorStatus extends Disposable implements IWorkbenchContribution {
// 	private _localStore: DisposableStore = new DisposableStore();
// 	private kernelInfoElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

// 	constructor(
// 		@IEditorService private readonly editorService: IEditorService,
// 		@IStatusbarService private readonly statusbarService: IStatusbarService,
// 	) {
// 		super();
// 		this.registerListeners();
// 	}

// 	private registerListeners(): void {
// 		this._register(this.editorService.onDidActiveEditorChange(() => this.updateStatusBar()));
// 		this.updateStatusBar();
// 	}

// 	private async updateStatusBar(): Promise<void> {
// 		this._localStore.clear();

// 		const activeEditorPane = this.editorService.activeEditorPane as any | undefined;
// 		if (!activeEditorPane?.isNotebookEditor) {
// 			this.kernelInfoElement.clear();
// 			return;
// 		}
// 		const editor = activeEditorPane.getControl() as INotebookEditor;
// 		this._localStore.add(editor.onDidChangeKernel(() => {
// 			this.updateKernelInfo(editor.activeKernel);
// 		}));

// 		this.updateKernelInfo(editor.activeKernel);
// 	}

// 	private updateKernelInfo(kernelInfo: INotebookKernelInfo | undefined) {
// 		if (!kernelInfo) {
// 			this.kernelInfoElement.clear();
// 			return;
// 		}

// 		const props: IStatusbarEntry = {
// 			text: kernelInfo.label,
// 			ariaLabel: kernelInfo.label,
// 			tooltip: nls.localize('selectKernel', "Select Notebook Kernel"),
// 			command: 'notebook.selectKernel'
// 		};

// 		this.updateElement(this.kernelInfoElement, props, 'status.notebook.kernel', nls.localize('selectKernel', "Select Notebook Kernel"), StatusbarAlignment.RIGHT, 50);
// 	}

// 	private updateElement(element: MutableDisposable<IStatusbarEntryAccessor>, props: IStatusbarEntry, id: string, name: string, alignment: StatusbarAlignment, priority: number) {
// 		if (!element.value) {
// 			element.value = this.statusbarService.addEntry(props, id, name, alignment, priority);
// 		} else {
// 			element.value.update(props);
// 		}
// 	}
// }

// Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookEditorStatus, LifecyclePhase.Eventually);


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.selectKernel',
			category: NOTEBOOK_ACTIONS_CATEGORY,
			title: nls.localize('notebookActions.selectKernel', "Select Notebook Kernel"),
			precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_FOCUSED),
			icon: { id: 'codicon/server-environment' },
			// menu: {
			// 	id: MenuId.EditorTitle,
			// 	// when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', that.id), that.refreshContextKey),
			// 	group: 'navigation',
			// 	order: -2,
			// },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext): Promise<void> {
		const editorService = accessor.get<IEditorService>(IEditorService);
		const notebookService = accessor.get<INotebookService>(INotebookService);
		const quickInputService = accessor.get<IQuickInputService>(IQuickInputService);

		const activeEditorPane = editorService.activeEditorPane as any | undefined;
		if (!activeEditorPane?.isNotebookEditor) {
			return;
		}
		const editor = activeEditorPane.getControl() as INotebookEditor;
		const activeKernel = editor.activeKernel;

		const availableKernels = notebookService.getContributedNotebookKernels(editor.viewModel!.viewType, editor.viewModel!.uri);
		const picks: QuickPickInput<IQuickPickItem & { run(): void; }>[] = availableKernels.map((a) => {
			return {
				id: a.id,
				label: a.label,
				picked: a.id === activeKernel?.id,
				description: a.extension.value + (a.id === activeKernel?.id
					? nls.localize('currentActiveKernel', " (Currently Active)")
					: ''),
				run: () => {
					editor.activeKernel = a;
				}
			};
		});

		const action = await quickInputService.pick(picks, { placeHolder: nls.localize('pickAction', "Select Action"), matchOnDetail: true });
		return action?.run();

	}
});
