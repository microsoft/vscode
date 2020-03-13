/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IKeyMods } from 'vs/platform/quickinput/common/quickInput';
import { IEditor } from 'vs/editor/common/editorCommon';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IRange } from 'vs/editor/common/core/range';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { AbstractGotoSymbolQuickAccessProvider } from 'vs/editor/contrib/quickAccess/gotoSymbolQuickAccess';

export class GotoSymbolQuickAccessProvider extends AbstractGotoSymbolQuickAccessProvider {

	readonly onDidActiveTextEditorControlChange = this.editorService.onDidActiveEditorChange;

	constructor(@IEditorService private readonly editorService: IEditorService) {
		super();
	}

	get activeTextEditorControl() {
		return this.editorService.activeTextEditorControl;
	}

	protected gotoSymbol(editor: IEditor, range: IRange, keyMods: IKeyMods): void {

		// Check for sideBySide use
		if (keyMods.ctrlCmd && this.editorService.activeEditor) {
			this.editorService.openEditor(this.editorService.activeEditor, { selection: range, pinned: keyMods.alt }, SIDE_GROUP);
		}

		// Otherwise let parent handle it
		else {
			super.gotoSymbol(editor, range, keyMods);
		}
	}
}

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: GotoSymbolQuickAccessProvider,
	prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX,
	placeholder: localize('gotoSymbolQuickAccessPlaceholder', "Type the name of a symbol to go to."),
	helpEntries: [
		{ description: localize('gotoSymbolQuickAccess', "Go to Symol in Editor"), prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX, needsEditor: true },
		{ description: localize('gotoSymbolByCategoryQuickAccess', "Go to Symol in Editor by Category"), prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX_BY_CATEGORY, needsEditor: true }
	]
});
