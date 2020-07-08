/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { INotebookCellActionContext, NOTEBOOK_ACTIONS_CATEGORY } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { INotebookEditor, NOTEBOOK_HAS_MULTIPLE_KERNELS, NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.selectKernel',
			category: NOTEBOOK_ACTIONS_CATEGORY,
			title: nls.localize('notebookActions.selectKernel', "Select Notebook Kernel"),
			precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
			icon: { id: 'codicon/server-environment' },
			menu: {
				id: MenuId.EditorTitle,
				when: NOTEBOOK_HAS_MULTIPLE_KERNELS,
				group: 'navigation',
				order: -2,
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext): Promise<void> {
		const editorService = accessor.get<IEditorService>(IEditorService);
		const notebookService = accessor.get<INotebookService>(INotebookService);
		const quickInputService = accessor.get<IQuickInputService>(IQuickInputService);

		const activeEditorPane = editorService.activeEditorPane as unknown as { isNotebookEditor?: boolean } | undefined;
		if (!activeEditorPane?.isNotebookEditor) {
			return;
		}
		const editor = editorService.activeEditorPane?.getControl() as INotebookEditor;
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

		const provider = notebookService.getContributedNotebookProviders(editor.viewModel!.uri)[0];

		if (provider.kernel) {
			picks.unshift({
				id: provider.id,
				label: provider.displayName,
				picked: !activeKernel, // no active kernel, the builtin kernel of the provider is used
				description: activeKernel === undefined
					? nls.localize('currentActiveBuiltinKernel', " (Currently Active)")
					: '',
				run: () => {
					editor.activeKernel = undefined;
				}
			});
		}

		const action = await quickInputService.pick(picks, { placeHolder: nls.localize('pickAction', "Select Action"), matchOnDetail: true });
		return action?.run();

	}
});
