/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractGotoLineQuickAccessProvider } from 'vs/editor/contrib/quickAccess/browser/gotoLineQuickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { GoToLineNLS } from 'vs/editor/common/standaloneStrings';
import { Event } from 'vs/base/common/event';
import { EditorAction, registerEditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

export class StandaloneGotoLineQuickAccessProvider extends AbstractGotoLineQuickAccessProvider {

	protected readonly onDidActiveTextEditorControlChange = Event.None;

	constructor(@ICodeEditorService private readonly editorService: ICodeEditorService) {
		super();
	}

	protected get activeTextEditorControl() {
		return this.editorService.getFocusedCodeEditor() ?? undefined;
	}
}

export class GotoLineAction extends EditorAction {

	static readonly ID = 'editor.action.gotoLine';

	constructor() {
		super({
			id: GotoLineAction.ID,
			label: GoToLineNLS.gotoLineActionLabel,
			alias: 'Go to Line/Column...',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyCode.KeyG,
				mac: { primary: KeyMod.WinCtrl | KeyCode.KeyG },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IQuickInputService).quickAccess.show(StandaloneGotoLineQuickAccessProvider.PREFIX);
	}
}

registerEditorAction(GotoLineAction);

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: StandaloneGotoLineQuickAccessProvider,
	prefix: StandaloneGotoLineQuickAccessProvider.PREFIX,
	helpEntries: [{ description: GoToLineNLS.gotoLineActionLabel, commandId: GotoLineAction.ID }]
});
