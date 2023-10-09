/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import 'vs/editor/contrib/symbolIcons/browser/symbolIcons'; // The codicon symbol colors are defined here and must be loaded to get colors
import { AbstractGotoSymbolQuickAccessProvider } from 'vs/editor/contrib/quickAccess/browser/gotoSymbolQuickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { QuickOutlineNLS } from 'vs/editor/common/standaloneStrings';
import { Event } from 'vs/base/common/event';
import { EditorAction, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, ItemActivation } from 'vs/platform/quickinput/common/quickInput';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

export class StandaloneGotoSymbolQuickAccessProvider extends AbstractGotoSymbolQuickAccessProvider {

	protected readonly onDidActiveTextEditorControlChange = Event.None;

	constructor(
		@ICodeEditorService private readonly editorService: ICodeEditorService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IOutlineModelService outlineModelService: IOutlineModelService,
	) {
		super(languageFeaturesService, outlineModelService);
	}

	protected get activeTextEditorControl() {
		return this.editorService.getFocusedCodeEditor() ?? undefined;
	}
}

export class GotoSymbolAction extends EditorAction {

	static readonly ID = 'editor.action.quickOutline';

	constructor() {
		super({
			id: GotoSymbolAction.ID,
			label: QuickOutlineNLS.quickOutlineActionLabel,
			alias: 'Go to Symbol...',
			precondition: EditorContextKeys.hasDocumentSymbolProvider,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO,
				weight: KeybindingWeight.EditorContrib
			},
			contextMenuOpts: {
				group: 'navigation',
				order: 3
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IQuickInputService).quickAccess.show(AbstractGotoSymbolQuickAccessProvider.PREFIX, { itemActivation: ItemActivation.NONE });
	}
}

registerEditorAction(GotoSymbolAction);

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: StandaloneGotoSymbolQuickAccessProvider,
	prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX,
	helpEntries: [
		{ description: QuickOutlineNLS.quickOutlineActionLabel, prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX, commandId: GotoSymbolAction.ID },
		{ description: QuickOutlineNLS.quickOutlineByCategoryActionLabel, prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX_BY_CATEGORY }
	]
});
