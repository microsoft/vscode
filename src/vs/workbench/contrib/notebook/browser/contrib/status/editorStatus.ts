/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INotebookEditor, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_HAS_MULTIPLE_KERNELS } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickInputService, QuickPickInput, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import * as nls from 'vs/nls';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { NOTEBOOK_ACTIONS_CATEGORY, INotebookCellActionContext } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.selectKernel',
			category: NOTEBOOK_ACTIONS_CATEGORY,
			title: nls.localize('notebookActions.selectKernel', "Select Notebook Kernel"),
			precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_FOCUSED),
			icon: { id: 'codicon/server-environment' },
			menu: {
				id: MenuId.EditorTitle,
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_HAS_MULTIPLE_KERNELS),
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

		const provider = notebookService.getContributedNotebookProviders(editor.viewModel!.uri)[0];

		if (provider.hasKernelSupport) {
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
