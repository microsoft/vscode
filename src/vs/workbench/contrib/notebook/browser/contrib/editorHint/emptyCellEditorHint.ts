/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../../base/common/network.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../../../editor/browser/editorExtensions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IChatAgentService } from '../../../../chat/common/chatAgents.js';
import { EmptyTextEditorHintContribution, IEmptyTextEditorHintOptions } from '../../../../codeEditor/browser/emptyTextEditorHint/emptyTextEditorHint.js';
import { IInlineChatSessionService } from '../../../../inlineChat/browser/inlineChatSessionService.js';
import { getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';

export class EmptyCellEditorHintContribution extends EmptyTextEditorHintContribution {
	public static readonly CONTRIB_ID = 'notebook.editor.contrib.emptyCellEditorHint';
	constructor(
		editor: ICodeEditor,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@ICommandService commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHoverService hoverService: IHoverService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInlineChatSessionService inlineChatSessionService: IInlineChatSessionService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProductService productService: IProductService,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super(
			editor,
			editorGroupsService,
			commandService,
			configurationService,
			hoverService,
			keybindingService,
			inlineChatSessionService,
			chatAgentService,
			telemetryService,
			productService,
			contextMenuService
		);

		const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);

		if (!activeEditor) {
			return;
		}

		this.toDispose.push(activeEditor.onDidChangeActiveCell(() => this.update()));
	}

	protected override _getOptions(): IEmptyTextEditorHintOptions {
		return { clickable: false };
	}

	protected override _shouldRenderHint(): boolean {
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
