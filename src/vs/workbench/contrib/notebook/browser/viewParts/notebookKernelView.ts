/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./notebookKernelActionViewItem';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { Action, IAction } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { NOTEBOOK_ACTIONS_CATEGORY, SELECT_KERNEL_ID } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { selectKernelIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { KernelPickerFlatStrategy, KernelPickerMRUStrategy, KernelQuickPickContext } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookKernelQuickPickStrategy';


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SELECT_KERNEL_ID,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			title: { value: localize('notebookActions.selectKernel', "Select Notebook Kernel"), original: 'Select Notebook Kernel' },
			icon: selectKernelIcon,
			f1: true,
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
			description: {
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
		const configurationService = accessor.get(IConfigurationService);

		const kernelPickerType = configurationService.getValue<'all' | 'mru'>('notebook.kernelPicker.type');

		if (kernelPickerType === 'mru') {
			const strategy = instantiationService.createInstance(KernelPickerMRUStrategy);
			return await strategy.showQuickPick(context);
		} else {
			const strategy = instantiationService.createInstance(KernelPickerFlatStrategy);
			return await strategy.showQuickPick(context);
		}
	}
});

export class NotebooKernelActionViewItem extends ActionViewItem {

	private _kernelLabel?: HTMLAnchorElement;

	constructor(
		actualAction: IAction,
		private readonly _editor: { onDidChangeModel: Event<void>; textModel: NotebookTextModel | undefined; scopedContextKeyService?: IContextKeyService } | INotebookEditor,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super(
			undefined,
			new Action('fakeAction', undefined, ThemeIcon.asClassName(selectKernelIcon), true, (event) => actualAction.run(event)),
			{ label: false, icon: true }
		);
		this._register(_editor.onDidChangeModel(this._update, this));
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

	override updateLabel() {
		if (this._kernelLabel) {
			this._kernelLabel.classList.add('kernel-label');
			this._kernelLabel.innerText = this._action.label;
			this._kernelLabel.title = this._action.tooltip;
		}
	}

	protected _update(): void {
		const notebook = this._editor.textModel;

		if (!notebook) {
			this._resetAction();
			return;
		}

		const kernelPickerType = this._configurationService.getValue<'all' | 'mru'>('notebook.kernelPicker.type');
		if (kernelPickerType === 'mru') {
			KernelPickerMRUStrategy.updateKernelStatusAction(notebook, this._action, this._notebookKernelService);
		} else {
			KernelPickerFlatStrategy.updateKernelStatusAction(notebook, this._action, this._notebookKernelService, this._editor.scopedContextKeyService);
		}

		this.updateClass();
	}

	private _resetAction(): void {
		this._action.enabled = false;
		this._action.label = '';
		this._action.class = '';
	}
}
