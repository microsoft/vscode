/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/emptyFileEditor.css';
import { $, append, Dimension } from '../../../../base/browser/dom.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { NEW_UNTITLED_FILE_COMMAND_ID } from '../../../../workbench/contrib/files/browser/fileConstants.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { renderSessionsEmptyState } from '../../../browser/parts/sessionsEmptyState.js';
import { CompactButtonActionViewItem } from '../../sessions/browser/sessionsActions.js';
import { EmptyFileEditorSearch } from './emptyFileEditorSearch.js';
import { EmptyFileEditorInput } from './emptyFileEditorInput.js';

class EmptyFileEditorActionViewItem extends CompactButtonActionViewItem {

	constructor(
		action: IAction,
		private readonly actionCommandId: string,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(action, keybindingService, hoverService, contextKeyService);
	}

	protected override get commandId(): string {
		return this.actionCommandId;
	}

	protected override get label(): string {
		return this.action.label;
	}

	protected override get icon() {
		return Codicon.newFile;
	}

	protected override getHoverContent(keybindingLabel: string | undefined): string {
		return keybindingLabel
			? localize('emptyFileEditor.actionTooltip', "{0} ({1})", this.action.label, keybindingLabel)
			: this.action.label;
	}

	protected override getAriaLabel(keybindingAriaLabel: string | undefined): string {
		return keybindingAriaLabel
			? localize('emptyFileEditor.actionAria', "{0} ({1})", this.action.label, keybindingAriaLabel)
			: this.action.label;
	}

}

export class EmptyFileEditor extends EditorPane {

	static readonly ID = EmptyFileEditorInput.EDITOR_ID;
	private readonly inputDisposables = this._register(new MutableDisposable<DisposableStore>());
	private search: EmptyFileEditorSearch | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(EmptyFileEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		const container = append(parent, $('.empty-file-editor'));
		const content = append(container, $('.empty-file-editor-content'));

		renderSessionsEmptyState(
			content,
			localize('emptyFileEditor.title', "Files"),
			localize('emptyFileEditor.description', "Select a file from the Files view"),
		);

		const searchContainer = append(content, $('.empty-file-editor-search'));
		this.search = this._register(this.instantiationService.createInstance(EmptyFileEditorSearch, searchContainer, 200));

		const actions = append(content, $('.empty-file-editor-actions'));
		this.renderAction(actions, this.createNewFileAction(), NEW_UNTITLED_FILE_COMMAND_ID);
	}

	private renderAction(container: HTMLElement, action: Action, commandId: string): void {
		this._register(action);
		const actionViewItem = this._register(this.instantiationService.createInstance(EmptyFileEditorActionViewItem, action, commandId));
		actionViewItem.render(container);
	}

	private createNewFileAction(): Action {
		return new Action(NEW_UNTITLED_FILE_COMMAND_ID, localize('emptyFileEditor.newFile', "New File"), undefined, true, () => this.commandService.executeCommand(NEW_UNTITLED_FILE_COMMAND_ID));
	}

	override async setInput(input: EmptyFileEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		const store = new DisposableStore();
		this.inputDisposables.value = store;
		const updateWorkspace = () => this.search?.setWorkspace(input.workspace);
		store.add(input.onDidChangeLabel(updateWorkspace));
		updateWorkspace();
	}

	override focus(): void {
		// Do not steal focus to the search button when the editor opens.
	}

	override layout(dimension: Dimension): void {
	}
}
