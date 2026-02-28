/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { NOTEBOOK_ACTIONS_CATEGORY, SELECT_KERNEL_ID } from '../controller/coreActions.js';
import { getNotebookEditorFromEditorPane, INotebookEditor } from '../notebookBrowser.js';
import { selectKernelIcon } from '../notebookIcons.js';
import { KernelPickerMRUStrategy, KernelQuickPickContext } from './notebookKernelQuickPickStrategy.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT } from '../../common/notebookContextKeys.js';
import { INotebookKernel, INotebookKernelHistoryService, INotebookKernelService } from '../../common/notebookKernelService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

function getEditorFromContext(editorService: IEditorService, context?: KernelQuickPickContext): INotebookEditor | undefined {
	let editor: INotebookEditor | undefined;
	if (context !== undefined && 'notebookEditorId' in context) {
		const editorId = context.notebookEditorId;
		const matchingEditor = editorService.visibleEditorPanes.find((editorPane) => {
			const notebookEditor = getNotebookEditorFromEditorPane(editorPane);
			return notebookEditor?.getId() === editorId;
		});
		editor = getNotebookEditorFromEditorPane(matchingEditor);
	} else if (context !== undefined && 'notebookEditor' in context) {
		editor = context?.notebookEditor;
	} else {
		editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
	}

	return editor;
}

function shouldSkip(
	selected: INotebookKernel | undefined,
	controllerId: string | undefined,
	extensionId: string | undefined,
	context: KernelQuickPickContext | undefined): boolean {

	return !!(selected && (
		(context && 'skipIfAlreadySelected' in context && context.skipIfAlreadySelected) ||
		// target kernel is already selected
		(controllerId && selected.id === controllerId && ExtensionIdentifier.equals(selected.extension, extensionId))
	));
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SELECT_KERNEL_ID,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			title: localize2('notebookActions.selectKernel', 'Select Notebook Kernel'),
			icon: selectKernelIcon,
			f1: true,
			precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
			menu: [{
				id: MenuId.EditorTitle,
				when: ContextKeyExpr.and(
					NOTEBOOK_IS_ACTIVE_EDITOR,
					ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
				),
				group: 'navigation',
				order: -10
			}, {
				id: MenuId.NotebookToolbar,
				when: ContextKeyExpr.equals('config.notebook.globalToolbar', true),
				group: 'status',
				order: -10
			}, {
				id: MenuId.InteractiveToolbar,
				when: NOTEBOOK_KERNEL_COUNT.notEqualsTo(0),
				group: 'status',
				order: -10
			}],
			metadata: {
				description: localize('notebookActions.selectKernel.args', "Notebook Kernel Args"),
				args: [
					{
						name: 'kernelInfo',
						description: 'The kernel info',
						schema: {
							'type': 'object',
							'required': ['id', 'extension'],
							'properties': {
								'id': {
									'type': 'string'
								},
								'extension': {
									'type': 'string'
								},
								'notebookEditorId': {
									'type': 'string'
								}
							}
						}
					}
				]
			},
		});
	}

	async run(accessor: ServicesAccessor, context?: KernelQuickPickContext): Promise<boolean> {
		const instantiationService = accessor.get(IInstantiationService);
		const editorService = accessor.get(IEditorService);

		const editor = getEditorFromContext(editorService, context);

		if (!editor || !editor.hasModel()) {
			return false;
		}

		let controllerId = context && 'id' in context ? context.id : undefined;
		let extensionId = context && 'extension' in context ? context.extension : undefined;

		if (controllerId && (typeof controllerId !== 'string' || typeof extensionId !== 'string')) {
			// validate context: id & extension MUST be strings
			controllerId = undefined;
			extensionId = undefined;
		}

		const notebook = editor.textModel;
		const notebookKernelService = accessor.get(INotebookKernelService);
		const { selected } = notebookKernelService.getMatchingKernel(notebook);

		if (shouldSkip(selected, controllerId, extensionId, context)) {
			return true;
		}

		const wantedKernelId = controllerId ? `${extensionId}/${controllerId}` : undefined;
		const strategy = instantiationService.createInstance(KernelPickerMRUStrategy);
		return strategy.showQuickPick(editor, wantedKernelId);
	}
});

export class NotebooKernelActionViewItem extends ActionViewItem {

	private _kernelLabel?: HTMLAnchorElement;

	constructor(
		actualAction: IAction,
		private readonly _editor: { onDidChangeModel: Event<void>; textModel: NotebookTextModel | undefined; scopedContextKeyService?: IContextKeyService } | INotebookEditor,
		options: IActionViewItemOptions,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@INotebookKernelHistoryService private readonly _notebookKernelHistoryService: INotebookKernelHistoryService,
	) {
		const action = new Action('fakeAction', undefined, ThemeIcon.asClassName(selectKernelIcon), true, (event) => actualAction.run(event));
		super(
			undefined,
			action,
			{ ...options, label: false, icon: true }
		);
		this._register(action);
		this._register(_editor.onDidChangeModel(this._update, this));
		this._register(_notebookKernelService.onDidAddKernel(this._update, this));
		this._register(_notebookKernelService.onDidRemoveKernel(this._update, this));
		this._register(_notebookKernelService.onDidChangeNotebookAffinity(this._update, this));
		this._register(_notebookKernelService.onDidChangeSelectedNotebooks(this._update, this));
		this._register(_notebookKernelService.onDidChangeSourceActions(this._update, this));
		this._register(_notebookKernelService.onDidChangeKernelDetectionTasks(this._update, this));
	}

	override render(container: HTMLElement): void {
		this._update();
		super.render(container);
		container.classList.add('kernel-action-view-item');
		this._kernelLabel = document.createElement('a');
		container.appendChild(this._kernelLabel);
		this.updateLabel();
	}

	protected override updateLabel() {
		if (this._kernelLabel) {
			this._kernelLabel.classList.add('kernel-label');
			this._kernelLabel.innerText = this._action.label;
		}
	}

	protected _update(): void {
		const notebook = this._editor.textModel;

		if (!notebook) {
			this._resetAction();
			return;
		}

		KernelPickerMRUStrategy.updateKernelStatusAction(notebook, this._action, this._notebookKernelService, this._notebookKernelHistoryService);

		this.updateClass();
	}

	private _resetAction(): void {
		this._action.enabled = false;
		this._action.label = '';
		this._action.class = '';
	}
}
