/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { INotebookLoggingService } from '../../../common/notebookLoggingService.js';
import { InlineChatConfigKeys } from '../../../../inlineChat/common/inlineChat.js';
import { InlineChatController2 } from '../../../../inlineChat/browser/inlineChatController.js';
import { IInlineChatSessionService } from '../../../../inlineChat/browser/inlineChatSessionService.js';
import { CTX_NOTEBOOK_CELL_CHAT_FOCUSED, CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST, CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION, CTX_NOTEBOOK_CHAT_USER_DID_EDIT } from './notebookChatContext.js';
import { ICellViewModel, INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { insertCell, runDeleteAction } from '../cellOperations.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';

/**
 * Notebook Inline Chat Controller using v2 infrastructure
 *
 * This controller provides notebook-specific inline chat functionality
 * while leveraging the improved inline chat v2 system for session management
 * and UI consistency.
 */
export class NotebookInlineChatV2Controller extends Disposable implements INotebookEditorContribution {

	static readonly ID = 'workbench.notebook.chatController.v2';

	protected override readonly _store = new DisposableStore();
	private readonly _notebookV2Enabled: ReturnType<typeof observableConfigValue>;

	// Context keys for notebook-specific chat state
	private readonly _ctxCellWidgetFocused: ReturnType<IContextKeyService['createKey']>;
	private readonly _ctxHasActiveRequest: ReturnType<IContextKeyService['createKey']>;
	private readonly _ctxOuterFocusPosition: ReturnType<IContextKeyService['createKey']>;
	private readonly _ctxUserDidEdit: ReturnType<IContextKeyService['createKey']>;

	// Current editing state
	private _currentEditingCell: ICellViewModel | undefined;

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@INotebookLoggingService private readonly _notebookLoggingService: INotebookLoggingService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._notebookV2Enabled = observableConfigValue(InlineChatConfigKeys.NotebookEnableV2, false, this._configurationService);

		// Setup context keys
		this._ctxCellWidgetFocused = CTX_NOTEBOOK_CELL_CHAT_FOCUSED.bindTo(this._contextKeyService);
		this._ctxHasActiveRequest = CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST.bindTo(this._contextKeyService);
		this._ctxOuterFocusPosition = CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION.bindTo(this._contextKeyService);
		this._ctxUserDidEdit = CTX_NOTEBOOK_CHAT_USER_DID_EDIT.bindTo(this._contextKeyService);

		this._store.add(toDisposable(() => {
			this._ctxCellWidgetFocused.reset();
			this._ctxHasActiveRequest.reset();
			this._ctxOuterFocusPosition.reset();
			this._ctxUserDidEdit.reset();
		}));

		this._notebookLoggingService.debug('NotebookInlineChatV2Controller', 'initialized');
	}

	override dispose(): void {
		this._store.dispose();
		super.dispose();
	}

	/**
	 * Check if v2 is enabled for notebook inline chat
	 */
	get isV2Enabled(): boolean {
		return this._notebookV2Enabled.get() as boolean;
	}

	/**
	 * Start inline chat at the specified cell index
	 */
	async run(cellIndex: number, input?: string, autoSend?: boolean): Promise<void> {
		if (!this.isV2Enabled) {
			this._notebookLoggingService.debug('NotebookInlineChatV2Controller', 'v2 not enabled, skipping');
			return;
		}

		if (!this._notebookEditor.hasModel()) {
			return;
		}

		// Get or create a cell editor at the specified position
		const codeEditor = await this._getOrCreateCellEditor(cellIndex);
		if (!codeEditor) {
			this._notebookLoggingService.warn('NotebookInlineChatV2Controller', 'failed to get cell editor');
			return;
		}

		// Get the inline chat controller for this editor
		const inlineChatController = InlineChatController2.get(codeEditor);
		if (!inlineChatController) {
			this._notebookLoggingService.warn('NotebookInlineChatV2Controller', 'no inline chat controller found');
			return;
		}

		// Update notebook-specific context
		this._ctxCellWidgetFocused.set(true);

		// Start the inline chat session
		try {
			await inlineChatController.run({
				message: input,
				autoSend: autoSend
			});
		} catch (error) {
			this._notebookLoggingService.error('NotebookInlineChatV2Controller', `failed to start session: ${error}`);
			this._ctxCellWidgetFocused.set(false);
		}
	}

	/**
	 * Get or create a code editor for the specified cell index
	 */
	private async _getOrCreateCellEditor(cellIndex: number): Promise<ICodeEditor | undefined> {
		if (!this._notebookEditor.hasModel()) {
			return undefined;
		}

		const notebookViewModel = this._notebookEditor.getViewModel();
		if (!notebookViewModel) {
			return undefined;
		}

		// Check if there's already a cell at this position
		const existingCell = notebookViewModel.viewCells[cellIndex];
		if (existingCell && existingCell.cellKind === CellKind.Code) {
			// Find the corresponding code editor
			const codeEditorPair = this._notebookEditor.codeEditors.find(([cell]) => cell.handle === existingCell.handle);
			if (codeEditorPair) {
				this._currentEditingCell = existingCell;
				return codeEditorPair[1];
			}
		}

		// Create a new code cell
		const newCell = await this._createNewCodeCell(cellIndex);
		if (!newCell) {
			return undefined;
		}

		// Wait for the editor to be created
		await this._notebookEditor.revealFirstLineIfOutsideViewport(newCell);

		// Find the code editor for the new cell
		const codeEditorPair = this._notebookEditor.codeEditors.find(([cell]) => cell.handle === newCell.handle);
		if (codeEditorPair) {
			this._currentEditingCell = newCell;
			return codeEditorPair[1];
		}

		return undefined;
	}

	/**
	 * Create a new code cell at the specified index
	 */
	private async _createNewCodeCell(cellIndex: number): Promise<ICellViewModel | undefined> {
		if (!this._notebookEditor.hasModel()) {
			return undefined;
		}

		try {
			// Use the existing cell insertion utility
			const newCell = await insertCell(
				this._languageService,
				this._notebookEditor,
				cellIndex,
				CellKind.Code,
				'above',
				'', // empty content initially
				true // select the new cell
			);

			if (newCell) {
				this._notebookLoggingService.debug('NotebookInlineChatV2Controller', `created new cell: ${newCell.uri.toString()}`);
				return newCell;
			}
		} catch (error) {
			this._notebookLoggingService.error('NotebookInlineChatV2Controller', `failed to create cell: ${error}`);
		}

		return undefined;
	}

	/**
	 * Accept the current session and finalize any cell changes
	 */
	async acceptSession(): Promise<void> {
		if (!this._currentEditingCell) {
			return;
		}

		const codeEditorPair = this._notebookEditor.codeEditors.find(([cell]) => cell.handle === this._currentEditingCell!.handle);
		if (codeEditorPair) {
			const inlineChatController = InlineChatController2.get(codeEditorPair[1]);
			if (inlineChatController) {
				await inlineChatController.acceptSession();
			}
		}

		this._ctxCellWidgetFocused.set(false);
		this._currentEditingCell = undefined;
	}

	/**
	 * Discard the current session and clean up any temporary cells
	 */
	async discardSession(): Promise<void> {
		if (!this._currentEditingCell) {
			return;
		}

		// If the cell is empty, remove it entirely
		if (this._currentEditingCell.textBuffer.getLength() === 0) {
			const viewModel = this._notebookEditor.getViewModel();
			if (viewModel) {
				await runDeleteAction(this._notebookEditor as any, this._currentEditingCell);
			}
		}

		const codeEditorPair = this._notebookEditor.codeEditors.find(([cell]) => cell.handle === this._currentEditingCell!.handle);
		if (codeEditorPair) {
			const inlineChatController = InlineChatController2.get(codeEditorPair[1]);
			if (inlineChatController) {
				const session = this._inlineChatSessionService.getSession2(this._currentEditingCell.uri);
				session?.dispose();
			}
		}

		this._ctxCellWidgetFocused.set(false);
		this._currentEditingCell = undefined;
	}

	/**
	 * Check if there's an active session
	 */
	get hasActiveSession(): boolean {
		return this._currentEditingCell !== undefined;
	}

	/**
	 * Get the current editing cell
	 */
	get currentEditingCell(): ICellViewModel | undefined {
		return this._currentEditingCell;
	}
}

// Register the v2 controller
registerNotebookContribution(NotebookInlineChatV2Controller.ID, NotebookInlineChatV2Controller);
