/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractGotoLineQuickAccessProvider } from '../../../contrib/quickAccess/browser/gotoLineQuickAccess.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IQuickAccessRegistry, Extensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { GoToLineNLS } from '../../../common/standaloneStrings.js';
import { Event } from '../../../../base/common/event.js';
import { EditorAction, registerEditorAction, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';

export class StandaloneGotoLineQuickAccessProvider extends AbstractGotoLineQuickAccessProvider {

	protected readonly onDidActiveTextEditorControlChange = Event.None;

	constructor(
		@ICodeEditorService private readonly editorService: ICodeEditorService,
		@IStorageService protected override readonly storageService: IStorageService
	) {
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
		accessor.get(IQuickInputService).quickAccess.show(StandaloneGotoLineQuickAccessProvider.GO_TO_LINE_PREFIX);
	}
}

registerEditorAction(GotoLineAction);

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: StandaloneGotoLineQuickAccessProvider,
	prefix: StandaloneGotoLineQuickAccessProvider.GO_TO_LINE_PREFIX,
	helpEntries: [{ description: GoToLineNLS.gotoLineActionLabel, commandId: GotoLineAction.ID }]
});

class GotoOffsetAction extends EditorAction {

	static readonly ID = 'editor.action.gotoOffset';

	constructor() {
		super({
			id: GotoOffsetAction.ID,
			label: GoToLineNLS.gotoOffsetActionLabel,
			alias: 'Go to Offset...',
			precondition: undefined,
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IQuickInputService).quickAccess.show(StandaloneGotoLineQuickAccessProvider.GO_TO_OFFSET_PREFIX);
	}
}

registerEditorAction(GotoOffsetAction);

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: StandaloneGotoLineQuickAccessProvider,
	prefix: StandaloneGotoLineQuickAccessProvider.GO_TO_OFFSET_PREFIX,
	helpEntries: [{ description: GoToLineNLS.gotoOffsetActionLabel, commandId: GotoOffsetAction.ID }]
});

