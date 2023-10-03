/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { EmptyTextEditorHintContribution } from 'vs/workbench/contrib/codeEditor/browser/emptyTextEditorHint/emptyTextEditorHint';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class EmptyCellEditorHintContribution extends EmptyTextEditorHintContribution {
	public static readonly CONTRIB_ID = 'notebook.editor.contrib.emptyCellEditorHint';
	constructor(
		editor: ICodeEditor,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@ICommandService commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInlineChatSessionService inlineChatSessionService: IInlineChatSessionService,
		@IInlineChatService inlineChatService: IInlineChatService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProductService productService: IProductService
	) {
		super(
			editor,
			editorGroupsService,
			commandService,
			configurationService,
			keybindingService,
			inlineChatSessionService,
			inlineChatService,
			telemetryService,
			productService
		);

		const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);

		if (!activeEditor) {
			return;
		}

		this.toDispose.push(activeEditor.onDidChangeActiveCell(() => this.update()));
	}

	protected override _shouldRenderHint(): boolean {
		// TODO@rebornix, remove this when we have a better way to present the editor hints in empty cells
		if (this.productService.quality === 'stable') {
			return false;
		}

		const shouldRenderHint = super._shouldRenderHint();
		if (!shouldRenderHint) {
			return false;
		}

		const model = this.editor.getModel();
		if (!model) {
			return false;
		}

		const isNotebookCell = model?.uri.scheme === Schemas.vscodeNotebookCell;
		if (!isNotebookCell) {
			return false;
		}

		const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		if (!activeEditor) {
			return false;
		}

		const activeCell = activeEditor.getActiveCell();

		if (activeCell?.uri.fragment !== model.uri.fragment) {
			return false;
		}

		return true;
	}
}

registerEditorContribution(EmptyCellEditorHintContribution.CONTRIB_ID, EmptyCellEditorHintContribution, EditorContributionInstantiation.Eager); // eager because it needs to render a help message
