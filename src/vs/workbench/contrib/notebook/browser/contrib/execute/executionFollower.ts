/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { NotebookCellExecutionState, NotebookSetting } from '../../../common/notebookCommon.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService.js';
import { INotebookEditorContribution, INotebookEditor } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CodeCellViewModel } from '../../viewModel/codeCellViewModel.js';
import { INotebookActionContext, NotebookAction } from '../../controller/coreActions.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../../../base/common/codicons.js';

const ENABLE_EXECUTION_FOLLOWER_COMMAND_ID = 'notebook.enableExecutionFollower';
const DISABLE_EXECUTION_FOLLOWER_COMMAND_ID = 'notebook.disableExecutionFollower';

// Padding in pixels to reveal cell/output in viewport
const VIEWPORT_REVEAL_PADDING = 20;

export class ExecutionFollowerController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.executionFollowerController';

	private _followEnabled: boolean;
	private _followTarget: 'container' | 'output';

	private _revealedCells: Set<number>;

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		const configValue = this._configurationService.getValue<'off' | 'cell' | 'output'>(NotebookSetting.followRunningCell);
		this._followEnabled = configValue !== 'off';
		this._followTarget = configValue === 'output' ? 'output' : 'container';

		this._revealedCells = new Set<number>();

		this._init();
	}

	private _updateFollowConfig(): void {
		const configValue = this._configurationService.getValue<'off' | 'cell' | 'output'>(NotebookSetting.followRunningCell);
		this._followEnabled = configValue !== 'off';
		this._followTarget = configValue === 'output' ? 'output' : 'container';
	}

	private _init(): void {
		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(NotebookSetting.followRunningCell)) {
				this._updateFollowConfig();
			}
		}));

		this._register(this._notebookExecutionStateService.onDidChangeExecution(e => {
			if (!this._followEnabled) {
				return;
			}

			if (e.type !== NotebookExecutionType.cell) {
				return;
			}

			const cell = this._notebookEditor.cellAt(e.cellHandle);
			if (!cell || !(cell instanceof CodeCellViewModel)) {
				return;
			}

			if (e.changed?.state === NotebookCellExecutionState.Executing) {
				if (this._revealedCells.has(e.cellHandle)) {
					return; // streaming outputs get multiple execution events, don't want to do a bunch of scrollTop changes
				}
				this._revealedCells.add(e.cellHandle);

				// focus element
				this._notebookEditor.focusNotebookCell(cell, this._followTarget);

				// scroll to either reveal cell or output
				let elementScrollTop: number;
				if (this._followTarget === 'container') {
					elementScrollTop = this._notebookEditor.getAbsoluteTopOfElement(cell);
				} else {
					elementScrollTop = this._notebookEditor.getAbsoluteTopOfElement(cell) + cell.layoutInfo.editorHeight;
				}

				this._notebookEditor.setScrollTop(elementScrollTop - VIEWPORT_REVEAL_PADDING); // subtract since smaller scrolltop is higher up
			} else {
				// Remove from revealed set if execution state changes away from Executing
				this._revealedCells.delete(e.cellHandle);
			}
		}));
	}

	setFollowerConfig(value: 'off' | 'cell' | 'output'): void {
		this._followEnabled = value !== 'off';
		this._followTarget = value === 'output' ? 'output' : 'container';
		this._configurationService.updateValue('notebook.scrolling.followRunningCell', value);
	}
}

registerAction2(class EnableExecutionFollowerAction extends NotebookAction {
	constructor() {
		super({
			id: ENABLE_EXECUTION_FOLLOWER_COMMAND_ID,
			title: 'Enable Follower',
			tooltip: 'Enable Cell Execution Follower',
			icon: Codicon.pinned,
			menu: [{
				id: MenuId.NotebookToolbar,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.equals('config.notebook.scrolling.followRunningCell', 'off')
			}]
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const controller = editor.getContribution<ExecutionFollowerController>(ExecutionFollowerController.id);
		controller.setFollowerConfig('cell');
	}
});

registerAction2(class DisableExecutionFollowerAction extends NotebookAction {
	constructor() {
		super({
			id: DISABLE_EXECUTION_FOLLOWER_COMMAND_ID,
			title: 'Disable Follower',
			tooltip: 'Disable Cell Execution Follower',
			icon: Codicon.pinnedDirty,
			menu: [{
				id: MenuId.NotebookToolbar,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.notEquals('config.notebook.scrolling.followRunningCell', 'off')
			}]
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const controller = editor.getContribution<ExecutionFollowerController>(ExecutionFollowerController.id);
		controller.setFollowerConfig('off');
	}
});

registerNotebookContribution(ExecutionFollowerController.id, ExecutionFollowerController);
