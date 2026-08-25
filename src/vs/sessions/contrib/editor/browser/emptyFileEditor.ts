/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/emptyFileEditor.css';
import { $, append, Dimension } from '../../../../base/browser/dom.js';
import { Action } from '../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { CompactButtonActionViewItem } from '../../sessions/browser/sessionsActions.js';
import { EmptyFileEditorInput } from './emptyFileEditorInput.js';

const QUICK_OPEN_COMMAND_ID = 'workbench.action.quickOpen';

class SearchFilesActionViewItem extends CompactButtonActionViewItem {

	protected override get commandId(): string {
		return QUICK_OPEN_COMMAND_ID;
	}

	protected override get label(): string {
		return localize('emptyFileEditor.search', "Search Files");
	}

	protected override getHoverContent(keybindingLabel: string | undefined): string {
		return keybindingLabel
			? localize('emptyFileEditor.searchTooltip', "Search Files ({0})", keybindingLabel)
			: localize('emptyFileEditor.searchTooltipNoKeybinding', "Search Files");
	}

	protected override getAriaLabel(keybindingAriaLabel: string | undefined): string {
		return keybindingAriaLabel
			? localize('emptyFileEditor.searchAria', "Search Files ({0})", keybindingAriaLabel)
			: localize('emptyFileEditor.searchAriaNoKeybinding', "Search Files");
	}
}

export class EmptyFileEditor extends EditorPane {

	static readonly ID = EmptyFileEditorInput.EDITOR_ID;

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

		append(content, $(`.empty-file-editor-icon${ThemeIcon.asCSSSelector(EmptyFileEditorInput.ICON)}`));

		const description = append(content, $('.empty-file-editor-description'));
		description.textContent = localize('emptyFileEditor.description', "Select a file from the Files view");

		const actions = append(content, $('.empty-file-editor-actions'));
		const action = this._register(this.createSearchAction());
		const actionViewItem = this._register(this.instantiationService.createInstance(SearchFilesActionViewItem, action));
		actionViewItem.render(actions);
	}

	private createSearchAction(): Action {
		return new Action(QUICK_OPEN_COMMAND_ID, localize('emptyFileEditor.search', "Search Files"), undefined, true, () => this.commandService.executeCommand(QUICK_OPEN_COMMAND_ID, ''));
	}

	override focus(): void {
		// Do not steal focus to the search button when the editor opens.
	}

	override layout(_dimension: Dimension): void { }
}
