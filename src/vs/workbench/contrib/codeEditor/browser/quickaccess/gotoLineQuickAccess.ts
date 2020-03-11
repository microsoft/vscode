/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IKeyMods } from 'vs/platform/quickinput/common/quickInput';
import { IEditor } from 'vs/editor/common/editorCommon';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IRange } from 'vs/editor/common/core/range';
import { AbstractGotoLineQuickAccessProvider } from 'vs/editor/contrib/quickAccess/gotoLine';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';

export class GotoLineQuickAccessProvider extends AbstractGotoLineQuickAccessProvider {

	readonly onDidActiveTextEditorControlChange = this.editorService.onDidActiveEditorChange;

	constructor(@IEditorService private readonly editorService: IEditorService) {
		super();
	}

	get activeTextEditorControl() {
		return this.editorService.activeTextEditorControl;
	}

	protected gotoLine(editor: IEditor, range: IRange, keyMods: IKeyMods): void {

		// Check for sideBySide use
		if (keyMods.ctrlCmd && this.editorService.activeEditor) {
			this.editorService.openEditor(this.editorService.activeEditor, { selection: range, pinned: keyMods.alt }, SIDE_GROUP);
		}

		// Otherwise let parent handle it
		else {
			super.gotoLine(editor, range, keyMods);
		}
	}
}

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: GotoLineQuickAccessProvider,
	prefix: AbstractGotoLineQuickAccessProvider.PREFIX,
	placeholder: localize('gotoLineQuickAccessPlaceholder', "Type the line number and optional column to go to (e.g. 42:5 for line 42 and column 5)."),
	helpEntries: [{ description: localize('gotoLineQuickAccess', "Go to Line"), needsEditor: true }]
});
